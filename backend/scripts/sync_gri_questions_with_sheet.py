"""Align GRI question configs with GRI_Question_Framework.xlsx: rename, replace and add questions (idempotent). Run: python -m scripts.sync_gri_questions_with_sheet"""
import asyncio
import os
import re
import sys
from datetime import datetime, timezone

import openpyxl

from shared.database.mongo import db

SHEET_PATH = os.path.join(os.path.dirname(__file__), "data", "GRI_Question_Framework.xlsx")
RENAMES = {
    "gri_101_1_q1": "gri_101_1_a", "gri_101_1_q2": "gri_101_1_b", "gri_101_1_q3": "gri_101_1_c", "gri_102_3_k": "gri_102_3_j",
    "gri_102_10_a": "gri_102_10_b", "gri_102_10_b": "gri_102_10_c", "gri_102_2_a": "gri_102_2_b", "gri_305_3_b": "gri_305_3_d",
    "gri_305_5_b": "gri_305_5_d", "gri_403_2_a": "gri_403_2_b", "gri_403_2_b": "gri_403_2_c", "gri_403_2_c": "gri_403_2_d",
    "gri_403_8_a": "gri_403_8_b", "gri_408_1_a": "gri_408_1_b", "gri_408_1_b": "gri_408_1_c", "gri_418_1_a": "gri_418_1_b", "gri_418_1_b": "gri_418_1_c",
}
REPLACED = ["gri_102_1_a", "gri_102_1_b", "gri_102_2_b", "gri_102_3_e", "gri_102_9_b", "gri_102_10_c", "gri_101_5_a", "gri_101_5_c", "gri_101_5_d",
            "gri_403_9_a", "gri_403_9_b", "gri_403_9_c", "gri_403_10_a", "gri_403_10_b", "gri_406_1_b", "gri_411_1_b"]
ALIGN_TEXT = ["gri_102_4_b", "gri_102_5_b", "gri_102_6_b", "gri_102_7_b", "gri_404_1_a", "gri_405_1_a", "gri_405_1_b", "gri_407_1_a", "gri_413_1_a"]
DROP_SUB_QUESTIONS = {"gri_102_4_b", "gri_102_5_b", "gri_102_6_b", "gri_102_7_b"}
MIGRATION = "gri_sheet_sync_v1"
REMOVED_NOT_IN_SHEET = ["gri_413_1_b", "gri_413_2_b", "gri_414_1_b"]
ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii"]
MARK = re.compile(r"(?:(?<=^)|(?<=[\s:;,(]))(i{1,3}|iv|vi{0,3}|ix|x)\.\s+(?=\S)", re.I)
SHEETS = ["100 series", "200 series", "300 series", "400 series"]


def load_sheet():
    items, did, topic = [], None, None
    for name in SHEETS:
        for row in openpyxl.load_workbook(SHEET_PATH, data_only=True)[name].iter_rows(min_row=5, values_only=True):
            if row[0]:
                topic = str(row[0]).strip()
            if row[1]:
                did, title = str(row[1]).strip(), str(row[2] or "").strip()
            if did and row[3] and str(row[3]).strip() and ":" not in did:
                items.append({"did": did, "title": title, "topic": topic, "letter": re.sub(r"[^a-z0-9]", "", str(row[3]).strip().lower()),
                              "text": re.sub(r"\s+", " ", str(row[4] or "")).strip()})
    return items


def parse_parts(text):
    seq, want = [], 0
    for marker in MARK.finditer(text):
        token = marker.group(1).lower()
        if (want == 0 and token == "i") or (want > 0 and token in ROMAN):
            seq.append(marker)
            want = 1
    if len(seq) < 2:
        return None
    parts = []
    for n, marker in enumerate(seq):
        end = seq[n + 1].start() if n + 1 < len(seq) else len(text)
        parts.append(re.sub(r"[;,.]?\s*(and|or)?\s*$", "", text[marker.start():end].strip()))
    return text[:seq[0].start()].strip(), parts


def clean(text):
    text = text.strip().rstrip(";.").strip()
    return text[:1].upper() + text[1:]


async def data_collections():
    skip = {"esg_question_configs", "kpi_framework_mappings", "esg_kpi_definitions"}
    return [c for c in await db.list_collection_names() if c not in skip]


