from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import json
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr, field_validator
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import io
import base64
import secrets
import string
import shutil
from fastapi.responses import StreamingResponse, FileResponse
import asyncio
import anthropic
from audit_logger import AuditLogger, AuditAction, AuditModule, init_audit_logger, get_audit_logger

# ============================================================================
# Phase B1: Foundation refactor — centralized config + helpers
# ----------------------------------------------------------------------------
# `app.config.env` loads `.env` once and exposes typed module-level constants.
# `shared.database.mongo` owns the single Motor client + db handle.
# `shared.helpers.passwords` / `tokens` / `email` host pure helpers that used
# to be defined inline here. The originals are removed below; their callers
# (any line in this file referencing the names) continue to work because we
# re-export the same identifiers via the imports below.
# ============================================================================
from app.config.env import (
    BACKEND_DIR as ROOT_DIR,  # legacy alias kept for any inline path usage
    JWT_SECRET as SECRET_KEY,
    JWT_ALGORITHM as ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    RESEND_API_KEY,
    SENDER_EMAIL,
    ANTHROPIC_API_KEY,
)
from shared.database.mongo import client, db
from shared.helpers.passwords import (
    pwd_context,
    generate_random_password,
    verify_password as _shared_verify_password,
    get_password_hash as _shared_get_password_hash,
)
from shared.helpers.tokens import (
    create_access_token as _shared_create_access_token,
)
from shared.helpers.email import send_email
from app.bootstrap.contract_verifier import verify_module_contracts

# Phase B2: extracted auth deps + per-domain routers.
# server.py keeps the legacy class definitions and route handlers commented
# out / removed below; the new modular routers are included in the api_router.
from modules.auth.dependencies import get_current_user, get_super_admin_user, get_admin_user, security
from modules.auth.router import router as auth_router
from modules.users.router import router as users_admin_router
from app.router.health import router as health_router

# Phase B3: facilities + organizations + sinks routers.
from modules.facilities.router import router as facilities_router
from modules.organizations.router import router as organizations_router
from modules.sinks.router import router as sinks_router

# Phase B4: emissions read/list router (POST/PUT remain in this file until Phase B5).
from modules.emissions.router import router as emissions_router
# Phase B5: C7 router (7 routes).
from modules.emissions.c7_router import router as c7_router
# Phase B7: dashboards router (2 routes — /dashboard/stats, /dashboard/supplier-hotspots).
from modules.dashboards.router import router as dashboards_router
# Phase B11+: WebSocket live cockpit.
from modules.dashboards.ws_router import router as dashboards_ws_router
# Phase B8: reports router (5 routes — /reports/facility, /reports/combined,
# /reports/ghg-inventory, /reports/download/{token}, /reports/ai-summary).
from modules.reports.router import router as reports_router
# Phase B9: super-admin / platform config router (~91 routes).
from modules.superadmin.router import router as superadmin_router
# Phase B9: Pydantic models moved to modules/superadmin/contracts.py.

# Approval workflow extension (per-org opt-in feature) - V2 architecture.
from modules.approvals.router_v2 import router as approvals_router

# Targets domain (multi-target reduction management).
from modules.targets.router import router as targets_router
from modules.production.router import router as production_router

# ============================================================================
# ESG Platform Extension - Phase 1
# ----------------------------------------------------------------------------
# ESG platform uses users_esg collection for all authentication.
# Modular ESG architecture supporting multiple frameworks (BRSR, GRI, SBTi).
# ============================================================================
from modules.esg.router import router as esg_config_router
from modules.frameworks.router import router as frameworks_router
from modules.framework_details.router import router as framework_details_router
from modules.esg_questionnaire.router import router as esg_questionnaire_router
from modules.esg_records.router import router as esg_records_router
from modules.esg_records.admin_router import admin_router as esg_records_admin_router

# Set Playwright browsers path BEFORE any playwright imports
os.environ['PLAYWRIGHT_BROWSERS_PATH'] = '/app/.playwright'

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Phase B2: include modular routers.
# These routers carry their own routes — we register them on `api_router`
# so the existing `/api/...` prefix is preserved.
api_router.include_router(auth_router)
api_router.include_router(users_admin_router)
api_router.include_router(health_router)
# Phase B3 routers
api_router.include_router(facilities_router)
api_router.include_router(organizations_router)
api_router.include_router(sinks_router)
# Phase B4 router (emissions read/list — POST/PUT remain in this file until Phase B5)
api_router.include_router(emissions_router)
# Phase B5 router (C7 Employee Commuting — 7 routes)
api_router.include_router(c7_router)
# Phase B7 router (Dashboards — 2 routes)
api_router.include_router(dashboards_router)
# Phase B11+ WebSocket router (Live cockpit — /ws/dashboard)
api_router.include_router(dashboards_ws_router)
# Phase B8 router (Reports — 5 routes)
api_router.include_router(reports_router)
# Phase B9 router (Super-admin / Platform Config — ~91 routes)
api_router.include_router(superadmin_router)

# Approval workflow extension (org opt-in)
api_router.include_router(approvals_router)

# Targets module (org-level reduction targets)
api_router.include_router(targets_router)

# Production quantity module (for Carbon Intensity calculations)
api_router.include_router(production_router)

# ============================================================================
# ESG Platform Extension Routers
# ----------------------------------------------------------------------------
# ESG organization configuration (Super Admin only)
api_router.include_router(esg_config_router)
# ESG frameworks (BRSR, GRI, SBTi)
api_router.include_router(frameworks_router)
# Framework-specific organization details (BRSR, etc.)
api_router.include_router(framework_details_router)
# ESG Questionnaire system (config-driven questions)
api_router.include_router(esg_questionnaire_router)
# ESG Records system (Environment/Social/Governance records)
api_router.include_router(esg_records_router)
# ESG Records Super Admin Config
api_router.include_router(esg_records_admin_router)

# Run module contract verifier at import time. Phase B1: log-only, will be
# escalated to fail-fast in dev once all modules expose their contracts.
verify_module_contracts()

# Initialize Audit Logger
audit_logger = init_audit_logger(db)

# Temporary storage for downloadable reports (in-memory cache with expiry)
# Phase B8: moved to shared.cache.downloads — re-imported here for legacy callers.
from shared.cache.downloads import pending_downloads

# NOTE: Hardcoded emission factors removed. All standard factors are now managed by Super Admin in database.
# Admin/User can only use standard factors or create custom factors with justification.

# Import the shared helper and default label map
from shared.helpers.audit_helpers import DEFAULT_INPUT_LABEL_MAP, get_input_label_map_from_db

