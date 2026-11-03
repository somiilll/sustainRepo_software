"""Add GRI 2 (General Disclosures 2021) questions from the sheet as the 'general' section (idempotent). Run: python -m scripts.add_gri2_general_disclosures"""
import asyncio
import os
import re
from datetime import datetime, timezone

import openpyxl

from scripts.sync_gri_questions_with_sheet import ROMAN, clean, parse_parts
from shared.database.mongo import db

SHEET_PATH = os.path.join(os.path.dirname(__file__), "data", "GRI_2_General_Disclosures.xlsx")


def load_items():
    items, topic, did, title = [], None, None, None
    for row in openpyxl.load_workbook(SHEET_PATH, data_only=True)["2 series"].iter_rows(min_row=5, values_only=True):
        if row[0]:
            topic = str(row[0]).strip()
        if row[1]:
            did, title = str(row[1]).strip(), str(row[2] or "").strip()
        if did and row[3] and row[4]:
            items.append({"did": did, "title": title, "topic": topic, "letter": re.sub(r"[^a-z0-9]", "", str(row[3]).strip().lower()),
                          "text": re.sub(r"\s+", " ", str(row[4])).strip()})
    return items


async def main():
    now = datetime.now(timezone.utc).isoformat()
    created = updated = 0
    for item in load_items():
        key = f"gri_{item['did'].replace('-', '_')}_{item['letter']}"
        doc = {"framework": "GRI", "section": "general", "disclosure_id": item["did"], "disclosure_name": item["title"],
               "material_topic": item["topic"], "material_topic_id": "2", "question_order": ord(item["letter"][0]) - 96,
               "description": clean(item["text"]), "input_type": "textarea", "response_mode": "single", "is_required": False,
               "validation_rules": {"max_length": 10000}}
        parsed = parse_parts(item["text"])
        unset = {} if parsed else {"sub_questions": ""}
        if parsed:
            lead, parts = parsed
            doc["description"] = clean(lead) if lead else doc["description"]
            doc["input_type"] = "sub_questions"
            doc["sub_questions"] = [{"sub_key": ROMAN[n], "label": part} for n, part in enumerate(parts)]
        update = {"$set": {**doc, "updated_at": now}, "$setOnInsert": {"created_at": now}}
        if unset:
            update["$unset"] = unset
        result = await db.esg_question_configs.update_one({"question_key": key}, update, upsert=True)
        created += bool(result.upserted_id)
        updated += not result.upserted_id
    print(f"created={created} updated={updated}")


if __name__ == "__main__":
    asyncio.run(main())
