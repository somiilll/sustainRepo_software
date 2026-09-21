"""Assign canonical Activity Type values to non-biogenic Scope 3 Category 3 factors."""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import os
from pathlib import Path

from bson import json_util
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient


ELECTRICITY_ACTIVITIES = frozenset({
    "Coal (electricity generation - home produced coal only)",
    "Coal (electricity generation)",
    "Electricity - T&D losses and Generation",
})
STEAM_ACTIVITIES = frozenset({"Heat/Steam - Loss and Generation"})


def c3_activity_type(activity: object) -> str | None:
    name = str(activity or "").strip()
    if not name:
        return None
    if name in ELECTRICITY_ACTIVITIES:
        return "electricity"
    if name in STEAM_ACTIVITIES:
        return "steam"
    return "fuel"


async def migrate(*, apply: bool) -> None:
    load_dotenv("/app/backend/.env")
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    query = {
        "category": {"$regex": r"^C3(?:\s|\-|$)", "$options": "i"},
        "sub_scope": {"$ne": "biogenic"},
    }

    try:
        factors = await db.scope3_ef.find(
            query,
            {"_id": 0, "id": 1, "activity": 1, "activity_type": 1},
        ).to_list(None)
        planned = [
            {
                "id": factor["id"],
                "activity": factor.get("activity"),
                "from": factor.get("activity_type"),
                "to": c3_activity_type(factor.get("activity")),
            }
            for factor in factors
            if factor.get("id") and c3_activity_type(factor.get("activity"))
            and factor.get("activity_type") != c3_activity_type(factor.get("activity"))
        ]
        print(json_util.dumps({"matched": len(factors), "planned": len(planned)}, indent=2))
        if not apply:
            print("Dry run only. Re-run with --apply to persist C3 Activity Type values.")
            return

        backup = {
            "database": db.name,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "migration": "c3_activity_types",
            "changes": planned,
        }
        backup_dir = Path("/app/.emergent/backups")
        backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_path = backup_dir / f"c3-activity-types-{stamp}.json"
        backup_path.write_text(json_util.dumps(backup, indent=2), encoding="utf-8")

        updated = 0
        timestamp = datetime.now(timezone.utc).isoformat()
        for change in planned:
            result = await db.scope3_ef.update_one(
                {"id": change["id"]},
                {"$set": {"activity_type": change["to"], "updated_at": timestamp}},
            )
            updated += result.modified_count
        print(json_util.dumps({"updated": updated, "backup": str(backup_path)}, indent=2))
    finally:
        client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Assign C3 Fuel, Electricity, and Steam Activity Type values.")
    parser.add_argument("--apply", action="store_true", help="Persist the migration; default is dry run.")
    args = parser.parse_args()
    asyncio.run(migrate(apply=args.apply))