def compute_field_changes(old_values: dict, new_values: dict, fields_to_track: list = None, input_label_map: dict = None) -> list:
    """
    Compute field-level changes between old and new values.
    Returns a list of change objects with field, old_value, new_value.
    
    Args:
        old_values: Dictionary of old field values
        new_values: Dictionary of new field values
        fields_to_track: Optional list of field names to track. If None, tracks all fields.
        input_label_map: Optional dict mapping input variable names to display labels.
                        If None, uses DEFAULT_INPUT_LABEL_MAP.
    
    Returns:
        List of dicts: [{"field": "field_name", "old_value": x, "new_value": y}, ...]
    """
    changes = []
    
    # Use provided input_label_map or fall back to defaults
    if input_label_map is None:
        input_label_map = DEFAULT_INPUT_LABEL_MAP
    
    # Default fields to track for emissions - all important fields
    if fields_to_track is None:
        fields_to_track = [
            # Core identifiers
            "facility_id", "scope", "category", "subcategory",
            # Activity & Method
            "activity", "activity_name", "scope3_activity", "scope3_activity_type", "calculation_method_scope3",
            "scope3_ef_id", "fuel_type", "fuel_name", "fuel_id",
            # Quantities & Units
            "quantity", "unit", "reporting_period",
            # Emission factors
            "emission_factor", "emission_factor_co2", "emission_factor_ch4", "emission_factor_n2o",
            "ef_unit", "ef_source",
            # Outputs
            "co2_emissions", "ch4_emissions", "n2o_emissions", "co2e_emissions", "total_emissions",
            # Supplier data (C1, C2, C4, C9)
            "supplier_name", "supplier_code", "supplier_emission_factor", "supplier_ef_unit",
            # Customer data (C9)
            "customer_name", "customer_code",
            # Asset name (for C8/C13/C14/C15)
            "asset_name",
            # Location fields (C4, C6, C7, C9)
            "from_location", "to_location",
            # Optional inputs
            "spend_amount", "distance_travelled", "passengers_travelled", "working_days",
            "working_hours", "inflation_rate", "purchase_power_value",
            # C6/C7 specific - employee info & travel details
            "employee_name", "employee_id", "nights_stayed", "rooms_taken",
            # Person responsible
            "responsible_person", "responsible_person_designation", "responsible_person_contact",
            # Process info
            "process_names", "process_descriptions",
            # Notes
            "notes", "justification",
            # Override justification (#17)
            "override_justification",
            "override_calorific_value", "override_density", "override_emission_factor_heat",
            # Evidence
            "evidence_url", "evidence_file_name",
            # C7 specific
            "employees", "monthly_totals", "yearly_total",
        ]
    
    # Track evidence separately - normalize empty string and None to avoid false changes
    old_evidence = old_values.get("evidence_url") or None
    new_evidence = new_values.get("evidence_url") or None
    if old_evidence != new_evidence:
        changes.append({
            "field": "evidence",
            "old_value": "Evidence attached" if old_evidence else "No evidence",
            "new_value": "Evidence updated" if new_evidence else "Evidence removed",
            "field_type": "evidence"
        })
    
    # Track calculation method changes with readable names (only *_basis, no *_based fallbacks)
    method_names = {
        'spend_basis': 'Spend Based',
        'average_data': 'Average Data',
        'activity_basis': 'Activity Based',
        'supplier_basis': 'Supplier Based',
        'distance_basis': 'Distance Based',
        'fuel_basis': 'Fuel Based',
        'asset_basis': 'Asset Based',
        'lessor_basis': 'Lessor Based',
        'lessee_basis': 'Lessee Based',
        'investment_basis': 'Investment Based',
        'equity_basis': 'Equity Based'
    }
    
    old_method = old_values.get("calculation_method_scope3")
    new_method = new_values.get("calculation_method_scope3")
    # Also check in dynamic_field_values
    if not old_method:
        old_dfv = old_values.get("dynamic_field_values", {}) or {}
        old_method_field = old_dfv.get("calculation_method_scope3", {})
        old_method = old_method_field.get("value") if isinstance(old_method_field, dict) else old_method_field
    if not new_method:
        new_dfv = new_values.get("dynamic_field_values", {}) or {}
        new_method_field = new_dfv.get("calculation_method_scope3", {})
        new_method = new_method_field.get("value") if isinstance(new_method_field, dict) else new_method_field
    
    if old_method != new_method and (old_method or new_method):
        changes.append({
            "field": "calculation_method_scope3",
            "old_value": method_names.get(old_method, old_method) if old_method else "(not set)",
            "new_value": method_names.get(new_method, new_method) if new_method else "(not set)",
            "field_type": "simple"
        })
    
    # Track activity changes - prioritize scope3_activity over sub_category to avoid showing category name
    # The sub_category often contains "Employee Commuting" (category) instead of actual activity like "Local bus"
    old_dfv = old_values.get("dynamic_field_values", {}) or {}
    new_dfv = new_values.get("dynamic_field_values", {}) or {}
    
    # First check scope3_activity directly, then in dynamic_field_values, then fallback to sub_category
    old_activity = old_values.get("scope3_activity")
    if not old_activity:
        old_act_field = old_dfv.get("scope3_activity", {})
        old_activity = old_act_field.get("value") if isinstance(old_act_field, dict) else old_act_field
    if not old_activity:
        # Only use sub_category if it's different from the category (C7 - Employee Commuting)
        old_sub = old_values.get("sub_category")
        if old_sub and "Employee Commuting" not in str(old_sub) and "C7" not in str(old_sub):
            old_activity = old_sub
    
    new_activity = new_values.get("scope3_activity")
    if not new_activity:
        new_act_field = new_dfv.get("scope3_activity", {})
        new_activity = new_act_field.get("value") if isinstance(new_act_field, dict) else new_act_field
    if not new_activity:
        # Only use sub_category if it's different from the category
        new_sub = new_values.get("sub_category")
        if new_sub and "Employee Commuting" not in str(new_sub) and "C7" not in str(new_sub):
            new_activity = new_sub
    
    # Check if custom activity was used (for display purposes)
    old_use_custom = old_dfv.get("use_custom_activity", {})
    old_is_custom = old_use_custom.get("value") if isinstance(old_use_custom, dict) else old_use_custom
    new_use_custom = new_dfv.get("use_custom_activity", {})
    new_is_custom = new_use_custom.get("value") if isinstance(new_use_custom, dict) else new_use_custom
    
    # Format activity display with custom indicator
    def format_activity_display(activity_name, is_custom):
        if not activity_name:
            return "(not set)"
        if is_custom:
            return f"{activity_name} (custom)"
        return activity_name
    
    if old_activity != new_activity and (old_activity or new_activity):
        changes.append({
            "field": "activity",
            "old_value": format_activity_display(old_activity, old_is_custom),
            "new_value": format_activity_display(new_activity, new_is_custom),
            "field_type": "simple"
        })
    
    # Track process_names changes with friendly message
    old_process_names = old_values.get("process_names") or []
    new_process_names = new_values.get("process_names") or []
    if old_process_names != new_process_names:
        old_display = ", ".join(old_process_names) if old_process_names else "(none)"
        new_display = ", ".join(new_process_names) if new_process_names else "(none)"
        changes.append({
            "field": "process_names",
            "old_value": old_display,
            "new_value": new_display,
            "field_type": "simple"
        })
    
    # Track process_descriptions changes with friendly message
    old_process_descs = old_values.get("process_descriptions") or []
    new_process_descs = new_values.get("process_descriptions") or []
    if old_process_descs != new_process_descs:
        def format_process_desc(descs):
            if not descs:
                return "(none)"
            return "; ".join([f"{d.get('name', '')}: {d.get('description', '')}" for d in descs if d.get('name')])
        changes.append({
            "field": "process_descriptions",
            "old_value": format_process_desc(old_process_descs),
            "new_value": format_process_desc(new_process_descs),
            "field_type": "simple"
        })
    
    # Track employees array changes with detailed breakdown (C6/C7)
    old_employees = old_values.get("employees") or []
    new_employees = new_values.get("employees") or []
    
    if old_employees != new_employees:
        # Build maps by employee id for comparison
        old_emp_map = {emp.get("id") or emp.get("employee_id") or emp.get("name", f"emp_{i}"): emp 
                       for i, emp in enumerate(old_employees)}
        new_emp_map = {emp.get("id") or emp.get("employee_id") or emp.get("name", f"emp_{i}"): emp 
                       for i, emp in enumerate(new_employees)}
        
        all_emp_ids = set(old_emp_map.keys()) | set(new_emp_map.keys())
        
        for emp_id in all_emp_ids:
            old_emp = old_emp_map.get(emp_id, {})
            new_emp = new_emp_map.get(emp_id, {})
            
            if not old_emp and new_emp:
                # Employee added
                emp_name = new_emp.get("name", emp_id)
                changes.append({
                    "field": "employee_added",
                    "old_value": "(none)",
                    "new_value": f"{emp_name}",
                    "field_type": "employee"
                })
            elif old_emp and not new_emp:
                # Employee removed
                emp_name = old_emp.get("name", emp_id)
                changes.append({
                    "field": "employee_removed",
                    "old_value": f"{emp_name}",
                    "new_value": "(removed)",
                    "field_type": "employee"
                })
            else:
                # Employee modified - check specific fields
                emp_name = new_emp.get("name") or old_emp.get("name") or emp_id
                
                # Track employee name change
                old_name = old_emp.get("name")
                new_name = new_emp.get("name")
                if old_name != new_name and (old_name or new_name):
                    changes.append({
                        "field": "employee_name",
                        "old_value": old_name or "(not set)",
                        "new_value": new_name or "(not set)",
                        "field_type": "employee",
                        "employee_id": emp_id
                    })
                
                # Track employee_id change
                old_emp_id = old_emp.get("employee_id")
                new_emp_id = new_emp.get("employee_id")
                if old_emp_id != new_emp_id and (old_emp_id or new_emp_id):
                    changes.append({
                        "field": "employee_code",
                        "old_value": old_emp_id or "(not set)",
                        "new_value": new_emp_id or "(not set)",
                        "field_type": "employee",
                        "employee_name": emp_name
                    })
                
                # Track department change
                old_dept = old_emp.get("department")
                new_dept = new_emp.get("department")
                if old_dept != new_dept and (old_dept or new_dept):
                    changes.append({
                        "field": "employee_department",
                        "old_value": old_dept or "(not set)",
                        "new_value": new_dept or "(not set)",
                        "field_type": "employee",
                        "employee_name": emp_name
                    })
                
                # Track activity_type change
                old_activity = old_emp.get("activity_type")
                new_activity = new_emp.get("activity_type")
                if old_activity != new_activity and (old_activity or new_activity):
                    changes.append({
                        "field": "employee_activity_type",
                        "old_value": old_activity or "(not set)",
                        "new_value": new_activity or "(not set)",
                        "field_type": "employee",
                        "employee_name": emp_name
                    })
                
                # Track from_location change
                old_from = old_emp.get("from_location")
                new_from = new_emp.get("from_location")
                if old_from != new_from and (old_from or new_from):
                    changes.append({
                        "field": "employee_from_location",
                        "old_value": old_from or "(not set)",
                        "new_value": new_from or "(not set)",
                        "field_type": "employee",
                        "employee_name": emp_name
                    })
                
                # Track to_location change
                old_to = old_emp.get("to_location")
                new_to = new_emp.get("to_location")
                if old_to != new_to and (old_to or new_to):
                    changes.append({
                        "field": "employee_to_location",
                        "old_value": old_to or "(not set)",
                        "new_value": new_to or "(not set)",
                        "field_type": "employee",
                        "employee_name": emp_name
                    })
                
                # Track input changes - check yearly_data.inputs, monthly_data.*.inputs, and flat inputs
                old_yearly = old_emp.get("yearly_data", {}) or {}
                new_yearly = new_emp.get("yearly_data", {}) or {}
                
                # For yearly mode: check yearly_data.inputs or flat inputs
                old_inputs = old_yearly.get("inputs", {}) or old_emp.get("inputs", {}) or {}
                new_inputs = new_yearly.get("inputs", {}) or new_emp.get("inputs", {}) or {}
                
                # Note: input_label_map is now passed as a function parameter
                # and defaults to DEFAULT_INPUT_LABEL_MAP if not provided
                
                # For monthly mode: also check monthly_data
                old_monthly = old_emp.get("monthly_data", {}) or {}
                new_monthly = new_emp.get("monthly_data", {}) or {}
                
                # Detect structure migration: flat/yearly → monthly or monthly → flat/yearly
                old_has_monthly = bool(old_monthly)
                new_has_monthly = bool(new_monthly)
                is_migrating_to_monthly = not old_has_monthly and new_has_monthly
                is_migrating_from_monthly = old_has_monthly and not new_has_monthly
                
                # Track monthly inputs and emissions if present
                for month_key in set(old_monthly.keys()) | set(new_monthly.keys()):
                    old_month_data = old_monthly.get(month_key, {}) or {}
                    new_month_data = new_monthly.get(month_key, {}) or {}
                    old_month_inputs = old_month_data.get("inputs", {}) or {}
                    new_month_inputs = new_month_data.get("inputs", {}) or {}
                    
                    # Track monthly input changes
                    for input_key in set(old_month_inputs.keys()) | set(new_month_inputs.keys()):
                        if input_key.endswith('_unit'):
                            continue
                        old_input_val = old_month_inputs.get(input_key)
                        new_input_val = new_month_inputs.get(input_key)
                        
                        # STRUCTURAL MIGRATION FIX: When migrating TO monthly, check if old value exists in flat structure
                        effective_old_val = old_input_val
                        if is_migrating_to_monthly and old_input_val is None:
                            # Check flat structure for old value
                            effective_old_val = old_inputs.get(input_key)
                        
                        # STRUCTURAL MIGRATION FIX: When migrating FROM monthly, check if new value exists in flat structure
                        effective_new_val = new_input_val
                        if is_migrating_from_monthly and new_input_val is None:
                            effective_new_val = new_inputs.get(input_key)
                        
                        if effective_old_val != effective_new_val and (effective_old_val is not None or effective_new_val is not None):
                            input_label = input_label_map.get(input_key, input_key.replace('_', ' ').title())
                            changes.append({
                                "field": f"employee_input_{input_key}",
                                "old_value": effective_old_val if effective_old_val is not None else "(not set)",
                                "new_value": effective_new_val if effective_new_val is not None else "(not set)",
                                "field_type": "employee_input",
                                "employee_name": emp_name,
                                "display_name": f"{input_label} ({month_key.title()})"
                            })
                    
                    # Track monthly emissions changes per employee
                    old_month_emissions = old_month_data.get("emissions", {}) or {}
                    new_month_emissions = new_month_data.get("emissions", {}) or {}
                    old_month_co2e = old_month_emissions.get("co2e")
                    new_month_co2e = new_month_emissions.get("co2e")
                    
                    # STRUCTURAL MIGRATION FIX: When migrating TO monthly, use flat emissions as old value
                    effective_old_co2e = old_month_co2e
                    if is_migrating_to_monthly and old_month_co2e is None:
                        flat_old_emissions = old_yearly.get("emissions", {}) or old_emp.get("emissions", {}) or {}
                        effective_old_co2e = flat_old_emissions.get("co2e")
                    
                    # STRUCTURAL MIGRATION FIX: When migrating FROM monthly, use flat emissions as new value
                    effective_new_co2e = new_month_co2e
                    if is_migrating_from_monthly and new_month_co2e is None:
                        flat_new_emissions = new_yearly.get("emissions", {}) or new_emp.get("emissions", {}) or {}
                        effective_new_co2e = flat_new_emissions.get("co2e")
                    
                    if effective_old_co2e is not None or effective_new_co2e is not None:
                        old_val = float(effective_old_co2e) if effective_old_co2e is not None else 0
                        new_val = float(effective_new_co2e) if effective_new_co2e is not None else 0
                        if abs(old_val - new_val) > 0.0001:
                            changes.append({
                                "field": "employee_emissions_monthly",
                                "old_value": f"{old_val:.4f} tCO2e" if effective_old_co2e is not None else "(not calculated)",
                                "new_value": f"{new_val:.4f} tCO2e" if effective_new_co2e is not None else "(not calculated)",
                                "field_type": "employee_emission",
                                "employee_name": emp_name,
                                "display_name": f"Emissions ({month_key.title()})"
                            })
                
                # Track ALL yearly/flat input fields dynamically
                all_input_keys = set(old_inputs.keys()) | set(new_inputs.keys())
                for input_key in all_input_keys:
                    old_input_val = old_inputs.get(input_key)
                    new_input_val = new_inputs.get(input_key)
                    
                    # Skip unit fields
                    if input_key.endswith('_unit'):
                        continue
                    
                    # FIX: Skip tracking "removal" of flat structure fields when they now exist in monthly structure
                    # This prevents duplicate tracking when migrating from flat to monthly structure
                    if old_input_val is not None and new_input_val is None:
                        # Check if this field exists in any month of new_monthly
                        field_exists_in_monthly = False
                        for month_data in new_monthly.values():
                            if isinstance(month_data, dict):
                                month_inputs = month_data.get("inputs", {}) or {}
                                if input_key in month_inputs and month_inputs.get(input_key) is not None:
                                    field_exists_in_monthly = True
                                    break
                        if field_exists_in_monthly:
                            continue  # Skip this "removal" as field now exists in monthly structure
                    
                    if old_input_val != new_input_val and (old_input_val is not None or new_input_val is not None):
                        # Get human-readable label
                        input_label = input_label_map.get(input_key, input_key.replace('_', ' ').title())
                        changes.append({
                            "field": f"employee_input_{input_key}",
                            "old_value": old_input_val if old_input_val is not None else "(not set)",
                            "new_value": new_input_val if new_input_val is not None else "(not set)",
                            "field_type": "employee_input",
                            "employee_name": emp_name,
                            "display_name": input_label
                        })
                
                # Track employee emissions (co2e) changes - yearly/flat structure
                old_emissions = old_yearly.get("emissions", {}) or old_emp.get("emissions", {}) or {}
                new_emissions = new_yearly.get("emissions", {}) or new_emp.get("emissions", {}) or {}
                
                old_co2e = old_emissions.get("co2e")
                new_co2e = new_emissions.get("co2e")
                
                # STRUCTURAL MIGRATION FIX: Skip tracking yearly/flat emissions separately when migrating to/from monthly
                # The monthly emissions tracking above already handles the migration with proper old/new values
                if is_migrating_to_monthly or is_migrating_from_monthly:
                    # Skip - already tracked in monthly emissions with proper values from flat structure
                    pass
                elif old_co2e is not None or new_co2e is not None:
                    # Compare with tolerance for floating point
                    old_val = float(old_co2e) if old_co2e is not None else 0
                    new_val = float(new_co2e) if new_co2e is not None else 0
                    if abs(old_val - new_val) > 0.0001:  # Tolerance for floating point comparison
                        changes.append({
                            "field": "employee_emissions",
                            "old_value": f"{old_val:.4f} tCO2e" if old_co2e is not None else "(not calculated)",
                            "new_value": f"{new_val:.4f} tCO2e" if new_co2e is not None else "(not calculated)",
                            "field_type": "employee_emission",
                            "employee_name": emp_name,
                            "display_name": "Emissions (tCO2e)"
                        })
    
    for field in fields_to_track:
        # Skip fields that are handled specially above
        if field in ["evidence_url", "evidence_file_name", "calculation_method_scope3", "sub_category", "scope3_activity", "activity", "activity_name", "process_names", "process_descriptions", "employees", "monthly_totals", "yearly_total"]:
            continue
            
        old_val = old_values.get(field)
        new_val = new_values.get(field)
        
        # Handle nested dicts/lists comparison
        if isinstance(old_val, (dict, list)) or isinstance(new_val, (dict, list)):
            # Convert to JSON string for comparison
            import json
            old_str = json.dumps(old_val, sort_keys=True, default=str) if old_val else None
            new_str = json.dumps(new_val, sort_keys=True, default=str) if new_val else None
            if old_str != new_str:
                changes.append({
                    "field": field,
                    "old_value": old_val,
                    "new_value": new_val,
                    "field_type": "complex"
                })
        elif old_val != new_val:
            # Only record if there's an actual change
            # Handle None vs empty string equivalence
            if not (old_val in (None, '', 0) and new_val in (None, '', 0)):
                changes.append({
                    "field": field,
                    "old_value": old_val,
                    "new_value": new_val,
                    "field_type": "simple"
                })
    
    # Handle dynamic_field_values specially - only show meaningful changes
    old_dfv = old_values.get("dynamic_field_values", {}) or {}
    new_dfv = new_values.get("dynamic_field_values", {}) or {}
    
    # Fields to skip in dynamic field values tracking
    dfv_skip_fields = ['scope3_ef_id', 'ef_id', 'formula_id', 'id', '_id', 'matched_formula_id',
                       'scope3_subcategory', 'scope3_activity_type', 'ppp', 'scope3_activity', 
                       'biogenic_scope_selection']
    
    # Required input fields - always show if value changed
    required_input_fields = ['qty', 'activity_value', 'spent_value', 'activity_value_supplier_based', 
                             'emission_factor_supplier_based', 'distance', 'weight']
    
    all_dfv_keys = set(old_dfv.keys()) | set(new_dfv.keys())
    dfv_changes = {}
    
    for key in all_dfv_keys:
        if key in dfv_skip_fields or key.startswith('override_'):
            continue
            
        old_field = old_dfv.get(key, {})
        new_field = new_dfv.get(key, {})
        
        # Get values - handle both dict format and direct values
        old_value = old_field.get('value') if isinstance(old_field, dict) else old_field
        new_value = new_field.get('value') if isinstance(new_field, dict) else new_field
        old_unit = old_field.get('unit', '') if isinstance(old_field, dict) else ''
        new_unit = new_field.get('unit', '') if isinstance(new_field, dict) else ''
        
        # Check if user actually overrode these fields
        old_is_override = old_field.get('is_override', False) if isinstance(old_field, dict) else False
        new_is_override = new_field.get('is_override', False) if isinstance(new_field, dict) else False
        
        # Determine if this is a required input field
        is_required_field = key in required_input_fields
        
        # For REQUIRED fields (qty, activity_value, etc.): show if value actually changed
        if is_required_field:
            # Skip if value didn't change
            if old_value == new_value and old_unit == new_unit:
                continue
        else:
            # For OPTIONAL/OVERRIDE fields (cv, density, ef, etc.):
            # ONLY show if is_override is True in either old or new
            # DO NOT show if both old and new have is_override=False (user never touched it)
            if not old_is_override and not new_is_override:
                continue
            
            # Skip if nothing actually changed
            if old_value == new_value and old_unit == new_unit and old_is_override == new_is_override:
                continue
        
        # Record the change with full precision
        dfv_changes[key] = {
            "old_value": old_value,
            "old_unit": old_unit,
            "new_value": new_value,
            "new_unit": new_unit,
            "old_is_override": old_is_override,
            "new_is_override": new_is_override,
            "is_required": is_required_field
        }
    
    # Add dfv changes as a structured field if there are any meaningful changes
    if dfv_changes:
        # Build old and new value dicts, only including fields with actual values
        old_vals = {}
        new_vals = {}
        for k, v in dfv_changes.items():
            # For required fields, always include if there's a value
            if v.get("is_required"):
                if v["old_value"] not in (None, ''):
                    old_vals[k] = {"value": v["old_value"], "unit": v["old_unit"]}
                if v["new_value"] not in (None, ''):
                    new_vals[k] = {"value": v["new_value"], "unit": v["new_unit"]}
            else:
                # For optional/override fields, include if is_override was/is True
                # Handle transitions between database default and custom override
                if v["old_is_override"] and v["old_value"] not in (None, '', 0, 0.0):
                    old_vals[k] = {"value": v["old_value"], "unit": v["old_unit"]}
                elif not v["old_is_override"] and v["new_is_override"]:
                    # User is switching from database default to custom override
                    old_vals[k] = {"value": "Default Value Used", "unit": ""}
                
                if v["new_is_override"] and v["new_value"] not in (None, '', 0, 0.0):
                    new_vals[k] = {"value": v["new_value"], "unit": v["new_unit"]}
                elif v["old_is_override"] and not v["new_is_override"]:
                    # User is switching from custom override back to database default
                    new_vals[k] = {"value": "Default Value Used", "unit": ""}
        
        # Only add to changes if there's something to show
        if old_vals or new_vals:
            changes.append({
                "field": "input_values",
                "old_value": old_vals,
                "new_value": new_vals,
                "field_type": "input_values"
            })
    
    # Remove the raw dynamic_field_values from changes as we handle it specially above
    changes = [c for c in changes if c["field"] != "dynamic_field_values"]
    
    return changes



def verify_password(plain_password, hashed_password):
    return _shared_verify_password(plain_password, hashed_password)

def get_password_hash(password):
    return _shared_get_password_hash(password)

def create_access_token(data: dict):
    # Delegates to shared.helpers.tokens — same JWT_SECRET / ALGORITHM /
    # ACCESS_TOKEN_EXPIRE_MINUTES (re-exported above as SECRET_KEY / ALGORITHM /
    # ACCESS_TOKEN_EXPIRE_MINUTES). Behaviour is byte-identical.
    return _shared_create_access_token(data)

# Phase B2: get_current_user, get_super_admin_user, get_admin_user are now
# imported from modules.auth.dependencies (top of file). Definitions removed
# from this file; behaviour is byte-identical.

# Phase B2: auth Pydantic models (UserBase, UserCreate, UserLogin, PasswordChange,
# PasswordReset, ProfileUpdate, UserCreateRequest, UserResponse, TokenResponse)
# are now defined in modules/auth/contracts.py and modules/users/contracts.py.
# We re-import them here so any legacy code in this file that still references
# the bare names continues to work.
from modules.auth.contracts import (  # noqa: E402
    UserBase, UserCreate, UserLogin,
    PasswordChange, PasswordReset, ProfileUpdate,
    UserResponse, TokenResponse, ResetPasswordRequest,
)
from modules.users.contracts import UserCreateRequest  # noqa: E402

# Phase B3: re-import org/facility/sink contracts so any legacy code in this
# file referencing the bare names continues to work unchanged.
from modules.organizations.contracts import OrganizationCreate, OrganizationResponse  # noqa: E402
from modules.facilities.contracts import FacilityCreate, FacilityResponse  # noqa: E402
from modules.sinks.contracts import SinkCreate, SinkResponse  # noqa: E402

# Phase B4: re-import emissions contracts so legacy POST/PUT routes still work
# (they remain in this file until Phase B5).
from modules.emissions.contracts import (  # noqa: E402
    EmissionRecordCreate, EmissionRecordResponse, EmissionHistoryResponse, DynamicFieldValue,
)
# Phase B5: re-import C7 contracts (now in modules/emissions/c7_contracts.py).
from modules.emissions.c7_contracts import (  # noqa: E402
    C7MonthlyEntryCreate, C7MonthlyEntryResponse,
    C7YearlyEntryCreate, C7YearlyEntryResponse,
)

