"""
Proposal Management Router

API endpoints for managing change proposals in the multi-proposal approval workflow.
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from modules.auth.dependencies import get_current_user, get_admin_user
from modules.approval_workflow.proposal_service import proposal_service
from modules.approval_workflow.service import ApprovalWorkflowService
from modules.approval_workflow.models import ApprovalDecisionInput
from shared.database.mongo import db


router = APIRouter(prefix="/proposals", tags=["Proposals"])


# ============================================================================
# Request/Response Models
# ============================================================================

class ProposalEditRequest(BaseModel):
    """Request to edit a proposal (approver only)."""
    field_values: Optional[dict] = None
    notes: Optional[str] = None
    source_of_information: Optional[str] = None
    evidence_files: Optional[List[dict]] = None
    record_source: Optional[str] = None
    responsible_person: Optional[str] = None
    responsible_person_designation: Optional[str] = None
    responsible_person_contact: Optional[str] = None
    process_names: Optional[List[str]] = None
    process_descriptions: Optional[List[dict]] = None
    employee_inputs: Optional[List[dict]] = None


class ProposalApproveRequest(BaseModel):
    """Request to approve a proposal."""
    comment: Optional[str] = None


class ProposalRejectRequest(BaseModel):
    """Request to reject a proposal."""
    reason: str


# ============================================================================
# Helper: Check if user is approver for a proposal
# ============================================================================

async def check_approver_access(proposal_id: str, user_id: str) -> dict:
    """Check if user can approve this proposal."""
    proposal = await db.approval_requests.find_one(
        {"id": proposal_id},
        {"_id": 0}
    )
    
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    
    current_approvers = proposal.get("current_approvers", [])
    
    # Check if user is in the current approvers list
    if user_id not in current_approvers:
        # Also check if user is an admin of the organization
        user = await db.users.find_one(
            {"id": user_id, "organization_id": proposal.get("organization_id")},
            {"_id": 0, "role": 1}
        )
        if not user or user.get("role") not in ["admin", "super_admin"]:
            raise HTTPException(
                status_code=403,
                detail="You are not authorized to approve this proposal"
            )
    
    return proposal


# ============================================================================
# Proposal Endpoints
# ============================================================================

@router.get("/record/{entity_type}/{record_id}")
async def get_proposals_for_record(
    entity_type: str,
    record_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Get proposals for a record.
    
    - Normal users: Get their own pending proposal only
    - Approvers/Admins: Get all pending proposals
    
    Also returns the current record data for comparison.
    """
    user_id = current_user.get("id")
    user_role = current_user.get("role", "user")
    
    # Check if user is admin/approver
    is_admin = user_role in ["admin", "super_admin"]
    
    # Fetch the current record based on entity_type
    current_record = None
    if entity_type == "esg_record":
        current_record = await db.environment_records.find_one(
            {"id": record_id},
            {"_id": 0}
        )
        if not current_record:
            # Try social_records
            current_record = await db.social_records.find_one(
                {"id": record_id},
                {"_id": 0}
            )
        if not current_record:
            # Try governance_records
            current_record = await db.governance_records.find_one(
                {"id": record_id},
                {"_id": 0}
            )
    elif entity_type == "emission_record":
        current_record = await db.emission_records.find_one(
            {"id": record_id},
            {"_id": 0}
        )
    
    data_level = None
    if current_record and entity_type == "esg_record":
        facility_id = current_record.get("facility_id")
        facility = await db.facilities.find_one({"id": facility_id}, {"_id": 0, "name": 1}) if facility_id else None
        data_level = f"Facility {facility['name']}" if facility else "Organization level"

    if is_admin:
        # Return all pending proposals
        proposals = await proposal_service.get_all_pending_proposals(
            record_id=record_id,
            entity_type=entity_type,
        )
        return {
            "proposals": proposals,
            "count": len(proposals),
            "is_approver_view": True,
            "current_record": current_record,
            "data_level": data_level,
        }
    else:
        # Assigned approvers see the proposals waiting on them
        pending = await proposal_service.get_all_pending_proposals(record_id=record_id, entity_type=entity_type)
        approver_proposals = [p for p in pending if user_id in (p.get("current_approvers") or [])]
        if approver_proposals:
            return {
                "proposals": approver_proposals,
                "count": len(approver_proposals),
                "is_approver_view": True,
                "current_record": current_record,
                "data_level": data_level,
            }
        # Return only user's proposal
        proposal = await proposal_service.get_user_pending_proposal(
            record_id=record_id,
            user_id=user_id,
            entity_type=entity_type,
        )
        return {
            "proposals": [proposal] if proposal else [],
            "count": 1 if proposal else 0,
            "is_approver_view": False,
            "current_record": current_record,
            "data_level": data_level,
        }


