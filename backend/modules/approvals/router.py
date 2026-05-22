"""Approvals HTTP routes.

Routes stay declarative: validation + auth here, business logic in
`service.py` (generic) and `emission_flow.py` (emission entity finalization).
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from modules.approvals.contracts import (
    ApprovalCountResponse,
    ApprovalDecisionInput,
    ApprovalRequestResponse,
)
from modules.approvals.emission_flow import finalize_emission_decision
from modules.approvals.service import (
    apply_stage_decision,
    authorize_decider,
    count_pending_for_admin,
    get_request,
    list_requests_for_user,
    persist_decision,
)
from modules.auth.dependencies import get_current_user

router = APIRouter()


@router.get("/approvals", response_model=List[ApprovalRequestResponse])
async def list_approvals(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    items = await list_requests_for_user(current_user, status=status)
    return [ApprovalRequestResponse(**i) for i in items]


@router.get("/approvals/count", response_model=ApprovalCountResponse)
async def get_pending_count(current_user: dict = Depends(get_current_user)):
    pending = await count_pending_for_admin(current_user)
    return ApprovalCountResponse(pending=pending)


@router.post("/approvals/{request_id}/decide", response_model=ApprovalRequestResponse)
async def decide_approval(
    request_id: str,
    payload: ApprovalDecisionInput,
    current_user: dict = Depends(get_current_user),
):
    if payload.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")

    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only admins can decide approvals")

    req = await get_request(request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Approval request not found")
    if not authorize_decider(req, current_user):
        raise HTTPException(status_code=403, detail="Not authorized for this request")
    if req.get("status") != "pending":
        return ApprovalRequestResponse(**req)  # idempotent — already finalized

    updated = apply_stage_decision(req, payload.action, payload.comment, current_user)
    await persist_decision(updated)

    # Run entity-specific side-effects (history writes, deletes, etc.).
    await finalize_emission_decision(updated, current_user)

    # Re-fetch so any writes done by finalizer are reflected.
    fresh = await get_request(request_id)
    return ApprovalRequestResponse(**(fresh or updated))
