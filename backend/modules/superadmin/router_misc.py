"""Phase B9b: Split sub-router — Super-Admin Dashboard + Sectors + Process Templates.

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
from shared.constants.units import (
    UNIT_CLASSIFICATIONS,
    QUANTITY_TO_KG_CONVERSIONS,
    NCV_TO_TJ_PER_KG,
    EF_TO_KG_PER_TJ,
    DENSITY_CONVERSIONS,
)
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
            "esg_frameworks_enabled": org.get("esg_frameworks_enabled", []),
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