# Phase B2: get_current_user / get_super_admin_user / get_admin_user moved to
# modules/auth/dependencies.py and imported at the top of this file.

# Phase B2: auth/user Pydantic models moved to modules/auth/contracts.py
# and modules/users/contracts.py — re-imported at the top of this file.

# Phase B3: OrganizationCreate / OrganizationResponse moved to modules/organizations/contracts.py
# (re-imported at the top of this file).

# Phase B3: FacilityCreate / FacilityResponse moved to modules/facilities/contracts.py
# (re-imported at the top of this file).



# ============================================
# UNIT MANAGEMENT MODELS
# Centralized unit definitions for the entire system
# ============================================



# Default units to seed the database
DEFAULT_UNITS = [
    # Mass units (base: kg)
    {"name": "Kilogram", "symbol": "kg", "unit_type": "mass", "aliases": ["kilogram", "kilograms", "KG", "Kg"], "is_base_unit": True},
    {"name": "Gram", "symbol": "g", "unit_type": "mass", "aliases": ["gram", "grams", "G"], "is_base_unit": False},
    {"name": "Tonne", "symbol": "t", "unit_type": "mass", "aliases": ["tonne", "tonnes", "ton", "tons", "T", "metric ton"], "is_base_unit": False},
    {"name": "Pound", "symbol": "lb", "unit_type": "mass", "aliases": ["pound", "pounds", "lbs", "LB"], "is_base_unit": False},
    # Volume units (base: L)
    {"name": "Litre", "symbol": "L", "unit_type": "volume", "aliases": ["litre", "litres", "liter", "liters", "l"], "is_base_unit": True},
    {"name": "Millilitre", "symbol": "mL", "unit_type": "volume", "aliases": ["millilitre", "millilitres", "milliliter", "milliliters", "ml", "ML"], "is_base_unit": False},
    {"name": "Kilolitre", "symbol": "kL", "unit_type": "volume", "aliases": ["kilolitre", "kilolitres", "kiloliter", "kiloliters", "kl", "KL"], "is_base_unit": False},
    {"name": "Cubic Metre", "symbol": "m³", "unit_type": "volume", "aliases": ["cubic metre", "cubic meter", "cubic metres", "cubic meters", "m3", "M3"], "is_base_unit": False},
    {"name": "Gallon (US)", "symbol": "gal", "unit_type": "volume", "aliases": ["gallon", "gallons", "us gallon", "us gallons", "GAL"], "is_base_unit": False},
    {"name": "Cubic Feet", "symbol": "ft³", "unit_type": "volume", "aliases": ["cubic foot", "cubic feet", "ft3", "FT3"], "is_base_unit": False},
    # Energy units (base: kWh)
    {"name": "Kilowatt-hour", "symbol": "kWh", "unit_type": "energy", "aliases": ["kilowatt-hour", "kilowatt hour", "kwh", "KWH"], "is_base_unit": True},
    {"name": "Megawatt-hour", "symbol": "MWh", "unit_type": "energy", "aliases": ["megawatt-hour", "megawatt hour", "mwh", "MWH"], "is_base_unit": False},
    {"name": "Gigawatt-hour", "symbol": "GWh", "unit_type": "energy", "aliases": ["gigawatt-hour", "gigawatt hour", "gwh", "GWH"], "is_base_unit": False},
    {"name": "Terajoule", "symbol": "TJ", "unit_type": "energy", "aliases": ["terajoule", "terajoules", "tj"], "is_base_unit": False},
    {"name": "Gigajoule", "symbol": "GJ", "unit_type": "energy", "aliases": ["gigajoule", "gigajoules", "gj"], "is_base_unit": False},
    {"name": "Megajoule", "symbol": "MJ", "unit_type": "energy", "aliases": ["megajoule", "megajoules", "mj"], "is_base_unit": False},
]

# Fuel Database Models - Comprehensive fuel parameters for emission calculations



# ============== SCOPE 3 EMISSION FACTORS ==============



# GWP Constants moved to shared/constants/gwp.py (Phase B9).
from shared.constants.gwp import GWP_VALUES, GWP_DEFAULT_SOURCE  # noqa: F401

# ============================================
# UNIT NORMALIZATION SYSTEM (AI-Compatible)
# ============================================

# Unit Classifications
UNIT_CLASSIFICATIONS = {
    "mass_units": ["kg", "g", "tonne", "t", "lb", "ton"],
    "volume_units_liquid": ["litre", "L", "kilolitre", "kL", "millilitre", "mL", "gallon", "gal"],
    "volume_units_cubic": ["m3", "m³", "cm3", "cm³", "ft3", "ft³"]
}

# Quantity to kg Conversion Rules
QUANTITY_TO_KG_CONVERSIONS = {
    # Mass units → kg
    "kg": 1,
    "g": 0.001,
    "tonne": 1000,
    "t": 1000,
    "lb": 0.453592,
    "ton": 907.185,  # US short ton
    # Volume liquid units → requires density (kg/L)
    "litre": "density_kg_per_L",
    "L": "density_kg_per_L",
    "kilolitre": "1000 * density_kg_per_L",
    "kL": "1000 * density_kg_per_L",
    "millilitre": "0.001 * density_kg_per_L",
    "mL": "0.001 * density_kg_per_L",
    "gallon": "3.78541 * density_kg_per_L",
    "gal": "3.78541 * density_kg_per_L",
    # Volume cubic units → requires density (kg/m³)
    "m3": "density_kg_per_m3",
    "m³": "density_kg_per_m3",
    "cm3": "0.000001 * density_kg_per_m3",
    "cm³": "0.000001 * density_kg_per_m3",
    "ft3": "0.0283168 * density_kg_per_m3",
    "ft³": "0.0283168 * density_kg_per_m3"
}

# NCV Unit Conversions to TJ/kg
NCV_TO_TJ_PER_KG = {
    "TJ/Gg": 0.001,      # 1 TJ/Gg = 0.001 TJ/kg (since 1 Gg = 1000 t = 1,000,000 kg)
    "TJ/kg": 1,
    "GJ/t": 0.001,       # 1 GJ/t = 0.001 TJ/kg
    "GJ/kg": 0.001,
    "MJ/kg": 0.000001,   # 1 MJ/kg = 0.000001 TJ/kg
    "MJ/L": "0.000001 / density_kg_per_L",  # Needs density
    "kJ/kg": 0.000000001,
    "BTU/lb": 0.000000001055 / 0.453592  # Convert BTU to TJ and lb to kg
}

# Emission Factor Unit Conversions to kg/TJ
EF_TO_KG_PER_TJ = {
    "kg/TJ": 1,
    "kg/GJ": 1000,       # 1 kg/GJ = 1000 kg/TJ
    "g/MJ": 1,           # 1 g/MJ = 1 kg/TJ (1000g/1000MJ)
    "t/TJ": 1000,        # 1 t/TJ = 1000 kg/TJ
    "kg CO2/TJ": 1,
    "kg CH4/TJ": 1,
    "kg N2O/TJ": 1
}

# Density Unit Conversions
DENSITY_CONVERSIONS = {
    "kg/L": {"to_kg_per_L": 1, "to_kg_per_m3": 1000},
    "kg/m3": {"to_kg_per_L": 0.001, "to_kg_per_m3": 1},
    "kg/m³": {"to_kg_per_L": 0.001, "to_kg_per_m3": 1},
    "g/mL": {"to_kg_per_L": 1, "to_kg_per_m3": 1000},
    "g/cm3": {"to_kg_per_L": 1, "to_kg_per_m3": 1000},
    "g/cm³": {"to_kg_per_L": 1, "to_kg_per_m3": 1000},
    "lb/gal": {"to_kg_per_L": 0.119826, "to_kg_per_m3": 119.826},
    "t/m3": {"to_kg_per_L": 1, "to_kg_per_m3": 1000},
    "t/m³": {"to_kg_per_L": 1, "to_kg_per_m3": 1000}
}

# Unit Configuration Model for SuperAdmin


# Formula Parameter with Unit Validation


# Formula Definition Models (the actual formulas/equations)


# Emission Configuration - Maps scopes/categories to formulas (SuperAdmin configurable)


# Phase B4: DynamicFieldValue / EmissionRecordCreate / EmissionRecordResponse /
# EmissionHistoryResponse moved to modules/emissions/contracts.py — re-imported above.

# Phase B7: DashboardStats moved to modules/dashboards/contracts.py.

# Sink Models
# Phase B3: SinkCreate / SinkResponse moved to modules/sinks/contracts.py
# (re-imported at the top of this file).

# Calculation Formula Models


# Sector model for predefined sectors



# Process Template Models





# ===== Base Year Emissions Models =====
class BaseYearEmissionEntry(BaseModel):
    """Single emission entry for base year"""
    scope: str
    category: str
    subcategory: Optional[str] = None
    tco2e: float

class BaseYearEmissionsCreate(BaseModel):
    """Create base year emissions record"""
    organization_id: str
    facility_id: Optional[str] = None  # None for org-level
    scope_group: str = "scope12"  # "scope12" for Scope 1&2, "scope3" for Scope 3
    base_year: str  # "2023-2024" for FY or "2024" for calendar year
    base_year_type: str  # "financial_year" or "calendar_year"
    is_oldest_year: bool = False  # True if auto-selected as oldest year
    emissions_data: List[BaseYearEmissionEntry] = []
    sinks_data: Optional[List[Dict[str, Any]]] = None  # Sinks data for base year
    justification: str  # MANDATORY: Justification for selecting this base year
    notes: Optional[str] = None  # Additional notes

class BaseYearEmissionsUpdate(BaseModel):
    """Update base year emissions record"""
    base_year: Optional[str] = None
    base_year_type: Optional[str] = None
    is_oldest_year: Optional[bool] = None
    emissions_data: Optional[List[BaseYearEmissionEntry]] = None
    sinks_data: Optional[List[Dict[str, Any]]] = None  # Sinks data for base year
    justification: Optional[str] = None  # Updated justification
    notes: Optional[str] = None  # Additional notes

class BaseYearChangeRequest(BaseModel):
    """Request model for changing base year"""
    new_base_year: str
    new_base_year_type: str
    change_reason: str  # MANDATORY: Reason for changing the base year
    recalculate_emissions: bool = False  # Whether to recalculate emissions for new year

class BaseYearVersionHistory(BaseModel):
    """Version history entry with detailed change tracking"""
    version: int
    change_type: str  # "created", "updated", "year_changed"
    previous_base_year: Optional[str] = None
    new_base_year: Optional[str] = None
    emissions_data: List[BaseYearEmissionEntry]
    changed_fields: Optional[List[str]] = None  # List of fields that changed
    change_reason: Optional[str] = None
    justification: Optional[str] = None
    changed_by: str
    changed_by_email: Optional[str] = None
    changed_by_name: Optional[str] = None
    changed_at: str

class BaseYearEmissionsResponse(BaseModel):
    """Response model for base year emissions"""
    model_config = ConfigDict(extra="ignore")
    id: str
    organization_id: str
    facility_id: Optional[str] = None
    scope_group: str = "scope12"  # "scope12" for Scope 1&2, "scope3" for Scope 3
    base_year: str
    base_year_type: str
    is_oldest_year: bool = False
    emissions_data: List[Dict[str, Any]] = []
    sinks_data: Optional[List[Dict[str, Any]]] = None  # Sinks data for base year
    justification: Optional[str] = None  # Justification for base year selection
    notes: Optional[str] = None  # Additional notes
    status: str = "configured"  # "configured", "incomplete", "modified"
    version: int = 1
    version_history: List[Dict[str, Any]] = []
    created_by: str
    created_by_email: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: str
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None
    updated_by_email: Optional[str] = None
    updated_by_name: Optional[str] = None


# ============================================================================
# Configuration / Label Mappings Endpoint
# Provides centralized labels for calculation methods, activity types, etc.
# ============================================================================
@api_router.get("/config/labels")
async def get_config_labels():
    """
    Returns centralized display labels for enum values.
    Frontend should use these labels instead of hardcoding.
    Labels are fetched from ce_input_field_mappings options.
    """
    # Fetch calculation_method_scope3 labels from input field mappings
    method_mapping = await db.ce_input_field_mappings.find_one(
        {"maps_to_variable": "calculation_method_scope3", "is_active": True},
        {"_id": 0, "options": 1}
    )
    
    # Build calculation method labels from DB options
    calculation_method_labels = {}
    calculation_method_short_labels = {}
    
    if method_mapping and method_mapping.get("options"):
        for opt in method_mapping.get("options", []):
            value = opt.get("value")
            label = opt.get("label")
            short_label = opt.get("short_label")
            if value and label:
                calculation_method_labels[value] = label
                # Use short_label if provided, otherwise derive from label
                calculation_method_short_labels[value] = short_label or label.split()[0] if label else value
    
    # Fallback defaults if no mapping exists (will be used until mapping is created)
    if not calculation_method_labels:
        calculation_method_labels = {
            "activity_basis": "Average Data Based",
            "spend_basis": "Spend Based", 
            "supplier_basis": "Supplier Based"
        }
        calculation_method_short_labels = {
            "activity_basis": "Average",
            "spend_basis": "Spend",
            "supplier_basis": "Supplier"
        }
    
    # Fetch subcategory_selection labels from input field mappings
    subcategory_mapping = await db.ce_input_field_mappings.find_one(
        {"maps_to_variable": "subcategory_selection", "is_active": True},
        {"_id": 0, "options": 1}
    )
    
    subcategory_labels = {}
    if subcategory_mapping and subcategory_mapping.get("options"):
        for opt in subcategory_mapping.get("options", []):
            value = opt.get("value")
            label = opt.get("label")
            if value and label:
                subcategory_labels[value] = label
    
    # Fallback defaults for subcategories
    if not subcategory_labels:
        subcategory_labels = {
            "stationary_combustion": "Stationary Combustion",
            "mobile_combustion": "Mobile Combustion",
            "fugitive_emissions": "Fugitive Emissions",
            "energy": "Energy",
            "process_emissions": "Process Emissions",
            "biogenic": "Biogenic"
        }
    
    # Fetch type_of_product labels from input field mappings
    product_type_mapping = await db.ce_input_field_mappings.find_one(
        {"maps_to_variable": "type_of_product", "is_active": True},
        {"_id": 0, "options": 1}
    )
    
    product_type_labels = {}
    if product_type_mapping and product_type_mapping.get("options"):
        for opt in product_type_mapping.get("options", []):
            value = opt.get("value")
            label = opt.get("label")
            if value and label:
                product_type_labels[value] = label
    
    # Fallback defaults for product types
    if not product_type_labels:
        product_type_labels = {
            "continuous_usage": "Continuous Usage",
            "one_time_use": "One Time Use"
        }
    
    return {
        "calculation_methods": calculation_method_labels,
        "calculation_methods_short": calculation_method_short_labels,
        "subcategories": subcategory_labels,
        "product_types": product_type_labels,
        "scopes": {
            "scope1": "Scope 1",
            "scope2": "Scope 2", 
            "scope3": "Scope 3",
            "biogenic": "Biogenic"
        }
    }


# Auth endpoints
# Phase B2: 7 auth routes (/auth/signup, /auth/login, /auth/change-password,
# /auth/forgot-password, /auth/reset-password, /auth/me, /auth/profile) moved to
# modules/auth/router.py — included on api_router at the top of this file.

# Phase B9: Super-admin / Platform Config routes (~91 routes covering
# /super-admin/*, /units, /fuel-database, /scope3-ef, /emission-categories,
# /base-year/*, /gwp-config(s), /currency-conversion, /formula-*,
# /emission-configurations, /emission-factors, /custom-emission-factors,
# /calculation-formulas, /sectors, /process-templates)
# moved to modules/superadmin/router.py.

# Phase B4: DELETE /emissions/{id} moved to modules/emissions/router.py

# Phase B3: 5 sink routes moved to modules/sinks/router.py

# ===== Base Year Emissions Endpoints =====

