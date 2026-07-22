"""
Migration Script: Convert Legacy Assignments to New Data Model

This script migrates existing esg_assignments data from the old model
(one document per user) to the new model (one document per work item
with separate assignees table).

Old Model:
----------
esg_assignments: {
    id, organization_id, category, subcategory, facility_id,
    assigned_to_user_id,  # <-- User embedded in assignment
    ...
}

New Model:
----------
esg_assignments: {
    id, organization_id, category, subcategory, facility_id,
    # No assigned_to_user_id - removed
    ...
}

esg_assignment_assignees: {
    id, assignment_id, user_id, role, assigned_at, ...
}

Migration Steps:
----------------
1. Group existing assignments by unique key
2. For each group, create ONE assignment document
3. Create assignee records for each user in the group
4. Preserve history and task relationships

Usage:
------
python -m modules.esg_assignments.migrate_assignments [--dry-run]
"""

import asyncio
from datetime import datetime, timezone
from typing import Dict, List, Any
import uuid
from collections import defaultdict


async def migrate_assignments(dry_run: bool = True):
    """
    Migrate legacy assignments to new data model.
    
    Args:
        dry_run: If True, only report what would be done without making changes
    """
    from shared.database.mongo import db
    
    print("=" * 60)
    print("ESG Assignment Migration")
    print("=" * 60)
    print(f"Mode: {'DRY RUN (no changes)' if dry_run else 'LIVE (will modify data)'}")
    print()
    
    # Get all existing assignments
    old_assignments = await db.esg_assignments.find({}, {"_id": 0}).to_list(10000)
    print(f"Found {len(old_assignments)} existing assignment documents")
    
    if not old_assignments:
        print("No assignments to migrate.")
        return
    
    # Check if migration already done (look for assignments without assigned_to_user_id)
    migrated_count = sum(1 for a in old_assignments if "assigned_to_user_id" not in a or a.get("assigned_to_user_id") is None)
    if migrated_count > 0:
        print(f"Warning: {migrated_count} assignments already appear to be in new format")
    
    # Group by unique key
    def get_unique_key(a: Dict) -> tuple:
        return (
            a.get("organization_id"),
            a.get("category"),
            a.get("subcategory"),
            a.get("sub_subcategory"),
            a.get("facility_id"),
            a.get("reporting_period"),
        )
    
    groups: Dict[tuple, List[Dict]] = defaultdict(list)
    for assignment in old_assignments:
        key = get_unique_key(assignment)
        groups[key].append(assignment)
    
    print(f"Grouped into {len(groups)} unique work items")
    print()
    
    # Analyze groups
    multi_user_groups = [(k, v) for k, v in groups.items() if len(v) > 1]
    single_user_groups = [(k, v) for k, v in groups.items() if len(v) == 1]
    
    print(f"  - {len(single_user_groups)} work items with 1 assignee")
    print(f"  - {len(multi_user_groups)} work items with multiple assignees")
    
    if multi_user_groups:
        print()
        print("Multi-assignee work items:")
        for key, assignments in multi_user_groups[:10]:  # Show first 10
            users = [a.get("assigned_to_user_id") for a in assignments]
            print(f"  - {key[1]}/{key[2]} @ {key[4] or 'ORG'}: {len(users)} users")
        if len(multi_user_groups) > 10:
            print(f"  ... and {len(multi_user_groups) - 10} more")
    
    print()
    
    if dry_run:
        print("DRY RUN complete. No changes made.")
        print()
        print("To apply migration, run with --live flag:")
        print("  python -m modules.esg_assignments.migrate_assignments --live")
        return
    
    # Perform migration
    print("Starting migration...")
    now = datetime.now(timezone.utc)
    
    migrated_assignments = 0
    created_assignees = 0
    errors = []
    
    for key, assignments in groups.items():
        try:
            # Use the first assignment as the base (it has most complete data)
            base = sorted(assignments, key=lambda x: x.get("created_at") or "")[-1]
            
            # Check if this is already migrated (no assigned_to_user_id)
            if "assigned_to_user_id" not in base and await db.esg_assignment_assignees.count_documents({"assignment_id": base["id"]}) > 0:
                continue  # Already migrated
            
            # Determine if we need to create a new assignment or update existing
            # If there's only one assignment doc, we can update it in place
            # If there are multiple, we need to merge them
            
            if len(assignments) == 1:
                # Simple case: just remove assigned_to_user_id and create assignee record
                assignment_id = base["id"]
                user_id = base.get("assigned_to_user_id")
                
                if user_id:
                    # Create assignee record
                    assignee_doc = {
                        "id": str(uuid.uuid4()),
                        "assignment_id": assignment_id,
                        "user_id": user_id,
                        "role": base.get("role", "editor"),
                        "assigned_by_user_id": base.get("assigned_by_user_id"),
                        "assigned_at": base.get("created_at") or now,
                        "removed_at": None,
                    }
                    await db.esg_assignment_assignees.insert_one(assignee_doc)
                    created_assignees += 1
                
                # Update assignment to remove assigned_to_user_id
                await db.esg_assignments.update_one(
                    {"id": assignment_id},
                    {
                        "$unset": {"assigned_to_user_id": "", "assigned_by_user_id": ""},
                        "$set": {"updated_at": now, "_migrated_at": now},
                    }
                )
                migrated_assignments += 1
                
            else:
                # Complex case: merge multiple assignment docs into one
                # Keep the newest one, delete the rest, create assignee records for all users
                
                # Sort by created_at descending, keep the first (newest)
                sorted_assignments = sorted(
                    assignments,
                    key=lambda x: x.get("created_at") or "",
                    reverse=True
                )
                primary = sorted_assignments[0]
                to_delete = sorted_assignments[1:]
                
                assignment_id = primary["id"]
                
                # Collect all unique users
                users = {}
                for a in assignments:
                    user_id = a.get("assigned_to_user_id")
                    if user_id and user_id not in users:
                        users[user_id] = {
                            "role": a.get("role", "editor"),
                            "assigned_by": a.get("assigned_by_user_id"),
                            "assigned_at": a.get("created_at") or now,
                        }
                
                # Create assignee records
                for user_id, user_data in users.items():
                    # Check if assignee already exists
                    exists = await db.esg_assignment_assignees.find_one({
                        "assignment_id": assignment_id,
                        "user_id": user_id,
                    })
                    if not exists:
                        assignee_doc = {
                            "id": str(uuid.uuid4()),
                            "assignment_id": assignment_id,
                            "user_id": user_id,
                            "role": user_data["role"],
                            "assigned_by_user_id": user_data["assigned_by"],
                            "assigned_at": user_data["assigned_at"],
                            "removed_at": None,
                        }
                        await db.esg_assignment_assignees.insert_one(assignee_doc)
                        created_assignees += 1
                
                # Update primary assignment
                await db.esg_assignments.update_one(
                    {"id": assignment_id},
                    {
                        "$unset": {"assigned_to_user_id": "", "assigned_by_user_id": ""},
                        "$set": {"updated_at": now, "_migrated_at": now},
                    }
                )
                
                # Delete duplicate assignments
                for dup in to_delete:
                    # Update any task_assignees to point to the primary assignment
                    await db.esg_task_assignees.update_many(
                        {"assignment_id": dup["id"]},
                        {"$set": {"assignment_id": assignment_id}}
                    )
                    # Delete the duplicate
                    await db.esg_assignments.delete_one({"id": dup["id"]})
                
                migrated_assignments += len(assignments)
        
        except Exception as e:
            errors.append((key, str(e)))
            print(f"  ERROR migrating {key}: {e}")
    
    print()
    print("=" * 60)
    print("Migration Complete")
    print("=" * 60)
    print(f"Assignments processed: {migrated_assignments}")
    print(f"Assignee records created: {created_assignees}")
    print(f"Errors: {len(errors)}")
    
    if errors:
        print()
        print("Errors:")
        for key, error in errors[:10]:
            print(f"  - {key}: {error}")


