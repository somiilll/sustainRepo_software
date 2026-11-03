"""Parental-leave rate KPIs -> GRI 401-3-e; KMP total Female/Male -> 405-1-a-i; KMP gendered age/minority/vulnerable KPIs lose GRI (idempotent, backs up first)."""
import asyncio
import json
import os
from datetime import datetime, timezone

from shared.database.mongo import db

BACKUP_DIR = "/app/backups"
KMP = "Key Management Personnel Diversity"
RATE_NAMES = [f"{rate} ({x})" for rate in ("Retention Rate", "Return to Work Rate") for x in ("Female", "Male", "Total")]
TOTAL_GENDERED = {f"{KMP} - Key Management Personnel (Total) ({x})": f for x, f in (("Female", "no_of_female"), ("Male", "no_of_male"))}
DROP_NAMES = [f"{KMP} - {g} ({x})" for g in ("Under 30", "30-50", "Over 50", "of which: Minority-group members", "of which: Vulnerable-group members") for x in ("Female", "Male")]


def _ref(code: str) -> dict:
    return {"framework": "GRI", "reference": code, "question_key": "gri_" + code.replace("-", "_"), "answer_path": None, "reference_type": "exact"}


def _non_gri(kpi: dict) -> list:
    return [r for r in kpi.get("framework_references") or [] if r.get("framework") != "GRI"]


async def _set(kpis: list, code):
    for kpi in kpis:
        refs = ([_ref(code)] if code else []) + _non_gri(kpi)
        await db.esg_kpi_definitions.update_one({"id": kpi["id"]}, {"$set": {"framework_references": refs, "gri_disclosure": code}})


async def main():
    rates = await db.esg_kpi_definitions.find({"metric_name": {"$in": RATE_NAMES}, "subcategory": "Employees Parental Leave"}).to_list(None)
    totals = await db.esg_kpi_definitions.find({"metric_name": {"$in": list(TOTAL_GENDERED)}}).to_list(None)
    drops = await db.esg_kpi_definitions.find({"metric_name": {"$in": DROP_NAMES}}).to_list(None)
    category = await db.esg_record_categories.find_one({"subcategory": KMP})

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")
    os.makedirs(BACKUP_DIR, exist_ok=True)
    path = f"{BACKUP_DIR}/kmp_parental_gri_{stamp}.json"
    with open(path, "w") as file:
        json.dump({"kpis": [{k: v for k, v in i.items() if k != "_id"} for i in rates + totals + drops], "fields": category["fields"]}, file, default=str)

    await _set(rates, "401-3-e")
    await _set(totals, "405-1-a-i")
    await _set(drops, None)

    new_gri = {kpi["source_config"]["records"]["value_field"]: None for kpi in drops}
    new_gri.update({field: "405-1-a-i" for field in TOTAL_GENDERED.values()})
    for field in category["fields"]:
        if field["field_key"] in new_gri:
            field["gri_disclosure"] = new_gri[field["field_key"]]
    await db.esg_record_categories.update_one({"_id": category["_id"]}, {"$set": {"fields": category["fields"]}})
    print(f"backup={path} rates={len(rates)} totals={len(totals)} dropped={len(drops)}")


if __name__ == "__main__":
    asyncio.run(main())
