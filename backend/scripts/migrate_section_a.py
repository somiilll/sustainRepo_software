"""
Migration: Move BRSR Section A from esg_responses to organization_esg_responses

This script migrates Section A data to use the same collection as Section B/C,
ensuring unified storage and consistent behavior across all BRSR sections.
"""

import asyncio
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


async def migrate_section_a():
    """Migrate BRSR Section A from esg_responses to organization_esg_responses."""
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    print("=" * 60)
    print("Migration: BRSR Section A → organization_esg_responses")
    print("=" * 60)
    
    # Count existing records
    old_count = await db.esg_responses.count_documents({"section": "section_a"})
    print(f"\nFound {old_count} Section A records in esg_responses")
    
    if old_count == 0:
        print("Nothing to migrate. Exiting.")
        client.close()
        return
    
    # Fetch all Section A records from esg_responses
    cursor = db.esg_responses.find({"section": "section_a"}, {"_id": 0})
    old_records = await cursor.to_list(1000)
    
    # Group by org_id + reporting_year (to consolidate into single documents)
    grouped = {}
    for record in old_records:
        org_id = record.get("organization_id")
        reporting_year = record.get("reporting_year")
        key = (org_id, reporting_year)
        
        if key not in grouped:
            grouped[key] = {
                "records": [],
                "framework": record.get("framework", "brsr"),
                "section": "section_a",
            }
        grouped[key]["records"].append(record)
    
    print(f"Grouped into {len(grouped)} org+year combinations")
    
    # Migrate each group
    migrated_count = 0
    skipped_count = 0
    
    for (org_id, reporting_year), group_data in grouped.items():
        if not org_id or not reporting_year:
            print(f"  Skipping invalid record (org_id={org_id}, year={reporting_year})")
            skipped_count += 1
            continue
        
        framework = group_data["framework"].upper() if group_data["framework"] else "BRSR"
        section = group_data["section"]
        records = group_data["records"]
        
        # Build responses dict from individual records
        responses = {}
        response_statuses = {}
        
        for record in records:
            question_key = record.get("question_key")
            if not question_key:
                continue
            
            responses[question_key] = record.get("value")
            response_statuses[question_key] = {
                "status": "saved",
                "approval_status": record.get("approval_status", "approved"),
                "updated_at": record.get("updated_at"),
                "submitted_at": record.get("submitted_at"),
                "submitted_by": record.get("submitted_by"),
            }
        
        # Check if document already exists in organization_esg_responses
        existing = await db.organization_esg_responses.find_one({
            "org_id": org_id,
            "framework": framework,
            "reporting_year": reporting_year,
            "section": section,
        })
        
        now_iso = datetime.now(timezone.utc).isoformat()
        
        if existing:
            # Merge with existing (don't overwrite)
            existing_responses = existing.get("responses", {})
            existing_statuses = existing.get("response_statuses", {})
            
            # Only add responses that don't exist yet
            for qk, val in responses.items():
                if qk not in existing_responses:
                    existing_responses[qk] = val
                    existing_statuses[qk] = response_statuses.get(qk, {})
            
            await db.organization_esg_responses.update_one(
                {"id": existing["id"]},
                {
                    "$set": {
                        "responses": existing_responses,
                        "response_statuses": existing_statuses,
                        "updated_at": now_iso,
                    }
                }
            )
            print(f"  Updated existing: org={org_id[:8]}..., year={reporting_year}")
        else:
            # Create new document
            import uuid
            new_doc = {
                "id": str(uuid.uuid4()),
                "org_id": org_id,
                "framework": framework,
                "reporting_year": reporting_year,
                "section": section,
                "responses": responses,
                "response_statuses": response_statuses,
                "status": "saved",
                "created_at": now_iso,
                "updated_at": now_iso,
            }
            await db.organization_esg_responses.insert_one(new_doc)
            print(f"  Created new: org={org_id[:8]}..., year={reporting_year}, questions={len(responses)}")
        
        migrated_count += 1
    
    print(f"\n{'=' * 60}")
    print(f"Migration complete:")
    print(f"  - Migrated: {migrated_count} org+year combinations")
    print(f"  - Skipped: {skipped_count}")
    print(f"  - Total questions migrated: {len(old_records)}")
    print(f"\nNote: Original esg_responses records preserved for rollback safety.")
    print(f"Run cleanup after verifying migration success.")
    print(f"{'=' * 60}")
    
    client.close()


async def cleanup_old_records():
    """Remove migrated Section A records from esg_responses (run after verification)."""
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    count = await db.esg_responses.count_documents({"section": "section_a"})
    print(f"Found {count} Section A records to delete from esg_responses")
    
    if count > 0:
        confirm = input("Delete these records? (yes/no): ")
        if confirm.lower() == "yes":
            result = await db.esg_responses.delete_many({"section": "section_a"})
            print(f"Deleted {result.deleted_count} records")
        else:
            print("Cleanup cancelled")
    
    client.close()


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "--cleanup":
        asyncio.run(cleanup_old_records())
    else:
        asyncio.run(migrate_section_a())
