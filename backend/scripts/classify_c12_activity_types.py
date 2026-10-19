"""Persist C12 disposal taxonomy fields without changing factor identities or calculations."""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import os
from pathlib import Path
import re

from bson import json_util
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient


DISPOSAL_TYPES = (
    ("anaerobically_digested_wet_digestate_with_curing", "Anaerobically Digested (Wet Digestate with Curing)"),
    ("anaerobically_digested_dry_digestate_with_curing", "Anaerobically Digested (Dry Digestate with Curing)"),
    ("landfilled", "Landfilled"),
    ("recycled", "Recycled"),
    ("combusted", "Combusted"),
    ("composted", "Composted"),
)
TYPE_LABELS = {value: label for value, label in DISPOSAL_TYPES} | {"other": "Other"}
C12_PATTERN = re.compile(r"(^|\s)c12\b|end[-\s]?of[-\s]?life.*sold products", re.IGNORECASE)


def is_c12_factor(factor: dict) -> bool:
    identities = (
        factor.get("category_code"),
        factor.get("category"),
        factor.get("category_name"),
    )
    return any(
        str(identity or "").strip().lower() == "end_of_life_treatment_of_sold_products"
        or bool(C12_PATTERN.search(str(identity or "").strip()))
        for identity in identities
    )


def derive_taxonomy(factor: dict) -> tuple[str, str, str]:
    raw_activity = str(factor.get("activity") or factor.get("activity_name") or "").strip()
    if not raw_activity:
        raise ValueError(f"C12 factor {factor.get('id') or '<unknown>'} has no activity name")
    existing_name = str(factor.get("activity_name") or "").strip()
    existing_type = str(factor.get("activity_type") or "").strip()
    matched = next(
        ((value, label) for value, label in DISPOSAL_TYPES if raw_activity.lower().endswith(f" - {label.lower()}")),
        None,
    )
    base_activity = raw_activity[:-(len(matched[1]) + 3)].strip() if matched else raw_activity
    activity_name = existing_name if existing_name and existing_name.lower() != raw_activity.lower() else base_activity
    activity_type = existing_type or (matched[0] if matched else "other")
    return activity_name, activity_type, TYPE_LABELS.get(activity_type, activity_type.replace("_", " ").title())


async def run(apply: bool) -> None:
    load_dotenv("/app/backend/.env")
    mongo_url = os.environ.get("MONGO_URL")
    database_name = os.environ.get("DB_NAME")
    if not mongo_url or not database_name:
        raise RuntimeError("MONGO_URL and DB_NAME must be configured")

    client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=15000)
    db = client[database_name]
    try:
        factors = await db.scope3_ef.find({}, {"_id": 0}).to_list(None)
        c12_factors = [factor for factor in factors if is_c12_factor(factor)]
        updates = []
        for factor in c12_factors:
            activity_name, activity_type, activity_type_label = derive_taxonomy(factor)
            fields = {
                "activity_name": activity_name,
                "activity_type": activity_type,
                "activity_type_label": activity_type_label,
            }
            if any(factor.get(key) != value for key, value in fields.items()):
                updates.append({"id": factor.get("id"), "fields": fields})

        print(json_util.dumps({
            "database": database_name,
            "c12_factor_count": len(c12_factors),
            "factors_to_update": len(updates),
            "mode": "apply" if apply else "dry_run",
        }, indent=2))
        if not apply:
            return
        if any(not item["id"] for item in updates):
            raise RuntimeError("Every C12 factor must have an id before updates can be applied")

        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_dir = Path("/app/.emergent/backups") / f"c12-activity-taxonomy-{stamp}"
        backup_dir.mkdir(parents=True, exist_ok=False)
        (backup_dir / "before.json").write_text(json_util.dumps(c12_factors, indent=2), encoding="utf-8")

        for item in updates:
            await db.scope3_ef.update_one({"id": item["id"]}, {"$set": item["fields"]})
        print(json_util.dumps({
            "status": "applied",
            "updated_count": len(updates),
            "backup": str(backup_dir),
        }, indent=2))
    finally:
        client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Persist activity taxonomy for Scope 3 Category 12 factors.")
    parser.add_argument("--apply", action="store_true", help="Write the C12 taxonomy fields after creating a backup.")
    asyncio.run(run(parser.parse_args().apply))