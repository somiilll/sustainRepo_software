"""GHG approval workflow: who approves an emission change, and the approval requests it creates."""
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional
from app.logging import log_event
from modules.approval_workflow.proposal_service import sync_emission_request_history
from modules.emissions.record_store import APPROVED_COLLECTION, STATUS_PENDING_DELETE
from shared.database.mongo import db
from modules.esg_assignments.assignment_resolver import assignment_requires_approval
from shared.utils.density_units import normalize_density_dynamic_values

from app.logging import get_logger
from modules.approval_workflow.proposal_service import sync_emission_request_history
from modules.approval_workflow.approver_chain import approvers_at_level, best_entry, clamp_level, normalize_chain

logger = get_logger(__name__)


def build_emission_inputs(emission_record: dict) -> dict:
    """
    Build a normalized inputs dictionary from an emission record.
    
    Handles two data formats:
    1. New format: dynamic_field_values = {'qty': {'value': 100, 'unit': 'kWh'}, ...}
    2. Legacy format: individual fields like quantity, quantity_unit, emission_factor, etc.
    
    Returns a dict like: {'qty': {'value': 100, 'unit': 'kWh'}, ...}
    """
    # Check for dynamic_field_values first (new format)
    dfv = emission_record.get("dynamic_field_values")
    if dfv and isinstance(dfv, dict) and len(dfv) > 0:
        return normalize_density_dynamic_values(dfv)
    
    # Check for inputs field
    inputs = emission_record.get("inputs")
    if inputs and isinstance(inputs, dict) and len(inputs) > 0:
        return normalize_density_dynamic_values(inputs)
    
    # Build from legacy individual fields
    legacy_inputs = {}
    
    # Quantity field
    if emission_record.get("quantity") is not None:
        legacy_inputs["qty"] = {
            "value": emission_record.get("quantity"),
            "unit": emission_record.get("quantity_unit") or emission_record.get("unit") or ""
        }
    
    # Emission factor
    if emission_record.get("emission_factor") is not None:
        legacy_inputs["ef"] = {
            "value": emission_record.get("emission_factor"),
            "unit": "kgCO2/unit",
            "is_override": emission_record.get("is_custom_factor", False)
        }
    
    # Calorific value
    if emission_record.get("calorific_value") is not None:
        legacy_inputs["cv"] = {
            "value": emission_record.get("calorific_value"),
            "unit": "MJ/kg",
            "is_override": emission_record.get("override_calorific_value", False)
        }
    
    # Density
    if emission_record.get("density") is not None:
        legacy_inputs["density"] = {
            "value": emission_record.get("density"),
            "unit": "kg/L",
            "is_override": emission_record.get("override_density", False)
        }
    
    # Energy consumed (for Scope 2)
    if emission_record.get("energy_consumed") is not None:
        legacy_inputs["energy_consumed"] = {
            "value": emission_record.get("energy_consumed"),
            "unit": emission_record.get("energy_unit") or "kWh"
        }
    
    # Distance (for Scope 3)
    if emission_record.get("distance") is not None:
        legacy_inputs["distance"] = {
            "value": emission_record.get("distance"),
            "unit": emission_record.get("distance_unit") or "km"
        }
    
    # Weight (for Scope 3)
    if emission_record.get("weight") is not None:
        legacy_inputs["weight"] = {
            "value": emission_record.get("weight"),
            "unit": emission_record.get("weight_unit") or "kg"
        }
    
    # Spend amount (for spend-based method)
    if emission_record.get("spend_amount") is not None:
        legacy_inputs["spend_amount"] = {
            "value": emission_record.get("spend_amount"),
            "unit": emission_record.get("currency") or "USD"
        }
    
    return legacy_inputs if legacy_inputs else None


# =============================================================================
# Assignment-Based Approval Helpers (Granular per-category approval)
# Mirrors the pattern in esg_records/service.py for consistency
# =============================================================================

