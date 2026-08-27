"""Phase B9b: Split sub-router — GWP Configs + Currency Conversion.

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

# Get all GWP configurations (for history/reference)
@router.get("/super-admin/gwp-configs")
async def get_all_gwp_configs(current_user: dict = Depends(get_super_admin_user)):
    """Get all GWP configurations including historical ones"""
    configs = await db.gwp_config.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return configs

# Create new GWP configuration

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

# ============================================
# CURRENCY CONVERSION CONFIGURATION
# ============================================
# Get active currency conversion config for a specific currency pair and year
@router.get("/currency-conversion")
async def get_currency_conversions(
    source_currency: Optional[str] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    conversion_method: Optional[str] = None,
):
    """Get currency conversion configurations, optionally filtered by currency and year"""
    query = {}
    if source_currency:
        query["source_currency"] = source_currency.upper()
    if year:
        query["year_applicable"] = year
    if month:
        query["month_applicable"] = month
    if conversion_method:
        query["conversion_method"] = conversion_method
    
    configs = await db.currency_conversion.find(query, {"_id": 0}).sort([("source_currency", 1), ("year_applicable", -1), ("month_applicable", -1)]).to_list(500)
    return configs

# Get active currency conversion for a specific currency/year

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

# Get all currency conversions (SuperAdmin)
@router.get("/super-admin/currency-conversions")
async def get_all_currency_conversions(current_user: dict = Depends(get_super_admin_user)):
    """Get all currency conversion configurations (SuperAdmin only)"""
    configs = await db.currency_conversion.find({}, {"_id": 0}).sort([("source_currency", 1), ("year_applicable", -1), ("month_applicable", -1)]).to_list(1000)
    return configs

# Create new currency conversion

# Create new currency conversion
@router.post("/super-admin/currency-conversion")
async def create_currency_conversion(config: CurrencyConversionCreate, current_user: dict = Depends(get_super_admin_user)):
    """Create a new currency conversion configuration (SuperAdmin only)"""
    
    if config.month_applicable is not None and not 1 <= config.month_applicable <= 12:
        raise HTTPException(status_code=400, detail="month_applicable must be between 1 and 12")
    if config.conversion_method not in {"ppp_inflation", "standard"}:
        raise HTTPException(status_code=400, detail="conversion_method must be standard or ppp_inflation")
    if config.conversion_method == "standard" and not config.exchange_rate:
        raise HTTPException(status_code=400, detail="exchange_rate is required for standard currency conversion")
    if config.conversion_method == "ppp_inflation" and not config.purchase_parity:
        raise HTTPException(status_code=400, detail="purchase_parity is required for PPP and inflation conversion")
    rate_identity = {
        "source_currency": config.source_currency.upper(),
        "target_currency": config.target_currency.upper(),
        "year_applicable": config.year_applicable,
        "month_applicable": config.month_applicable,
        "conversion_method": config.conversion_method,
    }
    existing = await db.currency_conversion.find_one(rate_identity, {"_id": 0})
    
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"A {config.conversion_method} currency rate already exists for this currency period"
        )
    
    new_config = {
        "id": str(uuid.uuid4()),
        "source_currency": config.source_currency.upper(),
        "target_currency": config.target_currency.upper(),
        "year_applicable": config.year_applicable,
        "month_applicable": config.month_applicable,
        "effective_from": config.effective_from or (f"{config.year_applicable}-{config.month_applicable:02d}" if config.month_applicable else str(config.year_applicable)),
        "conversion_method": config.conversion_method,
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
    if update_data.get("month_applicable") is not None and not 1 <= update_data["month_applicable"] <= 12:
        raise HTTPException(status_code=400, detail="month_applicable must be between 1 and 12")
    if "conversion_method" in update_data and update_data["conversion_method"] not in {"ppp_inflation", "standard"}:
        raise HTTPException(status_code=400, detail="conversion_method must be standard or ppp_inflation")
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = current_user["id"]
    update_data["updated_by_email"] = current_user["email"]
    
    await db.currency_conversion.update_one({"id": config_id}, {"$set": update_data})
    
    updated = await db.currency_conversion.find_one({"id": config_id}, {"_id": 0})
    return {"message": "Currency conversion configuration updated successfully", "config": updated}

# Delete currency conversion

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
            "year_applicable": config.year_applicable,
            "month_applicable": config.month_applicable,
            "conversion_method": config.conversion_method,
        })
        
        if existing:
            # Update existing
            update_data = {
                "purchase_parity": config.purchase_parity,
                "inflation_factor": config.inflation_factor,
                "exchange_rate": config.exchange_rate,
                "month_applicable": config.month_applicable,
                "effective_from": config.effective_from or (f"{config.year_applicable}-{config.month_applicable:02d}" if config.month_applicable else str(config.year_applicable)),
                "conversion_method": config.conversion_method,
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
                "month_applicable": config.month_applicable,
                "effective_from": config.effective_from or (f"{config.year_applicable}-{config.month_applicable:02d}" if config.month_applicable else str(config.year_applicable)),
                "conversion_method": config.conversion_method,
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

# Get distinct currencies available
@router.get("/currency-conversion/currencies")
async def get_available_currencies():
    """Get list of available source currencies"""
    currencies = await db.currency_conversion.distinct("source_currency")
    return sorted(currencies)

# Get distinct years available for a currency

# Get distinct years available for a currency
@router.get("/currency-conversion/years/{source_currency}")
async def get_available_years(source_currency: str):
    """Get list of available years for a specific currency"""
    years = await db.currency_conversion.distinct("year_applicable", {"source_currency": source_currency.upper()})
    return sorted(years, reverse=True)


# Super Admin - Formula Parameters Management
