"""Split Consumer Complaints trade-practice fields and migrate historical combined values."""
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from shared.database.mongo import db


BACKUP_DIR = Path("/app/backups")
CATEGORY_QUERY = {"category": "Complaints", "subcategory": "Consumer Complaints"}
OLD_RECEIVED = "no_of_complaints_on_restrictive_unfair_trade_practices"
OLD_PENDING = "pending_resolution_restrictive_unfair_trade_practices"
NEW_FIELDS = (
    (OLD_RECEIVED, "no_of_complaints_on_restrictive_trade_practices", "Restrictive Trade Practices"),
    (OLD_RECEIVED, "no_of_complaints_on_unfair_trade_practices", "Unfair Trade Practices"),
    (OLD_PENDING, "pending_resolution_restrictive_trade_practices", "Restrictive Trade Practices"),
    (OLD_PENDING, "pending_resolution_unfair_trade_practices", "Unfair Trade Practices"),
)


def split_fields(fields):
    result = []
    for field in fields:
        if field.get("field_key") not in {OLD_RECEIVED, OLD_PENDING}:
            result.append(field)
            continue
        matching = [item for item in NEW_FIELDS if item[0] == field["field_key"]]
        for _, field_key, label in matching:
            result.append({**field, "field_key": field_key, "label": label})
    return result


async def run():
    category = await db.esg_record_categories.find_one(CATEGORY_QUERY, {"_id": 0})
    records = await db.social_records.find(CATEGORY_QUERY, {"_id": 0}).to_list(100000)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    backup_path = BACKUP_DIR / f"consumer_trade_practice_split_{stamp}.json"
    backup_path.write_text(json.dumps({"category": category, "records": records}, default=str, indent=2), encoding="utf-8")

    now = datetime.now(timezone.utc).isoformat()
    updated_category = False
    if category:
        fields = split_fields(category.get("fields") or [])
        await db.esg_record_categories.update_one(CATEGORY_QUERY, {"$set": {"fields": fields, "updated_at": now}})
        updated_category = True

    updated_records = 0
    for record in records:
        values = record.get("field_values") or {}
        if values.get(OLD_RECEIVED) in (None, "") and values.get(OLD_PENDING) in (None, ""):
            continue
        updates = {
            "field_values.no_of_complaints_on_restrictive_trade_practices": values.get(OLD_RECEIVED) or 0,
            "field_values.no_of_complaints_on_unfair_trade_practices": 0,
            "field_values.pending_resolution_restrictive_trade_practices": values.get(OLD_PENDING) or 0,
            "field_values.pending_resolution_unfair_trade_practices": 0,
            "field_values.no_of_complaints_on_restrictive_trade_practices_unit": "Number",
            "field_values.no_of_complaints_on_unfair_trade_practices_unit": "Number",
            "field_values.pending_resolution_restrictive_trade_practices_unit": "Number",
            "field_values.pending_resolution_unfair_trade_practices_unit": "Number",
            "updated_at": now,
        }
        await db.social_records.update_one({"id": record["id"]}, {"$set": updates})
        updated_records += 1
    return {"backup": str(backup_path), "category_updated": updated_category, "records_updated": updated_records}


if __name__ == "__main__":
    print(json.dumps(asyncio.run(run()), indent=2))