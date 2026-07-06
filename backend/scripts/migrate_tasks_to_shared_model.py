"""
ESG Task Migration Script: Duplicate Tasks -> Shared Tasks with Assignees

This script performs a one-time migration to:
1. Identify duplicate tasks (same org/facility/category/subcategory/sub_subcategory/period_key)
2. Merge duplicates into single canonical tasks (keeping the one with most complete status)
3. Create esg_task_assignees entries for all users who were assigned
4. Remove assigned_to_user_id from task documents

Run with: python -m scripts.migrate_tasks_to_shared_model
"""

import asyncio
import uuid
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os
from collections import defaultdict


async def run_migration(dry_run: bool = True):
    """
    Execute the migration.
    
    Args:
        dry_run: If True, only report what would happen without making changes.
    """
    client = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    db = client[os.environ.get("DB_NAME", "test_database")]
    
    print("=" * 60)
    print("ESG TASK MIGRATION: Shared Tasks with Multiple Assignees")
    print(f"Mode: {'DRY RUN (no changes)' if dry_run else 'LIVE MIGRATION'}")
    print("=" * 60)
    
    tasks_collection = db["esg_reporting_tasks"]
    assignees_collection = db["esg_task_assignees"]
    
    # Step 1: Get all tasks grouped by unique key
    print("\n[Step 1] Analyzing existing tasks...")
    
    all_tasks = await tasks_collection.find({}, {"_id": 0}).to_list(None)
    total_tasks = len(all_tasks)
    print(f"  Total tasks found: {total_tasks}")
    
    # Group tasks by unique key
    task_groups = defaultdict(list)
    for task in all_tasks:
        unique_key = (
            task.get("organization_id"),
            task.get("facility_id"),
            task.get("category"),
            task.get("subcategory"),
            task.get("sub_subcategory"),
            task.get("period_key"),
        )
        task_groups[unique_key].append(task)
    
    unique_obligations = len(task_groups)
    duplicate_groups = sum(1 for tasks in task_groups.values() if len(tasks) > 1)
    total_duplicates = sum(len(tasks) - 1 for tasks in task_groups.values() if len(tasks) > 1)
    
    print(f"  Unique reporting obligations: {unique_obligations}")
    print(f"  Groups with duplicates: {duplicate_groups}")
    print(f"  Total duplicate tasks to merge: {total_duplicates}")
    
    # Step 2: Determine canonical task for each group and collect assignees
    print("\n[Step 2] Processing task groups...")
    
    # Status priority for choosing canonical task (higher = better)
    STATUS_PRIORITY = {
        "approved": 6,
        "submitted": 5,
        "in_progress": 4,
        "saved": 4,  # Same as in_progress
        "pending": 3,
        "backfill_pending": 2,
        "overdue": 1,
        "skipped": 0,
    }
    
    canonical_tasks = []  # Tasks to keep (updated)
    tasks_to_delete = []  # Task IDs to delete
    assignee_entries = []  # New esg_task_assignees documents
    
    now = datetime.now(timezone.utc)
    
    for unique_key, group_tasks in task_groups.items():
        # Sort by status priority (desc) then by updated_at (desc) to get best candidate
        sorted_tasks = sorted(
            group_tasks,
            key=lambda t: (
                STATUS_PRIORITY.get(t.get("status", "pending"), 0),
                t.get("updated_at") or t.get("created_at") or datetime.min,
            ),
            reverse=True
        )
        
        # The canonical task is the first (best status/most recently updated)
        canonical = sorted_tasks[0]
        canonical_id = canonical["id"]
        org_id = canonical.get("organization_id")
        
        # Collect all unique user assignments across all duplicates
        seen_users = set()
        for task in sorted_tasks:
            user_id = task.get("assigned_to_user_id")
            assignment_id = task.get("assignment_id")
            
            if user_id and user_id not in seen_users:
                seen_users.add(user_id)
                
                # Create assignee entry
                assignee_entry = {
                    "id": str(uuid.uuid4()),
                    "task_id": canonical_id,
                    "assignment_id": assignment_id,
                    "organization_id": org_id,
                    "user_id": user_id,
                    "user_name": None,  # Will be populated later if needed
                    "user_email": None,
                    "role": "editor",  # Default role
                    "assigned_by_user_id": None,
                    "assigned_by_name": None,
                    "is_active": True,
                    "created_at": now,
                    "updated_at": now,
                }
                assignee_entries.append(assignee_entry)
        
        # Mark non-canonical tasks for deletion
        for task in sorted_tasks[1:]:
            tasks_to_delete.append(task["id"])
        
        # Prepare canonical task update (remove assigned_to_user_id)
        canonical_update = {
            "id": canonical_id,
            "remove_user_id": True,
            "assignee_count": len(seen_users),
        }
        canonical_tasks.append(canonical_update)
    
    print(f"  Canonical tasks to keep: {len(canonical_tasks)}")
    print(f"  Tasks to delete: {len(tasks_to_delete)}")
    print(f"  Assignee entries to create: {len(assignee_entries)}")
    
    # Step 3: Show sample changes
    print("\n[Step 3] Sample changes preview:")
    
    sample_groups = list(task_groups.items())[:3]
    for key, tasks in sample_groups:
        if len(tasks) > 1:
            print(f"\n  Group: {key[2]}/{key[3]} | Period: {key[5]}")
            print(f"    Tasks in group: {len(tasks)}")
            print(f"    Users: {[t.get('assigned_to_user_id', 'N/A')[:8] for t in tasks]}")
            print(f"    Statuses: {[t.get('status') for t in tasks]}")
    
    if dry_run:
        print("\n" + "=" * 60)
        print("DRY RUN COMPLETE - No changes made")
        print("Re-run with dry_run=False to execute migration")
        print("=" * 60)
        client.close()
        return {
            "dry_run": True,
            "total_tasks": total_tasks,
            "unique_obligations": unique_obligations,
            "tasks_to_delete": len(tasks_to_delete),
            "assignees_to_create": len(assignee_entries),
        }
    
    # Step 4: Execute migration
    print("\n[Step 4] Executing migration...")
    
    # 4a: Create index on esg_task_assignees
    print("  Creating indexes...")
    await assignees_collection.create_index([("task_id", 1), ("user_id", 1)], unique=True)
    await assignees_collection.create_index([("user_id", 1), ("organization_id", 1)])
    await assignees_collection.create_index([("organization_id", 1)])
    
    # 4b: Insert assignee entries
    print(f"  Inserting {len(assignee_entries)} assignee entries...")
    if assignee_entries:
        await assignees_collection.insert_many(assignee_entries)
    
    # 4c: Delete duplicate tasks
    print(f"  Deleting {len(tasks_to_delete)} duplicate tasks...")
    if tasks_to_delete:
        delete_result = await tasks_collection.delete_many({"id": {"$in": tasks_to_delete}})
        print(f"    Deleted: {delete_result.deleted_count}")
    
    # 4d: Remove assigned_to_user_id from all remaining tasks
    print("  Removing assigned_to_user_id field from canonical tasks...")
    unset_result = await tasks_collection.update_many(
        {},
        {"$unset": {"assigned_to_user_id": ""}}
    )
    print(f"    Modified: {unset_result.modified_count}")
    
    # 4e: Create unique index on tasks to prevent future duplicates
    print("  Creating unique compound index on tasks...")
    try:
        await tasks_collection.create_index(
            [
                ("organization_id", 1),
                ("facility_id", 1),
                ("category", 1),
                ("subcategory", 1),
                ("sub_subcategory", 1),
                ("period_key", 1),
            ],
            unique=True,
            name="unique_reporting_obligation"
        )
    except Exception as e:
        print(f"    Warning: Could not create unique index (may already exist): {e}")
    
    # Step 5: Verification
    print("\n[Step 5] Verifying migration...")
    
    final_task_count = await tasks_collection.count_documents({})
    assignee_count = await assignees_collection.count_documents({})
    
    # Check for any remaining tasks with assigned_to_user_id
    legacy_count = await tasks_collection.count_documents({"assigned_to_user_id": {"$exists": True}})
    
    print(f"  Final task count: {final_task_count}")
    print(f"  Assignee entries: {assignee_count}")
    print(f"  Tasks with legacy assigned_to_user_id: {legacy_count}")
    
    print("\n" + "=" * 60)
    print("MIGRATION COMPLETE")
    print("=" * 60)
    
    client.close()
    
    return {
        "dry_run": False,
        "total_tasks_before": total_tasks,
        "final_task_count": final_task_count,
        "tasks_deleted": len(tasks_to_delete),
        "assignees_created": len(assignee_entries),
        "legacy_fields_remaining": legacy_count,
    }


