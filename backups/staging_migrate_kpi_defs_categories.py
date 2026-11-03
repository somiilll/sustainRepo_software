import os
import json
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

LOCAL_MONGO = os.environ['MONGO_URL']
LOCAL_DB = os.environ['DB_NAME']
STAGING_MONGO = os.environ['STAGING_MONGO_URL']
STAGING_DB = os.environ['STAGING_DB_NAME']

TS = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
BACKUP_DIR = Path(f'/app/backups/staging_migration_{TS}')
BACKUP_DIR.mkdir(parents=True, exist_ok=True)

COLLECTIONS_TO_REPLACE = ['esg_kpi_definitions', 'esg_record_categories']
EMPTY_COLLECTIONS_TO_CREATE = ['brsr_kpi_import_proposals', 'esg_org_configs']


async def dump_collection(db, name, path):
    docs = await db[name].find({}).to_list(None)
    for d in docs:
        d['_id'] = str(d['_id'])
    with open(path, 'w') as f:
        json.dump(docs, f, default=str)
    return len(docs)


async def main():
    local = AsyncIOMotorClient(LOCAL_MONGO)[LOCAL_DB]
    staging = AsyncIOMotorClient(STAGING_MONGO, tlsCAFile=None)[STAGING_DB] if False else AsyncIOMotorClient(STAGING_MONGO)[STAGING_DB]

    print(f"Backup dir: {BACKUP_DIR}")

    # 1. Backup staging collections before any destructive change
    for col in COLLECTIONS_TO_REPLACE:
        count = await dump_collection(staging, col, BACKUP_DIR / f'staging_{col}_backup.json')
        print(f"Backed up staging.{col}: {count} docs -> staging_{col}_backup.json")

    # also backup current (empty) kpi_framework_mappings on staging just in case
    count = await dump_collection(staging, 'kpi_framework_mappings', BACKUP_DIR / 'staging_kpi_framework_mappings_backup.json')
    print(f"Backed up staging.kpi_framework_mappings: {count} docs")

    # 2. Delete + copy esg_kpi_definitions and esg_record_categories from local -> staging
    for col in COLLECTIONS_TO_REPLACE:
        local_docs = await local[col].find({}).to_list(None)
        for d in local_docs:
            d.pop('_id', None)  # let staging assign its own ObjectId; custom "id" (uuid) field is preserved
        del_result = await staging[col].delete_many({})
        if local_docs:
            await staging[col].insert_many(local_docs)
        print(f"staging.{col}: deleted {del_result.deleted_count}, inserted {len(local_docs)} (copied from local)")

    # 3. Create empty collections (no data) if they don't already exist
    existing_cols = set(await staging.list_collection_names())
    for col in EMPTY_COLLECTIONS_TO_CREATE:
        if col not in existing_cols:
            await staging.create_collection(col)
            print(f"Created empty collection staging.{col}")
        else:
            print(f"staging.{col} already exists, left as-is (count={await staging[col].count_documents({})})")

    print("\nDONE. Backups saved at:", BACKUP_DIR)

asyncio.run(main())
