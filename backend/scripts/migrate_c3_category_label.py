"""Rename live C3 category labels without altering stored calculation outputs or audit history."""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import os
from pathlib import Path

from bson import json_util
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient


LEGACY_LABELS = (
    "C3 - Fuel and Energy Related Activities Not Included in Scope 1 or Scope 2",
    "C3 Fuel- and energy-related activities",
)
NEW_LABEL = "C3 - Fuel and energy-related activities"
MIGRATIONS = (
    ("emission_records", "category"),
    ("bulk_upload_pending_records", "category"),
    ("scope3_ef", "category"),
    ("emission_categories", "name"),
)


async def migrate(*, apply: bool) -> None:
    load_dotenv("/app/backend/.env")
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    try:
        counts = {
            collection: await db[collection].count_documents({field: {"$in": LEGACY_LABELS}})
            for collection, field in MIGRATIONS
        }
        print(json_util.dumps({"legacy_labels": LEGACY_LABELS, "new_label": NEW_LABEL, "matches": counts}, indent=2))
        if not apply:
            print("Dry run only. Re-run with --apply to persist this label migration.")
            return

        backup = {
            "database": db.name,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "legacy_labels": LEGACY_LABELS,
            "new_label": NEW_LABEL,
            "documents": {
                collection: await db[collection].find({field: {"$in": LEGACY_LABELS}}).to_list(None)
                for collection, field in MIGRATIONS
            },
        }
        backup_dir = Path("/app/.emergent/backups")
        backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_path = backup_dir / f"c3-category-label-{stamp}.json"
        backup_path.write_text(json_util.dumps(backup, indent=2), encoding="utf-8")

        updated = {}
        for collection, field in MIGRATIONS:
            result = await db[collection].update_many({field: {"$in": LEGACY_LABELS}}, {"$set": {field: NEW_LABEL}})
            updated[collection] = result.modified_count

        print(json_util.dumps({"updated": updated, "backup": str(backup_path)}, indent=2))
    finally:
        client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Rename the legacy C3 category label in live category data.")
    parser.add_argument("--apply", action="store_true", help="Persist the migration; default is dry run.")
    args = parser.parse_args()
    asyncio.run(migrate(apply=args.apply))