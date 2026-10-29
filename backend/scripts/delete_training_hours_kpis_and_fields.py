"""General Training: delete all training-hours KPI definitions and entry fields (idempotent, backs up first)."""
import asyncio
import json
import os
from datetime import datetime, timezone

from shared.database.mongo import db

BACKUP_DIR = "/app/backups"


async def main():
    kpis = await db.esg_kpi_definitions.find({"subcategory": "General Training", "metric_name": {"$regex": "hours", "$options": "i"}}, {"_id": 0}).to_list(None)
    ids = [k["id"] for k in kpis]
    cat = await db.esg_record_categories.find_one({"subcategory": "General Training"})
    maps = await db.kpi_framework_mappings.find({"$or": [{"kpi_id": {"$in": ids}}, {"source_kpi_ids": {"$in": ids}}]}, {"_id": 0}).to_list(None)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")
    os.makedirs(BACKUP_DIR, exist_ok=True)
    with open(f"{BACKUP_DIR}/training_hours_{stamp}.json", "w") as file:
        json.dump({"kpis": kpis, "mappings": maps, "fields": cat["fields"]}, file, default=str)
    removed = await db.esg_kpi_definitions.delete_many({"id": {"$in": ids}})
    await db.kpi_framework_mappings.delete_many({"$or": [{"kpi_id": {"$in": ids}}, {"source_kpi_ids": {"$in": ids}}]})
    kept = [f for f in cat["fields"] if "training_hours" not in f["field_key"]]
    await db.esg_record_categories.update_one({"_id": cat["_id"]}, {"$set": {"fields": kept}})
    print(f"kpis deleted={removed.deleted_count} fields removed={len(cat['fields']) - len(kept)} mappings removed={len(maps)}")


if __name__ == "__main__":
    asyncio.run(main())
