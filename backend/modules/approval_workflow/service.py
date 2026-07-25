"""
Approval Workflow Service

Business logic for the Enterprise Approval Workflow Engine.
Handles workflow management, request processing, and approval actions.
"""

import logging
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
                                
                                # NOTE: We no longer update task.status - it's computed from data
                                # Only clear approval_status since record was deleted
                                await db.esg_reporting_tasks.update_many(
                                    task_query,
                                    {"$set": {"approval_status": None, "updated_at": _now_iso()}}
                                )
                                logger.info(f"Cleared task approval_status for deleted record")
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
                        # Update the record's status and approval_status (and field_values if edited)
                        record_update = {
                            "updated_at": _now_iso(),
                            "status": "completed",  # Reset status to completed
                            "approval_status": "approved",
                        }
                        
                        # Update field_values if provided
                        if updated_data and "field_values" in updated_data:
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
                            
                            # NOTE: We no longer update task.status - it's computed from data
                            # Only update approval_status for tracking
                            task_update_result = await db.esg_reporting_tasks.update_many(
                                task_query,
                                {"$set": {"approval_status": "approved", "updated_at": _now_iso()}}
                            )
                            logger.info(f"Updated {task_update_result.modified_count} task(s) approval_status=approved")
                            
                except Exception as e:
                    logger.error(f"Failed to update ESG record/task with approval: {e}")
                    import traceback
                    traceback.print_exc()
            
            # Handle emission_record approval
            elif entity_type == "emission_record":
                try:
                    record_update = {
                        "updated_at": _now_iso(),
                        "approval_status": "approved",
                    }
                    await db.emission_records.update_one(
                        {"id": entity_id},
                        {"$set": record_update}
                    )
                    logger.info(f"Updated emission_record {entity_id} approval_status=approved")
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
                collection_map = {
                    "environment": "environment_records",
                    "social": "social_records",
                    "governance": "governance_records",
                }
                collection_name = collection_map.get(entity_subtype)
                
                if collection_name:
                    # Update the ESG record
                    await db[collection_name].update_one(
                        {"id": entity_id, "is_current": True},
                        {"$set": update_doc}
                    )
                    logger.info(f"Updated {collection_name} record {entity_id} approval_status to rejected")
                else:
                    logger.warning(f"Unknown entity_subtype for esg_record: {entity_subtype}")
            
            elif entity_type == "emission_record":
                # GHG emission records
                await db.emission_records.update_one(
                    {"id": entity_id},
                    {"$set": update_doc}
                )
                logger.info(f"Updated emission_record {entity_id} approval_status to rejected")
            
            elif entity_type == "esg_response":
                # Update the ESG assignment for the question
                await db.esg_assignments.update_one(
                    {"id": entity_id, "organization_id": org_id},
                    {"$set": update_doc}
                )
            elif entity_type == "esg_task":
                # Directly update the task - only approval_status, NOT status
                # Task status is computed from data, not stored
                task_update = {
                    "approval_status": "rejected",
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
