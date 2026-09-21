"""Backup and reset approved staging GHG data without touching R2 or account data."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from bson import json_util
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient


TARGET_DB_NAME = "sustainrepo_staging"
FULL_RESET_COLLECTIONS = (
    "emission_records",
    "emission_history",
    "pending_records",
    "pending_emission_records",
    "ce_calculation_audit_logs",
    "bulk_upload_jobs",
    "bulk_upload_pending_records",
    "bulk_upload_errors",
    "supplier_ghg_submissions",
    "base_year_emissions",
    "base_year_history_events",
    "base_year_emissions_deletions",
)
APPROVAL_FILTER = {
    "$or": [
        {"entity_type": "emission_record"},
        {"entity_collection": "emission_records"},
    ],
}
APPROVAL_COLLECTIONS = ("approval_requests", "approval_history")
PRESERVED_COLLECTIONS = (
    "organizations",
    "facilities",
    "users",
    "supplier_relationships",
    "supplier_assessment_programs",
    "peer_benchmarking",
    "esg_targets",
    "uploaded_files",
    "sinks",
    "environment_records",
    "social_records",
    "governance_records",
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def reset_plan(db) -> dict[str, Any]:
    full_counts = {
        collection: await db[collection].count_documents({})
        for collection in FULL_RESET_COLLECTIONS
    }
    approval_counts = {
        collection: await db[collection].count_documents(APPROVAL_FILTER)
        for collection in APPROVAL_COLLECTIONS
    }
    return {
        "database": db.name,
        "created_at": now_iso(),
        "delete_counts": {**full_counts, **approval_counts},
        "delete_total": sum(full_counts.values()) + sum(approval_counts.values()),
        "preserved": list(PRESERVED_COLLECTIONS),
        "r2_action": "untouched",
        "uploaded_files_action": "untouched",
    }


async def create_backup(db, plan: dict[str, Any]) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_dir = Path("/app/.emergent/backups") / f"staging-ghg-reset-{stamp}"
    backup_dir.mkdir(parents=True, exist_ok=False)
    documents = {
        collection: await db[collection].find({}).to_list(None)
        for collection in FULL_RESET_COLLECTIONS
    }
    documents.update({
        collection: await db[collection].find(APPROVAL_FILTER).to_list(None)
        for collection in APPROVAL_COLLECTIONS
    })
    payload = {
        "backup_type": "staging-ghg-reset",
        "created_at": now_iso(),
        "database": db.name,
        "plan": plan,
        "documents": documents,
        "not_deleted": {
            "r2_objects": "User selected MongoDB-only reset.",
            "uploaded_files": "Metadata remains so R2 objects retain their database references.",
            "preserved_collections": list(PRESERVED_COLLECTIONS),
        },
    }
    (backup_dir / "before-reset.json").write_text(json_util.dumps(payload, indent=2), encoding="utf-8")
    return backup_dir


async def apply_reset(db) -> dict[str, int]:
    deleted: dict[str, int] = {}
    client = db.client
    async with await client.start_session() as session:
        async with session.start_transaction():
            for collection in FULL_RESET_COLLECTIONS:
                result = await db[collection].delete_many({}, session=session)
                deleted[collection] = result.deleted_count
            for collection in APPROVAL_COLLECTIONS:
                result = await db[collection].delete_many(APPROVAL_FILTER, session=session)
                deleted[collection] = result.deleted_count
    return deleted


async def validate_empty(db) -> dict[str, int]:
    remaining = {
        collection: await db[collection].count_documents({})
        for collection in FULL_RESET_COLLECTIONS
    }
    remaining.update({
        collection: await db[collection].count_documents(APPROVAL_FILTER)
        for collection in APPROVAL_COLLECTIONS
    })
    return {collection: count for collection, count in remaining.items() if count}


async def run(*, apply: bool) -> None:
    settings = dotenv_values("/app/backend/.env")
    uri = os.environ.get("STAGING_MONGO_URL") or settings.get("STAGING_MONGO_URL")
    db_name = os.environ.get("STAGING_DB_NAME") or settings.get("STAGING_DB_NAME")
    if not uri or db_name != TARGET_DB_NAME:
        raise RuntimeError("STAGING_MONGO_URL and STAGING_DB_NAME=sustainrepo_staging are required")

    client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=15000, retryWrites=True)
    db = client[db_name]
    try:
        await client.admin.command("ping")
        plan = await reset_plan(db)
        print(json.dumps(plan, indent=2, default=str))
        if not apply:
            print("Dry run only. Re-run with --apply to create the backup and delete only the approved GHG data.")
            return

        backup_path = await create_backup(db, plan)
        deleted = await apply_reset(db)
        remaining = await validate_empty(db)
        if remaining:
            raise RuntimeError(f"Reset transaction committed but validation found remaining GHG data; restore {backup_path}: {remaining}")
        print(json.dumps({
            "status": "applied",
            "database": db.name,
            "deleted": deleted,
            "backup": str(backup_path),
            "r2_action": "untouched",
            "uploaded_files_action": "untouched",
        }, indent=2))
    finally:
        client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backup and reset approved staging GHG data without touching R2.")
    parser.add_argument("--apply", action="store_true", help="Persist the approved MongoDB-only reset.")
    arguments = parser.parse_args()
    asyncio.run(run(apply=arguments.apply))