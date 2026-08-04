"""
ESG Questionnaire Router

API endpoints for config-driven ESG questionnaire system.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from modules.auth.dependencies import get_current_user, get_admin_user, get_approver_user
from modules.esg_questionnaire.contracts import (
    QuestionConfigCreate,
    QuestionConfigUpdate,
    ESGResponseCreate,
    NGRBC_PRINCIPLES,
)
from modules.esg_questionnaire.service import esg_questionnaire_service

router = APIRouter(prefix="/esg-questionnaire", tags=["ESG Questionnaire"])


# =============================================================================
# Question Config Endpoints (Admin)
# =============================================================================

@router.get("/configs")
async def list_question_configs(
    framework: Optional[str] = Query(None, description="Filter by framework: BRSR, GRI, SBTi"),
    section: Optional[str] = Query(None, description="Filter by section: environment, social, governance"),
    current_user: dict = Depends(get_current_user)
):
    """
    List ESG question configs with optional filtering.
    
    Role-based behavior:
    - Admin/Super Admin: See ALL question configs
    - Regular User: See ONLY question configs they are assigned to (via V2 architecture)
    """
    org_id = current_user.get("organization_id")
    user_id = current_user.get("id")
    user_role = current_user.get("role", "user")
    is_admin = user_role in ["admin", "super_admin"]
    
    configs = await esg_questionnaire_service.list_question_configs(
        framework=framework,
        section=section,
        org_id=org_id,
        user_id=user_id if not is_admin else None,  # Only filter by user for non-admins
        filter_by_assignment=not is_admin,
    )
    return {
        "framework": framework,
        "section": section,
        "total": len(configs),
        "configs": configs
    }


@router.get("/configs/{question_key}")
async def get_question_config(
    question_key: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get a single question config by key.
    For sub-question keys (e.g. gri_101_2_a_i), returns the parent config
    with a `matched_sub_question` field containing the sub-question details.
    """
    config = await esg_questionnaire_service.get_question_config(question_key)
    if config:
        return config
    
    # If not found, try to resolve as a sub-question by splitting off the last suffix
    sub_suffixes = {'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x',
                    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n'}
    if "_" in question_key:
        parts = question_key.rsplit("_", 1)
        if len(parts) == 2 and parts[1].lower() in sub_suffixes:
            parent_key = parts[0]
            sub_key = parts[1]
            parent_config = await esg_questionnaire_service.get_question_config(parent_key)
            if parent_config:
                # Find the matching sub_question
                matched_sub = None
                for sq in parent_config.get("sub_questions", []):
                    if sq.get("sub_key") == sub_key:
                        matched_sub = sq
                        break
                parent_config["matched_sub_question"] = matched_sub
                parent_config["resolved_from_parent"] = True
                parent_config["original_question_key"] = question_key
                return parent_config
    
    raise HTTPException(status_code=404, detail="Question config not found")


@router.post("/configs")
async def create_question_config(
    config: QuestionConfigCreate,
    current_user: dict = Depends(get_admin_user)
):
    """
    Create a new question config. Admin only.
    """
    try:
        result = await esg_questionnaire_service.create_question_config(config)
        return {"message": "Question config created", "config": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/configs/bulk")
async def bulk_create_question_configs(
    configs: List[QuestionConfigCreate],
    current_user: dict = Depends(get_admin_user)
):
    """
    Bulk create question configs. Admin only.
    """
    results = await esg_questionnaire_service.bulk_create_question_configs(configs)
    return {"message": f"Created {len(results)} question configs", "configs": results}


@router.post("/configs/batch")
async def batch_get_question_configs(
    request: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Get multiple question configs by their keys.
    Used for enriching approval queue items with question descriptions.
    """
    question_keys = request.get("question_keys", [])
    if not question_keys:
        return {"configs": []}
    
    configs = await esg_questionnaire_service.get_question_configs_batch(question_keys)
    return {"configs": configs}



@router.patch("/configs/{question_key}")
async def update_question_config(
    question_key: str,
    update: QuestionConfigUpdate,
    current_user: dict = Depends(get_admin_user)
):
    """
    Update a question config. Admin only.
    """
    result = await esg_questionnaire_service.update_question_config(question_key, update)
    if not result:
        raise HTTPException(status_code=404, detail="Question config not found")
    return {"message": "Question config updated", "config": result}


@router.delete("/configs/{question_key}")
async def delete_question_config(
    question_key: str,
    current_user: dict = Depends(get_admin_user)
):
    """
    Delete a question config. Admin only.
    """
    deleted = await esg_questionnaire_service.delete_question_config(question_key)
    if not deleted:
        raise HTTPException(status_code=404, detail="Question config not found")
    return {"message": "Question config deleted"}


# =============================================================================
# GRI Disclosure Endpoints
# =============================================================================

@router.get("/gri/{section}")
async def get_gri_disclosures(
    section: str,
    reporting_period: str = Query(..., description="Reporting period e.g. 'FY 2024-2025'"),
    filter_by_materiality: bool = Query(False, description="Only show disclosures for material topics"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get GRI disclosures with responses for a section.
    Returns questions grouped by disclosure with completion status.
    Also includes pending submission status for the current user.
    
    Role-based behavior:
    - Admin/Super Admin: See ALL questions in the section
    - Regular User: See ONLY questions they are assigned to
    
    If filter_by_materiality=True, only returns disclosures for topics marked as material
    in the organization's materiality assessment.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    user_id = current_user.get("id")
    user_role = current_user.get("role", "user")
    is_admin = user_role in ["admin", "super_admin"]
    
    result = await esg_questionnaire_service.get_gri_disclosures(
        org_id=org_id,
        section=section,
        reporting_period=reporting_period,
        user_id=user_id,
        filter_by_assignment=not is_admin,  # Regular users only see assigned questions
        filter_by_materiality=filter_by_materiality,
    )
    
    return result


@router.post("/response")
async def save_gri_response(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Save a single GRI/BRSR disclosure response.
    Expects: { question_key, value, reporting_period, status? }
    status: "draft" (saves as draft, shown as pending) or "saved" (final save)
    
    Access control:
    - Admins can save any response
    - Non-admins can save responses for questions they are assigned to
    
    Implements "last save wins" logic:
    - If no approval workflow OR no approver assigned to question:
      - Latest save overwrites previous value
      - Other users' drafts are cleared
    - If approval workflow ON and approver assigned:
      - Submission goes to approval queue for approver review
    """
    org_id = current_user.get("organization_id")
    user_id = current_user.get("id")
    user_role = current_user.get("role", "user")
    is_admin = user_role in ["admin", "super_admin"]
    
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    question_key = data.get("question_key")
    value = data.get("value")
    reporting_period = data.get("reporting_period")
    status = data.get("status", "saved")  # Default to saved
    
    if status not in ["draft", "saved"]:
        raise HTTPException(status_code=400, detail="status must be 'draft' or 'saved'")
    
    if not question_key or not reporting_period:
        raise HTTPException(status_code=400, detail="question_key and reporting_period are required")
    
    # For non-admins, verify they have assignment access to this question
    if not is_admin:
        from shared.database.mongo import db
        
        # Get assignment IDs for this user via V2 architecture
        assignee_records = await db.esg_assignment_assignees.find(
            {
                "user_id": user_id,
                "organization_id": org_id,
                "$or": [{"removed_at": None}, {"removed_at": {"$exists": False}}],
            },
            {"_id": 0, "assignment_id": 1}
        ).to_list(500)
        
        assignment_ids = [a["assignment_id"] for a in assignee_records]
        
        # Check if user is assigned to this question
        has_access = False
        if assignment_ids:
            assignment = await db.esg_assignments.find_one({
                "id": {"$in": assignment_ids},
                "entity_type": {"$in": ["question", "disclosure"]},
                "$or": [
                    {"entity_id": question_key},
                    {"question_key": question_key},
                ]
            })
            has_access = assignment is not None
        
        if not has_access:
            raise HTTPException(
                status_code=403,
                detail=f"You are not assigned to question '{question_key}'"
            )
    
    # Determine the actual status that will be saved
    # Empty values should be marked as "pending", not "saved" or "draft"
    value_is_empty = value is None or (isinstance(value, str) and value.strip() == "")
    actual_status = "pending" if value_is_empty else status
    
    result = await esg_questionnaire_service.save_gri_response(
        org_id=org_id,
        question_key=question_key,
        value=value,
        reporting_period=reporting_period,
        changed_by_user_id=current_user.get("id"),
        changed_by_user_name=current_user.get("full_name") or current_user.get("name") or current_user.get("email"),
        changed_by_user_email=current_user.get("email"),
        status=status
    )
    
    # Handle submitted for approval response
    if result.get("submitted_for_approval"):
        return {
            "message": result.get("message", "Submitted for approval"),
            "question_key": question_key,
            "status": "pending_approval",
            "submitted_for_approval": True,
            "submission_id": result.get("submission_id"),
            "success": True,
            "drafts_cleared": 0
        }
    
    # Return the actual status from the service (last save wins)
    final_status = result.get("status", actual_status)
    
    if final_status == "pending":
        message = "Response cleared (pending)"
    elif final_status == "draft":
        message = "Response saved as draft"
    else:
        message = "Response saved"
    
    return {
        "message": message,
        "question_key": question_key,
        "status": final_status,
        "submitted_for_approval": False,
        "success": result.get("success", True),
        "drafts_cleared": result.get("drafts_cleared", 0)
    }


# =============================================================================
# Submission Management Endpoints (Phase 2: Approval Queue)
# =============================================================================

@router.get("/submissions/pending")
async def get_pending_submissions(
    reporting_period: Optional[str] = Query(None, description="Filter by reporting period"),
    section: Optional[str] = Query(None, description="Filter by section (environment, social, governance)"),
    current_user: dict = Depends(get_approver_user)
):
    """
    Get all pending submissions for the organization.
    Used by approvers to see their approval queue.
    
    - Admins see all pending submissions for their org
    - Regular users see submissions where they are assigned as approver
    """
    org_id = current_user.get("organization_id")
    user_id = current_user.get("id")
    role = current_user.get("role", "user")
    
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    # For admins, get all submissions; for users, filter by approver assignment
    approver_user_id = None if role in ["admin", "super_admin"] else user_id
    
    submissions = await esg_questionnaire_service.get_all_pending_submissions_for_org(
        org_id=org_id,
        reporting_period=reporting_period,
        section=section,
        approver_user_id=approver_user_id,
    )
    
    return {
        "submissions": submissions,
        "total": len(submissions),
        "filters": {
            "reporting_period": reporting_period,
            "section": section,
        }
    }


@router.get("/submissions/count")
async def get_pending_submissions_count(
    current_user: dict = Depends(get_approver_user)
):
    """
    Get count of pending submissions for the current user.
    Used for sidebar badge.
    """
    org_id = current_user.get("organization_id")
    user_id = current_user.get("id")
    role = current_user.get("role", "user")
    
    if not org_id:
        return {"count": 0}
    
    # For admins, get all submissions; for users, filter by approver assignment
    approver_user_id = None if role in ["admin", "super_admin"] else user_id
    
    submissions = await esg_questionnaire_service.get_all_pending_submissions_for_org(
        org_id=org_id,
        approver_user_id=approver_user_id,
    )
    
    total = sum(len(s.get("submissions", [])) for s in submissions)
    return {"count": total}


@router.get("/submissions/{question_key}")
async def get_question_submissions(
    question_key: str,
    reporting_period: str = Query(..., description="Reporting period"),
    current_user: dict = Depends(get_approver_user)
):
    """
    Get all pending submissions for a specific question.
    Used by approvers to compare submissions and select/merge.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    submissions = await esg_questionnaire_service.get_pending_submissions(
        org_id=org_id,
        question_key=question_key,
        reporting_period=reporting_period,
    )
    
    return {
        "question_key": question_key,
        "reporting_period": reporting_period,
        "submissions": submissions,
        "total": len(submissions)
    }


@router.get("/submissions/status/{question_key}")
async def get_user_submission_status(
    question_key: str,
    reporting_period: str = Query(..., description="Reporting period"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get the current user's submission status for a question.
    Shows if user has a pending/approved/rejected submission.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    submission = await esg_questionnaire_service.get_user_submission_status(
        org_id=org_id,
        question_key=question_key,
        reporting_period=reporting_period,
        user_id=current_user.get("id"),
    )
    
    return {
        "question_key": question_key,
        "has_submission": submission is not None,
        "submission": submission,
    }


@router.post("/submissions/approve")
async def approve_submission(
    data: dict,
    current_user: dict = Depends(get_approver_user)
):
    """
    Approve a submission and save to final esg_responses.
    
    Expects: {
        submission_id: "uuid",
        merged_value: "optional - use this instead of submission value"
    }
    
    If merged_value is provided, the approver has edited/merged the content.
    All other pending submissions for the same question are superseded.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    submission_id = data.get("submission_id")
    merged_value = data.get("merged_value")
    
    if not submission_id:
        raise HTTPException(status_code=400, detail="submission_id is required")
    
    result = await esg_questionnaire_service.approve_submission(
        org_id=org_id,
        submission_id=submission_id,
        approver_user_id=current_user.get("id"),
        approver_user_name=current_user.get("full_name") or current_user.get("name") or current_user.get("email"),
        approver_user_email=current_user.get("email"),
        merged_value=merged_value,
    )
    
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("message"))
    
    return result


@router.post("/submissions/reject/{submission_id}")
async def reject_submission(
    submission_id: str,
    data: dict = None,
    current_user: dict = Depends(get_approver_user)
):
    """
    Reject a specific submission.
    The user can revise and resubmit.
    
    Expects: { rejection_reason: "optional reason" }
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    data = data or {}
    rejection_reason = data.get("rejection_reason")
    
    result = await esg_questionnaire_service.reject_submission(
        org_id=org_id,
        submission_id=submission_id,
        rejector_user_id=current_user.get("id"),
        rejector_user_name=current_user.get("full_name") or current_user.get("name") or current_user.get("email"),
        rejector_user_email=current_user.get("email"),
        rejection_reason=rejection_reason,
    )
    
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("message"))
    
    return result


@router.get("/history/{question_key}")
async def get_question_history(
    question_key: str,
    reporting_period: str = Query(..., description="Reporting period (e.g., FY 2025-26)"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get version history for a specific question.
    Returns all changes, assignments, and approvals.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    history = await esg_questionnaire_service.get_question_history(
        org_id=org_id,
        question_key=question_key,
        reporting_period=reporting_period
    )
    
    return {
        "question_key": question_key,
        "reporting_period": reporting_period,
        "history": history,
        "total": len(history)
    }


# =============================================================================
# Draft Management Endpoints (Per-User Drafts)
# =============================================================================

@router.post("/draft")
async def save_draft(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Save a user's draft for a disclosure.
    
    Expects: {
        framework_id: "gri",
        disclosure_id: "101-2",
        reporting_period: "CY 2026",
        draft_data: { "gri_101_2_a_i": "value", "gri_101_2_a_ii": "value", ... },
        draft_status: "editing" | "draft" | "submitted",
        assignment_id: "optional-uuid"
    }
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    framework_id = data.get("framework_id")
    disclosure_id = data.get("disclosure_id")
    reporting_period = data.get("reporting_period")
    draft_data = data.get("draft_data", {})
    draft_status = data.get("draft_status", "draft")
    assignment_id = data.get("assignment_id")
    
    if not framework_id or not disclosure_id or not reporting_period:
        raise HTTPException(
            status_code=400, 
            detail="framework_id, disclosure_id, and reporting_period are required"
        )
    
    if draft_status not in ["editing", "draft", "submitted"]:
        raise HTTPException(
            status_code=400, 
            detail="draft_status must be 'editing', 'draft', or 'submitted'"
        )
    
    result = await esg_questionnaire_service.save_user_draft(
        org_id=org_id,
        framework_id=framework_id,
        disclosure_id=disclosure_id,
        reporting_period=reporting_period,
        user_id=current_user.get("id"),
        user_name=current_user.get("full_name") or current_user.get("name") or current_user.get("email"),
        user_email=current_user.get("email"),
        draft_data=draft_data,
        draft_status=draft_status,
        assignment_id=assignment_id,
    )
    
    return {
        "message": f"Draft saved ({draft_status})",
        "draft": result
    }


@router.get("/draft/{framework_id}/{disclosure_id}")
async def get_draft(
    framework_id: str,
    disclosure_id: str,
    reporting_period: str = Query(..., description="Reporting period"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get the current user's latest draft for a disclosure.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    draft = await esg_questionnaire_service.get_user_draft(
        org_id=org_id,
        framework_id=framework_id,
        disclosure_id=disclosure_id,
        reporting_period=reporting_period,
        user_id=current_user.get("id"),
    )
    
    return {
        "draft": draft,
        "has_draft": draft is not None
    }


@router.delete("/draft/{question_key}")
async def discard_draft(
    question_key: str,
    reporting_period: str = Query(..., description="Reporting period"),
    current_user: dict = Depends(get_current_user)
):
    """
    Discard the current user's draft for a specific question.
    Allows user to revert to the saved answer.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    result = await esg_questionnaire_service.discard_user_draft(
        org_id=org_id,
        question_key=question_key,
        reporting_period=reporting_period,
        user_id=current_user.get("id"),
    )
    
    return {
        "message": "Draft discarded",
        "success": result
    }


@router.get("/drafts/{framework_id}/{section}")
async def get_user_drafts_for_section(
    framework_id: str,
    section: str,
    reporting_period: str = Query(..., description="Reporting period"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get all of the current user's drafts for a section.
    Returns drafts keyed by disclosure_id for easy lookup.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    drafts = await esg_questionnaire_service.get_user_drafts_for_section(
        org_id=org_id,
        framework_id=framework_id,
        section=section,
        reporting_period=reporting_period,
        user_id=current_user.get("id"),
    )
    
    # Key by disclosure_id for easier frontend lookup
    drafts_by_disclosure = {d["disclosure_id"]: d for d in drafts}
    
    return {
        "drafts": drafts_by_disclosure,
        "total": len(drafts)
    }


@router.get("/drafts/all/{framework_id}/{disclosure_id}")
async def get_all_drafts_for_disclosure(
    framework_id: str,
    disclosure_id: str,
    reporting_period: str = Query(..., description="Reporting period"),
    current_user: dict = Depends(get_admin_user)  # Admin only
):
    """
    Get all users' drafts for a disclosure (admin only).
    Used for reviewing/approving drafts.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    drafts = await esg_questionnaire_service.get_all_drafts_for_disclosure(
        org_id=org_id,
        framework_id=framework_id,
        disclosure_id=disclosure_id,
        reporting_period=reporting_period,
    )
    
    return {
        "disclosure_id": disclosure_id,
        "drafts": drafts,
        "total": len(drafts)
    }


@router.post("/draft/submit")
async def submit_draft_for_approval(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Submit a draft for approval.
    Changes status from 'draft' to 'submitted'.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    framework_id = data.get("framework_id")
    disclosure_id = data.get("disclosure_id")
    reporting_period = data.get("reporting_period")
    
    if not framework_id or not disclosure_id or not reporting_period:
        raise HTTPException(
            status_code=400, 
            detail="framework_id, disclosure_id, and reporting_period are required"
        )
    
    result = await esg_questionnaire_service.submit_draft_for_approval(
        org_id=org_id,
        framework_id=framework_id,
        disclosure_id=disclosure_id,
        reporting_period=reporting_period,
        user_id=current_user.get("id"),
        user_name=current_user.get("full_name") or current_user.get("name") or current_user.get("email"),
        user_email=current_user.get("email"),
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="No draft found to submit")
    
    return {
        "message": "Draft submitted for approval",
        "draft": result
    }


@router.post("/draft/approve")
async def approve_draft(
    data: dict,
    current_user: dict = Depends(get_admin_user)  # Admin only
):
    """
    Approve a submitted draft (admin only).
    Saves the draft data to final esg_responses.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    framework_id = data.get("framework_id")
    disclosure_id = data.get("disclosure_id")
    reporting_period = data.get("reporting_period")
    draft_user_id = data.get("draft_user_id")
    
    if not all([framework_id, disclosure_id, reporting_period, draft_user_id]):
        raise HTTPException(
            status_code=400, 
            detail="framework_id, disclosure_id, reporting_period, and draft_user_id are required"
        )
    
    success = await esg_questionnaire_service.approve_draft(
        org_id=org_id,
        framework_id=framework_id,
        disclosure_id=disclosure_id,
        reporting_period=reporting_period,
        draft_user_id=draft_user_id,
        approver_user_id=current_user.get("id"),
        approver_name=current_user.get("full_name") or current_user.get("name") or current_user.get("email"),
        approver_email=current_user.get("email"),
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="No submitted draft found to approve")
    
    return {"message": "Draft approved and saved to final responses"}


@router.post("/draft/reject")
async def reject_draft(
    data: dict,
    current_user: dict = Depends(get_admin_user)  # Admin only
):
    """
    Reject a submitted draft (admin only).
    Returns it to 'draft' status for revision.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    framework_id = data.get("framework_id")
    disclosure_id = data.get("disclosure_id")
    reporting_period = data.get("reporting_period")
    draft_user_id = data.get("draft_user_id")
    rejection_reason = data.get("rejection_reason")
    
    if not all([framework_id, disclosure_id, reporting_period, draft_user_id]):
        raise HTTPException(
            status_code=400, 
            detail="framework_id, disclosure_id, reporting_period, and draft_user_id are required"
        )
    
    success = await esg_questionnaire_service.reject_draft(
        org_id=org_id,
        framework_id=framework_id,
        disclosure_id=disclosure_id,
        reporting_period=reporting_period,
        draft_user_id=draft_user_id,
        rejector_user_id=current_user.get("id"),
        rejector_name=current_user.get("full_name") or current_user.get("name") or current_user.get("email"),
        rejector_email=current_user.get("email"),
        rejection_reason=rejection_reason,
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="No submitted draft found to reject")
    
    return {"message": "Draft rejected and returned for revision"}


@router.get("/draft/history/{framework_id}/{disclosure_id}")
async def get_draft_history(
    framework_id: str,
    disclosure_id: str,
    reporting_period: str = Query(..., description="Reporting period"),
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get draft history for a disclosure.
    Shows all versions of drafts (optionally filtered by user).
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    # If not admin and user_id is provided and doesn't match current user, deny
    if user_id and user_id != current_user.get("id") and current_user.get("role") not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Cannot view other users' draft history")
    
    history = await esg_questionnaire_service.get_draft_history(
        org_id=org_id,
        framework_id=framework_id,
        disclosure_id=disclosure_id,
        reporting_period=reporting_period,
        user_id=user_id,
    )
    
    return {
        "disclosure_id": disclosure_id,
        "history": history,
        "total": len(history)
    }


# =============================================================================
# Response Endpoints
# =============================================================================

@router.get("/responses/{framework}/{section}/{reporting_year}")
async def get_responses(
    framework: str,
    section: str,
    reporting_year: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get ESG responses for org+framework+section+year.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    responses = await esg_questionnaire_service.get_responses(
        org_id=org_id,
        framework=framework,
        reporting_year=reporting_year,
        section=section
    )
    
    return {
        "org_id": org_id,
        "framework": framework,
        "section": section,
        "reporting_year": reporting_year,
        "responses": responses.get("responses", {}) if responses else {},
        "created_at": responses.get("created_at") if responses else None,
        "updated_at": responses.get("updated_at") if responses else None,
    }


@router.put("/responses/{framework}/{section}/{reporting_year}")
async def save_responses(
    framework: str,
    section: str,
    reporting_year: str,
    data: ESGResponseCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Save ESG responses for org+framework+section+year.
    
    Access control:
    - Admins can save any response
    - Non-admins can save responses for questions they are assigned to
      (if no approval is required, saves directly; otherwise submits for approval)
    """
    org_id = current_user.get("organization_id")
    user_id = current_user.get("id")
    user_role = current_user.get("role", "user")
    is_admin = user_role in ["admin", "super_admin"]
    
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    # For non-admins, verify they have assignment access to the questions being saved
    if not is_admin and data.responses:
        # Get user's assigned question keys via V2 architecture
        from shared.database.mongo import db
        
        # Get assignment IDs for this user
        assignee_records = await db.esg_assignment_assignees.find(
            {
                "user_id": user_id,
                "organization_id": org_id,
                "$or": [{"removed_at": None}, {"removed_at": {"$exists": False}}],
            },
            {"_id": 0, "assignment_id": 1}
        ).to_list(500)
        
        assignment_ids = [a["assignment_id"] for a in assignee_records]
        
        # Get the actual assignments to find question keys
        assigned_question_keys = set()
        if assignment_ids:
            assignments = await db.esg_assignments.find(
                {
                    "id": {"$in": assignment_ids},
                    "entity_type": {"$in": ["question", "disclosure"]},
                },
                {"_id": 0, "entity_id": 1, "question_key": 1}
            ).to_list(500)
            
            for a in assignments:
                key = a.get("question_key") or a.get("entity_id")
                if key:
                    assigned_question_keys.add(key)
        
        # Check if user is trying to save questions they're not assigned to
        for question_key in data.responses.keys():
            if question_key not in assigned_question_keys:
                raise HTTPException(
                    status_code=403, 
                    detail=f"You are not assigned to question '{question_key}'"
                )
    
    result = await esg_questionnaire_service.save_responses(
        org_id=org_id,
        framework=framework,
        reporting_year=reporting_year,
        section=section,
        data=data,
        changed_by_user_id=user_id,
    )
    
    return {
        "message": f"Responses saved for {framework}/{section}/{reporting_year}",
        "org_id": org_id,
        "framework": framework,
        "section": section,
        "reporting_year": reporting_year,
        "responses": result.get("responses", {}) if result else data.responses,
    }


@router.get("/responses/{framework}/{section}/{reporting_year}/summary")
async def get_response_summary(
    framework: str,
    section: str,
    reporting_year: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get completion summary for a section.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    summary = await esg_questionnaire_service.get_response_summary(
        org_id=org_id,
        framework=framework,
        reporting_year=reporting_year,
        section=section
    )
    return summary


@router.get("/responses/{framework}/{section}/years")
async def list_available_years(
    framework: str,
    section: str,
    current_user: dict = Depends(get_current_user)
):
    """
    List reporting years with responses for org+framework+section.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    years = await esg_questionnaire_service.list_available_years(
        org_id=org_id,
        framework=framework,
        section=section
    )
    return {"years": years}


@router.get("/responses/{framework}/{section}/{reporting_year}/statuses")
async def get_question_statuses(
    framework: str,
    section: str,
    reporting_year: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get approval status and version history for all questions in a section.
    Used by BRSR reporting UI to show per-question status badges.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    statuses = await esg_questionnaire_service.get_question_statuses(
        org_id=org_id,
        framework=framework,
        section=section,
        reporting_year=reporting_year
    )
    return statuses



@router.get("/responses/{framework}/{section}/{reporting_year}/historical")
async def get_historical_data(
    framework: str,
    section: str,
    reporting_year: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get historical (previous FY) data for autofill.
    
    This endpoint fetches the previous reporting year's responses 
    to enable dynamic historical autofill in the frontend without 
    storing historical snapshots in the current year's document.
    
    Example: If reporting_year is "2025-26", returns data from "2024-25".
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    historical_data = await esg_questionnaire_service.get_historical_data(
        org_id=org_id,
        framework=framework,
        section=section,
        current_reporting_year=reporting_year
    )
    
    return {
        "org_id": org_id,
        "framework": framework,
        "section": section,
        **historical_data
    }


@router.get("/responses/{framework}/{section}/{reporting_year}/multi-year")
async def get_multi_year_responses(
    framework: str,
    section: str,
    reporting_year: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get current year + previous year + next year responses in a single call.
    
    This supports the normalized 1-doc-per-year data model by:
    1. Fetching current year's document
    2. Fetching previous year's document (for Previous FY column)
    3. Fetching next year's document (for backward fill if data was entered there)
    
    The frontend uses this to:
    - Display Current FY values from current_year_data
    - Display Previous FY values from previous_year_data
    - Backfill Current FY from next_year's previous_fy data if needed
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    result = await esg_questionnaire_service.get_multi_year_responses(
        org_id=org_id,
        framework=framework,
        section=section,
        reporting_year=reporting_year
    )
    
    return {
        "org_id": org_id,
        "framework": framework,
        "section": section,
        **result
    }


# =============================================================================
# Helper Endpoints
# =============================================================================

@router.get("/ngrbc-principles")
async def get_ngrbc_principles(
    current_user: dict = Depends(get_current_user)
):
    """
    Get list of NGRBC principles (P1-P9).
    """
    return {
        "principles": NGRBC_PRINCIPLES,
        "description": "National Guidelines on Responsible Business Conduct"
    }
