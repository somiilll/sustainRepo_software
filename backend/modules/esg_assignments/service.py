"""
ESG Assignment Service

Core business logic for managing ESG assignments, including:
- CRUD operations for assignments
- Assignment history tracking
- Response version history
- Bulk operations
- Reminder scheduling
"""

from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
import uuid
from fastapi import HTTPException
from shared.database.mongo import db
from .models import (
    EntityType, AssignmentLevel, AssignmentRole, AssignmentStatus,
    FillingFrequency, ReminderFrequency, HistoryAction, ResponseChangeType,
    CreateAssignmentRequest, UpdateAssignmentRequest, BulkAssignmentRequest,
    ReassignRequest, AssignmentResponse, AssignmentHistoryResponse,
    ResponseVersionResponse, AssignmentFilter,
)


class AssignmentService:
    """
    Service for managing ESG assignments.
    
    Provides CRUD operations, history tracking, and helper methods
    for the assignment system.
    """
    
    def __init__(self):
        self._assignments = db["esg_assignments"]
        self._assignment_history = db["esg_assignment_history"]
        self._users = db["users"]
        self._question_configs = db["esg_question_configs"]
    
    # ============================================
    # ASSIGNMENT CRUD
    # ============================================
    
    async def create_assignment(
        self,
        organization_id: str,
        request: CreateAssignmentRequest,
        assigned_by_user_id: str,
        group_assignment_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a new assignment.
        
        Returns the created assignment document.
        Sends email notification to the assigned user.
        """
        now = datetime.now(timezone.utc)
        
        assignment = {
            "id": str(uuid.uuid4()),
            "organization_id": organization_id,
            "entity_type": request.entity_type.value,
            "assignment_level": request.assignment_level.value,
            "entity_id": request.entity_id,
            "facility_id": request.facility_id,
            "reporting_period": request.reporting_period,
            "assigned_to_user_id": request.assigned_to_user_id,
            "assigned_by_user_id": assigned_by_user_id,
            "role": request.role.value,
            "status": request.status.value,
            "due_date": request.due_date,
            
            # Framework context
            "framework_id": request.framework_id,
            
            # New scheduling fields
            "start_date": request.start_date,
            "end_date": request.end_date,
            "timezone": request.timezone,
            "due_config": request.due_config,
            
            # Approval configuration
            "requires_approval": request.requires_approval,
            "approval_chain": request.approval_chain,  # Direct from request, not metadata
            
            # Filling frequency
            "filling_frequency": request.filling_frequency.value if request.filling_frequency else None,
            "filling_due_day": request.filling_due_day,
            
            # Reminder settings
            "reminder_enabled": request.reminder_enabled,
            "reminder_frequency": request.reminder_frequency.value if request.reminder_frequency else None,
            "reminder_start_before_days": request.reminder_start_before_days,
            "reminder_recipients": request.reminder_recipients,
            "reminder_config": request.reminder_config,
            "last_reminder_sent_at": None,
            "next_reminder_at": self._calculate_next_reminder(request) if request.reminder_enabled else None,
            
            # Group assignment
            "group_assignment_id": group_assignment_id,
            
            # Metadata
            "metadata": request.metadata,
            
            "created_at": now,
            "updated_at": now,
        }
        
        await self._assignments.insert_one(assignment)
        
        # Auto-generate tasks if start_date and filling_frequency are provided
        if request.start_date and request.filling_frequency:
            try:
                from modules.esg_records.task_engine import generate_tasks_for_assignment as gen_tasks
                # Pass assignment with category info for disclosure tasks
                task_assignment = {
                    **assignment,
                    "category": f"Disclosure: {request.entity_id}",
                    "subcategory": request.framework_id,
                }
                await gen_tasks(db, task_assignment)
            except Exception as e:
                # Log but don't fail the assignment creation
                print(f"Task generation warning for disclosure: {e}")
        
        # Log history
        await self._log_history(
            assignment_id=assignment["id"],
            action=HistoryAction.CREATED,
            new_value=assignment,
            changed_by_user_id=assigned_by_user_id,
        )
        
        # Send email + in-app notifications to assigned user AND approver(s)
        await self._send_assignment_notifications(
            assignment=assignment,
            assigned_by_user_id=assigned_by_user_id,
        )
        
        return self._sanitize_doc(assignment)
    
    async def get_assignment(
        self,
        assignment_id: str,
        organization_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Get a single assignment by ID"""
        doc = await self._assignments.find_one(
            {"id": assignment_id, "organization_id": organization_id},
            {"_id": 0}
        )
        
        if doc:
            doc = await self._populate_user_names(doc)
        
        return doc
    
    async def update_assignment(
        self,
        assignment_id: str,
        organization_id: str,
        request: UpdateAssignmentRequest,
        updated_by_user_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Update an existing assignment.
        
        Logs changes to history.
        """
        # Get current assignment
        current = await self._assignments.find_one(
            {"id": assignment_id, "organization_id": organization_id}
        )
        
        if not current:
            return None
        
        # Build update document
        update_fields = {}
        
        if request.assigned_to_user_id is not None:
            update_fields["assigned_to_user_id"] = request.assigned_to_user_id
        if request.role is not None:
            update_fields["role"] = request.role.value
        if request.status is not None:
            update_fields["status"] = request.status.value
        if request.due_date is not None:
            update_fields["due_date"] = request.due_date
        if request.framework_id is not None:
            update_fields["framework_id"] = request.framework_id
        if request.requires_approval is not None:
            update_fields["requires_approval"] = request.requires_approval
        if request.filling_frequency is not None:
            update_fields["filling_frequency"] = request.filling_frequency.value
        if request.filling_due_day is not None:
            update_fields["filling_due_day"] = request.filling_due_day
        if request.reminder_enabled is not None:
            update_fields["reminder_enabled"] = request.reminder_enabled
        if request.reminder_frequency is not None:
            update_fields["reminder_frequency"] = request.reminder_frequency.value
        if request.reminder_start_before_days is not None:
            update_fields["reminder_start_before_days"] = request.reminder_start_before_days
        if request.reminder_recipients is not None:
            update_fields["reminder_recipients"] = request.reminder_recipients
        if request.reminder_config is not None:
            update_fields["reminder_config"] = request.reminder_config
        if request.metadata is not None:
            update_fields["metadata"] = request.metadata
        
        if not update_fields:
            return self._sanitize_doc(current)
        
        update_fields["updated_at"] = datetime.now(timezone.utc)
        
        # Recalculate next reminder if reminder settings changed
        if request.reminder_enabled is not None or request.reminder_frequency is not None:
            if update_fields.get("reminder_enabled", current.get("reminder_enabled")):
                update_fields["next_reminder_at"] = self._calculate_next_reminder_from_doc({
                    **current,
                    **update_fields
                })
            else:
                update_fields["next_reminder_at"] = None
        
        # Determine action type for history
        action = HistoryAction.UPDATED
        if request.assigned_to_user_id and request.assigned_to_user_id != current.get("assigned_to_user_id"):
            action = HistoryAction.REASSIGNED
        elif request.status and request.status.value != current.get("status"):
            action = HistoryAction.STATUS_CHANGED
        elif request.role and request.role.value != current.get("role"):
            action = HistoryAction.ROLE_CHANGED
        
        # Update document
        await self._assignments.update_one(
            {"id": assignment_id},
            {"$set": update_fields}
        )
        
        # Log history
        await self._log_history(
            assignment_id=assignment_id,
            action=action,
            previous_value={k: current.get(k) for k in update_fields.keys()},
            new_value=update_fields,
            changed_by_user_id=updated_by_user_id,
        )
        
        # Regenerate tasks if frequency, dates, or start/end changed
        needs_regen = any(k in update_fields for k in [
            "filling_frequency", "start_date", "end_date", "due_date",
        ])
        if needs_regen:
            from modules.esg_records.task_engine import regenerate_tasks_for_assignment
            updated_assignment = await self._assignments.find_one({"id": assignment_id}, {"_id": 0})
            if updated_assignment:
                await regenerate_tasks_for_assignment(db, updated_assignment)
        
        # Return updated document
        updated = await self._assignments.find_one(
            {"id": assignment_id},
            {"_id": 0}
        )
        
        return await self._populate_user_names(updated)
    
    async def delete_assignment(
        self,
        assignment_id: str,
        organization_id: str,
        deleted_by_user_id: str,
    ) -> Dict[str, Any]:
        """
        Delete an assignment with proper task lifecycle management.
        
        TASK LIFECYCLE: ACTIVE -> CANCELLED -> ARCHIVED
        
        Instead of hard-deleting tasks, we transition them through a lifecycle:
        1. ACTIVE: Normal operational state (pending, completed, etc.)
        2. CANCELLED: Assignment was deleted, but tasks remain visible for audit
        3. ARCHIVED: (Future) Tasks can be archived after a retention period
        
        This ensures auditors can always see what tasks were cancelled and why.
        
        Returns:
            Dict with status info: {"deleted": True, "tasks_cancelled": int, ...}
        """
        current = await self._assignments.find_one(
            {"id": assignment_id, "organization_id": organization_id}
        )
        
        if not current:
            return {"deleted": False, "error": "Assignment not found"}
        
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        
        # Soft-delete the assignment (mark as cancelled instead of hard delete)
        await self._assignments.update_one(
            {"id": assignment_id},
            {"$set": {
                "status": "cancelled",
                "cancelled_at": now_iso,
                "cancelled_by_user_id": deleted_by_user_id,
                "updated_at": now,
            }}
        )
        
        # Deactivate task assignees linked to this assignment
        from modules.esg_records.task_engine import remove_assignee_for_assignment
        await remove_assignee_for_assignment(db, assignment_id)
        
        # LIFECYCLE: Transition tasks to CANCELLED status instead of deleting
        # Preserve ALL tasks (including unfilled ones) for audit trail
        # Only tasks without actual data submissions get cancelled
        # Tasks with data remain visible but marked as orphaned
        
        # Find all tasks for this assignment
        tasks = await db["esg_reporting_tasks"].find(
            {"assignment_id": assignment_id},
            {"_id": 0, "id": 1, "period_key": 1, "category": 1, "subcategory": 1}
        ).to_list(1000)
        
        tasks_cancelled = 0
        tasks_with_data = 0
        
        for task in tasks:
            # Check if this task has actual data submitted
            task_has_data = await self._task_has_data(
                organization_id=organization_id,
                category=task.get("category"),
                subcategory=task.get("subcategory"),
                facility_id=current.get("facility_id"),
                period_key=task.get("period_key"),
            )
            
            if task_has_data:
                # Task has data - mark as orphaned but keep visible
                await db["esg_reporting_tasks"].update_one(
                    {"id": task["id"]},
                    {"$set": {
                        "lifecycle_status": "orphaned",
                        "orphaned_reason": "assignment_deleted",
                        "orphaned_at": now_iso,
                        "orphaned_by_user_id": deleted_by_user_id,
                        "updated_at": now_iso,
                    }}
                )
                tasks_with_data += 1
            else:
                # Task has no data - mark as cancelled
                await db["esg_reporting_tasks"].update_one(
                    {"id": task["id"]},
                    {"$set": {
                        "lifecycle_status": "cancelled",
                        "cancelled_reason": "assignment_deleted",
                        "cancelled_at": now_iso,
                        "cancelled_by_user_id": deleted_by_user_id,
                        "updated_at": now_iso,
                    }}
                )
                tasks_cancelled += 1
        
        # Cancel pending approval requests for this assignment's entity
        entity_id = current.get("entity_id") or current.get("id")
        approval_result = await db["approval_requests"].update_many(
            {"entity_id": entity_id, "status": "pending", "organization_id": organization_id},
            {"$set": {
                "status": "cancelled",
                "cancelled_reason": "assignment_deleted",
                "updated_at": now_iso,
            }},
        )
        
        # Log history
        await self._log_history(
            assignment_id=assignment_id,
            action=HistoryAction.DELETED,
            previous_value=self._sanitize_doc(current),
            changed_by_user_id=deleted_by_user_id,
        )
        
        return {
            "deleted": True,
            "assignment_id": assignment_id,
            "tasks_cancelled": tasks_cancelled,
            "tasks_with_data_orphaned": tasks_with_data,
            "approval_requests_cancelled": approval_result.modified_count,
            "message": f"Assignment cancelled. {tasks_cancelled} tasks cancelled, {tasks_with_data} tasks with data marked as orphaned."
        }
    
    async def _task_has_data(
        self,
        organization_id: str,
        category: str,
        subcategory: Optional[str],
        facility_id: Optional[str],
        period_key: str,
    ) -> bool:
        """
        Check if a task has actual data submitted (uses CompletionService).
        """
        try:
            from .completion_service import DataChecker
            has_data, _, _ = await DataChecker.check_exists(
                organization_id=organization_id,
                category=category,
                subcategory=subcategory,
                facility_id=facility_id,
                period_key=period_key,
            )
            return has_data
        except Exception as e:
            print(f"Warning: Failed to check task data: {e}")
            return False
    
    async def archive_cancelled_tasks(
        self,
        organization_id: str,
        older_than_days: int = 90,
    ) -> int:
        """
        Archive cancelled tasks older than specified days.
        
        LIFECYCLE: CANCELLED -> ARCHIVED
        
        This is intended to be called by a scheduled job to clean up
        old cancelled tasks while still preserving them in an archived state.
        
        Returns: Number of tasks archived
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=older_than_days)
        
        result = await db["esg_reporting_tasks"].update_many(
            {
                "organization_id": organization_id,
                "lifecycle_status": "cancelled",
                "cancelled_at": {"$lt": cutoff.isoformat()},
            },
            {"$set": {
                "lifecycle_status": "archived",
                "archived_at": datetime.now(timezone.utc).isoformat(),
            }}
        )
        
        return result.modified_count
    
    async def reassign(
        self,
        assignment_id: str,
        organization_id: str,
        request: ReassignRequest,
        reassigned_by_user_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Reassign to a different user.
        
        This is a specific action that preserves the assignment
        but changes the assigned user. The reason is logged in history.
        """
        current = await self._assignments.find_one(
            {"id": assignment_id, "organization_id": organization_id}
        )
        
        if not current:
            return None
        
        old_user_id = current.get("assigned_to_user_id")
        now = datetime.now(timezone.utc)
        
        await self._assignments.update_one(
            {"id": assignment_id},
            {"$set": {
                "assigned_to_user_id": request.new_user_id,
                "updated_at": now,
            }}
        )
        
        # Log history with reason
        await self._log_history(
            assignment_id=assignment_id,
            action=HistoryAction.REASSIGNED,
            previous_value={"assigned_to_user_id": old_user_id},
            new_value={"assigned_to_user_id": request.new_user_id},
            changed_by_user_id=reassigned_by_user_id,
            reason=request.reason,
        )
        
        updated = await self._assignments.find_one(
            {"id": assignment_id},
            {"_id": 0}
        )
        
        return await self._populate_user_names(updated)
    
    # ============================================
    # QUERY METHODS
    # ============================================
    
    async def list_assignments(
        self,
        organization_id: str,
        filter: AssignmentFilter,
    ) -> Dict[str, Any]:
        """List assignments with filtering and pagination"""
        query = {"organization_id": organization_id}
        
        if filter.entity_type:
            query["entity_type"] = filter.entity_type.value
        if filter.assignment_level:
            query["assignment_level"] = filter.assignment_level.value
        if filter.entity_id:
            query["entity_id"] = filter.entity_id
        if filter.facility_id:
            query["facility_id"] = filter.facility_id
        if filter.reporting_period:
            query["reporting_period"] = filter.reporting_period
        if filter.assigned_to_user_id:
            query["assigned_to_user_id"] = filter.assigned_to_user_id
        if filter.role:
            query["role"] = filter.role.value
        if filter.status:
            query["status"] = filter.status.value
        if filter.is_overdue:
            query["due_date"] = {"$lt": datetime.now(timezone.utc)}
            query["status"] = {"$nin": [AssignmentStatus.APPROVED.value, AssignmentStatus.SUBMITTED.value]}
        
        # Get total count
        total = await self._assignments.count_documents(query)
        
        # Get paginated results
        skip = (filter.page - 1) * filter.page_size
        cursor = self._assignments.find(query, {"_id": 0}).skip(skip).limit(filter.page_size).sort("created_at", -1)
        docs = await cursor.to_list(filter.page_size)
        
        # Populate user names
        assignments = []
        for doc in docs:
            doc = await self._populate_user_names(doc)
            assignments.append(doc)
        
        return {
            "assignments": assignments,
            "total": total,
            "page": filter.page,
            "page_size": filter.page_size,
        }
    
    async def get_user_assignments(
        self,
        user_id: str,
        organization_id: str,
        reporting_period: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get all assignments for a specific user (supports multi-assignee model)"""
        query = {
            "organization_id": organization_id,
            "assigned_to_user_id": user_id,
        }
        
        if reporting_period:
            query["reporting_period"] = reporting_period
        
        cursor = self._assignments.find(query, {"_id": 0}).sort("due_date", 1)
        docs = await cursor.to_list(500)
        
        # Separate by entity type
        questions = []
        records = []
        overdue_count = 0
        pending_count = 0
        in_progress_count = 0
        now = datetime.now(timezone.utc)
        
        for doc in docs:
            doc = await self._populate_user_names(doc)
            
            # Add user's role in this assignment
            doc["user_role"] = doc.get("role", "editor")
            
            if doc.get("entity_type") == EntityType.QUESTION.value:
                questions.append(doc)
            else:
                records.append(doc)
            
            # Count statuses
            status = doc.get("status")
            if status == AssignmentStatus.PENDING.value:
                pending_count += 1
            elif status == AssignmentStatus.IN_PROGRESS.value:
                in_progress_count += 1
            
            # Check overdue
            due_date = doc.get("due_date")
            if due_date:
                # Parse due_date if it's a string
                if isinstance(due_date, str):
                    try:
                        due_date = datetime.fromisoformat(due_date.replace('Z', '+00:00'))
                    except (ValueError, TypeError):
                        due_date = None
                # Ensure due_date is timezone-aware for comparison
                if due_date and due_date.tzinfo is None:
                    due_date = due_date.replace(tzinfo=timezone.utc)
                if due_date and due_date < now and status not in [AssignmentStatus.APPROVED.value, AssignmentStatus.SUBMITTED.value]:
                    overdue_count += 1
        
        return {
            "questions": questions,
            "records": records,
            "total_questions": len(questions),
            "total_records": len(records),
            "overdue_count": overdue_count,
            "pending_count": pending_count,
            "in_progress_count": in_progress_count,
        }
    
    async def get_assignment_for_entity(
        self,
        organization_id: str,
        entity_type: EntityType,
        entity_id: str,
        reporting_period: str,
        facility_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Get assignment for a specific entity"""
        query = {
            "organization_id": organization_id,
            "entity_type": entity_type.value,
            "entity_id": entity_id,
            "reporting_period": reporting_period,
        }
        
        if facility_id:
            query["facility_id"] = facility_id
        
        doc = await self._assignments.find_one(query, {"_id": 0})
        
        if doc:
            doc = await self._populate_user_names(doc)
        
        return doc
    
    # ============================================
    # BULK OPERATIONS
    # ============================================
    
    async def bulk_assign(
        self,
        organization_id: str,
        request: BulkAssignmentRequest,
        assigned_by_user_id: str,
    ) -> Dict[str, Any]:
        """
        Bulk assign at a higher level (section, topic, principle, category).
        
        Creates a group_assignment_id to track related assignments.
        Expands the assignment to individual entities if needed.
        """
        group_id = str(uuid.uuid4())
        created_count = 0
        
        # Create the parent-level assignment
        parent_request = CreateAssignmentRequest(
            entity_type=request.entity_type,
            assignment_level=request.assignment_level,
            entity_id=request.entity_id,
            facility_id=request.facility_id,
            reporting_period=request.reporting_period,
            assigned_to_user_id=request.assigned_to_user_id,
            role=request.role,
            filling_frequency=request.filling_frequency,
            reminder_enabled=request.reminder_enabled,
            reminder_frequency=request.reminder_frequency,
        )
        
        await self.create_assignment(
            organization_id=organization_id,
            request=parent_request,
            assigned_by_user_id=assigned_by_user_id,
            group_assignment_id=group_id,
        )
        created_count += 1
        
        return {
            "group_assignment_id": group_id,
            "created_count": created_count,
            "assignment_level": request.assignment_level.value,
            "entity_id": request.entity_id,
        }
    
    async def delete_bulk_assignment(
        self,
        group_assignment_id: str,
        organization_id: str,
        deleted_by_user_id: str,
    ) -> int:
        """Delete all assignments in a group"""
        # Get all assignments in group
        cursor = self._assignments.find(
            {"group_assignment_id": group_assignment_id, "organization_id": organization_id}
        )
        docs = await cursor.to_list(500)
        
        # Log history for each
        for doc in docs:
            await self._log_history(
                assignment_id=doc["id"],
                action=HistoryAction.DELETED,
                previous_value=self._sanitize_doc(doc),
                changed_by_user_id=deleted_by_user_id,
            )
        
        # Delete all
        result = await self._assignments.delete_many(
            {"group_assignment_id": group_assignment_id, "organization_id": organization_id}
        )
        
        return result.deleted_count
    
    # ============================================
    # HISTORY METHODS
    # ============================================
    
    async def get_assignment_history(
        self,
        assignment_id: str,
        organization_id: str,
    ) -> List[Dict[str, Any]]:
        """Get history for an assignment"""
        # Verify assignment belongs to org
        assignment = await self._assignments.find_one(
            {"id": assignment_id, "organization_id": organization_id}
        )
        
        if not assignment:
            return []
        
        cursor = self._assignment_history.find(
            {"assignment_id": assignment_id},
            {"_id": 0}
        ).sort("created_at", -1)
        
        docs = await cursor.to_list(100)
        
        # Populate user names
        for doc in docs:
            user = await self._users.find_one(
                {"id": doc.get("changed_by_user_id")},
                {"name": 1, "email": 1}
            )
            if user:
                doc["changed_by_user_name"] = user.get("name") or user.get("email")
        
        return docs
    
    async def _log_history(
        self,
        assignment_id: str,
        action: HistoryAction,
        changed_by_user_id: str,
        previous_value: Optional[Dict] = None,
        new_value: Optional[Dict] = None,
        reason: Optional[str] = None,
    ):
        """Log an action to assignment history"""
        history_entry = {
            "id": str(uuid.uuid4()),
            "assignment_id": assignment_id,
            "action": action.value,
            "previous_value": self._sanitize_doc(previous_value) if previous_value else None,
            "new_value": self._sanitize_doc(new_value) if new_value else None,
            "changed_by_user_id": changed_by_user_id,
            "reason": reason,
            "created_at": datetime.now(timezone.utc),
        }
        
        await self._assignment_history.insert_one(history_entry)
    
    # ============================================
    # REMINDER METHODS
    # ============================================
    
    async def get_due_reminders(self) -> List[Dict[str, Any]]:
        """Get assignments with reminders due to be sent"""
        now = datetime.now(timezone.utc)
        
        cursor = self._assignments.find(
            {
                "reminder_enabled": True,
                "next_reminder_at": {"$lte": now},
                "status": {"$nin": [AssignmentStatus.APPROVED.value]},
            },
            {"_id": 0}
        )
        
        return await cursor.to_list(500)
    
    async def mark_reminder_sent(self, assignment_id: str):
        """Mark that a reminder was sent and calculate next reminder time"""
        now = datetime.now(timezone.utc)
        
        assignment = await self._assignments.find_one({"id": assignment_id})
        if not assignment:
            return
        
        next_reminder = self._calculate_next_reminder_from_doc(assignment, from_time=now)
        
        await self._assignments.update_one(
            {"id": assignment_id},
            {"$set": {
                "last_reminder_sent_at": now,
                "next_reminder_at": next_reminder,
            }}
        )
    
    def _calculate_next_reminder(self, request: CreateAssignmentRequest) -> Optional[datetime]:
        """Calculate the next reminder time for a new assignment"""
        if not request.reminder_enabled or not request.reminder_frequency:
            return None
        
        now = datetime.now(timezone.utc)
        
        # If due date exists and reminder_start_before_days is set
        if request.due_date and request.reminder_start_before_days:
            reminder_start = request.due_date - timedelta(days=request.reminder_start_before_days)
            if reminder_start > now:
                return reminder_start
        
        # Otherwise calculate based on frequency
        return self._add_frequency_interval(now, request.reminder_frequency)
    
    def _calculate_next_reminder_from_doc(
        self,
        doc: Dict[str, Any],
        from_time: Optional[datetime] = None,
    ) -> Optional[datetime]:
        """Calculate next reminder from existing assignment document"""
        if not doc.get("reminder_enabled"):
            return None
        
        frequency = doc.get("reminder_frequency")
        if not frequency:
            return None
        
        base_time = from_time or datetime.now(timezone.utc)
        
        try:
            freq_enum = ReminderFrequency(frequency)
            return self._add_frequency_interval(base_time, freq_enum)
        except ValueError:
            return None
    
    def _add_frequency_interval(
        self,
        base_time: datetime,
        frequency: ReminderFrequency,
    ) -> datetime:
        """Add frequency interval to a datetime"""
        if frequency == ReminderFrequency.HOURLY:
            return base_time + timedelta(hours=1)
        elif frequency == ReminderFrequency.DAILY:
            return base_time + timedelta(days=1)
        elif frequency == ReminderFrequency.WEEKLY:
            return base_time + timedelta(weeks=1)
        elif frequency == ReminderFrequency.MONTHLY:
            return base_time + timedelta(days=30)
        elif frequency == ReminderFrequency.QUARTERLY:
            return base_time + timedelta(days=90)
        else:
            return base_time + timedelta(days=1)
    
    # ============================================
    # HELPER METHODS
    # ============================================
    
    async def _populate_user_names(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        """Populate user names from user IDs"""
        if doc.get("assigned_to_user_id"):
            user = await self._users.find_one(
                {"id": doc["assigned_to_user_id"]},
                {"name": 1, "email": 1}
            )
            if user:
                doc["assigned_to_user_name"] = user.get("name") or user.get("email")
        
        if doc.get("assigned_by_user_id"):
            user = await self._users.find_one(
                {"id": doc["assigned_by_user_id"]},
                {"name": 1, "email": 1}
            )
            if user:
                doc["assigned_by_user_name"] = user.get("name") or user.get("email")
        
        return doc
    
    def _sanitize_doc(self, doc: Optional[Dict]) -> Optional[Dict]:
        """Remove MongoDB _id from document"""
        if not doc:
            return None
        
        if isinstance(doc, dict):
            return {k: v for k, v in doc.items() if k != "_id"}
        
        return doc

    async def send_reminder_for_assignment(
        self,
        assignment_id: str,
        organization_id: str,
        sent_by_user_id: str,
    ) -> Dict[str, Any]:
        """
        Send a reminder email for a specific assignment.
        """
        import logging
        from datetime import datetime, timezone
        from shared.helpers.email import send_email
        from shared.notifications import create_notification
        from .email_templates import assignment_reminder_email
        
        # Find the assignment
        assignment = await self._assignments.find_one({
            "id": assignment_id,
            "organization_id": organization_id,
        })
        
        if not assignment:
            raise HTTPException(status_code=404, detail="Assignment not found")
        
        # Get assigned user
        assigned_user = await self._users.find_one(
            {"id": assignment.get("assigned_to_user_id")},
            {"email": 1, "name": 1, "full_name": 1, "id": 1}
        )
        
        if not assigned_user or not assigned_user.get("email"):
            raise HTTPException(status_code=400, detail="Assigned user not found or has no email")
        
        # Get sender name
        sender = await self._users.find_one(
            {"id": sent_by_user_id},
            {"name": 1, "full_name": 1, "email": 1}
        )
        sender_name = "Admin"
        if sender:
            sender_name = sender.get("full_name") or sender.get("name") or sender.get("email", "").split("@")[0]
        
        user_name = assigned_user.get("full_name") or assigned_user.get("name") or assigned_user.get("email", "").split("@")[0]
        
        # Format entity_id for display (replace underscores with spaces, title case)
        raw_entity_id = assignment.get("entity_id", "Task")
        entity_id_display = raw_entity_id.replace("_", " ").replace("-", " ").title()
        
        # Format reporting period with dates if available
        reporting_period = assignment.get("reporting_period", "")
        start_date = assignment.get("start_date")
        end_date = assignment.get("end_date")
        
        if start_date and end_date:
            try:
                from datetime import datetime as dt
                start_dt = dt.fromisoformat(start_date.replace("Z", "+00:00")) if isinstance(start_date, str) else start_date
                end_dt = dt.fromisoformat(end_date.replace("Z", "+00:00")) if isinstance(end_date, str) else end_date
                reporting_period = f"{start_dt.strftime('%b %d, %Y')} - {end_dt.strftime('%b %d, %Y')}"
            except Exception:
                pass  # Keep original reporting_period if date parsing fails
        
        # Send email
        try:
            email_body = assignment_reminder_email(
                user_name=user_name,
                entity_type=assignment.get("entity_type", ""),
                entity_id=entity_id_display,
                status=assignment.get("status", "pending"),
                due_date=assignment.get("due_date"),
                reporting_period=reporting_period,
            )
            
            await send_email(
                to_email=assigned_user["email"],
                subject=f"Reminder: {entity_id_display} - ESG Assignment",
                body=email_body,
            )
            logging.info(f"Reminder email sent to {assigned_user['email']} for assignment {assignment_id}")
            
            # Create in-app notification
            await create_notification(
                user_id=assigned_user["id"],
                org_id=organization_id,
                title="Reminder",
                message=f"Reminder: {entity_id_display} is pending your action",
                notification_type="reminder",
                link="/environment",
                metadata={"assignment_id": assignment_id, "entity_id": entity_id_display},
            )
            
            # Update last_reminder_sent_at
            await self._assignments.update_one(
                {"id": assignment_id},
                {"$set": {"last_reminder_sent_at": datetime.now(timezone.utc)}}
            )
            
            return {"success": True, "message": "Reminder sent successfully"}
            
        except Exception as e:
            logging.error(f"Failed to send reminder for assignment {assignment_id}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to send reminder: {str(e)}")
    
    async def _send_assignment_notifications(
        self,
        assignment: Dict[str, Any],
        assigned_by_user_id: str,
    ):
        """
        Send email + in-app notification to assignee AND approver(s).
        """
        import logging
        from shared.helpers.email import send_email
        from shared.notifications import create_notification
        from .email_templates import assignment_created_email

        try:
            org_id = assignment.get("organization_id", "")
            entity_id = assignment.get("entity_id", "Task")

            # Get assigner name
            assigner = await self._users.find_one(
                {"id": assigned_by_user_id}, {"name": 1, "email": 1, "full_name": 1}
            )
            assigner_name = "Admin"
            if assigner:
                assigner_name = assigner.get("full_name") or assigner.get("name") or assigner.get("email", "").split("@")[0]

            # --- Notify assignee ---
            assigned_user = await self._users.find_one(
                {"id": assignment.get("assigned_to_user_id")},
                {"email": 1, "name": 1, "full_name": 1, "id": 1}
            )
            if assigned_user and assigned_user.get("email"):
                user_name = assigned_user.get("full_name") or assigned_user.get("name") or assigned_user.get("email", "").split("@")[0]

                # Email
                email_body = assignment_created_email(
                    user_name=user_name,
                    entity_type=assignment.get("entity_type", ""),
                    entity_id=entity_id,
                    reporting_period=assignment.get("reporting_period", ""),
                    due_date=assignment.get("due_date"),
                    assigned_by=assigner_name,
                )
                await send_email(
                    to_email=assigned_user["email"],
                    subject=f"New ESG Assignment: {entity_id}",
                    body=email_body,
                )
                logging.info(f"Assignment email sent to {assigned_user['email']}")

                # In-app notification
                await create_notification(
                    user_id=assigned_user["id"],
                    org_id=org_id,
                    title="New Assignment",
                    message=f"You've been assigned: {entity_id}",
                    notification_type="assignment",
                    link="/environment",
                    metadata={"assignment_id": assignment.get("id"), "entity_id": entity_id},
                )

            # --- Notify approver(s) ---
            approval_chain = assignment.get("approval_chain") or []
            for approver_id in approval_chain:
                approver = await self._users.find_one(
                    {"id": approver_id},
                    {"email": 1, "name": 1, "full_name": 1, "id": 1}
                )
                if approver and approver.get("email"):
                    approver_name = approver.get("full_name") or approver.get("name") or approver.get("email", "").split("@")[0]

                    # Email
                    await send_email(
                        to_email=approver["email"],
                        subject=f"You've been assigned as approver: {entity_id}",
                        body=assignment_created_email(
                            user_name=approver_name,
                            entity_type=assignment.get("entity_type", ""),
                            entity_id=entity_id,
                            reporting_period=assignment.get("reporting_period", ""),
                            due_date=assignment.get("due_date"),
                            assigned_by=assigner_name,
                        ),
                    )
                    logging.info(f"Approver email sent to {approver['email']}")

                    # In-app notification
                    await create_notification(
                        user_id=approver["id"],
                        org_id=org_id,
                        title="Assigned as Approver",
                        message=f"You're the approver for: {entity_id}",
                        notification_type="approval",
                        link="/approval-queue",
                        metadata={"assignment_id": assignment.get("id"), "entity_id": entity_id},
                    )

        except Exception as e:
            logging.error(f"Failed to send assignment notifications: {e}")


# Singleton instance
assignment_service = AssignmentService()
