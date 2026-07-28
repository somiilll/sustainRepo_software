"""
Approval Workflow Service

Business logic for the Enterprise Approval Workflow Engine.
Handles workflow management, request processing, and approval actions.
"""

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Tuple

from shared.database.mongo import db

from .models import (
    ApprovalWorkflow,
    ApprovalRequest,
    ApprovalHistoryEntry,
    ApprovalStepRecord,
    ApprovalLevel,
    ApprovalStatus,
    ApprovalAction,
    WorkflowStatus,
    EntityType,
    ApproverType,
    CreateWorkflowInput,
    UpdateWorkflowInput,
    SubmitForApprovalInput,
    ApprovalDecisionInput,
    ApprovalRequestSummary,
    generate_id,
)

logger = logging.getLogger(__name__)

# Collection names
WORKFLOWS_COLLECTION = "approval_workflows"
REQUESTS_COLLECTION = "approval_requests"
HISTORY_COLLECTION = "approval_history"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat()


async def _create_approval_version_snapshot(
    collection_name: str,
    record_id: str,
    action: str,  # "approved" or "rejected"
    user_id: str,
    rejection_reason: Optional[str] = None,
    extra_metadata: Optional[Dict[str, Any]] = None,
    changed_fields: Optional[List[str]] = None,  # Fields that were changed (for edit approvals)
    request_type: Optional[str] = None,  # "create", "update", "delete" for emission records
):
    """
    Create a version snapshot for approval/rejection events.
    
    This captures governance state changes in the version history so users
    can see when a record was approved/rejected and by whom.
    """
    import uuid
    
    # Map collection to versions collection
    # NOTE: ESG records use singular "record" (e.g., environment_record_versions)
    # to match ESGRecordsService._get_versions_collection()
    versions_collection_map = {
        "environment_records": "environment_record_versions",
        "social_records": "social_record_versions",
        "governance_records": "governance_record_versions",
        "emission_records": "emission_history",  # Emission records use emission_history
        "esg_responses": "esg_responses_versions",
        "organization_esg_responses": "esg_responses_versions",
    }
    
    versions_collection = versions_collection_map.get(collection_name)
    if not versions_collection:
        logger.warning(f"No versions collection for {collection_name}")
        return
    
    # For emission_records, use emission_history format
    if collection_name == "emission_records":
        await _create_emission_history_entry(
            record_id=record_id,
            action=action,
            user_id=user_id,
            rejection_reason=rejection_reason,
            request_type=request_type,
        )
        return
    
    # Get the current record to capture its state
    record = await db[collection_name].find_one(
        {"id": record_id} if collection_name != "esg_responses" else {"question_key": record_id},
        {"_id": 0}
    )
    
    if not record:
        logger.warning(f"Record {record_id} not found for version snapshot")
        return
    
    # Get max version from versions collection (not from record) to avoid duplicates
    latest_version = await db[versions_collection].find_one(
        {"record_id": record_id},
        {"_id": 0, "version": 1},
        sort=[("version", -1)]
    )
    next_version = (latest_version.get("version", 0) if latest_version else 0) + 1
    
    # Determine changed fields - use provided list or default to approval_status
    snapshot_changed_fields = changed_fields if changed_fields else ["approval_status"]
    
    # Create version snapshot
    version_doc = {
        "id": str(uuid.uuid4()),
        "record_id": record_id,
        "version": next_version,
        "snapshot": record,
        "changed_fields": snapshot_changed_fields,
        "change_reason": f"Record {action}" + (f": {rejection_reason}" if rejection_reason else ""),
        "change_type": action,  # "approved" or "rejected"
        "created_by": user_id,
        "created_at": _now_iso(),
    }
    
    # Add rejection details if rejected
    if action == "rejected" and rejection_reason:
        version_doc["rejection_reason"] = rejection_reason
    
    # Add any extra metadata (e.g., question_key, framework, section)
    if extra_metadata:
        version_doc.update(extra_metadata)
    
    await db[versions_collection].insert_one(version_doc)
    logger.info(f"Created {action} version snapshot v{next_version} for {collection_name} record {record_id}")


async def _create_emission_history_entry(
    record_id: str,
    action: str,  # "approved" or "rejected"
    user_id: str,
    rejection_reason: Optional[str] = None,
    request_type: Optional[str] = None,
):
    """
    Create an entry in emission_history for approval/rejection events.
    This ensures the approval flow is captured in the emission's version history.
    """
    import uuid
    
    # Get user info
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1, "full_name": 1})
    user_email = user.get("email", "") if user else ""
    user_name = user.get("full_name", "") if user else ""
    
    # Get the emission record if it exists
    record = await db.emission_records.find_one({"id": record_id}, {"_id": 0})
    
    # Determine action display
    action_map = {
        ("approved", "create"): "Submission Approved",
        ("approved", "update"): "Update Approved",
        ("rejected", "create"): "Submission Rejected",
        ("rejected", "update"): "Update Rejected",
    }
    action_display = action_map.get((action, request_type), f"{action.title()}")
    
    history_entry = {
        "id": str(uuid.uuid4()),
        "emission_id": record_id,
        "facility_id": record.get("facility_id") if record else None,
        "organization_id": record.get("organization_id") if record else None,
        "scope": record.get("scope") if record else None,
        "category": record.get("category") if record else None,
        "changed_by": user_id,
        "changed_by_email": user_email,
        "changed_by_name": user_name,
        "changed_at": _now_iso(),
        "version": (record.get("version", 0) if record else 0) + 1,
        "field_changes": [],
        "changes_summary": action_display,
        "changes": {
            "action": action,
            "request_type": request_type,
            "rejection_reason": rejection_reason,
        },
    }
    
    await db.emission_history.insert_one(history_entry)
    logger.info(f"Created emission_history entry for {action} on record {record_id}")


