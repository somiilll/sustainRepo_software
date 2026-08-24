"""Organization "self" routes — Admin can edit, User views own org."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Dict, Optional, List
from datetime import datetime, timezone

from audit_logger import AuditAction, AuditModule, get_audit_logger
from modules.auth.dependencies import get_admin_user, get_current_user
from modules.organizations.contracts import OrganizationCreate, OrganizationResponse
from shared.database.mongo import db
from shared.utils.timezone_utils import get_common_timezones, get_default_timezone_for_country
from modules.entitlements.service import resolve_entitlements

router = APIRouter()

# Software asset keys stored in R2 (software_images bucket)
SOFTWARE_ASSETS = {
    "logo": "logos/sustainrepo_logo.png",
}


@router.get("/software-assets/{asset_name}")
async def get_software_asset(asset_name: str):
    """Get presigned URL for a software asset (logo, etc.)."""
    key = SOFTWARE_ASSETS.get(asset_name)
    if not key:
        raise HTTPException(status_code=404, detail="Asset not found")
    try:
        from r2_storage import get_r2_storage
        url = get_r2_storage().generate_presigned_url(
            bucket_type="software_images", key=key, expiration=86400
        )
        return {"url": url}
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to generate URL")


class TimezoneOption(BaseModel):
    """Timezone option for dropdown selection."""
    value: str
    label: str
    offset: str


@router.get("/timezones", response_model=List[TimezoneOption])
async def get_timezones():
    """Get list of common timezones for dropdown selection."""
    return get_common_timezones()


@router.get("/timezones/default/{country}")
async def get_default_timezone(country: str):
    """Get default timezone for a country."""
    tz = get_default_timezone_for_country(country)
    return {"timezone": tz, "country": country}


class YearlyDataCreate(BaseModel):
    turnover: Optional[str] = None
    turnover_frequency: Optional[str] = "yearly"  # "yearly" or "monthly"
    turnover_monthly: Optional[dict] = None  # {"Apr": 100, "May": 200, ...}
    turnover_currency: Optional[str] = "INR"
    production_quantity: Optional[str] = None
    production_quantity_frequency: Optional[str] = "yearly"
    production_quantity_monthly: Optional[dict] = None
    production_unit: Optional[str] = "MT"


class OrgModuleConfig(BaseModel):
    """Organization module configuration for frontend sidebar visibility."""
    has_ghg: bool = True
    has_esg: bool = True
    enabled_access: Optional[list] = None  # scope1_2 or scope1_2_3
    esg_frameworks_enabled: Optional[list] = None
    approval_workflow_enabled: bool = False  # Single-level approval workflow
    multi_level_approval_enabled: bool = False  # Multi-level approval chain feature flag
    timezone: str = "UTC"  # Organization's IANA timezone
    entitlements: Dict[str, bool] = {}
    permissions: Dict[str, bool] = {}


@router.get("/organization/module-config")
async def get_org_module_config(current_user: dict = Depends(get_current_user)):
    """Get organization's module configuration for sidebar visibility."""
    if current_user["role"] == "super_admin":
        # Super admin sees all modules
        return OrgModuleConfig(
            has_ghg=True,
            has_esg=True,
            enabled_access=["scope1_2_3"],
            esg_frameworks_enabled=["BRSR", "GRI"],
            approval_workflow_enabled=True,
            multi_level_approval_enabled=True,  # Super admin can see all features
            timezone="UTC",  # Super admin uses UTC
            entitlements={},
            permissions={}
        )
    
    org_id = current_user.get("organization_id")
    if not org_id:
        return OrgModuleConfig()
    
    org = await db.organizations.find_one(
        {"id": org_id},
        {"_id": 0, "has_ghg": 1, "has_esg": 1, "enabled_access": 1, "esg_frameworks_enabled": 1, "approval_workflow_enabled": 1, "multi_level_approval_enabled": 1, "timezone": 1}
    )
    
    if not org:
        return OrgModuleConfig()
    
    entitlements = await resolve_entitlements(org_id, migrate=True)
    from modules.entitlements.service import entitlement_access_map
    org_config = await db["organization_config"].find_one({"organization_id": org_id}, {"_id": 0, "entitlements": 1})
    permissions = entitlement_access_map((org_config or {}).get("entitlements"))
    return OrgModuleConfig(
        has_ghg=entitlements["environment"],
        has_esg=any(entitlements[code] for code in ("environment", "social", "governance")),
        enabled_access=org.get("enabled_access"),
        esg_frameworks_enabled=org.get("esg_frameworks_enabled"),
        approval_workflow_enabled=org.get("approval_workflow_enabled", False),
        multi_level_approval_enabled=org.get("multi_level_approval_enabled", False),
        timezone=org.get("timezone") or "Asia/Kolkata",  # Default to IST
        entitlements=entitlements,
        permissions=permissions,
    )


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
    
    # Apply defaults for existing orgs without these fields
    if "org_type" not in org or not org.get("org_type"):
        org["org_type"] = "customer"
    if "timezone" not in org or not org.get("timezone"):
        org["timezone"] = "Asia/Kolkata"  # IST
    entitlements = await resolve_entitlements(current_user["organization_id"], migrate=True)
    org["module_access"] = entitlements
    org["has_ghg"] = entitlements["environment"]
    org["has_esg"] = any(entitlements[code] for code in ("environment", "social", "governance"))
    
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
    fields_to_preserve = ['id', 'is_active', 'is_deleted', 'max_facilities', 'max_admins', 'max_users', 'subscription_expires_at', 'approval_workflow_enabled', 'multi_level_approval_enabled', 'has_ghg', 'has_esg', 'sbti_targets_enabled', 'repo_pilot_enabled', 'module_access']
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


