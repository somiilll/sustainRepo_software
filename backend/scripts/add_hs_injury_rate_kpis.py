"""Health & Safety Incidents: add fatality and high-consequence injury rate KPIs per 1,000,000 hours for Employees and Workers (idempotent)."""
import asyncio
import copy
import re
import uuid
from datetime import datetime, timezone

from shared.database.mongo import db

SUB = "Health & Safety Incidents"
RATES = [
    ("Rate of Fatalities as a Result of Work-related Injury", "fatal_injury", "from_injury", "403-9-{w}-i"),
    ("Rate of High-consequence Work-related Injuries (excl. Fatalities)", "high_consequence", "high_consequence", "403-9-{w}-ii"),
]
WHO = [("Employees", "emp", "a"), ("Workers", "wrk", "b")]


def _ref(code: str) -> dict:
    return {"framework": "GRI", "reference": code, "question_key": "gri_" + code.replace("-", "_"), "answer_path": None, "reference_type": "exact"}


async def _kpi_id(value_field: str) -> str:
    kpi = await db.esg_kpi_definitions.find_one({"category_name": "Health & Safety", "subcategory": SUB, "value_field": value_field}, {"id": 1})
    return kpi["id"]


async def main():
    now = datetime.now(timezone.utc).isoformat()
    template = await db.esg_kpi_definitions.find_one({"metric_name": "P3-E11 LTIFR - Employees"}, {"_id": 0})
    created = 0
    for title, stem, _slug, gri in RATES:
        for who, prefix, letter in WHO:
            name = f"{title} - {who}"
            code = "ESG_HS_" + re.sub(r"[^A-Z0-9]+", "_", name.upper()).strip("_")
            if await db.esg_kpi_definitions.find_one({"metric_code": code}):
                continue
            numerator, denominator = await _kpi_id(f"{prefix}_{stem}"), await _kpi_id(f"{prefix}_hours")
            doc = copy.deepcopy(template)
            doc.update({
                "id": str(uuid.uuid4()), "metric_name": name, "short_name": name, "metric_code": code, "created_at": now, "updated_at": now,
                "source_config": {"composite": {"operation": "ratio_scaled", "source_kpi_ids": [numerator, denominator], "scale": 1000000}},
                "formula_config": {"formula_type": "ratio", "dependencies": [numerator, denominator],
                                   "formula_definition": f"({prefix}_{stem} / {prefix}_hours) * 1000000"},
                "description": f"{title} for {who.lower()}, per 1,000,000 hours worked.",
                "gri_disclosure": gri.format(w=letter), "brsr_reference": None, "framework_references": [_ref(gri.format(w=letter))],
                "tags": ["derived"], "metadata": {"person_type": who, "scale": 1000000}, "created_by_name": "batch script",
            })
            doc.pop("tree_order", None)
            await db.esg_kpi_definitions.insert_one(doc)
            created += 1
    print("created", created)


if __name__ == "__main__":
    asyncio.run(main())
