"""
C7 Employee Commuting router — Phase B5 extraction.

Routes (7):
    POST   /emissions/c7/month
    GET    /emissions/c7/{facility_id}/{year}
    GET    /emissions/c7/{facility_id}/{year}/{month}
    DELETE /emissions/c7/{entry_id}
    POST   /emissions/c7/yearly
    GET    /emissions/c7/yearly/{facility_id}/{reporting_year}
    POST   /emissions/c7/migrate/{facility_id}/{year}

Behaviour byte-identical to legacy server.py implementation. Calc-engine
integration kept inline for now (Phase B5 is "extract", not "redesign").
The Pydantic models live in `modules/emissions/c7_contracts.py`.
"""
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException

from audit_logger import AuditAction, AuditModule, get_audit_logger
from modules.auth.dependencies import get_admin_user, get_current_user
from modules.entitlements.dependencies import assert_period_row_limit
from modules.emissions.c7_contracts import (
    C7MonthlyEntryCreate,
    C7MonthlyEntryResponse,
    C7YearlyEntryCreate,
    C7YearlyEntryResponse,
)
from shared.database.mongo import db
from shared.helpers.audit_helpers import compute_field_changes, get_input_label_map_from_db

router = APIRouter()


@router.post("/emissions/c7/month", response_model=C7MonthlyEntryResponse)
async def create_or_update_c7_monthly_entry(
    entry_data: C7MonthlyEntryCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create or update a single month's C7 Employee Commuting entry.
    
    - If entry_id is provided: UPDATE the existing record with that ID
    - If entry_id is NOT provided: Always CREATE a new record
    """
    
    # Verify facility access
    facility = await db.facilities.find_one({"id": entry_data.facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    
    org_id = facility.get("organization_id")
    if current_user.get("role") != "super_admin" and current_user.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this facility")
    
    # Create reporting_period in YYYY-MM format
    month_to_num = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
        'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
    }
    month_num = month_to_num.get(entry_data.reporting_month.lower(), '01')
    reporting_period = f"{entry_data.reporting_year}-{month_num}"
    
    # Only look for existing record if entry_id is explicitly provided (UPDATE mode)
    existing = None
    if entry_data.entry_id:
        existing = await db.emission_records.find_one({
            "id": entry_data.entry_id,
            "category": "C7 - Employee Commuting",
            "c7_data_model_version": 2
        }, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=404, detail=f"C7 entry with id '{entry_data.entry_id}' not found")
    
    # Calculate monthly total from employees
    total_co2e = 0.0
    for emp in entry_data.employees:
        emissions = emp.get("emissions", {})
        if isinstance(emissions, dict):
            total_co2e += float(emissions.get("co2e", 0) or 0)
        elif isinstance(emissions, (int, float)):
            total_co2e += float(emissions)
    
    monthly_total = {
        "co2e": total_co2e,
        "employee_count": len(entry_data.employees)
    }
    
    now = datetime.now(timezone.utc).isoformat()
    
    if existing:
        # Update existing entry
        old_version = existing.get("version", 0)
        
        # Compute field changes for version history - track all fields being updated
        # Also track individual employee input changes
        employee_input_changes = []
        old_employees = existing.get("employees", [])
        # Convert Pydantic models to dicts if needed (supports both Pydantic v1 and v2)
        new_employees = []
        for emp in (entry_data.employees or []):
            if hasattr(emp, 'model_dump'):
                new_employees.append(emp.model_dump())
            elif hasattr(emp, 'dict'):
                new_employees.append(emp.dict())
            else:
                new_employees.append(emp)
        
        # Create maps for comparison
        old_emp_map = {emp.get("id") or emp.get("employee_id", ""): emp for emp in old_employees}
        
        for new_emp in new_employees:
            emp_id = new_emp.get("id") or new_emp.get("employee_id", "")
            emp_name = new_emp.get("name", "Unknown")
            old_emp = old_emp_map.get(emp_id, {})
            
            new_inputs = new_emp.get("inputs", {})
            old_inputs = old_emp.get("inputs", {})
            
            # Track specific input field changes
            input_fields_to_track = [
                ("km_travelled", "Distance Travelled (km)"),
                ("qty_passengers", "No. of Passengers"),
                ("qty_days_travelled", "No. of Days Travelled"),
                ("working_days", "Working Days"),
                ("working_hour_per_day", "Working Hours per Day"),
                ("activity_value_supplier_based", "Quantity (Supplier Based)"),
                ("emission_factor_supplier_based", "Emission Factor (Supplier Based)"),
            ]
            
            for field_key, field_label in input_fields_to_track:
                old_val = old_inputs.get(field_key)
                new_val = new_inputs.get(field_key)
                if old_val != new_val and (old_val is not None or new_val is not None):
                    employee_input_changes.append({
                        "field": f"{emp_name} - {field_label}",
                        "old_value": old_val,
                        "new_value": new_val
                    })
        
        new_values = {
            "activity_type": entry_data.activity_type,
            "calculation_method_scope3": entry_data.calculation_method,
            "scope3_activity": entry_data.activity_name,
            "scope3_ef_id": entry_data.activity_id,
            "formula_id": entry_data.formula_id,
            "formula_name": entry_data.formula_name,
            "notes": entry_data.notes,
            "record_source": entry_data.record_source,
            "submission_batch_id": entry_data.submission_batch_id,
            "responsible_person": entry_data.responsible_person,
            "responsible_person_designation": entry_data.responsible_person_designation,
            "responsible_person_contact": entry_data.responsible_person_contact,
            "total_emissions": total_co2e,
        }
        # Specify fields to track for C7 monthly - exclude yearly_total, employees (tracked separately)
        # Note: scope3_activity is handled by custom activity tracking logic, so exclude it here
        c7_monthly_fields = [
            "activity_type", "calculation_method_scope3", "scope3_ef_id",
            "formula_id", "formula_name", "notes", "record_source",
            "responsible_person",
            "responsible_person_designation", "responsible_person_contact", "total_emissions"
        ]
        
        # Fetch input labels from DB for field change display
        input_label_map = await get_input_label_map_from_db(db)
        
        field_changes = compute_field_changes(existing, new_values, fields_to_track=c7_monthly_fields, input_label_map=input_label_map)
        
        # Add employee input changes to field_changes
        field_changes.extend(employee_input_changes)
        
        update_dict = {
            "organization_id": org_id,  # Ensure organization_id is always set
            "employees": entry_data.employees,
            "monthly_total": monthly_total,
            "co2e_emissions": total_co2e,
            "total_emissions": total_co2e,
            "activity_type": entry_data.activity_type,
            "scope3_activity_type": entry_data.activity_type,
            "calculation_method_scope3": entry_data.calculation_method,
            "scope3_activity": entry_data.activity_name,
            "scope3_ef_id": entry_data.activity_id,
            "formula_id": entry_data.formula_id,
            "formula_name": entry_data.formula_name,
            "notes": entry_data.notes,
            "record_source": entry_data.record_source,
            "responsible_person": entry_data.responsible_person,
            "responsible_person_designation": entry_data.responsible_person_designation,
            "responsible_person_contact": entry_data.responsible_person_contact,
            "process_names": entry_data.process_names or [],
            "process_descriptions": entry_data.process_descriptions or [],
            "updated_at": now,
            "updated_by": current_user["id"],
            "updated_by_email": current_user.get("email", ""),
            "updated_by_name": current_user.get("full_name", ""),
            "version": old_version + 1
        }
        
        await db.emission_records.update_one({"id": existing["id"]}, {"$set": update_dict})
        
        # Save version history
        if field_changes:
            history_dict = {
                "id": str(uuid.uuid4()),
                "emission_id": existing["id"],
                "facility_id": entry_data.facility_id,
                "organization_id": org_id,
                "scope": "scope3",
                "category": "C7 - Employee Commuting",
                "reporting_month": entry_data.reporting_month,
                "changed_by": current_user["id"],
                "changed_by_email": current_user.get("email", ""),
                "changed_by_name": current_user.get("full_name", ""),
                "changed_at": now,
                "version": old_version + 1,
                "field_changes": field_changes,
                "changes_summary": f"{len(field_changes)} field(s) changed",
                "changes": {"action": "updated"}
            }
            await db.emission_history.insert_one(history_dict)
        
        result = await db.emission_records.find_one({"id": existing["id"]}, {"_id": 0})
    else:
        # Create new entry
        await assert_period_row_limit(
            org_id,
            "ghg",
            "emission_records",
            "monthly",
            reporting_period,
        )
        entry_id = str(uuid.uuid4())
        
        new_entry = {
            "id": entry_id,
            "facility_id": entry_data.facility_id,
            "organization_id": org_id,
            "scope": "scope3",
            "category": "C7 - Employee Commuting",
            "reporting_year": entry_data.reporting_year,
            "reporting_month": entry_data.reporting_month.lower(),
            "reporting_period": reporting_period,
            "frequency_type": "monthly",
            "c7_data_model_version": 2,  # Mark as new model
            "calculation_method_scope3": entry_data.calculation_method,
            "scope3_activity_type": entry_data.activity_type,
            "activity_type": entry_data.activity_type,
            "scope3_ef_id": entry_data.activity_id,
            "scope3_activity": entry_data.activity_name,
            "formula_id": entry_data.formula_id,
            "formula_name": entry_data.formula_name,
            "employees": entry_data.employees,
            "monthly_total": monthly_total,
            "co2e_emissions": total_co2e,
            "total_emissions": total_co2e,
            "notes": entry_data.notes,
            "record_source": entry_data.record_source,
            "submission_batch_id": entry_data.submission_batch_id,
            "responsible_person": entry_data.responsible_person,
            "responsible_person_designation": entry_data.responsible_person_designation,
            "responsible_person_contact": entry_data.responsible_person_contact,
            "process_names": entry_data.process_names or [],
            "process_descriptions": entry_data.process_descriptions or [],
            "version": 1,
            "created_at": now,
            "created_by": current_user["id"],
            "created_by_email": current_user.get("email", ""),
            "created_by_name": current_user.get("full_name", ""),
        }
        
        await db.emission_records.insert_one(new_entry)
        
        # Save creation history for C7
        creation_history = {
            "id": str(uuid.uuid4()),
            "emission_id": entry_id,
            "facility_id": entry_data.facility_id,
            "organization_id": org_id,
            "scope": "scope3",
            "category": "C7 - Employee Commuting",
            "reporting_month": entry_data.reporting_month,
            "changed_by": current_user["id"],
            "changed_by_email": current_user.get("email", ""),
            "changed_by_name": current_user.get("full_name", ""),
            "changed_at": now,
            "version": 1,
            "field_changes": [],
            "changes_summary": "Initial creation",
            "changes": {"action": "created"},
            "new_values": {
                "facility_id": entry_data.facility_id,
                "reporting_month": entry_data.reporting_month,
                "calculation_method": entry_data.calculation_method,
                "activity_type": entry_data.activity_type,
                "activity_name": entry_data.activity_name,
                "employee_count": len(entry_data.employees),
                "co2e_emissions": total_co2e,
                "total_emissions": total_co2e,
            }
        }
        await db.emission_history.insert_one(creation_history)
        
        result = new_entry
    
    # Add facility name
    result["facility_name"] = facility.get("name", "")
    result["calculation_method"] = entry_data.calculation_method
    
    return C7MonthlyEntryResponse(**result)

@router.get("/emissions/c7/{facility_id}/{year}")
async def get_c7_yearly_summary(
    facility_id: str,
    year: int,
    current_user: dict = Depends(get_current_user)
):
    """Get all C7 monthly entries for a facility/year with aggregated totals"""
    
    # Verify facility access
    facility = await db.facilities.find_one({"id": facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    
    org_id = facility.get("organization_id")
    if current_user.get("role") != "super_admin" and current_user.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get new model entries (v2)
    new_entries = await db.emission_records.find({
        "facility_id": facility_id,
        "category": "C7 - Employee Commuting",
        "reporting_year": year,
        "c7_data_model_version": 2
    }, {"_id": 0}).to_list(100)
    
    # Get old model entries (for backward compatibility)
    old_entries = await db.emission_records.find({
        "facility_id": facility_id,
        "category": "C7 - Employee Commuting",
        "reporting_year": year,
        "c7_data_model_version": {"$exists": False},
        "migrated_to_v2": {"$ne": True}
    }, {"_id": 0}).to_list(100)
    
    # Combine entries for response
    entries = new_entries
    
    # Calculate yearly aggregates
    monthly_totals = {}
    yearly_total = {"co2e": 0, "employee_count": 0}
    
    for entry in entries:
        month = entry.get("reporting_month", "")
        mt = entry.get("monthly_total", {})
        monthly_totals[month] = mt
        yearly_total["co2e"] += mt.get("co2e", 0)
        yearly_total["employee_count"] = max(yearly_total["employee_count"], mt.get("employee_count", 0))
    
    return {
        "facility_id": facility_id,
        "facility_name": facility.get("name", ""),
        "reporting_year": year,
        "entries": entries,
        "monthly_totals": monthly_totals,
        "yearly_total": yearly_total,
        "has_old_model_data": len(old_entries) > 0,
        "old_entries_count": len(old_entries)
    }

@router.get("/emissions/c7/{facility_id}/{year}/{month}", response_model=C7MonthlyEntryResponse)
async def get_c7_monthly_entry(
    facility_id: str,
    year: int,
    month: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single C7 monthly entry"""
    
    # Verify facility access
    facility = await db.facilities.find_one({"id": facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    
    org_id = facility.get("organization_id")
    if current_user.get("role") != "super_admin" and current_user.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    entry = await db.emission_records.find_one({
        "facility_id": facility_id,
        "category": "C7 - Employee Commuting",
        "reporting_year": year,
        "reporting_month": month.lower(),
        "c7_data_model_version": 2
    }, {"_id": 0})
    
    if not entry:
        raise HTTPException(status_code=404, detail=f"No C7 entry found for {month} {year}")
    
    entry["facility_name"] = facility.get("name", "")
    entry["calculation_method"] = entry.get("calculation_method_scope3", "")
    return C7MonthlyEntryResponse(**entry)

@router.delete("/emissions/c7/{entry_id}")
async def delete_c7_monthly_entry(
    entry_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a C7 monthly entry"""
    
    entry = await db.emission_records.find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    # Verify access
    facility = await db.facilities.find_one({"id": entry.get("facility_id")}, {"_id": 0})
    if facility:
        org_id = facility.get("organization_id")
        if current_user.get("role") != "super_admin" and current_user.get("organization_id") != org_id:
            raise HTTPException(status_code=403, detail="Not authorized")
    
    # Save deletion to history
    history_dict = {
        "id": str(uuid.uuid4()),
        "emission_id": entry_id,
        "facility_id": entry.get("facility_id"),
        "organization_id": entry.get("organization_id"),
        "scope": "scope3",
        "category": "C7 - Employee Commuting",
        "reporting_month": entry.get("reporting_month"),
        "changed_by": current_user["id"],
        "changed_by_email": current_user.get("email", ""),
        "changed_by_name": current_user.get("full_name", ""),
        "changed_at": datetime.now(timezone.utc).isoformat(),
        "version": entry.get("version", 0) + 1,
        "field_changes": [{"field": "deleted", "old_value": entry, "new_value": None}],
        "changes_summary": "Entry deleted",
        "changes": {"action": "deleted", "old_values": entry}
    }
    await db.emission_history.insert_one(history_dict)
    
    await db.emission_records.delete_one({"id": entry_id})
    
    return {"message": "Entry deleted successfully", "id": entry_id}

# ==========================================
# C7 Employee Commuting - Yearly Entry Model
# ==========================================
# (Pydantic models moved to modules/emissions/c7_contracts.py — imported above.)

@router.post("/emissions/c7/yearly", response_model=C7YearlyEntryResponse)
async def create_or_update_c7_yearly_entry(
    entry_data: C7YearlyEntryCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create or update a yearly C7 Employee Commuting entry (per-employee annual totals).
    
    - If entry_id is provided: UPDATE the existing record with that ID
    - If entry_id is NOT provided: Always CREATE a new record
    """
    
    # Verify facility access
    facility = await db.facilities.find_one({"id": entry_data.facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    
    org_id = facility.get("organization_id")
    if current_user.get("role") != "super_admin" and current_user.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this facility")
    
    # Validate reporting_year format (CY2025 or FY 2025-2026)
    reporting_year = entry_data.reporting_year
    if not (reporting_year.startswith("CY") or reporting_year.startswith("FY ")):
        raise HTTPException(
            status_code=400,
            detail="reporting_year must be in format 'CY2025' or 'FY 2025-2026'"
        )
    
    # Only look for existing record if entry_id is explicitly provided (UPDATE mode)
    existing = None
    if entry_data.entry_id:
        existing = await db.emission_records.find_one({
            "id": entry_data.entry_id,
            "category": "C7 - Employee Commuting",
            "frequency_type": "yearly",
            "c7_data_model_version": 2
        }, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=404, detail=f"C7 yearly entry with id '{entry_data.entry_id}' not found")
    
    # Calculate yearly total from employees
    total_co2e = 0.0
    for emp in entry_data.employees:
        emissions = emp.get("emissions", {})
        if isinstance(emissions, dict):
            total_co2e += float(emissions.get("co2e", 0) or 0)
        elif isinstance(emissions, (int, float)):
            total_co2e += float(emissions)
    
    yearly_total = {
        "co2e": total_co2e,
        "employee_count": len(entry_data.employees)
    }
    
    now = datetime.now(timezone.utc).isoformat()
    
    if existing:
        # Update existing entry
        old_version = existing.get("version", 0)
        
        # Track individual employee input changes for yearly
        employee_input_changes = []
        old_employees = existing.get("employees", [])
        # Convert Pydantic models to dicts if needed (supports both Pydantic v1 and v2)
        new_employees = []
        for emp in (entry_data.employees or []):
            if hasattr(emp, 'model_dump'):
                new_employees.append(emp.model_dump())
            elif hasattr(emp, 'dict'):
                new_employees.append(emp.dict())
            else:
                new_employees.append(emp)
        
        # Create maps for comparison
        old_emp_map = {emp.get("id") or emp.get("employee_id", ""): emp for emp in old_employees}
        
        for new_emp in new_employees:
            emp_id = new_emp.get("id") or new_emp.get("employee_id", "")
            emp_name = new_emp.get("name", "Unknown")
            old_emp = old_emp_map.get(emp_id, {})
            
            new_inputs = new_emp.get("inputs", {})
            old_inputs = old_emp.get("inputs", {})
            
            # Track specific input field changes
            input_fields_to_track = [
                ("km_travelled", "Distance Travelled (km)"),
                ("qty_passengers", "No. of Passengers"),
                ("qty_days_travelled", "No. of Days Travelled"),
                ("working_days", "Working Days"),
                ("working_hour_per_day", "Working Hours per Day"),
                ("activity_value_supplier_based", "Quantity (Supplier Based)"),
                ("emission_factor_supplier_based", "Emission Factor (Supplier Based)"),
            ]
            
            for field_key, field_label in input_fields_to_track:
                old_val = old_inputs.get(field_key)
                new_val = new_inputs.get(field_key)
                if old_val != new_val and (old_val is not None or new_val is not None):
                    employee_input_changes.append({
                        "field": f"{emp_name} - {field_label}",
                        "old_value": old_val,
                        "new_value": new_val
                    })
        
        update_dict = {
            "organization_id": org_id,  # Ensure organization_id is always set
            "employees": entry_data.employees,
            "yearly_total": yearly_total,
            "co2e_emissions": total_co2e,
            "total_emissions": total_co2e,
            "activity_type": entry_data.activity_type,
            "scope3_activity_type": entry_data.activity_type,
            "calculation_method_scope3": entry_data.calculation_method,
            "scope3_activity": entry_data.activity_name,
            "scope3_ef_id": entry_data.activity_id,
            "formula_id": entry_data.formula_id,
            "formula_name": entry_data.formula_name,
            "notes": entry_data.notes,
            "record_source": entry_data.record_source,
            "responsible_person": entry_data.responsible_person,
            "responsible_person_designation": entry_data.responsible_person_designation,
            "responsible_person_contact": entry_data.responsible_person_contact,
            "process_names": entry_data.process_names,
            "process_descriptions": entry_data.process_descriptions,
            "updated_at": now,
            "updated_by": current_user["id"],
            "updated_by_email": current_user.get("email", ""),
            "updated_by_name": current_user.get("full_name", ""),
            "version": old_version + 1
        }
        
        await db.emission_records.update_one({"id": existing["id"]}, {"$set": update_dict})
        
        # Save update history for C7 yearly (track employee input changes)
        history_dict = {
            "id": str(uuid.uuid4()),
            "emission_id": existing["id"],
            "facility_id": entry_data.facility_id,
            "organization_id": org_id,
            "scope": "scope3",
            "category": "C7 - Employee Commuting",
            "reporting_period": reporting_year,
            "changed_by": current_user["id"],
            "changed_by_email": current_user.get("email", ""),
            "changed_by_name": current_user.get("full_name", ""),
            "changed_at": now,
            "version": old_version + 1,
            "field_changes": employee_input_changes,
            "changes_summary": "Updated yearly C7 emission" + (f" ({len(employee_input_changes)} input field(s) changed)" if employee_input_changes else ""),
            "changes": {"action": "updated"},
            "new_values": {
                "employee_count": len(entry_data.employees),
                "co2e_emissions": total_co2e,
                "total_emissions": total_co2e,
            }
        }
        await db.emission_history.insert_one(history_dict)
        
        updated = await db.emission_records.find_one({"id": existing["id"]}, {"_id": 0})
        updated["facility_name"] = facility.get("name", "")
        updated["calculation_method"] = entry_data.calculation_method
        updated["reporting_year"] = reporting_year
        # Map database field names to response model field names
        updated["activity_id"] = updated.get("scope3_ef_id")
        updated["activity_name"] = updated.get("scope3_activity")
        return C7YearlyEntryResponse(**updated)
    
    else:
        # Create new yearly entry
        await assert_period_row_limit(
            org_id,
            "ghg",
            "emission_records",
            "yearly",
            reporting_year,
        )
        record_id = str(uuid.uuid4())
        
        new_record = {
            "id": record_id,
            "facility_id": entry_data.facility_id,
            "organization_id": org_id,
            "scope": "scope3",
            "category": "C7 - Employee Commuting",
            "sub_category": "Employee Commuting",
            "frequency_type": "yearly",
            "reporting_period": reporting_year,
            "reporting_year": reporting_year,
            "c7_data_model_version": 2,
            "calculation_method_scope3": entry_data.calculation_method,
            "activity_type": entry_data.activity_type,
            "scope3_activity_type": entry_data.activity_type,
            "scope3_activity": entry_data.activity_name,
            "scope3_ef_id": entry_data.activity_id,
            "formula_id": entry_data.formula_id,
            "formula_name": entry_data.formula_name,
            "employees": entry_data.employees,
            "yearly_total": yearly_total,
            "co2e_emissions": total_co2e,
            "total_emissions": total_co2e,
            "notes": entry_data.notes,
            "record_source": entry_data.record_source,
            "responsible_person": entry_data.responsible_person,
            "responsible_person_designation": entry_data.responsible_person_designation,
            "responsible_person_contact": entry_data.responsible_person_contact,
            "process_names": entry_data.process_names,
            "process_descriptions": entry_data.process_descriptions,
            "version": 1,
            "created_at": now,
            "created_by": current_user["id"],
            "created_by_email": current_user.get("email", ""),
            "created_by_name": current_user.get("full_name", ""),
            "updated_at": None,
            "updated_by": None
        }
        
        await db.emission_records.insert_one(new_record)
        
        # Save creation history for C7 yearly
        creation_history = {
            "id": str(uuid.uuid4()),
            "emission_id": record_id,
            "facility_id": entry_data.facility_id,
            "organization_id": org_id,
            "scope": "scope3",
            "category": "C7 - Employee Commuting",
            "reporting_period": reporting_year,
            "changed_by": current_user["id"],
            "changed_by_email": current_user.get("email", ""),
            "changed_by_name": current_user.get("full_name", ""),
            "changed_at": now,
            "version": 1,
            "field_changes": [],
            "changes_summary": "Initial creation",
            "changes": {"action": "created"},
            "new_values": {
                "facility_id": entry_data.facility_id,
                "reporting_period": reporting_year,
                "calculation_method": entry_data.calculation_method,
                "activity_type": entry_data.activity_type,
                "activity_name": entry_data.activity_name,
                "employee_count": len(entry_data.employees),
                "co2e_emissions": total_co2e,
                "total_emissions": total_co2e,
            }
        }
        await db.emission_history.insert_one(creation_history)
        
        new_record["facility_name"] = facility.get("name", "")
        new_record["calculation_method"] = entry_data.calculation_method
        # Map database field names to response model field names
        new_record["activity_id"] = entry_data.activity_id
        new_record["activity_name"] = entry_data.activity_name
        return C7YearlyEntryResponse(**new_record)

@router.get("/emissions/c7/yearly/{facility_id}/{reporting_year}")
async def get_c7_yearly_entry(
    facility_id: str,
    reporting_year: str,
    current_user: dict = Depends(get_current_user)
):
    """Get yearly C7 entry for a facility"""
    
    # Verify facility access
    facility = await db.facilities.find_one({"id": facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    
    org_id = facility.get("organization_id")
    if current_user.get("role") != "super_admin" and current_user.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Find yearly entry
    entry = await db.emission_records.find_one({
        "facility_id": facility_id,
        "category": "C7 - Employee Commuting",
        "reporting_period": reporting_year,
        "frequency_type": "yearly",
        "c7_data_model_version": 2
    }, {"_id": 0})
    
    if not entry:
        return {"message": "No yearly C7 entry found", "facility_id": facility_id, "reporting_year": reporting_year}
    
    entry["facility_name"] = facility.get("name", "")
    entry["calculation_method"] = entry.get("calculation_method_scope3", "")
    return entry

@router.post("/emissions/c7/migrate/{facility_id}/{year}")
async def migrate_c7_to_monthly_model(
    facility_id: str,
    year: int,
    current_user: dict = Depends(get_admin_user)
):
    """Migrate old C7 entries to new monthly model (Admin only)"""
    
    # Find old model entries
    old_entries = await db.emission_records.find({
        "facility_id": facility_id,
        "category": "C7 - Employee Commuting",
        "reporting_year": year,
        "c7_data_model_version": {"$exists": False}
    }, {"_id": 0}).to_list(100)
    
    if not old_entries:
        return {"message": "No old model entries found to migrate", "migrated_count": 0}
    
    migrated_count = 0
    
    for old_entry in old_entries:
        employees = old_entry.get("employees", [])
        
        # Group employees by month
        month_employee_map = {}
        
        for emp in employees:
            monthly_data = emp.get("monthly_data", {})
            for month_key, month_data in monthly_data.items():
                if month_key not in month_employee_map:
                    month_employee_map[month_key] = []
                
                # Create employee entry for this month
                emp_month_entry = {
                    "id": emp.get("id"),
                    "name": emp.get("name"),
                    "employee_id": emp.get("employee_id"),
                    "department": emp.get("department"),
                    "activity_type": emp.get("activity_type"),
                    "inputs": month_data.get("inputs", {}),
                    "emissions": month_data.get("emissions", {})
                }
                month_employee_map[month_key].append(emp_month_entry)
        
        # Create new monthly entries
        for month_key, month_employees in month_employee_map.items():
            if not month_employees:
                continue
            
            # Calculate monthly total
            total_co2e = sum(
                emp.get("emissions", {}).get("co2e", 0) or 0 
                for emp in month_employees
            )
            
            month_to_num = {
                'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
                'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
            }
            month_num = month_to_num.get(month_key.lower(), '01')
            
            new_entry = {
                "id": str(uuid.uuid4()),
                "facility_id": facility_id,
                "organization_id": old_entry.get("organization_id"),
                "scope": "scope3",
                "category": "C7 - Employee Commuting",
                "reporting_year": year,
                "reporting_month": month_key.lower(),
                "reporting_period": f"{year}-{month_num}",
                "c7_data_model_version": 2,
                "calculation_method_scope3": old_entry.get("calculation_method_scope3"),
                "scope3_activity_type": old_entry.get("scope3_activity_type"),
                "activity_type": old_entry.get("scope3_activity_type"),
                "scope3_ef_id": old_entry.get("scope3_ef_id"),
                "scope3_activity": old_entry.get("scope3_activity"),
                "employees": month_employees,
                "monthly_total": {"co2e": total_co2e, "employee_count": len(month_employees)},
                "co2e_emissions": total_co2e,
                "total_emissions": total_co2e,
                "notes": old_entry.get("notes"),
                "responsible_person": old_entry.get("responsible_person"),
                "version": 1,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "created_by": current_user["id"],
                "migrated_from": old_entry.get("id")
            }
            
            await db.emission_records.insert_one(new_entry)
            migrated_count += 1
        
        # Mark old entry as migrated (don't delete, keep for reference)
        await db.emission_records.update_one(
            {"id": old_entry["id"]},
            {"$set": {"migrated_to_v2": True, "migrated_at": datetime.now(timezone.utc).isoformat()}}
        )
    
    return {
        "message": "Migration complete",
        "migrated_count": migrated_count,
        "old_entries_processed": len(old_entries)
    }
