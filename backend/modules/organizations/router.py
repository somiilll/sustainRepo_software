"""Organization "self" routes — Admin can edit, User views own org."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from audit_logger import AuditAction, AuditModule, get_audit_logger
from modules.auth.dependencies import get_admin_user, get_current_user
from modules.organizations.contracts import OrganizationCreate, OrganizationResponse
from shared.database.mongo import db

router = APIRouter()


class YearlyDataCreate(BaseModel):
    turnover: Optional[str] = None
    production_quantity: Optional[str] = None
    production_unit: Optional[str] = "MT"


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


@router.get("/organization/yearly-data/{reporting_year}")
async def get_yearly_data(
    reporting_year: str,
    current_user: dict = Depends(get_current_user)
):
    """Get organization yearly data (turnover from financials, production from production_quantities)."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=404, detail="No organization assigned")
    
    # Fetch turnover from organization_financials
    financials = await db.organization_financials.find_one(
        {"org_id": org_id, "reporting_year": reporting_year},
        {"_id": 0}
    )
    
    # Fetch production quantity from production_quantities (org-level, facility_id=None)
    production = await db.production_quantities.find_one(
        {"organization_id": org_id, "facility_id": None, "reporting_period": f"FY {reporting_year}", "is_deleted": {"$ne": True}},
        {"_id": 0}
    )
    
    return {
        "turnover": financials.get("turnover") if financials else "",
        "production_quantity": str(production.get("quantity", "")) if production else "",
        "production_unit": production.get("unit", "MT") if production else "MT"
    }


@router.post("/organization/yearly-data/{reporting_year}")
async def save_yearly_data(
    reporting_year: str,
    data: YearlyDataCreate,
    current_user: dict = Depends(get_current_user)
):
    """Save organization yearly data - turnover to financials, production to production_quantities."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=404, detail="No organization assigned")
    
    now = datetime.now(timezone.utc)
    user_id = current_user.get("id")
    
    # Save turnover to organization_financials
    if data.turnover:
        await db.organization_financials.update_one(
            {"org_id": org_id, "reporting_year": reporting_year},
            {"$set": {
                "org_id": org_id,
                "reporting_year": reporting_year,
                "turnover": data.turnover,
                "updated_at": now,
                "updated_by": user_id
            }, "$setOnInsert": {"created_at": now}},
            upsert=True
        )
    
    # Save production quantity to production_quantities (org-level)
    if data.production_quantity:
        import uuid
        existing = await db.production_quantities.find_one({
            "organization_id": org_id,
            "facility_id": None,
            "reporting_period": f"FY {reporting_year}",
            "is_deleted": {"$ne": True}
        })
        
        if existing:
            await db.production_quantities.update_one(
                {"id": existing["id"]},
                {"$set": {
                    "quantity": float(data.production_quantity) if data.production_quantity else 0,
                    "unit": data.production_unit or "MT",
                    "updated_at": now,
                    "updated_by": user_id
                }}
            )
        else:
            new_record = {
                "id": str(uuid.uuid4()),
                "organization_id": org_id,
                "facility_id": None,
                "reporting_period": f"FY {reporting_year}",
                "quantity": float(data.production_quantity) if data.production_quantity else 0,
                "unit": data.production_unit or "MT",
                "notes": "Added from Organization module",
                "created_at": now,
                "created_by": user_id,
                "updated_at": now,
                "updated_by": user_id,
                "is_deleted": False
            }
            await db.production_quantities.insert_one(new_record)
    
    return {"success": True, "message": f"Saved yearly data for FY {reporting_year}"}
