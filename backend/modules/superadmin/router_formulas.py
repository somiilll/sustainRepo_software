"""Phase B9b: Split sub-router — Formulas + Emission Configurations.

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

# Public endpoint to get formula parameters (for calculation)
@router.get("/formula-parameters", response_model=List[FormulaParameterResponse])
async def get_formula_parameters_for_users(current_user: dict = Depends(get_current_user)):
    """Get all formula parameters for calculation forms"""
    params = await db.formula_parameters.find({}, {"_id": 0}).sort("display_order", 1).to_list(1000)
    return [FormulaParameterResponse(**p) for p in params]

# Super Admin - Formula Definitions (the actual formulas/equations)

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

# Public endpoint to get formula definitions (for calculation)
@router.get("/formula-definitions", response_model=List[FormulaDefinitionResponse])
async def get_formula_definitions_for_users(current_user: dict = Depends(get_current_user)):
    """Get all active formula definitions for calculation"""
    formulas = await db.formula_definitions.find({"is_active": True}, {"_id": 0}).sort("display_order", 1).to_list(1000)
    return [FormulaDefinitionResponse(**f) for f in formulas]

# ====================== EMISSION CONFIGURATIONS ======================
# SuperAdmin can map scopes/categories to formulas dynamically

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
