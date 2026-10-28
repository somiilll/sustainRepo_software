"""Waste: Disposal / Recovered keep GRI only on the listed KPIs; Generated duplicate 306-3-a refs collapsed (idempotent, backs up first)."""
import asyncio
import json
import os
from datetime import datetime, timezone

from shared.database.mongo import db

BACKUP_DIR = "/app/backups"
DISPOSAL = {
    **{f"{n} Disposed": "306-5-a" for n in ("Battery", "Biomedical", "Construction & demolition", "E-waste", "Other hazardous waste",
                                            "Other non-hazardous waste", "Plastic", "Radioactive")},
    "Hazardous Waste Disposed (Total)": "306-5-b", "Non-hazardous Waste Disposed (Total)": "306-5-c", "Waste Disposed (Total)": "306-5-a",
}
RECOVERED = {
    **{f"{n} Recovered": "306-4-a" for n in ("Battery", "Biomedical", "Construction & demolition", "E-waste", "Other hazardous waste",
                                             "Other non-hazardous waste", "Plastic", "Radioactive")},
    "Waste Recovered (Total)": "306-4-a",
}


def _dedupe(value):
    parts = list(dict.fromkeys(p.strip() for p in (value or "").split(",") if p.strip()))
    return ", ".join(parts) or None


def _ref(code: str) -> dict:
    return {"framework": "GRI", "reference": code, "question_key": "gri_" + code.replace("-", "_"), "answer_path": None, "reference_type": "exact"}


async def _apply(sub: str, code_for) -> tuple:
    kpis = await db.esg_kpi_definitions.find({"category_name": "Waste", "subcategory": sub}).to_list(None)
    category = await db.esg_record_categories.find_one({"category": "Waste", "subcategory": sub})
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
        "Disposal": await _apply("Disposal", lambda k: DISPOSAL.get(k["metric_name"])),
        "Recovered / Diverted from disposal": await _apply("Recovered / Diverted from disposal", lambda k: RECOVERED.get(k["metric_name"])),
    }
    generated = await db.esg_kpi_definitions.find({"category_name": "Waste", "subcategory": "Generated"}).to_list(None)
    category = await db.esg_record_categories.find_one({"category": "Waste", "subcategory": "Generated"})
    backup["Generated"] = ([{k: v for k, v in kpi.items() if k != "_id"} for kpi in generated], category["fields"])
    for kpi in generated:
        await db.esg_kpi_definitions.update_one({"id": kpi["id"]}, {"$set": {"gri_disclosure": _dedupe(kpi.get("gri_disclosure"))}})
    for field in category["fields"]:
        field["gri_disclosure"] = _dedupe(field.get("gri_disclosure")) if field.get("gri_disclosure") else field.get("gri_disclosure")
    await db.esg_record_categories.update_one({"_id": category["_id"]}, {"$set": {"fields": category["fields"]}})
    path = f"{BACKUP_DIR}/waste_gri_{stamp}.json"
    with open(path, "w") as file:
        json.dump(backup, file, default=str)
    print(f"backup={path}")


if __name__ == "__main__":
    asyncio.run(main())
