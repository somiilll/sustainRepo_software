"""Phase B9: Super-admin / Platform Config router.

Lifted verbatim from server.py. Contains:
  - /super-admin/organizations/* (7 routes)
  - /super-admin/admins/*
  - /super-admin/emission-factors/*
  - /units/*
  - /super-admin/fuel-database/*, /fuel-database
  - /super-admin/scope3-ef/*, /scope3-ef/*
  - /emission-categories
  - /base-year/* (reference data)
  - /gwp-config(s)/*, /gwp-values
  - /currency-conversion/*, /super-admin/currency-conversion(s)/*
  - /super-admin/formula-parameters/*, /formula-parameters
  - /super-admin/formula-definitions/*, /formula-definitions
  - /super-admin/emission-configurations/*, /emission-configurations
  - /super-admin/dashboard
  - /emission-factors, /emission-factors/standard
  - /custom-emission-factors/*
  - /calculation-formulas/*
  - /super-admin/sectors/*, /sectors
  - /super-admin/process-templates/*, /process-templates

Behaviour byte-identical: route bodies preserved; only the decorator
target changed from `api_router` to the modular `router`.
"""
import json
import logging
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
    CalculationFormulaCreate,
    CalculationFormulaResponse,
    CurrencyConversionCreate,
    CurrencyConversionUpdate,
    EmissionConfigurationCreate,
    EmissionConfigurationResponse,
    EmissionFactorCreate,
    EmissionFactorResponse,
    FormulaDefinitionCreate,
    FormulaDefinitionResponse,
    FormulaParameterCreate,
    FormulaParameterResponse,
    FuelDatabaseCreate,
    FuelDatabaseResponse,
    GWPConfigCreate,
    GWPConfigUpdate,
    ProcessTemplateCreate,
    ProcessTemplateResponse,
    Scope3EFCreate,
    Scope3EFResponse,
    SectorCreate,
    SectorResponse,
    UnitCreate,
    UnitResponse,
)
from shared.database.mongo import db
from shared.helpers.email import send_email
from shared.helpers.passwords import generate_random_password, get_password_hash

logger = logging.getLogger(__name__)
router = APIRouter()

