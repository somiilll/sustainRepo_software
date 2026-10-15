"""Idempotent: Water (Consumption/Withdrawal/Discharge/Recycle) and Waste (Generated/Recovered/Disposal/Spills) entry fields and KPIs with BRSR/GRI references."""
import asyncio
import copy
import os
import re
import sys
import uuid
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from dotenv import load_dotenv

load_dotenv(os.path.join(ROOT, ".env"))

from motor.motor_asyncio import AsyncIOMotorClient

from modules.esg_records.water_schema import ROWS, tree_meta
from modules.esg_records.env_schema import RESTORATION_REFS, SPECS, env_tree_meta
from modules.esg_records.waste_schema import (
    SPILL_COLUMNS, SPILL_COUNT_KEY, SPILL_TABLE_KEY, SPILL_TOTAL_KEY, STREAMS, waste_rows, waste_tree_meta,
)

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


def apply_tree(fields, sub, refs, meta_fn=tree_meta):
    meta = meta_fn(sub)
    for f in fields:
        m = meta.get(f["field_key"])
        if not m:
            continue
        brsr, gri = refs.get(f["field_key"], (None, None))
        f.update({"group": m["group"], "level": m["level"], "parent_key": m["parent_key"],
                  "sum_parents": m["sum_parents"], "brsr_reference": brsr, "gri_disclosure": gri})
    fields.sort(key=lambda f: meta.get(f["field_key"], {"order": 10_000})["order"])
    return fields


def build_fields(existing, rows, sub_name, meta_fn=tree_meta):
    by_key = {}
    for f in existing:
        by_key.setdefault(f["field_key"], f)
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
    return apply_tree(fields, sub_name, {r["key"]: (r["brsr"], r["gri"]) for r in rows}, meta_fn)


SPILL_UNITS = {"default_unit": "Litres", "supported_units": ["Litres", "KiloLitres"], "allow_unit_conversion": False}


async def sync_kpi(db, category, sub, row, now, meta_fn=tree_meta, units=UNITS):
    slug = re.sub(r"[^A-Z0-9]+", "_", sub.upper()).strip("_")
    new_code = f"ENV_{category.upper()}_{slug}_{row['key'].upper()}"
    doc = None
    for code in filter(None, [row["old_code"], new_code]):
        doc = await db.esg_kpi_definitions.find_one({"metric_code": code}, {"_id": 0, "id": 1, "metric_name": 1})
        if doc:
            break
    unit_config = row.get("unit_config") or (units if row["unit"] else COUNT_UNITS)
    common = {
        "aggregation_type": row.get("agg", "sum"),
        "output_type": "percentage" if row.get("percent") else "number",
        "value_field": row["key"],
        "source_config": {"records": {"value_field": row["key"]}},
        "filters": [],
        "unit_config": unit_config,
        "brsr_reference": row["brsr"],
        "gri_disclosure": row["gri"],
        "status": "active",
        "updated_at": now,
    }
    meta = meta_fn(sub).get(row["key"])
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
        "description": "", "section": row.get("section", "environment"), "category_name": category, "subcategory": sub,
        "sub_subcategory": "", "aggregation_type": "sum", "source_type": "records", "dimensions": ["organization"],
        "supported_scopes": ["organization", "facility"], "output_type": "number", "formula_config": None,
        "validation_rules": [], "display_config": {"display_name": None, "short_name": None, "display_order": 0,
                                                    "category_order": 0, "icon": None, "color": None, "decimal_places": 2},
        "visibility": dict(VISIBILITY), "tags": [], "metadata": None, "version": 1,
        "created_by": None, "created_by_name": "seed script", "created_at": now,
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


def spill_fields(existing_unit_field):
    base = {"type": "number", "required": False, "placeholder": "", "options": [], "default_value": None,
            "validation": {"min": 0}, "table_columns": [], "table_min_rows": 1, "table_max_rows": 10}
    meta = waste_tree_meta("Spills")
    gri = "306-3 (2016)-a"
    fields = [
        {**base, "field_key": SPILL_COUNT_KEY, "label": "Number of significant spills", "has_unit": False,
         "allowed_units": [], "default_unit": None, "validation": {"min": 0, "step": 1},
         "table_summary": {"source": SPILL_TABLE_KEY, "op": "count"}},
        {**base, "field_key": SPILL_TOTAL_KEY, "label": "Total volume of significant spills", "has_unit": True,
         "allowed_units": ["Litres", "KiloLitres"], "default_unit": "Litres",
         "table_summary": {"source": SPILL_TABLE_KEY, "op": "sum", "column": "volume", "unit_column": "volume_unit"}},
        {**base, "field_key": SPILL_TABLE_KEY, "type": "table", "label": "Spill records (one row per significant spill)",
         "has_unit": False, "allowed_units": [], "default_unit": None, "validation": {},
         "table_columns": SPILL_COLUMNS, "table_min_rows": 0, "table_max_rows": 50},
    ]
    for f in fields:
        m = meta[f["field_key"]]
        f.update({"group": m["group"], "level": m["level"], "parent_key": None, "sum_parents": [],
                  "brsr_reference": None, "gri_disclosure": gri if f["field_key"] != SPILL_TABLE_KEY else None})
    return fields