async def ghg_approver_mode(org_id: str, user_id: str, facility_id: Optional[str]):
    """(mode, assignment) for a user who approves GHG assignments: DIRECT if final approver, else the level an edit enters at."""
    query = {"organization_id": org_id, "entity_type": "record_category", "category": "GHG Emissions",
             "status": {"$nin": ["completed", "cancelled"]},
             "$and": [{"$or": [{"approver_id": user_id}, {"approval_chain": user_id}]}]}
    if facility_id:
        query["$and"].append({"$or": [{"facility_id": facility_id}, {"facility_id": None}]})
    return best_entry(await db.esg_assignments.find(query, {"_id": 0}).to_list(20), user_id)


async def find_emission_assignment(
    org_id: str,
    user_id: str,
    scope: str,
    facility_id: Optional[str] = None,
) -> Optional[dict]:
    """
    Find the user's assignment for this emission's scope.
    Returns the most specific matching assignment.
    
    Checks two assignment types:
    1. KPI assignments (entity_type='kpi') with kpi_identifier like 'scope1', 'scope2', 'scope3'
    2. Record category assignments (entity_type='record_category') with category='GHG Emissions' and subcategory matching scope
    
    Uses V2 assignment architecture: checks esg_assignment_assignees junction table
    """
    # Normalize scope identifier
    scope_lower = (scope or "").lower().replace(" ", "")
    
    # Map scope names to KPI identifiers
    scope_to_kpi = {
        "scope1": "scope1",
        "scope2": "scope2",
        "scope3": "scope3",
        "biogenic": "biogenic",
    }
    kpi_identifier = scope_to_kpi.get(scope_lower, scope_lower)
    
    # Map scope to subcategory names used in record_category assignments
    # Format: "GHG Emissions - Scope X"
    scope_to_subcategory = {
        "scope1": "GHG Emissions - Scope 1",
        "scope2": "GHG Emissions - Scope 2",
        "scope3": "GHG Emissions - Scope 3",
        "biogenic": "GHG Emissions - Biogenic",
    }
    subcategory = scope_to_subcategory.get(scope_lower)
    
    # V2 Architecture: Get assignment IDs where user is an assignee from junction table
    v2_assignee_docs = await db.esg_assignment_assignees.find(
        {
            "organization_id": org_id,
            "user_id": user_id,
            "removed_at": None,  # Not removed
        },
        {"_id": 0, "assignment_id": 1}
    ).to_list(500)
    v2_assignment_ids = [doc["assignment_id"] for doc in v2_assignee_docs]
    
    assignments = []
    
    # Strategy 1: Check KPI assignments (V2 - via junction table)
    if v2_assignment_ids:
        kpi_query = {
            "organization_id": org_id,
            "id": {"$in": v2_assignment_ids},
            "entity_type": "kpi",
            "status": {"$nin": ["completed", "cancelled"]},
            "kpi_identifier": kpi_identifier,
        }
        if facility_id:
            kpi_query["$or"] = [
                {"facility_id": facility_id},
                {"assignment_level": "organization"},
                {"facility_id": None},
            ]
        
        kpi_assignments = await db.esg_assignments.find(kpi_query, {"_id": 0}).to_list(100)
        assignments.extend(kpi_assignments)
    
    # Strategy 1b: Check KPI assignments (V1 legacy - direct assigned_to_user_id)
    kpi_query_v1 = {
        "organization_id": org_id,
        "assigned_to_user_id": user_id,
        "entity_type": "kpi",
        "status": {"$nin": ["completed", "cancelled"]},
        "kpi_identifier": kpi_identifier,
    }
    if facility_id:
        kpi_query_v1["$or"] = [
            {"facility_id": facility_id},
            {"assignment_level": "organization"},
        ]
    
    kpi_assignments_v1 = await db.esg_assignments.find(kpi_query_v1, {"_id": 0}).to_list(100)
    assignments.extend(kpi_assignments_v1)
    
    # Strategy 2: Check record_category assignments for GHG Emissions (V2 - via junction table)
    if v2_assignment_ids:
        record_cat_query = {
            "organization_id": org_id,
            "id": {"$in": v2_assignment_ids},
            "entity_type": "record_category",
            "status": {"$nin": ["completed", "cancelled"]},
            "category": "GHG Emissions",
        }
        if subcategory:
            # Check both exact subcategory match and category-level (no subcategory)
            record_cat_query["$or"] = [
                {"subcategory": subcategory},
                {"subcategory": None},
                {"subcategory": {"$exists": False}},
            ]
        if facility_id:
            # Combine with facility filter
            if "$or" in record_cat_query:
                existing_or = record_cat_query.pop("$or")
                record_cat_query["$and"] = [
                    {"$or": existing_or},
                    {"$or": [{"facility_id": facility_id}, {"assignment_level": "organization"}, {"facility_id": None}]}
                ]
            else:
                record_cat_query["$or"] = [
                    {"facility_id": facility_id},
                    {"assignment_level": "organization"},
                    {"facility_id": None},
                ]
        
        record_cat_assignments = await db.esg_assignments.find(record_cat_query, {"_id": 0}).to_list(100)
        assignments.extend(record_cat_assignments)
    
    # Strategy 2b: Check record_category assignments (V1 legacy - direct assigned_to_user_id)
    record_cat_query_v1 = {
        "organization_id": org_id,
        "assigned_to_user_id": user_id,
        "entity_type": "record_category",
        "status": {"$nin": ["completed", "cancelled"]},
        "category": "GHG Emissions",
    }
    if subcategory:
        record_cat_query_v1["$or"] = [
            {"subcategory": subcategory},
            {"subcategory": None},
            {"subcategory": {"$exists": False}},
        ]
    if facility_id:
        if "$or" in record_cat_query_v1:
            existing_or = record_cat_query_v1.pop("$or")
            record_cat_query_v1["$and"] = [
                {"$or": existing_or},
                {"$or": [{"facility_id": facility_id}, {"assignment_level": "organization"}]}
            ]
        else:
            record_cat_query_v1["$or"] = [
                {"facility_id": facility_id},
                {"assignment_level": "organization"},
            ]
    
    record_cat_assignments_v1 = await db.esg_assignments.find(record_cat_query_v1, {"_id": 0}).to_list(100)
    assignments.extend(record_cat_assignments_v1)
    
    if not assignments:
        return None
    
    # Deduplicate by assignment ID
    seen_ids = set()
    unique_assignments = []
    for a in assignments:
        if a.get("id") not in seen_ids:
            seen_ids.add(a.get("id"))
            unique_assignments.append(a)
    assignments = unique_assignments
    
    # Return the most specific assignment (exact subcategory match > exact facility match > org-level)
    best_match = None
    best_score = -1
    
    for assignment in assignments:
        score = 0
        
        # Subcategory specificity (for record_category)
        if assignment.get("entity_type") == "record_category":
            if assignment.get("subcategory") == subcategory:
                score += 10  # Exact subcategory match
            elif not assignment.get("subcategory"):
                score += 5  # Category-level match
        
        # Facility specificity
        if assignment.get("facility_id") == facility_id:
            score += 2  # Exact facility match
        elif assignment.get("assignment_level") == "organization":
            score += 1  # Org-level assignment
        
        if score > best_score:
            best_score = score
            best_match = assignment
    
    return best_match