class ApprovalWorkflowService:
    """Service class for approval workflow operations."""
    
    # =========================================================================
    # WORKFLOW MANAGEMENT
    # =========================================================================
    
    @staticmethod
    async def create_workflow(
        organization_id: str,
        data: CreateWorkflowInput,
        current_user: dict,
    ) -> Tuple[bool, str, Optional[dict]]:
        """
        Create a new approval workflow.
        
        Returns:
            (success, message, workflow)
        """
        # Check if workflow already exists for this entity type
        existing = await db[WORKFLOWS_COLLECTION].find_one({
            "organization_id": organization_id,
            "entity_type": data.entity_type.value if hasattr(data.entity_type, 'value') else data.entity_type,
            "entity_subtype": data.entity_subtype,
            "status": {"$ne": WorkflowStatus.ARCHIVED.value},
        })
        
        if existing:
            return (False, f"Active workflow already exists for {data.entity_type}", None)
        
        # Validate levels
        if not data.levels or len(data.levels) == 0:
            return (False, "At least one approval level is required", None)
        
        # Ensure levels are properly numbered
        levels = []
        for i, level in enumerate(data.levels, start=1):
            level_dict = level.dict() if hasattr(level, 'dict') else dict(level)
            level_dict['level'] = i
            levels.append(level_dict)
        
        workflow = ApprovalWorkflow(
            organization_id=organization_id,
            name=data.name,
            description=data.description,
            entity_type=data.entity_type,
            entity_subtype=data.entity_subtype,
            levels=levels,
            require_all_levels=data.require_all_levels,
            allow_parallel_approval=data.allow_parallel_approval,
            allow_self_approval=data.allow_self_approval,
            require_comments_on_reject=data.require_comments_on_reject,
            require_comments_on_changes=data.require_comments_on_changes,
            default_deadline_days=data.default_deadline_days,
            created_by=current_user.get("id"),
        )
        
        workflow_dict = workflow.dict()
        workflow_dict['created_at'] = _now_iso()
        
        await db[WORKFLOWS_COLLECTION].insert_one(workflow_dict)
        workflow_dict.pop("_id", None)
        
        logger.info(f"Created workflow {workflow.id} for {organization_id}: {data.entity_type}")
        return (True, "Workflow created successfully", workflow_dict)
    
    @staticmethod
    async def get_workflow(workflow_id: str) -> Optional[dict]:
        """Get a workflow by ID."""
        return await db[WORKFLOWS_COLLECTION].find_one({"id": workflow_id}, {"_id": 0})
    
    @staticmethod
    async def get_workflows_for_org(
        organization_id: str,
        include_inactive: bool = False,
    ) -> List[dict]:
        """Get all workflows for an organization."""
        query = {"organization_id": organization_id}
        if not include_inactive:
            query["status"] = WorkflowStatus.ACTIVE.value
        
        return await db[WORKFLOWS_COLLECTION].find(query, {"_id": 0}).to_list(100)
    
    @staticmethod
    async def get_workflow_for_entity(
        organization_id: str,
        entity_type: str,
        entity_subtype: Optional[str] = None,
    ) -> Optional[dict]:
        """
        Find the active workflow for a specific entity type.
        Tries exact match first, then falls back to entity_type only.
        """
        # Try exact match with subtype
        if entity_subtype:
            workflow = await db[WORKFLOWS_COLLECTION].find_one({
                "organization_id": organization_id,
                "entity_type": entity_type,
                "entity_subtype": entity_subtype,
                "status": WorkflowStatus.ACTIVE.value,
            }, {"_id": 0})
            if workflow:
                return workflow
        
        # Fall back to entity_type only (subtype=None means "all")
        return await db[WORKFLOWS_COLLECTION].find_one({
            "organization_id": organization_id,
            "entity_type": entity_type,
            "entity_subtype": None,
            "status": WorkflowStatus.ACTIVE.value,
        }, {"_id": 0})
    
    @staticmethod
    async def update_workflow(
        workflow_id: str,
        data: UpdateWorkflowInput,
        current_user: dict,
    ) -> Tuple[bool, str, Optional[dict]]:
        """Update a workflow."""
        workflow = await db[WORKFLOWS_COLLECTION].find_one({"id": workflow_id}, {"_id": 0})
        if not workflow:
            return (False, "Workflow not found", None)
        
        update_data = {}
        if data.name is not None:
            update_data["name"] = data.name
        if data.description is not None:
            update_data["description"] = data.description
        if data.levels is not None:
            # Renumber levels
            levels = []
            for i, level in enumerate(data.levels, start=1):
                level_dict = level.dict() if hasattr(level, 'dict') else dict(level)
                level_dict['level'] = i
                levels.append(level_dict)
            update_data["levels"] = levels
        if data.status is not None:
            update_data["status"] = data.status.value if hasattr(data.status, 'value') else data.status
        if data.require_all_levels is not None:
            update_data["require_all_levels"] = data.require_all_levels
        if data.allow_parallel_approval is not None:
            update_data["allow_parallel_approval"] = data.allow_parallel_approval
        if data.default_deadline_days is not None:
            update_data["default_deadline_days"] = data.default_deadline_days
        
        update_data["updated_at"] = _now_iso()
        update_data["updated_by"] = current_user.get("id")
        
        await db[WORKFLOWS_COLLECTION].update_one(
            {"id": workflow_id},
            {"$set": update_data}
        )
        
        updated = await db[WORKFLOWS_COLLECTION].find_one({"id": workflow_id}, {"_id": 0})
        return (True, "Workflow updated successfully", updated)
    
    @staticmethod
    async def delete_workflow(workflow_id: str) -> Tuple[bool, str]:
        """Soft delete (archive) a workflow."""
        result = await db[WORKFLOWS_COLLECTION].update_one(
            {"id": workflow_id},
            {"$set": {"status": WorkflowStatus.ARCHIVED.value, "updated_at": _now_iso()}}
        )
        if result.modified_count > 0:
            return (True, "Workflow archived")
        return (False, "Workflow not found")
    
    # =========================================================================
    # APPROVAL REQUEST MANAGEMENT
    # =========================================================================
    
    @staticmethod
    async def submit_for_approval(
        organization_id: str,
        data: SubmitForApprovalInput,
        current_user: dict,
    ) -> Tuple[bool, str, Optional[dict]]:
        """
        Submit an entity for approval.
        
        Returns:
            (success, message, request)
        """
        # Find applicable workflow
        if data.workflow_id:
            workflow = await ApprovalWorkflowService.get_workflow(data.workflow_id)
            if not workflow or workflow.get("organization_id") != organization_id:
                return (False, "Workflow not found", None)
        else:
            entity_type_val = data.entity_type.value if hasattr(data.entity_type, 'value') else data.entity_type
            workflow = await ApprovalWorkflowService.get_workflow_for_entity(
                organization_id,
                entity_type_val,
                data.entity_subtype,
            )
            if not workflow:
                return (False, f"No active workflow found for {data.entity_type}", None)
        
        # Check if there's already a pending request for this entity
        existing = await db[REQUESTS_COLLECTION].find_one({
            "organization_id": organization_id,
            "entity_id": data.entity_id,
            "status": {"$in": [ApprovalStatus.PENDING.value, ApprovalStatus.IN_REVIEW.value]},
        })
        if existing:
            return (False, "Entity already has a pending approval request", None)
        
        # Determine approvers for level 1
        levels = workflow.get("levels", [])
        if not levels:
            return (False, "Workflow has no approval levels", None)
        
        first_level = levels[0]
        current_approvers = await ApprovalWorkflowService._resolve_approvers(
            organization_id,
            first_level,
            current_user,
        )
        
        # Calculate deadline
        deadline = None
        if workflow.get("default_deadline_days"):
            deadline = _now() + timedelta(days=workflow["default_deadline_days"])
        
        # Create request
        entity_type_val = data.entity_type.value if hasattr(data.entity_type, 'value') else data.entity_type
        request = ApprovalRequest(
            organization_id=organization_id,
            workflow_id=workflow["id"],
            workflow_name=workflow["name"],
            entity_type=entity_type_val,
            entity_id=data.entity_id,
            entity_subtype=data.entity_subtype,
            entity_snapshot=data.entity_snapshot,
            entity_changes=data.entity_changes,
            submitted_by=current_user.get("id"),
            submitted_by_email=current_user.get("email", ""),
            submitted_by_name=current_user.get("full_name", ""),
            submission_comment=data.comment,
            status=ApprovalStatus.PENDING,
            current_level=1,
            current_approvers=current_approvers,
            total_levels=len(levels),
            deadline=deadline,
        )
        
        request_dict = request.dict()
        request_dict['submitted_at'] = _now_iso()
        request_dict['created_at'] = _now_iso()
        if request_dict.get('deadline'):
            request_dict['deadline'] = request_dict['deadline'].isoformat() if hasattr(request_dict['deadline'], 'isoformat') else request_dict['deadline']
        
        await db[REQUESTS_COLLECTION].insert_one(request_dict)
        request_dict.pop("_id", None)
        
        # Record in history
        await ApprovalWorkflowService._record_history(
            request_dict,
            ApprovalAction.SUBMIT,
            current_user,
            new_status=ApprovalStatus.PENDING,
        )
        
        logger.info(f"Created approval request {request.id} for entity {data.entity_id}")
        
        # Notify approver(s) via email + in-app
        try:
            from shared.helpers.email import send_email
            from shared.notifications import create_notification
            
            submitter_name = current_user.get("full_name") or current_user.get("email", "").split("@")[0]
            
            for approver_id in current_approvers:
                approver = await db.users.find_one({"id": approver_id}, {"_id": 0, "email": 1, "full_name": 1, "name": 1, "id": 1})
                if approver and approver.get("email"):
                    approver_name = approver.get("full_name") or approver.get("name") or ""
                    await send_email(
                        to_email=approver["email"],
                        subject=f"Approval Required: {data.entity_id}",
                        body=f"<p>Hi {approver_name},</p><p><strong>{submitter_name}</strong> has submitted <strong>{data.entity_id}</strong> for your approval.</p><p>Please review it in the Approval Queue.</p>",
                    )
                    await create_notification(
                        user_id=approver["id"],
                        org_id=organization_id,
                        title="Approval Required",
                        message=f"{submitter_name} submitted {data.entity_id} for approval",
                        notification_type="approval",
                        link="/approval-queue",
                        metadata={"request_id": request.id, "entity_id": data.entity_id},
                    )
        except Exception as e:
            logger.error(f"Failed to send approval notifications: {e}")
        
        return (True, "Submitted for approval", request_dict)
    
    @staticmethod
    async def _resolve_approvers(
        organization_id: str,
        level: dict,
        submitter: dict,
    ) -> List[str]:
        """Resolve the list of user IDs who can approve at this level."""
        approver_type = level.get("approver_type")
        approver_id = level.get("approver_id")
        
        if approver_type == ApproverType.USER.value:
            return [approver_id] if approver_id else []
        
        elif approver_type == ApproverType.ROLE.value:
            # Find active users with this role in the organization
            users = await db.users.find({
                "organization_id": organization_id,
                "role": approver_id,
                "is_deleted": {"$ne": True},
            }, {"_id": 0, "id": 1}).to_list(100)
            return [u["id"] for u in users]
        
        elif approver_type == ApproverType.ORG_ADMIN.value:
            # Find active org admins
            users = await db.users.find({
                "organization_id": organization_id,
                "role": {"$in": ["admin", "super_admin"]},
                "is_deleted": {"$ne": True},
            }, {"_id": 0, "id": 1}).to_list(100)
            return [u["id"] for u in users]
        
        elif approver_type == ApproverType.MANAGER.value:
            # Get submitter's manager
            manager_id = submitter.get("manager_id")
            return [manager_id] if manager_id else []
        
        elif approver_type == ApproverType.FACILITY_ADMIN.value:
            # Would need facility context
            facility_id = level.get("facility_id")
            if facility_id:
                facility = await db.facilities.find_one({"id": facility_id}, {"_id": 0, "admin_id": 1})
                if facility and facility.get("admin_id"):
                    return [facility["admin_id"]]
            return []
        
        return []
    
    @staticmethod
    async def get_request(request_id: str) -> Optional[dict]:
        """Get an approval request by ID."""
        return await db[REQUESTS_COLLECTION].find_one({"id": request_id}, {"_id": 0})
    
    @staticmethod
    async def get_requests_for_entity(entity_id: str) -> List[dict]:
        """Get all approval requests for an entity."""
        return await db[REQUESTS_COLLECTION].find(
            {"entity_id": entity_id},
            {"_id": 0}
        ).sort("created_at", -1).to_list(100)
    
    @staticmethod
    async def get_pending_requests(
        organization_id: str,
        user_id: Optional[str] = None,
        entity_type: Optional[str] = None,
    ) -> List[dict]:
        """
        Get pending approval requests.
        
        Args:
            organization_id: Organization to filter by
            user_id: If provided, only requests this user can approve
            entity_type: Optional entity type filter
        """
        query = {
            "organization_id": organization_id,
            "status": {"$in": [ApprovalStatus.PENDING.value, ApprovalStatus.IN_REVIEW.value]},
        }
        
        if user_id:
            query["current_approvers"] = user_id
        
        if entity_type:
            query["entity_type"] = entity_type
        
        return await db[REQUESTS_COLLECTION].find(query, {"_id": 0}).sort("submitted_at", -1).to_list(500)
    
    @staticmethod
    async def get_my_submissions(
        organization_id: str,
        user_id: str,
        status: Optional[str] = None,
    ) -> List[dict]:
        """Get approval requests submitted by a user."""
        query = {
            "organization_id": organization_id,
            "submitted_by": user_id,
        }
        if status:
            query["status"] = status
        
        return await db[REQUESTS_COLLECTION].find(query, {"_id": 0}).sort("submitted_at", -1).to_list(500)
    
    @staticmethod
    async def get_pending_count(
        organization_id: str,
        user_id: Optional[str] = None,
    ) -> Dict[str, int]:
        """Get count of pending approvals, optionally for a specific approver."""
        query = {
            "organization_id": organization_id,
            "status": {"$in": [ApprovalStatus.PENDING.value, ApprovalStatus.IN_REVIEW.value]},
        }
        if user_id:
            query["current_approvers"] = user_id
        
        total = await db[REQUESTS_COLLECTION].count_documents(query)
        
        # Count by entity type
        pipeline = [
            {"$match": query},
            {"$group": {"_id": "$entity_type", "count": {"$sum": 1}}},
        ]
        by_type_cursor = db[REQUESTS_COLLECTION].aggregate(pipeline)
        by_type = {doc["_id"]: doc["count"] async for doc in by_type_cursor}
        
        # Count urgent (deadline within 2 days)
        urgent_deadline = _now() + timedelta(days=2)
        urgent_query = {
            **query,
            "deadline": {"$lte": urgent_deadline.isoformat()},
        }
        urgent = await db[REQUESTS_COLLECTION].count_documents(urgent_query)
        
        return {
            "total": total,
            "by_entity_type": by_type,
            "urgent": urgent,
        }

    @staticmethod
    async def get_approval_history(
        organization_id: str,
        user_id: Optional[str] = None,
        status: Optional[str] = None,
    ) -> List[dict]:
        """Get past (completed/rejected/cancelled) approval requests.
        If user_id provided, only requests where user was an approver."""
        completed_statuses = [
            ApprovalStatus.APPROVED.value,
            ApprovalStatus.REJECTED.value,
            "cancelled",
        ]
        query = {
            "organization_id": organization_id,
            "status": {"$in": [status] if status and status in completed_statuses else completed_statuses},
        }
        if user_id:
            query["$or"] = [
                {"current_approvers": user_id},
                {"history.actor_id": user_id},
            ]
        return await db[REQUESTS_COLLECTION].find(query, {"_id": 0}).sort("submitted_at", -1).to_list(500)

    
    # =========================================================================
    # APPROVAL ACTIONS
    # =========================================================================
    
    @staticmethod
    async def make_decision(
        request_id: str,
        decision: ApprovalDecisionInput,
        current_user: dict,
    ) -> Tuple[bool, str, Optional[dict]]:
        """
        Process an approval decision (approve, reject, request_changes, delegate).
        
        Returns:
            (success, message, updated_request)
        """
        request = await db[REQUESTS_COLLECTION].find_one({"id": request_id}, {"_id": 0})
        if not request:
            return (False, "Approval request not found", None)
        
        # Validate user can take this action
        user_id = current_user.get("id")
        user_role = current_user.get("role", "user")
        
        # Super admin can always act
        is_super_admin = user_role == "super_admin"
        is_current_approver = user_id in request.get("current_approvers", [])
        
        if not is_super_admin and not is_current_approver:
            return (False, "You are not authorized to act on this request", None)
        
        # Validate current status allows action
        current_status = request.get("status")
        if current_status not in [ApprovalStatus.PENDING.value, ApprovalStatus.IN_REVIEW.value]:
            return (False, f"Cannot act on request with status: {current_status}", None)
        
        # Get workflow for validation - use defaults if not found (for ESG record approvals)
        workflow = await ApprovalWorkflowService.get_workflow(request.get("workflow_id"))
        if not workflow:
            # Create a default workflow config for ESG record approvals
            workflow = {
                "id": request.get("workflow_id"),
                "name": request.get("workflow_name", "Default Approval"),
                "levels": [{"level": 1, "name": "Level 1", "can_delegate": True}],
                "require_all_levels": True,
                "require_comments_on_reject": True,
                "require_comments_on_changes": True,
                "allow_self_approval": False,
            }
        
        action = decision.action.value if hasattr(decision.action, 'value') else decision.action
        
        # Validate action-specific requirements
        if action == ApprovalAction.REJECT.value:
            if workflow.get("require_comments_on_reject") and not decision.comment:
                return (False, "Comment required when rejecting", None)
        
        elif action == ApprovalAction.REQUEST_CHANGES.value:
            if workflow.get("require_comments_on_changes") and not decision.comment:
                return (False, "Comment required when requesting changes", None)
        
        elif action == ApprovalAction.DELEGATE.value:
            if not decision.delegate_to:
                return (False, "Must specify user to delegate to", None)
            
            # Check if delegation is allowed for this level
            levels = workflow.get("levels", [])
            current_level = request.get("current_level", 1)
            if current_level <= len(levels):
                level_config = levels[current_level - 1]
                if not level_config.get("can_delegate", True):
                    return (False, "Delegation not allowed for this approval level", None)
        
        # Process the action
        previous_status = current_status
        
        if action == ApprovalAction.APPROVE.value:
            return await ApprovalWorkflowService._process_approve(
                request, workflow, current_user, decision.comment, previous_status, decision.updated_data
            )
        
        elif action == ApprovalAction.REJECT.value:
            return await ApprovalWorkflowService._process_reject(
                request, current_user, decision.comment, previous_status
            )
        
        elif action == ApprovalAction.REQUEST_CHANGES.value:
            return await ApprovalWorkflowService._process_request_changes(
                request, current_user, decision.comment, previous_status
            )
        
        elif action == ApprovalAction.DELEGATE.value:
            return await ApprovalWorkflowService._process_delegate(
                request, current_user, decision.delegate_to, decision.comment, previous_status
            )
        
        return (False, f"Unknown action: {action}", None)
    
    @staticmethod
    async def _process_approve(
        request: dict,
        workflow: dict,
        approver: dict,
        comment: Optional[str],
        previous_status: str,
        updated_data: Optional[dict] = None,
    ) -> Tuple[bool, str, Optional[dict]]:
        """Process an approval action."""
        request_id = request["id"]
        current_level = request.get("current_level", 1)
        total_levels = request.get("total_levels", 1)
        levels = workflow.get("levels", [])
        
        # Record the step
        level_name = levels[current_level - 1]["name"] if current_level <= len(levels) else f"Level {current_level}"
        step = ApprovalStepRecord(
            level=current_level,
            level_name=level_name,
            action=ApprovalAction.APPROVE,
            actor_id=approver.get("id"),
            actor_email=approver.get("email", ""),
            actor_name=approver.get("full_name", ""),
            actor_role=approver.get("role", ""),
            comment=comment,
        )
        
        # Determine next state
        if current_level >= total_levels:
            # All levels approved - complete!
            new_status = ApprovalStatus.APPROVED.value
            update_data = {
                "status": new_status,
                "resolved_at": _now_iso(),
                "resolved_by": approver.get("id"),
                "resolution_comment": comment,
                "current_approvers": [],
                "updated_at": _now_iso(),
            }
            message = "Request fully approved"
        else:
            # Move to next level
            next_level = current_level + 1
            next_level_config = levels[next_level - 1] if next_level <= len(levels) else None
            
            # Resolve next approvers
            next_approvers = []
            if next_level_config:
                next_approvers = await ApprovalWorkflowService._resolve_approvers(
                    request.get("organization_id"),
                    next_level_config,
                    {"id": request.get("submitted_by")},  # Original submitter context
                )
            
            new_status = ApprovalStatus.PENDING.value
            update_data = {
                "status": new_status,
                "current_level": next_level,
                "current_approvers": next_approvers,
                "updated_at": _now_iso(),
            }
            message = f"Approved at level {current_level}, moved to level {next_level}"
        
        # Update request
        await db[REQUESTS_COLLECTION].update_one(
            {"id": request_id},
            {
                "$set": update_data,
                "$push": {"steps_completed": step.dict()},
            }
        )
        
        # If approved and this is an ESG record, update both the record AND the task
        if new_status == ApprovalStatus.APPROVED.value:
            entity_type = request.get("entity_type")
            entity_id = request.get("entity_id")
            entity_subtype = request.get("entity_subtype")  # This is the section (environment, social, governance)
            request_type = request.get("request_type")  # 'delete', 'create', 'edit'
            
            # Handle DELETE approval - actually delete the record
            if entity_type == "esg_record" and request_type == "delete":
                try:
                    collection_map = {
                        "environment": "environment_records",
                        "social": "social_records",
                        "governance": "governance_records",
                        "Energy": "environment_records",
                        "Water": "environment_records",
                        "Waste": "environment_records",
                    }
                    collection_name = collection_map.get(entity_subtype)
                    
                    if collection_name:
                        # Get record details before deletion for task reversion
                        record = await db[collection_name].find_one(
                            {"id": entity_id, "is_current": True},
                            {"_id": 0}
                        )
                        
                        if record:
                            # Hard delete the record
                            await db[collection_name].delete_one({"id": entity_id, "is_current": True})
                            logger.info(f"Delete approved: Hard deleted ESG record {entity_id}")
                            
                            # Revert associated task
                            org_id = record.get("organization_id") or record.get("org_id")
                            rp = record.get("reporting_period") or {}
                            period_key = None
                            rp_type = rp.get("reporting_type") or rp.get("type")
                            if rp_type == "monthly":
                                month = rp.get("month")
                                month_num = int(month) if str(month).isdigit() else 1
                                period_key = f"{rp.get('year')}-{str(month_num).zfill(2)}"
                            elif rp_type == "yearly":
                                period_key = str(rp.get("year"))
                            
                            if period_key:
                                task_query = {
                                    "organization_id": org_id,
                                    "category": record.get("category"),
                                    "period_key": period_key,
                                }
                                if record.get("subcategory"):
                                    task_query["subcategory"] = record.get("subcategory")
                                if record.get("facility_id"):
                                    task_query["facility_id"] = record.get("facility_id")
                                
                                # NOTE: task.approval_status is now computed from RECORDS.
                                # Record is deleted, so task status will auto-compute correctly.
                                # Just update the timestamp for audit purposes.
                                await db.esg_reporting_tasks.update_many(
                                    task_query,
                                    {"$set": {"updated_at": _now_iso()}}
                                )
                                logger.info(f"Updated task timestamp after record deletion")
                except Exception as e:
                    logger.error(f"Failed to process delete approval: {e}")
                    import traceback
                    traceback.print_exc()
                
                # Get the updated request
                updated_request = await db[REQUESTS_COLLECTION].find_one({"id": request_id}, {"_id": 0})
                return (True, "Delete request approved. Record has been permanently deleted.", updated_request)
            
            if entity_type == "esg_record" and entity_id and entity_subtype:
                try:
                    # Get the appropriate collection based on section
                    collection_map = {
                        "environment": "environment_records",
                        "social": "social_records",
                        "governance": "governance_records",
                    }
                    collection_name = collection_map.get(entity_subtype)
                    
                    if collection_name:
                        # =========================================================================
                        # IMMUTABLE EDIT APPROVAL: Apply proposed_changes to the record
                        # If this is an "immutable_edit", the record was NOT mutated at edit time.
                        # Now that it's approved, we apply the proposed_changes.
                        # =========================================================================
                        entity_snapshot = request.get("entity_snapshot", {})
                        is_immutable_edit = entity_snapshot.get("edit_type") == "immutable_edit"
                        proposed_changes = entity_snapshot.get("proposed_changes", {})
                        
                        record_update = {
                            "updated_at": _now_iso(),
                            "status": "completed",  # Reset status to completed
                            "approval_status": "approved",
                        }
                        
                        # Apply proposed_changes for immutable edits
                        if is_immutable_edit and proposed_changes:
                            logger.info(f"Applying proposed_changes for immutable edit: {list(proposed_changes.keys())}")
                            for key, value in proposed_changes.items():
                                record_update[key] = value
                            
                            # Increment version since we're now applying the change
                            current_record = await db[collection_name].find_one(
                                {"id": entity_id, "is_current": True},
                                {"_id": 0, "version": 1}
                            )
                            if current_record:
                                record_update["version"] = current_record.get("version", 0) + 1
                        
                        # Update field_values if provided (legacy path)
                        elif updated_data and "field_values" in updated_data:
                            record_update["field_values"] = updated_data["field_values"]
                        
                        # Also update the entity_snapshot in the approval request to reflect changes
                        if updated_data and "field_values" in updated_data:
                            snapshot_update = {"entity_snapshot.field_values": updated_data["field_values"]}
                            await db[REQUESTS_COLLECTION].update_one(
                                {"id": request_id},
                                {"$set": snapshot_update}
                            )
                        
                        # Update the actual record
                        await db[collection_name].update_one(
                            {"id": entity_id, "is_current": True},
                            {"$set": record_update}
                        )
                        logger.info(f"Updated ESG record {entity_id} status=completed, approval_status=approved")
                        
                        # Determine changed fields for version snapshot
                        changed_fields_for_snapshot = ["approval_status"]
                        if is_immutable_edit and proposed_changes:
                            # Include the fields that were changed in the edit
                            changed_fields_for_snapshot.extend(list(proposed_changes.keys()))
                        
                        # Create version snapshot for approval event
                        await _create_approval_version_snapshot(
                            collection_name=collection_name,
                            record_id=entity_id,
                            action="approved",
                            user_id=approver.get("id"),
                            changed_fields=changed_fields_for_snapshot,
                        )
                        
                        # Get the record to find the corresponding task
                        record = await db[collection_name].find_one(
                            {"id": entity_id, "is_current": True},
                            {"_id": 0, "org_id": 1, "category": 1, "subcategory": 1, "sub_subcategory": 1, "facility_id": 1, "reporting_period": 1}
                        )
                        
                        if record:
                            # Update the corresponding task's approval_status
                            # Build period_key from reporting_period
                            rp = record.get("reporting_period") or {}
                            period_key = None
                            rp_type = rp.get("reporting_type") or rp.get("type")
                            if rp_type == "yearly":
                                period_key = str(rp.get("year"))
                            elif rp_type == "monthly":
                                month = rp.get("month")
                                if isinstance(month, str) and not month.isdigit():
                                    month_names = ["January", "February", "March", "April", "May", "June",
                                                   "July", "August", "September", "October", "November", "December"]
                                    try:
                                        month_num = month_names.index(month) + 1
                                    except ValueError:
                                        month_num = 1
                                else:
                                    month_num = int(month) if month else 1
                                period_key = f"{rp.get('year')}-{str(month_num).zfill(2)}"
                            elif rp_type == "quarterly":
                                quarter = rp.get("quarter", "").replace("Q", "") if rp.get("quarter") else "1"
                                period_key = f"{rp.get('year')}-Q{quarter}"
                            
                            task_query = {
                                "organization_id": record.get("organization_id") or record.get("org_id"),
                                "category": record.get("category"),
                            }
                            if period_key:
                                task_query["period_key"] = period_key
                            if record.get("subcategory"):
                                task_query["subcategory"] = record.get("subcategory")
                            if record.get("sub_subcategory"):
                                task_query["sub_subcategory"] = record.get("sub_subcategory")
                            if record.get("facility_id"):
                                task_query["facility_id"] = record.get("facility_id")
                            
                            # NOTE: task.approval_status is now computed from RECORDS, not stored.
                            # We only update audit/ownership fields here.
                            task_update = {
                                "updated_at": _now_iso(),
                                "completed_by_user_id": approver.get("id"),
                                "completed_at": _now_iso(),
                                "approved_by_user_id": approver.get("id"),
                                "approved_at": _now_iso(),
                            }
                            task_update_result = await db.esg_reporting_tasks.update_many(
                                task_query,
                                {"$set": task_update}
                            )
                            logger.info(f"Updated {task_update_result.modified_count} task(s) audit fields, completed_by={approver.get('id')}")
                            
                except Exception as e:
                    logger.error(f"Failed to update ESG record/task with approval: {e}")
                    import traceback
                    traceback.print_exc()
            
            # Handle emission_record approval
            elif entity_type == "emission_record":
                try:
                    request_type = request.get("request_type")  # 'update', 'create', etc.
                    entity_snapshot = request.get("entity_snapshot", {})
                    proposed_changes = entity_snapshot.get("proposed_changes", {})
                    
                    record_update = {
                        "updated_at": _now_iso(),
                        "approval_status": "approved",
                    }
                    
                    # Apply proposed changes for update approvals
                    if request_type == "update" and proposed_changes:
                        logger.info(f"Applying proposed_changes for emission update: {list(proposed_changes.keys())}")
                        for key, value in proposed_changes.items():
                            if value is not None:
                                record_update[key] = value
                        
                        # Recalculate emission values from outputs if provided
                        if "outputs" in proposed_changes:
                            outputs = proposed_changes["outputs"] or {}
                            record_update["co2_emissions"] = (outputs.get("co2") or {}).get("value", 0) or 0
                            record_update["ch4_emissions"] = (outputs.get("ch4") or {}).get("value", 0) or 0
                            record_update["n2o_emissions"] = (outputs.get("n2o") or {}).get("value", 0) or 0
                            record_update["co2e_emissions"] = (outputs.get("co2e") or {}).get("value", 0) or 0
                            record_update["total_emissions"] = record_update["co2e_emissions"]
                        
                        # Increment version
                        current_record = await db.emission_records.find_one(
                            {"id": entity_id},
                            {"_id": 0, "version": 1}
                        )
                        if current_record:
                            record_update["version"] = current_record.get("version", 0) + 1
                    
                    await db.emission_records.update_one(
                        {"id": entity_id},
                        {"$set": record_update}
                    )
                    logger.info(f"Updated emission_record {entity_id} approval_status=approved")
                    
                    # Create version snapshot for approval event
                    changed_fields = ["approval_status"]
                    if request_type == "update" and proposed_changes:
                        changed_fields.extend(list(proposed_changes.keys()))
                    
                    await _create_approval_version_snapshot(
                        collection_name="emission_records",
                        record_id=entity_id,
                        action="approved",
                        user_id=approver.get("id"),
                        changed_fields=changed_fields,
                    )
                except Exception as e:
                    logger.error(f"Failed to update emission_record with approval: {e}")
        
        # Record history
        await ApprovalWorkflowService._record_history(
            request,
            ApprovalAction.APPROVE,
            approver,
            comment=comment,
            previous_status=previous_status,
            new_status=new_status,
            level=current_level,
            level_name=level_name,
        )
        
        updated = await db[REQUESTS_COLLECTION].find_one({"id": request_id}, {"_id": 0})
        return (True, message, updated)
    
    @staticmethod
    async def _process_reject(
        request: dict,
        rejector: dict,
        comment: Optional[str],
        previous_status: str,
    ) -> Tuple[bool, str, Optional[dict]]:
        """Process a rejection."""
        request_id = request["id"]
        current_level = request.get("current_level", 1)
        
        step = ApprovalStepRecord(
            level=current_level,
            level_name=f"Level {current_level}",
            action=ApprovalAction.REJECT,
            actor_id=rejector.get("id"),
            actor_email=rejector.get("email", ""),
            actor_name=rejector.get("full_name", ""),
            actor_role=rejector.get("role", ""),
            comment=comment,
        )
        
        new_status = ApprovalStatus.REJECTED.value
        await db[REQUESTS_COLLECTION].update_one(
            {"id": request_id},
            {
                "$set": {
                    "status": new_status,
                    "resolved_at": _now_iso(),
                    "resolved_by": rejector.get("id"),
                    "resolution_comment": comment,
                    "current_approvers": [],
                    "updated_at": _now_iso(),
                },
                "$push": {"steps_completed": step.dict()},
            }
        )
        
        await ApprovalWorkflowService._record_history(
            request,
            ApprovalAction.REJECT,
            rejector,
            comment=comment,
            previous_status=previous_status,
            new_status=new_status,
            level=current_level,
        )
        
        # Update source entity status (task/assignment) to reopened
        await ApprovalWorkflowService._update_source_entity_on_rejection(
            request, rejector, comment
        )
        
        updated = await db[REQUESTS_COLLECTION].find_one({"id": request_id}, {"_id": 0})
        return (True, "Request rejected", updated)

    @staticmethod
    async def _update_source_entity_on_rejection(
        request: dict,
        rejector: dict,
        comment: Optional[str],
    ) -> None:
        """
        Update the source entity (task or assignment) status when rejected.
        Sets status=reopened, approval_status=rejected.
        
        For DELETE requests: Clears pending_deletion flag, record remains active.
        For CREATE/EDIT requests: Marks record as rejected, user must resubmit.
        """
        entity_type = request.get("entity_type")
        entity_id = request.get("entity_id")
        org_id = request.get("organization_id")
        request_type = request.get("request_type")  # 'delete', 'create', 'edit'
        rejector_id = rejector.get("id")
        now = _now_iso()
        
        try:
            # Handle DELETE rejection - clear pending_deletion, keep record active
            if entity_type == "esg_record" and request_type == "delete":
                entity_subtype = request.get("entity_subtype")
                collection_map = {
                    "environment": "environment_records",
                    "social": "social_records",
                    "governance": "governance_records",
                    "Energy": "environment_records",
                    "Water": "environment_records",
                    "Waste": "environment_records",
                }
                collection_name = collection_map.get(entity_subtype)
                
                if collection_name:
                    # Clear pending_deletion flag, keep the record active
                    await db[collection_name].update_one(
                        {"id": entity_id, "is_current": True},
                        {"$set": {
                            "pending_deletion": False,
                            "deletion_rejected_at": now,
                            "deletion_rejected_by": rejector_id,
                            "deletion_rejection_reason": comment,
                            "updated_at": now,
                        },
                        "$unset": {
                            "deletion_requested_by": "",
                            "deletion_requested_at": "",
                        }}
                    )
                    logger.info(f"Delete rejected: Cleared pending_deletion on {collection_name} record {entity_id}")
                return  # Don't continue to normal rejection handling
            
            # Normal rejection handling (create/edit requests)
            update_doc = {
                "status": "reopened",
                "approval_status": "rejected",
                "rejected_at": now,
                "rejected_by_user_id": rejector_id,
                "updated_at": now,
            }
            if comment:
                update_doc["rejection_reason"] = comment
            
            if entity_type == "esg_record":
                # ESG records are stored in section-specific collections
                entity_subtype = request.get("entity_subtype")  # environment, social, governance
                entity_snapshot = request.get("entity_snapshot", {})
                
                collection_map = {
                    "environment": "environment_records",
                    "social": "social_records",
                    "governance": "governance_records",
                }
                collection_name = collection_map.get(entity_subtype)
                
                # =========================================================================
                # IMMUTABLE EDIT REJECTION: Revert status to "approved"
                # If this is an immutable_edit rejection, the record's field_values were 
                # never mutated. We set approval_status back to "approved" (the data is
                # still the old approved data). Only the approval_status was changed to
                # "pending_approval" when the edit was submitted.
                # =========================================================================
                if entity_snapshot.get("edit_type") == "immutable_edit":
                    if collection_name:
                        # Revert approval_status to "approved" (data unchanged)
                        await db[collection_name].update_one(
                            {"id": entity_id, "is_current": True},
                            {"$set": {
                                "approval_status": "approved",
                                "updated_at": now,
                            }}
                        )
                        logger.info(f"Immutable edit rejection - reverted record {entity_id} approval_status to approved")
                        
                        # Create version snapshot for rejection event
                        await _create_approval_version_snapshot(
                            collection_name=collection_name,
                            record_id=entity_id,
                            action="rejected",
                            user_id=rejector_id,
                            rejection_reason=comment,
                        )
                    return  # Skip the normal rejection flow
                
                if collection_name:
                    # Update the ESG record (normal rejection - not immutable edit)
                    await db[collection_name].update_one(
                        {"id": entity_id, "is_current": True},
                        {"$set": update_doc}
                    )
                    logger.info(f"Updated {collection_name} record {entity_id} approval_status to rejected")
                    
                    # Create version snapshot for rejection event
                    await _create_approval_version_snapshot(
                        collection_name=collection_name,
                        record_id=entity_id,
                        action="rejected",
                        user_id=rejector_id,
                        rejection_reason=comment,
                    )
                else:
                    logger.warning(f"Unknown entity_subtype for esg_record: {entity_subtype}")
            
            elif entity_type == "emission_record":
                # GHG emission records
                request_type = request.get("request_type", "create")
                
                if request_type == "create":
                    # For CREATE requests, the record may not exist yet or was created with pending status
                    # Just update if exists, don't fail if not found
                    result = await db.emission_records.update_one(
                        {"id": entity_id},
                        {"$set": update_doc}
                    )
                    if result.matched_count == 0:
                        # Record doesn't exist yet (pending create) - just delete the approval request
                        logger.info(f"Emission record {entity_id} not found (pending create), skipping record update")
                    else:
                        logger.info(f"Updated emission_record {entity_id} approval_status to rejected")
                else:
                    # For UPDATE/DELETE requests, the record should exist
                    await db.emission_records.update_one(
                        {"id": entity_id},
                        {"$set": {
                            "approval_status": "rejected",
                            "updated_at": _now_iso(),
                        }}
                    )
                    logger.info(f"Updated emission_record {entity_id} approval_status to rejected (was {request_type})")
                
                # Create version snapshot for rejection event
                await _create_approval_version_snapshot(
                    collection_name="emission_records",
                    record_id=entity_id,
                    action="rejected",
                    user_id=rejector_id,
                    rejection_reason=comment,
                    request_type=request_type,
                )
            
            elif entity_type == "esg_response":
                # Update the ESG response (questionnaire answer) for rejection
                await db.esg_responses.update_one(
                    {"id": entity_id, "organization_id": org_id},
                    {"$set": update_doc}
                )
                logger.info(f"Updated esg_response {entity_id} approval_status to rejected")
                
                # Also update the assignment using AssignmentResolver
                # Find the question key from the response
                response = await db.esg_responses.find_one(
                    {"id": entity_id},
                    {"_id": 0, "question_key": 1}
                )
                if response and response.get("question_key"):
                    await db.esg_assignments.update_one(
                        {
                            "organization_id": org_id,
                            "entity_type": "question",
                            "entity_id": response.get("question_key"),
                        },
                        {"$set": {"updated_at": now}}
                    )
            elif entity_type == "esg_task":
                # NOTE: task.approval_status is now computed from RECORDS.
                # Only update audit/metadata fields here.
                task_update = {
                    "rejected_at": now,
                    "rejected_by_user_id": rejector_id,
                    "updated_at": now,
                }
                if comment:
                    task_update["rejection_reason"] = comment
                await db.esg_reporting_tasks.update_one(
                    {"id": entity_id, "organization_id": org_id},
                    {"$set": task_update}
                )
        except Exception as e:
            print(f"Warning: Failed to update source entity on rejection: {e}")

    
    @staticmethod
    async def _process_request_changes(
        request: dict,
        reviewer: dict,
        comment: Optional[str],
        previous_status: str,
    ) -> Tuple[bool, str, Optional[dict]]:
        """Process a request for changes."""
        request_id = request["id"]
        current_level = request.get("current_level", 1)
        
        step = ApprovalStepRecord(
            level=current_level,
            level_name=f"Level {current_level}",
            action=ApprovalAction.REQUEST_CHANGES,
            actor_id=reviewer.get("id"),
            actor_email=reviewer.get("email", ""),
            actor_name=reviewer.get("full_name", ""),
            actor_role=reviewer.get("role", ""),
            comment=comment,
        )
        
        new_status = ApprovalStatus.CHANGES_REQUESTED.value
        await db[REQUESTS_COLLECTION].update_one(
            {"id": request_id},
            {
                "$set": {
                    "status": new_status,
                    "updated_at": _now_iso(),
                },
                "$push": {"steps_completed": step.dict()},
            }
        )
        
        await ApprovalWorkflowService._record_history(
            request,
            ApprovalAction.REQUEST_CHANGES,
            reviewer,
            comment=comment,
            previous_status=previous_status,
            new_status=new_status,
            level=current_level,
        )
        
        updated = await db[REQUESTS_COLLECTION].find_one({"id": request_id}, {"_id": 0})
        return (True, "Changes requested", updated)
    
    @staticmethod
    async def _process_delegate(
        request: dict,
        delegator: dict,
        delegate_to: str,
        comment: Optional[str],
        previous_status: str,
    ) -> Tuple[bool, str, Optional[dict]]:
        """Process delegation to another user."""
        request_id = request["id"]
        current_level = request.get("current_level", 1)
        
        # Verify delegate exists
        delegate_user = await db.users.find_one({"id": delegate_to}, {"_id": 0, "email": 1, "full_name": 1})
        if not delegate_user:
            return (False, "Delegate user not found", None)
        
        step = ApprovalStepRecord(
            level=current_level,
            level_name=f"Level {current_level}",
            action=ApprovalAction.DELEGATE,
            actor_id=delegator.get("id"),
            actor_email=delegator.get("email", ""),
            actor_name=delegator.get("full_name", ""),
            actor_role=delegator.get("role", ""),
            comment=comment,
            delegated_from=delegator.get("id"),
        )
        
        # Update approvers list
        current_approvers = request.get("current_approvers", [])
        if delegator.get("id") in current_approvers:
            current_approvers.remove(delegator.get("id"))
        if delegate_to not in current_approvers:
            current_approvers.append(delegate_to)
        
        await db[REQUESTS_COLLECTION].update_one(
            {"id": request_id},
            {
                "$set": {
                    "current_approvers": current_approvers,
                    "updated_at": _now_iso(),
                },
                "$push": {"steps_completed": step.dict()},
            }
        )
        
        await ApprovalWorkflowService._record_history(
            request,
            ApprovalAction.DELEGATE,
            delegator,
            comment=f"Delegated to {delegate_user.get('full_name', delegate_user.get('email'))}. {comment or ''}".strip(),
            previous_status=previous_status,
            new_status=previous_status,  # Status doesn't change
            level=current_level,
        )
        
        updated = await db[REQUESTS_COLLECTION].find_one({"id": request_id}, {"_id": 0})
        return (True, f"Delegated to {delegate_user.get('full_name', 'user')}", updated)
    
    @staticmethod
    async def resubmit(
        request_id: str,
        current_user: dict,
        entity_snapshot: Optional[Dict[str, Any]] = None,
        comment: Optional[str] = None,
    ) -> Tuple[bool, str, Optional[dict]]:
        """
        Resubmit a rejected or changes-requested approval.
        Creates a new request linked to the original.
        """
        original = await db[REQUESTS_COLLECTION].find_one({"id": request_id}, {"_id": 0})
        if not original:
            return (False, "Original request not found", None)
        
        # Verify user is the original submitter
        if original.get("submitted_by") != current_user.get("id"):
            return (False, "Only the original submitter can resubmit", None)
        
        # Verify status allows resubmission
        status = original.get("status")
        if status not in [ApprovalStatus.REJECTED.value, ApprovalStatus.CHANGES_REQUESTED.value]:
            return (False, f"Cannot resubmit request with status: {status}", None)
        
        # Create new submission
        data = SubmitForApprovalInput(
            entity_type=original.get("entity_type"),
            entity_id=original.get("entity_id"),
            entity_subtype=original.get("entity_subtype"),
            entity_snapshot=entity_snapshot or original.get("entity_snapshot"),
            workflow_id=original.get("workflow_id"),
            comment=comment,
        )
        
        success, message, new_request = await ApprovalWorkflowService.submit_for_approval(
            original.get("organization_id"),
            data,
            current_user,
        )
        
        if success and new_request:
            # Link to original and update resubmission count
            await db[REQUESTS_COLLECTION].update_one(
                {"id": new_request["id"]},
                {
                    "$set": {
                        "previous_request_id": request_id,
                        "resubmission_count": original.get("resubmission_count", 0) + 1,
                    }
                }
            )
            
            # Mark original as superseded
            await db[REQUESTS_COLLECTION].update_one(
                {"id": request_id},
                {"$set": {"status": "superseded", "updated_at": _now_iso()}}
            )
            
            new_request = await db[REQUESTS_COLLECTION].find_one({"id": new_request["id"]}, {"_id": 0})
        
        return (success, message, new_request)
    
    @staticmethod
    async def cancel_request(
        request_id: str,
        current_user: dict,
        comment: Optional[str] = None,
    ) -> Tuple[bool, str, Optional[dict]]:
        """Cancel a pending approval request."""
        request = await db[REQUESTS_COLLECTION].find_one({"id": request_id}, {"_id": 0})
        if not request:
            return (False, "Request not found", None)
        
        # Verify user can cancel (submitter or admin)
        user_id = current_user.get("id")
        user_role = current_user.get("role")
        is_submitter = request.get("submitted_by") == user_id
        is_admin = user_role in ("admin", "super_admin")
        
        if not is_submitter and not is_admin:
            return (False, "Only the submitter or admin can cancel", None)
        
        # Verify status allows cancellation
        status = request.get("status")
        if status not in [ApprovalStatus.PENDING.value, ApprovalStatus.IN_REVIEW.value, ApprovalStatus.CHANGES_REQUESTED.value]:
            return (False, f"Cannot cancel request with status: {status}", None)
        
        previous_status = status
        new_status = ApprovalStatus.CANCELLED.value
        
        await db[REQUESTS_COLLECTION].update_one(
            {"id": request_id},
            {
                "$set": {
                    "status": new_status,
                    "resolved_at": _now_iso(),
                    "resolved_by": user_id,
                    "resolution_comment": comment,
                    "current_approvers": [],
                    "updated_at": _now_iso(),
                }
            }
        )
        
        await ApprovalWorkflowService._record_history(
            request,
            ApprovalAction.CANCEL,
            current_user,
            comment=comment,
            previous_status=previous_status,
            new_status=new_status,
        )
        
        updated = await db[REQUESTS_COLLECTION].find_one({"id": request_id}, {"_id": 0})
        return (True, "Request cancelled", updated)
    
    # =========================================================================
    # HISTORY & AUDIT
    # =========================================================================
    
    @staticmethod
    async def _record_history(
        request: dict,
        action: ApprovalAction,
        actor: dict,
        comment: Optional[str] = None,
        previous_status: Optional[str] = None,
        new_status: Optional[str] = None,
        level: Optional[int] = None,
        level_name: Optional[str] = None,
    ) -> None:
        """Record an action in the immutable history."""
        action_val = action.value if hasattr(action, 'value') else action
        new_status_val = new_status if isinstance(new_status, str) else (new_status.value if new_status else None)
        
        entry = ApprovalHistoryEntry(
            organization_id=request.get("organization_id"),
            request_id=request.get("id"),
            workflow_id=request.get("workflow_id"),
            entity_type=request.get("entity_type"),
            entity_id=request.get("entity_id"),
            entity_subtype=request.get("entity_subtype"),
            action=action_val,
            actor_id=actor.get("id"),
            actor_email=actor.get("email", ""),
            actor_name=actor.get("full_name", ""),
            actor_role=actor.get("role", ""),
            comment=comment,
            level=level,
            level_name=level_name,
            previous_status=previous_status,
            new_status=new_status_val,
        )
        
        entry_dict = entry.dict()
        entry_dict['timestamp'] = _now_iso()
        
        await db[HISTORY_COLLECTION].insert_one(entry_dict)
    
    @staticmethod
    async def get_history_for_request(request_id: str) -> List[dict]:
        """Get full history for an approval request."""
        return await db[HISTORY_COLLECTION].find(
            {"request_id": request_id},
            {"_id": 0}
        ).sort("timestamp", 1).to_list(1000)
    
    @staticmethod
    async def get_history_for_entity(entity_id: str) -> List[dict]:
        """Get approval history for an entity across all requests."""
        return await db[HISTORY_COLLECTION].find(
            {"entity_id": entity_id},
            {"_id": 0}
        ).sort("timestamp", -1).to_list(1000)
    
    # =========================================================================
    # WORKFLOW CHECKS (for integration with other modules)
    # =========================================================================
    
    @staticmethod
    async def requires_approval(
        organization_id: str,
        entity_type: str,
        entity_subtype: Optional[str] = None,
    ) -> bool:
        """Check if an entity type requires approval in this organization."""
        workflow = await ApprovalWorkflowService.get_workflow_for_entity(
            organization_id, entity_type, entity_subtype
        )
        return workflow is not None
    
    @staticmethod
    async def is_approved(entity_id: str) -> bool:
        """Check if an entity has an approved request."""
        request = await db[REQUESTS_COLLECTION].find_one({
            "entity_id": entity_id,
            "status": ApprovalStatus.APPROVED.value,
        })
        return request is not None
    
    @staticmethod
    async def get_approval_status(entity_id: str) -> Optional[str]:
        """Get the current approval status for an entity."""
        # Get most recent request
        request = await db[REQUESTS_COLLECTION].find_one(
            {"entity_id": entity_id},
            {"_id": 0, "status": 1},
            sort=[("created_at", -1)]
        )
        return request.get("status") if request else None


    # =========================================================================
    # QUESTIONNAIRE RESPONSE APPROVAL
    # =========================================================================
    
    @staticmethod
    async def get_questionnaire_approval_queue(
        organization_id: str,
        approver_id: str,
        framework: Optional[str] = None,
        is_admin: bool = False,
    ) -> List[dict]:
        """
        Get questionnaire responses pending approval for the given approver.
        
        Returns enriched items with question configs for display.
        For admin users, returns ALL pending approvals in the org.
        
        Also includes pending emission_record and esg_record approvals from approval_requests collection.
        """
        queue_items = []
        
        # =====================================================================
        # PART 1: Questionnaire Approvals (from esg_responses)
        # =====================================================================
        
        # For admins, get all pending approvals regardless of approver assignment
        if is_admin:
            assignment_query = {
                "organization_id": organization_id,
                "entity_type": "question",
                "requires_approval": True,
            }
        else:
            # Find assignments where current user is the approver
            assignment_query = {
                "organization_id": organization_id,
                "entity_type": "question",
                "requires_approval": True,
                "$or": [
                    {"approver_id": approver_id},
                    {"approval_chain": approver_id},
                    {"approver_ids": approver_id},  # Support array field
                ]
            }
        
        if framework:
            assignment_query["framework_id"] = framework.lower()
        
        assignments = await db.esg_assignments.find(
            assignment_query,
            {"_id": 0}
        ).to_list(500)
        
        if assignments:
            # Get question keys and reporting periods
            question_keys = [a.get("entity_id") for a in assignments if a.get("entity_id")]
            
            # Find responses that are pending_approval
            responses_query = {
                "organization_id": organization_id,
                "question_key": {"$in": question_keys},
                "approval_status": "pending_approval",
            }
            
            responses = await db.esg_responses.find(
                responses_query,
                {"_id": 0}
            ).to_list(500)
            
            if responses:
                # Get question configs for labels
                config_query = {"question_key": {"$in": question_keys}}
                configs = await db.esg_question_configs.find(
                    config_query,
                    {"_id": 0, "question_key": 1, "label": 1, "question": 1, "description": 1, 
                     "section": 1, "brsr_section": 1, "framework": 1, "type": 1, "field_config": 1}
                ).to_list(500)
                config_map = {c["question_key"]: c for c in configs}
                
                # Build assignment map for lookup
                assignment_map = {a["entity_id"]: a for a in assignments}
                
                # Get submitter user info
                submitter_ids = list(set([r.get("submitted_by") for r in responses if r.get("submitted_by")]))
                submitters = {}
                if submitter_ids:
                    users = await db.users.find(
                        {"id": {"$in": submitter_ids}},
                        {"_id": 0, "id": 1, "email": 1, "full_name": 1, "name": 1}
                    ).to_list(100)
                    submitters = {u["id"]: u for u in users}
                
                # Enrich responses with config and assignment data
                for response in responses:
                    question_key = response.get("question_key")
                    config = config_map.get(question_key, {})
                    assignment = assignment_map.get(question_key, {})
                    submitter = submitters.get(response.get("submitted_by"), {})
                    
                    queue_items.append({
                        "id": response.get("id"),
                        "_response_id": response.get("id"),  # For approval endpoints
                        "question_key": question_key,
                        "question_name": config.get("label") or config.get("question") or config.get("description", "")[:100],
                        "disclosure_name": config.get("label") or config.get("question") or config.get("description", "")[:100],
                        "question_type": config.get("type"),
                        "field_config": config.get("field_config"),
                        "section_id": config.get("brsr_section") or config.get("section"),
                        "framework": response.get("framework") or config.get("framework", "BRSR"),
                        "reporting_year": response.get("reporting_year"),
                        "response_data": response.get("value"),  # The actual response value
                        "submitted_at": response.get("submitted_at"),
                        "submitted_by_id": response.get("submitted_by"),
                        "submitted_by_name": submitter.get("full_name") or submitter.get("name") or submitter.get("email", ""),
                        "submitted_by_email": submitter.get("email", ""),
                        "assignment_id": assignment.get("id"),
                        "due_date": assignment.get("due_date"),
                        "organization_id": organization_id,
                        "_source": "questionnaire_approval_v2",  # Mark source for frontend routing
                    })
        
        # =====================================================================
        # PART 2: Emission Record & ESG Record Approvals (from approval_requests)
        # =====================================================================
        
        # Query approval_requests for pending emission_record and esg_record approvals
        if is_admin:
            approval_requests_query = {
                "organization_id": organization_id,
                "entity_type": {"$in": ["emission_record", "esg_record"]},
                "status": "pending",
            }
        else:
            approval_requests_query = {
                "organization_id": organization_id,
                "entity_type": {"$in": ["emission_record", "esg_record"]},
                "status": "pending",
                "current_approvers": approver_id,
            }
        
        approval_requests = await db.approval_requests.find(
            approval_requests_query,
            {"_id": 0}
        ).to_list(500)
        
        if approval_requests:
            # Get submitter info for all requests
            submitter_ids = list(set([r.get("submitted_by") for r in approval_requests if r.get("submitted_by")]))
            submitters = {}
            if submitter_ids:
                users = await db.users.find(
                    {"id": {"$in": submitter_ids}},
                    {"_id": 0, "id": 1, "email": 1, "full_name": 1, "name": 1}
                ).to_list(100)
                submitters = {u["id"]: u for u in users}
            
            # Get facility info for display
            facility_ids = list(set([
                r.get("entity_snapshot", {}).get("facility_id") 
                for r in approval_requests 
                if r.get("entity_snapshot", {}).get("facility_id")
            ]))
            facilities = {}
            if facility_ids:
                facility_docs = await db.facilities.find(
                    {"id": {"$in": facility_ids}},
                    {"_id": 0, "id": 1, "name": 1}
                ).to_list(100)
                facilities = {f["id"]: f for f in facility_docs}
            
            for req in approval_requests:
                entity_snapshot = req.get("entity_snapshot", {})
                submitter = submitters.get(req.get("submitted_by"), {})
                facility_id = entity_snapshot.get("facility_id")
                facility = facilities.get(facility_id, {})
                
                # Build display name based on entity type
                entity_type = req.get("entity_type")
                if entity_type == "emission_record":
                    scope = entity_snapshot.get("scope", "")
                    category = entity_snapshot.get("category", "")
                    disclosure_name = f"GHG Emissions - {scope}"
                    if category:
                        disclosure_name += f" ({category})"
                elif entity_type == "esg_record":
                    category = entity_snapshot.get("category", "")
                    subcategory = entity_snapshot.get("subcategory", "")
                    disclosure_name = category
                    if subcategory:
                        disclosure_name += f" - {subcategory}"
                else:
                    disclosure_name = req.get("workflow_name", "Unknown Record")
                
                queue_items.append({
                    "id": req.get("id"),
                    "_approval_request_id": req.get("id"),  # For approval endpoints
                    "_entity_type": entity_type,
                    "_entity_id": req.get("entity_id"),
                    "question_key": None,  # Not a questionnaire item
                    "question_name": disclosure_name,
                    "disclosure_name": disclosure_name,
                    "question_type": "record",
                    "field_config": None,
                    "section_id": entity_snapshot.get("scope") or entity_snapshot.get("category"),
                    "framework": "ESG Records",
                    "reporting_year": entity_snapshot.get("reporting_period"),
                    "response_data": entity_snapshot,  # Full snapshot as response data
                    "submitted_at": req.get("submitted_at"),
                    "submitted_by_id": req.get("submitted_by"),
                    "submitted_by_name": req.get("submitted_by_name") or submitter.get("full_name") or submitter.get("name") or submitter.get("email", ""),
                    "submitted_by_email": req.get("submitted_by_email") or submitter.get("email", ""),
                    "assignment_id": None,
                    "due_date": None,
                    "organization_id": organization_id,
                    "facility_name": facility.get("name", ""),
                    "facility_id": facility_id,
                    "_source": f"{entity_type}_approval",  # Mark source for frontend routing
                })
        
        # =====================================================================
        # PART 3: Pending Emission Records (from pending_emission_records collection)
        # This is the older approval flow for emissions
        # =====================================================================
        
        pending_statuses = ["pending_create", "pending_update", "pending_delete"]
        
        if is_admin:
            pending_emissions_query = {
                "organization_id": organization_id,
                "approval_status": {"$in": pending_statuses},
            }
        else:
            # For non-admins, we need to check if they're the approver
            # This requires looking up assignments - for now, admins see all
            # TODO: Filter by approver assignment
            pending_emissions_query = {
                "organization_id": organization_id,
                "approval_status": {"$in": pending_statuses},
            }
        
        pending_emissions = await db.pending_emission_records.find(
            pending_emissions_query,
            {"_id": 0}
        ).to_list(500)
        
        if pending_emissions:
            # Get submitter info
            submitter_ids = list(set([p.get("submitted_by") for p in pending_emissions if p.get("submitted_by")]))
            submitters = {}
            if submitter_ids:
                users = await db.users.find(
                    {"id": {"$in": submitter_ids}},
                    {"_id": 0, "id": 1, "email": 1, "full_name": 1, "name": 1}
                ).to_list(100)
                submitters = {u["id"]: u for u in users}
            
            # Get facility info
            facility_ids = list(set([p.get("facility_id") for p in pending_emissions if p.get("facility_id")]))
            facilities = {}
            if facility_ids:
                facility_docs = await db.facilities.find(
                    {"id": {"$in": facility_ids}},
                    {"_id": 0, "id": 1, "name": 1}
                ).to_list(100)
                facilities = {f["id"]: f for f in facility_docs}
            
            for pending in pending_emissions:
                submitter = submitters.get(pending.get("submitted_by"), {})
                facility_id = pending.get("facility_id")
                facility = facilities.get(facility_id, {})
                scope = pending.get("scope", "")
                category = pending.get("category", "")
                
                disclosure_name = f"GHG Emissions - {scope}"
                if category:
                    disclosure_name += f" ({category})"
                
                # Map approval_status to action type for display
                approval_status = pending.get("approval_status", "")
                action_type = "update"
                if "create" in approval_status:
                    action_type = "create"
                elif "delete" in approval_status:
                    action_type = "delete"
                
                queue_items.append({
                    "id": pending.get("id"),
                    "_pending_emission_id": pending.get("id"),  # For approval endpoints
                    "_original_record_id": pending.get("original_record_id"),
                    "_entity_type": "pending_emission_record",
                    "_action_type": action_type,
                    "question_key": None,
                    "question_name": f"{disclosure_name} ({action_type})",
                    "disclosure_name": disclosure_name,
                    "question_type": "emission_record",
                    "field_config": None,
                    "section_id": scope,
                    "framework": "GHG Emissions",
                    "reporting_year": pending.get("reporting_period"),
                    "response_data": {
                        "scope": scope,
                        "category": category,
                        "sub_category": pending.get("sub_category"),
                        "total_emissions": pending.get("total_emissions"),
                        "inputs": pending.get("inputs"),
                        "outputs": pending.get("outputs"),
                    },
                    "submitted_at": pending.get("submitted_at"),
                    "submitted_by_id": pending.get("submitted_by"),
                    "submitted_by_name": pending.get("submitted_by_name") or submitter.get("full_name") or submitter.get("name") or "",
                    "submitted_by_email": pending.get("submitted_by_email") or submitter.get("email", ""),
                    "assignment_id": None,
                    "due_date": None,
                    "organization_id": organization_id,
                    "facility_name": facility.get("name", ""),
                    "facility_id": facility_id,
                    "approval_status": approval_status,
                    "_source": "pending_emission_record",
                })
        
        return queue_items
    
    @staticmethod
    async def approve_questionnaire_response(
        response_id: str,
        approver: dict,
        comment: Optional[str] = None,
        updated_response: Optional[dict] = None,
    ) -> Tuple[bool, str, Optional[dict]]:
        """
        Approve a questionnaire response.
        
        Args:
            response_id: The esg_responses document id
            approver: Current user dict
            comment: Optional approval comment
            updated_response: If approver edited the response, the new value
        
        Returns:
            (success, message, updated_response)
        """
        # Get the response
        response = await db.esg_responses.find_one(
            {"id": response_id},
            {"_id": 0}
        )
        
        if not response:
            return (False, "Response not found", None)
        
        if response.get("approval_status") != "pending_approval":
            return (False, f"Response is not pending approval (status: {response.get('approval_status')})", None)
        
        now = _now_iso()
        question_key = response.get("question_key")
        org_id = response.get("organization_id")
        
        # Prepare update
        update_data = {
            "approval_status": "approved",
            "approved_at": now,
            "approved_by": approver.get("id"),
            "approval_comment": comment,
            "updated_at": now,
        }
        
        # If approver edited the response, update it
        if updated_response is not None:
            update_data["value"] = updated_response  # Use 'value' field, not 'response'
            update_data["edited_by_approver"] = True
        
        # Update the esg_responses collection (approval tracking)
        await db.esg_responses.update_one(
            {"id": response_id},
            {"$set": update_data}
        )
        
        # CRITICAL: Sync edited value back to organization_esg_responses (what UI reads)
        if updated_response is not None:
            # Get section from response or config
            section = response.get("section")
            if not section:
                config = await db.esg_question_configs.find_one(
                    {"question_key": question_key},
                    {"_id": 0, "section": 1}
                )
                section = config.get("section") if config else None
            
            if section:
                # Update the organization_esg_responses document
                # Use case-insensitive regex for framework to handle BRSR vs brsr
                framework = response.get("framework", "brsr")
                await db.organization_esg_responses.update_one(
                    {
                        "org_id": org_id,
                        "framework": {"$regex": f"^{framework}$", "$options": "i"},
                        "reporting_year": response.get("reporting_year"),
                        "section": section,
                    },
                    {"$set": {f"responses.{question_key}": updated_response}}
                )
                logger.info(f"Synced edited response to organization_esg_responses for {question_key}")
        
        # Create version snapshot
        await _create_approval_version_snapshot(
            collection_name="esg_responses",
            record_id=question_key,
            action="approved",
            user_id=approver.get("id"),
            extra_metadata={
                "question_key": question_key,
                "framework": response.get("framework"),
                "reporting_year": response.get("reporting_year"),
                "approval_comment": comment,
            }
        )
        
        # Record in approval history
        await ApprovalWorkflowService._record_history(
            {
                "organization_id": org_id,
                "id": response_id,
                "workflow_id": None,
                "entity_type": "esg_response",  # Use valid EntityType enum value
                "entity_id": question_key,
                "entity_subtype": response.get("framework"),
            },
            ApprovalAction.APPROVE,
            approver,
            comment=comment,
            previous_status="pending",  # Use valid ApprovalStatus enum value
            new_status="approved",
        )
        
        # Update assignment timestamp (approval_status is tracked in esg_responses as single source of truth)
        await db.esg_assignments.update_one(
            {
                "organization_id": org_id,
                "entity_type": "question",
                "entity_id": question_key,
            },
            {"$set": {"updated_at": now}}
        )
        
        # Log to question_audit_log for version history (so UI can show it)
        await db.question_audit_log.insert_one({
            "id": str(uuid.uuid4()),
            "question_key": question_key,
            "reporting_period": response.get("reporting_year"),
            "organization_id": org_id,
            "action": "approved",
            "timestamp": datetime.now(timezone.utc),
            "performed_by": {"user_id": approver.get("id"), "name": approver.get("name") or approver.get("email")},
            "change_details": {
                "old_value": response.get("value"),
                "new_value": updated_response if updated_response is not None else response.get("value"),
                "approval_comment": comment,
            },
        })
        
        updated = await db.esg_responses.find_one({"id": response_id}, {"_id": 0})
        logger.info(f"Approved questionnaire response {response_id} (question: {question_key})")
        
        return (True, "Response approved", updated)
    
    @staticmethod
    async def reject_questionnaire_response(
        response_id: str,
        rejector: dict,
        reason: str,
    ) -> Tuple[bool, str, Optional[dict]]:
        """
        Reject a questionnaire response.
        
        Args:
            response_id: The esg_responses document id
            rejector: Current user dict
            reason: Required rejection reason
        
        Returns:
            (success, message, updated_response)
        """
        if not reason:
            return (False, "Rejection reason is required", None)
        
        # Get the response
        response = await db.esg_responses.find_one(
            {"id": response_id},
            {"_id": 0}
        )
        
        if not response:
            return (False, "Response not found", None)
        
        if response.get("approval_status") != "pending_approval":
            return (False, f"Response is not pending approval (status: {response.get('approval_status')})", None)
        
        now = _now_iso()
        question_key = response.get("question_key")
        org_id = response.get("organization_id")
        
        # Update the response
        update_data = {
            "approval_status": "rejected",
            "rejected_at": now,
            "rejected_by": rejector.get("id"),
            "rejection_reason": reason,
            "updated_at": now,
        }
        
        await db.esg_responses.update_one(
            {"id": response_id},
            {"$set": update_data}
        )
        
        # Create version snapshot
        await _create_approval_version_snapshot(
            collection_name="esg_responses",
            record_id=question_key,
            action="rejected",
            user_id=rejector.get("id"),
            rejection_reason=reason,
            extra_metadata={
                "question_key": question_key,
                "framework": response.get("framework"),
                "reporting_year": response.get("reporting_year"),
            }
        )
        
        # Record in approval history
        await ApprovalWorkflowService._record_history(
            {
                "organization_id": org_id,
                "id": response_id,
                "workflow_id": None,
                "entity_type": "esg_response",  # Use valid EntityType enum value
                "entity_id": question_key,
                "entity_subtype": response.get("framework"),
            },
            ApprovalAction.REJECT,
            rejector,
            comment=reason,
            previous_status="pending",  # Use valid ApprovalStatus enum value
            new_status="rejected",
        )
        
        # Update assignment timestamp (approval_status is tracked in esg_responses as single source of truth)
        await db.esg_assignments.update_one(
            {
                "organization_id": org_id,
                "entity_type": "question",
                "entity_id": question_key,
            },
            {"$set": {"updated_at": now}}
        )
        
        # Log to question_audit_log for version history
        await db.question_audit_log.insert_one({
            "id": str(uuid.uuid4()),
            "question_key": question_key,
            "reporting_period": response.get("reporting_year"),
            "organization_id": org_id,
            "action": "rejected",
            "timestamp": datetime.now(timezone.utc),
            "performed_by": {"user_id": rejector.get("id"), "name": rejector.get("name") or rejector.get("email")},
            "change_details": {"rejection_reason": reason},
            "rejection_reason": reason,
        })
        
        updated = await db.esg_responses.find_one({"id": response_id}, {"_id": 0})
        logger.info(f"Rejected questionnaire response {response_id} (question: {question_key}): {reason}")
        
        return (True, "Response rejected", updated)
    
    @staticmethod
    async def get_questionnaire_response_history(
        question_key: str,
        organization_id: str,
    ) -> List[dict]:
        """Get approval/rejection history for a specific question."""
        return await db[HISTORY_COLLECTION].find(
            {
                "organization_id": organization_id,
                "entity_type": "esg_response",  # Match the entity_type we record with
                "entity_id": question_key,
            },
            {"_id": 0}
        ).sort("timestamp", -1).to_list(100)
