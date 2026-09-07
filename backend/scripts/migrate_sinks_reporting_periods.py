"""Backfill canonical GHG-style reporting periods for existing carbon sink records."""
import argparse
import asyncio
import os
import sys

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from modules.sinks.periods import migrate_sink_period_fields

load_dotenv()


async def migrate(apply: bool) -> int:
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        raise RuntimeError("MONGO_URL and DB_NAME must be configured")

    client = AsyncIOMotorClient(mongo_url)
    database = client[db_name]
    updated = skipped = 0
    organization_cache = {}

    try:
        async for sink in database.sinks.find({}, {"_id": 0}):
            org_id = sink.get("organization_id")
            if org_id not in organization_cache:
                organization_cache[org_id] = await database.organizations.find_one({"id": org_id}, {"_id": 0}) or {}
            try:
                fields = migrate_sink_period_fields(sink, organization_cache[org_id])
            except ValueError as error:
                skipped += 1
                print(f"SKIP {sink.get('id')}: {error}")
                continue

            changed = {key: value for key, value in fields.items() if sink.get(key) != value}
            if not changed:
                continue
            updated += 1
            print(f"{'APPLY' if apply else 'DRY RUN'} {sink.get('id')}: {changed}")
            if apply:
                await database.sinks.update_one({"id": sink["id"]}, {"$set": changed})
    finally:
        client.close()

    print(f"Completed: {updated} records {'updated' if apply else 'pending'}, {skipped} skipped.")
    return skipped


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate Sinks to canonical reporting_period storage.")
    parser.add_argument("--apply", action="store_true", help="Persist updates; default is a dry run.")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(migrate(args.apply)))