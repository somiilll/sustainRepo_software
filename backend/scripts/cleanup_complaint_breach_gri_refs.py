"""Clean GRI references on complaint / data-breach KPIs and make Substantiated Privacy Complaints (Total) a sum KPI (idempotent, backs up first)."""
import asyncio
import json
import os
from datetime import datetime, timezone

from shared.database.mongo import db

BACKUP_DIR = "/app/backups"
BREACH_KPIS = ["Data-breach Incidents (Total)", "Data-breach Incidents - Involving Customer PII"]
BREACH_FIELDS = {
    "no_of_incidents_of_data_breach",
    "no_of_data_breach_which_involved_personally_identifiable_information_of_customers",
}
INTERNAL_KEEP_KPI = "Internal Complaints - Discrimination"
INTERNAL_KEEP_FIELDS = {"no_of_complaints_regarding_discrimination_at_workplace"}
INTERNAL_KEEP_PREFIX = "disciplinary_action_"
PRIVACY_TOTAL = "Substantiated Privacy Complaints (Total)"
PRIVACY_PARTS = ["Privacy Complaints - From Regulatory Bodies", "Privacy Complaints - From Outside Parties"]


def _without_gri(kpi: dict) -> dict:
    refs = [ref for ref in kpi.get("framework_references", []) if ref.get("framework") != "GRI"]
    return {"framework_references": refs, "gri_disclosure": None}


async def _target_kpis() -> list[dict]:
    complaints = {"category_name": "Complaints"}
    consumer = await db.esg_kpi_definitions.find({**complaints, "subcategory": "Consumer Complaints"}).to_list(None)
    internal = await db.esg_kpi_definitions.find(
        {**complaints, "subcategory": "Internal Complaints", "metric_name": {"$regex": "^Internal Complaints", "$ne": INTERNAL_KEEP_KPI}}
    ).to_list(None)
    breach = await db.esg_kpi_definitions.find({"metric_name": {"$in": BREACH_KPIS}}).to_list(None)
    return consumer + internal + breach


async def _clear_category_fields(category_filter: dict, keep) -> int:
    changed = 0
    async for category in db.esg_record_categories.find(category_filter):
        fields = category.get("fields", [])
        for field in fields:
            if field.get("gri_disclosure") and not keep(field["field_key"]):
                field["gri_disclosure"] = None
                changed += 1
        await db.esg_record_categories.update_one({"_id": category["_id"]}, {"$set": {"fields": fields}})
    return changed


async def main():
    kpis = await _target_kpis()
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")
    os.makedirs(BACKUP_DIR, exist_ok=True)
    path = f"{BACKUP_DIR}/complaint_breach_gri_cleanup_{stamp}.json"
    privacy = await db.esg_kpi_definitions.find({"metric_name": {"$in": [PRIVACY_TOTAL, *PRIVACY_PARTS]}}, {"_id": 0}).to_list(None)
    categories = await db.esg_record_categories.find(
        {"$or": [{"subcategory": "Consumer Complaints"}, {"subcategory": "Internal Complaints"}, {"subcategory": "Data Breach"}]}, {"_id": 0}
    ).to_list(None)
    with open(path, "w") as file:
        json.dump({"kpis": [{k: v for k, v in kpi.items() if k != "_id"} for kpi in kpis] + privacy, "categories": categories}, file, default=str)

    for kpi in kpis:
        await db.esg_kpi_definitions.update_one({"id": kpi["id"]}, {"$set": _without_gri(kpi)})

    fields = await _clear_category_fields({"subcategory": "Consumer Complaints"}, lambda key: False)
    fields += await _clear_category_fields(
        {"subcategory": "Internal Complaints"}, lambda key: key in INTERNAL_KEEP_FIELDS or key.startswith(INTERNAL_KEEP_PREFIX)
    )
    fields += await _clear_category_fields({"fields.field_key": {"$in": list(BREACH_FIELDS)}}, lambda key: key not in BREACH_FIELDS)

    by_name = {kpi["metric_name"]: kpi["id"] for kpi in privacy}
    if PRIVACY_TOTAL in by_name and all(name in by_name for name in PRIVACY_PARTS):
        await db.esg_kpi_definitions.update_one(
            {"id": by_name[PRIVACY_TOTAL]},
            {"$set": {
                "source_type": "composite",
                "value_field": "",
                "source_config": {"composite": {"operation": "sum", "source_kpi_ids": [by_name[name] for name in PRIVACY_PARTS]}},
            }},
        )
    print(f"backup={path} kpis_updated={len(kpis)} fields_cleared={fields}")


if __name__ == "__main__":
    asyncio.run(main())
