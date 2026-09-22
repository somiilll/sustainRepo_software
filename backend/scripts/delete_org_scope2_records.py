"""Delete current Scope 2 emissions for one organization with linked history/audit cleanup."""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import os
from pathlib import Path

from bson import json_util
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient


SCOPE_2_VALUES = ["Scope 2", "scope 2", "Scope2", "scope2", "2", 2]


async def delete_scope_2(*, organization_name: str, apply: bool) -> None:
    load_dotenv("/app/backend/.env")
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    try:
        organizations = await db.organizations.find(
            {"name": {"$regex": f"^{organization_name}$", "$options": "i"}},
            {"_id": 0},
        ).to_list(None)
        if len(organizations) != 1:
            raise RuntimeError(f"Expected one organization named {organization_name!r}; found {len(organizations)}.")

        organization = organizations[0]
        organization_id = organization["id"]
        record_query = {
            "organization_id": organization_id,
            "scope": {"$in": SCOPE_2_VALUES},
        }
        records = await db.emission_records.find(record_query).to_list(None)
        record_ids = [record["id"] for record in records if record.get("id")]
        history_query = {"emission_id": {"$in": record_ids}}
        audit_query = {"emission_record_id": {"$in": record_ids}}
        history = await db.emission_history.find(history_query).to_list(None) if record_ids else []
        calculation_audits = await db.ce_calculation_audit_logs.find(audit_query).to_list(None) if record_ids else []

        preview = {
            "organization": {"id": organization_id, "name": organization.get("name")},
            "scope_2_emission_records": len(records),
            "linked_emission_history": len(history),
            "linked_calculation_audits": len(calculation_audits),
            "record_ids": record_ids,
        }
        print(json_util.dumps(preview, indent=2))
        if not apply:
            print("Dry run only. Re-run with --apply to delete these records.")
            return

        backup_dir = Path("/app/.emergent/backups")
        backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_path = backup_dir / f"{organization_name.lower()}-scope2-delete-{stamp}.json"
        backup_path.write_text(
            json_util.dumps(
                {
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "preview": preview,
                    "emission_records": records,
                    "emission_history": history,
                    "ce_calculation_audit_logs": calculation_audits,
                },
                indent=2,
            ),
            encoding="utf-8",
        )

        deleted_history = await db.emission_history.delete_many(history_query) if record_ids else None
        deleted_audits = await db.ce_calculation_audit_logs.delete_many(audit_query) if record_ids else None
        deleted_records = await db.emission_records.delete_many(record_query)
        print(json_util.dumps({
            "deleted_emission_records": deleted_records.deleted_count,
            "deleted_emission_history": deleted_history.deleted_count if deleted_history else 0,
            "deleted_calculation_audits": deleted_audits.deleted_count if deleted_audits else 0,
            "backup": str(backup_path),
        }, indent=2))
    finally:
        client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Delete current Scope 2 records for a local organization.")
    parser.add_argument("organization_name", help="Exact organization name, case-insensitive")
    parser.add_argument("--apply", action="store_true", help="Persist deletion; default is dry run")
    args = parser.parse_args()
    asyncio.run(delete_scope_2(organization_name=args.organization_name, apply=args.apply))