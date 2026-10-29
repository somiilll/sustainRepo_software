"""General Training: remove BRSR refs and unwired framework mappings from Training Hours - Environment / Human Rights / Organisation Policies (idempotent, backs up first)."""
import asyncio
import json
import os
from datetime import datetime, timezone

from shared.database.mongo import db

BACKUP_DIR = "/app/backups"
NAMES = ["Training Hours - Environment", "Training Hours - Human Rights", "Training Hours - Organisation Policies"]


async def main():
    kpis = await db.esg_kpi_definitions.find({"metric_name": {"$in": NAMES}}).to_list(None)
    ids = [k["id"] for k in kpis]
    mappings = await db.kpi_framework_mappings.find({"framework": "BRSR", "$or": [{"kpi_id": {"$in": ids}}, {"source_kpi_ids": {"$in": ids}}]}, {"_id": 0}).to_list(None)
    cat = await db.esg_record_categories.find_one({"subcategory": "General Training"})
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")
    os.makedirs(BACKUP_DIR, exist_ok=True)
    with open(f"{BACKUP_DIR}/training_hours_brsr_{stamp}.json", "w") as file:
        json.dump({"kpis": [{k: v for k, v in kpi.items() if k != "_id"} for kpi in kpis], "mappings": mappings, "fields": cat["fields"]}, file, default=str)

    field_keys = set()
    for kpi in kpis:
        refs = [r for r in kpi.get("framework_references") or [] if str(r.get("framework", "")).upper() != "BRSR"]
        await db.esg_kpi_definitions.update_one({"id": kpi["id"]}, {"$set": {"brsr_reference": None, "framework_references": refs}})
        field_keys.add((kpi.get("source_config") or {}).get("records", {}).get("value_field"))
    deleted = await db.kpi_framework_mappings.delete_many({"framework": "BRSR", "$or": [{"kpi_id": {"$in": ids}}, {"source_kpi_ids": {"$in": ids}}]})
    for field in cat["fields"]:
        if field["field_key"] in field_keys:
            field["brsr_reference"] = None
    await db.esg_record_categories.update_one({"_id": cat["_id"]}, {"$set": {"fields": cat["fields"]}})
    print(f"kpis={len(kpis)} mappings deleted={deleted.deleted_count}")


if __name__ == "__main__":
    asyncio.run(main())