def extra_snapshot_fields(record: dict) -> dict:
    """Evidence files and journey locations, so the approval queue shows what the assignee entered."""
    fields = {}
    for key in ("evidence_files", "from_location", "to_location", "supplier_name", "supplier_code"):
        if record.get(key):
            fields[key] = record[key]
    return fields


def c7_snapshot_fields(record: dict) -> dict:
    """Employee-level C7 data so the approval queue can render and edit each employee."""
    employees = record.get("employees")
    if not employees:
        return {}
    plain = [e.model_dump() if hasattr(e, "model_dump") else (e.dict() if hasattr(e, "dict") else e) for e in employees]
    fields = {"employees": plain}
    for key in ("monthly_total", "monthly_totals", "yearly_total", "formula_id", "activity_type", "scope3_activity_type", "scope3_ef_id", "reporting_month", "c7_data_model_version"):
        if record.get(key) is not None:
            fields[key] = record[key]
    return fields


async def create_emission_approval_request(
    org_id: str,
    emission_record: dict,
    assignment: dict,
    user_id: str,
    start_level: int = 1,
):
    """
    Create an approval request for an emission record.
    Uses the approver_id from the assignment or approval_chain if multi-level.
    
    Mirrors the logic from esg_records/service.py _create_approval_request().
    """
    
    # Determine approvers
    # Handle both formats: list of strings (user IDs) or list of objects with approver_id
    chain = normalize_chain(assignment)
    if not chain:
        log_event(logger, logging.WARNING, "ghg.emission.approval_configuration.incomplete", action="ghg.emission.approval", outcome="degraded", error_code="APPROVER_NOT_CONFIGURED")
        return
    current_approvers, total_levels = approvers_at_level(chain, start_level), len(chain)
    
    # Get submitter info
    submitter = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1, "full_name": 1})
    submitter_email = submitter.get("email", "") if submitter else ""
    submitter_name = submitter.get("full_name", "") if submitter else ""
    
    # Get facility info for display
    facility = None
    if emission_record.get("facility_id"):
        facility = await db.facilities.find_one(
            {"id": emission_record.get("facility_id")},
            {"_id": 0, "name": 1}
        )
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Build normalized inputs from emission record
    normalized_inputs = build_emission_inputs(emission_record)
    
    # Build entity snapshot with full details for approval UI
    entity_snapshot = {
        "scope": emission_record.get("scope"),
        "category": emission_record.get("category"),
        "category_id": emission_record.get("category_id"),
        "sub_category": emission_record.get("sub_category"),
        "fuel_type": emission_record.get("fuel_type"),
        "facility_id": emission_record.get("facility_id"),
        "facility_name": facility.get("name") if facility else None,
        "reporting_period": emission_record.get("reporting_period"),
        "frequency_type": emission_record.get("frequency_type"),
        "total_emissions": emission_record.get("total_emissions"),
        "co2_emissions": emission_record.get("co2_emissions"),
        "ch4_emissions": emission_record.get("ch4_emissions"),
        "n2o_emissions": emission_record.get("n2o_emissions"),
        "co2e_emissions": emission_record.get("co2e_emissions"),
        "inputs": normalized_inputs,
        "dynamic_field_values": normalized_inputs,
        "outputs": emission_record.get("outputs"),
        "evidence_url": emission_record.get("evidence_url", ""),
        "notes": emission_record.get("notes"),
        "has_custom_ef": emission_record.get("is_custom_factor", False),
        "emission_factor_used": emission_record.get("emission_factor"),
        "calculation_method_scope3": emission_record.get("calculation_method_scope3"),
        "scope3_activity": emission_record.get("scope3_activity"),
        "biogenic_scope_selection": emission_record.get("biogenic_scope_selection"),
        # Process info
        "process_names": emission_record.get("process_names", []),
        "process_descriptions": emission_record.get("process_descriptions", []),
        # Responsible person info
        "responsible_person": emission_record.get("responsible_person", ""),
        "responsible_person_designation": emission_record.get("responsible_person_designation", ""),
        "responsible_person_contact": emission_record.get("responsible_person_contact", ""),
        # Source info
        "source_of_information": emission_record.get("source_of_information", ""),
        **c7_snapshot_fields(emission_record),
        **extra_snapshot_fields(emission_record),
        "edit_type": "create",
    }
    
    # Create approval request document
    approval_request = {
        "id": str(uuid.uuid4()),
        "organization_id": org_id,
        "workflow_id": f"assignment_{assignment.get('id')}",  # Link to assignment
        "workflow_name": f"Emission Approval - {emission_record.get('scope')} - {emission_record.get('category')}",
        
        # Entity being approved
        "entity_type": "emission_record",
        "entity_id": emission_record.get("id"),
        "entity_subtype": emission_record.get("scope"),
        "entity_snapshot": entity_snapshot,
        "request_type": "create",
        
        # Submission info
        "submitted_by": user_id,
        "submitted_by_email": submitter_email,
        "submitted_by_name": submitter_name,
        "submitted_at": now,
        "submission_comment": None,
        
        # Current state
        "status": "pending",
        "current_level": min(start_level, total_levels),
        "current_approvers": current_approvers,
        "total_levels": total_levels,
        
        # Progress tracking
        "steps_completed": [],
        
        # Metadata
        "created_at": now,
        "updated_at": now,
    }
    
    await db.approval_requests.insert_one(approval_request)
    await sync_emission_request_history(approval_request["id"])
    log_event(logger, logging.INFO, "ghg.emission.approval_requested", action="ghg.emission.approval", outcome="succeeded",
              context={"record_id": emission_record.get("id"), "approval_request_id": approval_request.get("id")})
    
    # NOTE: For CREATE flow, we DO update the record's approval_status to pending_approval
    # because the record itself is new and hasn't been approved yet.
    # This is different from UPDATE flow where the existing approved data stays visible to others.
    await db[APPROVED_COLLECTION].update_one(
        {"id": emission_record.get("id")},
        {
            "$set": {
                "approval_status": "pending_approval",
                "updated_at": now,
            }
        }
    )
    log_event(logger, logging.INFO, "ghg.emission.approval_state.updated", action="ghg.emission.approval", outcome="pending_approval",
              context={"record_id": emission_record.get("id")})


