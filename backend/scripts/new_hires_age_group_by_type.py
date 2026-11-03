"""New Employees/Worker: replace combined age rows (F/M/Total) with Employees and Workers age rows (Total only) (idempotent, backs up first)."""
import asyncio
import json
import os
import subprocess
from datetime import datetime, timezone

from scripts.fix_new_hires_gri_refs import main as fix_gri
from scripts.seed_water_withdrawal_discharge_recycle import sync_workforce
from shared.database.mongo import db

BACKUP_DIR = "/app/backups"
SUB = "New Employees/Worker"
OLD_FIELDS = ["no_of_employees_worker_under_30", "no_of_employees_worker_30_50", "no_of_employees_worker_over_50"] + \
             [f"new_hires_age_{a}_{g}" for a in ("u30", "3050", "o50") for g in ("female", "male")]


async def main():
    now = datetime.now(timezone.utc).isoformat()
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")
    os.makedirs(BACKUP_DIR, exist_ok=True)
    cat = await db.esg_record_categories.find_one({"subcategory": SUB}, {"_id": 0})
    old_kpis = await db.esg_kpi_definitions.find({"subcategory": SUB, "source_config.records.value_field": {"$in": OLD_FIELDS}}, {"_id": 0}).to_list(None)
    with open(f"{BACKUP_DIR}/new_hires_age_{stamp}.json", "w") as file:
        json.dump({"category": cat, "old_age_kpis": old_kpis}, file, default=str)

    frontend_file = "/app/frontend/src/config/workforceSpec.generated.js"
    before = open(frontend_file).read()
    await sync_workforce(db, now, only={SUB})
    head, new_body = open(frontend_file).read().split("= ", 1)
    _, old_body = before.split("= ", 1)
    merged = json.loads(old_body.rstrip().rstrip(";"))
    merged[SUB] = json.loads(new_body.rstrip().rstrip(";"))[SUB]
    open(frontend_file, "w").write(head + "= " + json.dumps(merged, indent=1) + ";\n")

    deleted = await db.esg_kpi_definitions.delete_many({"subcategory": SUB, "source_config.records.value_field": {"$in": OLD_FIELDS}})
    await fix_gri()
    print(f"old age KPIs deleted={deleted.deleted_count}")


if __name__ == "__main__":
    asyncio.run(main())
