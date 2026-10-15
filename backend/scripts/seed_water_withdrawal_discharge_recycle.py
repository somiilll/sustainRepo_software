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

from modules.esg_records.water_schema import ROWS

UNITS = {"default_unit": "Litres", "supported_units": ["Litres", "KiloLitres", "MegaLitres"], "allow_unit_conversion": False}
COUNT_UNITS = {"default_unit": "count", "supported_units": ["count"], "allow_unit_conversion": False}
VISIBILITY = {"dashboard_enabled": False, "reports_enabled": False, "tracking_enabled": False,
              "target_enabled": True, "analytics_enabled": False}


def build_fields(existing, rows):
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
    return fields


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


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    now = datetime.now(timezone.utc).isoformat()
    for sub, build_rows in ROWS.items():
        rows = build_rows()
        cat = await db.esg_record_categories.find_one({"category": "Water", "subcategory": sub})
        if sub != "Recycle":
            fields = build_fields(cat["fields"], rows)
            await db.esg_record_categories.update_one(
                {"_id": cat["_id"]}, {"$set": {"fields": fields, "updated_at": now}})
            print(f"{sub}: {len(fields)} entry fields")
        counts = {"created": 0, "updated": 0}
        for row in rows:
            counts[await sync_kpi(db, sub, row, now)] += 1
        print(f"{sub}: KPIs {counts}")


if __name__ == "__main__":
    asyncio.run(main())
