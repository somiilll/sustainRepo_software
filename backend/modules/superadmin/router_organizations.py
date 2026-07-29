"""Phase B9b: Split sub-router — Super-Admin Organizations + Admins.

Auto-extracted from modules/superadmin/router.py (Feb 2026).
Behaviour byte-identical: route bodies preserved verbatim.
"""
import json
import logging
import os
import re
import secrets
import string
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import EmailStr

from cascade_delete import cascade_delete_organization
from r2_storage import get_r2_storage

from app.config.env import RESEND_API_KEY, SENDER_EMAIL
from modules.auth.contracts import UserResponse
from modules.auth.dependencies import get_admin_user, get_current_user, get_super_admin_user
from modules.emissions.contracts import EmissionRecordCreate
from modules.organizations.contracts import OrganizationCreate, OrganizationResponse
from modules.superadmin.contracts import (
    CalculationFormulaCreate, CalculationFormulaResponse,
    CurrencyConversionCreate, CurrencyConversionUpdate,
    EmissionConfigurationCreate, EmissionConfigurationResponse,
    EmissionFactorCreate, EmissionFactorResponse,
    FormulaDefinitionCreate, FormulaDefinitionResponse,
    FormulaParameterCreate, FormulaParameterResponse,
    FuelDatabaseCreate, FuelDatabaseResponse,
    GWPConfigCreate, GWPConfigUpdate,
    ProcessTemplateCreate, ProcessTemplateResponse,
    Scope3EFCreate, Scope3EFResponse,
    SectorCreate, SectorResponse,
    UnitCreate, UnitResponse,
)
from shared.constants.gwp import GWP_VALUES, GWP_DEFAULT_SOURCE
from shared.database.mongo import db
from shared.helpers.email import send_email
from shared.helpers.passwords import generate_random_password, get_password_hash

logger = logging.getLogger(__name__)
router = APIRouter()


# Super Admin - Organization endpoints
@router.post("/super-admin/organizations", response_model=OrganizationResponse)
async def create_organization(org_data: OrganizationCreate, current_user: dict = Depends(get_super_admin_user)):
    # Subscription expiry is mandatory when creating organization
    if not org_data.subscription_expires_at:
        raise HTTPException(status_code=400, detail="Subscription expiry date is mandatory when creating an organization")
    
    org_dict = org_data.model_dump()
    org_dict["id"] = str(uuid.uuid4())
    org_dict["is_deleted"] = False
    org_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.organizations.insert_one(org_dict)
    return OrganizationResponse(**org_dict)

@router.get("/super-admin/organizations", response_model=List[OrganizationResponse])
async def get_all_organizations(
    include_deleted: bool = False,
    current_user: dict = Depends(get_super_admin_user)
):
    query = {} if include_deleted else {"is_deleted": False}
    orgs = await db.organizations.find(query, {"_id": 0}).to_list(1000)
    return [OrganizationResponse(**org) for org in orgs]

