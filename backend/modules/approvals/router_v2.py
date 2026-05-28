"""Approvals HTTP routes V2.

Uses the new pending_records architecture where all approval metadata
is embedded in the pending record itself.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from modules.approvals.emission_flow_v2 import (
    PENDING_COLLECTION,
    PENDING_STATUSES,
    REJECTED_STATUSES,
    approve_request,
    reject_request,
    fetch_pending_requests,
    get_pending_count,
)
from modules.auth.dependencies import get_current_user
from shared.database.mongo import db

router = APIRouter()


class ApprovalDecisionInput(BaseModel):
    action: str  # "approve" or "reject"
    comment: Optional[str] = None
    admin_changes: Optional[dict] = None  # For admin edits during approval


class ApprovalCountResponse(BaseModel):
    pending: int


@router.get("/approvals")
async def list_approvals(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """List approval requests for the current user's organization."""
    role = current_user.get("role", "user")
    org_id = current_user.get("organization_id")
    
    if role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only admins can view approvals")
    
    # Default to pending if no status specified
    status_filter = status or "pending"
    
    if role == "super_admin":
        # Super admin can see all pending requests
        if status_filter == "pending":
            query = {"approval_status": {"$in": list(PENDING_STATUSES)}}
        elif status_filter == "rejected":
            query = {"approval_status": {"$in": list(REJECTED_STATUSES)}}
        else:
            query = {}
        items = await db[PENDING_COLLECTION].find(query, {"_id": 0}).to_list(1000)
    else:
        # Admin sees their org's requests
        items = await fetch_pending_requests(org_id, status_filter)
    
    # Add facility names
    for item in items:
        if item.get("facility_id"):
            fac = await db.facilities.find_one(
                {"id": item["facility_id"]},
                {"_id": 0, "name": 1}
            )
            item["facility_name"] = fac.get("name") if fac else None
    
    return items


@router.get("/approvals/count", response_model=ApprovalCountResponse)
async def get_approval_count(current_user: dict = Depends(get_current_user)):
    """Get count of pending approval requests."""
    role = current_user.get("role", "user")
    org_id = current_user.get("organization_id")
    
    if role == "super_admin":
        count = await db[PENDING_COLLECTION].count_documents({
            "approval_status": {"$in": list(PENDING_STATUSES)}
        })
    elif role == "admin" and org_id:
        count = await get_pending_count(org_id)
    else:
        count = 0
    
    return ApprovalCountResponse(pending=count)


@router.get("/approvals/{pending_id}")
async def get_approval(
    pending_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get a single approval request by ID."""
    pending = await db[PENDING_COLLECTION].find_one({"id": pending_id}, {"_id": 0})
    if not pending:
        raise HTTPException(status_code=404, detail="Approval request not found")
    
    # Access control
    role = current_user.get("role", "user")
    org_id = current_user.get("organization_id")
    
    if role == "super_admin":
        pass  # Can access all
    elif role == "admin":
        if pending.get("organization_id") != org_id:
            raise HTTPException(status_code=403, detail="Not authorized")
    else:
        # Regular users can see their own submissions
        if pending.get("submitted_by") != current_user.get("id"):
            raise HTTPException(status_code=403, detail="Not authorized")
    
    # Add facility name
    if pending.get("facility_id"):
        fac = await db.facilities.find_one(
            {"id": pending["facility_id"]},
            {"_id": 0, "name": 1}
        )
        pending["facility_name"] = fac.get("name") if fac else None
    
    return pending


@router.post("/approvals/{pending_id}/decide")
async def decide_approval(
    pending_id: str,
    payload: ApprovalDecisionInput,
    current_user: dict = Depends(get_current_user),
):
    """Approve or reject a pending request."""
    if payload.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")
    
    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only admins can decide approvals")
    
    # Get pending record
    pending = await db[PENDING_COLLECTION].find_one({"id": pending_id}, {"_id": 0})
    if not pending:
        raise HTTPException(status_code=404, detail="Approval request not found")
    
    # Check authorization
    role = current_user.get("role")
    org_id = current_user.get("organization_id")
    if role != "super_admin" and pending.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Not authorized for this request")
    
    # Check if already decided
    if pending.get("approval_status") not in PENDING_STATUSES:
        return pending  # Idempotent - already decided
    
    # Execute decision
    if payload.action == "approve":
        success, message = await approve_request(
            pending_id,
            current_user,
            admin_changes=payload.admin_changes
        )
    else:
        success, message = await reject_request(
            pending_id,
            current_user,
            reason=payload.comment
        )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    # Return updated record (or confirmation for deletes)
    updated = await db[PENDING_COLLECTION].find_one({"id": pending_id}, {"_id": 0})
    if updated:
        return updated
    else:
        # Record was deleted (approved create/update or approved delete)
        return {"message": message, "status": "approved"}
