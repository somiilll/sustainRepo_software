"""
Approval Workflow HTTP Routes

REST API endpoints for the Enterprise Approval Workflow Engine.
"""

import logging
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from modules.auth.dependencies import get_current_user
from .service import ApprovalWorkflowService
from .models import (
    CreateWorkflowInput,
    UpdateWorkflowInput,
    SubmitForApprovalInput,
    ApprovalDecisionInput,
    ApprovalStatus,
    EntityType,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/approval-workflows", tags=["Approval Workflows"])


# =============================================================================
# WORKFLOW MANAGEMENT ENDPOINTS
# =============================================================================

@router.post("/workflows")
async def create_workflow(
    data: CreateWorkflowInput,
    current_user: dict = Depends(get_current_user),
):
    """
    Create a new approval workflow.
    
    Only admins can create workflows for their organization.
    """
    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only admins can create workflows")
    
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="User has no organization")
    
    success, message, workflow = await ApprovalWorkflowService.create_workflow(
        org_id, data, current_user
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"message": message, "workflow": workflow}


@router.get("/workflows")
async def list_workflows(
    include_inactive: bool = Query(False, description="Include inactive workflows"),
    current_user: dict = Depends(get_current_user),
):
    """List all workflows for the current organization."""
    org_id = current_user.get("organization_id")
    
    if current_user.get("role") == "super_admin":
        # Super admin can see all - would need pagination in production
        from shared.database.mongo import db
        workflows = await db.approval_workflows.find({}, {"_id": 0}).to_list(500)
    else:
        workflows = await ApprovalWorkflowService.get_workflows_for_org(
            org_id, include_inactive
        )
    
    return {"workflows": workflows}


@router.get("/workflows/{workflow_id}")
async def get_workflow(
    workflow_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get a specific workflow by ID."""
    workflow = await ApprovalWorkflowService.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Access control
    if current_user.get("role") != "super_admin":
        if workflow.get("organization_id") != current_user.get("organization_id"):
            raise HTTPException(status_code=403, detail="Not authorized")
    
    return workflow


@router.put("/workflows/{workflow_id}")
async def update_workflow(
    workflow_id: str,
    data: UpdateWorkflowInput,
    current_user: dict = Depends(get_current_user),
):
    """Update a workflow."""
    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only admins can update workflows")
    
    # Verify ownership
    workflow = await ApprovalWorkflowService.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    if current_user.get("role") != "super_admin":
        if workflow.get("organization_id") != current_user.get("organization_id"):
            raise HTTPException(status_code=403, detail="Not authorized")
    
    success, message, updated = await ApprovalWorkflowService.update_workflow(
        workflow_id, data, current_user
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"message": message, "workflow": updated}


@router.delete("/workflows/{workflow_id}")
async def delete_workflow(
    workflow_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Archive (soft delete) a workflow."""
    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only admins can delete workflows")
    
    # Verify ownership
    workflow = await ApprovalWorkflowService.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    if current_user.get("role") != "super_admin":
        if workflow.get("organization_id") != current_user.get("organization_id"):
            raise HTTPException(status_code=403, detail="Not authorized")
    
    success, message = await ApprovalWorkflowService.delete_workflow(workflow_id)
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"message": message}


# =============================================================================
# APPROVAL REQUEST ENDPOINTS
# =============================================================================