async def main():
    now = datetime.now(timezone.utc).isoformat()
    force = "--force" in sys.argv
    collections = await data_collections()
    if await db.script_migrations.find_one({"name": MIGRATION}):
        print("structural renames/replacements already applied; skipping")
        deleted = 0
    else:
        risky = []
        for key in list(RENAMES) + REPLACED:
            for coll in collections:
                if key in REPLACED and await db[coll].count_documents({"question_key": key}):
                    risky.append((key, coll))
        if risky and not force:
            print("saved answers exist under questions that would be replaced; rerun with --force after review:", risky)
            return
        for old in RENAMES:
            for coll in ["esg_question_configs", *collections]:
                await db[coll].update_many({"question_key": old}, {"$set": {"question_key": f"tmp:{old}"}})
        deleted = (await db.esg_question_configs.delete_many({"question_key": {"$in": REPLACED}})).deleted_count
        for old, new in RENAMES.items():
            for coll in ["esg_question_configs", *collections]:
                await db[coll].update_many({"question_key": f"tmp:{old}"}, {"$set": {"question_key": new}})
            await db.esg_question_configs.update_one({"question_key": new}, {"$set": {"updated_at": now}})
        await db.script_migrations.insert_one({"name": MIGRATION, "applied_at": now})
    created = 0
    for index, item in enumerate(load_sheet()):
        key = f"gri_{item['did'].replace('-', '_')}_{item['letter']}"
        siblings = await db.esg_question_configs.find({"framework": "GRI", "disclosure_id": item["did"]}, {"_id": 0}).to_list(None)
        if not siblings:
            siblings = await db.esg_question_configs.find({"framework": "GRI", "question_key": {"$regex": f"^gri_{item['did'].split('-')[0]}_"}}, {"_id": 0}).to_list(None)
        order = ord(item["letter"][0]) - 96
        existing = next((s for s in siblings if s["question_key"] == key), None)
        if existing:
            await db.esg_question_configs.update_one({"question_key": key}, {"$set": {"question_order": order}})
            continue
        template = siblings[0] if siblings else {"framework": "GRI", "section": "environment", "response_mode": "single", "validation_rules": {"max_length": 10000}}
        doc = {k: v for k, v in template.items() if k not in {"question_key", "static_note", "sub_questions", "created_at", "updated_at", "id", "description"}}
        doc.update({"question_key": key, "disclosure_id": item["did"], "disclosure_name": item["title"] or template.get("disclosure_name"), "description": clean(item["text"]),
                    "input_type": "textarea", "is_required": False, "question_order": order, "created_at": now, "updated_at": now})
        await db.esg_question_configs.insert_one(doc)
        created += 1
    by_key = {f"gri_{i['did'].replace('-', '_')}_{i['letter']}": i for i in load_sheet()}
    converted = 0
    for key, item in by_key.items():
        parsed = parse_parts(item["text"])
        config = await db.esg_question_configs.find_one({"question_key": key}, {"_id": 0, "description": 1, "sub_questions": 1})
        if not parsed or not config or config.get("sub_questions"):
            continue
        lead, parts = parsed
        keep_existing = lead.lower().startswith("note") or not lead
        await db.esg_question_configs.update_one({"question_key": key}, {"$set": {
            "description": config["description"] if keep_existing else clean(lead), "input_type": "textarea", "updated_at": now,
            "sub_questions": [{"sub_key": ROMAN[n], "label": part} for n, part in enumerate(parts)]}})
        converted += 1
    for key in ALIGN_TEXT:
        if parse_parts(by_key[key]["text"]):
            continue
        update = {"$set": {"description": clean(by_key[key]["text"]), "updated_at": now}}
        if key in DROP_SUB_QUESTIONS:
            update["$set"]["input_type"] = "textarea"
            update["$unset"] = {"sub_questions": ""}
        await db.esg_question_configs.update_one({"question_key": key}, update)
    removed = 0
    for key in REMOVED_NOT_IN_SHEET:
        if not any([await db[coll].count_documents({"question_key": key}) for coll in collections]):
            removed += (await db.esg_question_configs.delete_one({"question_key": key})).deleted_count
    print(f"renamed={len(RENAMES)} deleted={deleted} created={created} sub_part_questions={converted} removed_not_in_sheet={removed}")


if __name__ == "__main__":
    asyncio.run(main())
