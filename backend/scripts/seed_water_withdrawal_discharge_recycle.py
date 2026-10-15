"""Idempotent: add Water Withdrawal / Discharge / Recycle entry fields and KPI definitions with BRSR/GRI references."""
import asyncio
import copy
import os
import sys
import uuid
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from dotenv import load_dotenv

load_dotenv(os.path.join(ROOT, ".env"))

from motor.motor_asyncio import AsyncIOMotorClient

from modules.esg_records.water_schema import ROWS, tree_meta

UNITS = {"default_unit": "Litres", "supported_units": ["Litres", "KiloLitres", "MegaLitres"], "allow_unit_conversion": False}
COUNT_UNITS = {"default_unit": "count", "supported_units": ["count"], "allow_unit_conversion": False}
VISIBILITY = {"dashboard_enabled": False, "reports_enabled": False, "tracking_enabled": False,
              "target_enabled": True, "analytics_enabled": False}


CONSUMPTION_REFS = {
    "quantity": ("P6-E3", "303-5-a"),
    "water_consumed_through_ground_water": ("P6-E3", "303-5-a"),
    "water_consumed_through_surface_water": ("P6-E3", "303-5-a"),
    "water_consumed_through_third_party_water": ("P6-E3", "303-5-a"),
    "water_consumed_through_seawater_desalinated_water": ("P6-E3", "303-5-a"),
    "quantity_consumed_in_water_stress_area": ("P6-L1", "303-5-b"),
    "change_in_water_storage": (None, "303-5-c"),
}


def apply_tree(fields, sub, refs):
    meta = tree_meta(sub)
    for f in fields:
        m = meta.get(f["field_key"])
        if not m:
            continue
        brsr, gri = refs.get(f["field_key"], (None, None))
        f.update({"group": m["group"], "level": m["level"], "parent_key": m["parent_key"],
                  "sum_parents": m["sum_parents"], "brsr_reference": brsr, "gri_disclosure": gri})
    fields.sort(key=lambda f: meta.get(f["field_key"], {"order": 10_000})["order"])
    return fields


def build_fields(existing, rows, sub_name):
    by_key = {f["field_key"]: f for f in existing}
    template = copy.deepcopy(by_key["quantity"])
    template["required"] = False
    template["validation"] = {"min": 0}
    fields = []
    for row in rows:
        key = row["key"]
        if key in by_key:
            field = by_key[key]
            if key == "quantity":
                field["required"] = False
        else:
            field = copy.deepcopy(template)
            field["field_key"] = key
            field["label"] = row["new_field"]
            if not row["unit"]:
                field.update({"has_unit": False, "allowed_units": [], "default_unit": None,
                              "validation": {"min": 0, "step": 1}})
        fields.append(field)
    used = {f["field_key"] for f in fields}
    fields.extend(f for f in existing if f["field_key"] not in used)
    return apply_tree(fields, sub_name, {r["key"]: (r["brsr"], r["gri"]) for r in rows})


async def sync_kpi(db, sub, row, now):
    new_code = f"ENV_WATER_{sub.upper()}_{row['key'].upper()}"
    doc = None
    for code in filter(None, [row["old_code"], new_code]):
        doc = await db.esg_kpi_definitions.find_one({"metric_code": code}, {"_id": 0, "id": 1, "metric_name": 1})
        if doc:
            break
    unit_config = UNITS if row["unit"] else COUNT_UNITS
    common = {
        "value_field": row["key"],
        "source_config": {"records": {"value_field": row["key"]}},
        "filters": [],
        "unit_config": unit_config,
        "brsr_reference": row["brsr"],
        "gri_disclosure": row["gri"],
        "status": "active",
        "updated_at": now,
    }
    meta = tree_meta(sub).get(row["key"])
    if meta:
        common.update({"tree_group": meta["group"], "tree_level": meta["level"],
                       "tree_parent_key": meta["parent_key"], "tree_order": meta["order"]})
    if doc:
        name = row["name"] or doc["metric_name"]
        await db.esg_kpi_definitions.update_one(
            {"id": doc["id"]}, {"$set": {**common, "metric_name": name, "short_name": name}})
        return "updated"
    await db.esg_kpi_definitions.insert_one({
        "id": str(uuid.uuid4()), "metric_name": row["name"], "short_name": row["name"], "metric_code": new_code,
        "description": "", "section": "environment", "category_name": "Water", "subcategory": sub,
        "sub_subcategory": "", "aggregation_type": "sum", "source_type": "records", "dimensions": ["organization"],
        "supported_scopes": ["organization", "facility"], "output_type": "number", "formula_config": None,
        "validation_rules": [], "display_config": {"display_name": None, "short_name": None, "display_order": 0,
                                                    "category_order": 0, "icon": None, "color": None, "decimal_places": 2},
        "visibility": dict(VISIBILITY), "tags": [], "metadata": None, "version": 1,
        "created_by": None, "created_by_name": "water seed script", "created_at": now,
        "updated_by": None, "updated_by_name": None, **common,
    })
    return "created"


async def sync_consumption(db, now):
    cat = await db.esg_record_categories.find_one({"category": "Water", "subcategory": "Consumption"})
    fields = apply_tree(cat["fields"], "Consumption", CONSUMPTION_REFS)
    await db.esg_record_categories.update_one({"_id": cat["_id"]}, {"$set": {"fields": fields, "updated_at": now}})
    for key, m in tree_meta("Consumption").items():
        await db.esg_kpi_definitions.update_many(
            {"category_name": "Water", "subcategory": "Consumption", "value_field": key, "status": "active"},
            {"$set": {"tree_group": m["group"], "tree_level": m["level"],
                      "tree_parent_key": m["parent_key"], "tree_order": m["order"]}})
    print(f"Consumption: tree metadata on {len(fields)} fields")


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    now = datetime.now(timezone.utc).isoformat()
    await sync_consumption(db, now)
    for sub, build_rows in ROWS.items():
        rows = build_rows()
        cat = await db.esg_record_categories.find_one({"category": "Water", "subcategory": sub})
        if sub != "Recycle":
            fields = build_fields(cat["fields"], rows, sub)
            await db.esg_record_categories.update_one(
                {"_id": cat["_id"]}, {"$set": {"fields": fields, "updated_at": now}})
            print(f"{sub}: {len(fields)} entry fields")
        counts = {"created": 0, "updated": 0}
        for row in rows:
            counts[await sync_kpi(db, sub, row, now)] += 1
        print(f"{sub}: KPIs {counts}")


if __name__ == "__main__":
    asyncio.run(main())
