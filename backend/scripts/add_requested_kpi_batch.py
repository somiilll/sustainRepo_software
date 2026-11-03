"""One-off batch: Employee Diversity GRI, Waste recovered/disposed breakdowns, produced water, Waste Spills, Employee Redeployed, Anti-corruption BoD+KMP KPIs (idempotent, backs up first)."""
import asyncio
import copy
import json
import os
import re
import uuid
from datetime import datetime, timezone

from modules.esg_records.waste_schema import SPILL_COLUMNS, spill_rows, waste_rows, waste_tree_meta
from modules.esg_records.water_schema import tree_meta as water_tree_meta, withdrawal_rows
from scripts.seed_water_withdrawal_discharge_recycle import (COUNT_UNITS, SPILL_UNITS, UNITS, WASTE_MASS_UNITS,
                                                            spill_fields, sync_kpi)
from shared.database.mongo import db

BACKUP_DIR = "/app/backups"
EMP_DIVERSITY_GRI = {f"Employee Diversity - {n}": "405-1-b-iii" for n in
                     ("Temporary", "Contract", "Intern / trainee", "Full-time employees", "Part-time employees")}
REDEPLOYED = [("Female", "By Gender"), ("Male", "By Gender"), ("Permanent", "By Employment Type"),
              ("Other than permanent", "By Employment Type"), ("Under 30", "By Age Group"), ("30-50", "By Age Group"),
              ("Over 50", "By Age Group")]
TRAINING_RECIPIENTS = ["Board of Directors", "Key Managerial Personnel"]


def _ref(code: str) -> dict:
    return {"framework": "GRI", "reference": code, "question_key": "gri_" + code.replace("-", "_"), "answer_path": None, "reference_type": "exact"}


async def add_rows(category, sub, rows, meta_fn, units, now):
    cat = await db.esg_record_categories.find_one({"category": category, "subcategory": sub})
    fields, existing = cat["fields"], {f["field_key"] for f in cat["fields"]}
    template = copy.deepcopy(next(f for f in fields if f["field_key"] == "quantity"))
    meta = meta_fn(sub)
    new_rows = [r for r in rows if r["key"] not in existing and r["name"]]
    for row in new_rows:
        field = copy.deepcopy(template)
        m = meta[row["key"]]
        field.update({"field_key": row["key"], "label": row["new_field"], "required": False, "group": m["group"], "level": m["level"],
                      "parent_key": m["parent_key"], "sum_parents": m["sum_parents"], "brsr_reference": row["brsr"],
                      "gri_disclosure": row["gri"]})
        fields.append(field)
    fields.sort(key=lambda f: meta.get(f["field_key"], {"order": 10_000})["order"])
    await db.esg_record_categories.update_one({"_id": cat["_id"]}, {"$set": {"fields": fields, "updated_at": now}})
    for row in new_rows:
        await sync_kpi(db, category, sub, row, now, meta_fn, units)
    return len(new_rows)


async def create_category(template_filter, category, sub, fields, now):
    if await db.esg_record_categories.find_one({"category": category, "subcategory": sub}):
        return False
    base = await db.esg_record_categories.find_one(template_filter, {"_id": 0})
    last = await db.esg_record_categories.find({"category": category}, {"order": 1}).sort("order", -1).limit(1).to_list(1)
    base.update({"id": str(uuid.uuid4()), "subcategory": sub, "fields": fields, "is_active": True, "order": (last[0].get("order") or 0) + 1,
                 "created_at": now, "updated_at": now})
    await db.esg_record_categories.insert_one(base)
    return True


async def set_gri(sub, wanted):
    kpis = await db.esg_kpi_definitions.find({"subcategory": sub, "metric_name": {"$in": list(wanted)}}).to_list(None)
    cat = await db.esg_record_categories.find_one({"subcategory": sub})
    field_gri = {}
    for kpi in kpis:
        code = wanted[kpi["metric_name"]]
        refs = [r for r in kpi.get("framework_references") or [] if r.get("framework") != "GRI"]
        await db.esg_kpi_definitions.update_one({"id": kpi["id"]}, {"$set": {"framework_references": [_ref(code)] + refs, "gri_disclosure": code}})
        field_gri[kpi["source_config"]["records"]["value_field"]] = code
    for field in cat["fields"]:
        if field["field_key"] in field_gri:
            field["gri_disclosure"] = field_gri[field["field_key"]]
    await db.esg_record_categories.update_one({"_id": cat["_id"]}, {"$set": {"fields": cat["fields"]}})
    return len(kpis)


