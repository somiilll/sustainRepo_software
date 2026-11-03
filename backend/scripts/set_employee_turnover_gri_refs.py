"""Employee Turnover: GRI 401-1-b only on turnover rate KPIs and employees-leaving KPIs (Female/Male/Total and age totals); all other KPIs/fields in the subcategory lose GRI refs (idempotent, backs up first)."""
import asyncio
import json
import os
from datetime import datetime, timezone

from shared.database.mongo import db

BACKUP_DIR = "/app/backups"
SUB = "Employee Turnover"
GRI = "401-1-b"
AGES = ["Under 30", "30-50", "Over 50"]
KEEP_NAMES = {
    *(f"Employee Turnover Rate ({x})" for x in ["Female", "Male", "Total", *AGES]),
    "Employee Turnover - Employees leaving (Total)",
    "Employee Turnover - Employees leaving (Total) (Female)",
    "Employee Turnover - Employees leaving (Total) (Male)",
    *(f"Employee Turnover - Employees leaving ({x} age)" for x in AGES),
}
KEEP_FIELDS = {
    "female_employees_who_left_during_the_reporting_period", "male_employees_who_left_during_the_reporting_period",
    "employees_who_left_during_the_reporting_period", "emp_to_age_u30_total", "emp_to_age_3050_total", "emp_to_age_o50_total",
}


async def main():
    kpis = await db.esg_kpi_definitions.find({"category_name": "Employees/Worker", "subcategory": SUB}).to_list(None)
    category = await db.esg_record_categories.find_one({"category": "Employees/Worker", "subcategory": SUB})
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")
    os.makedirs(BACKUP_DIR, exist_ok=True)
    path = f"{BACKUP_DIR}/employee_turnover_gri_{stamp}.json"
    with open(path, "w") as file:
        json.dump({"kpis": [{k: v for k, v in kpi.items() if k != "_id"} for kpi in kpis],
                   "fields": category["fields"]}, file, default=str)

    kept = 0
    for kpi in kpis:
        refs = [r for r in kpi.get("framework_references") or [] if r.get("framework") != "GRI"]
        if kpi["metric_name"] in KEEP_NAMES:
            refs.insert(0, {"framework": "GRI", "reference": GRI, "question_key": "gri_401_1_b", "answer_path": None, "reference_type": "exact"})
            kept += 1
        await db.esg_kpi_definitions.update_one(
            {"id": kpi["id"]},
            {"$set": {"framework_references": refs, "gri_disclosure": GRI if kpi["metric_name"] in KEEP_NAMES else None}})
    for field in category["fields"]:
        if field.get("gri_disclosure") or field["field_key"] in KEEP_FIELDS:
            field["gri_disclosure"] = GRI if field["field_key"] in KEEP_FIELDS else None
    await db.esg_record_categories.update_one({"_id": category["_id"]}, {"$set": {"fields": category["fields"]}})
    print(f"backup={path} kpis={len(kpis)} kept_with_gri={kept}/{len(KEEP_NAMES)}")


if __name__ == "__main__":
    asyncio.run(main())