async def sync_waste(db, now):
    waste_units = None
    ref = await db.esg_kpi_definitions.find_one({"metric_code": "ENV_WASTE_GENERATED_IN_METRIC_TONNES"}, {"unit_config": 1})
    waste_units = (ref or {}).get("unit_config") or {"default_unit": "MT", "supported_units": ["MT", "kg"], "allow_unit_conversion": False}
    for sub in [*STREAMS, "Spills"]:
        cat = await db.esg_record_categories.find_one({"category": "Waste", "subcategory": sub})
        rows = waste_rows(sub)
        fields = spill_fields(None) if sub == "Spills" else build_fields(cat["fields"], rows, sub, waste_tree_meta)
        await db.esg_record_categories.update_one({"_id": cat["_id"]}, {"$set": {"fields": fields, "updated_at": now}})
        print(f"Waste/{sub}: {len(fields)} entry fields")
        counts = {"created": 0, "updated": 0}
        units = SPILL_UNITS if sub == "Spills" else waste_units
        for row in rows:
            counts[await sync_kpi(db, "Waste", sub, row, now, waste_tree_meta, units)] += 1
        print(f"Waste/{sub}: KPIs {counts}")


def env_field(spec, meta):
    table = spec["type"] == "table"
    field = {
        "field_key": spec["key"], "label": spec["label"], "type": "table" if table else "number", "required": False,
        "placeholder": "", "options": [], "default_value": None,
        "validation": {} if table else ({"min": 0, "max": 100} if spec["percent"] else {"min": 0}),
        "has_unit": bool(spec["units"]), "allowed_units": spec["units"] or [], "default_unit": spec["default_unit"] if spec["units"] else None,
        "table_columns": [{k: v for k, v in c.items() if v is not None} for c in spec["cols"]] if table else [],
        "table_min_rows": 0, "table_max_rows": 50,
        "group": spec["group"], "level": spec["level"], "parent_key": spec["parent"],
        "sum_parents": meta["sum_parents"], "brsr_reference": None if table else spec["brsr"],
        "gri_disclosure": None if table else spec["gri"],
    }
    if spec["summary"]:
        field["table_summary"] = spec["summary"]
    return field


async def sync_env(db, now):
    for (category, sub), specs in SPECS.items():
        cat = await db.esg_record_categories.find_one({"category": category, "subcategory": sub})
        meta = env_tree_meta(category, sub)
        fields = [env_field(sp, meta[sp["key"]]) for sp in specs]
        await db.esg_record_categories.update_one({"_id": cat["_id"]}, {"$set": {"fields": fields, "updated_at": now}})
        counts = {"created": 0, "updated": 0}
        for sp in specs:
            if not sp["kpi"]:
                continue
            row = {"key": sp["key"], "name": sp["kpi"], "brsr": sp["brsr"], "gri": sp["gri"], "old_code": sp["old"],
                   "unit": bool(sp["units"]) or sp["percent"], "agg": sp["agg"], "percent": sp["percent"],
                   "section": "social" if category == "Complaints" else "environment"}
            if sp["units"]:
                row["unit_config"] = {"default_unit": sp["default_unit"], "supported_units": sp["units"], "allow_unit_conversion": False}
            elif sp["percent"]:
                row["unit_config"] = {"default_unit": "%", "supported_units": ["%"], "allow_unit_conversion": False}
            counts[await sync_kpi(db, category, sub, row, now, lambda _s: env_tree_meta(category, sub), UNITS)] += 1
        print(f"{category}/{sub}: {len(fields)} entry fields, KPIs {counts}")
    rcat = await db.esg_record_categories.find_one({"category": "Biodiversity", "subcategory": "Restoration / Rehabilitation"})
    for f in rcat["fields"]:
        if f["field_key"] in RESTORATION_REFS:
            f["brsr_reference"], f["gri_disclosure"] = RESTORATION_REFS[f["field_key"]]
    await db.esg_record_categories.update_one({"_id": rcat["_id"]}, {"$set": {"fields": rcat["fields"], "updated_at": now}})
    for key, (brsr, gri) in RESTORATION_REFS.items():
        await db.esg_kpi_definitions.update_many({"category_name": "Biodiversity", "subcategory": "Restoration / Rehabilitation", "value_field": key},
                                                 {"$set": {"brsr_reference": brsr, "gri_disclosure": gri}})
    print("Biodiversity/Restoration / Rehabilitation: references added")


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
            counts[await sync_kpi(db, "Water", sub, row, now)] += 1
        print(f"{sub}: KPIs {counts}")
    await sync_waste(db, now)
    await sync_env(db, now)


if __name__ == "__main__":
    asyncio.run(main())