async def verify_migration():
    """Verify the migration was successful."""
    from shared.database.mongo import db
    
    print("Verifying migration...")
    
    # Check for any assignments still with assigned_to_user_id
    legacy_count = await db.esg_assignments.count_documents({
        "assigned_to_user_id": {"$exists": True, "$ne": None}
    })
    
    # Check assignees count
    assignees_count = await db.esg_assignment_assignees.count_documents({})
    
    # Check assignments count
    assignments_count = await db.esg_assignments.count_documents({})
    
    print(f"Assignments total: {assignments_count}")
    print(f"Assignees total: {assignees_count}")
    print(f"Legacy assignments (with assigned_to_user_id): {legacy_count}")
    
    if legacy_count > 0:
        print("WARNING: Some assignments still have legacy format")
    else:
        print("SUCCESS: All assignments migrated to new format")


async def rollback_migration():
    """
    Rollback migration by restoring assigned_to_user_id from assignees.
    
    This should only be used if something goes wrong.
    """
    from shared.database.mongo import db
    
    print("Rolling back migration...")
    
    # Get all assignments without assigned_to_user_id
    assignments = await db.esg_assignments.find({
        "$or": [
            {"assigned_to_user_id": {"$exists": False}},
            {"assigned_to_user_id": None},
        ]
    }, {"_id": 0, "id": 1}).to_list(10000)
    
    rolled_back = 0
    for assignment in assignments:
        # Get the first assignee
        assignee = await db.esg_assignment_assignees.find_one({
            "assignment_id": assignment["id"],
            "removed_at": None,
        })
        
        if assignee:
            # Restore assigned_to_user_id
            await db.esg_assignments.update_one(
                {"id": assignment["id"]},
                {
                    "$set": {
                        "assigned_to_user_id": assignee["user_id"],
                        "assigned_by_user_id": assignee.get("assigned_by_user_id"),
                    },
                    "$unset": {"_migrated_at": ""},
                }
            )
            rolled_back += 1
    
    print(f"Rolled back {rolled_back} assignments")


if __name__ == "__main__":
    import sys
    
    if "--live" in sys.argv:
        asyncio.run(migrate_assignments(dry_run=False))
    elif "--verify" in sys.argv:
        asyncio.run(verify_migration())
    elif "--rollback" in sys.argv:
        asyncio.run(rollback_migration())
    else:
        asyncio.run(migrate_assignments(dry_run=True))
