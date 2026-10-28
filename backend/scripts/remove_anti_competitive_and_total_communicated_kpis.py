"""Remove the Anti-Competitive Behaviour ESG config + KPIs and the anti-corruption 'People Communicated (Total)' KPI (idempotent, backs up first)."""
import asyncio
import json
import os
from datetime import datetime, timezone

from shared.database.mongo import db

COMPETITIVE_CATEGORY = "Competitive Behaviour "
COMPETITIVE_SUBCATEGORY = "Anti-Competitive Behaviour & Anti-Trust Cases"
TOTAL_KPI_NAME = "Anti-corruption Policy - People Communicated (Total)"
BACKUP_DIR = "/app/backups"


async def main():
    competitive_kpi_filter = {"category_name": COMPETITIVE_CATEGORY, "subcategory": COMPETITIVE_SUBCATEGORY}
    total_kpi_filter = {"metric_name": TOTAL_KPI_NAME}
    category_filter = {"category": COMPETITIVE_CATEGORY, "subcategory": COMPETITIVE_SUBCATEGORY}

    kpis = await db.esg_kpi_definitions.find({"$or": [competitive_kpi_filter, total_kpi_filter]}, {"_id": 0}).to_list(None)
    categories = await db.esg_record_categories.find(category_filter, {"_id": 0}).to_list(None)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")
    os.makedirs(BACKUP_DIR, exist_ok=True)
    path = f"{BACKUP_DIR}/anti_competitive_and_total_kpi_removal_{stamp}.json"
    with open(path, "w") as file:
        json.dump({"kpis": kpis, "categories": categories}, file, default=str)

    kpi_ids = [kpi["id"] for kpi in kpis]
    mappings = await db.kpi_framework_mappings.delete_many({"kpi_id": {"$in": kpi_ids}})
    removed_kpis = await db.esg_kpi_definitions.delete_many({"id": {"$in": kpi_ids}})
    removed_categories = await db.esg_record_categories.delete_many(category_filter)
    print(f"backup={path} kpis={removed_kpis.deleted_count} categories={removed_categories.deleted_count} mappings={mappings.deleted_count}")


if __name__ == "__main__":
    asyncio.run(main())
