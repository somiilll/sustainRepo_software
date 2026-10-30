"""Energy Reduction: ESG Records form, KPIs and GRI 103-5-a / 103-5-a-i / 103-5-a-ii mappings (idempotent). Run: python -m scripts.add_energy_reduction_kpis"""
import asyncio
import uuid
from datetime import datetime, timezone

from shared.database.mongo import db

REVIEW_SOURCE = "gri_305_sync"
SUB = "Energy Reduction"
UNITS = ["J", "kJ", "MJ", "GJ", "TJ", "kWh", "MWh", "GWh"]
TYPES = [("fuel", "Fuel"), ("electricity", "Electricity"), ("heating", "Heating"), ("steam", "Steam"), ("cooling", "Cooling")]
CAUSES = [("initiatives", "Org's conservation and efficiency initiatives", "103-5-a-i"), ("other", "Other factors", "103-5-a-ii")]


def field(key, label, group, level, parent, ref):
    return {"field_key": key, "label": label, "type": "number", "required": False, "placeholder": "", "options": [], "default_value": None, "validation": {"min": 0},
            "has_unit": True, "allowed_units": UNITS, "default_unit": "J", "table_columns": [], "table_min_rows": 0, "table_max_rows": 50, "group": group, "level": level,
            "parent_key": parent, "sum_parents": [parent] if parent else [], "brsr_reference": None, "gri_disclosure": ref, "legacy_only": False,
            "hide_if_table_has_rows": None, "show_with_legacy_ui": False}


async def upsert_kpi(code, name, sub_group, now, **extra):
    existing = await db.esg_kpi_definitions.find_one({"metric_code": code}, {"_id": 0, "id": 1})
    kpi_id = existing["id"] if existing else str(uuid.uuid4())
    doc = {"id": kpi_id, "metric_code": code, "metric_name": name, "short_name": name, "description": "", "section": "environment", "category_name": "Energy",
           "subcategory": SUB, "sub_subcategory": "", "aggregation_type": "sum", "filters": [], "dimensions": ["organization", "facility"],
           "supported_scopes": ["organization", "facility"], "output_type": "number", "validation_rules": [], "status": "active", "tags": [],
           "unit_config": {"default_unit": "J", "supported_units": UNITS, "allow_unit_conversion": False},
           "visibility": {"dashboard_enabled": False, "reports_enabled": False, "tracking_enabled": False, "target_enabled": True, "analytics_enabled": False},
           "tree_group": sub_group, "updated_at": now, **extra}
    if existing:
        await db.esg_kpi_definitions.update_one({"id": kpi_id}, {"$set": doc})
    else:
        await db.esg_kpi_definitions.insert_one({"created_at": now, "created_by": None, "created_by_name": "energy reduction script", "version": 1, **doc})
    return kpi_id


def records(field_key):
    return {"source_type": "records", "source_config": {"records": {"value_field": field_key}}, "value_field": field_key}


def composite(ids):
    return {"source_type": "composite", "source_config": {"composite": {"operation": "sum", "source_kpi_ids": ids}}, "formula_config": {"formula_type": "sum", "dependencies": ids}}


async def main():
    now = datetime.now(timezone.utc).isoformat()
    fields = []
    for key, label in TYPES:
        group = f"{label} energy reduced"
        fields.append(field(f"{key}_reduction", f"{label} energy reduced (Total)", group, 0, None, "103-5-a"))
        for cause_key, cause_label, ref in CAUSES:
            fields.append(field(f"{key}_reduction_{cause_key}", f"Reduction due to {cause_label}", group, 1, f"{key}_reduction", ref))
    category = {"section": "environment", "category": "Energy", "subcategory": SUB, "sub_subcategory": "", "frameworks": [],
                "allowed_reporting_types": ["monthly", "daily", "quarterly", "yearly"], "fields": fields, "is_active": True, "order": 14, "updated_at": now}
    if await db.esg_record_categories.find_one({"category": "Energy", "subcategory": SUB}, {"_id": 0, "id": 1}):
        await db.esg_record_categories.update_one({"category": "Energy", "subcategory": SUB}, {"$set": category})
    else:
        await db.esg_record_categories.insert_one({"id": str(uuid.uuid4()), "created_at": now, "created_by": None, "updated_by": None, **category})

    ids = {}
    for key, label in TYPES:
        group = f"{label} energy reduced"
        ids[(key, "total")] = await upsert_kpi(f"ENERGY_REDUCTION_{key.upper()}_TOTAL", f"Energy Reduction - {label} (Total)", group, now, **records(f"{key}_reduction"))
        for cause_key, cause_label, _ref in CAUSES:
            ids[(key, cause_key)] = await upsert_kpi(
                f"ENERGY_REDUCTION_{key.upper()}_{cause_key.upper()}", f"Energy Reduction - {label} - {cause_label}", group, now, **records(f"{key}_reduction_{cause_key}"))
    for cause_key, cause_label, _ref in CAUSES:
        ids[("all", cause_key)] = await upsert_kpi(
            f"ENERGY_REDUCTION_DUE_TO_{cause_key.upper()}_TOTAL", f"Total Energy Reduction due to {cause_label}", "Total Energy Reduction", now,
            **composite([ids[(key, cause_key)] for key, _ in TYPES]))
    ids[("all", "total")] = await upsert_kpi(
        "ENERGY_REDUCTION_TOTAL", "Total Energy Reduction", "Total Energy Reduction", now, **composite([ids[(key, "total")] for key, _ in TYPES]))

    await db.kpi_framework_mappings.delete_many({"framework": "GRI", "review_source": REVIEW_SOURCE, "reference": {"$in": ["103-5-a", "103-5-a-i", "103-5-a-ii"]}})
    await db.esg_kpi_definitions.update_one({"id": ids[("all", "total")]}, {"$set": {"framework_references": [], "gri_disclosure": None}})
    for kpi_key, reference, path, label in [(("all", "initiatives"), "103-5-a-i", "i", "Reduction from conservation and efficiency initiatives"),
                                            (("all", "other"), "103-5-a-ii", "ii", "Reduction from other factors")]:
        kpi = await db.esg_kpi_definitions.find_one({"id": ids[kpi_key]}, {"_id": 0})
        refs = [{"framework": "GRI", "reference": reference, "question_key": "gri_103_5_a", "answer_path": path, "reference_type": "exact", "mapping_status": "exact_destination"}]
        await db.esg_kpi_definitions.update_one({"id": kpi["id"]}, {"$set": {"framework_references": refs, "gri_disclosure": reference}})
        await db.kpi_framework_mappings.insert_one({
            "id": str(uuid.uuid4()), "created_at": now, "updated_at": now, "reviewed_at": now, "kpi_id": kpi["id"], "source_kpi_ids": [kpi["id"]],
            "source_metric_code": kpi["metric_code"], "source_metric_name": kpi["metric_name"], "source_category": "Energy", "source_subcategory": SUB,
            "source_tag": f"Energy → {SUB}", "framework": "GRI", "reference": reference, "question_key": "gri_103_5_a", "answer_path": path, "display_label": label,
            "display_order": 0, "aggregation_rule": "sum", "destination_unit": "J", "include_unit": True, "mapping_status": "exact_destination",
            "mapping_role": "direct_destination", "is_active": True, "period_column_strategy": "reporting_year_filter", "reporting_period_source": "runtime_filter",
            "review_source": REVIEW_SOURCE})
    print(f"form fields={len(fields)} kpis={len(ids)} mappings=2")


if __name__ == "__main__":
    asyncio.run(main())
