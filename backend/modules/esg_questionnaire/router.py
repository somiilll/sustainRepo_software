"""
ESG Questionnaire Router

API endpoints for config-driven ESG questionnaire system.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from modules.auth.dependencies import get_current_user, get_admin_user
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
    """
    configs = await esg_questionnaire_service.list_question_configs(
        framework=framework,
        section=section
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
    """
    config = await esg_questionnaire_service.get_question_config(question_key)
    if not config:
        raise HTTPException(status_code=404, detail="Question config not found")
    return config


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
    current_user: dict = Depends(get_current_user)
):
    """
    Get GRI disclosures with responses for a section.
    Returns questions grouped by disclosure with completion status.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    result = await esg_questionnaire_service.get_gri_disclosures(
        org_id=org_id,
        section=section,
        reporting_period=reporting_period
    )
    
    return result


@router.post("/response")
async def save_gri_response(
    data: dict,
    current_user: dict = Depends(get_admin_user)
):
    """
    Save a single GRI disclosure response.
    Expects: { question_key, value, reporting_period, status? }
    status: "draft" (saves as draft, shown as pending) or "saved" (final save)
    """
    org_id = current_user.get("organization_id")
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
    
    return {
        "message": f"Response {'saved as draft' if status == 'draft' else 'saved'}",
        "question_key": question_key,
        "status": status,
        "success": result
    }


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
    current_user: dict = Depends(get_admin_user)
):
    """
    Save ESG responses for org+framework+section+year. Admin only.
    Automatically tracks version history for each question.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    result = await esg_questionnaire_service.save_responses(
        org_id=org_id,
        framework=framework,
        reporting_year=reporting_year,
        section=section,
        data=data,
        changed_by_user_id=current_user.get("id"),
    )
    
    return {
        "message": f"Responses saved for {framework}/{section}/{reporting_year}",
        "org_id": org_id,
        "framework": framework,
        "section": section,
        "reporting_year": reporting_year,
        "responses": result.get("responses", {}),
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
