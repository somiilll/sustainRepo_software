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
        self._response_versions = db["esg_response_versions"]
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
        
        # Log history
        await self._log_history(
            assignment_id=assignment["id"],
            action=HistoryAction.CREATED,
            new_value=assignment,
            changed_by_user_id=assigned_by_user_id,
        )
        
        # Send email notification to assigned user
        await self._send_assignment_notification(
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
    ) -> bool:
        """Delete an assignment"""
        current = await self._assignments.find_one(
            {"id": assignment_id, "organization_id": organization_id}
        )
        
        if not current:
            return False
        
        await self._assignments.delete_one({"id": assignment_id})
        
        # Log history
        await self._log_history(
            assignment_id=assignment_id,
            action=HistoryAction.DELETED,
            previous_value=self._sanitize_doc(current),
            changed_by_user_id=deleted_by_user_id,
        )
        
        return True
    
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
        """Get all assignments for a specific user"""
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
    # RESPONSE VERSION HISTORY
    # ============================================
    
    async def log_response_version(
        self,
        organization_id: str,
        question_key: str,
        reporting_period: str,
        previous_value: Optional[Dict],
        new_value: Optional[Dict],
        changed_by_user_id: str,
        change_type: ResponseChangeType,
    ) -> Dict[str, Any]:
        """
        Log a version of a question response.
        
        Called when responses are saved/updated.
        """
        # Get current version number
        latest = await self._response_versions.find_one(
            {
                "organization_id": organization_id,
                "question_key": question_key,
                "reporting_period": reporting_period,
            },
            sort=[("version_number", -1)]
        )
        
        version_number = (latest.get("version_number", 0) + 1) if latest else 1
        
        version_entry = {
            "id": str(uuid.uuid4()),
            "organization_id": organization_id,
            "question_key": question_key,
            "reporting_period": reporting_period,
            "version_number": version_number,
            "previous_value": previous_value,
            "new_value": new_value,
            "changed_by_user_id": changed_by_user_id,
            "change_type": change_type.value,
            "created_at": datetime.now(timezone.utc),
        }
        
        await self._response_versions.insert_one(version_entry)
        
        return self._sanitize_doc(version_entry)
    
    async def get_response_versions(
        self,
        organization_id: str,
        question_key: str,
        reporting_period: str,
    ) -> List[Dict[str, Any]]:
        """Get version history for a question response"""
        cursor = self._response_versions.find(
            {
                "organization_id": organization_id,
                "question_key": question_key,
                "reporting_period": reporting_period,
            },
            {"_id": 0}
        ).sort("version_number", -1)
        
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
    
    async def _send_assignment_notification(
        self,
        assignment: Dict[str, Any],
        assigned_by_user_id: str,
    ):
        """
        Send email notification when a new assignment is created.
        """
        import logging
        from shared.helpers.email import send_email
        from .email_templates import assignment_created_email
        
        try:
            # Get assigned user details
            assigned_user = await self._users.find_one(
                {"id": assignment.get("assigned_to_user_id")},
                {"email": 1, "name": 1}
            )
            
            if not assigned_user or not assigned_user.get("email"):
                logging.warning(f"Cannot send assignment notification: user not found or no email")
                return
            
            # Get assigner details
            assigner = await self._users.find_one(
                {"id": assigned_by_user_id},
                {"name": 1, "email": 1}
            )
            assigner_name = "Admin"
            if assigner:
                assigner_name = assigner.get("name") or assigner.get("email", "").split("@")[0]
            
            user_name = assigned_user.get("name") or assigned_user.get("email", "").split("@")[0]
            
            email_body = assignment_created_email(
                user_name=user_name,
                entity_type=assignment.get("entity_type", ""),
                entity_id=assignment.get("entity_id", ""),
                reporting_period=assignment.get("reporting_period", ""),
                due_date=assignment.get("due_date"),
                assigned_by=assigner_name,
            )
            
            await send_email(
                to_email=assigned_user["email"],
                subject=f"New ESG Assignment: {assignment.get('entity_id', 'Task')}",
                body=email_body,
            )
            
            logging.info(f"Assignment notification sent to {assigned_user['email']}")
            
        except Exception as e:
            logging.error(f"Failed to send assignment notification: {e}")


# Singleton instance
assignment_service = AssignmentService()
