"""
Framework Details Router

API endpoints for managing framework-specific organization details.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException

from modules.auth.dependencies import get_current_user, get_admin_user
from modules.framework_details.contracts import (
    BRSRDetailsCreate,
    BRSRDetailsUpdate,
    BRSRDetails,
    FrameworkDetailsResponse,
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


@router.get("/my/framework-details/brsr")
async def get_my_brsr_details(
    current_user: dict = Depends(get_current_user)
):
    """
    Get BRSR details for the current user's organization.
    Available to all authenticated users (admin and user roles).
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    await _verify_brsr_enabled(org_id)
    
    details = await framework_details_service.get(org_id, "BRSR")
    if not details:
        # Return empty structure if no details exist yet
        return {
            "org_id": org_id,
            "framework": "BRSR",
            "details": None,
            "is_complete": False
        }
    
    is_complete, missing = await framework_details_service.validate_brsr_complete(org_id)
    
    return {
        "org_id": org_id,
        "framework": "BRSR",
        "details": details,
        "is_complete": is_complete,
        "missing_fields": missing if not is_complete else []
    }


@router.put("/my/framework-details/brsr")
async def update_my_brsr_details(
    details: BRSRDetailsCreate,
    current_user: dict = Depends(get_admin_user)
):
    """
    Create or update BRSR details for the current user's organization.
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
    Partial update BRSR details for the current user's organization.
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
    Validate BRSR details completeness for the current user's organization.
    Returns list of missing/incomplete fields.
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
    
    # Get existing details
    details_list = await framework_details_service.list_for_org(org_id)
    
    return {
        "org_id": org_id,
        "enabled_frameworks": enabled_frameworks,
        "framework_details": details_list
    }