async def add_training_kpis(now):
    names = {"Female Attendees": "Trainings - Anti-corruption - Female Attendees", "Male Attendees": "Trainings - Anti-corruption - Male Attendees",
             "Total Attendees": "Trainings - Anti-corruption - Total Attendees"}
    created = 0
    for suffix, source_name in names.items():
        name = f"Trainings - Anti-corruption - BoD + KMP - {suffix}"
        code = "ESG_" + re.sub(r"[^A-Z0-9]+", "_", name.upper()).strip("_")
        if await db.esg_kpi_definitions.find_one({"metric_code": code}):
            continue
        doc = await db.esg_kpi_definitions.find_one({"metric_name": source_name}, {"_id": 0})
        doc["source_config"] = {"records": {"value_field": doc["source_config"]["records"]["value_field"]}}
        doc.update({"id": str(uuid.uuid4()), "metric_name": name, "short_name": name, "metric_code": code, "created_at": now, "updated_at": now,
                    "filters": [{"field_key": "training_recipient_type", "operator": "in", "value": TRAINING_RECIPIENTS}],
                    "gri_disclosure": "205-2-d", "brsr_reference": None, "framework_references": [_ref("205-2-d")],
                    "tags": [], "created_by_name": "batch script"})
        doc.pop("tree_order", None)
        await db.esg_kpi_definitions.insert_one(doc)
        created += 1
    return created


async def main():
    now = datetime.now(timezone.utc).isoformat()
    os.makedirs(BACKUP_DIR, exist_ok=True)
    cats = await db.esg_record_categories.find({"$or": [{"category": "Waste"}, {"category": "Water", "subcategory": "Withdrawal"},
                                                        {"subcategory": "Employee Diversity"}]}, {"_id": 0}).to_list(None)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")
    path = f"{BACKUP_DIR}/requested_batch_{stamp}.json"
    with open(path, "w") as file:
        json.dump(cats, file, default=str)

    out = {"emp_diversity_gri": await set_gri("Employee Diversity", EMP_DIVERSITY_GRI)}
    out["water_withdrawal"] = await add_rows("Water", "Withdrawal", withdrawal_rows(), water_tree_meta, UNITS, now)
    for sub in ("Recovered / Diverted from disposal", "Disposal"):
        out[sub] = await add_rows("Waste", sub, waste_rows(sub), waste_tree_meta, WASTE_MASS_UNITS, now)

    out["spills_category"] = await create_category({"category": "Waste", "subcategory": "Generated"}, "Waste", "Spills", spill_fields(None), now)
    for row in spill_rows():
        await sync_kpi(db, "Waste", "Spills", row, now, waste_tree_meta, SPILL_UNITS)

    base = {"type": "number", "required": False, "placeholder": "", "options": [], "default_value": None, "validation": {"min": 0, "step": 1},
            "table_columns": [], "table_min_rows": 1, "table_max_rows": 10, "has_unit": False, "allowed_units": [], "default_unit": None}
    fields, rows = [], []
    for i, (label, group) in enumerate(REDEPLOYED):
        key = "redeployed_" + re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")
        fields.append({**base, "field_key": key, "label": f"Employees Redeployed - {label}", "group": group, "level": 0, "parent_key": None,
                       "sum_parents": [], "brsr_reference": None, "gri_disclosure": None})
        rows.append({"key": key, "name": f"Employees Redeployed - {label}", "brsr": None, "gri": None, "old_code": None, "unit": False,
                     "section": "social"})
    out["redeployed_category"] = await create_category({"category": "Employees/Worker", "subcategory": "Employee Turnover"}, "Employees/Worker",
                                                      "Employee Redeployed", fields, now)
    for row in rows:
        await sync_kpi(db, "Employees/Worker", "Employee Redeployed", row, now, lambda _sub: {}, UNITS)

    out["training_kpis"] = await add_training_kpis(now)
    print(f"backup={path}", out)


if __name__ == "__main__":
    asyncio.run(main())
