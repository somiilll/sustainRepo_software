"""Governance 'Supplier Assessment' category + KPIs; GRI 102-3-c-i/ii on Employee Redeployed KPIs/fields (idempotent)."""
import asyncio
import uuid
from datetime import datetime, timezone

from scripts.seed_water_withdrawal_discharge_recycle import sync_kpi
from shared.database.mongo import db

CATEGORY = SUB = "Supplier Assessment"
PCT = {"default_unit": "%", "supported_units": ["%"], "allow_unit_conversion": False}
FIELDS = [
    ("total_suppliers", "Total Suppliers", "Total", None, False, None),
    ("suppliers_assessed_environmental_impacts", "Suppliers assessed for environmental impacts", "Environmental Assessment", "308-2-a", False, None),
    ("new_suppliers_screened_environmental_criteria", "% of new suppliers screened using environmental criteria", "Environmental Assessment", "308-1-a", True, PCT),
    ("suppliers_assessed_social_impacts", "Suppliers assessed for social impacts", "Social Assessment", "414-2-a", False, None),
    ("new_suppliers_screened_social_criteria", "% of new suppliers screened using social criteria", "Social Assessment", "414-1-a", True, PCT),
]


def _ref(code: str) -> dict:
    return {"framework": "GRI", "reference": code, "question_key": "gri_" + code.replace("-", "_"), "answer_path": None, "reference_type": "exact"}


async def redeployed_gri():
    wanted = {"Female": "102-3-c-i", "Male": "102-3-c-i"}
    kpis = await db.esg_kpi_definitions.find({"subcategory": "Employee Redeployed"}).to_list(None)
    cat = await db.esg_record_categories.find_one({"subcategory": "Employee Redeployed"})
    field_gri = {}
    for kpi in kpis:
        code = wanted.get(kpi["metric_name"].split(" - ")[-1], "102-3-c-ii")
        refs = [r for r in kpi.get("framework_references") or [] if r.get("framework") != "GRI"]
        await db.esg_kpi_definitions.update_one({"id": kpi["id"]}, {"$set": {"framework_references": [_ref(code)] + refs, "gri_disclosure": code}})
        field_gri[kpi["source_config"]["records"]["value_field"]] = code
    for field in cat["fields"]:
        field["gri_disclosure"] = field_gri.get(field["field_key"], field.get("gri_disclosure"))
    await db.esg_record_categories.update_one({"_id": cat["_id"]}, {"$set": {"fields": cat["fields"]}})
    return len(kpis)


async def supplier_assessment(now):
    fields, rows = [], []
    for key, label, group, gri, percent, units in FIELDS:
        validation = {"min": 0, "max": 100} if percent else {"min": 0, "step": 1}
        fields.append({"field_key": key, "label": label, "type": "number", "required": False, "placeholder": "", "options": [],
                       "default_value": None, "validation": validation, "has_unit": False, "allowed_units": [], "default_unit": None,
                       "table_columns": [], "table_min_rows": 0, "table_max_rows": 50, "group": group, "level": 0, "parent_key": None,
                       "sum_parents": [], "brsr_reference": None, "gri_disclosure": gri, "legacy_only": False,
                       "hide_if_table_has_rows": None, "show_with_legacy_ui": False})
        rows.append({"key": key, "name": label, "brsr": None, "gri": gri, "old_code": None, "unit": False, "section": "governance",
                     "percent": percent, "agg": "avg" if percent else "sum", "unit_config": units})
    if not await db.esg_record_categories.find_one({"category": CATEGORY, "subcategory": SUB}):
        base = await db.esg_record_categories.find_one({"section": "governance", "category": "Financial & Procurement Metrics"}, {"_id": 0})
        base.update({"id": str(uuid.uuid4()), "category": CATEGORY, "subcategory": SUB, "fields": fields, "is_active": True,
                     "order": 5, "created_at": now, "updated_at": now})
        await db.esg_record_categories.insert_one(base)
    for row in rows:
        await sync_kpi(db, CATEGORY, SUB, row, now, lambda _sub: {})
    return len(rows)


async def main():
    now = datetime.now(timezone.utc).isoformat()
    print("redeployed KPIs", await redeployed_gri(), "supplier KPIs", await supplier_assessment(now))


if __name__ == "__main__":
    asyncio.run(main())
