"""Employee/Workers Diversity: GRI only on Total, Total (Female/Male), age, minority, vulnerable, differently-abled, permanent and other-than-permanent KPIs; all other KPIs/fields lose GRI (idempotent, backs up first)."""
import asyncio
import json
import os
from datetime import datetime, timezone

from shared.database.mongo import db

BACKUP_DIR = "/app/backups"
SUBS = {"Employee Diversity": "Employees", "Workers Diversity": "Workers"}


def targets(sub: str, who: str) -> dict:
    targets = {f"{sub} - Total {who} (Female)": "405-1-b-i", f"{sub} - Total {who} (Male)": "405-1-b-i", f"{sub} - Total {who}": "405-1-b"}
    for age in ("Under 30", "30-50", "Over 50"):
        targets[f"{sub} - {age}"] = "405-1-b-ii"
    singular = who.lower()[:-1]
    for stem in (f"of which: Minority-group {singular}s", f"of which: Vulnerable-group {singular}s", f"Differently-abled {singular}s",
                 f"Permanent {singular}s", f"Other-than-permanent {singular}s"):
        targets[f"{sub} - {stem}"] = "405-1-b-iii"
    return targets


def _ref(code: str) -> dict:
    return {"framework": "GRI", "reference": code, "question_key": "gri_" + code.replace("-", "_"), "answer_path": None, "reference_type": "exact"}


async def main():
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")
    os.makedirs(BACKUP_DIR, exist_ok=True)
    path = f"{BACKUP_DIR}/diversity_gri_{stamp}.json"
    backup, summary = {}, []
    for sub, who in SUBS.items():
        wanted = targets(sub, who)
        kpis = await db.esg_kpi_definitions.find({"subcategory": sub}).to_list(None)
        category = await db.esg_record_categories.find_one({"subcategory": sub})
        backup[sub] = {"kpis": [{k: v for k, v in kpi.items() if k != "_id"} for kpi in kpis], "fields": category["fields"]}
        field_gri, matched = {}, 0
        for kpi in kpis:
            code = wanted.get(kpi["metric_name"])
            matched += bool(code)
            refs = [r for r in kpi.get("framework_references") or [] if r.get("framework") != "GRI"]
            await db.esg_kpi_definitions.update_one(
                {"id": kpi["id"]}, {"$set": {"framework_references": ([_ref(code)] if code else []) + refs, "gri_disclosure": code}})
            value_field = (kpi.get("source_config") or {}).get("records", {}).get("value_field")
            if value_field:
                field_gri[value_field] = code
        for field in category["fields"]:
            if field["field_key"] in field_gri:
                field["gri_disclosure"] = field_gri[field["field_key"]]
        await db.esg_record_categories.update_one({"_id": category["_id"]}, {"$set": {"fields": category["fields"]}})
        summary.append(f"{sub}: matched {matched}/{len(wanted)}")
    with open(path, "w") as file:
        json.dump(backup, file, default=str)
    print(f"backup={path} " + "; ".join(summary))


if __name__ == "__main__":
    asyncio.run(main())
