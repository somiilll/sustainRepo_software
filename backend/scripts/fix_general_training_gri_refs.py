"""General Training: GRI refs only on the 8 listed KPIs; all other KPIs/fields lose GRI (idempotent, backs up first)."""
import asyncio
import json
import os
from datetime import datetime, timezone

from shared.database.mongo import db

BACKUP_DIR = "/app/backups"
SUB = "General Training"
WANTED = {
    **{f"Trainings - Anti-corruption - {x}": ["205-2-e"] for x in ("Female Attendees", "Male Attendees", "Total Attendees")},
    "Average Training Hours per Employee - Female": ["404-1-a-i"],
    "Average Training Hours per Employee - Male": ["404-1-a-i"],
    "P3-E8 Training - Employees - Skill Upgradation - Female": ["102-3-d-i"],
    "P3-E8 Training - Employees - Skill Upgradation - Male": ["102-3-d-i"],
    "P3-E8 Training - Employees - Skill Upgradation - Total": ["102-3-d"],
}


def _ref(code: str) -> dict:
    return {"framework": "GRI", "reference": code, "question_key": "gri_" + code.replace("-", "_"), "answer_path": None, "reference_type": "exact"}


async def main():
    kpis = await db.esg_kpi_definitions.find({"subcategory": SUB}).to_list(None)
    category = await db.esg_record_categories.find_one({"subcategory": SUB})
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")
    os.makedirs(BACKUP_DIR, exist_ok=True)
    path = f"{BACKUP_DIR}/general_training_gri_{stamp}.json"
    with open(path, "w") as file:
        json.dump({"kpis": [{k: v for k, v in kpi.items() if k != "_id"} for kpi in kpis], "fields": category["fields"]}, file, default=str)

    field_gri, matched = {}, 0
    for kpi in sorted(kpis, key=lambda k: k.get("status") == "active"):
        codes = WANTED.get(kpi["metric_name"], [])
        matched += bool(codes)
        refs = [r for r in kpi.get("framework_references") or [] if r.get("framework") != "GRI"]
        gri = "; ".join(codes) or None
        await db.esg_kpi_definitions.update_one(
            {"id": kpi["id"]}, {"$set": {"framework_references": [_ref(c) for c in codes] + refs, "gri_disclosure": gri}})
        value_field = (kpi.get("source_config") or {}).get("records", {}).get("value_field")
        if value_field and (gri or value_field not in field_gri):
            field_gri[value_field] = gri
    for field in category["fields"]:
        if field["field_key"] in field_gri:
            field["gri_disclosure"] = field_gri[field["field_key"]]
    await db.esg_record_categories.update_one({"_id": category["_id"]}, {"$set": {"fields": category["fields"]}})
    print(f"backup={path} kpis={len(kpis)} matched={matched}/{len(WANTED)}")


if __name__ == "__main__":
    asyncio.run(main())
