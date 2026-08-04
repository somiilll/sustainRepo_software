"""
Framework Details Router

API endpoints for managing framework-specific organization details.
Supports hybrid structure:
- Static data: /api/organizations/my/framework-details/brsr
- Yearly data: /api/organizations/my/framework-details/brsr/yearly/{year}
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query

from modules.auth.dependencies import get_current_user, get_admin_user
from modules.framework_details.contracts import (
    BRSRDetailsCreate,
    BRSRDetailsUpdate,
    BRSRYearlyDataCreate,
    BRSRYearlyDataUpdate,
    VALID_FRAMEWORKS,
)
from modules.framework_details.service import framework_details_service
from shared.database.mongo import db

router = APIRouter(prefix="/organizations", tags=["Framework Details"])


async def _verify_brsr_enabled(org_id: str):
    """Verify BRSR is enabled for the organization."""
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    enabled_frameworks = org.get("esg_frameworks_enabled", [])
    if "BRSR" not in enabled_frameworks:
        raise HTTPException(
            status_code=400,
            detail="BRSR framework is not enabled for this organization"
        )
    return org


# =============================================================================
# Static BRSR Details Endpoints
# =============================================================================

@router.get("/my/framework-details/brsr")
async def get_my_brsr_details(
    reporting_period: str = Query(default="", description="Reporting period (e.g., FY 2025-2026)"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get BRSR static details for the current user's organization.
    Available to all authenticated users (admin and user roles).
    Optionally filter by reporting_period for year-specific data.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    await _verify_brsr_enabled(org_id)
    
    details = await framework_details_service.get(org_id, "BRSR", reporting_period)
    if not details:
        return {
            "org_id": org_id,
            "framework": "BRSR",
            "details": None,
            "is_complete": False,
            "reporting_period": reporting_period
        }
    
    is_complete, missing = await framework_details_service.validate_brsr_complete(org_id)
    
    return {
        "org_id": org_id,
        "framework": "BRSR",
        "details": details,
        "is_complete": is_complete,
        "missing_fields": missing if not is_complete else [],
        "reporting_period": reporting_period
    }


@router.put("/my/framework-details/brsr")
async def update_my_brsr_details(
    details: BRSRDetailsCreate,
    current_user: dict = Depends(get_admin_user)
):
    """
    Create or update BRSR static details for the current user's organization.
    Admin only.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    await _verify_brsr_enabled(org_id)
    
    try:
        result = await framework_details_service.create_or_update_brsr(org_id, details)
        is_complete, missing = await framework_details_service.validate_brsr_complete(org_id)
        
        return {
            "message": "BRSR details saved successfully",
            "org_id": org_id,
            "framework": "BRSR",
            "details": result,
            "is_complete": is_complete,
            "missing_fields": missing if not is_complete else []
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/my/framework-details/brsr")
async def partial_update_my_brsr_details(
    update: BRSRDetailsUpdate,
    current_user: dict = Depends(get_admin_user)
):
    """
    Partial update BRSR static details for the current user's organization.
    Admin only. Only updates provided fields.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    await _verify_brsr_enabled(org_id)
    
    result = await framework_details_service.update_brsr(org_id, update)
    if not result:
        raise HTTPException(
            status_code=404,
            detail="BRSR details not found. Use PUT to create new details."
        )
    
    is_complete, missing = await framework_details_service.validate_brsr_complete(org_id)
    
    return {
        "message": "BRSR details updated successfully",
        "org_id": org_id,
        "framework": "BRSR",
        "details": result,
        "is_complete": is_complete,
        "missing_fields": missing if not is_complete else []
    }


@router.get("/my/framework-details/brsr/validate")
async def validate_my_brsr_details(
    current_user: dict = Depends(get_current_user)
):
    """
    Validate BRSR static details completeness.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    await _verify_brsr_enabled(org_id)
    
    is_complete, missing = await framework_details_service.validate_brsr_complete(org_id)
    
    return {
        "org_id": org_id,
        "framework": "BRSR",
        "is_complete": is_complete,
        "missing_fields": missing
    }


# =============================================================================
# Yearly BRSR Data Endpoints
# =============================================================================

@router.get("/my/framework-details/brsr/yearly")
async def list_my_brsr_yearly_data(
    current_user: dict = Depends(get_current_user)
):
    """
    List all yearly BRSR data records for the current user's organization.
    Returns list of reporting years with data.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    await _verify_brsr_enabled(org_id)
    
    years = await framework_details_service.get_available_years(org_id, "BRSR")
    yearly_data = await framework_details_service.list_yearly(org_id, "BRSR")
    
    return {
        "org_id": org_id,
        "framework": "BRSR",
        "available_years": years,
        "yearly_data": yearly_data
    }


@router.get("/my/framework-details/brsr/yearly/{reporting_year}")
async def get_my_brsr_yearly_data(
    reporting_year: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get BRSR yearly data for a specific reporting year.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    await _verify_brsr_enabled(org_id)
    
    data = await framework_details_service.get_yearly(org_id, "BRSR", reporting_year)
    if not data:
        return {
            "org_id": org_id,
            "framework": "BRSR",
            "reporting_year": reporting_year,
            "data": None,
            "is_complete": False
        }
    
    is_complete, missing = await framework_details_service.validate_yearly_brsr_complete(
        org_id, reporting_year
    )
    
    return {
        "org_id": org_id,
        "framework": "BRSR",
        "reporting_year": reporting_year,
        "data": data,
        "is_complete": is_complete,
        "missing_fields": missing if not is_complete else []
    }


@router.put("/my/framework-details/brsr/yearly/{reporting_year}")
async def update_my_brsr_yearly_data(
    reporting_year: str,
    data: BRSRYearlyDataCreate,
    current_user: dict = Depends(get_admin_user)
):
    """
    Create or update BRSR yearly data for a specific reporting year.
    Admin only.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    await _verify_brsr_enabled(org_id)
    
    try:
        result = await framework_details_service.create_or_update_yearly_brsr(
            org_id, reporting_year, data
        )
        is_complete, missing = await framework_details_service.validate_yearly_brsr_complete(
            org_id, reporting_year
        )
        
        return {
            "message": f"BRSR yearly data for {reporting_year} saved successfully",
            "org_id": org_id,
            "framework": "BRSR",
            "reporting_year": reporting_year,
            "data": result,
            "is_complete": is_complete,
            "missing_fields": missing if not is_complete else []
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/my/framework-details/brsr/yearly/{reporting_year}")
async def partial_update_my_brsr_yearly_data(
    reporting_year: str,
    update: BRSRYearlyDataUpdate,
    current_user: dict = Depends(get_admin_user)
):
    """
    Partial update BRSR yearly data for a specific reporting year.
    Admin only.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    await _verify_brsr_enabled(org_id)
    
    result = await framework_details_service.update_yearly_brsr(org_id, reporting_year, update)
    if not result:
        raise HTTPException(
            status_code=404,
            detail=f"No yearly data found for {reporting_year}. Use PUT to create new data."
        )
    
    is_complete, missing = await framework_details_service.validate_yearly_brsr_complete(
        org_id, reporting_year
    )
    
    return {
        "message": f"BRSR yearly data for {reporting_year} updated successfully",
        "org_id": org_id,
        "framework": "BRSR",
        "reporting_year": reporting_year,
        "data": result,
        "is_complete": is_complete,
        "missing_fields": missing if not is_complete else []
    }


@router.delete("/my/framework-details/brsr/yearly/{reporting_year}")
async def delete_my_brsr_yearly_data(
    reporting_year: str,
    current_user: dict = Depends(get_admin_user)
):
    """
    Delete BRSR yearly data for a specific reporting year.
    Admin only.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    await _verify_brsr_enabled(org_id)
    
    deleted = await framework_details_service.delete_yearly(org_id, "BRSR", reporting_year)
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail=f"No yearly data found for {reporting_year}"
        )
    
    return {
        "message": f"BRSR yearly data for {reporting_year} deleted successfully",
        "org_id": org_id,
        "framework": "BRSR",
        "reporting_year": reporting_year
    }


@router.get("/my/framework-details/brsr/yearly/{reporting_year}/validate")
async def validate_my_brsr_yearly_data(
    reporting_year: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Validate BRSR yearly data completeness for a specific reporting year.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    await _verify_brsr_enabled(org_id)
    
    is_complete, missing = await framework_details_service.validate_yearly_brsr_complete(
        org_id, reporting_year
    )
    
    return {
        "org_id": org_id,
        "framework": "BRSR",
        "reporting_year": reporting_year,
        "is_complete": is_complete,
        "missing_fields": missing
    }


# =============================================================================
# Generic Framework Details Endpoints
# =============================================================================

@router.get("/my/framework-details")
async def list_my_framework_details(
    current_user: dict = Depends(get_current_user)
):
    """
    List all framework details for the current user's organization.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    # Get org's enabled frameworks
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    enabled_frameworks = org.get("esg_frameworks_enabled", []) if org else []
    
    # Get existing static details
    static_details = await framework_details_service.list_for_org(org_id)
    
    # Get yearly data summary
    yearly_summary = {}
    for framework in enabled_frameworks:
        years = await framework_details_service.get_available_years(org_id, framework)
        yearly_summary[framework] = years
    
    return {
        "org_id": org_id,
        "enabled_frameworks": enabled_frameworks,
        "framework_details": static_details,
        "yearly_data_years": yearly_summary
    }
