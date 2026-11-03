"""Remove BRSR refs + unwired (needs_exact_destination) BRSR mappings: Health & Safety Incidents, Rehabilitated, General Training P1-E1, Non-compliance (idempotent, backs up first)."""
import asyncio
import json
import os
from datetime import datetime, timezone

from shared.database.mongo import db

BACKUP_DIR = "/app/backups"


def _in_scope(kpi: dict, reference: str) -> bool:
    if kpi["subcategory"] in ("Health & Safety Incidents", "Non-compliance"):
        return True
    return kpi["subcategory"] == "General Training" and reference == "P1-E1"


async def main():
    mappings = await db.kpi_framework_mappings.find(
        {"framework": "BRSR", "mapping_status": "needs_exact_destination", "is_active": True}, {"_id": 0}).to_list(None)
    kpis = {k["id"]: k for k in await db.esg_kpi_definitions.find({"status": {"$ne": "archived"}}, {"_id": 0}).to_list(None)}
    selected = [(m, kpis[m["kpi_id"]]) for m in mappings if m["kpi_id"] in kpis and kpis[m["kpi_id"]].get("brsr_reference")
                and _in_scope(kpis[m["kpi_id"]], m["reference"])]
    cats = {}
    for sub in {k["subcategory"] for _m, k in selected}:
        cats[sub] = await db.esg_record_categories.find_one({"subcategory": sub})
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")
    os.makedirs(BACKUP_DIR, exist_ok=True)
    with open(f"{BACKUP_DIR}/unwired_brsr_refs_{stamp}.json", "w") as file:
        json.dump({"mappings": [m for m, _k in selected], "kpis": [k for _m, k in selected],
                   "fields": {s: c["fields"] for s, c in cats.items()}}, file, default=str)

    for mapping, kpi in selected:
        refs = [r for r in kpi.get("framework_references") or [] if str(r.get("framework", "")).upper() != "BRSR"]
        await db.esg_kpi_definitions.update_one({"id": kpi["id"]}, {"$set": {"brsr_reference": None, "framework_references": refs}})
        await db.kpi_framework_mappings.delete_many({"framework": "BRSR", "kpi_id": kpi["id"], "mapping_status": "needs_exact_destination"})
        field = (kpi.get("source_config") or {}).get("records", {}).get("value_field")
        for f in cats[kpi["subcategory"]]["fields"]:
            if field and f["field_key"] == field:
                f["brsr_reference"] = None
    for cat in cats.values():
        await db.esg_record_categories.update_one({"_id": cat["_id"]}, {"$set": {"fields": cat["fields"]}})
    print(f"kpis updated={len({k['id'] for _m, k in selected})} mappings removed={len(selected)}")


if __name__ == "__main__":
    asyncio.run(main())