@router.post("/requests")
async def submit_for_approval(
    data: SubmitForApprovalInput,
    current_user: dict = Depends(get_current_user),
):
    """
    Submit an entity for approval.
    
    Automatically finds the appropriate workflow based on entity type.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="User has no organization")
    
    success, message, request = await ApprovalWorkflowService.submit_for_approval(
        org_id, data, current_user
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"message": message, "request": request}


@router.get("/requests")
async def list_requests(
    status: Optional[str] = Query(None, description="Filter by status"),
    entity_type: Optional[str] = Query(None, description="Filter by entity type"),
    my_approvals: bool = Query(False, description="Only show requests I can approve"),
    my_submissions: bool = Query(False, description="Only show my submissions"),
    current_user: dict = Depends(get_current_user),
):
    """List approval requests with various filters."""
    org_id = current_user.get("organization_id")
    user_id = current_user.get("id")
    
    if my_submissions:
        requests = await ApprovalWorkflowService.get_my_submissions(
            org_id, user_id, status
        )
    elif my_approvals:
        requests = await ApprovalWorkflowService.get_pending_requests(
            org_id, user_id=user_id, entity_type=entity_type
        )
    else:
        # Admins see all, users see their own
        if current_user.get("role") in ("admin", "super_admin"):
            requests = await ApprovalWorkflowService.get_pending_requests(
                org_id, entity_type=entity_type
            )
        else:
            requests = await ApprovalWorkflowService.get_my_submissions(
                org_id, user_id, status
            )
    
    return {"requests": requests, "total": len(requests)}



@router.get("/requests/history")
async def get_approval_history(
    status: Optional[str] = Query(None, description="Filter by status (approved/rejected/cancelled)"),
    current_user: dict = Depends(get_current_user),
):
    """Get past approval requests (approved, rejected, cancelled) for history tab."""
    org_id = current_user.get("organization_id")
    user_id = current_user.get("id")

    # Admins see all org history, users see history where they were approver
    if current_user.get("role") in ("admin", "super_admin"):
        requests = await ApprovalWorkflowService.get_approval_history(org_id, status=status)
    else:
        requests = await ApprovalWorkflowService.get_approval_history(org_id, user_id=user_id, status=status)

    return {"requests": requests, "total": len(requests)}



@router.get("/requests/count")
async def get_pending_count(
    my_approvals: bool = Query(False, description="Only count requests I can approve"),
    current_user: dict = Depends(get_current_user),
):
    """Get count of pending approval requests."""
    org_id = current_user.get("organization_id")
    user_id = current_user.get("id") if my_approvals else None
    
    counts = await ApprovalWorkflowService.get_pending_count(org_id, user_id)
    return counts


@router.get("/requests/{request_id}")
async def get_request(
    request_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get a specific approval request."""
    request = await ApprovalWorkflowService.get_request(request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    # Access control
    user_id = current_user.get("id")
    user_role = current_user.get("role")
    org_id = current_user.get("organization_id")
    
    is_submitter = request.get("submitted_by") == user_id
    is_approver = user_id in request.get("current_approvers", [])
    is_org_admin = user_role in ("admin", "super_admin") and request.get("organization_id") == org_id
    is_super = user_role == "super_admin"
    
    if not (is_submitter or is_approver or is_org_admin or is_super):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Add computed fields
    request["can_approve"] = is_approver or is_super or (is_org_admin and user_id in request.get("current_approvers", []))
    request["can_cancel"] = is_submitter or is_org_admin
    
    return request


@router.get("/requests/{request_id}/history")
async def get_request_history(
    request_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get the history of actions on an approval request."""
    request = await ApprovalWorkflowService.get_request(request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    # Access control (same as get_request)
    user_id = current_user.get("id")
    user_role = current_user.get("role")
    org_id = current_user.get("organization_id")
    
    is_submitter = request.get("submitted_by") == user_id
    is_org_admin = user_role in ("admin", "super_admin") and request.get("organization_id") == org_id
    is_super = user_role == "super_admin"
    
    if not (is_submitter or is_org_admin or is_super):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    history = await ApprovalWorkflowService.get_history_for_request(request_id)
    return {"history": history}


@router.post("/requests/{request_id}/decide")
async def make_decision(
    request_id: str,
    data: ApprovalDecisionInput,
    current_user: dict = Depends(get_current_user),
):
    """
    Make a decision on an approval request.
    
    Actions: approve, reject, request_changes, delegate
    """
    success, message, updated = await ApprovalWorkflowService.make_decision(
        request_id, data, current_user
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"message": message, "request": updated}


@router.post("/requests/{request_id}/resubmit")
async def resubmit_request(
    request_id: str,
    comment: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Resubmit a rejected or changes-requested approval."""
    success, message, new_request = await ApprovalWorkflowService.resubmit(
        request_id, current_user, comment=comment
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"message": message, "request": new_request}


@router.post("/requests/{request_id}/cancel")
async def cancel_request(
    request_id: str,
    comment: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Cancel a pending approval request."""
    success, message, updated = await ApprovalWorkflowService.cancel_request(
        request_id, current_user, comment
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"message": message, "request": updated}


# =============================================================================
# ENTITY-LEVEL ENDPOINTS
# =============================================================================

@router.get("/entity/{entity_id}/requests")
async def get_entity_requests(
    entity_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get all approval requests for an entity."""
    requests = await ApprovalWorkflowService.get_requests_for_entity(entity_id)
    
    # Filter by org access
    org_id = current_user.get("organization_id")
    if current_user.get("role") != "super_admin":
        requests = [r for r in requests if r.get("organization_id") == org_id]
    
    return {"requests": requests}


@router.get("/entity/{entity_id}/history")
async def get_entity_history(
    entity_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get approval history for an entity across all requests."""
    history = await ApprovalWorkflowService.get_history_for_entity(entity_id)
    
    # Filter by org access
    org_id = current_user.get("organization_id")
    if current_user.get("role") != "super_admin":
        history = [h for h in history if h.get("organization_id") == org_id]
    
    return {"history": history}


@router.get("/entity/{entity_id}/status")
async def get_entity_approval_status(
    entity_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get the current approval status for an entity."""
    status = await ApprovalWorkflowService.get_approval_status(entity_id)
    is_approved = status == ApprovalStatus.APPROVED.value
    
    return {
        "entity_id": entity_id,
        "status": status,
        "is_approved": is_approved,
    }


# =============================================================================
# UTILITY ENDPOINTS
# =============================================================================

@router.get("/check-required")
async def check_approval_required(
    entity_type: str,
    entity_subtype: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Check if an entity type requires approval in the current organization."""
    org_id = current_user.get("organization_id")
    
    required = await ApprovalWorkflowService.requires_approval(
        org_id, entity_type, entity_subtype
    )
    
    workflow = None
    if required:
        workflow = await ApprovalWorkflowService.get_workflow_for_entity(
            org_id, entity_type, entity_subtype
        )
    
    return {
        "requires_approval": required,
        "workflow": workflow,
    }


@router.get("/entity-types")
async def list_entity_types():
    """List available entity types for workflows."""
    return {
        "entity_types": [
            {"value": e.value, "label": e.value.replace("_", " ").title()}
            for e in EntityType
        ]
    }



# =============================================================================
# SIMPLIFIED ESG RECORD APPROVAL ENDPOINTS
# =============================================================================

class SimpleApprovalInput(BaseModel):
    """Simple input for ESG record approval/rejection."""
    comment: Optional[str] = None
    updated_data: Optional[dict] = None


@router.post("/requests/{request_id}/approve")
async def approve_request_simple(
    request_id: str,
    data: SimpleApprovalInput = SimpleApprovalInput(),
    current_user: dict = Depends(get_current_user),
):
    """
    Simple approve endpoint for ESG records.
    Doesn't require a formal workflow document.
    """
    decision = ApprovalDecisionInput(
        action="approve",
        comment=data.comment or "Approved",
        updated_data=data.updated_data
    )
    
    success, message, updated = await ApprovalWorkflowService.make_decision(
        request_id, decision, current_user
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"message": message, "request": updated}


@router.post("/requests/{request_id}/reject")
async def reject_request_simple(
    request_id: str,
    data: SimpleApprovalInput = SimpleApprovalInput(),
    current_user: dict = Depends(get_current_user),
):
    """
    Simple reject endpoint for ESG records.
    Doesn't require a formal workflow document.
    """
    if not data.comment:
        raise HTTPException(status_code=400, detail="Comment required when rejecting")
    
    decision = ApprovalDecisionInput(
        action="reject",
        comment=data.comment
    )
    
    success, message, updated = await ApprovalWorkflowService.make_decision(
        request_id, decision, current_user
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"message": message, "request": updated}