@router.put("/super-admin/organizations/{org_id}", response_model=OrganizationResponse)
async def update_organization(
    org_id: str,
    org_data: OrganizationCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    existing = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # Only update provided fields, preserve existing data for unset fields
    update_dict = org_data.model_dump(exclude_unset=True)
    
    # Remove fields that shouldn't be overwritten during edit
    fields_to_preserve = ['id', 'is_active', 'is_deleted', 'industry_sectors', 'organizational_boundary']
    for field in fields_to_preserve:
        if field in update_dict and field in existing:
            # Keep the existing value unless explicitly provided
            update_dict.pop(field, None)
    
    await db.organizations.update_one({"id": org_id}, {"$set": update_dict})
    
    updated = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    return OrganizationResponse(**updated)

@router.delete("/super-admin/organizations/{org_id}")
async def soft_delete_organization(org_id: str, current_user: dict = Depends(get_super_admin_user)):
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # Mark organization as deleted/inactive
    await db.organizations.update_one(
        {"id": org_id},
        {"$set": {"is_deleted": True, "is_active": False}}
    )
    
    # Mark all users of this organization as inactive (prevents login)
    await db.users.update_many(
        {"organization_id": org_id},
        {"$set": {"is_active": False}}
    )
    
    return {"message": "Organization deactivated successfully. All associated users have been blocked from login."}

# Super Admin - Permanently delete organization and ALL related data (incl. R2 files)

# Super Admin - Permanently delete organization and ALL related data (incl. R2 files)
@router.delete("/super-admin/organizations/{org_id}/permanent")
async def permanent_delete_organization(org_id: str, current_user: dict = Depends(get_super_admin_user)):
    from cascade_delete import cascade_delete_organization
    from r2_storage import get_r2_storage
    r2 = get_r2_storage()
    result = await cascade_delete_organization(db, r2, org_id)
    if not result.get("found"):
        raise HTTPException(status_code=404, detail="Organization not found")
    return {
        "message": f"Organization '{result.get('organization')}' and all related data permanently deleted",
        "deleted_counts": result["deleted_counts"],
    }

# Super Admin - Reactivate organization

# Super Admin - Reactivate organization
@router.put("/super-admin/organizations/{org_id}/reactivate")
async def reactivate_organization(org_id: str, current_user: dict = Depends(get_super_admin_user)):
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # Mark organization as active
    await db.organizations.update_one(
        {"id": org_id},
        {"$set": {"is_deleted": False, "is_active": True}}
    )
    
    # Reactivate all users of this organization
    await db.users.update_many(
        {"organization_id": org_id},
        {"$set": {"is_active": True}}
    )
    
    return {"message": "Organization reactivated successfully. All associated users can now login."}

# Super Admin - Emissions distribution for a specific organization (scope-wise + facility-wise)

# Super Admin - Emissions distribution for a specific organization (scope-wise + facility-wise)
@router.get("/super-admin/organizations/{org_id}/emissions-distribution")
async def get_org_emissions_distribution(
    org_id: str,
    current_user: dict = Depends(get_super_admin_user),
):
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    facilities = await db.facilities.find({"organization_id": org_id}, {"_id": 0}).to_list(10000)
    facility_ids = [f["id"] for f in facilities]
    facility_map = {f["id"]: f for f in facilities}

    # Dynamic scopes — includes any user-defined scopes, ordered by display_order
    scopes = await db.scopes.find(
        {"is_active": {"$ne": False}}, {"_id": 0}
    ).sort("display_order", 1).to_list(1000)

    if not facility_ids:
        return {
            "organization": {"id": org["id"], "name": org.get("name")},
            "totals": {"total_co2e": 0, "record_count": 0},
            "by_scope": [{
                "scope_code": s["code"], "scope_name": s["name"],
                "total_co2e": 0, "record_count": 0,
            } for s in scopes],
            "by_facility": [],
        }

    emissions = await db.emission_records.find(
        {"facility_id": {"$in": facility_ids}}, {"_id": 0}
    ).to_list(100000)

    # Equity share adjustment (matches dashboard logic at lines 4344-4366)
    use_equity_share = org.get("org_boundaries_approach") == "equity_share"
    reported_data_type = org.get("equity_share_reported_data_type", "total_facility")
    facility_equity_map = {}
    if use_equity_share and reported_data_type == "total_facility":
        for f in facilities:
            eq = f.get("equity_share_percentage", 100.0)
            facility_equity_map[f["id"]] = (eq / 100.0) if eq is not None else 1.0

    def adjusted(rec):
        if use_equity_share and reported_data_type == "total_facility":
            factor = facility_equity_map.get(rec.get("facility_id"), 1.0)
            return (rec.get("total_emissions") or 0) * factor
        return rec.get("total_emissions") or 0

    # Aggregate by scope
    by_scope = []
    total_co2e = 0.0
    for s in scopes:
        scope_recs = [r for r in emissions if r.get("scope") == s["code"]]
        scope_total = sum(adjusted(r) for r in scope_recs)
        total_co2e += scope_total
        by_scope.append({
            "scope_code": s["code"],
            "scope_name": s["name"],
            "total_co2e": round(scope_total, 4),
            "record_count": len(scope_recs),
        })

    # Aggregate by facility with scope breakdown
    by_facility = []
    for f in facilities:
        f_recs = [r for r in emissions if r.get("facility_id") == f["id"]]
        f_total = sum(adjusted(r) for r in f_recs)
        scope_breakdown = {}
        for s in scopes:
            scope_breakdown[s["code"]] = round(
                sum(adjusted(r) for r in f_recs if r.get("scope") == s["code"]), 4
            )
        by_facility.append({
            "facility_id": f["id"],
            "facility_name": f.get("name"),
            "total_co2e": round(f_total, 4),
            "record_count": len(f_recs),
            "by_scope": scope_breakdown,
            "equity_share_percentage": round(
                facility_equity_map.get(f["id"], 1.0) * 100, 1
            ) if use_equity_share else 100.0,
        })
    by_facility.sort(key=lambda x: x["total_co2e"], reverse=True)

    return {
        "organization": {"id": org["id"], "name": org.get("name")},
        "totals": {
            "total_co2e": round(total_co2e, 4),
            "record_count": len(emissions),
        },
        "scopes_meta": [{"code": s["code"], "name": s["name"]} for s in scopes],
        "by_scope": by_scope,
        "by_facility": by_facility,
        "equity_share_applied": use_equity_share,
    }


# Super Admin - Scope 3 Category & Method Breakdown + Biogenic Split

# Super Admin - Scope 3 Category & Method Breakdown + Biogenic Split
@router.get("/super-admin/organizations/{org_id}/scope3-biogenic-stats")
async def get_org_scope3_biogenic_stats(
    org_id: str,
    current_user: dict = Depends(get_super_admin_user),
):
    """Get Scope 3 category breakdown by method and biogenic emissions split for an organization"""
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    facilities = await db.facilities.find({"organization_id": org_id}, {"_id": 0}).to_list(10000)
    facility_ids = [f["id"] for f in facilities]

    if not facility_ids:
        return {
            "organization": {"id": org["id"], "name": org.get("name")},
            "scope3_categories": [],
            "scope3_by_method": {"activity_basis": {"count": 0, "tco2e": 0}, "spend_basis": {"count": 0, "tco2e": 0}, "supplier_basis": {"count": 0, "tco2e": 0}},
            "biogenic": {"direct": {"count": 0, "tco2e": 0}, "indirect": {"count": 0, "tco2e": 0, "by_category": []}},
        }

    # Fetch Scope 3 emissions
    scope3_emissions = await db.emission_records.find(
        {"facility_id": {"$in": facility_ids}, "scope": "scope3"}, {"_id": 0}
    ).to_list(100000)

    # Fetch Biogenic emissions
    # Direct biogenic = biogenic_scope_selection: "scope1"
    # Indirect biogenic = biogenic_scope_selection: "scope3"
    biogenic_emissions = await db.emission_records.find(
        {
            "facility_id": {"$in": facility_ids}, 
            "biogenic_scope_selection": {"$in": ["scope1", "scope3"]}
        }, 
        {"_id": 0}
    ).to_list(100000)

    # Scope 3 - Aggregate by category
    category_stats = {}
    for rec in scope3_emissions:
        cat = rec.get("category") or "Unknown"
        method = rec.get("calculation_method_scope3") or "unknown"
        tco2e = rec.get("total_emissions") or 0
        
        if cat not in category_stats:
            category_stats[cat] = {
                "category": cat,
                "total_count": 0,
                "total_tco2e": 0,
                "by_method": {}
            }
        
        category_stats[cat]["total_count"] += 1
        category_stats[cat]["total_tco2e"] += tco2e
        
        if method not in category_stats[cat]["by_method"]:
            category_stats[cat]["by_method"][method] = {"count": 0, "tco2e": 0}
        category_stats[cat]["by_method"][method]["count"] += 1
        category_stats[cat]["by_method"][method]["tco2e"] += tco2e

    # Convert to list and sort by category name
    scope3_categories = sorted([
        {
            "category": v["category"],
            "total_count": v["total_count"],
            "total_tco2e": round(v["total_tco2e"], 4),
            "by_method": {k: {"count": m["count"], "tco2e": round(m["tco2e"], 4)} for k, m in v["by_method"].items()}
        }
        for v in category_stats.values()
    ], key=lambda x: x["category"])

    # Scope 3 - Aggregate by method (overall)
    method_totals = {"activity_basis": {"count": 0, "tco2e": 0}, "spend_basis": {"count": 0, "tco2e": 0}, "supplier_basis": {"count": 0, "tco2e": 0}}
    for rec in scope3_emissions:
        method = rec.get("calculation_method_scope3") or "unknown"
        tco2e = rec.get("total_emissions") or 0
        if method in method_totals:
            method_totals[method]["count"] += 1
            method_totals[method]["tco2e"] += tco2e
    
    for m in method_totals:
        method_totals[m]["tco2e"] = round(method_totals[m]["tco2e"], 4)

    # Biogenic - Split by Direct (scope1) vs Indirect (scope3)
    biogenic_direct = {"count": 0, "tco2e": 0}
    biogenic_indirect = {"count": 0, "tco2e": 0, "by_category": {}, "by_method": {}}
    
    for rec in biogenic_emissions:
        bio_type = rec.get("biogenic_scope_selection") or ""
        tco2e = rec.get("total_emissions") or 0
        
        if bio_type == "scope1":
            # Direct biogenic
            biogenic_direct["count"] += 1
            biogenic_direct["tco2e"] += tco2e
        elif bio_type == "scope3":
            # Indirect biogenic
            biogenic_indirect["count"] += 1
            biogenic_indirect["tco2e"] += tco2e
            
            # By category
            cat = rec.get("category") or "Unknown"
            if cat not in biogenic_indirect["by_category"]:
                biogenic_indirect["by_category"][cat] = {"count": 0, "tco2e": 0, "by_method": {}}
            biogenic_indirect["by_category"][cat]["count"] += 1
            biogenic_indirect["by_category"][cat]["tco2e"] += tco2e
            
            # By method (overall)
            method = rec.get("calculation_method_scope3") or "unknown"
            if method not in biogenic_indirect["by_method"]:
                biogenic_indirect["by_method"][method] = {"count": 0, "tco2e": 0}
            biogenic_indirect["by_method"][method]["count"] += 1
            biogenic_indirect["by_method"][method]["tco2e"] += tco2e
            
            # By method within category
            if method not in biogenic_indirect["by_category"][cat]["by_method"]:
                biogenic_indirect["by_category"][cat]["by_method"][method] = {"count": 0, "tco2e": 0}
            biogenic_indirect["by_category"][cat]["by_method"][method]["count"] += 1
            biogenic_indirect["by_category"][cat]["by_method"][method]["tco2e"] += tco2e

    biogenic_direct["tco2e"] = round(biogenic_direct["tco2e"], 4)
    biogenic_indirect["tco2e"] = round(biogenic_indirect["tco2e"], 4)
    
    # Convert by_category dict to sorted list with method breakdown
    indirect_by_category = sorted([
        {
            "category": k, 
            "count": v["count"], 
            "tco2e": round(v["tco2e"], 4),
            "by_method": {mk: {"count": mv["count"], "tco2e": round(mv["tco2e"], 4)} for mk, mv in v["by_method"].items()}
        }
        for k, v in biogenic_indirect["by_category"].items()
    ], key=lambda x: x["category"])
    
    # Convert by_method dict to formatted dict
    indirect_by_method = {k: {"count": v["count"], "tco2e": round(v["tco2e"], 4)} for k, v in biogenic_indirect["by_method"].items()}

    return {
        "organization": {"id": org["id"], "name": org.get("name")},
        "scope3_categories": scope3_categories,
        "scope3_by_method": method_totals,
        "biogenic": {
            "direct": biogenic_direct,
            "indirect": {
                "count": biogenic_indirect["count"],
                "tco2e": biogenic_indirect["tco2e"],
                "by_category": indirect_by_category,
                "by_method": indirect_by_method
            }
        },
    }


# Super Admin - Admin management

# Super Admin - Admin management
@router.post("/super-admin/admins")
async def create_admin(
    email: EmailStr,
    full_name: str,
    organization_id: str,
    current_user: dict = Depends(get_super_admin_user)
):
    existing = await db.users.find_one({"email": email, "is_deleted": {"$ne": True}}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    org = await db.organizations.find_one({"id": organization_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # Check max_admins limit
    max_admins = org.get("max_admins", 5)
    current_admin_count = await db.users.count_documents({
        "organization_id": organization_id,
        "role": "admin",
        "is_deleted": {"$ne": True}
    })
    if current_admin_count >= max_admins:
        raise HTTPException(
            status_code=400, 
            detail=f"Maximum admin limit ({max_admins}) reached for this organization"
        )
    
    temp_password = generate_random_password()
    
    admin_dict = {
        "id": str(uuid.uuid4()),
        "email": email,
        "full_name": full_name,
        "role": "admin",
        "password_hash": get_password_hash(temp_password),
        "organization_id": organization_id,
        "assigned_facilities": [],
        "requires_password_change": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(admin_dict)
    
    # Get frontend URL
    frontend_url = os.environ.get('FRONTEND_URL', 'https://dual-framework-queue.preview.emergentagent.com')
    
    # Send welcome email with beautiful template
    email_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8f9fa; padding: 40px 20px;">
            <tr>
                <td align="center">
                    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                        <!-- Header -->
                        <tr>
                            <td style="background-color: #ffffff; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; border-bottom: 1px solid #e5e7eb;">
                                <img src="https://customer-assets.emergentagent.com/job_d67b5362-a184-47b7-81eb-abb9d39b89dd/artifacts/qllw2r8k_Logo_v3.png" alt="SustainRepo Logo" style="width: 60px; height: 60px; border-radius: 8px; margin-bottom: 10px;">
                                <h1 style="color: #1f2937; margin: 10px 0 0 0; font-size: 24px; font-weight: 600;">SustainRepo</h1>
                                <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 14px;">Carbon Accounting Platform</p>
                            </td>
                        </tr>
                        <!-- Content -->
                        <tr>
                            <td style="padding: 40px 30px;">
                                <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 20px;">Welcome to SustainRepo!</h2>
                                <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                                    Hello <strong style="color: #2eb67d;">{full_name}</strong>,
                                </p>
                                <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 25px 0;">
                                    You have been added as an <strong style="color: #1f2937;">Admin</strong> for <strong style="color: #2eb67d;">{org['name']}</strong>. Below are your login credentials:
                                </p>
                                <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
                                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                        <tr>
                                            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
                                                <span style="color: #6b7280; font-size: 13px; display: block; margin-bottom: 4px;">Email</span>
                                                <strong style="color: #1f2937; font-size: 15px;">{email}</strong>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 10px 0;">
                                                <span style="color: #6b7280; font-size: 13px; display: block; margin-bottom: 4px;">Temporary Password</span>
                                                <div style="background-color: #ffffff; padding: 14px 20px; border-radius: 8px; border: 2px solid #2eb67d; display: inline-block;">
                                                    <code style="color: #000000; font-size: 20px; font-family: 'Courier New', Courier, monospace; letter-spacing: 3px; font-weight: bold;">{temp_password}</code>
                                                </div>
                                            </td>
                                        </tr>
                                    </table>
                                </div>
                                <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto 25px auto;">
                                    <tr>
                                        <td style="background-color: #2eb67d; border-radius: 8px;">
                                            <a href="{frontend_url}/login" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600;">Login to SustainRepo</a>
                                        </td>
                                    </tr>
                                </table>
                                <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px;">
                                    <p style="color: #92400e; font-size: 13px; margin: 0;">
                                        <strong>Important:</strong> Please change your password upon first login for security purposes.
                                    </p>
                                </div>
                            </td>
                        </tr>
                        <!-- Footer -->
                        <tr>
                            <td style="background-color: #f9fafb; padding: 20px 30px; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
                                <p style="color: #6b7280; font-size: 12px; margin: 0; text-align: center;">
                                    &copy; 2026 SustainRepo. All rights reserved.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    
    await send_email(email, "Welcome to SustainRepo - Your Account is Ready!", email_body)
    
    # Don't return temp_password - it's sent via email only
    return {"message": "Admin created and email sent"}

# Super Admin - Get all admins

# Super Admin - Get all admins
@router.get("/super-admin/admins")
async def get_all_admins(current_user: dict = Depends(get_super_admin_user)):
    # Only return active (non-deleted) admins
    admins = await db.users.find({
        "role": "admin",
        "is_deleted": {"$ne": True}
    }, {"_id": 0, "password_hash": 0}).to_list(1000)
    return [UserResponse(**a) for a in admins]

# Super Admin - Delete admin

# Super Admin - Delete admin
@router.delete("/super-admin/admins/{admin_id}")
async def delete_admin(admin_id: str, current_user: dict = Depends(get_super_admin_user)):
    admin = await db.users.find_one({"id": admin_id, "role": "admin"}, {"_id": 0})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    # Delete the admin user
    result = await db.users.delete_one({"id": admin_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    return {"message": "Admin deleted successfully"}


# Super Admin - ESG Frameworks Management
@router.put("/super-admin/organizations/{org_id}/esg-frameworks")
async def update_org_esg_frameworks(
    org_id: str,
    frameworks: List[str],
    current_user: dict = Depends(get_super_admin_user)
):
    """Update ESG frameworks enabled for an organization"""
    from modules.organizations.contracts import VALID_ESG_FRAMEWORKS
    
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # Validate frameworks
    invalid = [f for f in frameworks if f not in VALID_ESG_FRAMEWORKS]
    if invalid:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid ESG frameworks: {invalid}. Valid values: {VALID_ESG_FRAMEWORKS}"
        )
    
    await db.organizations.update_one(
        {"id": org_id},
        {"$set": {"esg_frameworks_enabled": frameworks}}
    )
    
    updated = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    return {
        "message": "ESG frameworks updated successfully",
        "organization_id": org_id,
        "esg_frameworks_enabled": updated.get("esg_frameworks_enabled", [])
    }


@router.get("/super-admin/organizations/{org_id}/esg-frameworks")
async def get_org_esg_frameworks(
    org_id: str,
    current_user: dict = Depends(get_super_admin_user)
):
    """Get ESG frameworks enabled for an organization"""
    from modules.organizations.contracts import VALID_ESG_FRAMEWORKS
    from modules.frameworks.registry import framework_registry
    
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    enabled = org.get("esg_frameworks_enabled", [])
    
    # Get all framework details from registry
    all_frameworks = []
    for fw in framework_registry.list_all():
        all_frameworks.append({
            "id": fw.id,
            "name": fw.name,
            "version": fw.version,
            "description": fw.description,
            "status": fw.status.value,
            "enabled": fw.id in enabled
        })
    
    return {
        "organization_id": org_id,
        "organization_name": org.get("name"),
        "esg_frameworks_enabled": enabled,
        "available_frameworks": all_frameworks
    }


# Super Admin - Multi-Level Approval Toggle
@router.put("/super-admin/organizations/{org_id}/multi-level-approval")
async def toggle_multi_level_approval(
    org_id: str,
    enabled: bool = Query(..., description="Enable or disable multi-level approval"),
    current_user: dict = Depends(get_super_admin_user)
):
    """Enable or disable multi-level approval chain for an organization"""
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    await db.organizations.update_one(
        {"id": org_id},
        {"$set": {"multi_level_approval_enabled": enabled}}
    )
    
    return {
        "message": f"Multi-level approval {'enabled' if enabled else 'disabled'} for organization",
        "organization_id": org_id,
        "multi_level_approval_enabled": enabled
    }


@router.get("/super-admin/organizations/{org_id}/feature-flags")
async def get_org_feature_flags(
    org_id: str,
    current_user: dict = Depends(get_super_admin_user)
):
    """Get all feature flags for an organization"""
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    return {
        "organization_id": org_id,
        "organization_name": org.get("name"),
        "feature_flags": {
            "approval_workflow_enabled": org.get("approval_workflow_enabled", False),
            "multi_level_approval_enabled": org.get("multi_level_approval_enabled", False),
            "has_ghg": org.get("has_ghg", True),
            "has_esg": org.get("has_esg", True),
        }
    }


# Super Admin - Emission Factors Management
