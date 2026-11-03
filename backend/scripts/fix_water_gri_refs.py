"""Water: Consumption source KPIs and Withdrawal 'Others' lose GRI; Discharge keeps GRI only on the listed KPIs (idempotent, backs up first)."""
import asyncio
import json
import os
from datetime import datetime, timezone

from shared.database.mongo import db

BACKUP_DIR = "/app/backups"
CONSUMPTION_REMOVE = {f"Water Consumption - {x}" for x in ("Seawater / Desalinated", "Third-party Water", "Surface Water", "Ground Water")}
WITHDRAWAL_REMOVE = {"Water Withdrawal in Water-stress Areas - Others", "Water Withdrawal - Others"}
DISCHARGE = {
    "Freshwater Discharge (≤1,000 mg/L Total Dissolved Solids)": "303-4-b-i",
    "Incidents of Non-compliance with Discharge Limits": "303-4-d-iii",
    "Other Water Discharge (>1,000 mg/L Total Dissolved Solids)": "303-4-b-ii",
    "Water Discharge (Total)": "303-4-a",
    "Water Discharge to Ground Water": "303-4-a-ii",
    "Water Discharge to Seawater / Desalinated": "303-4-a-iii",
    "Water Discharge to Surface Water": "303-4-a-i",
    "Water Discharge to Third-party Water": "303-4-a-iv",
    "Water-stress Discharge - Freshwater": "303-4-c-i",
    "Water-stress Discharge - Other Water": "303-4-c-ii",
}


def _ref(code: str) -> dict:
    return {"framework": "GRI", "reference": code, "question_key": "gri_" + code.replace("-", "_"), "answer_path": None, "reference_type": "exact"}


async def _apply(sub: str, code_for) -> tuple:
    kpis = await db.esg_kpi_definitions.find({"category_name": "Water", "subcategory": sub}).to_list(None)
    category = await db.esg_record_categories.find_one({"category": "Water", "subcategory": sub})
    snapshot = ([{k: v for k, v in kpi.items() if k != "_id"} for kpi in kpis], category["fields"])
    field_gri = {}
    for kpi in kpis:
        decision = code_for(kpi)
        if decision is False:
            continue
        refs = [r for r in kpi.get("framework_references") or [] if r.get("framework") != "GRI"]
        await db.esg_kpi_definitions.update_one(
            {"id": kpi["id"]}, {"$set": {"framework_references": ([_ref(decision)] if decision else []) + refs, "gri_disclosure": decision}})
        value_field = (kpi.get("source_config") or {}).get("records", {}).get("value_field")
        if value_field:
            field_gri[value_field] = decision
    for field in category["fields"]:
        if field["field_key"] in field_gri:
            field["gri_disclosure"] = field_gri[field["field_key"]]
    await db.esg_record_categories.update_one({"_id": category["_id"]}, {"$set": {"fields": category["fields"]}})
    return snapshot


async def main():
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")
    os.makedirs(BACKUP_DIR, exist_ok=True)
    backup = {
        "Consumption": await _apply("Consumption", lambda k: None if k["metric_name"] in CONSUMPTION_REMOVE else False),
        "Withdrawal": await _apply("Withdrawal", lambda k: None if k["metric_name"] in WITHDRAWAL_REMOVE else False),
        "Discharge": await _apply("Discharge", lambda k: DISCHARGE.get(k["metric_name"])),
    }
    path = f"{BACKUP_DIR}/water_gri_{stamp}.json"
    with open(path, "w") as file:
        json.dump(backup, file, default=str)
    print(f"backup={path}")


if __name__ == "__main__":
    asyncio.run(main())
