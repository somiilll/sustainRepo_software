"""Non-compliance: 3 product/service types in the dropdown and 9 per-type KPIs (fine/penalty, warning, voluntary codes) (idempotent, backs up first)."""
import asyncio
import json
import os
import uuid
from datetime import datetime, timezone

from modules.esg_records.env_schema import _NC_TYPES
from shared.database.mongo import db

BACKUP_DIR = "/app/backups"
TYPES = [  # (dropdown option, short name, old archived-KPI option value, GRI base)
    ("Health and Safety impacts of products and services", "Health and Safety Impacts", "Health & safety impacts of products and services", "416-2-a"),
    ("Product and Service Information and Labeling", "Product and Service Information and Labeling", "Product and Service information and Labeling", "417-2-a"),
    ("Marketing Communications (including advertising, promotion, and sponsorship)", "Marketing Communications", "Marketing Communications", "417-3-a"),
]
OUTCOMES = [("non_compliance_result_in_a_fine_or_penalty", "Resulting in Fine / Penalty", "i"),
            ("non_compliance_result_in_a_warning", "Resulting in Warning", "ii"),
            ("non_compliance_with_voluntary_codes", "With Voluntary Codes", "iii")]


def _ref(code: str) -> dict:
    return {"framework": "GRI", "reference": code, "question_key": "gri_" + code.replace("-", "_"), "answer_path": None, "reference_type": "exact"}


async def main():
    now = datetime.now(timezone.utc).isoformat()
    cat = await db.esg_record_categories.find_one({"category": "Incidents", "subcategory": "Non-compliance"})
    kpis = await db.esg_kpi_definitions.find({"category_name": "Incidents", "subcategory": "Non-compliance"}, {"_id": 0}).to_list(None)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")
    os.makedirs(BACKUP_DIR, exist_ok=True)
    with open(f"{BACKUP_DIR}/non_compliance_types_{stamp}.json", "w") as file:
        json.dump({"fields": cat["fields"], "kpis": kpis}, file, default=str)

    for field in cat["fields"]:
        if field["field_key"] == "non_compliance_type":
            field["options"], field["option_refs"] = list(_NC_TYPES), _NC_TYPES
    await db.esg_record_categories.update_one({"_id": cat["_id"]}, {"$set": {"fields": cat["fields"], "updated_at": now}})

    template = next(k for k in kpis if k["metric_name"] == "Non-compliance - Resulting in Fine / Penalty")
    done = 0
    for option, short, old_value, gri in TYPES:
        for field_key, label, roman in OUTCOMES:
            name = f"Non-compliance - {short} - {label}"
            fields = {"metric_name": name, "short_name": name, "status": "active", "updated_at": now,
                      "filters": [{"field_key": "non_compliance_type", "operator": "=", "value": option}],
                      "gri_disclosure": f"{gri}-{roman}", "framework_references": [_ref(f"{gri}-{roman}")], "brsr_reference": None}
            old = next((k for k in kpis if k["source_config"]["records"]["value_field"] == field_key and k["filters"]
                        and k["filters"][0]["value"] in (old_value, option) and k["metric_name"].startswith(("No. of non-compliance related", "Non-compliance - " + short))), None)
            if old:
                await db.esg_kpi_definitions.update_one({"id": old["id"]}, {"$set": fields})
            else:
                doc = {k: v for k, v in template.items() if k != "_id"}
                doc.update({"id": str(uuid.uuid4()), "metric_code": "GOV_NONCOMPLIANCE_" + short.upper().replace(" ", "_") + "_" + field_key.upper(),
                            "created_at": now, **fields})
                doc["source_config"] = {"records": {"value_field": field_key}}
                await db.esg_kpi_definitions.insert_one(doc)
            done += 1
    print(f"types={len(_NC_TYPES)} kpis={done}")


if __name__ == "__main__":
    asyncio.run(main())