async def create_emission_update_approval_request(
    org_id: str,
    existing_record: dict,
    updated_data: dict,
    assignment: dict,
    user_id: str,
    current_user: dict,
    start_level: int = 1,
):
    """
    Create an approval request for an emission record UPDATE.
    Stores the proposed changes in entity_snapshot for the approver to review.
    
    This uses the unified approval_requests collection instead of pending_emission_records.
    """
    
    # Determine approvers
    chain = normalize_chain(assignment)
    if not chain:
        log_event(logger, logging.WARNING, "ghg.emission.approval_configuration.incomplete", action="ghg.emission.approval", outcome="degraded", error_code="APPROVER_NOT_CONFIGURED")
        return
    current_approvers, total_levels = approvers_at_level(chain, start_level), len(chain)
    start_level = clamp_level(chain, start_level)
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Get facility info
    facility = None
    if existing_record.get("facility_id"):
        facility = await db.facilities.find_one(
            {"id": existing_record.get("facility_id")},
            {"_id": 0, "name": 1}
        )
    
    # Build normalized inputs from existing record and updated data
    original_inputs = build_emission_inputs(existing_record)
    proposed_inputs = updated_data.get("inputs") or updated_data.get("dynamic_field_values") or build_emission_inputs(updated_data)
    
    # Build entity snapshot with both old and proposed values
    entity_snapshot = {
        "scope": existing_record.get("scope"),
        "category": existing_record.get("category"),
        "category_id": existing_record.get("category_id"),
        "sub_category": existing_record.get("sub_category"),
        "fuel_type": existing_record.get("fuel_type"),
        "facility_id": existing_record.get("facility_id"),
        "facility_name": facility.get("name") if facility else None,
        "reporting_period": existing_record.get("reporting_period"),
        "frequency_type": existing_record.get("frequency_type"),
        "total_emissions": existing_record.get("total_emissions"),
        "co2_emissions": existing_record.get("co2_emissions"),
        "ch4_emissions": existing_record.get("ch4_emissions"),
        "n2o_emissions": existing_record.get("n2o_emissions"),
        "co2e_emissions": existing_record.get("co2e_emissions"),
        "inputs": original_inputs,
        "dynamic_field_values": original_inputs,
        "outputs": existing_record.get("outputs"),
        "evidence_url": existing_record.get("evidence_url", ""),
        "has_custom_ef": existing_record.get("is_custom_factor", False),
        "emission_factor_used": existing_record.get("emission_factor"),
        "calculation_method_scope3": existing_record.get("calculation_method_scope3"),
        "scope3_activity": existing_record.get("scope3_activity"),
        "biogenic_scope_selection": existing_record.get("biogenic_scope_selection"),
        # Process info
        "process_names": existing_record.get("process_names", []),
        "process_descriptions": existing_record.get("process_descriptions", []),
        # Responsible person info
        "responsible_person": existing_record.get("responsible_person", ""),
        "responsible_person_designation": existing_record.get("responsible_person_designation", ""),
        "responsible_person_contact": existing_record.get("responsible_person_contact", ""),
        # Source info
        "source_of_information": existing_record.get("source_of_information", ""),
        "notes": existing_record.get("notes"),
        **c7_snapshot_fields(updated_data),
        **extra_snapshot_fields(updated_data),
        # Store original values for comparison
        "original_values": {
            "inputs": original_inputs,
            "outputs": existing_record.get("outputs"),
            "total_emissions": existing_record.get("total_emissions"),
            "co2_emissions": existing_record.get("co2_emissions"),
            "ch4_emissions": existing_record.get("ch4_emissions"),
            "n2o_emissions": existing_record.get("n2o_emissions"),
            "co2e_emissions": existing_record.get("co2e_emissions"),
        },
        # Store proposed changes
        "proposed_changes": {
            "inputs": proposed_inputs,
            "outputs": updated_data.get("outputs"),
        },
        "edit_type": "update",
    }
    
    # Create approval request document
    approval_request = {
        "id": str(uuid.uuid4()),
        "organization_id": org_id,
        "workflow_id": f"assignment_{assignment.get('id')}",
        "workflow_name": f"Emission Update - {existing_record.get('scope')} - {existing_record.get('category')}",
        
        # Entity being approved
        "entity_type": "emission_record",
        "entity_id": existing_record.get("id"),
        "entity_subtype": existing_record.get("scope"),
        "entity_snapshot": entity_snapshot,
        "request_type": "update",
        
        # Submission info
        "submitted_by": user_id,
        "submitted_by_email": current_user.get("email", ""),
        "submitted_by_name": current_user.get("full_name", ""),
        "submitted_at": now,
        "submission_comment": None,
        
        # Current state
        "status": "pending",
        "current_level": start_level,
        "current_approvers": current_approvers,
        "total_levels": total_levels,
        
        # Progress tracking
        "steps_completed": [] if start_level == 1 else [{
            "id": str(uuid.uuid4()), "level": start_level - 1, "level_name": f"Level {start_level - 1}", "action": "approve",
            "actor_id": user_id, "actor_email": current_user.get("email", ""), "actor_name": current_user.get("full_name") or current_user.get("name", ""),
            "comment": f"Edited by the Level {start_level - 1} approver (approved at that level)", "timestamp": now,
        }],
        
        # Metadata
        "created_at": now,
        "updated_at": now,
    }
    
    await db.approval_requests.insert_one(approval_request)
    await sync_emission_request_history(approval_request["id"])
    log_event(logger, logging.INFO, "ghg.emission.update_approval_requested", action="ghg.emission.update", outcome="pending_approval",
              context={"record_id": existing_record.get("id"), "approval_request_id": approval_request.get("id")})


