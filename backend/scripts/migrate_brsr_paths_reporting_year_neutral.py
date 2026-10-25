"""Normalize BRSR mapping destinations so reporting year is runtime context, not mapping metadata."""
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from modules.brsr_report.mapping_excel import logical_answer_path
from shared.database.mongo import db


SCALAR_TYPES = {"text", "number", "email", "url", "radio", "currency", "textarea"}


async def migrate() -> dict:
    mappings = await db.kpi_framework_mappings.find(
        {"framework": "BRSR", "is_active": {"$ne": False}, "answer_path": {"$nin": [None, ""]}}, {"_id": 0}
    ).to_list(10000)
    configs = await db.esg_question_configs.find({"frameworks": "BRSR"}, {"_id": 0}).to_list(2000)
    config_by_key = {config["question_key"]: config for config in configs}
    groups = {}
    for mapping in mappings:
        logical_path = logical_answer_path(mapping.get("answer_path"))
        key = (mapping.get("kpi_id"), mapping.get("framework"), mapping.get("question_key"), logical_path)
        groups.setdefault(key, []).append(mapping)

    now = datetime.now(timezone.utc).isoformat()
    updated = 0
    superseded = 0
    for (_kpi_id, _framework, question_key, logical_path), group in groups.items():
        group.sort(key=lambda item: (item.get("mapping_status") != "exact_destination", item.get("created_at") or ""))
        keeper = group[0]
        for duplicate in group[1:]:
            await db.kpi_framework_mappings.update_one(
                {"id": duplicate["id"]},
                {"$set": {"is_active": False, "mapping_status": "superseded_by_reporting_year_neutral_mapping",
                           "superseded_by_mapping_id": keeper["id"], "updated_at": now}},
            )
            superseded += 1
        config = config_by_key.get(question_key) or {}
        strategy = "response_period_document" if config.get("section") in {"section_a", "section_b"} or config.get("type") in SCALAR_TYPES else "reporting_year_filter"
        await db.kpi_framework_mappings.update_one(
            {"id": keeper["id"]},
            {"$set": {"answer_path": logical_path, "period_column_strategy": strategy,
                       "reporting_period_source": "runtime_filter", "updated_at": now},
             "$unset": {"period_columns": ""}},
        )
        updated += 1
    return {"updated": updated, "superseded": superseded}


if __name__ == "__main__":
    print(asyncio.run(migrate()))