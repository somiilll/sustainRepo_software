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
PROD_MONGO = os.environ['PROD_MONGO_URL']
PROD_DB = 'sustainrepo'

TS = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
BACKUP_DIR = Path(f'/app/backups/prod_migration_{TS}')
BACKUP_DIR.mkdir(parents=True, exist_ok=True)

COLLECTIONS_TO_REPLACE = ['esg_kpi_definitions', 'esg_record_categories', 'kpi_framework_mappings', 'esg_question_configs']
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
    prod = AsyncIOMotorClient(PROD_MONGO)[PROD_DB]

    print(f"Backup dir: {BACKUP_DIR}")

    # 1. Backup prod collections before any destructive change
    for col in COLLECTIONS_TO_REPLACE:
        count = await dump_collection(prod, col, BACKUP_DIR / f'prod_{col}_backup.json')
        print(f"Backed up prod.{col}: {count} docs")

    # 2. Delete + copy from local -> prod
    for col in COLLECTIONS_TO_REPLACE:
        local_docs = await local[col].find({}).to_list(None)
        for d in local_docs:
            d.pop('_id', None)
        del_result = await prod[col].delete_many({})
        if local_docs:
            await prod[col].insert_many(local_docs)
        print(f"prod.{col}: deleted {del_result.deleted_count}, inserted {len(local_docs)} (copied from local)")

    # 3. Create empty collections (no data) if they don't already exist
    existing_cols = set(await prod.list_collection_names())
    for col in EMPTY_COLLECTIONS_TO_CREATE:
        if col not in existing_cols:
            await prod.create_collection(col)
            print(f"Created empty collection prod.{col}")
        else:
            print(f"prod.{col} already exists, left as-is (count={await prod[col].count_documents({})})")

    print("\nDONE. Backups saved at:", BACKUP_DIR)

asyncio.run(main())
