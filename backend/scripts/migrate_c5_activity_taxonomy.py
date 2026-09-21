"""Add non-destructive C5 base-activity and disposal-method taxonomy fields."""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import os
from pathlib import Path
import re

from bson import json_util
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient


TYPES = {
    "landfilled": "Landfilled",
    "recycled": "Recycled",
    "combusted": "Combusted",
    "composted": "Composted",
    "anaerobically digested (wet digestate with curing)": "Anaerobically Digested (Wet Digestate with Curing)",
    "anaerobically digested (dry digestate with curing)": "Anaerobically Digested (Dry Digestate with Curing)",
}


def classify(activity: str) -> tuple[str, str, str]:
    name = str(activity or "").strip()
    base, separator, suffix = name.rpartition(" - ")
    normalized_suffix = re.sub(r"\s+", " ", suffix).strip().lower()
    if separator and normalized_suffix in TYPES:
        key = normalized_suffix.replace(" ", "_").replace("(", "").replace(")", "")
        key = re.sub(r"[^a-z0-9_]+", "_", key).strip("_")
        return base.strip(), key, TYPES[normalized_suffix]
    return name, "other", "Other"


async def run(apply: bool) -> None:
    load_dotenv("/app/backend/.env")
    if os.environ.get("DB_NAME") != "test_database":
        raise RuntimeError("This migration is locked to test_database")
    client = AsyncIOMotorClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=15000)
    db = client[os.environ["DB_NAME"]]
    query = {"category": {"$regex": r"^C5(?:\s|\-|$)", "$options": "i"}}
    try:
        factors = await db.scope3_ef.find(query, {"_id": 0}).to_list(None)
        changes = []
        for factor in factors:
            activity_name, activity_type, activity_type_label = classify(factor.get("activity", ""))
            desired = {"activity_name": activity_name, "activity_type": activity_type, "activity_type_label": activity_type_label}
            if any(factor.get(key) != value for key, value in desired.items()):
                changes.append({"id": factor["id"], "activity": factor.get("activity"), **desired})
        print(json_util.dumps({"matched": len(factors), "planned": len(changes)}, indent=2))
        if not apply:
            print("Dry run only. Re-run with --apply to add C5 taxonomy fields.")
            return
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_dir = Path("/app/.emergent/backups") / f"c5-activity-taxonomy-{stamp}"
        backup_dir.mkdir(parents=True, exist_ok=False)
        (backup_dir / "before.json").write_text(json_util.dumps({"database": db.name, "factors": factors}, indent=2), encoding="utf-8")
        updated = 0
        timestamp = datetime.now(timezone.utc).isoformat()
        for change in changes:
            result = await db.scope3_ef.update_one({"id": change["id"]}, {"$set": {
                "activity_name": change["activity_name"], "activity_type": change["activity_type"],
                "activity_type_label": change["activity_type_label"], "updated_at": timestamp,
                "updated_by": "c5-activity-taxonomy-migration",
            }})
            updated += result.modified_count
        print(json_util.dumps({"status": "applied", "updated": updated, "backup": str(backup_dir)}, indent=2))
    finally:
        client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    asyncio.run(run(args.apply))