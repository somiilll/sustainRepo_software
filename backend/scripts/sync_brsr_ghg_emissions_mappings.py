"""Add exact, live GHG total mappings for the requested BRSR emission rows."""
import asyncio
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from shared.database.mongo import db


GHG_TOTALS = (
    {
        "metric_code": "GHG_SCOPE1_TOTAL",
        "metric_name": "Total Scope 1 emissions",
        "baseline_mapping_key": "scope1_total",
        "reference": "P6-E7",
        "question_key": "p6_ghg_scope12",
        "answer_path": "scope1",
    },
    {
        "metric_code": "GHG_SCOPE2_TOTAL",
        "metric_name": "Total Scope 2 emissions",
        "baseline_mapping_key": "scope2_total",
        "reference": "P6-E7",
        "question_key": "p6_ghg_scope12",
        "answer_path": "scope2",
    },
    {
        "metric_code": "GHG_SCOPE3_TOTAL",
        "metric_name": "Total Scope 3 emissions",
        "baseline_mapping_key": "scope3_total",
        "reference": "P6-L2",
        "question_key": "p6_scope3_emissions",
        "answer_path": "scope3_total",
    },
)


async def upsert_ghg_total(spec: dict, now: str) -> str:
    existing = await db.esg_kpi_definitions.find_one(
        {"metric_code": spec["metric_code"]}, {"_id": 0, "id": 1, "created_at": 1}
    )
    kpi_id = existing["id"] if existing else str(uuid.uuid4())
    definition = {
        "id": kpi_id,
        "metric_code": spec["metric_code"],
        "metric_name": spec["metric_name"],
        "short_name": spec["metric_name"],
        "description": f"Live total from approved GHG {spec['metric_name'].replace('Total ', '')} records.",
        "section": "environment",
        "category_name": "GHG Emissions",
        "subcategory": spec["metric_name"],
        "source_type": "ghg",
        "baseline_mapping_key": spec["baseline_mapping_key"],
        "aggregation_type": "sum",
        "value_field": "total_emissions",
        "unit_config": {"default_unit": "tCO2e", "allowed_units": ["tCO2e"], "allow_unit_conversion": False},
        "brsr_reference": spec["reference"],
        "framework_references": [{"framework": "BRSR", "reference": spec["reference"], "mapping_status": "exact_destination"}],
        "metadata": {"reporting_mapping_role": "direct_destination", "source_module": "ghg"},
        "status": "active",
        "visibility": {"show_in_kpi_library": True, "show_in_dashboards": True, "show_in_targets": True, "show_in_reports": True, "allow_manual_entry": False},
        "updated_at": now,
    }
    if existing:
        await db.esg_kpi_definitions.update_one({"id": kpi_id}, {"$set": definition})
    else:
        await db.esg_kpi_definitions.insert_one({
            "created_at": now,
            "created_by": None,
            "created_by_name": "BRSR GHG mapping sync",
            "validation_rules": [],
            "version": 1,
            **definition,
        })

    mapping_filter = {
        "framework": "BRSR",
        "kpi_id": kpi_id,
        "question_key": spec["question_key"],
        "answer_path": spec["answer_path"],
    }
    mapping = {
        "kpi_id": kpi_id,
        "source_kpi_ids": [kpi_id],
        "source_metric_code": spec["metric_code"],
        "source_metric_name": spec["metric_name"],
        "source_category": "GHG Emissions",
        "source_subcategory": spec["metric_name"],
        "source_tag": f"GHG → {spec['metric_name']}",
        "framework": "BRSR",
        "reference": spec["reference"],
        "question_key": spec["question_key"],
        "answer_path": spec["answer_path"],
        "aggregation_rule": "sum",
        "destination_unit": "tCO2e",
        "include_unit": True,
        "unit_conversion_rule": "native_ghg_tco2e",
        "mapping_status": "exact_destination",
        "mapping_role": "direct_destination",
        "is_active": True,
        "period_column_strategy": "reporting_year_filter",
        "reporting_period_source": "runtime_filter",
        "review_source": "ghg_total_mapping_sync",
        "reviewed_at": now,
        "updated_at": now,
    }
    existing_mapping = await db.kpi_framework_mappings.find_one(mapping_filter, {"_id": 0, "id": 1})
    if existing_mapping:
        await db.kpi_framework_mappings.update_one(
            {"id": existing_mapping["id"]}, {"$set": mapping, "$unset": {"period_columns": ""}}
        )
    else:
        await db.kpi_framework_mappings.insert_one({"id": str(uuid.uuid4()), "created_at": now, **mapping})
    return kpi_id


async def main() -> None:
    now = datetime.now(timezone.utc).isoformat()
    ids = [await upsert_ghg_total(spec, now) for spec in GHG_TOTALS]
    print({"ghg_kpi_definitions": len(ids), "mapped_brsr_rows": len(ids), "kpi_ids": ids})


if __name__ == "__main__":
    asyncio.run(main())