"""
ESG Task Workflow Status Migration

Migrates from single 'status' field to dual 'status' + 'approval_status' architecture.

OLD STATUS → NEW STATUS + APPROVAL_STATUS:
- pending → status=pending, approval_status=not_required
- backfill_pending → status=backfill_pending, approval_status=not_required  
- in_progress → status=in_progress, approval_status=not_required
- submitted → status=completed, approval_status=pending_approval (if requires_approval) OR not_required
- approved → status=completed, approval_status=approved
- overdue → status=overdue, approval_status=not_required
- skipped → status=skipped, approval_status=not_required
- rejected → status=reopened, approval_status=rejected

Run: python -m scripts.migrate_task_status_architecture [--live]
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
import os


# New status enums
class OperationalStatus:
    BACKFILL_PENDING = "backfill_pending"
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    OVERDUE = "overdue"
    SKIPPED = "skipped"
    REOPENED = "reopened"


class ApprovalStatus:
    NOT_REQUIRED = "not_required"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"


async def migrate_tasks(db, dry_run=True):
    """Migrate esg_reporting_tasks collection."""
    print("\n=== Migrating esg_reporting_tasks ===")
    
    tasks = db["esg_reporting_tasks"]
    
    # Get counts before
    total = await tasks.count_documents({})
    has_approval_status = await tasks.count_documents({"approval_status": {"$exists": True}})
    print(f"Total tasks: {total}")
    print(f"Already have approval_status: {has_approval_status}")
    
    if has_approval_status == total:
        print("All tasks already migrated!")
        return
    
    # Migration rules
    migrations = [
        # submitted → completed + pending_approval (assume approval required if was submitted)
        {
            "filter": {"status": "submitted", "approval_status": {"$exists": False}},
            "update": {"$set": {
                "status": OperationalStatus.COMPLETED,
                "approval_status": ApprovalStatus.PENDING_APPROVAL,
                "completed_at": datetime.now(timezone.utc),
            }}
        },
        # approved → completed + approved
        {
            "filter": {"status": "approved", "approval_status": {"$exists": False}},
            "update": {"$set": {
                "status": OperationalStatus.COMPLETED,
                "approval_status": ApprovalStatus.APPROVED,
            }}
        },
        # rejected → reopened + rejected
        {
            "filter": {"status": "rejected", "approval_status": {"$exists": False}},
            "update": {"$set": {
                "status": OperationalStatus.REOPENED,
                "approval_status": ApprovalStatus.REJECTED,
            }}
        },
        # pending/backfill_pending/in_progress/overdue/skipped → keep status + not_required
        {
            "filter": {
                "status": {"$in": ["pending", "backfill_pending", "in_progress", "overdue", "skipped"]},
                "approval_status": {"$exists": False}
            },
            "update": {"$set": {"approval_status": ApprovalStatus.NOT_REQUIRED}}
        },
    ]
    
    for rule in migrations:
        count = await tasks.count_documents(rule["filter"])
        print(f"  {rule['filter'].get('status', 'other')} → {count} tasks")
        
        if not dry_run and count > 0:
            result = await tasks.update_many(rule["filter"], rule["update"])
            print(f"    Updated: {result.modified_count}")
    
    # Set default for any remaining
    if not dry_run:
        remaining = await tasks.count_documents({"approval_status": {"$exists": False}})
        if remaining > 0:
            result = await tasks.update_many(
                {"approval_status": {"$exists": False}},
                {"$set": {"approval_status": ApprovalStatus.NOT_REQUIRED}}
            )
            print(f"  Remaining tasks defaulted to not_required: {result.modified_count}")


async def migrate_assignments(db, dry_run=True):
    """Migrate esg_assignments collection."""
    print("\n=== Migrating esg_assignments ===")
    
    assignments = db["esg_assignments"]
    
    total = await assignments.count_documents({})
    has_approval_status = await assignments.count_documents({"approval_status": {"$exists": True}})
    print(f"Total assignments: {total}")
    print(f"Already have approval_status: {has_approval_status}")
    
    if has_approval_status == total:
        print("All assignments already migrated!")
        return
    
    # Same migration rules
    migrations = [
        {
            "filter": {"status": "submitted", "approval_status": {"$exists": False}},
            "update": {"$set": {
                "status": OperationalStatus.COMPLETED,
                "approval_status": ApprovalStatus.PENDING_APPROVAL,
            }}
        },
        {
            "filter": {"status": "approved", "approval_status": {"$exists": False}},
            "update": {"$set": {
                "status": OperationalStatus.COMPLETED,
                "approval_status": ApprovalStatus.APPROVED,
            }}
        },
        {
            "filter": {
                "status": {"$in": ["pending", "in_progress", "overdue"]},
                "approval_status": {"$exists": False}
            },
            "update": {"$set": {"approval_status": ApprovalStatus.NOT_REQUIRED}}
        },
    ]
    
    for rule in migrations:
        count = await assignments.count_documents(rule["filter"])
        print(f"  {rule['filter'].get('status', 'other')} → {count} assignments")
        
        if not dry_run and count > 0:
            result = await assignments.update_many(rule["filter"], rule["update"])
            print(f"    Updated: {result.modified_count}")
    
    # Default remaining
    if not dry_run:
        remaining = await assignments.count_documents({"approval_status": {"$exists": False}})
        if remaining > 0:
            result = await assignments.update_many(
                {"approval_status": {"$exists": False}},
                {"$set": {"approval_status": ApprovalStatus.NOT_REQUIRED}}
            )
            print(f"  Remaining defaulted: {result.modified_count}")


async def create_indexes(db):
    """Create indexes for new fields."""
    print("\n=== Creating indexes ===")
    
    await db["esg_reporting_tasks"].create_index([("status", 1), ("approval_status", 1)])
    await db["esg_reporting_tasks"].create_index([("approval_status", 1)])
    print("  Created indexes on esg_reporting_tasks")
    
    await db["esg_assignments"].create_index([("status", 1), ("approval_status", 1)])
    print("  Created indexes on esg_assignments")


async def verify_migration(db):
    """Verify migration results."""
    print("\n=== Verification ===")
    
    # Tasks
    tasks_pipeline = [
        {"$group": {
            "_id": {"status": "$status", "approval_status": "$approval_status"},
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id.status": 1}}
    ]
    task_stats = await db["esg_reporting_tasks"].aggregate(tasks_pipeline).to_list(50)
    
    print("\nTask status distribution:")
    for s in task_stats:
        print(f"  {s['_id']['status']} / {s['_id'].get('approval_status', 'N/A')}: {s['count']}")
    
    # Check for missing approval_status
    missing = await db["esg_reporting_tasks"].count_documents({"approval_status": {"$exists": False}})
    print(f"\nTasks missing approval_status: {missing}")
    
    # Assignments
    assign_stats = await db["esg_assignments"].aggregate(tasks_pipeline).to_list(50)
    print("\nAssignment status distribution:")
    for s in assign_stats:
        print(f"  {s['_id']['status']} / {s['_id'].get('approval_status', 'N/A')}: {s['count']}")


async def run_migration(dry_run=True):
    """Run the full migration."""
    client = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    db = client[os.environ.get("DB_NAME", "test_database")]
    
    print("=" * 60)
    print("ESG TASK STATUS ARCHITECTURE MIGRATION")
    print(f"Mode: {'DRY RUN' if dry_run else 'LIVE'}")
    print("=" * 60)
    
    await migrate_tasks(db, dry_run)
    await migrate_assignments(db, dry_run)
    
    if not dry_run:
        await create_indexes(db)
    
    await verify_migration(db)
    
    print("\n" + "=" * 60)
    print("MIGRATION " + ("DRY RUN COMPLETE" if dry_run else "COMPLETE"))
    print("=" * 60)
    
    client.close()


if __name__ == "__main__":
    import sys
    dry_run = "--live" not in sys.argv
    asyncio.run(run_migration(dry_run))
