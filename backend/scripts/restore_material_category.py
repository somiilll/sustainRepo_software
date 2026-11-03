"""Restore the hard-deleted 'Material' ESG record categories and KPI definitions from the 2026-10-21 backup and make them active (idempotent)."""
import asyncio
import json
from datetime import datetime, timezone

from shared.database.mongo import db

BACKUP = "/app/backups/esg_hard_delete_20261021T071003Z.json"


async def main():
    data = json.load(open(BACKUP))
    now = datetime.now(timezone.utc).isoformat()
    cats = created_cats = created_kpis = 0
    for doc in data["category_configs"]:
        if doc.get("category") != "Material":
            continue
        doc.pop("_id", None)
        cats += 1
        existing = await db.esg_record_categories.find_one({"section": doc["section"], "category": "Material", "subcategory": doc["subcategory"]}, {"_id": 0, "id": 1})
        if existing:
            await db.esg_record_categories.update_one({"id": existing["id"]}, {"$set": {"is_active": True, "updated_at": now}})
        else:
            await db.esg_record_categories.insert_one({**doc, "is_active": True, "updated_at": now})
            created_cats += 1
    kpis = 0
    for doc in data["kpi_definitions"]:
        if doc.get("category_name") != "Material":
            continue
        doc.pop("_id", None)
        kpis += 1
        existing = await db.esg_kpi_definitions.find_one({"$or": [{"id": doc["id"]}, {"metric_code": doc["metric_code"]}]}, {"_id": 0, "id": 1})
        if existing:
            await db.esg_kpi_definitions.update_one({"id": existing["id"]}, {"$set": {"status": "active", "updated_at": now}})
        else:
            await db.esg_kpi_definitions.insert_one({**doc, "status": "active", "updated_at": now})
            created_kpis += 1
    print(f"categories in backup={cats} created={created_cats}; kpis in backup={kpis} created={created_kpis}")


if __name__ == "__main__":
    asyncio.run(main())