@router.get("/{proposal_id}")
async def get_proposal(
    proposal_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get a single proposal."""
    proposal = await db.approval_requests.find_one(
        {"id": proposal_id},
        {"_id": 0}
    )
    
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    
    user_id = current_user.get("id")
    user_role = current_user.get("role", "user")
    org_id = current_user.get("organization_id")
    
    # Check access
    is_submitter = proposal.get("submitted_by") == user_id
    is_approver = user_id in proposal.get("current_approvers", [])
    is_admin = user_role in ["admin", "super_admin"]
    is_same_org = proposal.get("organization_id") == org_id
    
    if not (is_submitter or is_approver or (is_admin and is_same_org)):
        raise HTTPException(status_code=403, detail="Access denied")
    
    return proposal


@router.put("/{proposal_id}")
async def edit_proposal(
    proposal_id: str,
    data: ProposalEditRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Edit a proposal before approving (approver only).
    
    This allows approvers to modify proposed values before approval.
    Original submission is preserved for audit trail.
    """
    user_id = current_user.get("id")
    
    # Check approver access
    await check_approver_access(proposal_id, user_id)
    
    # Build modified data from request
    modified_data = {}
    if data.field_values is not None:
        modified_data["field_values"] = data.field_values
    if data.notes is not None:
        modified_data["notes"] = data.notes
    if data.source_of_information is not None:
        modified_data["source_of_information"] = data.source_of_information
    if data.evidence_files is not None:
        modified_data["evidence_files"] = data.evidence_files
    for key in ("record_source", "responsible_person", "responsible_person_designation", "responsible_person_contact",
                "process_names", "process_descriptions", "employee_inputs"):
        if getattr(data, key) is not None:
            modified_data[key] = getattr(data, key)
    
    if not modified_data:
        raise HTTPException(status_code=400, detail="No modifications provided")
    
    result = await proposal_service.approver_edit_proposal(
        proposal_id=proposal_id,
        approver_id=user_id,
        modified_data=modified_data,
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Proposal not found or already resolved")
    
    return result


@router.post("/batch/reject")
async def batch_reject_proposals(
    proposal_ids: List[str],
    reason: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Reject multiple proposals at once."""
    user_id = current_user.get("id")
    results = []
    for proposal_id in proposal_ids:
        try:
            await check_approver_access(proposal_id, user_id)
            await proposal_service.reject_proposal(
                proposal_id=proposal_id,
                approver_id=user_id,
                rejection_reason=reason,
            )
            results.append({"id": proposal_id, "success": True})
        except Exception as error:
            results.append({"id": proposal_id, "success": False, "error": str(error)})
    return {"results": results}


async def _is_delete_request(request_id: str) -> bool:
    request = await db.approval_requests.find_one({"id": request_id}, {"_id": 0, "request_type": 1})
    return bool(request and request.get("request_type") == "delete")


async def _decide_delete_request(request_id: str, action: str, comment: Optional[str], current_user: dict) -> dict:
    """Delete requests are not edit proposals; run them through the normal approval decision."""
    success, message, _ = await ApprovalWorkflowService.make_decision(
        request_id, ApprovalDecisionInput(action=action, comment=comment), current_user)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "proposal_id": request_id, "message": message}


@router.post("/{proposal_id}/approve")
async def approve_proposal(
    proposal_id: str,
    data: ProposalApproveRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Approve a proposal.
    
    This will:
    1. Apply proposed changes to the approved record
    2. Mark this proposal as approved
    3. Auto-reject all other pending proposals for the same record
    4. Notify affected users
    """
    user_id = current_user.get("id")
    
    # Check approver access
    await check_approver_access(proposal_id, user_id)
    
    if await _is_delete_request(proposal_id):
        return await _decide_delete_request(proposal_id, "approve", data.comment, current_user)
    
    result = await proposal_service.approve_proposal(
        proposal_id=proposal_id,
        approver_id=user_id,
        approval_comment=data.comment,
    )
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.post("/{proposal_id}/reject")
async def reject_proposal(
    proposal_id: str,
    data: ProposalRejectRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Reject a proposal.
    
    Other pending proposals for the same record remain unaffected.
    """
    user_id = current_user.get("id")
    
    # Check approver access
    await check_approver_access(proposal_id, user_id)
    
    if await _is_delete_request(proposal_id):
        return await _decide_delete_request(proposal_id, "reject", data.reason, current_user)
    
    result = await proposal_service.reject_proposal(
        proposal_id=proposal_id,
        approver_id=user_id,
        rejection_reason=data.reason,
    )
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.delete("/{proposal_id}")
async def withdraw_proposal(
    proposal_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Withdraw own pending proposal (submitter only).
    """
    user_id = current_user.get("id")
    
    proposal = await db.approval_requests.find_one(
        {"id": proposal_id, "status": {"$in": ["pending", "in_review"]}},
        {"_id": 0}
    )
    
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found or already resolved")
    
    # Only submitter can withdraw
    if proposal.get("submitted_by") != user_id:
        raise HTTPException(status_code=403, detail="Only the submitter can withdraw this proposal")
    
    # Mark as withdrawn
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    
    await db.approval_requests.update_one(
        {"id": proposal_id},
        {"$set": {
            "status": "withdrawn",
            "resolved_at": now,
            "resolved_by": user_id,
            "resolution_comment": "Withdrawn by submitter",
            "updated_at": now,
        }}
    )
    
    return {"success": True, "message": "Proposal withdrawn"}


