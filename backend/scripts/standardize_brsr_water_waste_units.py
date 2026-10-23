"""Apply official BRSR destination units to verified Water and Waste mappings."""
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Set

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from shared.database.mongo import db


DESTINATION_POLICIES = {
    "p6_water_disclosures": {"source_category": "Water", "unit": "kl"},
    "p6_water_discharged": {"source_category": "Water", "unit": "kl"},
    "p6_water_stress_areas": {"source_category": "Water", "unit": "kl"},
    "p6_waste_management_details": {"source_category": "Waste", "unit": "MT"},
}


async def run() -> Dict[str, int]:
    mappings = await db.kpi_framework_mappings.find(
        {"framework": "BRSR", "is_active": {"$ne": False}, "question_key": {"$in": list(DESTINATION_POLICIES)}},
        {"_id": 0, "id": 1, "question_key": 1, "kpi_id": 1, "source_kpi_ids": 1},
    ).to_list(1000)
    source_ids: Set[str] = {
        source_id for mapping in mappings
        for source_id in (mapping.get("source_kpi_ids") or [mapping.get("kpi_id")]) if source_id
    }
    definitions = await db.esg_kpi_definitions.find(
        {"id": {"$in": list(source_ids)}}, {"_id": 0, "id": 1, "category_name": 1}
    ).to_list(1000)
    category_by_id = {definition["id"]: definition.get("category_name") for definition in definitions}
    now = datetime.now(timezone.utc).isoformat()
    updated = 0

    for mapping in mappings:
        policy = DESTINATION_POLICIES[mapping["question_key"]]
        mapping_categories = {
            category_by_id.get(source_id)
            for source_id in (mapping.get("source_kpi_ids") or [mapping.get("kpi_id")]) if source_id
        }
        if mapping_categories != {policy["source_category"]}:
            continue
        result = await db.kpi_framework_mappings.update_one(
            {"id": mapping["id"]},
            {"$set": {
                "destination_unit": policy["unit"],
                "unit_conversion_rule": "convert_with_shared_unit_registry",
                "updated_at": now,
            }},
        )
        updated += result.modified_count
    return {"updated_mappings": updated, "water_unit": "kl", "waste_unit": "MT"}


if __name__ == "__main__":
    print(asyncio.run(run()))