# GWP Constants (IPCC AR6 100-year values) - These are defaults; actual values come from DB.
# Lifted from server.py during Phase B9 refactor (originally lines 830-838).
GWP_VALUES = {
    "CO2": 1,
    "CH4": 27.9,  # AR6 value (was 28 in AR5)
    "N2O": 273    # AR6 value (same as AR5)
}
GWP_DEFAULT_SOURCE = "IPCC AR6"


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
    frontend_url = os.environ.get('FRONTEND_URL', 'https://ghg-modular.preview.emergentagent.com')
    
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
@router.get("/super-admin/admins")
async def get_all_admins(current_user: dict = Depends(get_super_admin_user)):
    admins = await db.users.find({"role": "admin"}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return [UserResponse(**a) for a in admins]

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

# Super Admin - Emission Factors Management
@router.post("/super-admin/emission-factors", response_model=EmissionFactorResponse)
async def create_global_emission_factor(
    factor_data: EmissionFactorCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    # Check for duplicate by Category + Subcategory + Region (unique combination for standard factors)
    existing = await db.emission_factors.find_one({
        "scope": factor_data.scope,
        "category": factor_data.category,
        "sub_category": factor_data.sub_category,
        "region": factor_data.region or "Global (All Regions)",
        "is_custom": False  # Only check against other standard factors
    })
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"A standard emission factor already exists for {factor_data.category} / {factor_data.sub_category} in {factor_data.region or 'Global (All Regions)'}. Please edit the existing factor instead."
        )
    
    factor_dict = factor_data.model_dump()
    factor_dict["id"] = str(uuid.uuid4())
    factor_dict["created_by"] = current_user["id"]
    factor_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    factor_dict["is_custom"] = False  # Super Admin factors are always Standard
    factor_dict["region"] = factor_data.region or "Global (All Regions)"
    
    await db.emission_factors.insert_one(factor_dict)
    return EmissionFactorResponse(**factor_dict)

@router.put("/super-admin/emission-factors/{factor_id}", response_model=EmissionFactorResponse)
async def update_emission_factor(
    factor_id: str,
    factor_data: EmissionFactorCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    existing = await db.emission_factors.find_one({"id": factor_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Emission factor not found")
    
    # Check for duplicate by Category + Subcategory + Region (excluding current factor)
    duplicate = await db.emission_factors.find_one({
        "id": {"$ne": factor_id},  # Exclude current factor
        "scope": factor_data.scope,
        "category": factor_data.category,
        "sub_category": factor_data.sub_category,
        "region": factor_data.region or "Global (All Regions)",
        "is_custom": False  # Only check against other standard factors
    })
    if duplicate:
        raise HTTPException(
            status_code=400, 
            detail=f"A standard emission factor already exists for {factor_data.category} / {factor_data.sub_category} in {factor_data.region or 'Global (All Regions)'}."
        )
    
    update_dict = factor_data.model_dump()
    update_dict["is_custom"] = False  # Super Admin factors remain Standard even after edit
    update_dict["region"] = factor_data.region or "Global (All Regions)"
    update_dict["updated_by"] = current_user["id"]
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.emission_factors.update_one({"id": factor_id}, {"$set": update_dict})
    
    updated = await db.emission_factors.find_one({"id": factor_id}, {"_id": 0})
    return EmissionFactorResponse(**updated)

@router.delete("/super-admin/emission-factors/{factor_id}")
async def delete_emission_factor(factor_id: str, current_user: dict = Depends(get_super_admin_user)):
    result = await db.emission_factors.delete_one({"id": factor_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Emission factor not found")
    return {"message": "Emission factor deleted successfully"}

# ============================================
# UNIT MANAGEMENT ENDPOINTS
# ============================================

@router.get("/units", response_model=List[UnitResponse])
async def get_all_units(current_user: dict = Depends(get_current_user)):
    """Get all units (available to all authenticated users)"""
    units = await db.units.find({"is_active": True}, {"_id": 0}).to_list(1000)
    return [UnitResponse(**u) for u in units]

@router.get("/units/by-type/{unit_type}", response_model=List[UnitResponse])
async def get_units_by_type(unit_type: str, current_user: dict = Depends(get_current_user)):
    """Get units filtered by type (mass or volume)"""
    units = await db.units.find({"unit_type": unit_type, "is_active": True}, {"_id": 0}).to_list(1000)
    return [UnitResponse(**u) for u in units]

@router.post("/units", response_model=UnitResponse)
async def create_unit(
    unit_data: UnitCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    """Create a new unit (Super Admin only)"""
    # Check if symbol already exists
    existing = await db.units.find_one({"symbol": unit_data.symbol})
    if existing:
        raise HTTPException(status_code=400, detail=f"Unit with symbol '{unit_data.symbol}' already exists")
    
    unit_dict = unit_data.model_dump()
    unit_dict["id"] = str(uuid.uuid4())
    unit_dict["created_by"] = current_user["id"]
    unit_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.units.insert_one(unit_dict)
    return UnitResponse(**unit_dict)

@router.put("/units/{unit_id}", response_model=UnitResponse)
async def update_unit(
    unit_id: str,
    unit_data: UnitCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    """Update a unit (Super Admin only)"""
    existing = await db.units.find_one({"id": unit_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    update_dict = unit_data.model_dump()
    update_dict["updated_by"] = current_user["id"]
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.units.update_one({"id": unit_id}, {"$set": update_dict})
    updated = await db.units.find_one({"id": unit_id}, {"_id": 0})
    return UnitResponse(**updated)

@router.delete("/units/{unit_id}")
async def delete_unit(unit_id: str, current_user: dict = Depends(get_super_admin_user)):
    """Delete a unit (Super Admin only)"""
    result = await db.units.delete_one({"id": unit_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Unit not found")
    return {"message": "Unit deleted successfully"}

@router.post("/units/seed-defaults")
async def seed_default_units(current_user: dict = Depends(get_super_admin_user)):
    """Seed the database with default units (Super Admin only)"""
    seeded = []
    for unit in DEFAULT_UNITS:
        existing = await db.units.find_one({"symbol": unit["symbol"]})
        if not existing:
            unit_dict = unit.copy()
            unit_dict["id"] = str(uuid.uuid4())
            unit_dict["created_by"] = current_user["id"]
            unit_dict["created_at"] = datetime.now(timezone.utc).isoformat()
            unit_dict["is_active"] = True
            await db.units.insert_one(unit_dict)
            seeded.append(unit["symbol"])
    
    return {"message": f"Seeded {len(seeded)} units", "units": seeded}

# Super Admin - Fuel Database Management
@router.get("/super-admin/fuel-database", response_model=List[FuelDatabaseResponse])
async def get_all_fuels(current_user: dict = Depends(get_super_admin_user)):
    """Get all fuels in the database"""
    fuels = await db.fuel_database.find({}, {"_id": 0}).to_list(10000)
    return [FuelDatabaseResponse(**f) for f in fuels]

@router.post("/super-admin/fuel-database", response_model=FuelDatabaseResponse)
async def create_fuel(
    fuel_data: FuelDatabaseCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    """Create a new fuel entry in the database"""
    # Check for duplicate by fuel_name + category + industry_sector + region
    existing = await db.fuel_database.find_one({
        "fuel_name": fuel_data.fuel_name,
        "category": fuel_data.category,
        "industry_sector": fuel_data.industry_sector,
        "region": fuel_data.region or "Global"
    })
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"A fuel entry already exists for '{fuel_data.fuel_name}' in {fuel_data.category} / {fuel_data.industry_sector} ({fuel_data.region or 'Global'}). Please use a different combination."
        )
    
    fuel_dict = fuel_data.model_dump()
    fuel_dict["id"] = str(uuid.uuid4())
    fuel_dict["created_by"] = current_user["id"]
    fuel_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    fuel_dict["region"] = fuel_data.region or "Global"
    
    await db.fuel_database.insert_one(fuel_dict)
    return FuelDatabaseResponse(**fuel_dict)

@router.put("/super-admin/fuel-database/{fuel_id}", response_model=FuelDatabaseResponse)
async def update_fuel(
    fuel_id: str,
    fuel_data: FuelDatabaseCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    """Update an existing fuel entry"""
    existing = await db.fuel_database.find_one({"id": fuel_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Fuel not found")
    
    # Check for duplicate by fuel_name + category + industry_sector + region (excluding current fuel)
    duplicate = await db.fuel_database.find_one({
        "id": {"$ne": fuel_id},
        "fuel_name": fuel_data.fuel_name,
        "category": fuel_data.category,
        "industry_sector": fuel_data.industry_sector,
        "region": fuel_data.region or "Global"
    })
    if duplicate:
        raise HTTPException(
            status_code=400, 
            detail=f"A fuel entry already exists for '{fuel_data.fuel_name}' in {fuel_data.category} / {fuel_data.industry_sector} ({fuel_data.region or 'Global'})."
        )
    
    update_dict = fuel_data.model_dump()
    update_dict["region"] = fuel_data.region or "Global"
    update_dict["updated_by"] = current_user["id"]
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.fuel_database.update_one({"id": fuel_id}, {"$set": update_dict})
    
    updated = await db.fuel_database.find_one({"id": fuel_id}, {"_id": 0})
    return FuelDatabaseResponse(**updated)

@router.delete("/super-admin/fuel-database/{fuel_id}")
async def delete_fuel(fuel_id: str, current_user: dict = Depends(get_super_admin_user)):
    """Delete a fuel entry"""
    result = await db.fuel_database.delete_one({"id": fuel_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Fuel not found")
    return {"message": "Fuel deleted successfully"}

# Public endpoint to get fuels for Admin/User (read-only)
@router.get("/fuel-database", response_model=List[FuelDatabaseResponse])
async def get_fuels_for_users(current_user: dict = Depends(get_current_user)):
    """Get all fuels (for Admin/User to select when adding emissions)"""
    fuels = await db.fuel_database.find({}, {"_id": 0}).to_list(10000)
    return [FuelDatabaseResponse(**f) for f in fuels]

@router.get("/fuel-database/{fuel_id}", response_model=FuelDatabaseResponse)
async def get_fuel_by_id(fuel_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific fuel by ID"""
    fuel = await db.fuel_database.find_one({"id": fuel_id}, {"_id": 0})
    if not fuel:
        raise HTTPException(status_code=404, detail="Fuel not found")
    return FuelDatabaseResponse(**fuel)


# ============================================
# SCOPE 3 EMISSION FACTORS
# ============================================

@router.get("/super-admin/scope3-ef")
async def get_all_scope3_ef(
    current_user: dict = Depends(get_super_admin_user),
    page: int = 1,
    limit: int = 50,
    search: Optional[str] = None,
    category: Optional[str] = None,
    method: Optional[str] = None,
    region: Optional[str] = None,
    year: Optional[int] = None,
    source: Optional[str] = None,
    sub_scope: Optional[str] = None,
    subcategory: Optional[str] = None
):
    """Get paginated Scope 3 emission factors with optional filters"""
    # Build query
    query = {}
    
    if search:
        query["$or"] = [
            {"activity": {"$regex": search, "$options": "i"}},
            {"category": {"$regex": search, "$options": "i"}},
            {"source": {"$regex": search, "$options": "i"}}
        ]
    
    if category:
        query["category"] = {"$regex": category, "$options": "i"}
    
    if method:
        query["method"] = method
    
    if region:
        query["region"] = region
    
    if year:
        query["year_applicable"] = year
    
    if source:
        query["source"] = {"$regex": source, "$options": "i"}
    
    if sub_scope:
        query["sub_scope"] = sub_scope
    
    if subcategory:
        query["subcategory"] = subcategory
    
    # Get total count for pagination
    total = await db.scope3_ef.count_documents(query)
    
    # Calculate skip
    skip = (page - 1) * limit
    
    # Fetch paginated results
    factors = await db.scope3_ef.find(query, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    
    return {
        "data": [Scope3EFResponse(**f) for f in factors],
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": (total + limit - 1) // limit
    }

@router.post("/super-admin/scope3-ef", response_model=Scope3EFResponse)
async def create_scope3_ef(
    ef_data: Scope3EFCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    """Create a new Scope 3 emission factor entry"""
    # Validate emission_factor >= 0
    if ef_data.emission_factor < 0:
        raise HTTPException(status_code=400, detail="Emission factor must be greater than or equal to 0")
    
    # Normalize industry_sectors for storage (sort for consistent ordering)
    industry_sectors_sorted = sorted(ef_data.industry_sectors) if ef_data.industry_sectors else []
    
    # Check for duplicate by core identifying fields (excluding industry_sectors to avoid array ordering issues)
    existing = await db.scope3_ef.find_one({
        "category": ef_data.category,
        "method": ef_data.method,
        "activity": ef_data.activity,
        "region": ef_data.region or "Global",
        "year_applicable": ef_data.year_applicable,
        "source": ef_data.source
    })
    if existing:
        raise HTTPException(
            status_code=400, 
            detail="A duplicate entry already exists with the same combination of category, method, activity, region, year, and source"
        )
    
    ef_dict = ef_data.model_dump()
    ef_dict["id"] = str(uuid.uuid4())
    ef_dict["created_by"] = current_user["id"]
    ef_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    ef_dict["region"] = ef_data.region or "Global"
    ef_dict["industry_sectors"] = industry_sectors_sorted
    
    await db.scope3_ef.insert_one(ef_dict)
    return Scope3EFResponse(**ef_dict)

@router.put("/super-admin/scope3-ef/{ef_id}", response_model=Scope3EFResponse)
async def update_scope3_ef(
    ef_id: str,
    ef_data: Scope3EFCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    """Update an existing Scope 3 emission factor entry"""
    existing = await db.scope3_ef.find_one({"id": ef_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Scope 3 EF entry not found")
    
    # Validate emission_factor >= 0
    if ef_data.emission_factor < 0:
        raise HTTPException(status_code=400, detail="Emission factor must be greater than or equal to 0")
    
    # Normalize industry_sectors for storage
    industry_sectors_sorted = sorted(ef_data.industry_sectors) if ef_data.industry_sectors else []
    
    # Check for duplicate (excluding current entry) - use simpler check without industry_sectors array comparison
    # Only check core identifying fields to avoid array ordering issues
    duplicate = await db.scope3_ef.find_one({
        "id": {"$ne": ef_id},
        "category": ef_data.category,
        "method": ef_data.method,
        "activity": ef_data.activity,
        "region": ef_data.region or "Global",
        "year_applicable": ef_data.year_applicable,
        "source": ef_data.source
    })
    if duplicate:
        raise HTTPException(
            status_code=400, 
            detail="A duplicate entry already exists with the same combination of category, method, activity, region, year, and source"
        )
    
    update_dict = ef_data.model_dump()
    update_dict["region"] = ef_data.region or "Global"
    update_dict["industry_sectors"] = industry_sectors_sorted
    update_dict["updated_by"] = current_user["id"]
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.scope3_ef.update_one({"id": ef_id}, {"$set": update_dict})
    
    updated = await db.scope3_ef.find_one({"id": ef_id}, {"_id": 0})
    return Scope3EFResponse(**updated)

@router.delete("/super-admin/scope3-ef/{ef_id}")
async def delete_scope3_ef(ef_id: str, current_user: dict = Depends(get_super_admin_user)):
    """Delete a Scope 3 emission factor entry"""
    result = await db.scope3_ef.delete_one({"id": ef_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Scope 3 EF entry not found")
    return {"message": "Scope 3 EF entry deleted successfully"}

@router.get("/scope3-ef")
async def get_scope3_ef_for_users(
    current_user: dict = Depends(get_current_user),
    page: int = 1,
    limit: int = 50,
    search: Optional[str] = None,
    category: Optional[str] = None,
    method: Optional[str] = None,
    region: Optional[str] = None,
    year: Optional[int] = None,
    sub_scope: Optional[str] = None,
    subcategory: Optional[str] = None
):
    """Get paginated Scope 3 emission factors (for Admin/User)"""
    # Build query
    query = {}
    
    if search:
        query["$or"] = [
            {"activity": {"$regex": search, "$options": "i"}},
            {"category": {"$regex": search, "$options": "i"}}
        ]
    
    if category:
        query["category"] = {"$regex": category, "$options": "i"}
    
    if method:
        query["method"] = method
    
    if region:
        query["region"] = region
    
    if year:
        query["year_applicable"] = year
    
    if sub_scope:
        query["sub_scope"] = sub_scope
    
    if subcategory:
        query["subcategory"] = subcategory
    
    # Get total count
    total = await db.scope3_ef.count_documents(query)
    
    # Calculate skip
    skip = (page - 1) * limit
    
    # Fetch paginated results
    factors = await db.scope3_ef.find(query, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    
    return {
        "data": [Scope3EFResponse(**f) for f in factors],
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": (total + limit - 1) // limit
    }

@router.get("/scope3-ef/categories-by-sub-scope")
async def get_categories_by_sub_scope(
    sub_scope: str,
    current_user: dict = Depends(get_current_user)
):
    """Get distinct categories that have entries with the specified sub_scope (e.g., 'biogenic')"""
    # Use aggregation to get distinct categories with the specified sub_scope
    pipeline = [
        {"$match": {"sub_scope": sub_scope, "is_active": {"$ne": False}}},
        {"$group": {"_id": "$category"}},
        {"$sort": {"_id": 1}}
    ]
    
    result = await db.scope3_ef.aggregate(pipeline).to_list(100)
    categories = [doc["_id"] for doc in result if doc["_id"]]
    
    return {
        "sub_scope": sub_scope,
        "categories": categories,
        "count": len(categories)
    }

@router.get("/scope3-ef/categories")
async def get_scope3_categories(
    current_user: dict = Depends(get_current_user)
):
    """Get distinct Scope 3 categories (C1, C2, etc.) for base year manual addition"""
    # Use aggregation to get distinct categories
    pipeline = [
        {"$match": {"is_active": {"$ne": False}}},
        {"$group": {"_id": "$category"}},
        {"$sort": {"_id": 1}}
    ]
    
    result = await db.scope3_ef.aggregate(pipeline).to_list(100)
    categories = [doc["_id"] for doc in result if doc["_id"]]
    
    return categories

@router.get("/scope3-ef/activities")
async def get_scope3_activities(
    category: str,
    current_user: dict = Depends(get_current_user)
):
    """Get distinct activities for a Scope 3 category (for base year manual addition subcategory dropdown)"""
    # Use aggregation to get distinct activities for the category
    pipeline = [
        {"$match": {"category": category, "is_active": {"$ne": False}}},
        {"$group": {"_id": "$activity"}},
        {"$sort": {"_id": 1}}
    ]
    
    result = await db.scope3_ef.aggregate(pipeline).to_list(1000)
    activities = [doc["_id"] for doc in result if doc["_id"]]
    
    return activities

# Endpoint for fetching emission categories (for base year manual addition)
@router.get("/emission-categories")
async def get_emission_categories(
    current_user: dict = Depends(get_current_user)
):
    """Get emission categories for Scope 1 and Scope 2 (for base year manual category addition)"""
    # Return predefined categories for Scope 1 & 2
    # These are typically: Stationary Combustion, Mobile Combustion, Fugitive Emissions, etc.
    categories = [
        # Scope 1 categories
        {"scope": "scope1", "name": "Stationary Combustion", "category": "Stationary Combustion"},
        {"scope": "scope1", "name": "Mobile Combustion", "category": "Mobile Combustion"},
        {"scope": "scope1", "name": "Fugitive Emissions", "category": "Fugitive Emissions"},
        {"scope": "scope1", "name": "Process Emissions", "category": "Process Emissions"},
        # Scope 2 categories
        {"scope": "scope2", "name": "Purchased Electricity", "category": "Purchased Electricity"},
        {"scope": "scope2", "name": "Purchased Steam", "category": "Purchased Steam"},
        {"scope": "scope2", "name": "Purchased Heating", "category": "Purchased Heating"},
        {"scope": "scope2", "name": "Purchased Cooling", "category": "Purchased Cooling"},
        # Biogenic categories
        {"scope": "biogenic", "name": "Biogenic CO2 Emissions", "category": "Biogenic CO2 Emissions"},
        {"scope": "biogenic", "name": "Biofuel Combustion", "category": "Biofuel Combustion"},
        # Sinks categories
        {"scope": "sinks", "name": "Tree Plantation", "category": "Tree Plantation"},
        {"scope": "sinks", "name": "Carbon Capture", "category": "Carbon Capture"},
        {"scope": "sinks", "name": "Other Carbon Removal", "category": "Other Carbon Removal"},
    ]
    
    return categories

# Get fuel names for a specific category (for Scope 1&2 base year manual addition)
@router.get("/base-year/fuel-names")
async def get_fuel_names_for_category(
    category: str,
    current_user: dict = Depends(get_current_user)
):
    """Get distinct fuel names from fuel_database for a specific category"""
    # Query the 'categories' array field which contains multiple categories per fuel
    # e.g., ['Stationary Combustion', 'Mobile Combustion']
    pipeline = [
        {"$match": {"categories": category}},
        {"$group": {"_id": "$fuel_name"}},
        {"$sort": {"_id": 1}}
    ]
    
    result = await db.fuel_database.aggregate(pipeline).to_list(500)
    fuel_names = [doc["_id"] for doc in result if doc["_id"]]
    
    # Fallback: also check the singular 'category' field
    if not fuel_names:
        pipeline = [
            {"$match": {"category": category}},
            {"$group": {"_id": "$fuel_name"}},
            {"$sort": {"_id": 1}}
        ]
        result = await db.fuel_database.aggregate(pipeline).to_list(500)
        fuel_names = [doc["_id"] for doc in result if doc["_id"]]
    
    return fuel_names

# Get fuel names for Biogenic (Direct) emissions
@router.get("/base-year/biogenic-fuels")
async def get_biogenic_fuel_names(
    current_user: dict = Depends(get_current_user)
):
    """Get distinct fuel names from fuel_database for biogenic emissions (Scope 1)"""
    # Fetch biogenic fuel types - check fuel_name field for biogenic keywords
    pipeline = [
        {"$match": {"$or": [
            {"fuel_name": {"$regex": "bio", "$options": "i"}},
            {"fuel_name": {"$regex": "ethanol", "$options": "i"}},
            {"fuel_name": {"$regex": "biodiesel", "$options": "i"}},
            {"fuel_name": {"$regex": "biomass", "$options": "i"}},
            {"fuel_name": {"$regex": "wood", "$options": "i"}},
            {"fuel_name": {"$regex": "charcoal", "$options": "i"}},
            {"category": {"$regex": "bio", "$options": "i"}}
        ]}},
        {"$group": {"_id": "$fuel_name"}},
        {"$sort": {"_id": 1}}
    ]
    
    result = await db.fuel_database.aggregate(pipeline).to_list(500)
    fuel_names = [doc["_id"] for doc in result if doc["_id"]]
    
    # If no biogenic-specific fuels found, return all fuels as fallback
    if not fuel_names:
        pipeline = [
            {"$match": {"fuel_name": {"$exists": True, "$ne": None}}},
            {"$group": {"_id": "$fuel_name"}},
            {"$sort": {"_id": 1}},
            {"$limit": 100}
        ]
        result = await db.fuel_database.aggregate(pipeline).to_list(100)
        fuel_names = [doc["_id"] for doc in result if doc["_id"]]
    
    return fuel_names

# Get Scope 3 biogenic subcategories for specific categories
@router.get("/base-year/biogenic-indirect-subcategories")
async def get_biogenic_indirect_subcategories(
    category: str,
    current_user: dict = Depends(get_current_user)
):
    """Get activities from scope3_ef where sub_scope = biogenic for a specific category (C3, C8, C10, C11, C13, C14)"""
    # Allowed categories for Biogenic (Indirect)
    allowed_categories = ["C3", "C8", "C10", "C11", "C13", "C14"]
    
    # Extract the category code (e.g., "C3" from "C3 - Fuel and Energy...")
    category_code = category.split(" - ")[0].strip() if " - " in category else category
    
    if category_code not in allowed_categories:
        return []
    
    # Fetch activities where sub_scope = biogenic for this category
    pipeline = [
        {"$match": {
            "category": {"$regex": f"^{category_code}", "$options": "i"},
            "sub_scope": {"$regex": "biogenic", "$options": "i"}
        }},
        {"$group": {"_id": "$activity"}},
        {"$sort": {"_id": 1}}
    ]
    
    result = await db.scope3_ef.aggregate(pipeline).to_list(500)
    activities = [doc["_id"] for doc in result if doc["_id"]]
    
    return activities

# ============================================
# GWP (Global Warming Potential) CONFIGURATION
# ============================================
# Get active GWP configuration
@router.get("/gwp-config")
async def get_active_gwp_config():
    """Get the currently active GWP configuration"""
    config = await db.gwp_config.find_one({"is_active": True}, {"_id": 0})
    
    if not config:
        # Return AR6 defaults if no config exists
        return {
            "id": None,
            "source_name": GWP_DEFAULT_SOURCE,
            "source_year": 2021,
            "time_horizon": "100-year",
            "co2_gwp": GWP_VALUES["CO2"],
            "ch4_fossil_gwp": 29.8,  # AR6 100-year GWP for fossil CH4
            "ch4_non_fossil_gwp": 27.0,  # AR6 100-year GWP for non-fossil CH4
            "n2o_gwp": GWP_VALUES["N2O"],
            "notes": "Default IPCC AR6 values (100-year GWP)",
            "is_active": True,
            "is_default": True
        }
    
    config["is_default"] = False
    return config

# Get all GWP configurations (for history/reference)
@router.get("/super-admin/gwp-configs")
async def get_all_gwp_configs(current_user: dict = Depends(get_super_admin_user)):
    """Get all GWP configurations including historical ones"""
    configs = await db.gwp_config.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return configs

# Create new GWP configuration
@router.post("/super-admin/gwp-config")
async def create_gwp_config(config: GWPConfigCreate, current_user: dict = Depends(get_super_admin_user)):
    """Create a new GWP configuration (SuperAdmin only)"""
    
    # If this is set as active, deactivate all others
    if config.is_active:
        await db.gwp_config.update_many({}, {"$set": {"is_active": False}})
    
    new_config = {
        "id": str(uuid.uuid4()),
        "source_name": config.source_name,
        "source_year": config.source_year,
        "time_horizon": config.time_horizon,
        "co2_gwp": config.co2_gwp,
        "ch4_fossil_gwp": config.ch4_fossil_gwp,
        "ch4_non_fossil_gwp": config.ch4_non_fossil_gwp,
        "n2o_gwp": config.n2o_gwp,
        "notes": config.notes,
        "is_active": config.is_active,
        "created_by": current_user["id"],
        "created_by_email": current_user["email"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": None
    }
    
    await db.gwp_config.insert_one(new_config)
    if "_id" in new_config:
        del new_config["_id"]
    
    return {"message": "GWP configuration created successfully", "config": new_config}

# Update GWP configuration
@router.put("/super-admin/gwp-config/{config_id}")
async def update_gwp_config(config_id: str, config: GWPConfigUpdate, current_user: dict = Depends(get_super_admin_user)):
    """Update an existing GWP configuration (SuperAdmin only)"""
    
    existing = await db.gwp_config.find_one({"id": config_id})
    if not existing:
        raise HTTPException(status_code=404, detail="GWP configuration not found")
    
    update_data = {k: v for k, v in config.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = current_user["id"]
    update_data["updated_by_email"] = current_user["email"]
    
    # If setting this as active, deactivate all others
    if update_data.get("is_active"):
        await db.gwp_config.update_many({"id": {"$ne": config_id}}, {"$set": {"is_active": False}})
    
    await db.gwp_config.update_one({"id": config_id}, {"$set": update_data})
    
    updated = await db.gwp_config.find_one({"id": config_id}, {"_id": 0})
    return {"message": "GWP configuration updated successfully", "config": updated}

# Delete GWP configuration
@router.delete("/super-admin/gwp-config/{config_id}")
async def delete_gwp_config(config_id: str, current_user: dict = Depends(get_super_admin_user)):
    """Delete a GWP configuration (SuperAdmin only). Cannot delete the active config."""
    
    existing = await db.gwp_config.find_one({"id": config_id})
    if not existing:
        raise HTTPException(status_code=404, detail="GWP configuration not found")
    
    if existing.get("is_active"):
        raise HTTPException(status_code=400, detail="Cannot delete the active GWP configuration. Set another as active first.")
    
    await db.gwp_config.delete_one({"id": config_id})
    return {"message": "GWP configuration deleted successfully"}

# Set a config as active
@router.post("/super-admin/gwp-config/{config_id}/activate")
async def activate_gwp_config(config_id: str, current_user: dict = Depends(get_super_admin_user)):
    """Set a GWP configuration as the active one (SuperAdmin only)"""
    
    existing = await db.gwp_config.find_one({"id": config_id})
    if not existing:
        raise HTTPException(status_code=404, detail="GWP configuration not found")
    
    # Deactivate all others
    await db.gwp_config.update_many({}, {"$set": {"is_active": False}})
    
    # Activate this one
    await db.gwp_config.update_one(
        {"id": config_id}, 
        {"$set": {
            "is_active": True,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": current_user["id"]
        }}
    )
    
    return {"message": "GWP configuration activated successfully"}

# Seed default GWP configurations (AR5 and AR6)
@router.post("/super-admin/seed-gwp-configs")
async def seed_gwp_configs(current_user: dict = Depends(get_super_admin_user)):
    """Seed default GWP configurations for AR5 and AR6 (SuperAdmin only)"""
    
    default_configs = [
        {
            "id": str(uuid.uuid4()),
            "source_name": "IPCC AR6",
            "source_year": 2021,
            "time_horizon": "100-year",
            "co2_gwp": 1,
            "ch4_fossil_gwp": 29.8,
            "ch4_non_fossil_gwp": 27.0,
            "n2o_gwp": 273,
            "notes": "IPCC Sixth Assessment Report (AR6, 2021) - 100-year Global Warming Potential values. CH4 fossil includes climate-carbon feedback.",
            "is_active": True,
            "created_by": current_user["id"],
            "created_by_email": current_user["email"],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": None
        },
        {
            "id": str(uuid.uuid4()),
            "source_name": "IPCC AR5",
            "source_year": 2014,
            "time_horizon": "100-year",
            "co2_gwp": 1,
            "ch4_fossil_gwp": 30,
            "ch4_non_fossil_gwp": 28,
            "n2o_gwp": 265,
            "notes": "IPCC Fifth Assessment Report (AR5, 2014) - 100-year Global Warming Potential values. Legacy reference.",
            "is_active": False,
            "created_by": current_user["id"],
            "created_by_email": current_user["email"],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": None
        }
    ]
    
    created_count = 0
    for config in default_configs:
        existing = await db.gwp_config.find_one({"source_name": config["source_name"], "time_horizon": config["time_horizon"]})
        if not existing:
            await db.gwp_config.insert_one(config)
            created_count += 1
    
    return {"message": f"Created {created_count} GWP configurations", "total": len(default_configs)}

# Legacy endpoint for backwards compatibility
@router.get("/gwp-values")
async def get_gwp_values():
    """Get GWP values (from active config or defaults) - Legacy endpoint"""
    config = await db.gwp_config.find_one({"is_active": True}, {"_id": 0})
    
    if config:
        return {
            "CO2": config.get("co2_gwp", 1),
            "CH4": config.get("ch4_gwp", GWP_VALUES["CH4"]),
            "N2O": config.get("n2o_gwp", GWP_VALUES["N2O"]),
            "source": config.get("source_name", "Custom"),
            "time_horizon": config.get("time_horizon", "100-year")
        }
    
    return {
        "CO2": GWP_VALUES["CO2"],
        "CH4": GWP_VALUES["CH4"],
        "N2O": GWP_VALUES["N2O"],
        "source": GWP_DEFAULT_SOURCE,
        "time_horizon": "100-year"
    }

# ============================================
# CURRENCY CONVERSION CONFIGURATION
# ============================================
# Get active currency conversion config for a specific currency pair and year
@router.get("/currency-conversion")
async def get_currency_conversions(
    source_currency: Optional[str] = None,
    year: Optional[int] = None
):
    """Get currency conversion configurations, optionally filtered by currency and year"""
    query = {}
    if source_currency:
        query["source_currency"] = source_currency.upper()
    if year:
        query["year_applicable"] = year
    
    configs = await db.currency_conversion.find(query, {"_id": 0}).sort([("source_currency", 1), ("year_applicable", -1)]).to_list(500)
    return configs

# Get active currency conversion for a specific currency/year
@router.get("/currency-conversion/active")
async def get_active_currency_conversion(source_currency: str, year: Optional[int] = None):
    """Get the active currency conversion for a specific source currency"""
    query = {"source_currency": source_currency.upper(), "is_active": True}
    if year:
        query["year_applicable"] = year
    
    config = await db.currency_conversion.find_one(query, {"_id": 0})
    if not config:
        return {"message": "No active currency conversion found for this currency", "data": None}
    return config

# Get all currency conversions (SuperAdmin)
@router.get("/super-admin/currency-conversions")
async def get_all_currency_conversions(current_user: dict = Depends(get_super_admin_user)):
    """Get all currency conversion configurations (SuperAdmin only)"""
    configs = await db.currency_conversion.find({}, {"_id": 0}).sort([("source_currency", 1), ("year_applicable", -1)]).to_list(1000)
    return configs

# Create new currency conversion
@router.post("/super-admin/currency-conversion")
async def create_currency_conversion(config: CurrencyConversionCreate, current_user: dict = Depends(get_super_admin_user)):
    """Create a new currency conversion configuration (SuperAdmin only)"""
    
    # Check if a config already exists for this currency pair and year
    existing = await db.currency_conversion.find_one({
        "source_currency": config.source_currency.upper(),
        "target_currency": config.target_currency.upper(),
        "year_applicable": config.year_applicable
    })
    
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"Currency conversion for {config.source_currency}/{config.target_currency} for year {config.year_applicable} already exists"
        )
    
    new_config = {
        "id": str(uuid.uuid4()),
        "source_currency": config.source_currency.upper(),
        "target_currency": config.target_currency.upper(),
        "year_applicable": config.year_applicable,
        "purchase_parity": config.purchase_parity,
        "inflation_factor": config.inflation_factor,
        "exchange_rate": config.exchange_rate,
        "source": config.source,
        "notes": config.notes,
        "is_active": config.is_active,
        "created_by": current_user["id"],
        "created_by_email": current_user["email"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": None
    }
    
    await db.currency_conversion.insert_one(new_config)
    if "_id" in new_config:
        del new_config["_id"]
    
    return {"message": "Currency conversion configuration created successfully", "config": new_config}

# Update currency conversion
@router.put("/super-admin/currency-conversion/{config_id}")
async def update_currency_conversion(config_id: str, config: CurrencyConversionUpdate, current_user: dict = Depends(get_super_admin_user)):
    """Update an existing currency conversion configuration (SuperAdmin only)"""
    
    existing = await db.currency_conversion.find_one({"id": config_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Currency conversion configuration not found")
    
    update_data = {k: v for k, v in config.dict().items() if v is not None}
    
    # Convert currencies to uppercase if provided
    if "source_currency" in update_data:
        update_data["source_currency"] = update_data["source_currency"].upper()
    if "target_currency" in update_data:
        update_data["target_currency"] = update_data["target_currency"].upper()
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = current_user["id"]
    update_data["updated_by_email"] = current_user["email"]
    
    await db.currency_conversion.update_one({"id": config_id}, {"$set": update_data})
    
    updated = await db.currency_conversion.find_one({"id": config_id}, {"_id": 0})
    return {"message": "Currency conversion configuration updated successfully", "config": updated}

# Delete currency conversion
@router.delete("/super-admin/currency-conversion/{config_id}")
async def delete_currency_conversion(config_id: str, current_user: dict = Depends(get_super_admin_user)):
    """Delete a currency conversion configuration (SuperAdmin only)"""
    
    existing = await db.currency_conversion.find_one({"id": config_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Currency conversion configuration not found")
    
    await db.currency_conversion.delete_one({"id": config_id})
    return {"message": "Currency conversion configuration deleted successfully"}

# Bulk import currency conversions
@router.post("/super-admin/currency-conversion/bulk")
async def bulk_create_currency_conversions(
    configs: List[CurrencyConversionCreate], 
    current_user: dict = Depends(get_super_admin_user)
):
    """Bulk import currency conversion configurations (SuperAdmin only)"""
    created_count = 0
    updated_count = 0
    
    for config in configs:
        existing = await db.currency_conversion.find_one({
            "source_currency": config.source_currency.upper(),
            "target_currency": config.target_currency.upper(),
            "year_applicable": config.year_applicable
        })
        
        if existing:
            # Update existing
            update_data = {
                "purchase_parity": config.purchase_parity,
                "inflation_factor": config.inflation_factor,
                "exchange_rate": config.exchange_rate,
                "source": config.source,
                "notes": config.notes,
                "is_active": config.is_active,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": current_user["id"]
            }
            await db.currency_conversion.update_one({"id": existing["id"]}, {"$set": update_data})
            updated_count += 1
        else:
            # Create new
            new_config = {
                "id": str(uuid.uuid4()),
                "source_currency": config.source_currency.upper(),
                "target_currency": config.target_currency.upper(),
                "year_applicable": config.year_applicable,
                "purchase_parity": config.purchase_parity,
                "inflation_factor": config.inflation_factor,
                "exchange_rate": config.exchange_rate,
                "source": config.source,
                "notes": config.notes,
                "is_active": config.is_active,
                "created_by": current_user["id"],
                "created_by_email": current_user["email"],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": None
            }
            await db.currency_conversion.insert_one(new_config)
            created_count += 1
    
    return {"message": f"Bulk import complete: {created_count} created, {updated_count} updated"}

# Get distinct currencies available
@router.get("/currency-conversion/currencies")
async def get_available_currencies():
    """Get list of available source currencies"""
    currencies = await db.currency_conversion.distinct("source_currency")
    return sorted(currencies)

# Get distinct years available for a currency
@router.get("/currency-conversion/years/{source_currency}")
async def get_available_years(source_currency: str):
    """Get list of available years for a specific currency"""
    years = await db.currency_conversion.distinct("year_applicable", {"source_currency": source_currency.upper()})
    return sorted(years, reverse=True)


# Super Admin - Formula Parameters Management
@router.get("/super-admin/formula-parameters", response_model=List[FormulaParameterResponse])
async def get_all_formula_parameters(current_user: dict = Depends(get_super_admin_user)):
    """Get all formula parameters"""
    params = await db.formula_parameters.find({}, {"_id": 0}).to_list(1000)
    return [FormulaParameterResponse(**p) for p in params]

@router.post("/super-admin/formula-parameters", response_model=FormulaParameterResponse)
async def create_formula_parameter(
    param_data: FormulaParameterCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    """Create a new formula parameter"""
    # Check for duplicate by parameter_key
    existing = await db.formula_parameters.find_one({"parameter_key": param_data.parameter_key})
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"A parameter with key '{param_data.parameter_key}' already exists."
        )
    
    param_dict = param_data.model_dump()
    param_dict["id"] = str(uuid.uuid4())
    param_dict["created_by"] = current_user["id"]
    param_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    param_dict["updated_by"] = None
    param_dict["updated_at"] = None
    
    await db.formula_parameters.insert_one(param_dict)
    return FormulaParameterResponse(**param_dict)

@router.put("/super-admin/formula-parameters/{param_id}", response_model=FormulaParameterResponse)
async def update_formula_parameter(
    param_id: str,
    param_data: FormulaParameterCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    """Update a formula parameter"""
    existing = await db.formula_parameters.find_one({"id": param_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Parameter not found")
    
    # Check for duplicate key (excluding current)
    duplicate = await db.formula_parameters.find_one({
        "id": {"$ne": param_id},
        "parameter_key": param_data.parameter_key
    })
    if duplicate:
        raise HTTPException(
            status_code=400, 
            detail=f"A parameter with key '{param_data.parameter_key}' already exists."
        )
    
    update_dict = param_data.model_dump()
    update_dict["updated_by"] = current_user["id"]
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.formula_parameters.update_one({"id": param_id}, {"$set": update_dict})
    updated = await db.formula_parameters.find_one({"id": param_id}, {"_id": 0})
    return FormulaParameterResponse(**updated)

@router.delete("/super-admin/formula-parameters/{param_id}")
async def delete_formula_parameter(param_id: str, current_user: dict = Depends(get_super_admin_user)):
    """Delete a formula parameter"""
    result = await db.formula_parameters.delete_one({"id": param_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Parameter not found")
    return {"message": "Parameter deleted successfully"}

# Public endpoint to get formula parameters (for calculation)
@router.get("/formula-parameters", response_model=List[FormulaParameterResponse])
async def get_formula_parameters_for_users(current_user: dict = Depends(get_current_user)):
    """Get all formula parameters for calculation forms"""
    params = await db.formula_parameters.find({}, {"_id": 0}).sort("display_order", 1).to_list(1000)
    return [FormulaParameterResponse(**p) for p in params]

# Super Admin - Formula Definitions (the actual formulas/equations)
@router.get("/super-admin/formula-definitions", response_model=List[FormulaDefinitionResponse])
async def get_all_formula_definitions(current_user: dict = Depends(get_super_admin_user)):
    """Get all formula definitions"""
    formulas = await db.formula_definitions.find({}, {"_id": 0}).sort("display_order", 1).to_list(1000)
    return [FormulaDefinitionResponse(**f) for f in formulas]

@router.post("/super-admin/formula-definitions", response_model=FormulaDefinitionResponse)
async def create_formula_definition(
    formula_data: FormulaDefinitionCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    """Create a new formula definition"""
    # Check for duplicate by formula_key
    existing = await db.formula_definitions.find_one({"formula_key": formula_data.formula_key})
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"A formula with key '{formula_data.formula_key}' already exists."
        )
    
    formula_dict = formula_data.model_dump()
    formula_dict["id"] = str(uuid.uuid4())
    formula_dict["created_by"] = current_user["id"]
    formula_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    formula_dict["updated_by"] = None
    formula_dict["updated_at"] = None
    
    await db.formula_definitions.insert_one(formula_dict)
    return FormulaDefinitionResponse(**formula_dict)

@router.put("/super-admin/formula-definitions/{formula_id}", response_model=FormulaDefinitionResponse)
async def update_formula_definition(
    formula_id: str,
    formula_data: FormulaDefinitionCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    """Update a formula definition"""
    existing = await db.formula_definitions.find_one({"id": formula_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Formula not found")
    
    # Check for duplicate key (excluding current)
    duplicate = await db.formula_definitions.find_one({
        "id": {"$ne": formula_id},
        "formula_key": formula_data.formula_key
    })
    if duplicate:
        raise HTTPException(
            status_code=400, 
            detail=f"A formula with key '{formula_data.formula_key}' already exists."
        )
    
    update_dict = formula_data.model_dump()
    update_dict["updated_by"] = current_user["id"]
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.formula_definitions.update_one({"id": formula_id}, {"$set": update_dict})
    updated = await db.formula_definitions.find_one({"id": formula_id}, {"_id": 0})
    return FormulaDefinitionResponse(**updated)

@router.delete("/super-admin/formula-definitions/{formula_id}")
async def delete_formula_definition(formula_id: str, current_user: dict = Depends(get_super_admin_user)):
    """Delete a formula definition"""
    result = await db.formula_definitions.delete_one({"id": formula_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Formula not found")
    return {"message": "Formula deleted successfully"}

# Public endpoint to get formula definitions (for calculation)
@router.get("/formula-definitions", response_model=List[FormulaDefinitionResponse])
async def get_formula_definitions_for_users(current_user: dict = Depends(get_current_user)):
    """Get all active formula definitions for calculation"""
    formulas = await db.formula_definitions.find({"is_active": True}, {"_id": 0}).sort("display_order", 1).to_list(1000)
    return [FormulaDefinitionResponse(**f) for f in formulas]

# ====================== EMISSION CONFIGURATIONS ======================
# SuperAdmin can map scopes/categories to formulas dynamically

@router.get("/super-admin/emission-configurations", response_model=List[EmissionConfigurationResponse])
async def get_all_emission_configurations(current_user: dict = Depends(get_super_admin_user)):
    """Get all emission configurations (SuperAdmin only)"""
    configs = await db.emission_configurations.find({}, {"_id": 0}).sort("priority", -1).to_list(1000)
    
    # Populate formula_name for each config
    result = []
    for config in configs:
        formula = await db.formula_definitions.find_one({"id": config.get("formula_id")}, {"_id": 0})
        config["formula_name"] = formula.get("formula_name") if formula else "Unknown"
        result.append(EmissionConfigurationResponse(**config))
    
    return result

@router.post("/super-admin/emission-configurations", response_model=EmissionConfigurationResponse)
async def create_emission_configuration(config_data: EmissionConfigurationCreate, current_user: dict = Depends(get_super_admin_user)):
    """Create a new emission configuration (SuperAdmin only)"""
    # Verify formula exists
    formula = await db.formula_definitions.find_one({"id": config_data.formula_id}, {"_id": 0})
    if not formula:
        raise HTTPException(status_code=400, detail="Formula not found")
    
    config_dict = config_data.model_dump()
    config_dict["id"] = str(uuid.uuid4())
    config_dict["created_by"] = current_user["id"]
    config_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.emission_configurations.insert_one(config_dict)
    config_dict["formula_name"] = formula.get("formula_name")
    return EmissionConfigurationResponse(**config_dict)

@router.put("/super-admin/emission-configurations/{config_id}", response_model=EmissionConfigurationResponse)
async def update_emission_configuration(config_id: str, config_data: EmissionConfigurationCreate, current_user: dict = Depends(get_super_admin_user)):
    """Update an emission configuration (SuperAdmin only)"""
    existing = await db.emission_configurations.find_one({"id": config_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Configuration not found")
    
    # Verify formula exists
    formula = await db.formula_definitions.find_one({"id": config_data.formula_id}, {"_id": 0})
    if not formula:
        raise HTTPException(status_code=400, detail="Formula not found")
    
    update_dict = config_data.model_dump()
    update_dict["updated_by"] = current_user["id"]
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.emission_configurations.update_one({"id": config_id}, {"$set": update_dict})
    updated = await db.emission_configurations.find_one({"id": config_id}, {"_id": 0})
    updated["formula_name"] = formula.get("formula_name")
    return EmissionConfigurationResponse(**updated)

@router.delete("/super-admin/emission-configurations/{config_id}")
async def delete_emission_configuration(config_id: str, current_user: dict = Depends(get_super_admin_user)):
    """Delete an emission configuration (SuperAdmin only)"""
    result = await db.emission_configurations.delete_one({"id": config_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Configuration not found")
    return {"message": "Configuration deleted successfully"}

# Public endpoint to get emission configurations (for Admin/User calculation)
@router.get("/emission-configurations", response_model=List[EmissionConfigurationResponse])
async def get_emission_configurations_for_users(current_user: dict = Depends(get_current_user)):
    """Get active emission configurations for calculation"""
    configs = await db.emission_configurations.find({"is_active": True}, {"_id": 0}).sort("priority", -1).to_list(1000)
    
    # Populate formula_name and full formula data for each config
    result = []
    for config in configs:
        formula = await db.formula_definitions.find_one({"id": config.get("formula_id")}, {"_id": 0})
        config["formula_name"] = formula.get("formula_name") if formula else "Unknown"
        result.append(EmissionConfigurationResponse(**config))
    
    return result

# Super Admin Dashboard
@router.get("/super-admin/dashboard")
async def get_super_admin_dashboard(current_user: dict = Depends(get_super_admin_user)):
    # Include all orgs (active and inactive) for dashboard view
    orgs = await db.organizations.find({}, {"_id": 0}).to_list(1000)
    all_facilities = await db.facilities.find({}, {"_id": 0}).to_list(10000)
    all_users = await db.users.find({"role": {"$in": ["admin", "user"]}}, {"_id": 0}).to_list(10000)
    
    org_stats = []
    total_admins = 0
    total_users = 0
    
    for org in orgs:
        org_facilities = [f for f in all_facilities if f.get("organization_id") == org["id"]]
        org_admins = [u for u in all_users if u.get("organization_id") == org["id"] and u.get("role") == "admin"]
        org_users_list = [u for u in all_users if u.get("organization_id") == org["id"] and u.get("role") == "user"]
        
        total_admins += len(org_admins)
        total_users += len(org_users_list)
        
        org_stats.append({
            "organization_id": org["id"],
            "organization_name": org["name"],
            "is_active": org.get("is_active", True) and not org.get("is_deleted", False),
            "is_deleted": org.get("is_deleted", False),
            "total_facilities": len(org_facilities),
            "total_admins": len(org_admins),
            "total_users": len(org_users_list),
            "max_facilities": org.get("max_facilities", 10),
            "max_admins": org.get("max_admins", 5),
            "max_users": org.get("max_users", 20),
            "subscription_expires_at": org.get("subscription_expires_at"),
            "payment_status": org.get("payment_status"),
            "selected_plan": org.get("selected_plan"),
            "country": org.get("country"),
            "date_of_joining": org.get("date_of_joining"),
        })
    
    return {
        "total_organizations": len(orgs),
        "total_facilities": len(all_facilities),
        "total_admins": total_admins,
        "total_users": total_users,
        "organization_stats": org_stats
    }

# Organization endpoints (Admin access + User read-only)
# Phase B3: /organizations/my (GET, PUT) moved to modules/organizations/router.py
# Facility endpoints
# Phase B3: 6 facility routes moved to modules/facilities/router.py
# Emission factors endpoints
# NOTE: Standard factors endpoint removed - all standard factors now come from database via /emission-factors

@router.get("/emission-factors/standard")
async def get_standard_factors():
    # Return standard factors from DB (created by Super Admin with is_custom=false)
    factors = await db.emission_factors.find({"is_custom": False}, {"_id": 0}).to_list(1000)
    return [EmissionFactorResponse(**f) for f in factors]

@router.get("/emission-factors", response_model=List[EmissionFactorResponse])
async def get_emission_factors(current_user: dict = Depends(get_current_user)):
    # Get all standard factors (is_custom=false) for everyone
    standard_factors = await db.emission_factors.find({"is_custom": False}, {"_id": 0}).to_list(1000)
    
    # Get custom factors based on role
    custom_factors = []
    if current_user["role"] == "super_admin":
        # Super Admin sees all factors
        custom_factors = await db.emission_factors.find({"is_custom": True}, {"_id": 0}).to_list(1000)
    elif current_user["role"] in ["admin", "user"]:
        # Admin/User sees custom factors from their organization
        org_id = current_user.get("organization_id")
        if org_id:
            custom_factors = await db.emission_factors.find({
                "is_custom": True,
                "organization_id": org_id
            }, {"_id": 0}).to_list(1000)
    
    all_factors = standard_factors + custom_factors
    return [EmissionFactorResponse(**f) for f in all_factors]

# Custom Emission Factor endpoints for Admin/User
@router.post("/custom-emission-factors", response_model=EmissionFactorResponse)
async def create_custom_emission_factor(
    factor_data: EmissionFactorCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a custom emission factor (Admin/User only)"""
    if current_user["role"] == "super_admin":
        raise HTTPException(status_code=400, detail="Super Admin should use /super-admin/emission-factors for standard factors")
    
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    # Require justification for custom factors
    if not factor_data.justification:
        raise HTTPException(status_code=400, detail="Justification is required for custom emission factors")
    
    # Check for duplicate within organization
    existing = await db.emission_factors.find_one({
        "organization_id": org_id,
        "scope": factor_data.scope,
        "category": factor_data.category,
        "sub_category": factor_data.sub_category,
        "is_custom": True
    })
    if existing:
        raise HTTPException(status_code=400, detail=f"A custom factor already exists for {factor_data.category} / {factor_data.sub_category}")
    
    factor_dict = factor_data.model_dump()
    factor_dict["id"] = str(uuid.uuid4())
    factor_dict["is_custom"] = True
    factor_dict["organization_id"] = org_id
    factor_dict["created_by"] = current_user["id"]
    factor_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    factor_dict["region"] = factor_data.region or "Global (All Regions)"
    
    await db.emission_factors.insert_one(factor_dict)
    return EmissionFactorResponse(**factor_dict)

@router.put("/custom-emission-factors/{factor_id}", response_model=EmissionFactorResponse)
async def update_custom_emission_factor(
    factor_id: str,
    factor_data: EmissionFactorCreate,
    current_user: dict = Depends(get_current_user)
):
    """Update a custom emission factor (Admin/User only)"""
    if current_user["role"] == "super_admin":
        raise HTTPException(status_code=400, detail="Super Admin should use /super-admin/emission-factors")
    
    existing = await db.emission_factors.find_one({"id": factor_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Emission factor not found")
    
    # Only allow editing custom factors from own organization
    if not existing.get("is_custom"):
        raise HTTPException(status_code=403, detail="Cannot edit standard emission factors")
    
    org_id = current_user.get("organization_id")
    if existing.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this factor")
    
    if not factor_data.justification:
        raise HTTPException(status_code=400, detail="Justification is required for custom emission factors")
    
    update_dict = factor_data.model_dump()
    update_dict["is_custom"] = True
    update_dict["updated_by"] = current_user["id"]
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.emission_factors.update_one({"id": factor_id}, {"$set": update_dict})
    updated = await db.emission_factors.find_one({"id": factor_id}, {"_id": 0})
    return EmissionFactorResponse(**updated)

@router.delete("/custom-emission-factors/{factor_id}")
async def delete_custom_emission_factor(
    factor_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a custom emission factor (Admin/User only)"""
    if current_user["role"] == "super_admin":
        raise HTTPException(status_code=400, detail="Super Admin should use /super-admin/emission-factors")
    
    existing = await db.emission_factors.find_one({"id": factor_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Emission factor not found")
    
    if not existing.get("is_custom"):
        raise HTTPException(status_code=403, detail="Cannot delete standard emission factors")
    
    org_id = current_user.get("organization_id")
    if existing.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this factor")
    
    await db.emission_factors.delete_one({"id": factor_id})
    return {"message": "Custom emission factor deleted successfully"}

# Calculation Formulas CRUD (Super Admin only)
@router.post("/calculation-formulas", response_model=CalculationFormulaResponse)
async def create_calculation_formula(formula_data: CalculationFormulaCreate, current_user: dict = Depends(get_super_admin_user)):
    """Create a new calculation formula (Super Admin only)"""
    # Check for duplicate name
    existing = await db.calculation_formulas.find_one({"name": formula_data.name}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Formula with this name already exists")
    
    formula_dict = formula_data.model_dump()
    formula_dict["id"] = str(uuid.uuid4())
    formula_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    formula_dict["updated_at"] = None
    
    await db.calculation_formulas.insert_one(formula_dict)
    return CalculationFormulaResponse(**formula_dict)

@router.get("/calculation-formulas", response_model=List[CalculationFormulaResponse])
async def get_calculation_formulas(
    scope: Optional[str] = None,
    active_only: bool = True,
    current_user: dict = Depends(get_current_user)
):
    """Get all calculation formulas"""
    query = {}
    if scope:
        query["scope"] = scope
    if active_only:
        query["is_active"] = True
    
    formulas = await db.calculation_formulas.find(query, {"_id": 0}).to_list(1000)
    return [CalculationFormulaResponse(**f) for f in formulas]

@router.get("/calculation-formulas/{formula_id}", response_model=CalculationFormulaResponse)
async def get_calculation_formula(formula_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific calculation formula"""
    formula = await db.calculation_formulas.find_one({"id": formula_id}, {"_id": 0})
    if not formula:
        raise HTTPException(status_code=404, detail="Formula not found")
    return CalculationFormulaResponse(**formula)

@router.put("/calculation-formulas/{formula_id}", response_model=CalculationFormulaResponse)
async def update_calculation_formula(
    formula_id: str,
    formula_data: CalculationFormulaCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    """Update a calculation formula (Super Admin only)"""
    existing = await db.calculation_formulas.find_one({"id": formula_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Formula not found")
    
    # Check for duplicate name (excluding current formula)
    duplicate = await db.calculation_formulas.find_one({
        "name": formula_data.name,
        "id": {"$ne": formula_id}
    }, {"_id": 0})
    if duplicate:
        raise HTTPException(status_code=400, detail="Another formula with this name already exists")
    
    update_dict = formula_data.model_dump()
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.calculation_formulas.update_one({"id": formula_id}, {"$set": update_dict})
    updated = await db.calculation_formulas.find_one({"id": formula_id}, {"_id": 0})
    return CalculationFormulaResponse(**updated)

@router.delete("/calculation-formulas/{formula_id}")
async def delete_calculation_formula(formula_id: str, current_user: dict = Depends(get_super_admin_user)):
    """Delete a calculation formula (Super Admin only)"""
    existing = await db.calculation_formulas.find_one({"id": formula_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Formula not found")
    
    await db.calculation_formulas.delete_one({"id": formula_id})
    return {"message": "Calculation formula deleted successfully"}

# Sector management endpoints (Super Admin)
@router.post("/super-admin/sectors", response_model=SectorResponse)
async def create_sector(sector_data: SectorCreate, current_user: dict = Depends(get_super_admin_user)):
    """Create a new sector (Super Admin only)"""
    existing = await db.sectors.find_one({"name": sector_data.name}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Sector with this name already exists")
    
    # If this is the first sector being added, seed the defaults first
    sectors_count = await db.sectors.count_documents({})
    if sectors_count == 0:
        default_sectors = [
            {"id": "default-1", "name": "Manufacturing", "description": "Manufacturing and production facilities", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "default-3", "name": "Energy", "description": "Energy production and distribution", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "default-4", "name": "Agriculture", "description": "Agricultural operations", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "default-5", "name": "Construction", "description": "Construction and real estate", "created_at": datetime.now(timezone.utc).isoformat()}
        ]
        # Check if the new sector name matches any default - if so, skip that default
        defaults_to_insert = [s for s in default_sectors if s["name"] != sector_data.name]
        if defaults_to_insert:
            await db.sectors.insert_many(defaults_to_insert)
    
    sector_dict = sector_data.model_dump()
    sector_dict["id"] = str(uuid.uuid4())
    sector_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.sectors.insert_one(sector_dict)
    return SectorResponse(**sector_dict)

@router.get("/sectors", response_model=List[SectorResponse])
async def get_sectors(current_user: dict = Depends(get_current_user)):
    """Get all sectors"""
    sectors = await db.sectors.find({}, {"_id": 0}).to_list(1000)
    
    # If no custom sectors exist, return default sectors
    if not sectors:
        default_sectors = [
            {"id": "default-1", "name": "Manufacturing", "description": "Manufacturing and production facilities", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "default-3", "name": "Energy", "description": "Energy production and distribution", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "default-4", "name": "Agriculture", "description": "Agricultural operations", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "default-5", "name": "Construction", "description": "Construction and real estate", "created_at": datetime.now(timezone.utc).isoformat()}
        ]
        return [SectorResponse(**s) for s in default_sectors]
    
    return [SectorResponse(**s) for s in sectors]

@router.put("/super-admin/sectors/{sector_id}", response_model=SectorResponse)
async def update_sector(sector_id: str, sector_data: SectorCreate, current_user: dict = Depends(get_super_admin_user)):
    """Update a sector (Super Admin only)"""
    existing = await db.sectors.find_one({"id": sector_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Sector not found")
    
    # Check for duplicate name
    duplicate = await db.sectors.find_one({"name": sector_data.name, "id": {"$ne": sector_id}}, {"_id": 0})
    if duplicate:
        raise HTTPException(status_code=400, detail="Another sector with this name already exists")
    
    update_dict = sector_data.model_dump()
    await db.sectors.update_one({"id": sector_id}, {"$set": update_dict})
    updated = await db.sectors.find_one({"id": sector_id}, {"_id": 0})
    return SectorResponse(**updated)

@router.delete("/super-admin/sectors/{sector_id}")
async def delete_sector(sector_id: str, current_user: dict = Depends(get_super_admin_user)):
    """Delete a sector (Super Admin only)"""
    existing = await db.sectors.find_one({"id": sector_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Sector not found")
    
    await db.sectors.delete_one({"id": sector_id})
    return {"message": "Sector deleted successfully"}

@router.post("/super-admin/sectors/seed-defaults")
async def seed_default_sectors(current_user: dict = Depends(get_super_admin_user)):
    """Seed default sectors into the database (Super Admin only)"""
    default_sectors = [
        {"id": "default-1", "name": "Manufacturing", "description": "Manufacturing and production facilities"},
        {"id": "default-3", "name": "Energy", "description": "Energy production and distribution"},
        {"id": "default-4", "name": "Agriculture", "description": "Agricultural operations"},
        {"id": "default-5", "name": "Construction", "description": "Construction and real estate"}
    ]
    
    added_count = 0
    for sector in default_sectors:
        # Only add if doesn't exist
        existing = await db.sectors.find_one({"name": sector["name"]}, {"_id": 0})
        if not existing:
            sector["created_at"] = datetime.now(timezone.utc).isoformat()
            await db.sectors.insert_one(sector)
            added_count += 1
    
    return {"message": f"Seeded {added_count} default sectors", "added": added_count}


# Process Template CRUD endpoints
@router.get("/super-admin/process-templates", response_model=List[ProcessTemplateResponse])
async def get_process_templates(current_user: dict = Depends(get_super_admin_user)):
    templates = await db.process_templates.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [ProcessTemplateResponse(**t) for t in templates]

@router.post("/super-admin/process-templates", response_model=ProcessTemplateResponse)
async def create_process_template(data: ProcessTemplateCreate, current_user: dict = Depends(get_super_admin_user)):
    template_dict = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "description": data.description,
        "sub_industry": data.sub_industry,
        "formula": data.formula,
        "input_fields": data.input_fields,
        "predefined_inputs": data.predefined_inputs,
        "is_active": data.is_active,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": None
    }
    await db.process_templates.insert_one(template_dict)
    return ProcessTemplateResponse(**template_dict)

@router.put("/super-admin/process-templates/{template_id}", response_model=ProcessTemplateResponse)
async def update_process_template(template_id: str, data: ProcessTemplateCreate, current_user: dict = Depends(get_super_admin_user)):
    existing = await db.process_templates.find_one({"id": template_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Process template not found")
    
    update_dict = {
        "name": data.name,
        "description": data.description,
        "sub_industry": data.sub_industry,
        "formula": data.formula,
        "input_fields": data.input_fields,
        "predefined_inputs": data.predefined_inputs,
        "is_active": data.is_active,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.process_templates.update_one({"id": template_id}, {"$set": update_dict})
    updated = await db.process_templates.find_one({"id": template_id}, {"_id": 0})
    return ProcessTemplateResponse(**updated)

@router.delete("/super-admin/process-templates/{template_id}")
async def delete_process_template(template_id: str, current_user: dict = Depends(get_super_admin_user)):
    result = await db.process_templates.delete_one({"id": template_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Process template not found")
    return {"message": "Process template deleted successfully"}

# Public endpoint for admins/users to fetch active templates
@router.get("/process-templates", response_model=List[ProcessTemplateResponse])
async def get_active_process_templates(current_user: dict = Depends(get_current_user)):
    templates = await db.process_templates.find({"is_active": True}, {"_id": 0}).sort("name", 1).to_list(1000)
    return [ProcessTemplateResponse(**t) for t in templates]


# Emission records endpoints

# ============================================
# CANONICAL EMISSION CALCULATION ENGINE
# ============================================
# All calculations resolve to kg-based energy input
# Formula: Base Emissions (kg gas) = quantity_kg × NCV_TJ_per_kg × EF_kg_gas_per_TJ
# ============================================

def get_unit_type(unit: str) -> str:
    """Identify the type of unit"""
    unit_lower = unit.lower().strip()
    for unit_type, units in UNIT_CLASSIFICATIONS.items():
        if unit_lower in [u.lower() for u in units]:
            return unit_type
    return "unknown"

def convert_quantity_to_kg(quantity: float, unit: str, density_kg_per_L: Optional[float] = None, 
                           density_kg_per_m3: Optional[float] = None) -> dict:
    """
    Step 2: Convert Quantity to kg (Mandatory)
    Returns: {"quantity_kg": float, "error": str or None}
    """
    unit_type = get_unit_type(unit)
    
    # Mass units → direct conversion
    if unit_type == "mass_units":
        multiplier = QUANTITY_TO_KG_CONVERSIONS.get(unit, QUANTITY_TO_KG_CONVERSIONS.get(unit.lower()))
        if multiplier and isinstance(multiplier, (int, float)):
            return {"quantity_kg": quantity * multiplier, "error": None}
    
    # Volume liquid units → requires density in kg/L
    if unit_type == "volume_units_liquid":
        if density_kg_per_L is None:
            return {"quantity_kg": None, "error": f"Density (kg/L) required for volume unit '{unit}'"}
        
        volume_to_litre = {
            "litre": 1, "L": 1,
            "kilolitre": 1000, "kL": 1000,
            "millilitre": 0.001, "mL": 0.001,
            "gallon": 3.78541, "gal": 3.78541
        }
        multiplier = volume_to_litre.get(unit, volume_to_litre.get(unit.lower(), 1))
        quantity_kg = quantity * multiplier * density_kg_per_L
        return {"quantity_kg": quantity_kg, "error": None}
    
    # Volume cubic units → requires density in kg/m³
    if unit_type == "volume_units_cubic":
        if density_kg_per_m3 is None:
            return {"quantity_kg": None, "error": f"Density (kg/m³) required for volume unit '{unit}'"}
        
        volume_to_m3 = {
            "m3": 1, "m³": 1,
            "cm3": 0.000001, "cm³": 0.000001,
            "ft3": 0.0283168, "ft³": 0.0283168
        }
        multiplier = volume_to_m3.get(unit, volume_to_m3.get(unit.lower(), 1))
        quantity_kg = quantity * multiplier * density_kg_per_m3
        return {"quantity_kg": quantity_kg, "error": None}
    
    # Unknown unit - assume kg
    return {"quantity_kg": quantity, "error": None}

def convert_ncv_to_tj_per_kg(ncv_value: float, ncv_unit: str, density_kg_per_L: Optional[float] = None) -> dict:
    """
    Convert NCV to TJ/kg (standard unit)
    Returns: {"ncv_tj_per_kg": float, "error": str or None}
    """
    conversion = NCV_TO_TJ_PER_KG.get(ncv_unit)
    
    if conversion is None:
        return {"ncv_tj_per_kg": None, "error": f"Unknown NCV unit: {ncv_unit}"}
    
    if isinstance(conversion, str):
        # Needs density
        if "density_kg_per_L" in conversion and density_kg_per_L is None:
            return {"ncv_tj_per_kg": None, "error": f"Density required for NCV unit '{ncv_unit}'"}
        # Parse expression (simplified)
        if density_kg_per_L:
            ncv_tj_per_kg = 0.000001 / density_kg_per_L * ncv_value  # For MJ/L
            return {"ncv_tj_per_kg": ncv_tj_per_kg, "error": None}
    
    return {"ncv_tj_per_kg": ncv_value * conversion, "error": None}

def convert_ef_to_kg_per_tj(ef_value: float, ef_unit: str) -> dict:
    """
    Convert Emission Factor to kg/TJ (standard unit)
    Returns: {"ef_kg_per_tj": float, "error": str or None}
    """
    conversion = EF_TO_KG_PER_TJ.get(ef_unit, EF_TO_KG_PER_TJ.get(ef_unit.split()[0], 1))
    return {"ef_kg_per_tj": ef_value * conversion, "error": None}

def convert_density_for_calculation(density_value: float, density_unit: str, target: str = "kg_per_L") -> dict:
    """
    Convert density to required unit type
    target: "kg_per_L" or "kg_per_m3"
    """
    conversion = DENSITY_CONVERSIONS.get(density_unit)
    if conversion is None:
        return {"density": density_value, "error": f"Unknown density unit: {density_unit}"}
    
    if target == "kg_per_L":
        return {"density": density_value * conversion["to_kg_per_L"], "error": None}
    else:
        return {"density": density_value * conversion["to_kg_per_m3"], "error": None}

async def calculate_emissions(record_data: EmissionRecordCreate) -> dict:
    """
    CANONICAL EMISSION CALCULATION
    
    Formula: Base Emissions (kg gas) = quantity_kg × NCV_TJ_per_kg × EF_kg_gas_per_TJ
    
    Step 1: Convert quantity to kg (with unit normalization)
    Step 2: Convert NCV to TJ/kg
    Step 3: Calculate gas-wise emissions
    Step 4: Calculate CO2e (post-processing with GWP - values from Super Admin parameters)
    
    Returns: {
        "co2_emissions": kg,
        "ch4_emissions": kg,
        "n2o_emissions": kg,
        "co2e_emissions": kg
    }
    """
    # Custom factor - simple calculation
    if record_data.is_custom_factor:
        total = record_data.quantity * record_data.emission_factor
        
        # Fetch dynamic GWP values for custom factor as well
        gwp_ch4_param = await db.formula_parameters.find_one({"parameter_key": "gwp_ch4"}, {"_id": 0})
        gwp_n2o_param = await db.formula_parameters.find_one({"parameter_key": "gwp_n2o"}, {"_id": 0})
        gwp_ch4 = gwp_ch4_param.get("default_value", GWP_VALUES["CH4"]) if gwp_ch4_param else GWP_VALUES["CH4"]
        gwp_n2o = gwp_n2o_param.get("default_value", GWP_VALUES["N2O"]) if gwp_n2o_param else GWP_VALUES["N2O"]
        
        return {
            "co2_emissions": total,
            "ch4_emissions": 0,
            "n2o_emissions": 0,
            "co2e_emissions": total,
            "calculation_error": None
        }
    
    # Get input values
    quantity = record_data.quantity
    quantity_unit = record_data.unit or "kg"
    calorific_value = record_data.calorific_value or 0
    ncv_unit = "TJ/Gg"  # Default NCV unit from fuel database
    density = record_data.density
    density_unit = "kg/L"  # Default density unit
    
    # Emission factors (assumed in kg/TJ from fuel database)
    ef_co2 = record_data.emission_factor or 0  # kg CO2/TJ
    ef_ch4 = record_data.emission_factor_ch4 or 0  # kg CH4/TJ
    ef_n2o = record_data.emission_factor_n2o or 0  # kg N2O/TJ
    
    # If no calorific value, fall back to simple calculation
    if not calorific_value:
        total = quantity * ef_co2
        return {
            "co2_emissions": total,
            "ch4_emissions": 0,
            "n2o_emissions": 0,
            "co2e_emissions": total,
            "calculation_error": "No NCV provided - using simple calculation"
        }
    
    # ============================================
    # STEP 1: Convert Quantity to kg
    # ============================================
    density_kg_per_L = None
    density_kg_per_m3 = None
    
    if density:
        density_result = convert_density_for_calculation(density, density_unit, "kg_per_L")
        if density_result["error"]:
            return {
                "co2_emissions": 0, "ch4_emissions": 0, "n2o_emissions": 0, 
                "co2e_emissions": 0, "calculation_error": density_result["error"]
            }
        density_kg_per_L = density_result["density"]
        density_kg_per_m3 = density_kg_per_L * 1000
    
    qty_result = convert_quantity_to_kg(quantity, quantity_unit, density_kg_per_L, density_kg_per_m3)
    if qty_result["error"]:
        return {
            "co2_emissions": 0, "ch4_emissions": 0, "n2o_emissions": 0, 
            "co2e_emissions": 0, "calculation_error": qty_result["error"]
        }
    quantity_kg = qty_result["quantity_kg"]
    
    # ============================================
    # STEP 2: Convert NCV to TJ/kg
    # ============================================
    ncv_result = convert_ncv_to_tj_per_kg(calorific_value, ncv_unit, density_kg_per_L)
    if ncv_result["error"]:
        return {
            "co2_emissions": 0, "ch4_emissions": 0, "n2o_emissions": 0, 
            "co2e_emissions": 0, "calculation_error": ncv_result["error"]
        }
    ncv_tj_per_kg = ncv_result["ncv_tj_per_kg"]
    
    # ============================================
    # STEP 3: Gas-wise Emission Computation
    # Formula: emissions_gas_kg = quantity_kg × NCV_TJ_per_kg × EF_kg_gas_per_TJ
    # ============================================
    co2_emissions_kg = quantity_kg * ncv_tj_per_kg * ef_co2
    ch4_emissions_kg = quantity_kg * ncv_tj_per_kg * ef_ch4
    n2o_emissions_kg = quantity_kg * ncv_tj_per_kg * ef_n2o
    
    # ============================================
    # STEP 4: CO2e Calculation (Post-Processing)
    # CO2e = CO2 + (CH4 × GWP_CH4) + (N2O × GWP_N2O)
    # Note: GWP is applied AFTER mass calculation, not before
    # GWP values can be customized by Super Admin via formula_parameters
    # ============================================
    
    # Fetch dynamic GWP values from formula_parameters (or use defaults)
    gwp_ch4_param = await db.formula_parameters.find_one({"parameter_key": "gwp_ch4"}, {"_id": 0})
    gwp_n2o_param = await db.formula_parameters.find_one({"parameter_key": "gwp_n2o"}, {"_id": 0})
    
    gwp_ch4 = gwp_ch4_param.get("default_value", GWP_VALUES["CH4"]) if gwp_ch4_param else GWP_VALUES["CH4"]
    gwp_n2o = gwp_n2o_param.get("default_value", GWP_VALUES["N2O"]) if gwp_n2o_param else GWP_VALUES["N2O"]
    
    co2e_kg = co2_emissions_kg + (ch4_emissions_kg * gwp_ch4) + (n2o_emissions_kg * gwp_n2o)
    
    return {
        "co2_emissions": co2_emissions_kg,
        "ch4_emissions": ch4_emissions_kg,
        "n2o_emissions": n2o_emissions_kg,
        "co2e_emissions": co2e_kg,
        "gwp_ch4_used": gwp_ch4,
        "gwp_n2o_used": gwp_n2o,
        "calculation_error": None
    }

# Phase B5: POST /emissions moved to modules/emissions/router.py
# Phase B5: PUT /emissions/{record_id} moved to modules/emissions/router.py
# Phase B4: GET /emissions/{id}/history moved to modules/emissions/router.py
