"""Waste 'through' / onsite-offsite labels as sub-headings; Waste Spills direct inputs (no table); Employee Redeployed KPIs fully enabled; remove Non-guaranteed-hours KPIs/fields (idempotent, backs up first)."""
import asyncio
import json
import os
from datetime import datetime, timezone

from modules.esg_records.waste_schema import spill_rows, waste_rows, waste_tree_meta
from scripts.seed_water_withdrawal_discharge_recycle import SPILL_UNITS, WASTE_MASS_UNITS, spill_fields, sync_kpi
from shared.database.mongo import db

BACKUP_DIR = "/app/backups"
SUBS = ("Recovered / Diverted from disposal", "Disposal")


async def relabel_waste(now):
    for sub in SUBS:
        cat = await db.esg_record_categories.find_one({"category": "Waste", "subcategory": sub})
        meta = waste_tree_meta(sub)
        suffixes = ("_recycled", "_reused", "_other_recovery", "_incineration_with_energy", "_incineration_without_energy", "_landfilling", "_other_disposal")
        by_key = {r["key"]: r for r in waste_rows(sub)
                  if (r["key"].startswith(("hazardous_waste_", "non_hazardous_waste_")) and r["key"].endswith(suffixes))
                  or r["key"] in ("waste_recovered_onsite", "waste_recovered_offsite", "waste_disposed_onsite", "waste_disposed_offsite")}
        for field in cat["fields"]:
            row = by_key.get(field["field_key"])
            if row:
                field["label"], field["group"] = row["new_field"], meta[row["key"]]["group"]
        await db.esg_record_categories.update_one({"_id": cat["_id"]}, {"$set": {"fields": cat["fields"], "updated_at": now}})
        for row in by_key.values():
            await sync_kpi(db, "Waste", sub, row, now, waste_tree_meta, WASTE_MASS_UNITS)
        print(sub, "relabelled", len(by_key))


async def main():
    now = datetime.now(timezone.utc).isoformat()
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")
    os.makedirs(BACKUP_DIR, exist_ok=True)
    cats = await db.esg_record_categories.find({"$or": [{"category": "Waste"}, {"subcategory": "Employee Diversity"}]}, {"_id": 0}).to_list(None)
    ng = await db.esg_kpi_definitions.find({"metric_name": {"$regex": "Non-guaranteed"}}, {"_id": 0}).to_list(None)
    red = await db.esg_kpi_definitions.find({"subcategory": "Employee Redeployed"}, {"_id": 0}).to_list(None)
    with open(f"{BACKUP_DIR}/waste_spills_redeployed_{stamp}.json", "w") as file:
        json.dump({"categories": cats, "nonguaranteed_kpis": ng, "redeployed_kpis": red}, file, default=str)

    await relabel_waste(now)

    spills = await db.esg_record_categories.find_one({"category": "Waste", "subcategory": "Spills"})
    await db.esg_record_categories.update_one({"_id": spills["_id"]}, {"$set": {"fields": spill_fields(None), "updated_at": now}})
    for row in spill_rows():
        await sync_kpi(db, "Waste", "Spills", row, now, waste_tree_meta, SPILL_UNITS)

    await db.esg_kpi_definitions.update_many(
        {"subcategory": "Employee Redeployed"},
        {"$set": {"status": "active", "visibility": {"dashboard_enabled": True, "reports_enabled": True, "tracking_enabled": True,
                                                      "target_enabled": True, "analytics_enabled": True}}})
    await db.esg_record_categories.update_one({"subcategory": "Employee Redeployed"}, {"$set": {"is_active": True}})

    deleted = await db.esg_kpi_definitions.delete_many({"subcategory": "Employee Diversity", "metric_name": {"$regex": "Non-guaranteed"}})
    div = await db.esg_record_categories.find_one({"subcategory": "Employee Diversity"})
    kept = [f for f in div["fields"] if "non_guaranteed" not in f["field_key"]]
    for field in kept:
        field["sum_parents"] = [p for p in field.get("sum_parents") or [] if "non_guaranteed" not in p]
    await db.esg_record_categories.update_one({"_id": div["_id"]}, {"$set": {"fields": kept}})
    print(f"nonguaranteed: kpis deleted={deleted.deleted_count} fields removed={len(div['fields']) - len(kept)}")


if __name__ == "__main__":
    asyncio.run(main())
