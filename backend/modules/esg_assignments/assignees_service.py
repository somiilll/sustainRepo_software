"""
ESG Assignment Assignees Module

This module manages the many-to-many relationship between assignments and users.
An assignment represents the WORK, assignees represent WHO has access to that work.

Data Model:
-----------
esg_assignments (one per work item):
    - id, organization_id, category, subcategory, sub_subcategory
    - assignment_level (organization/facility), facility_id
    - reporting_period, status, start_date, end_date
    - filling_frequency, due_config, reminder_config
    - requires_approval, approval_chain
    - created_at, updated_at

esg_assignment_assignees (many per assignment):
    - id, assignment_id (FK), user_id
    - role (editor/viewer/approver)
    - assigned_by_user_id, assigned_at
    - removed_at (null if active, timestamp if removed)

Benefits:
---------
1. One assignment per work item (no duplicates)
2. Clean replacement logic (update assignees, not assignments)
3. Completion tracked at assignment level
4. Tasks reference assignment, not user
5. Clear audit trail
"""

from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid
from shared.database.mongo import db


class AssignmentAssigneesService:
    """
    Service for managing assignment assignees.
    
    This service handles the many-to-many relationship between
    assignments and users, keeping the assignment as the source of truth
    for the work item.
    """
    
    def __init__(self):
        self._assignments = db["esg_assignments"]
        self._assignees = db["esg_assignment_assignees"]
        self._history = db["esg_assignment_history"]
        self._users = db["users"]
    
    # =========================================================================
    # ASSIGNEE MANAGEMENT
    # =========================================================================
    
    async def add_assignees(
        self,
        assignment_id: str,
        user_ids: List[str],
        assigned_by_user_id: str,
        role: str = "editor",
        organization_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Add multiple assignees to an assignment.
        
        If a user is already assigned (active), they are skipped.
        If a user was previously removed, they are reactivated.
        
        Also syncs task assignees (esg_task_assignees) to ensure users
        see the associated tasks in their "My Tasks" view.
        
        Args:
            organization_id: Required for efficient scoped queries in assignment_resolver.
                            If not provided, will be looked up from the assignment.
        
        Returns list of created/reactivated assignee records.
        """
        now = datetime.now(timezone.utc)
        results = []
        
        # Lookup organization_id from assignment if not provided
        if not organization_id:
            assignment = await self._assignments.find_one(
                {"id": assignment_id},
                {"_id": 0, "organization_id": 1}
            )
            if assignment:
                organization_id = assignment.get("organization_id")
        
        for user_id in user_ids:
            # Check if already assigned (active)
            existing = await self._assignees.find_one({
                "assignment_id": assignment_id,
                "user_id": user_id,
                "removed_at": None,
            })
            
            if existing:
                # Already active - but ensure organization_id is set (backfill)
                if not existing.get("organization_id") and organization_id:
                    await self._assignees.update_one(
                        {"id": existing["id"]},
                        {"$set": {"organization_id": organization_id}}
                    )
                    existing["organization_id"] = organization_id
                results.append(existing)
                continue
            
            # Check if previously removed (reactivate)
            removed = await self._assignees.find_one({
                "assignment_id": assignment_id,
                "user_id": user_id,
                "removed_at": {"$ne": None},
            })
            
            if removed:
                # Reactivate and ensure organization_id is set
                update_fields = {
                    "removed_at": None,
                    "assigned_by_user_id": assigned_by_user_id,
                    "assigned_at": now,
                    "role": role,
                }
                if organization_id:
                    update_fields["organization_id"] = organization_id
                    
                await self._assignees.update_one(
                    {"id": removed["id"]},
                    {"$set": update_fields}
                )
                removed["removed_at"] = None
                removed["assigned_at"] = now
                removed["organization_id"] = organization_id
                results.append(removed)
            else:
                # Create new assignee record with organization_id
                assignee_doc = {
                    "id": str(uuid.uuid4()),
                    "assignment_id": assignment_id,
                    "organization_id": organization_id,  # Required for resolver queries
                    "user_id": user_id,
                    "role": role,
                    "assigned_by_user_id": assigned_by_user_id,
                    "assigned_at": now,
                    "removed_at": None,
                }
                await self._assignees.insert_one(assignee_doc)
                results.append(assignee_doc)
        
        # CRITICAL: Sync task assignees for added users
        # This ensures new assignees see the associated tasks in "My Tasks"
        await self._sync_task_assignees_for_users(
            assignment_id=assignment_id,
            user_ids=user_ids,
            organization_id=organization_id,
            role=role,
            assigned_by_user_id=assigned_by_user_id,
        )
        
        # Log to history
        if results:
            await self._log_history(
                assignment_id=assignment_id,
                action="assignees_added",
                changed_by_user_id=assigned_by_user_id,
                new_value={"user_ids": user_ids, "role": role},
            )
        
        return results
    
    async def _sync_task_assignees_for_users(
        self,
        assignment_id: str,
        user_ids: List[str],
        organization_id: str,
        role: str,
        assigned_by_user_id: str,
    ):
        """
        Sync task assignees when users are added to an assignment.
        
        For each task associated with this assignment, ensures each user
        has an active task assignee record (creates new or reactivates existing).
        """
        now = datetime.now(timezone.utc)
        task_assignees_collection = db["esg_task_assignees"]
        tasks_collection = db["esg_reporting_tasks"]
        
        # Get all tasks for this assignment
        tasks = await tasks_collection.find(
            {"assignment_id": assignment_id},
            {"_id": 0, "id": 1}
        ).to_list(1000)
        
        if not tasks:
            return  # No tasks yet - they will be created with assignees later
        
        task_ids = [t["id"] for t in tasks]
        
        for user_id in user_ids:
            for task_id in task_ids:
                # Check if task assignee already exists
                existing = await task_assignees_collection.find_one({
                    "task_id": task_id,
                    "user_id": user_id,
                })
                
                if existing:
                    # Reactivate if inactive
                    if not existing.get("is_active"):
                        await task_assignees_collection.update_one(
                            {"id": existing["id"]},
                            {"$set": {
                                "is_active": True,
                                "removed_at": None,
                                "role": role,
                                "updated_at": now,
                            }}
                        )
                else:
                    # Create new task assignee
                    task_assignee_doc = {
                        "id": str(uuid.uuid4()),
                        "task_id": task_id,
                        "assignment_id": assignment_id,
                        "organization_id": organization_id,
                        "user_id": user_id,
                        "role": role,
                        "assigned_by_user_id": assigned_by_user_id,
                        "is_active": True,
                        "created_at": now,
                        "updated_at": now,
                    }
                    await task_assignees_collection.insert_one(task_assignee_doc)
    
    async def remove_assignees(
        self,
        assignment_id: str,
        user_ids: List[str],
        removed_by_user_id: str,
    ) -> int:
        """
        Remove assignees from an assignment (soft delete).
        
        Also deactivates corresponding task assignees in esg_task_assignees
        so removed users no longer see tasks in their "My Tasks" view.
        
        Returns count of removed assignees.
        """
        now = datetime.now(timezone.utc)
        
        result = await self._assignees.update_many(
            {
                "assignment_id": assignment_id,
                "user_id": {"$in": user_ids},
                "removed_at": None,
            },
            {
                "$set": {"removed_at": now}
            }
        )
        
        # CRITICAL: Also deactivate task assignees for these users
        # This ensures removed users no longer see the tasks
        task_assignees_collection = db["esg_task_assignees"]
        task_result = await task_assignees_collection.update_many(
            {
                "assignment_id": assignment_id,
                "user_id": {"$in": user_ids},
                "is_active": True,
            },
            {
                "$set": {
                    "is_active": False,
                    "removed_at": now,
                    "removed_by_user_id": removed_by_user_id,
                    "updated_at": now,
                }
            }
        )
        
        if result.modified_count > 0:
            await self._log_history(
                assignment_id=assignment_id,
                action="assignees_removed",
                changed_by_user_id=removed_by_user_id,
                previous_value={
                    "user_ids": user_ids,
                    "task_assignees_deactivated": task_result.modified_count,
                },
            )
        
        return result.modified_count
    
    async def replace_assignees(
        self,
        assignment_id: str,
        new_user_ids: List[str],
        changed_by_user_id: str,
        role: str = "editor",
        organization_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Replace all assignees with a new set.
        
        This is the primary method for updating who is assigned to a work item.
        Handles additions and removals atomically.
        
        Args:
            organization_id: Required for efficient scoped queries in assignment_resolver.
                            If not provided, will be looked up from the assignment.
        
        Returns summary of changes.
        """
        now = datetime.now(timezone.utc)
        
        # Lookup organization_id from assignment if not provided
        if not organization_id:
            assignment = await self._assignments.find_one(
                {"id": assignment_id},
                {"_id": 0, "organization_id": 1}
            )
            if assignment:
                organization_id = assignment.get("organization_id")
        
        # Get current active assignees
        current = await self._assignees.find(
            {"assignment_id": assignment_id, "removed_at": None},
            {"_id": 0, "user_id": 1}
        ).to_list(100)
        current_user_ids = set(a["user_id"] for a in current)
        new_user_ids_set = set(new_user_ids)
        
        # Determine changes
        to_add = new_user_ids_set - current_user_ids
        to_remove = current_user_ids - new_user_ids_set
        
        # Remove old assignees
        removed_count = 0
        if to_remove:
            removed_count = await self.remove_assignees(
                assignment_id=assignment_id,
                user_ids=list(to_remove),
                removed_by_user_id=changed_by_user_id,
            )
        
        # Add new assignees (with organization_id)
        added = []
        if to_add:
            added = await self.add_assignees(
                assignment_id=assignment_id,
                user_ids=list(to_add),
                assigned_by_user_id=changed_by_user_id,
                role=role,
                organization_id=organization_id,
            )
        
        return {
            "added_count": len(added),
            "removed_count": removed_count,
            "added_user_ids": list(to_add),
            "removed_user_ids": list(to_remove),
            "total_assignees": len(new_user_ids),
        }
    
    async def get_assignees(
        self,
        assignment_id: str,
        include_removed: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        Get all assignees for an assignment.
        
        By default, only returns active assignees (removed_at = null).
        Set include_removed=True to get full history.
        """
        query = {"assignment_id": assignment_id}
        if not include_removed:
            query["removed_at"] = None
        
        assignees = await self._assignees.find(query, {"_id": 0}).to_list(100)
        
        # Enrich with user details
        for assignee in assignees:
            user = await self._users.find_one(
                {"id": assignee["user_id"]},
                {"_id": 0, "id": 1, "name": 1, "email": 1}
            )
            if user:
                assignee["user"] = user
        
        return assignees
    
    async def get_user_assignments(
        self,
        user_id: str,
        organization_id: str,
        category: Optional[str] = None,
        reporting_period: Optional[str] = None,
        active_only: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Get all assignments for a user.
        
        Returns assignment documents with the user's assignee record attached.
        """
        # First get assignee records for this user
        assignee_query = {"user_id": user_id}
        if active_only:
            assignee_query["removed_at"] = None
        
        assignee_records = await self._assignees.find(
            assignee_query,
            {"_id": 0}
        ).to_list(500)
        
        if not assignee_records:
            return []
        
        assignment_ids = [a["assignment_id"] for a in assignee_records]
        
        # Build assignment query
        assignment_query = {
            "id": {"$in": assignment_ids},
            "organization_id": organization_id,
        }
        if category:
            assignment_query["category"] = category
        if reporting_period:
            assignment_query["reporting_period"] = reporting_period
        
        assignments = await self._assignments.find(
            assignment_query,
            {"_id": 0}
        ).to_list(500)
        
        # Attach assignee info to each assignment
        assignee_map = {a["assignment_id"]: a for a in assignee_records}
        for assignment in assignments:
            assignment["my_assignee_record"] = assignee_map.get(assignment["id"])
        
        return assignments
    
    async def is_user_assigned(
        self,
        assignment_id: str,
        user_id: str,
    ) -> bool:
        """Check if a user is currently assigned to an assignment."""
        exists = await self._assignees.find_one({
            "assignment_id": assignment_id,
            "user_id": user_id,
            "removed_at": None,
        })
        return exists is not None
    
    async def get_assignee_count(self, assignment_id: str) -> int:
        """Get count of active assignees for an assignment."""
        return await self._assignees.count_documents({
            "assignment_id": assignment_id,
            "removed_at": None,
        })
    
    # =========================================================================
    # BULK OPERATIONS
    # =========================================================================
    
    async def delete_all_assignees(
        self,
        assignment_id: str,
        deleted_by_user_id: str,
    ) -> int:
        """
        Hard delete all assignees for an assignment.
        
        Used when deleting an assignment entirely.
        """
        result = await self._assignees.delete_many({
            "assignment_id": assignment_id,
        })
        
        if result.deleted_count > 0:
            await self._log_history(
                assignment_id=assignment_id,
                action="all_assignees_deleted",
                changed_by_user_id=deleted_by_user_id,
                previous_value={"deleted_count": result.deleted_count},
            )
        
        return result.deleted_count
    
    async def copy_assignees(
        self,
        from_assignment_id: str,
        to_assignment_id: str,
        copied_by_user_id: str,
        organization_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Copy all active assignees from one assignment to another.
        
        Useful when creating similar assignments.
        
        Args:
            organization_id: Required for efficient scoped queries in assignment_resolver.
                            If not provided, will be looked up from the target assignment.
        """
        source_assignees = await self.get_assignees(from_assignment_id)
        
        if not source_assignees:
            return []
        
        # Lookup organization_id from target assignment if not provided
        if not organization_id:
            assignment = await self._assignments.find_one(
                {"id": to_assignment_id},
                {"_id": 0, "organization_id": 1}
            )
            if assignment:
                organization_id = assignment.get("organization_id")
        
        user_ids = [a["user_id"] for a in source_assignees]
        roles = {a["user_id"]: a.get("role", "editor") for a in source_assignees}
        
        results = []
        for user_id in user_ids:
            added = await self.add_assignees(
                assignment_id=to_assignment_id,
                user_ids=[user_id],
                assigned_by_user_id=copied_by_user_id,
                role=roles.get(user_id, "editor"),
                organization_id=organization_id,
            )
            results.extend(added)
        
        return results
    
    # =========================================================================
    # HISTORY
    # =========================================================================
    
    async def _log_history(
        self,
        assignment_id: str,
        action: str,
        changed_by_user_id: str,
        previous_value: Optional[Dict] = None,
        new_value: Optional[Dict] = None,
    ):
        """Log an action to assignment history."""
        history_doc = {
            "id": str(uuid.uuid4()),
            "assignment_id": assignment_id,
            "action": action,
            "previous_value": previous_value,
            "new_value": new_value,
            "changed_by_user_id": changed_by_user_id,
            "created_at": datetime.now(timezone.utc),
        }
        await self._history.insert_one(history_doc)
    
    async def get_assignee_history(
        self,
        assignment_id: str,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """Get history of assignee changes for an assignment."""
        cursor = self._history.find(
            {
                "assignment_id": assignment_id,
                "action": {"$in": ["assignees_added", "assignees_removed", "all_assignees_deleted"]},
            },
            {"_id": 0}
        ).sort("created_at", -1).limit(limit)
        
        return await cursor.to_list(limit)
    
    async def sync_task_assignees_with_assignment_assignees(
        self,
        organization_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Sync task assignees with assignment assignees for data consistency.
        
        This fixes existing data where:
        1. Users were removed from assignments but their task assignees weren't deactivated
        2. Users were added to assignments but their task assignees weren't created
        
        Returns summary of changes made.
        """
        now = datetime.now(timezone.utc)
        task_assignees_collection = db["esg_task_assignees"]
        tasks_collection = db["esg_reporting_tasks"]
        
        stats = {
            "task_assignees_deactivated": 0,
            "task_assignees_reactivated": 0,
            "task_assignees_created": 0,
            "assignments_processed": 0,
        }
        
        # Build query for assignments
        assignment_query = {}
        if organization_id:
            assignment_query["organization_id"] = organization_id
        
        # Get all assignments with their tasks
        assignments = await self._assignments.find(
            assignment_query, {"_id": 0, "id": 1, "organization_id": 1}
        ).to_list(5000)
        
        for assignment in assignments:
            assignment_id = assignment["id"]
            org_id = assignment["organization_id"]
            
            # Get active assignment assignees
            active_assignees = await self._assignees.find(
                {"assignment_id": assignment_id, "removed_at": None},
                {"_id": 0, "user_id": 1, "role": 1}
            ).to_list(100)
            active_user_ids = set(a["user_id"] for a in active_assignees)
            user_role_map = {a["user_id"]: a.get("role", "editor") for a in active_assignees}
            
            # Get removed assignment assignees
            removed_assignees = await self._assignees.find(
                {"assignment_id": assignment_id, "removed_at": {"$ne": None}},
                {"_id": 0, "user_id": 1}
            ).to_list(100)
            removed_user_ids = set(a["user_id"] for a in removed_assignees)
            
            # Get all tasks for this assignment
            tasks = await tasks_collection.find(
                {"assignment_id": assignment_id},
                {"_id": 0, "id": 1}
            ).to_list(1000)
            task_ids = [t["id"] for t in tasks]
            
            if not task_ids:
                continue
            
            # STEP 1: Deactivate task assignees for removed users
            if removed_user_ids:
                result = await task_assignees_collection.update_many(
                    {
                        "assignment_id": assignment_id,
                        "user_id": {"$in": list(removed_user_ids)},
                        "is_active": True,
                    },
                    {
                        "$set": {
                            "is_active": False,
                            "removed_at": now,
                            "updated_at": now,
                        }
                    }
                )
                stats["task_assignees_deactivated"] += result.modified_count
            
            # STEP 2: Ensure active users have task assignee records
            for user_id in active_user_ids:
                for task_id in task_ids:
                    existing = await task_assignees_collection.find_one({
                        "task_id": task_id,
                        "user_id": user_id,
                    })
                    
                    if existing:
                        if not existing.get("is_active"):
                            await task_assignees_collection.update_one(
                                {"id": existing["id"]},
                                {"$set": {
                                    "is_active": True,
                                    "removed_at": None,
                                    "role": user_role_map.get(user_id, "editor"),
                                    "updated_at": now,
                                }}
                            )
                            stats["task_assignees_reactivated"] += 1
                    else:
                        # Create new task assignee
                        task_assignee_doc = {
                            "id": str(uuid.uuid4()),
                            "task_id": task_id,
                            "assignment_id": assignment_id,
                            "organization_id": org_id,
                            "user_id": user_id,
                            "role": user_role_map.get(user_id, "editor"),
                            "is_active": True,
                            "created_at": now,
                            "updated_at": now,
                        }
                        await task_assignees_collection.insert_one(task_assignee_doc)
                        stats["task_assignees_created"] += 1
            
            stats["assignments_processed"] += 1
        
        return stats


# Singleton instance
assignment_assignees_service = AssignmentAssigneesService()
