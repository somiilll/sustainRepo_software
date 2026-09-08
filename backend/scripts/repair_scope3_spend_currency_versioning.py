"""Audit or repair immutable Scope 3 C1-C15 spend-currency catalog versions."""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import os
from pathlib import Path
import sys

from bson import json_util
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from calc_engine.catalog_integrity import (
    PPP_FORMULA_ID,
    STANDARD_FORMULA_ID,
    inspect_scope3_spend_currency_catalog,
    repair_scope3_spend_currency_catalog,
)


async def run(*, apply: bool) -> None:
    load_dotenv("/app/backend/.env")
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    try:
        before = await inspect_scope3_spend_currency_catalog(db)
        print(json_util.dumps({"before": before}, indent=2))
        if not apply:
            print("Dry run only. Re-run with --apply to publish repaired versions.")
            return

        tree_ids = [tree["tree_id"] for tree in before["trees"]]
        backup = {
            "database": db.name,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "ce_formulas": await db.ce_formulas.find(
                {"id": {"$in": [PPP_FORMULA_ID, STANDARD_FORMULA_ID]}}
            ).to_list(10),
            "ce_formula_versions": await db.ce_formula_versions.find(
                {"formula_id": {"$in": [PPP_FORMULA_ID, STANDARD_FORMULA_ID]}}
            ).to_list(100),
            "ce_decision_trees": await db.ce_decision_trees.find(
                {"id": {"$in": tree_ids}}
            ).to_list(15),
            "ce_decision_tree_versions": await db.ce_decision_tree_versions.find(
                {"source_tree_id": {"$in": tree_ids}}
            ).to_list(1000),
        }
        backup_dir = Path("/app/.emergent/backups")
        backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_path = backup_dir / f"scope3-spend-currency-versioning-{stamp}.json"
        backup_path.write_text(json_util.dumps(backup, indent=2), encoding="utf-8")

        result = await repair_scope3_spend_currency_catalog(db)
        print(json_util.dumps({"result": result, "backup": str(backup_path)}, indent=2))
    finally:
        client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    asyncio.run(run(apply=args.apply))