@api_router.get("/base-year-emissions/oldest-year/{entity_type}/{entity_id}")
async def get_oldest_reporting_year(
    entity_type: str,  # "organization" or "facility"
    entity_id: str,
    current_user: dict = Depends(get_current_user),
    scope_group: Optional[str] = None  # "scope12" or "scope3" - Phase 2 scope filtering
):
    """Get the oldest reporting year with emissions data for an entity, optionally filtered by scope group"""
    if entity_type == "facility":
        query = {"facility_id": entity_id}
    else:  # organization
        # Get all facilities for this org
        facilities = await db.facilities.find(
            {"organization_id": entity_id, "is_active": True}, 
            {"_id": 0, "id": 1}
        ).to_list(1000)
        facility_ids = [f["id"] for f in facilities]
        query = {"facility_id": {"$in": facility_ids}}
    
    # Phase 2: Add scope filter if specified
    if scope_group:
        if scope_group == "scope12":
            # Scope 1&2 includes: scope1, scope2, and biogenic emissions that are NOT scope3-tagged
            query["$or"] = [
                {"scope": {"$in": ["scope1", "scope2"]}},
                {"scope": "biogenic", "biogenic_scope_selection": {"$in": [None, "scope1"]}}
            ]
        elif scope_group == "scope3":
            # Scope 3 includes: scope3 and biogenic emissions tagged as scope3
            query["$or"] = [
                {"scope": "scope3"},
                {"scope": "biogenic", "biogenic_scope_selection": "scope3"}
            ]
    
    # Find oldest emission record - check emission_records collection
    emissions = await db.emission_records.find(query, {"_id": 0, "reporting_period": 1}).to_list(10000)
    
    if not emissions:
        return {"has_emissions": False, "oldest_year": None, "message": "No emissions data found"}
    
    # Get organization's reporting year type first (needed for year calculation)
    if entity_type == "facility":
        facility = await db.facilities.find_one({"id": entity_id}, {"_id": 0, "organization_id": 1})
        org_id = facility.get("organization_id") if facility else None
    else:
        org_id = entity_id
    
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0, "reporting_year_type": 1})
    reporting_year_type = org.get("reporting_year_type", "calendar_year") if org else "calendar_year"
    is_financial_year = reporting_year_type == "financial_year"
    
    # Helper to get fiscal year from a period
    def get_fiscal_year_from_period(period, is_fy):
        """
        Get the fiscal/calendar year for a reporting period.
        For financial year: April-March cycle
        - April 2025 to March 2026 = FY 2025-2026 -> returns 2025
        - January 2026 (month 1) is in FY 2025-2026 -> returns 2025
        """
        import re
        from calendar import month_name
        
        month = None
        year = None
        
        # Try FY format first: "FY 2025-26" or "FY 2025-2026"
        fy_match = re.match(r'FY\s*(\d{4})-(\d{2,4})', period, re.IGNORECASE)
        if fy_match:
            return int(fy_match.group(1))  # Return start year directly
        
        # Try CY format: "CY 2025" or "CY2025"
        cy_match = re.match(r'CY\s*(\d{4})', period, re.IGNORECASE)
        if cy_match:
            return int(cy_match.group(1))
        
        # Try format: "January 2024"
        for i, m in enumerate(month_name):
            if m and m.lower() in period.lower():
                year_match = re.search(r'20\d{2}', period)
                if year_match:
                    month = i
                    year = int(year_match.group())
                    break
        
        # Try format: "2024-01" or "2024-1"
        if month is None:
            match = re.match(r'(\d{4})-(\d{1,2})', period)
            if match:
                year = int(match.group(1))
                month = int(match.group(2))
        
        if year is None:
            return None
        
        if is_fy and month is not None:
            # For financial year: months 1-3 (Jan-Mar) belong to the previous FY
            # FY starts in April (month 4), so Jan 2026 = FY 2025-2026
            if month >= 1 and month <= 3:
                return year - 1  # Jan-Mar 2026 -> FY 2025
            else:
                return year  # Apr-Dec 2025 -> FY 2025
        else:
            return year
    
    # Parse reporting periods and find the oldest fiscal/calendar year
    fiscal_years = set()
    for em in emissions:
        period = em.get("reporting_period", "")
        fy = get_fiscal_year_from_period(period, is_financial_year)
        if fy:
            fiscal_years.add(fy)
    
    if not fiscal_years:
        return {"has_emissions": False, "oldest_year": None, "message": "Could not determine year from emissions"}
    
    oldest_year = min(fiscal_years)
    
    # Format the year based on type
    if is_financial_year:
        oldest_year_formatted = f"FY {oldest_year}-{oldest_year + 1}"
    else:
        oldest_year_formatted = str(oldest_year)
    
    return {
        "has_emissions": True,
        "oldest_year": oldest_year,
        "oldest_year_formatted": oldest_year_formatted,
        "reporting_year_type": reporting_year_type
    }


@api_router.get("/base-year-emissions/emission-combinations/{entity_type}/{entity_id}")
async def get_emission_combinations(
    entity_type: str,  # "organization" or "facility"
    entity_id: str,
    current_user: dict = Depends(get_current_user),
    year: Optional[int] = None,  # Optional year filter to get actual emissions
    year_type: Optional[str] = None,  # "financial_year" or "calendar_year"
    scope_group: Optional[str] = None,  # Phase 2: "scope12" or "scope3" for filtering
    base_year_format: Optional[str] = None  # Phase 2: e.g., "FY 2023-2024" or "2024" for proportional allocation
):
    """Get unique Scope + Category + Subcategory combinations from emissions data with optional year aggregation.
    
    Phase 2 Enhancement: Supports proportional allocation when base year crosses calendar/financial boundaries.
    - If monthly data exists: uses actual overlapping months
    - If only yearly data: uses proportional allocation based on overlapping months
    """
    import re
    from calendar import month_name
    
    if entity_type == "facility":
        query = {"facility_id": entity_id}
        # Get org's reporting year type
        facility = await db.facilities.find_one({"id": entity_id}, {"_id": 0, "organization_id": 1})
        org_id = facility.get("organization_id") if facility else None
    else:  # organization - aggregate from all facilities
        org_id = entity_id
        facilities = await db.facilities.find(
            {"organization_id": entity_id, "is_active": True}, 
            {"_id": 0, "id": 1}
        ).to_list(1000)
        facility_ids = [f["id"] for f in facilities]
        query = {"facility_id": {"$in": facility_ids}}
    
    # Phase 2: Add scope filter if specified
    if scope_group:
        if scope_group == "scope12":
            # Scope 1&2 includes: scope1, scope2, and biogenic emissions that are NOT scope3-tagged
            query["$or"] = [
                {"scope": {"$in": ["scope1", "scope2"]}},
                {"scope": "biogenic", "biogenic_scope_selection": {"$in": [None, "scope1"]}}
            ]
        elif scope_group == "scope3":
            # Scope 3 includes: scope3 and biogenic emissions tagged as scope3
            query["$or"] = [
                {"scope": "scope3"},
                {"scope": "biogenic", "biogenic_scope_selection": "scope3"}
            ]
    
    # Get organization's reporting year type if not provided
    if not year_type and org_id:
        org = await db.organizations.find_one({"id": org_id}, {"_id": 0, "reporting_year_type": 1})
        year_type = org.get("reporting_year_type", "calendar_year") if org else "calendar_year"
    
    # Use emission_records collection - get more fields for aggregation
    emissions = await db.emission_records.find(
        query, 
        {"_id": 0, "scope": 1, "category": 1, "sub_category": 1, "reporting_period": 1, 
         "co2e_emissions": 1, "calculated_co2e": 1, "frequency": 1, "total_emissions": 1,
         "biogenic_scope_selection": 1}
    ).to_list(10000)
    
    # Helper to transform biogenic scope to display value
    def get_display_scope(em):
        scope = em.get("scope", "")
        if scope == "biogenic":
            biogenic_sel = em.get("biogenic_scope_selection")
            if biogenic_sel == "scope3":
                return "Biogenic (Indirect)"
            else:
                return "Biogenic (Direct)"
        return scope
    
    # Helper function to parse reporting period and get month/year
    def parse_period(period):
        """Parse reporting period like 'January 2024', '2024-01', 'FY 2024-2025', 'CY 2025' and return (month_num, year, is_yearly, period_type)
        Returns: (month, year, is_yearly_aggregate, period_type)
        - For monthly: (month_num, year, False, 'monthly')
        - For yearly FY: (None, start_year, True, 'fy')
        - For yearly CY: (None, year, True, 'cy')
        """
        if not period:
            return (None, None, False, None)
        
        # Try FY format: "FY 2024-2025" or "FY 2024-25"
        fy_match = re.match(r'FY\s*(\d{4})-(\d{2,4})', period, re.IGNORECASE)
        if fy_match:
            start_year = int(fy_match.group(1))
            return (None, start_year, True, 'fy')  # Yearly aggregate for FY
        
        # Try CY format: "CY 2025" or "CY2025"
        cy_match = re.match(r'CY\s*(\d{4})', period, re.IGNORECASE)
        if cy_match:
            year = int(cy_match.group(1))
            return (None, year, True, 'cy')  # Yearly aggregate for CY
        
        # Try format: "January 2024"
        for i, m in enumerate(month_name):
            if m and m.lower() in period.lower():
                year_match = re.search(r'20\d{2}', period)
                if year_match:
                    return (i, int(year_match.group()), False, 'monthly')
        
        # Try format: "2024-01" or "2024-1"
        match = re.match(r'(\d{4})-(\d{1,2})', period)
        if match:
            return (int(match.group(2)), int(match.group(1)), False, 'monthly')
        
        return (None, None, False, None)
    
    # Calculate overlap months and proportional factor for CY record against FY base year
    def get_cy_fy_overlap(cy_year, fy_start_year):
        """
        Calculate overlap between a CY record and an FY base year.
        FY 2024-2025 = April 2024 to March 2025
        
        Returns: (overlaps, overlap_months, proportion)
        """
        # FY range: April of fy_start_year to March of fy_start_year+1
        # CY range: January to December of cy_year
        
        if cy_year == fy_start_year:
            # CY 2024 vs FY 2024-2025: Apr-Dec 2024 overlaps = 9 months
            return (True, 9, 9/12)
        elif cy_year == fy_start_year + 1:
            # CY 2025 vs FY 2024-2025: Jan-Mar 2025 overlaps = 3 months
            return (True, 3, 3/12)
        else:
            return (False, 0, 0)
    
    # Helper to check if a period is within the year range and get proportional factor
    def is_in_year_range_with_proportion(period, target_year, is_financial_year):
        """
        Check if period overlaps with target year and return (matches, proportion_factor)
        proportion_factor is 1.0 for exact matches, <1.0 for partial overlaps
        """
        month, year, is_yearly, period_type = parse_period(period)
        
        if year is None:
            return (False, 0)
        
        # Handle yearly aggregates (FY or CY format)
        if is_yearly:
            if is_financial_year:
                # Target is FY (e.g., FY 2024-2025 with target_year=2024)
                if period_type == 'fy':
                    # FY record: exact match if same start year
                    if year == target_year:
                        return (True, 1.0)
                    return (False, 0)
                elif period_type == 'cy':
                    # CY record against FY target: check overlap and calculate proportion
                    overlaps, overlap_months, proportion = get_cy_fy_overlap(year, target_year)
                    return (overlaps, proportion)
            else:
                # Target is CY: exact match for CY records
                if year == target_year:
                    return (True, 1.0)
                return (False, 0)
        
        # Handle monthly records
        if month is None:
            return (False, 0)
        
        if is_financial_year:
            # Financial year: April (4) of target_year to March (3) of target_year+1
            # FY 2024-2025 = April 2024 to March 2025
            if month >= 4 and year == target_year:
                return (True, 1.0)
            if month <= 3 and year == target_year + 1:
                return (True, 1.0)
            return (False, 0)
        else:
            # Calendar year: January (1) to December (12) of target_year
            if year == target_year:
                return (True, 1.0)
            return (False, 0)
    
    # If year is specified, filter and aggregate emissions by year with proportional allocation
    if year:
        is_financial = year_type == "financial_year"
        
        # Aggregate tCO2e by Scope + Category + Subcategory with proportional allocation
        aggregated = {}
        for em in emissions:
            period = em.get("reporting_period", "")
            matches, proportion = is_in_year_range_with_proportion(period, year, is_financial)
            
            if matches and proportion > 0:
                key = (
                    get_display_scope(em),
                    em.get("category", ""),
                    em.get("sub_category", "")
                )
                # Get tCO2e value - try multiple field names
                tco2e = em.get("total_emissions") or em.get("co2e_emissions") or em.get("calculated_co2e") or 0
                try:
                    tco2e = float(tco2e) if tco2e else 0
                except (ValueError, TypeError):
                    tco2e = 0
                
                # Apply proportional allocation
                tco2e = tco2e * proportion
                
                if key in aggregated:
                    aggregated[key] += tco2e
                else:
                    aggregated[key] = tco2e
        
        result = [
            {
                "scope": k[0], 
                "category": k[1], 
                "subcategory": k[2],
                "tco2e": round(aggregated[k], 4)
            }
            for k in sorted(aggregated.keys())
        ]
        
        year_label = f"FY {year}-{year+1}" if is_financial else str(year)
        # Only set has_values to True if we actually have results with values > 0
        has_values = len(result) > 0 and any(r["tco2e"] > 0 for r in result)
        return {"combinations": result, "total": len(result), "year": year, "year_label": year_label, "year_type": year_type, "has_values": has_values}
    
    # Without year, just return unique combinations with 0 values
    combinations = set()
    for em in emissions:
        combo = (
            get_display_scope(em),
            em.get("category", ""),
            em.get("sub_category", "")
        )
        combinations.add(combo)
    
    # Convert to list of dicts
    result = [
        {"scope": c[0], "category": c[1], "subcategory": c[2], "tco2e": 0}
        for c in sorted(combinations)
    ]
    
    return {"combinations": result, "total": len(result), "has_values": False}

# Phase 2: Endpoint for proportional allocation based on FY/CY overlap
@api_router.get("/base-year-emissions/proportional-emissions/{entity_type}/{entity_id}")
async def get_proportional_emissions(
    entity_type: str,
    entity_id: str,
    base_year: str,  # e.g., "FY 2023-2024" or "2024"
    current_user: dict = Depends(get_current_user),
    scope_group: Optional[str] = None
):
    """
    Phase 2: Get emissions with proportional allocation for base year that may cross CY/FY boundaries.
    
    Logic:
    - If monthly data exists for overlapping period: use actual monthly values
    - If only yearly data: use proportional allocation (e.g., 3/12 of annual value for 3 month overlap)
    """
    import re
    from calendar import month_name
    
    # Parse base year to determine the date range
    is_base_fy = base_year.startswith("FY")
    if is_base_fy:
        # Parse "FY 2023-2024" -> start_year=2023, end_year=2024
        match = re.match(r'FY\s*(\d{4})-(\d{4})', base_year)
        if match:
            base_start_year = int(match.group(1))
            base_end_year = int(match.group(2))
        else:
            raise HTTPException(status_code=400, detail="Invalid FY format. Expected 'FY YYYY-YYYY'")
    else:
        # Parse "2024" -> start_year=2024, end_year=2024
        base_start_year = int(base_year)
        base_end_year = base_start_year
    
    # Build query based on entity type
    if entity_type == "facility":
        query = {"facility_id": entity_id}
        facility = await db.facilities.find_one({"id": entity_id}, {"_id": 0, "organization_id": 1})
        org_id = facility.get("organization_id") if facility else None
    else:
        org_id = entity_id
        facilities = await db.facilities.find(
            {"organization_id": entity_id, "is_active": True}, 
            {"_id": 0, "id": 1}
        ).to_list(1000)
        facility_ids = [f["id"] for f in facilities]
        query = {"facility_id": {"$in": facility_ids}}
    
    # Add scope filter
    if scope_group:
        if scope_group == "scope12":
            query["$or"] = [
                {"scope": {"$in": ["scope1", "scope2"]}},
                {"scope": "biogenic", "biogenic_scope_selection": {"$in": [None, "scope1"]}}
            ]
        elif scope_group == "scope3":
            query["$or"] = [
                {"scope": "scope3"},
                {"scope": "biogenic", "biogenic_scope_selection": "scope3"}
            ]
    
    # Fetch all emissions
    emissions = await db.emission_records.find(
        query,
        {"_id": 0, "scope": 1, "category": 1, "sub_category": 1, "reporting_period": 1,
         "co2e_emissions": 1, "calculated_co2e": 1, "total_emissions": 1, "frequency": 1}
    ).to_list(10000)
    
    def parse_period(period):
        """Parse reporting period and return (month_num, year)"""
        for i, m in enumerate(month_name):
            if m and m.lower() in period.lower():
                year_match = re.search(r'20\d{2}', period)
                if year_match:
                    return (i, int(year_match.group()))
        match = re.match(r'(\d{4})-(\d{1,2})', period)
        if match:
            return (int(match.group(2)), int(match.group(1)))
        return (None, None)
    
    def is_month_in_base_year(month, year):
        """Check if a specific month/year falls within the base year range"""
        if is_base_fy:
            # FY 2023-2024 = April 2023 to March 2024
            if month >= 4 and year == base_start_year:
                return True
            if month <= 3 and year == base_end_year:
                return True
            return False
        else:
            # CY 2024 = Jan-Dec 2024
            return year == base_start_year
    
    # Group emissions by scope+category+subcategory
    grouped = {}
    for em in emissions:
        key = (em.get("scope", ""), em.get("category", ""), em.get("sub_category", ""))
        if key not in grouped:
            grouped[key] = []
        grouped[key].append(em)
    
    # Calculate proportional emissions for each group
    result = []
    for key, records in grouped.items():
        # Separate monthly and yearly records
        monthly_records = []
        yearly_records = []
        
        for rec in records:
            period = rec.get("reporting_period", "")
            frequency = rec.get("frequency", "monthly")
            month, year = parse_period(period)
            
            if month and year:
                # Check if this record is relevant (within potential overlap range)
                # For FY, check both years; for CY, check only base year
                if is_base_fy:
                    relevant_years = [base_start_year, base_end_year]
                else:
                    relevant_years = [base_start_year]
                
                if year in relevant_years:
                    if frequency == "yearly":
                        yearly_records.append({"record": rec, "year": year})
                    else:
                        # Monthly record - check if it's in base year
                        if is_month_in_base_year(month, year):
                            monthly_records.append(rec)
        
        total_tco2e = 0
        
        # First, sum up all monthly records that fall within base year
        for rec in monthly_records:
            tco2e = rec.get("total_emissions") or rec.get("co2e_emissions") or rec.get("calculated_co2e") or 0
            try:
                total_tco2e += float(tco2e) if tco2e else 0
            except (ValueError, TypeError):
                pass
        
        # For yearly records, apply proportional allocation
        for item in yearly_records:
            rec = item["record"]
            year = item["year"]
            tco2e = rec.get("total_emissions") or rec.get("co2e_emissions") or rec.get("calculated_co2e") or 0
            try:
                tco2e = float(tco2e) if tco2e else 0
            except (ValueError, TypeError):
                tco2e = 0
            
            # Calculate overlap months
            if is_base_fy:
                # For CY record overlapping with FY base year
                if year == base_start_year:
                    # Months Apr-Dec overlap (9 months)
                    overlap_months = 9
                elif year == base_end_year:
                    # Months Jan-Mar overlap (3 months)
                    overlap_months = 3
                else:
                    overlap_months = 0
            else:
                # For FY record overlapping with CY base year - full year
                overlap_months = 12
            
            # Apply proportional allocation
            if overlap_months > 0 and tco2e > 0:
                proportional_tco2e = tco2e * (overlap_months / 12)
                total_tco2e += proportional_tco2e
        
        if total_tco2e > 0 or len(monthly_records) > 0 or len(yearly_records) > 0:
            result.append({
                "scope": key[0],
                "category": key[1],
                "subcategory": key[2],
                "tco2e": round(total_tco2e, 4),
                "has_monthly_data": len(monthly_records) > 0,
                "has_yearly_data": len(yearly_records) > 0
            })
    
    # Sort results
    result.sort(key=lambda x: (x["scope"], x["category"], x["subcategory"]))
    
    has_values = len(result) > 0 and any(r["tco2e"] > 0 for r in result)
    
    return {
        "combinations": result,
        "total": len(result),
        "base_year": base_year,
        "is_financial_year": is_base_fy,
        "has_values": has_values
    }

