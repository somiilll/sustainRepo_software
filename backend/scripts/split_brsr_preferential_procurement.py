"""Split the preferential-procurement follow-ups into two standalone BRSR P8 questions (idempotent)."""
import asyncio
import uuid
from datetime import datetime, timezone
from shared.database.mongo import db

PARENT_KEY = "p8_preferential_procurement"
NEW_QUESTIONS = [
    ("p8_marginalized_groups_procured", "From which marginalized/vulnerable groups do you procure?", "textarea", 1),
    ("p8_marginalized_procurement_pct", "What percentage of total procurement (by value) does it constitute?", "number", 2),
]


async def main():
    parent = await db.esg_question_configs.find_one({"question_key": PARENT_KEY}, {"_id": 0})
    if not parent:
        raise SystemExit("Parent question not found")
    now = datetime.now(timezone.utc).isoformat()
    existing = await db.esg_question_configs.count_documents({"question_key": {"$in": [q[0] for q in NEW_QUESTIONS]}})
    if existing == 0:
        await db.esg_question_configs.update_many(
            {"section": "section_c", "brsr_principle": "P8", "order": {"$gt": parent["order"]}},
            {"$inc": {"order": len(NEW_QUESTIONS)}},
        )
    for key, question, qtype, offset in NEW_QUESTIONS:
        doc = {k: v for k, v in parent.items() if k not in ("id", "conditional_fields", "created_at")}
        doc.update({"question_key": key, "question": question, "type": qtype, "order": parent["order"] + offset, "updated_at": now})
        await db.esg_question_configs.update_one(
            {"question_key": key}, {"$set": doc, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now}}, upsert=True
        )
    await db.esg_question_configs.update_one({"question_key": PARENT_KEY}, {"$set": {"conditional_fields": [], "updated_at": now}})
    print("done")


if __name__ == "__main__":
    asyncio.run(main())