async def update_existing_approval_request(
    request_id: str,
    existing_record: dict,
    updated_data: dict,
    user_id: str,
    current_user: dict,
):
    """
    Update an existing pending approval request with new data (in-place update).
    This allows users to modify their submission while it's still pending review.
    
    For CREATE requests (record not yet approved): Also updates the actual emission_record.
    For UPDATE requests (record already approved): Only updates the snapshot.
    """
    now = datetime.now(timezone.utc).isoformat()
    
    # Get the existing approval request to check request_type
    existing_request = await db.approval_requests.find_one({"id": request_id}, {"_id": 0})
    request_type = existing_request.get("request_type", "create") if existing_request else "create"
    record_id = existing_record.get("id")
    
    # Get facility name for snapshot
    facility = None
    if existing_record.get("facility_id"):
        facility = await db.facilities.find_one(
            {"id": existing_record.get("facility_id")},
            {"_id": 0, "name": 1}
        )
    
    # Build normalized inputs
    original_inputs = build_emission_inputs(existing_record)
    proposed_inputs = updated_data.get("inputs") or updated_data.get("dynamic_field_values") or build_emission_inputs(updated_data)
    
    # Build updated entity snapshot
    updated_snapshot = {
        "scope": existing_record.get("scope"),
        "category": existing_record.get("category"),
        "category_id": existing_record.get("category_id"),
        "sub_category": existing_record.get("sub_category"),
        "fuel_type": existing_record.get("fuel_type"),
        "facility_id": existing_record.get("facility_id"),
        "facility_name": facility.get("name") if facility else None,
        "reporting_period": existing_record.get("reporting_period"),
        "frequency_type": existing_record.get("frequency_type"),
        "total_emissions": updated_data.get("total_emissions") or existing_record.get("total_emissions"),
        "co2_emissions": updated_data.get("co2_emissions") or existing_record.get("co2_emissions"),
        "ch4_emissions": updated_data.get("ch4_emissions") or existing_record.get("ch4_emissions"),
        "n2o_emissions": updated_data.get("n2o_emissions") or existing_record.get("n2o_emissions"),
        "co2e_emissions": updated_data.get("co2e_emissions") or existing_record.get("co2e_emissions"),
        "inputs": proposed_inputs,
        "dynamic_field_values": proposed_inputs,
        "outputs": updated_data.get("outputs") or existing_record.get("outputs"),
        "evidence_url": updated_data.get("evidence_url") or existing_record.get("evidence_url", ""),
        "has_custom_ef": updated_data.get("is_custom_factor", existing_record.get("is_custom_factor", False)),
        "emission_factor_used": updated_data.get("emission_factor") or existing_record.get("emission_factor"),
        "calculation_method_scope3": existing_record.get("calculation_method_scope3"),
        "scope3_activity": existing_record.get("scope3_activity"),
        "biogenic_scope_selection": existing_record.get("biogenic_scope_selection"),
        # Process info
        "process_names": updated_data.get("process_names") or existing_record.get("process_names", []),
        "process_descriptions": updated_data.get("process_descriptions") or existing_record.get("process_descriptions", []),
        # Responsible person info
        "responsible_person": updated_data.get("responsible_person") or existing_record.get("responsible_person", ""),
        "responsible_person_designation": updated_data.get("responsible_person_designation") or existing_record.get("responsible_person_designation", ""),
        "responsible_person_contact": updated_data.get("responsible_person_contact") or existing_record.get("responsible_person_contact", ""),
        # Source info
        "source_of_information": updated_data.get("source_of_information") or existing_record.get("source_of_information", ""),
        "notes": updated_data.get("notes") or existing_record.get("notes"),
        **extra_snapshot_fields({**existing_record, **{k: v for k, v in updated_data.items() if v}}),
        # Store original values for comparison
        "original_values": {
            "inputs": original_inputs,
            "outputs": existing_record.get("outputs"),
            "total_emissions": existing_record.get("total_emissions"),
            "co2_emissions": existing_record.get("co2_emissions"),
            "ch4_emissions": existing_record.get("ch4_emissions"),
            "n2o_emissions": existing_record.get("n2o_emissions"),
            "co2e_emissions": existing_record.get("co2e_emissions"),
        },
        # Store proposed changes
        "proposed_changes": {
            "inputs": proposed_inputs,
            "outputs": updated_data.get("outputs"),
        },
        "edit_type": request_type,  # Preserve original request type
    }
    
    # Update the approval request in-place
    await db.approval_requests.update_one(
        {"id": request_id},
        {"$set": {
            "entity_snapshot": updated_snapshot,
            "submitted_by": user_id,
            "submitted_by_email": current_user.get("email", ""),
            "submitted_by_name": current_user.get("full_name", ""),
            "submitted_at": now,
            "updated_at": now,
        }}
    )
    await sync_emission_request_history(request_id)
    log_event(logger, logging.INFO, "ghg.emission.update_approval_updated", action="ghg.emission.update", outcome="pending_approval",
              context={"approval_request_id": request_id, "record_id": existing_record.get("id")})
    
    # For CREATE requests: Also update the actual record (not yet approved)
    # This ensures that when approved, the record has the latest values
    if request_type == "create" and record_id:
        record_update = {
            "updated_at": now,
            "dynamic_field_values": proposed_inputs,
            "inputs": proposed_inputs,
            "outputs": updated_data.get("outputs") or existing_record.get("outputs"),
            "total_emissions": updated_data.get("total_emissions") or existing_record.get("total_emissions"),
            "co2_emissions": updated_data.get("co2_emissions") or existing_record.get("co2_emissions"),
            "ch4_emissions": updated_data.get("ch4_emissions") or existing_record.get("ch4_emissions"),
            "n2o_emissions": updated_data.get("n2o_emissions") or existing_record.get("n2o_emissions"),
            "co2e_emissions": updated_data.get("co2e_emissions") or existing_record.get("co2e_emissions"),
            "evidence_url": updated_data.get("evidence_url") or existing_record.get("evidence_url", ""),
            "process_names": updated_data.get("process_names") or existing_record.get("process_names", []),
            "process_descriptions": updated_data.get("process_descriptions") or existing_record.get("process_descriptions", []),
            "responsible_person": updated_data.get("responsible_person") or existing_record.get("responsible_person", ""),
            "responsible_person_designation": updated_data.get("responsible_person_designation") or existing_record.get("responsible_person_designation", ""),
            "responsible_person_contact": updated_data.get("responsible_person_contact") or existing_record.get("responsible_person_contact", ""),
            "source_of_information": updated_data.get("source_of_information") or existing_record.get("source_of_information", ""),
            "notes": updated_data.get("notes") or existing_record.get("notes"),
            **extra_snapshot_fields({**existing_record, **{k: v for k, v in updated_data.items() if v}}),
        }
        
        # Also update emission factor if changed
        if updated_data.get("emission_factor"):
            record_update["emission_factor"] = updated_data.get("emission_factor")
        if updated_data.get("is_custom_factor") is not None:
            record_update["is_custom_factor"] = updated_data.get("is_custom_factor")
        
        await db.emission_records.update_one(
            {"id": record_id},
            {"$set": record_update}
        )
        log_event(logger, logging.INFO, "ghg.emission.pending_create.updated", action="ghg.emission.update", outcome="pending_approval",
                  context={"record_id": record_id})




