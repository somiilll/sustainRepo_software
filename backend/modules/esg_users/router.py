"""
ESG Users Router

API endpoints for managing ESG platform users.
Uses the `users_esg` collection.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException

from modules.auth.dependencies import get_super_admin_user, get_admin_user
from modules.esg_users.contracts import (
    ESGUserCreate,
    ESGUserUpdate,
    ESGUserResponse,
)
from modules.esg_users.service import esg_user_service
from shared.database.mongo import db

router = APIRouter(prefix="/esg-users", tags=["ESG Users"])


@router.get("", response_model=List[ESGUserResponse])
async def list_esg_users(
    current_user: dict = Depends(get_super_admin_user)
):
    """
    List all ESG users.
    Super Admin only.
    """
    users = await esg_user_service.list_all()
    return [ESGUserResponse(**u) for u in users]


@router.get("/by-org/{org_id}", response_model=List[ESGUserResponse])
async def list_esg_users_by_org(
    org_id: str,
    current_user: dict = Depends(get_admin_user)
):
    """
    List ESG users in an organization.
    Admin can only see users in their own organization.
    Super Admin can see any organization.
    """
    if current_user["role"] != "super_admin":
        if current_user.get("organization_id") != org_id:
            raise HTTPException(
                status_code=403, 
                detail="Not authorized to view users from other organizations"
            )

    users = await esg_user_service.list_by_organization(org_id)
    return [ESGUserResponse(**u) for u in users]


@router.get("/{user_id}", response_model=ESGUserResponse)
async def get_esg_user(
    user_id: str,
    current_user: dict = Depends(get_admin_user)
):
    """
    Get a specific ESG user.
    """
    user = await esg_user_service.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Non-super-admin can only view users in their org
    if current_user["role"] != "super_admin":
        if user.get("organization_id") != current_user.get("organization_id"):
            raise HTTPException(
                status_code=403,
                detail="Not authorized to view users from other organizations"
            )

    return ESGUserResponse(**user)


@router.post("", response_model=ESGUserResponse, status_code=201)
async def create_esg_user(
    user_data: ESGUserCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    """
    Create a new ESG user.
    Super Admin only.
    """
    # Verify organization exists if provided
    if user_data.organization_id:
        org = await db.organizations.find_one({"id": user_data.organization_id}, {"_id": 0})
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")

    try:
        user = await esg_user_service.create(user_data)
        return ESGUserResponse(**user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{user_id}", response_model=ESGUserResponse)
async def update_esg_user(
    user_id: str,
    update: ESGUserUpdate,
    current_user: dict = Depends(get_super_admin_user)
):
    """
    Update an ESG user.
    Super Admin only.
    """
    # Verify organization exists if being updated
    if update.organization_id:
        org = await db.organizations.find_one({"id": update.organization_id}, {"_id": 0})
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")

    user = await esg_user_service.update(user_id, update)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return ESGUserResponse(**user)


@router.delete("/{user_id}", status_code=204)
async def delete_esg_user(
    user_id: str,
    soft: bool = True,
    current_user: dict = Depends(get_super_admin_user)
):
    """
    Delete an ESG user.
    Super Admin only.
    
    By default performs soft delete. Set soft=false for hard delete.
    """
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    deleted = await esg_user_service.delete(user_id, soft=soft)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")

    return None


@router.put("/{user_id}/assign-facilities")
async def assign_facilities_to_esg_user(
    user_id: str,
    facility_ids: List[str],
    current_user: dict = Depends(get_admin_user)
):
    """
    Assign facilities to an ESG user.
    Admin can assign to users in their organization.
    Super Admin can assign to any user.
    """
    user = await esg_user_service.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Non-super-admin can only assign to users in their org
    if current_user["role"] != "super_admin":
        if user.get("organization_id") != current_user.get("organization_id"):
            raise HTTPException(
                status_code=403,
                detail="Not authorized to manage users from other organizations"
            )

    success = await esg_user_service.assign_facilities(user_id, facility_ids)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to assign facilities")

    return {"message": "Facilities assigned successfully"}