async def verify_migration():
    """Verify the migration was successful."""
    client = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    db = client[os.environ.get("DB_NAME", "test_database")]
    
    tasks = db["esg_reporting_tasks"]
    assignees = db["esg_task_assignees"]
    
    print("\n=== MIGRATION VERIFICATION ===")
    
    # Check task count
    task_count = await tasks.count_documents({})
    print(f"Total tasks: {task_count}")
    
    # Check for duplicates
    pipeline = [
        {"$group": {
            "_id": {
                "organization_id": "$organization_id",
                "facility_id": "$facility_id",
                "category": "$category",
                "subcategory": "$subcategory",
                "sub_subcategory": "$sub_subcategory",
                "period_key": "$period_key"
            },
            "count": {"$sum": 1}
        }},
        {"$match": {"count": {"$gt": 1}}}
    ]
    duplicates = await tasks.aggregate(pipeline).to_list(100)
    print(f"Duplicate task groups remaining: {len(duplicates)}")
    
    # Check assignees
    assignee_count = await assignees.count_documents({})
    print(f"Total assignee entries: {assignee_count}")
    
    # Check for orphaned assignees (task_id doesn't exist)
    task_ids = await tasks.distinct("id")
    orphaned = await assignees.count_documents({"task_id": {"$nin": task_ids}})
    print(f"Orphaned assignees: {orphaned}")
    
    # Check tasks still have assigned_to_user_id
    legacy = await tasks.count_documents({"assigned_to_user_id": {"$exists": True}})
    print(f"Tasks with legacy assigned_to_user_id: {legacy}")
    
    # Sample assignee entry
    sample = await assignees.find_one({}, {"_id": 0})
    if sample:
        print(f"\nSample assignee entry:")
        for k, v in sample.items():
            print(f"  {k}: {v}")
    
    client.close()


async def rollback_migration():
    """
    Rollback the migration (for emergencies only).
    
    WARNING: This will:
    - Delete all esg_task_assignees entries
    - NOT restore deleted duplicate tasks (data loss)
    """
    client = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    db = client[os.environ.get("DB_NAME", "test_database")]
    
    print("\n=== ROLLBACK WARNING ===")
    print("This will delete esg_task_assignees but CANNOT restore deleted tasks!")
    
    confirm = input("Type 'ROLLBACK' to proceed: ")
    if confirm != "ROLLBACK":
        print("Rollback cancelled.")
        return
    
    result = await db["esg_task_assignees"].delete_many({})
    print(f"Deleted {result.deleted_count} assignee entries")
    
    client.close()


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        if sys.argv[1] == "--live":
            asyncio.run(run_migration(dry_run=False))
        elif sys.argv[1] == "--verify":
            asyncio.run(verify_migration())
        elif sys.argv[1] == "--rollback":
            asyncio.run(rollback_migration())
        else:
            print("Usage: python -m scripts.migrate_tasks_to_shared_model [--live|--verify|--rollback]")
    else:
        # Default: dry run
        asyncio.run(run_migration(dry_run=True))
