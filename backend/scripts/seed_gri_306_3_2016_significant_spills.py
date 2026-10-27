"""Seed GRI 306-3 (2016) Significant spills disclosure (idempotent)."""
import asyncio
from datetime import datetime, timezone
from shared.database.mongo import db

DISCLOSURE_ID = "306-3 (2016)"
DISCLOSURE_NAME = "Significant spills"

QUESTIONS = [
    {
        "question_key": "gri_306_3_2016_a",
        "question_order": 1,
        "description": "Total number and total volume of recorded significant spills.",
        "sub_questions": [],
    },
    {
        "question_key": "gri_306_3_2016_b",
        "question_order": 2,
        "description": "The following additional information for each spill that was reported in the organization's financial statements:",
        "sub_questions": [
            {"sub_key": "i", "label": "i. Location of spill"},
            {"sub_key": "ii", "label": "ii. Volume of spill"},
            {
                "sub_key": "iii",
                "label": "iii. Material of spill, categorized by: oil spills (soil or water surfaces), fuel spills (soil or water surfaces), "
                "spills of wastes (soil or water surfaces), spills of chemicals (mostly soil or water surfaces), and other (to be specified by the organization)",
            },
        ],
    },
    {"question_key": "gri_306_3_2016_c", "question_order": 3, "description": "Impacts of significant spills.", "sub_questions": []},
]


async def main():
    now = datetime.now(timezone.utc)
    template = await db.esg_question_configs.find_one({"question_key": "gri_306_2_a"}, {"_id": 0})
    if not template:
        raise SystemExit("Template question gri_306_2_a not found")
    for question in QUESTIONS:
        doc = {
            **{k: v for k, v in template.items() if k not in ("id", "created_at")},
            **question,
            "disclosure_id": DISCLOSURE_ID,
            "disclosure_name": DISCLOSURE_NAME,
            "updated_at": now,
        }
        await db.esg_question_configs.update_one(
            {"question_key": question["question_key"]},
            {"$set": doc, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        print("upserted", question["question_key"])
    print("done")


if __name__ == "__main__":
    asyncio.run(main())
