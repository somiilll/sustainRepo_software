"""Fill KPI brsr_reference / framework_references from active exact BRSR mappings when the KPI has no BRSR ref at all (idempotent, backs up first). Use --dry-run to preview."""
import asyncio
import json
import os
import sys
from datetime import datetime, timezone

from modules.esg_records.water_schema import ROWS
from shared.database.mongo import db

BACKUP_DIR = "/app/backups"


def _codes(value) -> list:
    return [c.strip() for c in str(value or "").replace(",", ";").split(";") if c.strip()]


def _water_brsr() -> dict:
    return {row["key"]: row["brsr"] for sub in ("Withdrawal", "Discharge") for row in ROWS[sub]() if row.get("brsr")}


async def main(dry_run: bool):
    water = _water_brsr()
    mappings = await db.kpi_framework_mappings.find(
        {"framework": "BRSR", "is_active": True, "mapping_status": "exact_destination"}, {"_id": 0, "kpi_id": 1, "reference": 1}).to_list(None)
    kpis = {k["id"]: k for k in await db.esg_kpi_definitions.find({"status": {"$ne": "archived"}}, {"_id": 0}).to_list(None)}
    changes, backup = [], []
    for mapping in mappings:
        kpi = kpis.get(mapping["kpi_id"])
        if not kpi or not mapping.get("reference") or _codes(kpi.get("brsr_reference")):
            continue
        reference = mapping["reference"]
        suggested = water.get(kpi.get("value_field"))
        if suggested and suggested.startswith(reference):
            reference = suggested
        changes.append((kpi, reference))
    for kpi, reference in changes:
        print(f"{kpi['metric_name'][:70]} | {kpi.get('brsr_reference')} -> {reference}")
    print(f"{len(changes)} KPIs to update (dry_run={dry_run})")
    if dry_run:
        return
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")
    os.makedirs(BACKUP_DIR, exist_ok=True)
    with open(f"{BACKUP_DIR}/kpi_brsr_backfill_{stamp}.json", "w") as file:
        json.dump([{"id": k["id"], "brsr_reference": k.get("brsr_reference"), "framework_references": k.get("framework_references")} for k, _ in changes], file, default=str)
    now = datetime.now(timezone.utc).isoformat()
    for kpi, reference in changes:
        codes = _codes(kpi.get("brsr_reference")) + [reference]
        refs = [r for r in kpi.get("framework_references") or [] if str(r.get("framework", "")).upper() != "BRSR"]
        refs.append({"framework": "BRSR", "reference": reference, "question_key": None, "answer_path": None, "reference_type": "exact"})
        await db.esg_kpi_definitions.update_one({"id": kpi["id"]}, {"$set": {"brsr_reference": "; ".join(dict.fromkeys(codes)), "framework_references": refs, "updated_at": now}})


if __name__ == "__main__":
    asyncio.run(main("--dry-run" in sys.argv))
