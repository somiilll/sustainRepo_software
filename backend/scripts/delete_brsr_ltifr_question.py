"""Delete the standalone BRSR LTIFR question (config + saved responses), with a JSON backup first."""
import asyncio
import json
import os
from datetime import datetime, timezone
from shared.database.mongo import db

QUESTION_KEY = "ltifr_employees_workers"
BACKUP_DIR = "/app/backups"


async def main():
    configs = await db.esg_question_configs.find({"question_key": QUESTION_KEY}, {"_id": 0}).to_list(None)
    responses = await db.organization_esg_responses.find({"question_key": QUESTION_KEY}, {"_id": 0}).to_list(None)
    os.makedirs(BACKUP_DIR, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")
    path = f"{BACKUP_DIR}/brsr_ltifr_question_{stamp}.json"
    with open(path, "w") as f:
        json.dump({"configs": configs, "responses": responses}, f, default=str)
    cfg = await db.esg_question_configs.delete_many({"question_key": QUESTION_KEY})
    resp = await db.organization_esg_responses.delete_many({"question_key": QUESTION_KEY})
    print(f"backup={path} configs_deleted={cfg.deleted_count} responses_deleted={resp.deleted_count}")


if __name__ == "__main__":
    asyncio.run(main())
