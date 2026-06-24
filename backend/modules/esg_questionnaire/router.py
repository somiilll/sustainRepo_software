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
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    result = await esg_questionnaire_service.save_responses(
        org_id=org_id,
        framework=framework,
        reporting_year=reporting_year,
        section=section,
        data=data
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
