"""Persist selectable field-level answer paths for every active BRSR question."""
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from modules.brsr_report.mapping_excel import _question_answer_paths
from shared.database.mongo import db


async def sync() -> int:
    configs = await db.esg_question_configs.find(
        {"frameworks": "BRSR", "hidden": {"$ne": True}}, {"_id": 0}
    ).to_list(2000)
    now = datetime.now(timezone.utc).isoformat()
    updated = 0
    for config in configs:
        paths = _question_answer_paths(config, [])
        result = await db.esg_question_configs.update_one(
            {"question_key": config["question_key"]},
            {"$set": {"answer_paths": paths, "answer_paths_updated_at": now, "updated_at": now}},
        )
        updated += result.modified_count
    return updated


if __name__ == "__main__":
    print({"updated": asyncio.run(sync())})