# Phase 2: Auto-sync endpoint - updates base year emissions when GHG data changes
@api_router.post("/base-year-emissions/sync/{entity_type}/{entity_id}")
async def sync_base_year_emissions(
    entity_type: str,
    entity_id: str,
    scope_group: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Phase 2: Real-time auto-sync for base year emissions.
    Called when GHG emissions are added/updated for a period that matches the base year.
    
    This recalculates the base year emissions from the latest GHG data.
    """
    import re
    from calendar import month_name
    
    # Find existing base year record
    query = {"scope_group": scope_group}
    if entity_type == "facility":
        query["facility_id"] = entity_id
    else:
        query["organization_id"] = entity_id
        query["facility_id"] = None
    
    base_year_record = await db.base_year_emissions.find_one(query, {"_id": 0})
    if not base_year_record:
        return {"message": "No base year record found for this entity", "synced": False}
    
    base_year = base_year_record.get("base_year", "")
    if not base_year:
        return {"message": "Base year not set", "synced": False}
    
    # Use the proportional emissions endpoint logic to get updated values
    is_base_fy = base_year.startswith("FY")
    if is_base_fy:
        match = re.match(r'FY\s*(\d{4})-(\d{4})', base_year)
        if match:
            base_start_year = int(match.group(1))
            base_end_year = int(match.group(2))
        else:
            return {"message": "Invalid base year format", "synced": False}
    else:
        try:
            base_start_year = int(base_year)
            base_end_year = base_start_year
        except ValueError:
            return {"message": "Invalid base year format", "synced": False}
    
    # Build query for emissions
    if entity_type == "facility":
        em_query = {"facility_id": entity_id}
    else:
        facilities = await db.facilities.find(
            {"organization_id": entity_id, "is_active": True},
            {"_id": 0, "id": 1}
        ).to_list(1000)
        facility_ids = [f["id"] for f in facilities]
        em_query = {"facility_id": {"$in": facility_ids}}
    
    # Add scope filter
    if scope_group == "scope12":
        em_query["$or"] = [
            {"scope": {"$in": ["scope1", "scope2"]}},
            {"scope": "biogenic", "biogenic_scope_selection": {"$in": [None, "scope1"]}}
        ]
    else:
        em_query["$or"] = [
            {"scope": "scope3"},
            {"scope": "biogenic", "biogenic_scope_selection": "scope3"}
        ]
    
    # Fetch emissions
    emissions = await db.emission_records.find(
        em_query,
        {"_id": 0, "scope": 1, "category": 1, "sub_category": 1, "reporting_period": 1,
         "co2e_emissions": 1, "calculated_co2e": 1, "total_emissions": 1, "frequency": 1}
    ).to_list(10000)
    
    def parse_period(period):
        for i, m in enumerate(month_name):
            if m and m.lower() in period.lower():
                year_match = re.search(r'20\d{2}', period)
                if year_match:
                    return (i, int(year_match.group()))
        match = re.match(r'(\d{4})-(\d{1,2})', period)
        if match:
            return (int(match.group(2)), int(match.group(1)))
        return (None, None)
    
    def is_month_in_base_year(month, year):
        if is_base_fy:
            if month >= 4 and year == base_start_year:
                return True
            if month <= 3 and year == base_end_year:
                return True
            return False
        else:
            return year == base_start_year
    
    # Group and calculate
    grouped = {}
    for em in emissions:
        key = (em.get("scope", ""), em.get("category", ""), em.get("sub_category", ""))
        if key not in grouped:
            grouped[key] = []
        grouped[key].append(em)
    
    new_emissions_data = []
    for key, records in grouped.items():
        monthly_records = []
        yearly_records = []
        
        for rec in records:
            period = rec.get("reporting_period", "")
            frequency = rec.get("frequency", "monthly")
            month, year = parse_period(period)
            
            if month and year:
                relevant_years = [base_start_year, base_end_year] if is_base_fy else [base_start_year]
                if year in relevant_years:
                    if frequency == "yearly":
                        yearly_records.append({"record": rec, "year": year})
                    else:
                        if is_month_in_base_year(month, year):
                            monthly_records.append(rec)
        
        total_tco2e = 0
        
        for rec in monthly_records:
            tco2e = rec.get("total_emissions") or rec.get("co2e_emissions") or rec.get("calculated_co2e") or 0
            try:
                total_tco2e += float(tco2e) if tco2e else 0
            except (ValueError, TypeError):
                pass
        
        for item in yearly_records:
            rec = item["record"]
            year = item["year"]
            tco2e = rec.get("total_emissions") or rec.get("co2e_emissions") or rec.get("calculated_co2e") or 0
            try:
                tco2e = float(tco2e) if tco2e else 0
            except (ValueError, TypeError):
                tco2e = 0
            
            if is_base_fy:
                overlap_months = 9 if year == base_start_year else 3 if year == base_end_year else 0
            else:
                overlap_months = 12
            
            if overlap_months > 0 and tco2e > 0:
                total_tco2e += tco2e * (overlap_months / 12)
        
        if total_tco2e > 0:
            new_emissions_data.append({
                "scope": key[0],
                "category": key[1],
                "subcategory": key[2],
                "tco2e": round(total_tco2e, 4)
            })
    
    # Merge with existing manually added entries
    existing_emissions = base_year_record.get("emissions_data", [])
    manual_entries = [e for e in existing_emissions if e.get("isManuallyAdded")]
    
    # Combine: synced data + manual entries (that don't exist in synced data)
    synced_keys = {(e["scope"], e["category"], e.get("subcategory", "")) for e in new_emissions_data}
    for manual in manual_entries:
        key = (manual["scope"], manual["category"], manual.get("subcategory", ""))
        if key not in synced_keys:
            new_emissions_data.append(manual)
    
    # Update the record with new emissions data and version
    current_version = base_year_record.get("version", 1)
    version_history = base_year_record.get("version_history", [])
    version_history.append({
        "version": current_version,
        "emissions_data": existing_emissions,
        "updated_at": base_year_record.get("updated_at"),
        "updated_by": base_year_record.get("updated_by"),
        "change_type": "auto_sync"
    })
    
    from datetime import datetime, timezone
    update_data = {
        "emissions_data": new_emissions_data,
        "version": current_version + 1,
        "version_history": version_history,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current_user.get("email"),
        "last_synced_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.base_year_emissions.update_one(
        {"id": base_year_record["id"]},
        {"$set": update_data}
    )
    
    return {
        "message": "Base year emissions synced successfully",
        "synced": True,
        "new_version": current_version + 1,
        "entries_count": len(new_emissions_data)
    }


@api_router.post("/base-year-emissions", response_model=BaseYearEmissionsResponse)
async def create_base_year_emissions(
    data: BaseYearEmissionsCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create base year emissions record (admin only)"""
    # Admin permission required
    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin permission required to create base year emissions")
    
    # Validate justification is provided
    if not data.justification or not data.justification.strip():
        raise HTTPException(status_code=400, detail="Justification for selecting this base year is required")
    
    # Validate no negative values (except for Sinks which represent carbon removal)
    for entry in data.emissions_data:
        if entry.tco2e < 0 and entry.scope.lower() != 'sinks':
            raise HTTPException(status_code=400, detail="Base year emission values cannot be negative (except for Sinks)")
    
    # Check if base year record already exists for this scope_group
    query = {
        "organization_id": data.organization_id,
        "scope_group": data.scope_group
    }
    if data.facility_id:
        query["facility_id"] = data.facility_id
    else:
        query["facility_id"] = None  # Org-level
    
    existing = await db.base_year_emissions.find_one(query, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail=f"Base year emissions already exist for this entity ({data.scope_group}). Use PUT to update.")
    
    # Verify emissions data exists - with correct biogenic filtering
    if data.scope_group == "scope12":
        # Scope 1&2 includes: scope1, scope2, and biogenic NOT tagged as scope3
        scope_filter = {"$or": [
            {"scope": {"$in": ["scope1", "scope2"]}},
            {"scope": "biogenic", "biogenic_scope_selection": {"$in": [None, "scope1"]}}
        ]}
    else:
        # Scope 3 includes: scope3 and biogenic tagged as scope3
        scope_filter = {"$or": [
            {"scope": "scope3"},
            {"scope": "biogenic", "biogenic_scope_selection": "scope3"}
        ]}
    
    if data.facility_id:
        emissions_count = await db.emission_records.count_documents({
            "facility_id": data.facility_id,
            **scope_filter
        })
    else:
        # For org-level, check all facilities have emissions
        facilities = await db.facilities.find(
            {"organization_id": data.organization_id, "is_active": True}, 
            {"_id": 0, "id": 1}
        ).to_list(1000)
        if not facilities:
            raise HTTPException(status_code=400, detail="No facilities found for this organization")
        
        emissions_count = 0
        for facility in facilities:
            fac_emissions = await db.emission_records.count_documents({
                "facility_id": facility["id"],
                **scope_filter
            })
            emissions_count += fac_emissions
    
    if emissions_count == 0 and data.scope_group == "scope12":
        raise HTTPException(status_code=400, detail="Emissions data must exist before adding base year emissions")
    
    # CRITICAL: Filter emissions_data to only include valid scopes for the scope_group
    # This prevents scope3 data from being saved in a scope12 record and vice versa
    valid_scopes_lower = {
        "scope12": ["scope1", "scope2", "sinks", "biogenic (direct)", "biogenic"],
        "scope3": ["scope3", "biogenic (indirect)"]
    }.get(data.scope_group, ["scope1", "scope2", "scope3"])
    
    def is_valid_scope(scope: str) -> bool:
        scope_lower = scope.lower() if scope else ""
        return any(vs in scope_lower or scope_lower.startswith(vs) for vs in valid_scopes_lower)
    
    filtered_emissions = [e for e in data.emissions_data if is_valid_scope(e.scope)]
    
    # Determine status based on emissions data
    status = "configured" if len(filtered_emissions) > 0 else "incomplete"
    
    record = {
        "id": str(uuid.uuid4()),
        "organization_id": data.organization_id,
        "facility_id": data.facility_id,
        "scope_group": data.scope_group,
        "base_year": data.base_year,
        "base_year_type": data.base_year_type,
        "is_oldest_year": data.is_oldest_year,
        "emissions_data": [e.model_dump() for e in filtered_emissions],  # Use filtered data
        "sinks_data": data.sinks_data,
        "justification": data.justification.strip(),
        "notes": data.notes,
        "status": status,
        "version": 1,
        "version_history": [{
            "version": 1,
            "change_type": "created",
            "previous_base_year": None,
            "new_base_year": data.base_year,
            "emissions_data": [e.model_dump() for e in filtered_emissions],  # Use filtered data
            "changed_fields": ["base_year", "emissions_data", "justification"],
            "change_reason": "Initial base year setup",
            "justification": data.justification.strip(),
            "changed_by": current_user["id"],
            "changed_by_email": current_user.get("email"),
            "changed_by_name": current_user.get("name"),
            "changed_at": datetime.now(timezone.utc).isoformat()
        }],
        "created_by": current_user["id"],
        "created_by_email": current_user.get("email"),
        "created_by_name": current_user.get("name"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": None,
        "updated_by": None,
        "updated_by_email": None,
        "updated_by_name": None
    }
    
    await db.base_year_emissions.insert_one(record)
    record.pop("_id", None)
    return record


@api_router.get("/base-year-emissions", response_model=List[BaseYearEmissionsResponse])
async def get_base_year_emissions(
    current_user: dict = Depends(get_current_user),
    organization_id: Optional[str] = None,
    facility_id: Optional[str] = None,
    scope_group: Optional[str] = None  # "scope12" or "scope3"
):
    """Get base year emissions records"""
    query = {}
    
    if current_user["role"] == "super_admin":
        if organization_id:
            query["organization_id"] = organization_id
        if facility_id:
            query["facility_id"] = facility_id
    elif current_user["role"] == "admin":
        org_id = current_user.get("organization_id")
        if not org_id:
            return []
        query["organization_id"] = org_id
        if facility_id:
            query["facility_id"] = facility_id
    else:  # user
        org_id = current_user.get("organization_id")
        assigned = current_user.get("assigned_facilities", [])
        if not org_id:
            return []
        if facility_id:
            # User requesting specific facility - must be assigned
            if facility_id not in assigned:
                raise HTTPException(status_code=403, detail="Not authorized to access this facility")
            query["facility_id"] = facility_id
            query["organization_id"] = org_id
        else:
            # User can see: org-level records + their assigned facility records
            query["organization_id"] = org_id
            query["$or"] = [
                {"facility_id": None},  # Org-level base year
                {"facility_id": {"$in": assigned}} if assigned else {"facility_id": None}
            ]
    
    # Filter by scope_group if provided
    if scope_group:
        query["scope_group"] = scope_group
    
    records = await db.base_year_emissions.find(query, {"_id": 0}).to_list(1000)
    
    # Add default scope_group for legacy records
    for record in records:
        if "scope_group" not in record:
            record["scope_group"] = "scope12"
        if "status" not in record:
            record["status"] = "configured" if record.get("emissions_data") else "incomplete"
        if "justification" not in record:
            record["justification"] = record.get("notes", "")
    
    return records


@api_router.get("/base-year-emissions/{record_id}", response_model=BaseYearEmissionsResponse)
async def get_base_year_emissions_by_id(
    record_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get specific base year emissions record"""
    record = await db.base_year_emissions.find_one({"id": record_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Base year emissions record not found")
    return record


@api_router.put("/base-year-emissions/{record_id}", response_model=BaseYearEmissionsResponse)
async def update_base_year_emissions(
    record_id: str,
    data: BaseYearEmissionsUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update base year emissions record with detailed version history (admin only)"""
    # Admin permission required
    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin permission required to update base year emissions")
    
    record = await db.base_year_emissions.find_one({"id": record_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Base year emissions record not found")
    
    # Validate no negative values (except for Sinks)
    if data.emissions_data is not None:
        for entry in data.emissions_data:
            if entry.tco2e < 0 and entry.scope != "Sinks":
                raise HTTPException(status_code=400, detail="Base year emission values cannot be negative (except for Sinks)")
    
    # Track which fields are being changed
    changed_fields = []
    
    # Calculate emissions changes for version history
    old_emissions = {
        f"{e['scope']}|{e['category']}|{e.get('subcategory', '')}": e.get('tco2e', 0)
        for e in record.get("emissions_data", [])
    }
    old_categories = set(old_emissions.keys())
    
    # CRITICAL: Filter emissions_data to only include valid scopes for the scope_group
    scope_group = record.get("scope_group", "scope12")
    valid_scopes_lower = {
        "scope12": ["scope1", "scope2", "sinks", "biogenic (direct)", "biogenic"],
        "scope3": ["scope3", "biogenic (indirect)"]
    }.get(scope_group, ["scope1", "scope2", "scope3"])
    
    def is_valid_scope(scope: str) -> bool:
        scope_lower = scope.lower() if scope else ""
        return any(vs in scope_lower or scope_lower.startswith(vs) for vs in valid_scopes_lower)
    
    if data.emissions_data is not None:
        filtered_emissions = [e for e in data.emissions_data if is_valid_scope(e.scope)]
        new_emissions_data = [e.model_dump() for e in filtered_emissions]
    else:
        new_emissions_data = record.get("emissions_data", [])
    new_emissions = {
        f"{e['scope']}|{e['category']}|{e.get('subcategory', '')}": e.get('tco2e', 0)
        for e in new_emissions_data
    }
    new_categories = set(new_emissions.keys())
    
    # Build detailed change log
    added_categories = []
    deleted_categories = []
    changed_values = []
    
    # Find added categories
    for key in new_categories - old_categories:
        parts = key.split('|')
        added_categories.append({
            "scope": parts[0],
            "category": parts[1],
            "subcategory": parts[2] if len(parts) > 2 else "",
            "tco2e": new_emissions[key]
        })
    
    # Find deleted categories
    for key in old_categories - new_categories:
        parts = key.split('|')
        deleted_categories.append({
            "scope": parts[0],
            "category": parts[1],
            "subcategory": parts[2] if len(parts) > 2 else "",
            "tco2e": old_emissions[key]
        })
    
    # Find changed values (categories that exist in both but have different values)
    for key in old_categories & new_categories:
        old_val = old_emissions[key]
        new_val = new_emissions[key]
        if old_val != new_val:
            parts = key.split('|')
            changed_values.append({
                "scope": parts[0],
                "category": parts[1],
                "subcategory": parts[2] if len(parts) > 2 else "",
                "previous_value": old_val,
                "new_value": new_val
            })
    
    if added_categories or deleted_categories or changed_values:
        changed_fields.append("emissions_data")
    
    # Track other field changes
    if data.justification and data.justification != record.get("justification"):
        changed_fields.append("justification")
    if data.notes and data.notes != record.get("notes"):
        changed_fields.append("notes")
    if data.sinks_data and data.sinks_data != record.get("sinks_data"):
        changed_fields.append("sinks_data")
    
    # Determine change type
    change_type = "updated"
    if data.base_year and data.base_year != record.get("base_year"):
        change_type = "base_year_changed"
        changed_fields.append("base_year")
    
    # Build change summary
    change_summary = []
    if data.base_year and data.base_year != record.get("base_year"):
        change_summary.append(f"Base year changed from {record.get('base_year')} to {data.base_year}")
    if added_categories:
        change_summary.append(f"Added {len(added_categories)} category(s)")
    if deleted_categories:
        change_summary.append(f"Deleted {len(deleted_categories)} category(s)")
    if changed_values:
        change_summary.append(f"Modified {len(changed_values)} value(s)")
    if "justification" in changed_fields:
        change_summary.append("Updated justification")
    if "notes" in changed_fields:
        change_summary.append("Updated notes")
    
    # Save current state to version history with detailed changes
    version_entry = {
        "version": record["version"],
        "change_type": change_type,
        "change_summary": "; ".join(change_summary) if change_summary else "No changes",
        "previous_base_year": record.get("base_year"),
        "new_base_year": data.base_year if data.base_year else record.get("base_year"),
        "previous_emissions_data": record["emissions_data"],
        "changed_fields": changed_fields,
        "added_categories": added_categories,
        "deleted_categories": deleted_categories,
        "changed_values": changed_values,
        "justification": record.get("justification"),
        "notes": record.get("notes"),
        "changed_by": current_user["id"],
        "changed_by_email": current_user.get("email"),
        "changed_by_name": current_user.get("full_name") or current_user.get("name"),
        "changed_at": datetime.now(timezone.utc).isoformat()
    }
    
    update_data = {}
    if data.base_year is not None:
        update_data["base_year"] = data.base_year
    if data.base_year_type is not None:
        update_data["base_year_type"] = data.base_year_type
    if data.is_oldest_year is not None:
        update_data["is_oldest_year"] = data.is_oldest_year
    if data.emissions_data is not None:
        update_data["emissions_data"] = new_emissions_data
    if data.justification is not None:
        update_data["justification"] = data.justification
    if data.notes is not None:
        update_data["notes"] = data.notes
    if data.sinks_data is not None:
        update_data["sinks_data"] = data.sinks_data
    
    # Update status based on emissions data
    final_emissions = update_data.get("emissions_data", record.get("emissions_data", []))
    update_data["status"] = "configured" if len(final_emissions) > 0 else "incomplete"
    
    update_data["version"] = record["version"] + 1
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = current_user["id"]
    update_data["updated_by_email"] = current_user.get("email")
    update_data["updated_by_name"] = current_user.get("name")
    
    # Add to version history
    version_history = record.get("version_history", [])
    version_history.append(version_entry)
    update_data["version_history"] = version_history
    
    await db.base_year_emissions.update_one(
        {"id": record_id},
        {"$set": update_data}
    )
    
    updated = await db.base_year_emissions.find_one({"id": record_id}, {"_id": 0})
    
    # Add default values for response
    if "scope_group" not in updated:
        updated["scope_group"] = "scope12"
    
    return updated


@api_router.delete("/base-year-emissions/{record_id}")
async def delete_base_year_emissions(
    record_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete base year emissions record and store deletion in history (admin only)"""
    # Admin permission required
    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin permission required to delete base year emissions")
    
    # Get the record first to store in deletion history
    record = await db.base_year_emissions.find_one({"id": record_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Base year emissions record not found")
    
    # Get existing version history before we modify anything
    version_history = list(record.get("version_history", []))
    
    # Create a copy of record without version_history to avoid circular reference
    record_snapshot = {k: v for k, v in record.items() if k != "version_history"}
    
    # Add deletion entry to version history
    deletion_history_entry = {
        "version": record.get("version", 1) + 1,
        "action": "deleted",
        "changes": {
            "old_values": record_snapshot,
            "new_values": None
        },
        "field_changes": [{
            "field": "record_status",
            "old_value": "active",
            "new_value": "deleted",
            "field_type": "simple"
        }],
        "modified_by": current_user["id"],
        "modified_by_name": current_user.get("full_name", "Unknown"),
        "modified_by_email": current_user.get("email", ""),
        "modified_at": datetime.now(timezone.utc).isoformat()
    }
    version_history.append(deletion_history_entry)
    
    # Store deletion record in a separate collection for audit trail
    deletion_record = {
        "id": str(uuid.uuid4()),
        "deleted_record_id": record_id,
        "organization_id": record.get("organization_id"),
        "facility_id": record.get("facility_id"),
        "base_year": record.get("base_year"),
        "base_year_type": record.get("base_year_type"),
        "emissions_data": record.get("emissions_data", []),
        "version_at_deletion": record.get("version", 1),
        "version_history": version_history,  # Include final version history with deletion entry
        "deleted_by": current_user["id"],
        "deleted_by_name": current_user.get("full_name", "Unknown"),
        "deleted_at": datetime.now(timezone.utc).isoformat(),
        "deletion_reason": "User initiated deletion"
    }
    
    await db.base_year_emissions_deletions.insert_one(deletion_record)
    
    # Now delete the actual record
    await db.base_year_emissions.delete_one({"id": record_id})
    
    return {"message": "Base year emissions record deleted successfully", "deletion_id": deletion_record["id"]}


# Endpoint to get deletion history for an entity
@api_router.get("/base-year-emissions/deletion-history/{entity_type}/{entity_id}")
async def get_deletion_history(
    entity_type: str,
    entity_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get deletion history for an entity (organization or facility)"""
    if entity_type == "facility":
        query = {"facility_id": entity_id}
    else:
        query = {"organization_id": entity_id, "facility_id": None}
    
    deletions = await db.base_year_emissions_deletions.find(
        query, {"_id": 0}
    ).sort("deleted_at", -1).to_list(100)
    
    return deletions


# Endpoint to change base year without losing data
@api_router.patch("/base-year-emissions/{record_id}/change-year")
async def change_base_year(
    record_id: str,
    new_base_year: str = Query(..., description="New base year (e.g., '2024' or 'FY 2024-2025')"),
    change_reason: str = Query(..., min_length=20, description="Reason for changing the base year (minimum 20 characters)"),
    current_user: dict = Depends(get_current_user)
):
    """Change the base year for an existing record and update emissions data (admin only)"""
    # Admin permission required
    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin permission required to change base year")
    
    from calendar import month_name
    import re
    
    record = await db.base_year_emissions.find_one({"id": record_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Base year emissions record not found")
    
    old_base_year = record.get("base_year")
    entity_type = "facility" if record.get("facility_id") else "organization"
    entity_id = record.get("facility_id") or record.get("organization_id")
    
    # Fetch emissions data for the new year
    org_id = record.get("organization_id")
    
    # Determine year type (financial vs calendar)
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0, "reporting_year_type": 1})
    year_type = org.get("reporting_year_type", "calendar_year") if org else "calendar_year"
    is_financial = year_type == "financial_year"
    
    # Parse year for querying
    if new_base_year.startswith("FY "):
        # Extract start year from FY format (e.g., "FY 2023-2024" -> 2023)
        year_value = int(new_base_year.replace("FY ", "").split("-")[0])
    else:
        year_value = int(new_base_year)
    
    # Get oldest year to check if new year is oldest
    oldest_year_response = await get_oldest_reporting_year(entity_type, entity_id, current_user)
    is_oldest = new_base_year == oldest_year_response.get("oldest_year_formatted")
    
    # Build query for emissions
    query = {}
    if entity_type == "facility":
        query["facility_id"] = entity_id
    else:
        # For organization, we need to get all facilities
        org_facilities = await db.facilities.find({"organization_id": org_id}, {"_id": 0, "id": 1}).to_list(100)
        facility_ids = [f["id"] for f in org_facilities]
        query["facility_id"] = {"$in": facility_ids}
    
    # Fetch all emissions for the entity
    all_emissions = await db.emission_records.find(query, {"_id": 0}).to_list(10000)
    
    # Helper function to parse reporting period and check if it's in the target year
    def parse_period(period):
        """Parse reporting period and return (month_num, year, is_yearly, period_type)"""
        if not period:
            return (None, None, False, None)
        
        # Try FY format: "FY 2024-2025"
        fy_match = re.match(r'FY\s*(\d{4})-(\d{2,4})', period, re.IGNORECASE)
        if fy_match:
            return (None, int(fy_match.group(1)), True, 'fy')
        
        # Try CY format: "CY 2025" or "CY2025"
        cy_match = re.match(r'CY\s*(\d{4})', period, re.IGNORECASE)
        if cy_match:
            return (None, int(cy_match.group(1)), True, 'cy')
        
        # Try format: "January 2024"
        for i, m in enumerate(month_name):
            if m and m.lower() in period.lower():
                year_match = re.search(r'20\d{2}', period)
                if year_match:
                    return (i, int(year_match.group()), False, 'monthly')
        
        # Try format: "2024-01"
        match = re.match(r'(\d{4})-(\d{1,2})', period)
        if match:
            return (int(match.group(2)), int(match.group(1)), False, 'monthly')
        
        return (None, None, False, None)
    
    def get_cy_fy_overlap(cy_year, fy_start_year):
        """Calculate overlap between CY and FY"""
        if cy_year == fy_start_year:
            return (True, 9, 9/12)  # CY overlaps Apr-Dec = 9 months
        elif cy_year == fy_start_year + 1:
            return (True, 3, 3/12)  # CY overlaps Jan-Mar = 3 months
        return (False, 0, 0)
    
    def is_in_year_range_with_proportion(period, target_year, is_fy):
        """Check if period overlaps and return (matches, proportion)"""
        month, year, is_yearly, period_type = parse_period(period)
        if year is None:
            return (False, 0)
        
        if is_yearly:
            if is_fy:
                if period_type == 'fy':
                    return (year == target_year, 1.0)
                elif period_type == 'cy':
                    overlaps, _, proportion = get_cy_fy_overlap(year, target_year)
                    return (overlaps, proportion)
            else:
                return (year == target_year, 1.0)
        
        if month is None:
            return (False, 0)
        
        if is_fy:
            if month >= 4 and year == target_year:
                return (True, 1.0)
            if month <= 3 and year == target_year + 1:
                return (True, 1.0)
            return (False, 0)
        else:
            return (year == target_year, 1.0)
    
    # Aggregate emissions with proportional allocation
    new_emissions_data = []
    combinations = {}
    for em in all_emissions:
        period = em.get("reporting_period", "")
        matches, proportion = is_in_year_range_with_proportion(period, year_value, is_financial)
        
        if matches and proportion > 0:
            key = f"{em.get('scope', '')}|{em.get('category', '')}|{em.get('sub_category', '')}"
            if key not in combinations:
                combinations[key] = {
                    "scope": em.get("scope", ""),
                    "category": em.get("category", ""),
                    "subcategory": em.get("sub_category", ""),
                    "tco2e": 0
                }
            tco2e = (em.get("total_emissions", 0) or 0) * proportion
            combinations[key]["tco2e"] += tco2e
    
    if combinations:
        new_emissions_data = [{"scope": v["scope"], "category": v["category"], "subcategory": v["subcategory"], "tco2e": round(v["tco2e"], 4)} for v in combinations.values()]
    else:
        # No emissions for this year - fetch all unique categories with 0 values
        all_combinations = {}
        for em in all_emissions:
            key = f"{em.get('scope', '')}|{em.get('category', '')}|{em.get('sub_category', '')}"
            if key not in all_combinations:
                all_combinations[key] = {
                    "scope": em.get("scope", ""),
                    "category": em.get("category", ""),
                    "subcategory": em.get("sub_category", ""),
                    "tco2e": 0
                }
        new_emissions_data = list(all_combinations.values())
    
    # Calculate what's changing in emissions
    old_emissions = {f"{e['scope']}|{e['category']}|{e.get('subcategory', '')}": e.get('tco2e', 0) for e in record.get("emissions_data", [])}
    new_emissions = {f"{e['scope']}|{e['category']}|{e.get('subcategory', '')}": e.get('tco2e', 0) for e in new_emissions_data}
    
    added_categories = [{"scope": k.split('|')[0], "category": k.split('|')[1], "subcategory": k.split('|')[2] if len(k.split('|')) > 2 else "", "tco2e": new_emissions[k]} for k in (set(new_emissions.keys()) - set(old_emissions.keys()))]
    deleted_categories = [{"scope": k.split('|')[0], "category": k.split('|')[1], "subcategory": k.split('|')[2] if len(k.split('|')) > 2 else "", "tco2e": old_emissions[k]} for k in (set(old_emissions.keys()) - set(new_emissions.keys()))]
    
    # Build change summary
    change_summary = [f"Base year changed from {old_base_year} to {new_base_year}"]
    if added_categories:
        change_summary.append(f"Added {len(added_categories)} category(s)")
    if deleted_categories:
        change_summary.append(f"Removed {len(deleted_categories)} category(s)")
    
    # Record the change in version history with detailed tracking
    version_entry = {
        "version": record["version"],
        "change_type": "base_year_changed",
        "change_summary": "; ".join(change_summary),
        "previous_base_year": old_base_year,
        "new_base_year": new_base_year,
        "previous_emissions_data": record["emissions_data"],
        "added_categories": added_categories,
        "deleted_categories": deleted_categories,
        "changed_by": current_user["id"],
        "changed_by_email": current_user.get("email"),
        "changed_by_name": current_user.get("full_name") or current_user.get("name") or "Unknown",
        "changed_at": datetime.now(timezone.utc).isoformat(),
        "change_reason": change_reason
    }
    
    version_history = record.get("version_history", [])
    version_history.append(version_entry)
    
    update_data = {
        "base_year": new_base_year,
        "is_oldest_year": is_oldest,
        "emissions_data": new_emissions_data,
        "version": record["version"] + 1,
        "version_history": version_history,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current_user["id"]
    }
    
    await db.base_year_emissions.update_one(
        {"id": record_id},
        {"$set": update_data}
    )
    
    updated_record = await db.base_year_emissions.find_one({"id": record_id}, {"_id": 0})
    return updated_record


@api_router.get("/base-year-emissions/check/{entity_type}/{entity_id}")
async def check_base_year_exists(
    entity_type: str,
    entity_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Check if base year emissions exist for an entity"""
    if entity_type == "facility":
        query = {"facility_id": entity_id}
    else:
        query = {"organization_id": entity_id, "facility_id": None}
    
    record = await db.base_year_emissions.find_one(query, {"_id": 0, "id": 1, "base_year": 1})
    
    return {
        "exists": record is not None,
        "record_id": record.get("id") if record else None,
        "base_year": record.get("base_year") if record else None
    }


@api_router.get("/base-year-emissions/validate-for-report")
async def validate_base_year_for_report(
    current_user: dict = Depends(get_current_user),
    facility_ids: List[str] = Query(default=[]),
    include_org_level: bool = False
):
    """Validate that base year data exists for report generation.
    
    If all facilities within an organization are selected, organization-level 
    base year emissions data suffices - separate facility-level data is not required.
    """
    org_id = current_user.get("organization_id")
    
    missing = []
    
    # Check if all facilities are selected (org-level can suffice)
    all_org_facilities = []
    if org_id:
        all_org_facilities = await db.facilities.find(
            {"organization_id": org_id, "is_active": True},
            {"_id": 0, "id": 1}
        ).to_list(1000)
    
    all_facility_ids = {f["id"] for f in all_org_facilities}
    selected_facility_ids = set(facility_ids)
    
    # Check if all facilities are selected
    all_facilities_selected = all_facility_ids and selected_facility_ids == all_facility_ids
    
    if all_facilities_selected:
        # If all facilities selected, check if org-level base year exists
        org_record = await db.base_year_emissions.find_one(
            {"organization_id": org_id, "facility_id": None}, 
            {"_id": 0}
        )
        if org_record:
            # Org-level data exists, no facility-level data required
            return {
                "valid": True,
                "missing": [],
                "message": "Organization-level base year data found (covers all facilities)",
                "org_level_used": True
            }
    
    # Check facility-level base year data
    for fac_id in facility_ids:
        record = await db.base_year_emissions.find_one({"facility_id": fac_id}, {"_id": 0})
        if not record:
            facility = await db.facilities.find_one({"id": fac_id}, {"_id": 0, "name": 1})
            missing.append({
                "type": "facility",
                "id": fac_id,
                "name": facility.get("name", "Unknown") if facility else "Unknown"
            })
    
    # Check org-level if required
    if include_org_level and org_id:
        org_record = await db.base_year_emissions.find_one(
            {"organization_id": org_id, "facility_id": None}, 
            {"_id": 0}
        )
        if not org_record:
            org = await db.organizations.find_one({"id": org_id}, {"_id": 0, "name": 1})
            missing.append({
                "type": "organization",
                "id": org_id,
                "name": org.get("name", "Unknown") if org else "Unknown"
            })
    
    return {
        "valid": len(missing) == 0,
        "missing": missing,
        "message": "Base year emissions data is required before generating the report." if missing else "All base year data present",
        "org_level_used": False
    }


# Phase B7: Dashboard endpoints (/dashboard/stats, /dashboard/supplier-hotspots)
# moved to modules/dashboards/router.py.
# Phase B8: Reports endpoints (/reports/facility/{id}, /reports/combined,
# /reports/ghg-inventory, /reports/download/{token}, /reports/ai-summary)
# moved to modules/reports/router.py.

# File upload endpoint for evidence documents
from r2_storage import get_r2_storage, R2Storage

@api_router.post("/upload/evidence")
async def upload_evidence_file(
    file: UploadFile = File(...),
    bucket_type: str = Query(default="emission_evidence", description="Bucket type: emission_evidence, sinks_evidence, org_facility, superadmin, esg_records_evidence"),
    organization_id: Optional[str] = Query(default=None, description="Organization ID for file path (used by super admin)"),
    folder: Optional[str] = Query(default=None, description="Folder path prefix (e.g., environment, social, governance)"),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload evidence files to Cloudflare R2 storage.
    
    bucket_type options:
    - emission_evidence: For emission record evidence files
    - sinks_evidence: For carbon sinks evidence files  
    - org_facility: For organization/facility attachments (including logos)
    - superadmin: For superadmin uploads (invoice history, etc.)
    """
    # Validate bucket type
    valid_bucket_types = ['emission_evidence', 'sinks_evidence', 'org_facility', 'superadmin', 'esg_records_evidence']
    if bucket_type not in valid_bucket_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid bucket_type. Valid options: {', '.join(valid_bucket_types)}"
        )
    
    # Restrict superadmin bucket to super_admin users
    if bucket_type == 'superadmin' and current_user.get('role') != 'super_admin':
        raise HTTPException(status_code=403, detail="Only super admin can upload to superadmin bucket")
    
    # Validate file type
    allowed_types = [
        'application/pdf',
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  # xlsx
        'application/vnd.ms-excel',  # xls
        'text/csv',
        'application/msword',  # doc
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'  # docx
    ]
    
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400, 
            detail="File type not allowed. Supported types: PDF, Images (JPG, PNG, GIF, WebP), Excel (XLS, XLSX), CSV, Word (DOC, DOCX)"
        )
    
    # Validate file size (max 5MB)
    max_size = 5 * 1024 * 1024  # 5MB
    file_content = await file.read()
    if len(file_content) > max_size:
        raise HTTPException(status_code=400, detail="File size too large. Maximum size is 5MB")
    
    try:
        # Get organization name for path prefix
        org_name = None
        # Use provided organization_id (for super admin) or fall back to user's org
        org_id = organization_id or current_user.get("organization_id")
        if org_id:
            org = await db.organizations.find_one({"id": org_id}, {"_id": 0, "name": 1})
            if org:
                org_name = org.get("name")
        
        logger.info(f"[EVIDENCE_UPLOAD] Starting upload: file={file.filename}, bucket={bucket_type}, org={org_name}, user={current_user.get('email')}")
        
        # Upload to R2
        r2 = get_r2_storage()
        result = await r2.upload_file(
            file_content=file_content,
            filename=file.filename,
            bucket_type=bucket_type,
            content_type=file.content_type,
            folder=folder,
            metadata={
                'uploaded_by': current_user["id"],
                'original_filename': file.filename
            },
            org_name=org_name
        )
        
        logger.info(f"[EVIDENCE_UPLOAD] R2 upload success: key={result.get('key')}, size={len(file_content)}")
        
        # Store file metadata in database
        file_record = {
            "id": str(uuid.uuid4()),
            "original_filename": file.filename,
            "stored_filename": result['key'],
            "bucket_name": result['bucket'],
            "bucket_type": bucket_type,
            "r2_key": result['key'],
            "file_size": len(file_content),
            "content_type": file.content_type,
            "uploaded_by": current_user["id"],
            "uploaded_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.uploaded_files.insert_one(file_record)
        
        return {
            "file_id": file_record["id"],
            "filename": file.filename,
            "size": len(file_content),
            "bucket_type": bucket_type,
            "url": f"/api/files/{file_record['id']}"
        }
        
    except Exception as e:
        logging.error(f"R2 upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")

# File download endpoint - returns presigned URL for R2 files
@api_router.get("/files/{file_id}")
async def download_file(
    file_id: str,
    current_user: dict = Depends(get_current_user)
):
    file_record = await db.uploaded_files.find_one({"id": file_id}, {"_id": 0})
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    # R2 file - generate presigned URL
    if not file_record.get("bucket_type") or not file_record.get("r2_key"):
        raise HTTPException(status_code=404, detail="File not found in storage")
    
    try:
        r2 = get_r2_storage()
        
        # Generate presigned URL with content disposition for download
        original_filename = file_record.get('original_filename', 'download')
        safe_filename = ''.join(c if c.isascii() and c.isprintable() else '_' for c in original_filename)
        
        presigned_url = r2.generate_presigned_url(
            bucket_type=file_record["bucket_type"],
            key=file_record["r2_key"],
            expiration=3600,  # 1 hour
            response_content_disposition=f"attachment; filename={safe_filename}"
        )
        
        # Redirect to presigned URL
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=presigned_url, status_code=307)
        
    except Exception as e:
        logging.error(f"R2 download error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate download URL: {str(e)}")

# Public file view endpoint (for logos, images and PDFs - no authentication required)
@api_router.get("/files/{file_id}/view")
async def view_file_public(file_id: str):
    """Public endpoint to view files (used for logo previews in img tags and PDF viewing)"""
    file_record = await db.uploaded_files.find_one({"id": file_id}, {"_id": 0})
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Allow image files and PDFs to be viewed publicly
    content_type = file_record.get("content_type", "")
    allowed_view_types = ["image/", "application/pdf"]
    is_allowed = any(content_type.startswith(t) if t.endswith("/") else content_type == t for t in allowed_view_types)
    
    if not is_allowed:
        raise HTTPException(status_code=403, detail="Only image and PDF files can be viewed publicly")
    
    # R2 file - generate presigned URL for inline viewing
    if not file_record.get("bucket_type") or not file_record.get("r2_key"):
        raise HTTPException(status_code=404, detail="File not found in storage")
    
    try:
        r2 = get_r2_storage()
        
        # For PDFs, set inline disposition
        disposition = None
        if content_type == "application/pdf":
            original_filename = file_record.get('original_filename', 'document.pdf')
            safe_filename = ''.join(c if c.isascii() and c.isprintable() else '_' for c in original_filename)
            disposition = f"inline; filename={safe_filename}"
        
        presigned_url = r2.generate_presigned_url(
            bucket_type=file_record["bucket_type"],
            key=file_record["r2_key"],
            expiration=3600,
            response_content_disposition=disposition
        )
        
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=presigned_url, status_code=307)
        
    except Exception as e:
        logging.error(f"R2 view error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate view URL: {str(e)}")

# Download endpoint - forces file download for any file type
@api_router.get("/files/{file_id}/download")
async def download_file_public(file_id: str):
    """Public endpoint to download any file as attachment - redirects to R2 presigned URL"""
    file_record = await db.uploaded_files.find_one({"id": file_id}, {"_id": 0})
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    if not file_record.get("bucket_type") or not file_record.get("r2_key"):
        raise HTTPException(status_code=404, detail="File not found in storage")
    
    original_filename = file_record.get('original_filename', 'file')
    # Make filename safe for Content-Disposition header
    import urllib.parse
    safe_filename = urllib.parse.quote(original_filename, safe='')
    
    # R2 file - generate presigned URL for download
    try:
        r2 = get_r2_storage()
        
        presigned_url = r2.generate_presigned_url(
            bucket_type=file_record["bucket_type"],
            key=file_record["r2_key"],
            expiration=3600,
            response_content_disposition=f"attachment; filename*=UTF-8''{safe_filename}"
        )
        
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=presigned_url, status_code=302)
        
    except Exception as e:
        logging.error(f"R2 download error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate download URL: {str(e)}")

# List uploaded files
@api_router.get("/files")
async def list_files(current_user: dict = Depends(get_current_user)):
    query = {}
    if current_user["role"] == "user":
        query["uploaded_by"] = current_user["id"]
    elif current_user["role"] == "admin":
        # Get all users in the same organization
        org_id = current_user.get("organization_id")
        if not org_id:
            return []  # Admin without organization has no files to see
        org_users = await db.users_esg.find(
            {"organization_id": org_id},
            {"_id": 0, "id": 1}
        ).to_list(1000)
        user_ids = [u["id"] for u in org_users]
        query["uploaded_by"] = {"$in": user_ids}
    # Super admin can see all files (no query filter)
    
    files = await db.uploaded_files.find(query, {"_id": 0}).to_list(1000)
    
    # Add uploader info
    for file_record in files:
        uploader = await db.users_esg.find_one(
            {"id": file_record["uploaded_by"]}, 
            {"_id": 0, "full_name": 1, "email": 1}
        )
        file_record["uploader"] = uploader
    
    return files

# Delete file
@api_router.delete("/files/{file_id}")
async def delete_file(
    file_id: str,
    current_user: dict = Depends(get_current_user)
):
    file_record = await db.uploaded_files.find_one({"id": file_id}, {"_id": 0})
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Check permissions
    if current_user["role"] == "user" and file_record["uploaded_by"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized to delete this file")
    elif current_user["role"] == "admin":
        # Check if file was uploaded by someone in the same organization
        uploader = await db.users_esg.find_one({"id": file_record["uploaded_by"]}, {"_id": 0})
        if uploader and uploader.get("organization_id") != current_user.get("organization_id"):
            raise HTTPException(status_code=403, detail="Not authorized to delete this file")
    
    # Delete file from R2 storage
    if file_record.get("bucket_type") and file_record.get("r2_key"):
        try:
            r2 = get_r2_storage()
            await r2.delete_file(
                bucket_type=file_record["bucket_type"],
                key=file_record["r2_key"]
            )
        except Exception as e:
            logging.error(f"R2 delete error: {e}")
            # Continue to delete database record even if R2 delete fails
    
    # Delete record from database
    await db.uploaded_files.delete_one({"id": file_id})
    
    return {"message": "File deleted successfully"}

# Get file info - returns metadata without requiring download
@api_router.get("/files/{file_id}/info")
async def get_file_info(file_id: str):
    """Public endpoint to get file metadata (filename, size, type)"""
    file_record = await db.uploaded_files.find_one({"id": file_id}, {"_id": 0})
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    return {
        "id": file_record.get("id"),
        "filename": file_record.get("original_filename", "Unknown"),
        "content_type": file_record.get("content_type", "application/octet-stream"),
        "size": file_record.get("size", 0),
        "uploaded_at": file_record.get("uploaded_at"),
        "bucket_type": file_record.get("bucket_type")
    }

# Admin user management endpoints
# Phase B2: 4 admin user-management routes (POST/GET /admin/users,
# PUT /admin/users/{id}/assign-facilities, DELETE /admin/users/{id}) moved
# to modules/users/router.py — included on api_router at the top of this file.


# Health check
@api_router.get("/health")
async def health_check():
    """Health check endpoint with MongoDB connectivity verification."""
    health_status = {
        "status": "healthy",
        "services": {
            "api": "healthy",
            "mongodb": "unknown"
        }
    }
    
    try:
        # Check MongoDB connectivity with ping command
        await db.command("ping")
        health_status["services"]["mongodb"] = "healthy"
    except Exception as e:
        health_status["status"] = "unhealthy"
        health_status["services"]["mongodb"] = "unhealthy"
        health_status["mongodb_error"] = str(e)
    
    return health_status

# ----- Audit Trail Endpoints (Admin only) -----

class AuditLogQuery(BaseModel):
    """Query parameters for audit logs"""
    module: Optional[str] = None
    action: Optional[str] = None
    user_id: Optional[str] = None
    resource_id: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: Optional[str] = None
    search: Optional[str] = None
    skip: int = 0
    limit: int = 50
    sort_by: str = "timestamp"
    sort_order: str = "desc"

@api_router.get("/audit-logs")
async def get_audit_logs(
    module: Optional[str] = None,
    action: Optional[str] = None,
    user_id: Optional[str] = None,
    resource_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    sort_by: str = "timestamp",
    sort_order: str = "desc",
    current_user: dict = Depends(get_current_user)
):
    """
    Get audit logs with filtering and pagination.
    Only accessible by admin and super_admin.
    """
    # Check if user is admin or super_admin
    if current_user["role"] not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Only admin users can access audit logs")
    
    # Get organization_id for non-super-admins
    organization_id = None if current_user["role"] == "super_admin" else current_user.get("organization_id")
    
    result = await audit_logger.get_logs(
        organization_id=organization_id,
        user_id=user_id,
        module=module,
        action=action,
        resource_id=resource_id,
        start_date=start_date,
        end_date=end_date,
        status=status,
        search=search,
        skip=skip,
        limit=limit,
        sort_by=sort_by,
        sort_order=sort_order
    )
    
    return result

@api_router.get("/audit-logs/summary")
async def get_audit_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get audit activity summary statistics.
    Only accessible by admin and super_admin.
    """
    if current_user["role"] not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Only admin users can access audit logs")
    
    organization_id = None if current_user["role"] == "super_admin" else current_user.get("organization_id")
    
    return await audit_logger.get_activity_summary(
        organization_id=organization_id,
        start_date=start_date,
        end_date=end_date
    )

@api_router.get("/audit-logs/{log_id}")
async def get_audit_log_detail(
    log_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get a single audit log entry by ID.
    Only accessible by admin and super_admin.
    """
    if current_user["role"] not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Only admin users can access audit logs")
    
    log = await audit_logger.get_log_by_id(log_id)
    
    if not log:
        raise HTTPException(status_code=404, detail="Audit log not found")
    
    # For non-super-admins, verify the log belongs to their organization
    if current_user["role"] != "super_admin":
        if log.get("organization_id") != current_user.get("organization_id"):
            raise HTTPException(status_code=403, detail="Access denied")
    
    return log

@api_router.get("/audit-logs/filters/options")
async def get_audit_filter_options(
    current_user: dict = Depends(get_current_user)
):
    """
    Get available filter options for audit logs (modules, actions, users).
    Only accessible by admin and super_admin.
    """
    if current_user["role"] not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Only admin users can access audit logs")
    
    # Get list of modules (excluding authentication since logins not tracked)
    modules = [
        {"value": "organization", "label": "Organization"},
        {"value": "facility", "label": "Facility"},
        {"value": "user", "label": "User Management"},
        {"value": "ghg_emission", "label": "GHG Emissions"},
        {"value": "ghg_sink", "label": "GHG Sinks"},
        {"value": "fuel_database", "label": "Fuel Database"},
        {"value": "emission_factor", "label": "Emission Factors"},
        {"value": "formula", "label": "Formulas"},
        {"value": "scope_category", "label": "Scopes & Categories"},
        {"value": "sector", "label": "Sectors"},
        {"value": "unit", "label": "Units"},
        {"value": "gwp_config", "label": "GWP Configuration"},
        {"value": "report", "label": "Reports"},
        {"value": "calculation_engine", "label": "Calculation Engine"},
        {"value": "file", "label": "File Operations"},
        {"value": "subscription", "label": "Subscription"},
        {"value": "settings", "label": "Settings"}
    ]
    
    # Get list of actions (excluding login/logout)
    actions = [
        {"value": "create", "label": "Create"},
        {"value": "update", "label": "Update"},
        {"value": "delete", "label": "Delete"},
        {"value": "view", "label": "View"},
        {"value": "calculate", "label": "Calculate"},
        {"value": "recalculate", "label": "Recalculate"},
        {"value": "import", "label": "Import"},
        {"value": "export", "label": "Export"},
        {"value": "upload", "label": "Upload"},
        {"value": "download", "label": "Download"},
        {"value": "activate", "label": "Activate"},
        {"value": "deactivate", "label": "Deactivate"},
        {"value": "approve", "label": "Approve"},
        {"value": "reject", "label": "Reject"},
        {"value": "assign", "label": "Assign"},
        {"value": "unassign", "label": "Unassign"},
        {"value": "configure", "label": "Configure"}
    ]
    
    # Get users in organization (for filtering)
    users = []
    query = {}
    if current_user["role"] != "super_admin":
        query["organization_id"] = current_user.get("organization_id")
    
    user_list = await db.users_esg.find(query, {"_id": 0, "id": 1, "email": 1, "full_name": 1}).to_list(1000)
    users = [{"value": u["id"], "label": u.get("full_name") or u["email"]} for u in user_list]
    
    return {
        "modules": modules,
        "actions": actions,
        "users": users
    }

# ----- Dynamic Scopes & Categories (SuperAdmin-managed) -----
from scopes_module import build_scopes_router, seed_scopes_and_categories
api_router.include_router(build_scopes_router(db, get_current_user, get_super_admin_user))

# ----- Calc Engine (Phase 1: foundations) -----
from calc_engine import build_calc_engine_router, seed_calc_engine
api_router.include_router(build_calc_engine_router(db, get_current_user, get_super_admin_user))

# ----- Scope 3 Bulk Upload Module (Enterprise) -----
from fastapi import APIRouter
from bulk_upload_scope3.template_generator import generate_scope3_template
from bulk_upload_scope3.processors import UploadProcessor
from bulk_upload_scope3.report_generator import ReportGenerator
from bulk_upload_scope3.models import ValidationError, ErrorSeverity, UploadSummary, UploadStatus

scope3_bulk_router = APIRouter(prefix="/bulk-upload/scope3", tags=["Bulk Upload - Scope 3"])

@scope3_bulk_router.get("/template/download")
async def download_scope3_template(current_user: dict = Depends(get_current_user)):
    """Download Scope 3 bulk upload template"""
    organization_id = current_user.get("organization_id")
    if not organization_id:
        raise HTTPException(status_code=400, detail="User must belong to an organization")
    
    template_bytes = await generate_scope3_template(db, organization_id)
    
    return StreamingResponse(
        template_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=scope3_bulk_upload_template.xlsx"
        }
    )

@scope3_bulk_router.post("/upload")
async def upload_scope3_file(
    file: UploadFile = File(...),
    validate_only: bool = Query(True, description="If True, only validate without saving. User must call /save endpoint to save."),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload and validate Scope 3 bulk upload file.
    
    By default, this only validates the file without saving records.
    After validation, the user has 3 options:
    1. Save valid rows - POST /bulk-upload/scope3/jobs/{job_id}/save
    2. Download error report - GET /bulk-upload/scope3/jobs/{job_id}/errors/download
    3. Upload new file - POST /bulk-upload/scope3/upload (with corrected file)
    """
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="File must be an Excel file (.xlsx or .xls)")
    
    file_content = await file.read()
    if len(file_content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 10MB limit")
    
    organization_id = current_user.get("organization_id")
    if not organization_id:
        raise HTTPException(status_code=400, detail="User must belong to an organization")
    
    user_id = current_user.get("id") or current_user.get("user_id")
    user_email = current_user.get("email", "")
    user_name = current_user.get("full_name") or current_user.get("name") or ""
    
    processor = UploadProcessor(db, organization_id, user_id, user_email, user_name)
    summary = await processor.process_upload(file_content, file.filename, validate_only=validate_only)
    
    return summary

@scope3_bulk_router.get("/jobs/{job_id}")
async def get_scope3_job_status(job_id: str, current_user: dict = Depends(get_current_user)):
    """Get status of a bulk upload job"""
    organization_id = current_user.get("organization_id")
    job = await db.bulk_upload_jobs.find_one(
        {"id": job_id, "organization_id": organization_id},
        {"_id": 0}
    )
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@scope3_bulk_router.post("/jobs/{job_id}/save")
async def save_scope3_valid_rows(job_id: str, current_user: dict = Depends(get_current_user)):
    """
    Save valid rows from a validated upload job.
    
    Call this after validation to save only the valid emission records.
    Records that failed validation will not be saved.
    """
    organization_id = current_user.get("organization_id")
    
    # Get job
    job = await db.bulk_upload_jobs.find_one(
        {"id": job_id, "organization_id": organization_id},
        {"_id": 0}
    )
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job.get("created_emission_ids"):
        raise HTTPException(status_code=400, detail="Records already saved for this job")
    
    if job.get("success_count", 0) == 0:
        raise HTTPException(status_code=400, detail="No valid rows to save")
    
    # Get pending records from temporary storage
    pending_records = await db.bulk_upload_pending_records.find(
        {"job_id": job_id},
        {"_id": 0}
    ).to_list(10000)
    
    logger.info(f"[BULK_SAVE] Job {job_id}: Found {len(pending_records)} pending records")
    
    if not pending_records:
        logger.warning(f"[BULK_SAVE] Job {job_id}: No pending records found")
        raise HTTPException(
            status_code=400, 
            detail="No pending records found. Please re-upload the file with validate_only=false to save directly."
        )
    
    # Clean up records for insertion
    records_to_save = []
    for record in pending_records:
        # Remove the job_id field used for tracking
        record.pop("job_id", None)
        record.pop("_temp_id", None)
        records_to_save.append(record)
    
    # Insert records into emission_records collection (same as manual entry)
    if records_to_save:
        await db.emission_records.insert_many(records_to_save)
        created_ids = [r["id"] for r in records_to_save]
        logger.info(f"[BULK_SAVE] Job {job_id}: Inserted {len(created_ids)} emission records")
        
        # Create emission_history entries for version tracking
        now = datetime.now(timezone.utc)
        history_entries = []
        for record in records_to_save:
            history_entries.append({
                "id": str(uuid.uuid4()),
                "emission_id": record["id"],
                "scope": record.get("scope", "scope3"),
                "category": record.get("category", ""),
                "reporting_month": record.get("reporting_period"),
                "changed_by": current_user["id"],
                "changed_by_email": current_user.get("email", ""),
                "changed_by_name": current_user.get("full_name", ""),
                "changed_at": now.isoformat(),
                "version": 1,
                "field_changes": [],
                "changes_summary": "Initial creation via bulk upload",
                "changes": {
                    "action": "created",
                    "old_values": None,
                    "new_values": {
                        "facility_id": record.get("facility_id"),
                        "reporting_period": record.get("reporting_period"),
                        "category": record.get("category"),
                        "co2e_emissions": record.get("co2e_emissions"),
                        "total_emissions": record.get("total_emissions"),
                    }
                }
            })
        if history_entries:
            await db.emission_history.insert_many(history_entries)
            logger.info(f"[BULK_SAVE] Job {job_id}: Created {len(history_entries)} history entries")
        
        # Create audit log entry for bulk upload
        scope_counts = {}
        for record in records_to_save:
            scope = record.get("scope", "scope3")
            scope_counts[scope] = scope_counts.get(scope, 0) + 1
        
        scope_summary = ", ".join([f"{s}: {c}" for s, c in scope_counts.items()])
        logger.info(f"[BULK_SAVE] Job {job_id}: Scope breakdown - {scope_summary}")
        
        audit_logger = AuditLogger(db)
        await audit_logger.log(
            action=AuditAction.IMPORT,
            module=AuditModule.EMISSION,
            user_id=current_user["id"],
            user_email=current_user.get("email", ""),
            user_role=current_user.get("role", "user"),
            organization_id=organization_id,
            resource_id=job_id,
            resource_name=f"Bulk Upload Job {job_id[:8]}",
            description=f"Bulk uploaded {len(created_ids)} emission records ({scope_summary})",
            metadata={
                "job_id": job_id,
                "total_records": len(created_ids),
                "scope_breakdown": scope_counts,
                "emission_ids": created_ids[:10] if len(created_ids) > 10 else created_ids
            }
        )
        logger.info(f"[BULK_SAVE] Job {job_id}: Audit log created")
        
        # Update job with saved record IDs
        await db.bulk_upload_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "created_emission_ids": created_ids,
                "status": "completed" if job.get("error_count", 0) == 0 else "partial_success"
            }}
        )
        
        # Clean up pending records
        await db.bulk_upload_pending_records.delete_many({"job_id": job_id})
        
        return {
            "success": True,
            "saved_count": len(created_ids),
            "job_id": job_id,
            "emission_ids": created_ids
        }
    
    return {"success": False, "error": "No records to save"}


@scope3_bulk_router.get("/jobs/{job_id}/errors/download")
async def download_scope3_error_report(job_id: str, current_user: dict = Depends(get_current_user)):
    """Download error report for a bulk upload job"""
    organization_id = current_user.get("organization_id")
    job = await db.bulk_upload_jobs.find_one(
        {"id": job_id, "organization_id": organization_id},
        {"_id": 0}
    )
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    errors = await db.bulk_upload_errors.find({"job_id": job_id}, {"_id": 0}).to_list(10000)
    error_objects = [
        ValidationError(
            sheet=e.get("sheet", ""),
            row=e.get("row", 0),
            column=e.get("column"),
            error_type=e.get("error_type", ""),
            message=e.get("message", ""),
            suggestion=e.get("suggestion"),
            severity=ErrorSeverity(e.get("severity", "error"))
        )
        for e in errors
    ]
    
    summary = UploadSummary(
        job_id=job_id,
        status=UploadStatus(job.get("status", "completed")),
        total_rows=job.get("total_rows", 0),
        success_count=job.get("success_count", 0),
        error_count=job.get("error_count", 0),
        warning_count=job.get("warning_count", 0),
        categories_processed=job.get("categories_processed", []),
        total_emissions_tco2e=job.get("total_emissions_tco2e", 0),
        errors=error_objects
    )
    
    report_bytes = ReportGenerator.generate_error_report(summary)
    return StreamingResponse(
        report_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=bulk_upload_errors_{job_id[:8]}.xlsx"}
    )

@scope3_bulk_router.get("/jobs/{job_id}/results/download")
async def download_scope3_results_report(job_id: str, current_user: dict = Depends(get_current_user)):
    """Download results report for a bulk upload job"""
    organization_id = current_user.get("organization_id")
    job = await db.bulk_upload_jobs.find_one(
        {"id": job_id, "organization_id": organization_id},
        {"_id": 0}
    )
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    emission_ids = job.get("created_emission_ids", [])
    emissions = []
    if emission_ids:
        emissions = await db.emission_records.find(
            {"id": {"$in": emission_ids}},
            {"_id": 0, "id": 1, "category": 1, "facility_name": 1, 
             "reporting_period": 1, "calculation_method_scope3": 1,
             "scope3_activity": 1, "co2e_emissions": 1}
        ).to_list(10000)
    
    summary = UploadSummary(
        job_id=job_id,
        status=UploadStatus(job.get("status", "completed")),
        total_rows=job.get("total_rows", 0),
        success_count=job.get("success_count", 0),
        error_count=job.get("error_count", 0),
        categories_processed=job.get("categories_processed", []),
        total_emissions_tco2e=job.get("total_emissions_tco2e", 0)
    )
    
    report_bytes = ReportGenerator.generate_results_report(summary, emissions)
    return StreamingResponse(
        report_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=bulk_upload_results_{job_id[:8]}.xlsx"}
    )

@scope3_bulk_router.get("/jobs")
async def list_scope3_jobs(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user)
):
    """List bulk upload jobs for the organization"""
    organization_id = current_user.get("organization_id")
    jobs = await db.bulk_upload_jobs.find(
        {"organization_id": organization_id},
        {"_id": 0}
    ).sort("uploaded_at", -1).skip(offset).limit(limit).to_list(limit)
    total = await db.bulk_upload_jobs.count_documents({"organization_id": organization_id})
    return {"jobs": jobs, "total": total, "limit": limit, "offset": offset}

@scope3_bulk_router.delete("/jobs/{job_id}")
async def delete_scope3_job(
    job_id: str,
    delete_emissions: bool = Query(False, description="Also delete created emissions"),
    current_user: dict = Depends(get_current_user)
):
    """Delete a bulk upload job and optionally its created emissions"""
    organization_id = current_user.get("organization_id")
    job = await db.bulk_upload_jobs.find_one(
        {"id": job_id, "organization_id": organization_id},
        {"_id": 0}
    )
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if delete_emissions:
        emission_ids = job.get("created_emission_ids", [])
        if emission_ids:
            await db.emission_records.delete_many({"id": {"$in": emission_ids}})
    
    await db.bulk_upload_errors.delete_many({"job_id": job_id})
    await db.bulk_upload_jobs.delete_one({"id": job_id})
    
    return {"message": "Job deleted successfully", "emissions_deleted": delete_emissions}

api_router.include_router(scope3_bulk_router)

# ==========================================
# C7 Employee Commuting - Monthly Entry Model (#10)
# ==========================================

# Phase B5: C7MonthlyEntryCreate / C7MonthlyEntryResponse moved to
# modules/emissions/c7_contracts.py — re-imported at the top of this file.

# Phase B5: 7 C7 routes (POST /c7/month, GET/{facility}/{year}, GET/.../{month},
# DELETE /c7/{entry_id}, POST /c7/yearly, GET /c7/yearly/..., POST /c7/migrate/...)
# moved to modules/emissions/c7_router.py

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Type", "Content-Length"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup_event():
    """Check and deactivate expired organizations on startup"""
    await check_expired_subscriptions()
    await seed_scopes_and_categories(db)
    await seed_calc_engine(db)

async def check_expired_subscriptions():
    """Deactivate organizations whose subscription has expired"""
    now = datetime.now(timezone.utc).isoformat()
    
    # Find organizations with expired subscriptions that are still active
    expired_orgs = await db.organizations.find({
        "subscription_expires_at": {"$lt": now, "$ne": None},
        "is_active": {"$ne": False}
    }, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    
    for org in expired_orgs:
        await db.organizations.update_one(
            {"id": org["id"]},
            {"$set": {"is_active": False}}
        )
        logger.info(f"Auto-deactivated organization '{org['name']}' due to expired subscription")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()