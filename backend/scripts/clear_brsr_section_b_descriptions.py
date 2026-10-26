"""Clear three BRSR Section B question descriptions. Backs up first; idempotent."""
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from shared.database.mongo import db

KEYS = ["ngrbc_policy_matrix", "policy_translated_to_procedures", "policy_extend_to_value_chain"]


async def run() -> dict:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    backup = Path("/app/backups") / f"brsr_section_b_descriptions_{stamp}.json"
    backup.parent.mkdir(parents=True, exist_ok=True)
    docs = await db.esg_question_configs.find({"question_key": {"$in": KEYS}}, {"_id": 0}).to_list(50)
    backup.write_text(json.dumps(docs, default=str, indent=2), encoding="utf-8")
    result = await db.esg_question_configs.update_many({"question_key": {"$in": KEYS}}, {"$set": {"description": ""}})
    return {"modified": result.modified_count, "backup": str(backup)}


if __name__ == "__main__":
    print(json.dumps(asyncio.run(run()), indent=2))
