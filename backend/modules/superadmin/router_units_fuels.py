"""Phase B9b: Split sub-router — Units + Fuel Database.

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
from shared.constants.units import DEFAULT_UNITS
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


# ============================================
# UNIT MANAGEMENT ENDPOINTS
# ============================================

@router.get("/units", response_model=List[UnitResponse])
async def get_all_units(current_user: dict = Depends(get_current_user)):
    """Get all units (available to all authenticated users)"""
    units = await db.units.find({"is_active": True}, {"_id": 0}).to_list(1000)
    return [UnitResponse(**u) for u in units]

@router.get("/units/registry")
async def get_unit_registry(current_user: dict = Depends(get_current_user)):
    """Get the centralized unit registry with conversion factors."""
    from shared.unit_registry import get_all_unit_types, get_units_for_type
    result = []
    for ut in get_all_unit_types():
        units = get_units_for_type(ut["type"])
        result.append({**ut, "units": units})
    return result


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
