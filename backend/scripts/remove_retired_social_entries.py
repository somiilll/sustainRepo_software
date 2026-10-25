"""One-time hard removal and H&S rehabilitation merge requested by product owner."""
import asyncio
import json
import os
import re
import sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

from scripts.seed_water_withdrawal_discharge_recycle import SECTIONS, UNITS, env_field, sync_kpi
from modules.esg_records.env_schema import SPECS, env_tree_meta

load_dotenv(os.path.join(ROOT, ".env"))

REMOVED = [
    ("Training", "Security Training"),
    ("Complaints", "External Complaints"),
    ("Health & Safety", "Occupational Health & Safety Management System for Employees"),
    ("Health & Safety", "Occupational Health & Safety Management System for Workers"),
    ("Health & Safety", "Product & Service Health and Safety Assessment"),
]
REHAB = ("Health & Safety", "Rehabilitation after Serious Injury/Fatality")
INCIDENTS = ("Health & Safety", "Health & Safety Incidents")
RECORD_COLLECTIONS = ("social_records", "social_record_versions", "esg_records", "esg_record_versions")


def code(name):
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


async def backup(db, targets, stamp):
    payload = {"created_at": stamp, "removed_entries": {}, "rehabilitation_merge": {}}
    for category, subcategory in targets:
        key = f"{category} / {subcategory}"
        payload["removed_entries"][key] = {
            "categories": await db.esg_record_categories.find({"category": category, "subcategory": subcategory}, {"_id": 0}).to_list(None),
            "kpis": await db.esg_kpi_definitions.find({"category_name": category, "subcategory": subcategory}, {"_id": 0}).to_list(None),
            "records": {collection: await db[collection].find({"category": category, "subcategory": subcategory}, {"_id": 0}).to_list(None) for collection in RECORD_COLLECTIONS},
        }
    category, subcategory = REHAB
    payload["rehabilitation_merge"] = {
        "categories": await db.esg_record_categories.find({"category": category, "subcategory": subcategory}, {"_id": 0}).to_list(None),
        "kpis": await db.esg_kpi_definitions.find({"category_name": category, "subcategory": subcategory}, {"_id": 0}).to_list(None),
        "records": {collection: await db[collection].find({"category": category, "subcategory": subcategory}, {"_id": 0}).to_list(None) for collection in RECORD_COLLECTIONS},
    }
    path = f"/app/backups/esg_social_entry_removal_{stamp.replace(':', '').replace('+00:00', 'Z')}.json"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as file:
        json.dump(payload, file, default=str)
    return path


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    now = datetime.now(timezone.utc).isoformat()
    backup_path = await backup(db, REMOVED, now)
    result = {"backup": backup_path, "removed": {}, "rehabilitation_moved": {}}

    rehab_category = await db.esg_record_categories.find_one({"category": REHAB[0], "subcategory": REHAB[1]}, {"_id": 0, "id": 1})
    incident_category = await db.esg_record_categories.find_one({"category": INCIDENTS[0], "subcategory": INCIDENTS[1]}, {"_id": 0, "id": 1})
    rehab_filter = {"category": REHAB[0], "subcategory": REHAB[1]}
    for collection in RECORD_COLLECTIONS:
        moved = await db[collection].update_many(rehab_filter, {"$set": {"subcategory": INCIDENTS[1], "category_id": incident_category.get("id"), "updated_at": now}})
        result["rehabilitation_moved"][collection] = moved.modified_count
    moved_kpis = await db.esg_kpi_definitions.update_many({"category_name": REHAB[0], "subcategory": REHAB[1]}, {"$set": {"subcategory": INCIDENTS[1], "updated_at": now}})
    result["rehabilitation_moved"]["kpis"] = moved_kpis.modified_count
    moved_assignments = await db.esg_assignments.update_many(rehab_filter, {"$set": {"subcategory": INCIDENTS[1], "category_id": incident_category.get("id"), "updated_at": now}})
    result["rehabilitation_moved"]["assignments"] = moved_assignments.modified_count
    if rehab_category:
        await db.esg_record_categories.delete_one({"id": rehab_category["id"]})

    # Refresh only the combined H&S Incidents configuration. This keeps all
    # original incident fields and adds the former rehabilitation fields below
    # them without re-seeding unrelated ESG categories.
    incident_specs = SPECS[INCIDENTS]
    incident_meta = env_tree_meta(*INCIDENTS)
    incident_fields = [env_field(spec, incident_meta[spec["key"]]) for spec in incident_specs]
    await db.esg_record_categories.update_one(
        {"category": INCIDENTS[0], "subcategory": INCIDENTS[1]},
        {"$set": {"fields": incident_fields, "updated_at": now}},
    )
    refreshed_kpis = {"created": 0, "updated": 0}
    for spec in incident_specs:
        if not spec["kpi"]:
            continue
        row = {
            "key": spec["key"], "name": spec["kpi"], "brsr": spec["brsr"], "gri": spec["gri"],
            "old_code": spec["old"], "unit": bool(spec["units"]) or spec["percent"],
            "agg": spec["agg"], "percent": spec["percent"], "section": SECTIONS[INCIDENTS[0]],
        }
        if spec["units"]:
            row["unit_config"] = {"default_unit": spec["default_unit"], "supported_units": spec["units"], "allow_unit_conversion": False}
        elif spec["percent"]:
            row["unit_config"] = {"default_unit": "%", "supported_units": ["%"], "allow_unit_conversion": False}
        refreshed_kpis[await sync_kpi(db, INCIDENTS[0], INCIDENTS[1], row, now, lambda _sub: incident_meta, UNITS)] += 1
    result["rehabilitation_moved"]["combined_incident_fields"] = len(incident_fields)
    result["rehabilitation_moved"]["combined_incident_kpis"] = refreshed_kpis

    for category, subcategory in REMOVED:
        selector = {"category": category, "subcategory": subcategory}
        category_docs = await db.esg_record_categories.find(selector, {"_id": 0, "id": 1}).to_list(None)
        category_ids = [doc["id"] for doc in category_docs if doc.get("id")]
        removed = {
            "records": {},
            "kpis": (await db.esg_kpi_definitions.delete_many({"category_name": category, "subcategory": subcategory})).deleted_count,
            "categories": (await db.esg_record_categories.delete_many(selector)).deleted_count,
            "assignments": (await db.esg_assignments.delete_many({"$or": [selector, {"category_id": {"$in": category_ids}}]})).deleted_count,
        }
        for collection in RECORD_COLLECTIONS:
            removed["records"][collection] = (await db[collection].delete_many(selector)).deleted_count
        unset_key = f"kpi_overrides.{code(subcategory)}"
        await db.organization_config.update_many({unset_key: {"$exists": True}}, {"$unset": {unset_key: ""}, "$set": {"updated_at": now}})
        result["removed"][f"{category} / {subcategory}"] = removed

    print(json.dumps(result, indent=2))
    client.close()


if __name__ == "__main__":
    asyncio.run(main())