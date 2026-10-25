"""Allow one KPI/reference to map to multiple distinct BRSR destinations."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from shared.database.mongo import db


async def migrate() -> dict:
    indexes = await db.kpi_framework_mappings.index_information()
    old_index = "kpi_id_1_framework_1_reference_1"
    if old_index in indexes:
        await db.kpi_framework_mappings.drop_index(old_index)
    await db.kpi_framework_mappings.create_index(
        [("kpi_id", 1), ("framework", 1), ("reference", 1)],
        name="kpi_framework_reference_lookup",
    )
    await db.kpi_framework_mappings.create_index(
        [("kpi_id", 1), ("framework", 1), ("question_key", 1), ("answer_path", 1)],
        name="unique_active_kpi_framework_destination",
        unique=True,
        partialFilterExpression={
            "is_active": True,
            "question_key": {"$type": "string"},
            "answer_path": {"$type": "string"},
        },
    )
    return {"dropped": old_index in indexes, "indexes": list((await db.kpi_framework_mappings.index_information()).keys())}


if __name__ == "__main__":
    print(asyncio.run(migrate()))