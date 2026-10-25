"""Map the explicit Waste Disposed total KPI to the official BRSR total row."""
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.sync_brsr_derived_reporting_kpis import upsert_mapping
from shared.database.mongo import db


async def run() -> dict:
    definition = await db.esg_kpi_definitions.find_one(
        {"metric_code": "ENV_WASTE_DISPOSED_IN_METRIC_TONNES", "status": {"$ne": "archived"}},
        {"_id": 0},
    )
    if not definition:
        raise RuntimeError("Waste Disposed (Total) KPI Definition was not found")

    now = datetime.now(timezone.utc).isoformat()
    reference = "P6-E9"
    metadata = definition.get("metadata") if isinstance(definition.get("metadata"), dict) else {}
    metadata["reporting_mapping_role"] = "direct_destination"
    framework_references = definition.get("framework_references") if isinstance(definition.get("framework_references"), list) else []
    exact_reference = {"framework": "BRSR", "reference": reference, "mapping_status": "exact_destination"}
    if exact_reference not in framework_references:
        framework_references.append(exact_reference)
    await db.esg_kpi_definitions.update_one(
        {"id": definition["id"]},
        {"$set": {
            "brsr_reference": reference,
            "metadata": metadata,
            "framework_references": framework_references,
            "updated_at": now,
        }},
    )
    definition["brsr_reference"] = reference
    await upsert_mapping(
        definition, "p6_waste_management_details", "rows.disposed_total", reference, now
    )
    await db.kpi_framework_mappings.update_one(
        {
            "framework": "BRSR",
            "kpi_id": definition["id"],
            "question_key": "p6_waste_management_details",
            "answer_path": "rows.disposed_total",
        },
        {"$set": {
            "destination_unit": "MT",
            "unit_conversion_rule": "convert_with_shared_unit_registry",
            "mapping_role": "direct_destination",
            "is_active": True,
            "updated_at": now,
        }},
    )
    return {"kpi": definition["metric_name"], "question_key": "p6_waste_management_details", "answer_path": "rows.disposed_total"}


if __name__ == "__main__":
    print(asyncio.run(run()))