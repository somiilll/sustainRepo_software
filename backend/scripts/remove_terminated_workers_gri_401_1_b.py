"""Terminated Workers: remove GRI 401-1-b (keep 102-3-f) from KPIs and entry fields (idempotent, backs up first)."""
import asyncio
import json
import os
from datetime import datetime, timezone

from shared.database.mongo import db

BACKUP_DIR = "/app/backups"
SUB = "Terminated Workers"
REMOVE = "401-1-b"


async def main():
    kpis = await db.esg_kpi_definitions.find({"subcategory": SUB}).to_list(None)
    category = await db.esg_record_categories.find_one({"subcategory": SUB})
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")
    os.makedirs(BACKUP_DIR, exist_ok=True)
    path = f"{BACKUP_DIR}/terminated_workers_gri_{stamp}.json"
    with open(path, "w") as file:
        json.dump({"kpis": [{k: v for k, v in kpi.items() if k != "_id"} for kpi in kpis], "fields": category["fields"]}, file, default=str)

    def clean(value):
        parts = [p.strip() for p in (value or "").split(";") if p.strip() and p.strip() != REMOVE]
        return "; ".join(parts) or None

    for kpi in kpis:
        refs = [r for r in kpi.get("framework_references") or [] if not (r.get("framework") == "GRI" and r.get("reference") == REMOVE)]
        await db.esg_kpi_definitions.update_one({"id": kpi["id"]}, {"$set": {"framework_references": refs, "gri_disclosure": clean(kpi.get("gri_disclosure"))}})
    for field in category["fields"]:
        field["gri_disclosure"] = clean(field.get("gri_disclosure"))
    await db.esg_record_categories.update_one({"_id": category["_id"]}, {"$set": {"fields": category["fields"]}})
    print(f"backup={path} kpis={len(kpis)} fields={len(category['fields'])}")


if __name__ == "__main__":
    asyncio.run(main())
