"""Idempotent: align Water -> Consumption KPI definitions with BRSR/GRI references."""
import asyncio
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from motor.motor_asyncio import AsyncIOMotorClient

UNITS = {"default_unit": "Litres", "supported_units": ["Litres", "KiloLitres", "MegaLitres"], "allow_unit_conversion": False}

# (current metric_name, new name, value_field, brsr_reference, gri_disclosure)
KPIS = [
    ("Water Consuption", "Water Consumption (Total)", "quantity", "P6-E3", "303-5-a"),
    ("Water Consumption - Ground Water", "Water Consumption - Ground Water", "water_consumed_through_ground_water", "P6-E3", "303-5-a"),
    ("Water Consumption - Surface Water", "Water Consumption - Surface Water", "water_consumed_through_surface_water", "P6-E3", "303-5-a"),
    ("Water Consumption - Third Party Water", "Water Consumption - Third-party Water", "water_consumed_through_third_party_water", "P6-E3", "303-5-a"),
    ("Water Consumption - Seawater / Desalinated water", "Water Consumption - Seawater / Desalinated", "water_consumed_through_seawater_desalinated_water", "P6-E3", "303-5-a"),
    ("Water Consumption from water stress area", "Water Consumption in Water-stress Areas", "quantity_consumed_in_water_stress_area", "P6-L1", "303-5-b"),
    ("Water Consumption causing change in water storage", "Change in Water Storage", "change_in_water_storage", "", "303-5-c"),
]


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    now = datetime.now(timezone.utc).isoformat()
    for old_name, new_name, value_field, brsr, gri in KPIS:
        doc = await db.esg_kpi_definitions.find_one(
            {"category_name": "Water", "subcategory": "Consumption", "metric_name": {"$in": [old_name, new_name]}},
            {"_id": 0, "id": 1},
        )
        if not doc:
            print(f"MISSING (not found): {old_name}")
            continue
        await db.esg_kpi_definitions.update_one(
            {"id": doc["id"]},
            {"$set": {
                "metric_name": new_name,
                "short_name": new_name,
                "value_field": value_field,
                "source_config": {"records": {"value_field": value_field}},
                "filters": [],
                "unit_config": UNITS,
                "brsr_reference": brsr or None,
                "gri_disclosure": gri or None,
                "status": "active",
                "updated_at": now,
            }},
        )
        print(f"OK: {new_name} -> {value_field} | BRSR {brsr or '-'} | GRI {gri or '-'}")


if __name__ == "__main__":
    asyncio.run(main())
