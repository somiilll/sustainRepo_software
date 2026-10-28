"""Remove GRI 205-3 from Internal Complaints disciplinary KPIs; set GRI 405-1-a-i on BoD total Female/Male; drop GRI on BoD age/minority/vulnerable gendered KPIs (idempotent, backs up first)."""
import asyncio
import json
import os
from datetime import datetime, timezone

from shared.database.mongo import db

BACKUP_DIR = "/app/backups"
BOD = "Board of Directors Diversity"
SET_GRI = {
    f"{BOD} - Board of Directors (Total) (Female)": "no_of_female",
    f"{BOD} - Board of Directors (Total) (Male)": "no_of_male",
}
NEW_GRI = "405-1-a-i"
DROP_NAMES = [
    f"{BOD} - {group} ({sex})"
    for group in ["Under 30", "30-50", "Over 50", "of which: Minority-group members", "of which: Vulnerable-group members"]
    for sex in ["Female", "Male"]
]


def _non_gri(kpi: dict) -> list:
    return [ref for ref in kpi.get("framework_references", []) if ref.get("framework") != "GRI"]


async def _set_category_gri(subcategory: str, new_by_key: dict) -> None:
    async for category in db.esg_record_categories.find({"subcategory": subcategory}):
        fields = category.get("fields", [])
        for field in fields:
            if field["field_key"] in new_by_key:
                field["gri_disclosure"] = new_by_key[field["field_key"]]
        await db.esg_record_categories.update_one({"_id": category["_id"]}, {"$set": {"fields": fields}})


async def main():
    internal = await db.esg_kpi_definitions.find({"subcategory": "Internal Complaints", "gri_disclosure": "205-3"}).to_list(None)
    set_kpis = await db.esg_kpi_definitions.find({"metric_name": {"$in": list(SET_GRI)}}).to_list(None)
    drop_kpis = await db.esg_kpi_definitions.find({"metric_name": {"$in": DROP_NAMES}}).to_list(None)
    categories = await db.esg_record_categories.find({"subcategory": {"$in": ["Internal Complaints", BOD]}}, {"_id": 0}).to_list(None)

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")
    os.makedirs(BACKUP_DIR, exist_ok=True)
    path = f"{BACKUP_DIR}/internal_bod_gri_cleanup_{stamp}.json"
    strip = lambda items: [{k: v for k, v in i.items() if k != "_id"} for i in items]
    with open(path, "w") as file:
        json.dump({"kpis": strip(internal + set_kpis + drop_kpis), "categories": categories}, file, default=str)

    for kpi in internal + drop_kpis:
        await db.esg_kpi_definitions.update_one(
            {"id": kpi["id"]}, {"$set": {"framework_references": _non_gri(kpi), "gri_disclosure": None}}
        )
    for kpi in set_kpis:
        ref = {"framework": "GRI", "reference": NEW_GRI, "question_key": "gri_405_1_a_i", "answer_path": None, "reference_type": "exact"}
        await db.esg_kpi_definitions.update_one(
            {"id": kpi["id"]}, {"$set": {"framework_references": [ref, *_non_gri(kpi)], "gri_disclosure": NEW_GRI}}
        )

    await _set_category_gri("Internal Complaints", {f: None for f in ["disciplinary_action_bod", "disciplinary_action_kmps", "disciplinary_action_employees", "disciplinary_action_workers"]})
    drop_keys = {kpi["source_config"]["records"]["value_field"]: None for kpi in drop_kpis}
    await _set_category_gri(BOD, {**drop_keys, **{key: NEW_GRI for key in SET_GRI.values()}})
    print(f"backup={path} internal={len(internal)} set={len(set_kpis)} dropped={len(drop_kpis)}")


if __name__ == "__main__":
    asyncio.run(main())