async def request_emission_delete(
    existing: dict, current_user: dict, approver_assignment: Optional[dict] = None, start_level: int = 1,
) -> bool:
    """Send a GHG delete through the assignment's approval chain; the record stays until it is approved.

    An approver's own delete skips the levels up to theirs (start_level). Returns False when no approval is needed."""
    assignment = approver_assignment
    if not assignment:
        try:
            assignment = await find_emission_assignment(
                org_id=existing.get("organization_id"), user_id=current_user["id"],
                scope=existing.get("scope"), facility_id=existing.get("facility_id"))
        except Exception:
            return False
    if not assignment_requires_approval(assignment):
        return False
    chain = normalize_chain(assignment)
    if not chain:
        return False
    record_id = existing.get("id")
    now = datetime.now(timezone.utc).isoformat()
    previous_status = existing.get("approval_status") or "approved"
    level = clamp_level(chain, start_level)
    await db.approval_requests.insert_one({
        "id": str(uuid.uuid4()),
        "organization_id": existing.get("organization_id"),
        "workflow_id": f"assignment_{assignment.get('id')}",
        "workflow_name": f"Emission Delete Approval - {existing.get('scope')} - {existing.get('category')}",
        "entity_type": "emission_record",
        "entity_id": record_id,
        "entity_subtype": existing.get("scope"),
        "entity_snapshot": {
            "scope": existing.get("scope"), "category": existing.get("category"), "facility_id": existing.get("facility_id"),
            "reporting_period": existing.get("reporting_period"), "total_emissions": existing.get("total_emissions"),
            "previous_approval_status": previous_status,
        },
        "request_type": "delete",
        "submitted_by": current_user["id"],
        "submitted_by_email": current_user.get("email", ""),
        "submitted_by_name": current_user.get("full_name", ""),
        "submitted_at": now,
        "submission_comment": "Deletion requested",
        "status": "pending", "current_level": level, "current_approvers": [chain[level - 1]],
        "total_levels": len(chain), "approval_chain": chain,
        "steps_completed": [], "created_at": now, "updated_at": now,
    })
    await db[APPROVED_COLLECTION].update_one({"id": record_id}, {"$set": {
        "approval_status": STATUS_PENDING_DELETE, "previous_approval_status": previous_status}})
    await db.emission_history.insert_one({
        "id": str(uuid.uuid4()), "emission_id": record_id, "facility_id": existing.get("facility_id"),
        "organization_id": existing.get("organization_id"), "scope": existing.get("scope"), "category": existing.get("category"),
        "changed_by": current_user["id"], "changed_by_email": current_user.get("email", ""),
        "changed_by_name": current_user.get("full_name", ""), "changed_at": now,
        "version": existing.get("version") or 1, "field_changes": [], "changes_summary": "Deletion Requested",
        "changes": {"action": "requested", "request_type": "delete"},
    })
    return True
