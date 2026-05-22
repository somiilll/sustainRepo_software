"""Phase B9b: Split sub-router — Emission Factors (super-admin + custom).

Auto-extracted from modules/superadmin/router.py (Feb 2026).
Behaviour byte-identical: route bodies preserved verbatim.
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
