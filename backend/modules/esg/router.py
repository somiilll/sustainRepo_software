"""
ESG Configuration Router

API endpoints for managing organization-level ESG configurations.
Super Admin only access.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException

from modules.auth.dependencies import get_super_admin_user
from modules.esg.contracts import (
    ESGOrgConfigCreate,
    ESGOrgConfigUpdate,
    ESGOrgConfigResponse,
)
from modules.esg.service import esg_config_service
from shared.database.mongo import db

router = APIRouter(prefix="/esg", tags=["ESG Configuration"])


@router.get("/org-config/{org_id}", response_model=ESGOrgConfigResponse)
async def get_org_esg_config(
    org_id: str,
    current_user: dict = Depends(get_super_admin_user)
):
    """
    Get ESG configuration for an organization.
    Super Admin only.
    """
    # Verify organization exists
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    config = await esg_config_service.get_by_org_id(org_id)
    if not config:
        raise HTTPException(status_code=404, detail="ESG configuration not found for this organization")

    return ESGOrgConfigResponse(**config)


@router.post("/org-config", response_model=ESGOrgConfigResponse, status_code=201)
async def create_org_esg_config(
    config: ESGOrgConfigCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    """
    Create ESG configuration for an organization.
    Super Admin only.
    """
    # Verify organization exists
    org = await db.organizations.find_one({"id": config.org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    try:
        created = await esg_config_service.create(config)
        return ESGOrgConfigResponse(**created)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/org-config/{org_id}", response_model=ESGOrgConfigResponse)
async def update_org_esg_config(
    org_id: str,
    update: ESGOrgConfigUpdate,
    current_user: dict = Depends(get_super_admin_user)
):
    """
    Update ESG configuration for an organization.
    Super Admin only.
    """
    try:
        updated = await esg_config_service.update(org_id, update)
        if not updated:
            raise HTTPException(status_code=404, detail="ESG configuration not found for this organization")
        return ESGOrgConfigResponse(**updated)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/org-config/{org_id}", status_code=204)
async def delete_org_esg_config(
    org_id: str,
    current_user: dict = Depends(get_super_admin_user)
):
    """
    Delete ESG configuration for an organization.
    Super Admin only.
    """
    deleted = await esg_config_service.delete(org_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="ESG configuration not found for this organization")
    return None


@router.get("/org-configs", response_model=List[ESGOrgConfigResponse])
async def list_all_esg_configs(
    current_user: dict = Depends(get_super_admin_user)
):
    """
    List all ESG configurations.
    Super Admin only.
    """
    configs = await esg_config_service.list_all()
    return [ESGOrgConfigResponse(**c) for c in configs]


@router.get("/org-config/{org_id}/frameworks", response_model=List[str])
async def get_enabled_frameworks(
    org_id: str,
    current_user: dict = Depends(get_super_admin_user)
):
    """
    Get enabled frameworks for an organization.
    Super Admin only.
    """
    frameworks = await esg_config_service.get_enabled_frameworks(org_id)
    return frameworks


@router.get("/org-config/{org_id}/modules", response_model=List[str])
async def get_enabled_modules(
    org_id: str,
    current_user: dict = Depends(get_super_admin_user)
):
    """
    Get enabled ESG modules for an organization.
    Super Admin only.
    """
    modules = await esg_config_service.get_enabled_modules(org_id)
    return modules
