"""Employee Turnover: add age-group (Under 30 / 30-50 / Over 50) start, end and leaving entry fields + KPIs and age-wise turnover rate KPIs (idempotent, backs up first)."""
import asyncio
import copy
import json
import os
import sys
import uuid
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from shared.database.mongo import db
from scripts.seed_water_withdrawal_discharge_recycle import sync_workforce

BACKUP_DIR = "/app/backups"
SUB = "Employee Turnover"
AGES = [("u30", "Under 30"), ("3050", "30-50"), ("o50", "Over 50")]
FORMULA = "({left} / (({start} + {end}) / 2)) * 100"


async def _rate_kpi(template: dict, code: str, age: str, label: str, now: str) -> str:
    left, start, end = f"emp_to_age_{age}_total", f"emp_to_start_age_{age}_total", f"emp_to_end_age_{age}_total"
    deps = []
    for field in (left, start, end):
        kpi = await db.esg_kpi_definitions.find_one({"category_name": "Employees/Worker", "subcategory": SUB, "value_field": field}, {"metric_code": 1})
        deps.append(kpi["metric_code"])
    name = f"Employee Turnover Rate ({label})"
    fields = {
        "metric_name": name, "short_name": name, "metric_code": f"SOC_EMPLOYEE_TURNOVER_RATE_{code}",
        "description": f"Calculated turnover rate for employees aged {label}: employees leaving divided by the average of start-of-year and end-of-year headcount, multiplied by 100.",
        "brsr_reference": None, "gri_disclosure": "401-1-b",
        "framework_references": [{"framework": "GRI", "reference": "401-1-b", "reference_type": "exact"}],
        "source_config": {"calculated": {"input_fields": [left, start, end]}},
        "value_field": f"employee_turnover_rate_{age}",
        "formula_config": {"formula_type": "expression", "formula_definition": FORMULA.format(left=left, start=start, end=end), "dependencies": deps},
        "display_config": {**template["display_config"], "display_name": name, "short_name": name},
        "metadata": {"calculation_scope": "per_record_then_period_aggregate", "period_aggregation": "average"},
        "updated_at": now,
    }
    existing = await db.esg_kpi_definitions.find_one({"metric_name": name}, {"id": 1})
    if existing:
        await db.esg_kpi_definitions.update_one({"id": existing["id"]}, {"$set": fields})
        return "updated"
    doc = {k: v for k, v in copy.deepcopy(template).items() if k != "_id"}
    doc.update(fields)
    doc.update({"id": str(uuid.uuid4()), "created_at": now, "created_by_name": "turnover age-group seed"})
    await db.esg_kpi_definitions.insert_one(doc)
    return "created"


async def main():
    now = datetime.now(timezone.utc).isoformat()
    category = await db.esg_record_categories.find_one({"category": "Employees/Worker", "subcategory": SUB}, {"_id": 0})
    kpis = await db.esg_kpi_definitions.find({"category_name": "Employees/Worker", "subcategory": SUB}, {"_id": 0}).to_list(None)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")
    os.makedirs(BACKUP_DIR, exist_ok=True)
    path = f"{BACKUP_DIR}/employee_turnover_age_groups_{stamp}.json"
    with open(path, "w") as file:
        json.dump({"category": category, "kpis": kpis}, file, default=str)

    await sync_workforce(db, now, only={SUB})

    template = await db.esg_kpi_definitions.find_one({"metric_name": "Employee Turnover Rate (Total)"}, {"_id": 0})
    results = [await _rate_kpi(template, age.upper(), age, label, now) for age, label in AGES]
    print(f"backup={path} rate_kpis={results}")


if __name__ == "__main__":
    asyncio.run(main())
