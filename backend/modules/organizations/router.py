"""Organization "self" routes — Admin can edit, User views own org."""
from fastapi import APIRouter, Depends, HTTPException

from audit_logger import AuditAction, AuditModule, get_audit_logger
from modules.auth.dependencies import get_admin_user, get_current_user
from modules.organizations.contracts import OrganizationCreate, OrganizationResponse
from shared.database.mongo import db

router = APIRouter()


@router.get("/organizations/my", response_model=OrganizationResponse)
async def get_my_organization(current_user: dict = Depends(get_current_user)):
    """Get organization details - Admin can edit, User can only view"""
    if current_user["role"] == "super_admin":
        raise HTTPException(status_code=400, detail="Super Admin does not belong to an organization")

    if not current_user.get("organization_id"):
        raise HTTPException(status_code=404, detail="No organization assigned")

    org = await db.organizations.find_one({"id": current_user["organization_id"]}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return OrganizationResponse(**org)


@router.put("/organizations/my", response_model=OrganizationResponse)
async def update_my_organization(org_data: OrganizationCreate, current_user: dict = Depends(get_admin_user)):
    """Update organization - Admin only"""
    if not current_user.get("organization_id"):
        raise HTTPException(status_code=404, detail="No organization assigned")

    existing = await db.organizations.find_one({"id": current_user["organization_id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Only update provided fields, preserve existing data for unset fields.
    update_dict = org_data.model_dump(exclude_unset=True)

    # Fields that admin shouldn't be able to overwrite (super-admin only).
    fields_to_preserve = ['id', 'is_active', 'is_deleted', 'max_facilities', 'max_admins', 'max_users', 'subscription_expires_at', 'approval_workflow_enabled']
    for field in fields_to_preserve:
        update_dict.pop(field, None)

    await db.organizations.update_one(
        {"id": current_user["organization_id"]},
        {"$set": update_dict},
    )

    updated = await db.organizations.find_one({"id": current_user["organization_id"]}, {"_id": 0})

    # Audit log
    audit_logger = get_audit_logger()
    await audit_logger.log(
        action=AuditAction.UPDATE,
        module=AuditModule.ORGANIZATION,
        user_id=current_user["id"],
        user_email=current_user["email"],
        user_role=current_user.get("role", "admin"),
        organization_id=current_user["organization_id"],
        resource_id=current_user["organization_id"],
        resource_name=existing.get("name", "Organization"),
        description=f"Updated organization '{existing.get('name', 'Unknown')}'",
        old_values=existing,
        new_values=update_dict,
    )

    return OrganizationResponse(**updated)
