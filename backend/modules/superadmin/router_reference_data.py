"""Phase B9b: Split sub-router — Scope3 EF, Emission Categories, Base Year References.

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
