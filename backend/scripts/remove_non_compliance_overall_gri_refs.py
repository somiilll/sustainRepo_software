"""Non-compliance: remove GRI refs from the overall cases/outcome KPIs and their entry fields (idempotent, backs up first)."""
import asyncio
import json
import os
from datetime import datetime, timezone

from shared.database.mongo import db

BACKUP_DIR = "/app/backups"
NAMES = ["Non-compliance Cases (Total)", "Non-compliance - Resulting in Fine / Penalty", "Non-compliance - Resulting in Warning",
         "Non-compliance - With Voluntary Codes"]
FIELDS = {"no_of_cases", "non_compliance_result_in_a_fine_or_penalty", "non_compliance_result_in_a_warning", "non_compliance_with_voluntary_codes"}


async def main():
    kpis = await db.esg_kpi_definitions.find({"metric_name": {"$in": NAMES}}).to_list(None)
    cat = await db.esg_record_categories.find_one({"category": "Incidents", "subcategory": "Non-compliance"})
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")
    os.makedirs(BACKUP_DIR, exist_ok=True)
    with open(f"{BACKUP_DIR}/non_compliance_overall_gri_{stamp}.json", "w") as file:
        json.dump({"kpis": [{k: v for k, v in kpi.items() if k != "_id"} for kpi in kpis], "fields": cat["fields"]}, file, default=str)
    for kpi in kpis:
        refs = [r for r in kpi.get("framework_references") or [] if r.get("framework") != "GRI"]
        await db.esg_kpi_definitions.update_one({"id": kpi["id"]}, {"$set": {"framework_references": refs, "gri_disclosure": None}})
    for field in cat["fields"]:
        if field["field_key"] in FIELDS:
            field["gri_disclosure"] = None
    await db.esg_record_categories.update_one({"_id": cat["_id"]}, {"$set": {"fields": cat["fields"]}})
    print(f"kpis={len(kpis)}")


if __name__ == "__main__":
    asyncio.run(main())
