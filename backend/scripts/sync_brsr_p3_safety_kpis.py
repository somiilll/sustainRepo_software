"""Create P3-E11 / P3-L3 derived safety KPIs (LTIFR etc.) and exact BRSR mappings. Backs up first; idempotent."""
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from shared.database.mongo import db
from scripts.sync_brsr_derived_reporting_kpis import BACKUP_DIR, derived_common, upsert_definition, upsert_mapping

INC = "ENV_HEALTH & SAFETY_HEALTH_SAFETY_INCIDENTS_"
REHAB = "ENV_HEALTH & SAFETY_REHABILITATION_AFTER_SERIOUS_INJURY_FATALITY_REHABILITATED_"
GROUPS = (("Employees", "EMP", "employees"), ("Workers", "WRK", "workers"))
COUNT = {"default_unit": "count", "supported_units": ["count"], "allow_unit_conversion": False}
LTIFR_UNIT = {"default_unit": "per 1,000,000 hours", "supported_units": ["per 1,000,000 hours"], "allow_unit_conversion": False}


async def by_code(code: str) -> Dict[str, Any]:
    definition = await db.esg_kpi_definitions.find_one({"metric_code": code, "status": {"$ne": "archived"}}, {"_id": 0})
    if not definition:
        raise RuntimeError(f"Missing KPI Definition: {code}")
    return definition


def composite(common: Dict[str, Any], operation: str, sources: list, **extra: Any) -> Dict[str, Any]:
    ids = [s["id"] for s in sources]
    return {**common, "source_type": "composite", "source_config": {"composite": {"operation": operation, "source_kpi_ids": ids, **extra}},
            "value_field": "", "aggregation_type": "formula" if operation != "sum" else "sum",
            "formula_config": None if operation == "sum" else {"formula_type": "ratio", "dependencies": ids, **extra.pop("formula", {})}}


async def run() -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = now.replace(":", "").replace("+", "_")
    backup = BACKUP_DIR / f"brsr_p3_safety_sync_{stamp}.json"
    backup.write_text(json.dumps({
        "definitions": await db.esg_kpi_definitions.find({}, {"_id": 0}).to_list(20000),
        "mappings": await db.kpi_framework_mappings.find({"framework": "BRSR"}, {"_id": 0}).to_list(20000),
    }, default=str, indent=2), encoding="utf-8")

    e11 = derived_common("Health & Safety", "P3-E11 Reporting", "P3-E11", COUNT)
    l3 = derived_common("Health & Safety", "P3-L3 Reporting", "P3-L3", COUNT)
    ltifr_common = derived_common("Health & Safety", "P3-E11 Reporting", "P3-E11", LTIFR_UNIT)
    count = 0
    for label, prefix, row in GROUPS:
        lost = await by_code(f"{INC}{prefix}_LOST_TIME")
        hours = await by_code(f"{INC}{prefix}_HOURS")
        injuries = await by_code(f"{INC}{prefix}_INJURIES")
        fatalities = await by_code(f"{INC}{prefix}_FATALITIES")
        high = await by_code(f"{INC}{prefix}_HIGH_CONSEQUENCE")
        ill = await by_code(f"{INC}{prefix}_ILL_HEALTH")
        rehab = await by_code(f"{REHAB}{label.upper()}")

        ltifr = await upsert_definition(f"P3-E11 LTIFR - {label}", {
            **composite(ltifr_common, "ratio_scaled", [lost, hours], scale=1000000),
            "formula_config": {"formula_type": "ratio", "dependencies": [lost["id"], hours["id"]],
                               "formula_definition": "lost_time_injuries / hours_worked * 1000000"},
            "dimensions": ["organization"], "metadata": {"person_type": label, "scale": 1000000},
        }, now)
        high_total = await upsert_definition(f"P3-E11 High consequence injury or ill-health (excl. fatalities) - {label}", {
            **composite(e11, "sum", [high, ill]), "dimensions": ["organization"],
            "metadata": {"person_type": label, "formula": "high-consequence injuries + recordable ill-health cases"},
        }, now)
        affected = await upsert_definition(f"P3-L3 Total affected employees/workers - {label}", {
            **composite(l3, "sum", [high, ill, fatalities]), "dimensions": ["organization"],
            "metadata": {"person_type": label, "formula": "high-consequence injuries + ill-health cases + fatalities"},
        }, now)

        await upsert_mapping(ltifr, "p3_safety_incidents", f"rows.ltifr_{row}", "P3-E11", now, "reporting_year_filter")
        await upsert_mapping(injuries, "p3_safety_incidents", f"rows.recordable_injuries_{row}", "P3-E11", now, "reporting_year_filter")
        await upsert_mapping(fatalities, "p3_safety_incidents", f"rows.fatalities_{row}", "P3-E11", now, "reporting_year_filter")
        await upsert_mapping(high_total, "p3_safety_incidents", f"rows.high_consequence_{row}", "P3-E11", now, "reporting_year_filter")
        await upsert_mapping(affected, "p3_rehabilitation_injured", f"rows.{row}.affected", "P3-L3", now, "reporting_year_filter")
        await upsert_mapping(rehab, "p3_rehabilitation_injured", f"rows.{row}.rehabilitated", "P3-L3", now, "reporting_year_filter")
        count += 6
    return {"mappings": count, "backup": str(backup)}


if __name__ == "__main__":
    print(json.dumps(asyncio.run(run()), indent=2))
