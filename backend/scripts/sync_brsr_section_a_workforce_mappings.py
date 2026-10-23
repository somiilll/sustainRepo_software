"""Synchronize exact, displayable Section A workforce KPI destinations.

Section A calculates group totals from its permanent and other-than-permanent
male/female cells. Only those input cells are therefore valid live KPI targets.
"""
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from modules.brsr_report.section_a_workforce import SECTION_A_WORKFORCE_CELL_MAPPINGS
from scripts.sync_brsr_derived_reporting_kpis import upsert_mapping
from shared.database.mongo import db


async def _load_definitions() -> Dict[str, Dict]:
    names = [mapping["metric_name"] for mapping in SECTION_A_WORKFORCE_CELL_MAPPINGS]
    definitions = await db.esg_kpi_definitions.find(
        {"metric_name": {"$in": names}, "status": {"$ne": "archived"}}, {"_id": 0}
    ).to_list(len(names))
    by_name = {definition["metric_name"]: definition for definition in definitions}
    missing = [name for name in names if name not in by_name]
    if missing:
        raise RuntimeError(f"Missing Section A workforce KPI Definitions: {', '.join(missing)}")
    return by_name


async def _retire_noncanonical_mappings(now: str) -> int:
    """Retire every old Section A mapping that is not a canonical cell destination."""
    definitions = await _load_definitions()
    valid_destinations = {
        (definitions[mapping["metric_name"]]["id"], mapping["question_key"], mapping["answer_path"])
        for mapping in SECTION_A_WORKFORCE_CELL_MAPPINGS
    }
    existing_mappings = await db.kpi_framework_mappings.find(
        {
            "framework": "BRSR",
            "question_key": {"$in": ["brsr_a_employees_workers", "brsr_a_differently_abled"]},
            "is_active": {"$ne": False},
        },
        {"_id": 0, "id": 1, "kpi_id": 1, "source_kpi_ids": 1, "question_key": 1, "answer_path": 1},
    ).to_list(200)
    stale_ids = [
        mapping["id"] for mapping in existing_mappings
        if (mapping.get("kpi_id"), mapping.get("question_key"), mapping.get("answer_path")) not in valid_destinations
    ]
    if not stale_ids:
        return 0
    result = await db.kpi_framework_mappings.update_many(
        {"id": {"$in": stale_ids}},
        {"$set": {
            "is_active": False,
            "mapping_status": "superseded_by_canonical_section_a_cell_mapping",
            "mapping_role": "supporting_source",
            "updated_at": now,
        }},
    )
    return result.modified_count


async def run() -> Dict[str, int]:
    now = datetime.now(timezone.utc).isoformat()
    definitions = await _load_definitions()
    paths_by_question: Dict[str, List[str]] = {}

    for mapping in SECTION_A_WORKFORCE_CELL_MAPPINGS:
        await upsert_mapping(
            definitions[mapping["metric_name"]], mapping["question_key"], mapping["answer_path"], mapping["reference"], now,
            "response_period_document",
        )
        paths_by_question.setdefault(mapping["question_key"], []).append(mapping["answer_path"])

    for question_key, answer_paths in paths_by_question.items():
        await db.esg_question_configs.update_one(
            {"question_key": question_key},
            {"$addToSet": {"answer_paths": {"$each": answer_paths}}, "$set": {"updated_at": now}},
        )

    retired = await _retire_noncanonical_mappings(now)
    return {"direct_cell_mappings": len(SECTION_A_WORKFORCE_CELL_MAPPINGS), "retired_stale_mappings": retired}


if __name__ == "__main__":
    print(asyncio.run(run()))