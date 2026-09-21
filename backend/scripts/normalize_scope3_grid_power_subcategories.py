"""Normalize Scope 3 EF Grid Power display text to the canonical energy key."""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import os
from pathlib import Path

from bson import json_util
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient


TARGET_DB_NAME = "test_database"
CATEGORY_PATTERN = r"^C(?:8|10|11|13|14)(?:\s|\-|$)"


def normalize(value):
    if isinstance(value, str):
        return "energy" if value.strip().lower() == "grid power" else value
    if isinstance(value, list):
        return ["energy" if isinstance(item, str) and item.strip().lower() == "grid power" else item for item in value]
    return value


async def run(apply: bool) -> None:
    load_dotenv("/app/backend/.env")
    if os.environ.get("DB_NAME") != TARGET_DB_NAME:
        raise RuntimeError("This migration is locked to test_database")
    client = AsyncIOMotorClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=15000)
    db = client[os.environ["DB_NAME"]]
    query = {"category": {"$regex": CATEGORY_PATTERN, "$options": "i"}}
    try:
        factors = await db.scope3_ef.find(query, {"_id": 0}).to_list(None)
        changes = [
            {"id": factor["id"], "category": factor.get("category"), "activity": factor.get("activity"), "from": factor.get("subcategory"), "to": normalize(factor.get("subcategory"))}
            for factor in factors
            if normalize(factor.get("subcategory")) != factor.get("subcategory")
        ]
        print(json_util.dumps({"matched": len(factors), "planned": len(changes)}, indent=2))
        if not apply:
            print("Dry run only. Re-run with --apply to store the canonical energy subcategory value.")
            return
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_dir = Path("/app/.emergent/backups") / f"scope3-grid-power-normalization-{stamp}"
        backup_dir.mkdir(parents=True, exist_ok=False)
        (backup_dir / "before.json").write_text(json_util.dumps({"database": db.name, "changes": changes}, indent=2), encoding="utf-8")
        updated = 0
        timestamp = datetime.now(timezone.utc).isoformat()
        for change in changes:
            result = await db.scope3_ef.update_one({"id": change["id"]}, {"$set": {"subcategory": change["to"], "updated_at": timestamp, "updated_by": "scope3-grid-power-normalization"}})
            updated += result.modified_count
        print(json_util.dumps({"status": "applied", "updated": updated, "backup": str(backup_dir)}, indent=2))
    finally:
        client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    asyncio.run(run(args.apply))