def _normalize_org_year(reporting_year: str) -> tuple:
    """Returns (fin_key, prod_period) in canonical format.
    Detects CY vs FY from the input string.
    """
    from shared.utils.period_utils import normalize_period
    normalized = normalize_period(reporting_year)
    return normalized, normalized


@router.get("/organization/yearly-data/{reporting_year}")
async def get_yearly_data(
    reporting_year: str,
    current_user: dict = Depends(get_current_user)
):
    """Get organization yearly data (turnover from financials, production from production_quantities)."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=404, detail="No organization assigned")
    
    fin_key, prod_period = _normalize_org_year(reporting_year)
    from shared.utils.period_utils import extract_year, period_variants, detect_type
    _year = extract_year(fin_key) or 0
    _rtype = detect_type(fin_key)
    legacy_variants = period_variants(_year, _rtype)
    
    financials = await db.organization_financials.find_one(
        {"org_id": org_id, "reporting_year": {"$in": legacy_variants}},
        {"_id": 0}
    )
    
    production = await db.production_quantities.find_one(
        {"organization_id": org_id, "facility_id": None, "reporting_period": {"$in": legacy_variants}, "is_deleted": {"$ne": True}},
        {"_id": 0}
    )
    
    return {
        "turnover": financials.get("turnover") if financials else "",
        "turnover_frequency": financials.get("frequency", "yearly") if financials else "yearly",
        "turnover_monthly": financials.get("monthly_data") if financials else None,
        "turnover_currency": financials.get("currency", "INR") if financials else "INR",
        "production_quantity": str(production.get("quantity", "")) if production else "",
        "production_quantity_frequency": production.get("frequency", "yearly") if production else "yearly",
        "production_quantity_monthly": production.get("monthly_data") if production else None,
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
    
    fin_key, prod_period = _normalize_org_year(reporting_year)
    from shared.utils.period_utils import extract_year, period_variants, detect_type
    _year2 = extract_year(fin_key) or 0
    _rtype2 = detect_type(fin_key)
    legacy_variants = period_variants(_year2, _rtype2)
    
    now = datetime.now(timezone.utc)
    user_id = current_user.get("id")
    
    # Handle turnover - save if provided, delete if empty/null
    if data.turnover or data.turnover_monthly:
        update_doc = {
            "org_id": org_id,
            "reporting_year": fin_key,
            "frequency": data.turnover_frequency or "yearly",
            "currency": data.turnover_currency or "INR",
            "updated_at": now,
            "updated_by": user_id
        }
        if data.turnover_frequency == "monthly" and data.turnover_monthly:
            update_doc["monthly_data"] = data.turnover_monthly
            update_doc["turnover"] = str(sum(float(v) for v in data.turnover_monthly.values() if v))
        else:
            update_doc["turnover"] = data.turnover
            update_doc["monthly_data"] = None
        await db.organization_financials.update_one(
            {"org_id": org_id, "reporting_year": {"$in": legacy_variants}},
            {"$set": update_doc, "$setOnInsert": {"created_at": now}},
            upsert=True
        )
    else:
        # Delete turnover record if value is cleared
        await db.organization_financials.delete_one({
            "org_id": org_id, 
            "reporting_year": {"$in": legacy_variants}
        })
    
    # Handle production quantity - save if provided, delete if empty/null
    if data.production_quantity or data.production_quantity_monthly:
        import uuid
        freq = data.production_quantity_frequency or "yearly"
        qty = 0
        monthly_data = None
        if freq == "monthly" and data.production_quantity_monthly:
            monthly_data = data.production_quantity_monthly
            qty = sum(float(v) for v in monthly_data.values() if v)
        elif data.production_quantity:
            qty = float(data.production_quantity)

        existing = await db.production_quantities.find_one({
            "organization_id": org_id,
            "facility_id": None,
            "reporting_period": {"$in": legacy_variants},
            "is_deleted": {"$ne": True}
        })
        
        if existing:
            await db.production_quantities.update_one(
                {"id": existing["id"]},
                {"$set": {
                    "quantity": qty,
                    "unit": data.production_unit or "MT",
                    "frequency": freq,
                    "monthly_data": monthly_data,
                    "reporting_period": prod_period,
                    "updated_at": now,
                    "updated_by": user_id
                }}
            )
        else:
            new_record = {
                "id": str(uuid.uuid4()),
                "organization_id": org_id,
                "facility_id": None,
                "reporting_period": prod_period,
                "quantity": qty,
                "unit": data.production_unit or "MT",
                "frequency": freq,
                "monthly_data": monthly_data,
                "notes": "Added from Organization module",
                "created_at": now,
                "created_by": user_id,
                "updated_at": now,
                "updated_by": user_id,
                "is_deleted": False
            }
            await db.production_quantities.insert_one(new_record)
    else:
        # Delete production record if value is cleared (soft delete)
        await db.production_quantities.update_one(
            {
                "organization_id": org_id,
                "facility_id": None,
                "reporting_period": {"$in": legacy_variants},
                "is_deleted": {"$ne": True}
            },
            {"$set": {"is_deleted": True, "updated_at": now, "updated_by": user_id}}
        )
    
    return {"success": True, "message": f"Saved data for {prod_period}"}
