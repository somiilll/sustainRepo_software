"""New Employees/Worker: GRI refs only on the listed KPIs; all other KPIs/fields lose GRI (idempotent, backs up first)."""
import asyncio
import json
import os
from datetime import datetime, timezone

from shared.database.mongo import db

BACKUP_DIR = "/app/backups"
SUB = "New Employees/Worker"
WANTED = {
    **{f"{SUB} - {who} - {age}": ["401-1-a"] for who in ("Employees",) for age in ("Under 30", "30-50", "Over 50")},
    "No. of workers hired": ["102-3-e"],
    f"{SUB} - Employees": ["401-1-a"],
    f"{SUB} - Employees (Female)": ["401-1-a", "102-3-a-i"],
    f"{SUB} - Employees (Male)": ["401-1-a", "102-3-a-i"],
    f"{SUB} - Employees - Permanent": ["401-1-a", "102-3-a-ii"],
    f"{SUB} - Employees - Other than permanent": ["401-1-a", "102-3-a-ii"],
    f"{SUB} - Workers (Female)": ["102-3-e"],
    f"{SUB} - Workers (Male)": ["102-3-e"],
}


def _ref(code: str) -> dict:
    return {"framework": "GRI", "reference": code, "question_key": "gri_" + code.replace("-", "_"), "answer_path": None, "reference_type": "exact"}


async def main():
    kpis = await db.esg_kpi_definitions.find({"subcategory": SUB}).to_list(None)
    category = await db.esg_record_categories.find_one({"subcategory": SUB})
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")
    os.makedirs(BACKUP_DIR, exist_ok=True)
    path = f"{BACKUP_DIR}/new_hires_gri_{stamp}.json"
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
        if value_field and kpi["metric_name"] != "No. of workers hired" and (gri or value_field not in field_gri):
            field_gri[value_field] = gri
    for field in category["fields"]:
        if field["field_key"] in field_gri:
            field["gri_disclosure"] = field_gri[field["field_key"]]
    await db.esg_record_categories.update_one({"_id": category["_id"]}, {"$set": {"fields": category["fields"]}})
    print(f"backup={path} kpis={len(kpis)} matched={matched}/{len(WANTED)}")


if __name__ == "__main__":
    asyncio.run(main())
