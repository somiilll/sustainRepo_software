"""
ESG Assignment Service V2 - Redesigned Data Model

This service manages ESG assignments with a clean separation:
- Assignment = the WORK (one per category/facility/period combo)
- Assignees = WHO has access (managed via assignees_service)

Key Design Principles:
----------------------
1. One assignment document per unique work item
2. Assignees tracked separately in esg_assignment_assignees
3. Completion status belongs to the assignment, not individual users
4. Tasks reference the assignment, users linked via task_assignees
5. Clear audit trail for both assignment changes and assignee changes

Unique Key for Assignment:
--------------------------
(organization_id, category, subcategory, sub_subcategory, facility_id, reporting_period)

If facility_id is null, it's an organization-level assignment.
"""

from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timezone
import uuid
from shared.database.mongo import db
from .assignees_service import assignment_assignees_service


class AssignmentServiceV2:
    """
    Service for managing ESG assignments (the work items).
    
    This service handles CRUD operations for assignments.
    Assignee management is delegated to AssignmentAssigneesService.
    """
    
    def __init__(self):
        self._assignments = db["esg_assignments"]
        self._assignees = db["esg_assignment_assignees"]
        self._history = db["esg_assignment_history"]
        self._facilities = db["facilities"]
        self._task_assignees = db["esg_task_assignees"]
    
    # =========================================================================
    # CORE CRUD OPERATIONS
    # =========================================================================
    
    def _build_unique_key(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Build the unique key query for an assignment.
        
        This identifies a unique work item.
        For disclosures: uses entity_type + entity_id + reporting_period
        For KPI metrics: uses category + subcategory + sub_subcategory + facility_id + reporting_period
        """
        # If entity_type is "question" (disclosure), use entity_id as the key
        if data.get("entity_type") == "question":
            return {
                "organization_id": data.get("organization_id"),
                "entity_type": "question",
                "entity_id": data.get("entity_id"),
                "reporting_period": data.get("reporting_period"),
            }
        
        # Default: KPI metrics use category/subcategory hierarchy
        return {
            "organization_id": data.get("organization_id"),
            "category": data.get("category"),
            "subcategory": data.get("subcategory"),
            "sub_subcategory": data.get("sub_subcategory"),
            "facility_id": data.get("facility_id"),  # null for org-level
            "reporting_period": data.get("reporting_period"),
        }
    
    async def create_or_update_assignment(
        self,
        data: Dict[str, Any],
        user_ids: List[str],
        created_by_user_id: str,
    ) -> Tuple[Dict[str, Any], bool]:
        """
        Create a new assignment or update existing one.
        
        This is the primary method for creating/updating assignments.
        It handles:
        1. Finding or creating the assignment document
        2. Updating assignment properties
        3. Managing assignees (via assignees_service)
        
        Args:
            data: Assignment properties (category, facility_id, etc.)
            user_ids: List of user IDs to assign
            created_by_user_id: User performing the action
        
        Returns:
            (assignment_doc, is_new): The assignment and whether it was newly created
        """
        now = datetime.now(timezone.utc)
        unique_key = self._build_unique_key(data)
        
        # Check for existing assignment
        existing = await self._assignments.find_one(unique_key, {"_id": 0})
        
        if existing:
            # Update existing assignment
            assignment_id = existing["id"]
            
            update_fields = {
                "assignment_level": data.get("assignment_level", existing.get("assignment_level")),
                "start_date": data.get("start_date"),
                "end_date": data.get("end_date"),
                "timezone": data.get("timezone", "Asia/Kolkata"),
                "filling_frequency": data.get("filling_frequency"),
                "due_config": data.get("due_config"),
                "due_date": data.get("due_date"),  # Add due_date to update
                "reminder_enabled": data.get("reminder_enabled", False),
                "reminder_config": data.get("reminder_config"),
                "reminder_frequency": data.get("reminder_frequency"),  # Add reminder_frequency
                "requires_approval": data.get("requires_approval", False),
                "approver_id": data.get("approver_id"),  # Single-level approval
                "approval_chain": data.get("approval_chain", []),  # Multi-level approval
                "framework_id": data.get("framework_id"),  # Add framework_id
                "updated_at": now,
            }
            
            await self._assignments.update_one(
                {"id": assignment_id},
                {"$set": update_fields}
            )
            
            # Log update
            await self._log_history(
                assignment_id=assignment_id,
                action="updated",
                changed_by_user_id=created_by_user_id,
                previous_value={"status": existing.get("status")},
                new_value=update_fields,
            )
            
            # Update assignees
            if user_ids:
                await assignment_assignees_service.replace_assignees(
                    assignment_id=assignment_id,
                    new_user_ids=user_ids,
                    changed_by_user_id=created_by_user_id,
                )
            
            # Fetch updated assignment with assignees
            assignment = await self.get_assignment(assignment_id)
            return assignment, False
        
        else:
            # Create new assignment
            assignment_id = str(uuid.uuid4())
            
            # Build entity_id for reference (only if not provided by caller)
            entity_id = data.get("entity_id")
            if not entity_id:
                entity_id = "_".join(filter(None, [
                    data.get("category"),
                    data.get("subcategory"),
                    data.get("sub_subcategory"),
                ]))
                if data.get("facility_id"):
                    entity_id = f"{entity_id}_{data.get('facility_id')}"
            
            assignment_doc = {
                "id": assignment_id,
                "organization_id": data.get("organization_id"),
                "entity_type": data.get("entity_type", "record_category"),  # Honor caller's entity_type
                "entity_id": entity_id,
                "category": data.get("category"),
                "subcategory": data.get("subcategory"),
                "sub_subcategory": data.get("sub_subcategory"),
                "assignment_level": data.get("assignment_level", "organization"),
                "facility_id": data.get("facility_id"),
                "reporting_period": data.get("reporting_period"),
                "status": "pending",
                "start_date": data.get("start_date"),
                "end_date": data.get("end_date"),
                "timezone": data.get("timezone", "Asia/Kolkata"),
                "filling_frequency": data.get("filling_frequency"),
                "due_config": data.get("due_config"),
                "due_date": data.get("due_date"),
                "reminder_enabled": data.get("reminder_enabled", False),
                "reminder_config": data.get("reminder_config"),
                "reminder_frequency": data.get("reminder_frequency"),
                "requires_approval": data.get("requires_approval", False),
                "approver_id": data.get("approver_id"),  # Single-level approval
                "approval_chain": data.get("approval_chain", []),  # Multi-level approval
                "framework_id": data.get("framework_id"),
                "group_assignment_id": data.get("group_assignment_id"),
                "created_by_user_id": created_by_user_id,
                "created_at": now,
                "updated_at": now,
            }
            
            await self._assignments.insert_one(assignment_doc)
            
            # Log creation
            await self._log_history(
                assignment_id=assignment_id,
                action="created",
                changed_by_user_id=created_by_user_id,
                new_value={"category": data.get("category"), "subcategory": data.get("subcategory")},
            )
            
            # Add assignees
            if user_ids:
                await assignment_assignees_service.add_assignees(
                    assignment_id=assignment_id,
                    user_ids=user_ids,
                    assigned_by_user_id=created_by_user_id,
                )
            
            # Generate tasks if scheduling configured
            if data.get("start_date") and data.get("filling_frequency"):
                await self._generate_tasks(assignment_id)
            
            # Fetch with assignees
            assignment = await self.get_assignment(assignment_id)
            return assignment, True
    
    async def get_assignment(
        self,
        assignment_id: str,
        include_assignees: bool = True,
    ) -> Optional[Dict[str, Any]]:
        """
        Get an assignment by ID with optional assignees.
        """
        assignment = await self._assignments.find_one(
            {"id": assignment_id},
            {"_id": 0}
        )
        
        if not assignment:
            return None
        
        if include_assignees:
            assignees = await assignment_assignees_service.get_assignees(assignment_id)
            assignment["assignees"] = assignees
        
        return assignment
    
    async def get_assignment_by_key(
        self,
        organization_id: str,
        category: str,
        subcategory: Optional[str],
        sub_subcategory: Optional[str],
        facility_id: Optional[str],
        reporting_period: str,
        include_assignees: bool = True,
    ) -> Optional[Dict[str, Any]]:
        """
        Get an assignment by its unique key.
        """
        query = {
            "organization_id": organization_id,
            "category": category,
            "subcategory": subcategory,
            "sub_subcategory": sub_subcategory,
            "facility_id": facility_id,
            "reporting_period": reporting_period,
        }
        
        assignment = await self._assignments.find_one(query, {"_id": 0})
        
        if not assignment:
            return None
        
        if include_assignees:
            assignees = await assignment_assignees_service.get_assignees(assignment["id"])
            assignment["assignees"] = assignees
        
        return assignment
    
    async def delete_assignment(
        self,
        assignment_id: str,
        deleted_by_user_id: str,
    ) -> bool:
        """
        Delete an assignment and all related data.
        
        Cascades to:
        - Assignment assignees
        - Task assignees
        - Assignment history (soft reference)
        """
        assignment = await self._assignments.find_one({"id": assignment_id})
        if not assignment:
            return False
        
        # Delete assignees
        await assignment_assignees_service.delete_all_assignees(
            assignment_id=assignment_id,
            deleted_by_user_id=deleted_by_user_id,
        )
        
        # Delete task assignees linked to this assignment
        await self._task_assignees.delete_many({"assignment_id": assignment_id})
        
        # Delete the assignment
        await self._assignments.delete_one({"id": assignment_id})
        
        # Log deletion
        await self._log_history(
            assignment_id=assignment_id,
            action="deleted",
            changed_by_user_id=deleted_by_user_id,
            previous_value={
                "category": assignment.get("category"),
                "subcategory": assignment.get("subcategory"),
            },
        )
        
        return True
    
    # =========================================================================
    # BULK OPERATIONS
    # =========================================================================
    
    async def delete_assignments_for_category(
        self,
        organization_id: str,
        category: str,
        subcategory: Optional[str] = None,
        sub_subcategory: Optional[str] = None,
        facility_id: Optional[str] = None,
        reporting_period: Optional[str] = None,
        deleted_by_user_id: str = None,
    ) -> int:
        """
        Delete all assignments matching the criteria.
        
        Used when replacing org-level with facility-level or vice versa.
        """
        query = {
            "organization_id": organization_id,
            "category": category,
        }
        if subcategory is not None:
            query["subcategory"] = subcategory
        if sub_subcategory is not None:
            query["sub_subcategory"] = sub_subcategory
        if facility_id is not None:
            query["facility_id"] = facility_id
        if reporting_period is not None:
            query["reporting_period"] = reporting_period
        
        # Get assignment IDs first
        assignments = await self._assignments.find(query, {"_id": 0, "id": 1}).to_list(500)
        assignment_ids = [a["id"] for a in assignments]
        
        if not assignment_ids:
            return 0
        
        # Delete assignees for all these assignments
        await self._assignees.delete_many({"assignment_id": {"$in": assignment_ids}})
        
        # Delete task assignees
        await self._task_assignees.delete_many({"assignment_id": {"$in": assignment_ids}})
        
        # Delete assignments
        result = await self._assignments.delete_many(query)
        
        # Log bulk deletion
        if deleted_by_user_id:
            await self._log_history(
                assignment_id=None,
                action="bulk_deleted",
                changed_by_user_id=deleted_by_user_id,
                previous_value={
                    "category": category,
                    "subcategory": subcategory,
                    "deleted_count": result.deleted_count,
                },
            )
        
        return result.deleted_count
    
    async def replace_org_with_facility_assignments(
        self,
        organization_id: str,
        category: str,
        subcategory: Optional[str],
        sub_subcategory: Optional[str],
        reporting_period: str,
        facility_assignments: Dict[str, List[str]],  # {facility_id: [user_ids]}
        assignment_data: Dict[str, Any],  # Common properties (schedule, etc.)
        created_by_user_id: str,
    ) -> Dict[str, Any]:
        """
        Replace organization-level assignment with facility-level assignments.
        
        This handles the complex case of switching from org to facility level:
        1. Delete existing org-level assignment (facility_id = null)
        2. Create new facility-level assignments for each facility
        
        Args:
            facility_assignments: Dict mapping facility_id to list of user_ids
            assignment_data: Common properties for all assignments
        
        Returns:
            Summary of changes
        """
        # Delete existing org-level assignment
        deleted = await self.delete_assignments_for_category(
            organization_id=organization_id,
            category=category,
            subcategory=subcategory,
            sub_subcategory=sub_subcategory,
            facility_id=None,  # Specifically target org-level
            reporting_period=reporting_period,
            deleted_by_user_id=created_by_user_id,
        )
        
        # Create facility-level assignments
        created_assignments = []
        for facility_id, user_ids in facility_assignments.items():
            if not user_ids:
                continue
            
            data = {
                **assignment_data,
                "organization_id": organization_id,
                "category": category,
                "subcategory": subcategory,
                "sub_subcategory": sub_subcategory,
                "facility_id": facility_id,
                "reporting_period": reporting_period,
                "assignment_level": "facility",
            }
            
            assignment, is_new = await self.create_or_update_assignment(
                data=data,
                user_ids=user_ids,
                created_by_user_id=created_by_user_id,
            )
            created_assignments.append(assignment)
        
        return {
            "deleted_org_level": deleted,
            "created_facility_level": len(created_assignments),
            "assignments": created_assignments,
        }
    
    async def replace_facility_with_org_assignment(
        self,
        organization_id: str,
        category: str,
        subcategory: Optional[str],
        sub_subcategory: Optional[str],
        reporting_period: str,
        user_ids: List[str],
        assignment_data: Dict[str, Any],
        created_by_user_id: str,
    ) -> Dict[str, Any]:
        """
        Replace facility-level assignments with organization-level assignment.
        
        This handles switching from facility to org level:
        1. Delete all existing facility-level assignments for this category
        2. Create new org-level assignment
        """
        # Get count of facility-level assignments before deletion
        facility_assignments = await self._assignments.find({
            "organization_id": organization_id,
            "category": category,
            "subcategory": subcategory,
            "sub_subcategory": sub_subcategory,
            "reporting_period": reporting_period,
            "facility_id": {"$ne": None},  # Has facility_id = facility-level
        }, {"_id": 0, "id": 1}).to_list(500)
        
        # Delete all facility-level assignments
        deleted = 0
        for assignment in facility_assignments:
            await self.delete_assignment(
                assignment_id=assignment["id"],
                deleted_by_user_id=created_by_user_id,
            )
            deleted += 1
        
        # Create org-level assignment
        data = {
            **assignment_data,
            "organization_id": organization_id,
            "category": category,
            "subcategory": subcategory,
            "sub_subcategory": sub_subcategory,
            "facility_id": None,  # Org-level
            "reporting_period": reporting_period,
            "assignment_level": "organization",
        }
        
        assignment, is_new = await self.create_or_update_assignment(
            data=data,
            user_ids=user_ids,
            created_by_user_id=created_by_user_id,
        )
        
        return {
            "deleted_facility_level": deleted,
            "created_org_level": 1 if assignment else 0,
            "assignment": assignment,
        }
    
    # =========================================================================
    # QUERY METHODS
    # =========================================================================
    
    async def get_assignments_for_tracker(
        self,
        organization_id: str,
        reporting_period: str,
        category: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get assignments formatted for the ESG Tracker UI.
        
        Returns assignments with their assignees attached.
        """
        query = {
            "organization_id": organization_id,
            "reporting_period": reporting_period,
        }
        if category:
            query["category"] = category
        
        assignments = await self._assignments.find(query, {"_id": 0}).to_list(500)
        
        # Attach assignees to each
        for assignment in assignments:
            assignees = await assignment_assignees_service.get_assignees(assignment["id"])
            assignment["assignees"] = assignees
        
        return assignments
    
    async def get_user_accessible_assignments(
        self,
        user_id: str,
        organization_id: str,
        category: Optional[str] = None,
        reporting_period: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get all assignments a user has access to.
        
        Used by KPI access helper.
        """
        return await assignment_assignees_service.get_user_assignments(
            user_id=user_id,
            organization_id=organization_id,
            category=category,
            reporting_period=reporting_period,
        )
    
    # =========================================================================
    # STATUS MANAGEMENT
    # =========================================================================
    
    async def update_status(
        self,
        assignment_id: str,
        new_status: str,
        updated_by_user_id: str,
    ) -> bool:
        """
        Update assignment status.
        
        Status values: pending, in_progress, completed, overdue
        """
        assignment = await self._assignments.find_one({"id": assignment_id})
        if not assignment:
            return False
        
        old_status = assignment.get("status")
        
        await self._assignments.update_one(
            {"id": assignment_id},
            {
                "$set": {
                    "status": new_status,
                    "updated_at": datetime.now(timezone.utc),
                }
            }
        )
        
        await self._log_history(
            assignment_id=assignment_id,
            action="status_changed",
            changed_by_user_id=updated_by_user_id,
            previous_value={"status": old_status},
            new_value={"status": new_status},
        )
        
        return True
    
    # =========================================================================
    # TASK GENERATION
    # =========================================================================
    
    async def _generate_tasks(self, assignment_id: str):
        """Generate tasks for an assignment."""
        try:
            from modules.esg_records.task_engine import generate_tasks_for_assignment
            assignment = await self._assignments.find_one({"id": assignment_id}, {"_id": 0})
            if assignment:
                await generate_tasks_for_assignment(db, assignment)
        except Exception as e:
            print(f"[AssignmentServiceV2] Task generation failed: {e}")
    
    # =========================================================================
    # HISTORY
    # =========================================================================
    
    async def _log_history(
        self,
        assignment_id: Optional[str],
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
    
    async def get_assignment_history(
        self,
        assignment_id: str,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """Get history for an assignment."""
        cursor = self._history.find(
            {"assignment_id": assignment_id},
            {"_id": 0}
        ).sort("created_at", -1).limit(limit)
        
        return await cursor.to_list(limit)


# Singleton instance
assignment_service_v2 = AssignmentServiceV2()
