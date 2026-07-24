"""
Migration Script: Fix reporting_period.year for monthly records in financial year context

Problem: 
- For FY 2026-2027, months Jan/Feb/Mar were stored with year=2026 (FY start year)
- They should be stored with year=2027 (actual calendar year)

This script:
1. Finds all monthly records where month is Jan, Feb, or Mar
2. Checks if organization uses financial year reporting
3. Updates year to year+1 for those records (since they belong to next calendar year in FY context)

Run with: python -m scripts.migrate_reporting_periods
Dry run: python -m scripts.migrate_reporting_periods --dry-run
"""

import asyncio
import os
import sys
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "test_database")

# Months that belong to the next calendar year in FY (Apr-Mar)
JAN_FEB_MAR_MONTHS = ["January", "February", "March", "1", "2", "3", 1, 2, 3]


async def get_fy_organizations(db):
    """Get list of org_ids that use financial year reporting"""
    orgs = await db["organizations"].find(
        {"reporting_year_type": "financial_year"},
        {"_id": 1}
    ).to_list(1000)
    return [str(org["_id"]) for org in orgs]


async def migrate_environment_records():
    """Migrate environment_records collection"""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    collection = db["environment_records"]
    
    print("=" * 60)
    print("Migration: Fix reporting_period.year for Jan/Feb/Mar months")
    print("=" * 60)
    
    # Get organizations using financial year
    fy_orgs = await get_fy_organizations(db)
    print(f"\nOrganizations using financial year: {len(fy_orgs)}")
    
    # Find all monthly records with Jan, Feb, or Mar from FY organizations
    query = {
        "reporting_period.reporting_type": "monthly",
        "reporting_period.month": {"$in": JAN_FEB_MAR_MONTHS}
    }
    
    # Add org filter if we have FY orgs
    if fy_orgs:
        query["org_id"] = {"$in": fy_orgs}
    
    records = await collection.find(query).to_list(10000)
    print(f"\nFound {len(records)} records with Jan/Feb/Mar months in FY organizations")
    
    if len(records) == 0:
        # Fallback: If no org filter matched, try all records
        # (This handles cases where org_id might not be set or orgs collection is different)
        print("\nNo records found with org filter. Checking all Jan/Feb/Mar records...")
        query = {
            "reporting_period.reporting_type": "monthly",
            "reporting_period.month": {"$in": JAN_FEB_MAR_MONTHS}
        }
        records = await collection.find(query).to_list(10000)
        print(f"Found {len(records)} total Jan/Feb/Mar records")
    
    if len(records) == 0:
        print("No records to migrate.")
        client.close()
        return
    
    # Preview changes
    print("\nPreview of changes (first 15):")
    print("-" * 60)
    for record in records[:15]:
        rp = record.get("reporting_period", {})
        old_year = rp.get("year")
        month = rp.get("month")
        new_year = old_year + 1 if old_year else None
        category = record.get("category", "Unknown")
        print(f"  {category}: {month} {old_year} → {month} {new_year}")
    
    if len(records) > 15:
        print(f"  ... and {len(records) - 15} more records")
    
    # Confirm migration
    print("\n" + "-" * 60)
    confirm = input("Proceed with migration? (yes/no): ").strip().lower()
    
    if confirm != "yes":
        print("Migration cancelled.")
        client.close()
        return
    
    # Perform migration
    print("\nMigrating records...")
    updated_count = 0
    errors = []
    
    for record in records:
        try:
            record_id = record["_id"]
            old_year = record.get("reporting_period", {}).get("year")
            
            if old_year is None:
                continue
            
            new_year = old_year + 1
            
            result = await collection.update_one(
                {"_id": record_id},
                {
                    "$set": {
                        "reporting_period.year": new_year,
                        "updated_at": datetime.utcnow().isoformat()
                    }
                }
            )
            
            if result.modified_count > 0:
                updated_count += 1
        except Exception as e:
            errors.append(f"Record {record.get('_id')}: {str(e)}")
    
    print(f"\n✅ Migration complete!")
    print(f"   Updated: {updated_count} records")
    
    if errors:
        print(f"\n⚠️ Errors ({len(errors)}):")
        for err in errors[:10]:
            print(f"   - {err}")
    
    client.close()


async def dry_run():
    """Preview what would be migrated without making changes"""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    collection = db["environment_records"]
    
    print("=" * 60)
    print("DRY RUN: Preview migration changes")
    print("=" * 60)
    
    # Get organizations using financial year
    fy_orgs = await get_fy_organizations(db)
    print(f"\nOrganizations using financial year: {len(fy_orgs)}")
    
    query = {
        "reporting_period.reporting_type": "monthly",
        "reporting_period.month": {"$in": JAN_FEB_MAR_MONTHS}
    }
    
    records = await collection.find(query).to_list(10000)
    print(f"\nFound {len(records)} records that would be migrated:\n")
    
    for record in records:
        rp = record.get("reporting_period", {})
        old_year = rp.get("year")
        month = rp.get("month")
        new_year = old_year + 1 if old_year else None
        category = record.get("category", "Unknown")
        subcategory = record.get("subcategory", "")
        facility_id = record.get("facility_id", "org-level")
        print(f"  [{category}/{subcategory}] {month} {old_year} → {month} {new_year} (facility: {facility_id})")
    
    client.close()


async def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--dry-run":
        await dry_run()
    else:
        await migrate_environment_records()


if __name__ == "__main__":
    asyncio.run(main())
