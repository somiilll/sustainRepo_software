"""
Emissions read/list/write router.

Phase B4 added: GET /emissions, GET /emissions/{id}/history, DELETE /emissions/{id}.
Phase B5 added: POST /emissions, PUT /emissions/{id}.

V2: Refactored to use emission_flow_v2 with simplified pending_records architecture.
"""
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from audit_logger import AuditAction, AuditModule, get_audit_logger
from modules.approvals.emission_flow_v2 import (
    APPROVED_COLLECTION,
    PENDING_COLLECTION,
    find_record,
    intercept_create as approval_intercept_create,
    intercept_delete as approval_intercept_delete,
    intercept_update as approval_intercept_update,
    fetch_emissions_for_user,
    STATUS_PENDING_UPDATE,
    STATUS_PENDING_DELETE,
    PENDING_STATUSES,
)
from modules.auth.dependencies import get_current_user
from modules.emissions.contracts import (
    EmissionHistoryResponse,
    EmissionRecordCreate,
    EmissionRecordResponse,
)
from shared.database.mongo import db
from shared.helpers.audit_helpers import compute_field_changes, get_input_label_map_from_db

logger = logging.getLogger(__name__)

router = APIRouter()


async def _mark_emission_task_completed(
    organization_id: str,
    facility_id: str,
    scope: str,
    reporting_period: str,
    user_id: str,
) -> dict:
    """
    DEPRECATED: Task status is now computed on-the-fly by CompletionService.
    
    This function is kept as a no-op for backward compatibility during the transition.
    Task status should NOT be stored/synced - it's derived from actual data existence.
    
    The CompletionService.get_task_status() method computes status in real-time by
    checking if emission_records exist for the given org/facility/scope/period.
    """
    logger.debug(f"[TASK_COMPLETION] Skipped (status now computed): org={organization_id}, scope={scope}, period={reporting_period}")
    return {"updated": False, "reason": "Task status is now computed on-the-fly by CompletionService"}


# Module-level audit logger reference. Resolved lazily so it picks up the
# instance initialized by server.py on app startup.
def _audit_logger():
    return get_audit_logger()


# Legacy server.py routes referenced `audit_logger` directly. We provide a
# small alias so the byte-identical handler bodies still work.
class _AuditLoggerProxy:
    def __getattr__(self, name):
        return getattr(get_audit_logger(), name)


audit_logger = _AuditLoggerProxy()


@router.post("/emissions", response_model=EmissionRecordResponse)
async def create_emission_record(record_data: EmissionRecordCreate, current_user: dict = Depends(get_current_user)):
    logger.info(f"[EMISSION_CREATE] Starting: user={current_user.get('email')}, facility={record_data.facility_id}, scope={record_data.scope}, category={record_data.category}")
    
    facility = await db.facilities.find_one({"id": record_data.facility_id}, {"_id": 0})
    if not facility:
        logger.warning(f"[EMISSION_CREATE] Facility not found: {record_data.facility_id}")
        raise HTTPException(status_code=404, detail="Facility not found")
    
    org_id = facility.get("organization_id")
    user_id = current_user.get("id")
    user_role = current_user.get("role", "user")
    
    # Admin org check
    if user_role == "admin" and org_id != current_user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # KPI Assignment-based access control (admins bypass)
    if user_role not in ["admin", "super_admin"]:
        from modules.esg_assignments.kpi_access_helper import kpi_access_helper
        can_access, reason = await kpi_access_helper.can_access_emission(
            user_id=user_id,
            organization_id=org_id,
            scope=record_data.scope.lower() if record_data.scope else "",
            facility_id=record_data.facility_id,
            reporting_period=record_data.reporting_period,
        )
        if not can_access:
            logger.warning(f"[EMISSION_CREATE] Access denied: user={user_id}, reason={reason}")
            raise HTTPException(
                status_code=403,
                detail=f"You don't have access to create {record_data.scope} emissions for this facility. Check your KPI assignments."
            )
    
    # Validate frequency_type
    frequency_type = record_data.frequency_type or "monthly"
    if frequency_type not in ["monthly", "yearly"]:
        raise HTTPException(status_code=400, detail="frequency_type must be 'monthly' or 'yearly'")
    
    # Validate reporting_period format based on frequency_type
    reporting_period = record_data.reporting_period
    if frequency_type == "yearly":
        # Yearly format: "CY2025" or "FY 2025-2026"
        if not (reporting_period.startswith("CY") or reporting_period.startswith("FY ")):
            raise HTTPException(
                status_code=400, 
                detail="For yearly frequency, reporting_period must be in format 'CY2025' or 'FY 2025-2026'"
            )
        
        # Note: We no longer block duplicate yearly records - users can add multiple entries
        # for the same category/subcategory/year if needed
    else:
        # Monthly format: "2025-03"
        import re
        if not re.match(r'^\d{4}-\d{2}$', reporting_period):
            raise HTTPException(
                status_code=400,
                detail="For monthly frequency, reporting_period must be in format 'YYYY-MM' (e.g., '2025-03')"
            )
    
    # Check organization's enabled_access for emissions
    organization = await db.organizations.find_one({"id": facility["organization_id"]}, {"_id": 0})
    if organization:
        enabled_access = organization.get("enabled_access")
        # If enabled_access is None, default to scope1_2. If it's an empty list, no access.
        if enabled_access is None:
            enabled_access = ["scope1_2"]
        # Check if organization has access to create emissions (scope1_2 or scope1_2_3 allows Scope 1, 2, biogenic)
        has_emission_access = any(access in enabled_access for access in ["scope1_2", "scope1_2_3"])
        if not has_emission_access:
            raise HTTPException(
                status_code=403, 
                detail="Your organization does not have access to add emissions. Please contact your administrator."
            )
    
    record_dict = record_data.model_dump()
    record_id = str(uuid.uuid4())
    record_dict["id"] = record_id
    record_dict["created_by"] = current_user["id"]
    record_dict["created_by_email"] = current_user.get("email", "")
    record_dict["created_by_name"] = current_user.get("full_name", "")
    
    # For Scope 3 emissions: sync sub_category with scope3_activity
    if record_data.scope and 'scope3' in record_data.scope.lower():
        # Check if scope3_activity is provided (either directly or in dynamic_field_values)
        scope3_activity = record_data.scope3_activity
        if not scope3_activity and record_data.dynamic_field_values:
            scope3_act_field = record_data.dynamic_field_values.get('scope3_activity', {})
            if isinstance(scope3_act_field, dict):
                scope3_activity = scope3_act_field.get('value')
        
        # Update sub_category to match scope3_activity if activity is set
        if scope3_activity:
            record_dict["sub_category"] = scope3_activity
    
    # ALWAYS ensure organization_id is set (from facility if not provided)
    if not record_dict.get("organization_id"):
        facility = await db.facilities.find_one({"id": record_data.facility_id}, {"_id": 0, "organization_id": 1})
        if facility and facility.get("organization_id"):
            record_dict["organization_id"] = facility["organization_id"]
        else:
            record_dict["organization_id"] = current_user.get("organization_id")
    
    # Extract emission values from outputs dict for convenience accessors
    outputs = record_data.outputs or {}
    record_dict["co2_emissions"] = outputs.get("co2", {}).get("value", 0) or 0
    record_dict["ch4_emissions"] = outputs.get("ch4", {}).get("value", 0) or 0
    record_dict["n2o_emissions"] = outputs.get("n2o", {}).get("value", 0) or 0
    record_dict["co2e_emissions"] = outputs.get("co2e", {}).get("value", 0) or 0
    record_dict["total_emissions"] = record_dict["co2e_emissions"]
    
    created_at = datetime.now(timezone.utc).isoformat()
    record_dict["created_at"] = created_at
    record_dict["updated_at"] = None
    record_dict["updated_by"] = None
    record_dict["updated_by_email"] = None
    record_dict["updated_by_name"] = None
    
    # V2 Approval workflow gate.
    # Returns ("apply", None) → continue creating in emission_records (admin / workflow off).
    # Returns ("queue", pending_record) → record was inserted into pending_records, we early-return.
    approval_action, pending_record = await approval_intercept_create(
        record_dict, record_dict["organization_id"], current_user
    )
    if approval_action == "queue" and pending_record:
        # Audit the submission attempt, then return the pending record.
        await audit_logger.log(
            action=AuditAction.CREATE,
            module=AuditModule.EMISSION,
            user_id=current_user["id"],
            user_email=current_user["email"],
            user_role=current_user.get("role", "user"),
            organization_id=pending_record.get("organization_id"),
            resource_id=pending_record.get("id"),
            resource_name=f"{record_data.scope} - {record_data.category} ({record_data.reporting_period})",
            description=f"Submitted emission record for approval ({record_data.category})",
            new_values=pending_record,
            metadata={
                "scope": record_data.scope,
                "category": record_data.category,
                "facility_id": record_data.facility_id,
                "approval_status": pending_record.get("approval_status"),
            },
        )
        logger.info(f"[EMISSION_CREATE] Submitted for approval: record_id={pending_record.get('id')}")
        return EmissionRecordResponse(**pending_record)
    
    await db.emission_records.insert_one(record_dict)
    logger.info(f"[EMISSION_CREATE] Saved directly: record_id={record_dict.get('id')}, co2e={record_dict.get('total_emissions')}")
    
    # Phase B11: emit emission.saved (best-effort; never break write path).
    try:
        from events.event_bus import event_bus, Events
        event_bus.emit_nowait(Events.EMISSION_SAVED, {
            "record_id": record_dict.get("id"),
            "scope": record_data.scope,
            "category": record_data.category,
            "facility_id": record_data.facility_id,
            "organization_id": record_dict.get("organization_id"),
            "user_id": current_user.get("id"),
        })
    except Exception:
        pass
    
    # AUTO-SYNC: Update base year emissions if a base year record exists for this facility
    # This ensures new scope+category combinations are automatically added to base year
    try:
        facility_id = record_data.facility_id
        org_id = record_dict.get("organization_id")
        scope = record_data.scope.lower() if record_data.scope else ""
        
        # Determine scope_group based on the emission's scope
        if scope in ["scope1", "scope2"] or (scope == "biogenic" and record_data.biogenic_scope_selection != "scope3"):
            scope_group = "scope12"
        else:
            scope_group = "scope3"
        
        # For Scope 3, use scope3_activity as subcategory; otherwise use sub_category
        if "scope3" in scope:
            subcategory = record_data.scope3_activity or record_data.sub_category or ""
        else:
            subcategory = record_data.sub_category or ""
        
        # Check if base year record exists for this facility
        base_year_record = await db.base_year_emissions.find_one({
            "facility_id": facility_id,
            "scope_group": scope_group
        }, {"_id": 0, "id": 1, "base_year": 1, "emissions_data": 1, "version": 1, "version_history": 1})
        
        if base_year_record:
            # Check if this scope+category combination already exists
            existing_keys = set()
            for e in base_year_record.get("emissions_data", []):
                key = f"{e.get('scope', '')}|{e.get('category', '')}|{e.get('subcategory', '')}"
                existing_keys.add(key)
            
            new_key = f"{record_data.scope}|{record_data.category}|{subcategory}"
            
            if new_key not in existing_keys:
                # Add the new combination to base year emissions_data
                new_entry = {
                    "scope": record_data.scope,
                    "category": record_data.category,
                    "subcategory": subcategory,
                    "tco2e": record_dict.get("total_emissions", 0) or 0,
                    "isAutoAdded": True
                }
                
                updated_emissions = base_year_record.get("emissions_data", []) + [new_entry]
                
                # Update version history
                current_version = base_year_record.get("version", 1)
                version_history = base_year_record.get("version_history", [])
                version_history.append({
                    "version": current_version + 1,
                    "change_type": "auto_add_category",
                    "added_entries": [new_entry],
                    "changed_by_name": current_user.get("full_name", current_user.get("email", "")),
                    "changed_at": datetime.now(timezone.utc).isoformat(),
                    "change_reason": f"Auto-added from new GHG emission: {record_data.category}"
                })
                
                await db.base_year_emissions.update_one(
                    {"id": base_year_record["id"]},
                    {"$set": {
                        "emissions_data": updated_emissions,
                        "version": current_version + 1,
                        "version_history": version_history,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                        "updated_by": current_user.get("email"),
                        "updated_by_name": current_user.get("full_name", "")
                    }}
                )
        
        # Also check organization-level base year record
        if org_id:
            org_base_year = await db.base_year_emissions.find_one({
                "organization_id": org_id,
                "facility_id": None,
                "scope_group": scope_group
            }, {"_id": 0, "id": 1, "base_year": 1, "emissions_data": 1, "version": 1, "version_history": 1})
            
            if org_base_year:
                existing_keys = set()
                for e in org_base_year.get("emissions_data", []):
                    key = f"{e.get('scope', '')}|{e.get('category', '')}|{e.get('subcategory', '')}"
                    existing_keys.add(key)
                
                new_key = f"{record_data.scope}|{record_data.category}|{subcategory}"
                
                if new_key not in existing_keys:
                    new_entry = {
                        "scope": record_data.scope,
                        "category": record_data.category,
                        "subcategory": subcategory,
                        "tco2e": record_dict.get("total_emissions", 0) or 0,
                        "isAutoAdded": True
                    }
                    
                    updated_emissions = org_base_year.get("emissions_data", []) + [new_entry]
                    current_version = org_base_year.get("version", 1)
                    version_history = org_base_year.get("version_history", [])
                    version_history.append({
                        "version": current_version + 1,
                        "change_type": "auto_add_category",
                        "added_entries": [new_entry],
                        "changed_by_name": current_user.get("full_name", current_user.get("email", "")),
                        "changed_at": datetime.now(timezone.utc).isoformat(),
                        "change_reason": f"Auto-added from new GHG emission: {record_data.category}"
                    })
                    
                    await db.base_year_emissions.update_one(
                        {"id": org_base_year["id"]},
                        {"$set": {
                            "emissions_data": updated_emissions,
                            "version": current_version + 1,
                            "version_history": version_history,
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                            "updated_by": current_user.get("email"),
                            "updated_by_name": current_user.get("full_name", "")
                        }}
                    )
    except Exception as e:
        # Don't fail the emission creation if base year sync fails
        print(f"Warning: Base year auto-sync failed: {e}")
    
    # Create initial version history entry for creation
    # Include both input data and calculated emission values for proper history display
    history_new_values = record_data.model_dump()
    # Add the calculated/stored emission fields that the frontend expects in history
    history_new_values["co2_emissions"] = record_dict["co2_emissions"]
    history_new_values["ch4_emissions"] = record_dict["ch4_emissions"]
    history_new_values["n2o_emissions"] = record_dict["n2o_emissions"]
    history_new_values["co2e_emissions"] = record_dict["co2e_emissions"]
    history_new_values["total_emissions"] = record_dict["total_emissions"]
    
    if True:
        creation_history = {
            "id": str(uuid.uuid4()),
            "emission_id": record_id,
            "facility_id": record_data.facility_id,
            "organization_id": record_dict["organization_id"],
            "changed_by": current_user["id"],
            "changed_by_email": current_user.get("email", ""),
            "changed_by_name": current_user.get("full_name", ""),
            "changed_at": created_at,
            "changes": {
                "action": "created",
                "old_values": None,
                "new_values": history_new_values
            }
        }
        await db.emission_history.insert_one(creation_history)
    
    # Audit log
    await audit_logger.log(
        action=AuditAction.CREATE,
        module=AuditModule.EMISSION,
        user_id=current_user["id"],
        user_email=current_user["email"],
        user_role=current_user.get("role", "user"),
        organization_id=record_dict["organization_id"],
        resource_id=record_id,
        resource_name=f"{record_data.scope} - {record_data.category} ({record_data.reporting_period})",
        description=f"Created emission record for {record_data.category}",
        new_values=record_dict,
        metadata={
            "scope": record_data.scope,
            "category": record_data.category,
            "facility_id": record_data.facility_id,
            "total_emissions": record_dict["total_emissions"]
        }
    )
    
    # Update assignment completion status (best-effort)
    try:
        from modules.esg_assignments.completion_tracking import completion_tracking_service
        # Map scope to subcategory for completion tracking
        scope_to_subcategory = {
            "scope1": "GHG Emissions - Scope 1",
            "scope2": "GHG Emissions - Scope 2",
            "scope3": "GHG Emissions - Scope 3",
            "biogenic": "GHG Emissions - Biogenic (Direct)",
        }
        subcategory = scope_to_subcategory.get(record_data.scope.lower() if record_data.scope else "", None)
        await completion_tracking_service.on_record_submitted(
            organization_id=record_dict["organization_id"],
            category="GHG Emissions",
            facility_id=record_data.facility_id,
            subcategory=subcategory,
            reporting_period=record_data.reporting_period,
        )
    except Exception as e:
        logger.warning(f"[EMISSION_CREATE] Completion tracking failed: {e}")
    
    # Mark corresponding task as completed (best-effort)
    try:
        task_result = await _mark_emission_task_completed(
            organization_id=record_dict["organization_id"],
            facility_id=record_data.facility_id,
            scope=record_data.scope,
            reporting_period=record_data.reporting_period,
            user_id=current_user.get("id"),
        )
        if task_result.get("updated"):
            logger.info(f"[EMISSION_CREATE] Task marked completed: {task_result}")
    except Exception as e:
        logger.warning(f"[EMISSION_CREATE] Task completion failed: {e}")
    
    return EmissionRecordResponse(**record_dict)

# Phase B4: GET /emissions moved to modules/emissions/router.py


@router.put("/emissions/{record_id}", response_model=EmissionRecordResponse)
async def update_emission_record(
    record_id: str,
    record_data: EmissionRecordCreate,
    current_user: dict = Depends(get_current_user)
):
    logger.info(f"[EMISSION_UPDATE] Starting: record_id={record_id}, user={current_user.get('email')}")
    
    # Find record - checks pending first
    existing, source_collection = await find_record(record_id)
    
    # Also check if there's a pending record for this original_record_id
    if not existing:
        pending = await db[PENDING_COLLECTION].find_one(
            {"original_record_id": record_id},
            {"_id": 0}
        )
        if pending:
            existing = pending
            source_collection = PENDING_COLLECTION
            record_id = pending["id"]  # Use the pending record's ID
    
    if not existing:
        raise HTTPException(status_code=404, detail="Emission record not found")
    
    # Approval-workflow gate
    payload_dict = record_data.model_dump()
    approval_action, approval_result = await approval_intercept_update(
        record_id, payload_dict, current_user
    )
    
    if approval_action == "block":
        raise HTTPException(status_code=403, detail=approval_result or "Not authorized")
    if approval_action == "queue":
        # Return the pending record
        return EmissionRecordResponse(**approval_result) if approval_result else EmissionRecordResponse(**existing)
    
    # Direct apply (admin or workflow disabled)
    # Prevent changing frequency_type once saved
    existing_frequency = existing.get("frequency_type", "monthly")
    new_frequency = record_data.frequency_type or "monthly"
    if existing_frequency != new_frequency:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot change frequency_type from '{existing_frequency}' to '{new_frequency}'. Delete and recreate the record if needed."
        )
    
    update_dict = record_data.model_dump(exclude_unset=True)
    # Ensure frequency_type is preserved
    update_dict["frequency_type"] = existing_frequency
    
    # For Scope 3 emissions: sync sub_category with scope3_activity when activity changes
    if record_data.scope and 'scope3' in record_data.scope.lower():
        # Check if scope3_activity is provided (either directly or in dynamic_field_values)
        scope3_activity = record_data.scope3_activity
        if not scope3_activity and record_data.dynamic_field_values:
            scope3_act_field = record_data.dynamic_field_values.get('scope3_activity', {})
            if isinstance(scope3_act_field, dict):
                scope3_activity = scope3_act_field.get('value')
        
        # Update sub_category to match scope3_activity if activity is set
        if scope3_activity:
            update_dict["sub_category"] = scope3_activity
    
    # Extract emission values from outputs dict for convenience accessors
    outputs = record_data.outputs or {}
    update_dict["co2_emissions"] = outputs.get("co2", {}).get("value", 0) or 0
    update_dict["ch4_emissions"] = outputs.get("ch4", {}).get("value", 0) or 0
    update_dict["n2o_emissions"] = outputs.get("n2o", {}).get("value", 0) or 0
    update_dict["co2e_emissions"] = outputs.get("co2e", {}).get("value", 0) or 0
    update_dict["total_emissions"] = update_dict["co2e_emissions"]
    
    # Prepare new_values for history with proper emission field names
    history_new_values = record_data.model_dump()
    history_new_values["co2_emissions"] = update_dict["co2_emissions"]
    history_new_values["ch4_emissions"] = update_dict["ch4_emissions"]
    history_new_values["n2o_emissions"] = update_dict["n2o_emissions"]
    history_new_values["co2e_emissions"] = update_dict["co2e_emissions"]
    history_new_values["total_emissions"] = update_dict["total_emissions"]
    
    # Look up activity names if scope3_ef_id changed (for version history display)
    old_scope3_ef_id = existing.get("scope3_ef_id")
    new_scope3_ef_id = history_new_values.get("scope3_ef_id")
    if old_scope3_ef_id != new_scope3_ef_id:
        # Look up old activity name
        if old_scope3_ef_id:
            old_ef = await db.scope3_ef.find_one({"id": old_scope3_ef_id}, {"_id": 0, "activity": 1, "name": 1})
            if old_ef:
                existing["activity_name"] = old_ef.get("activity") or old_ef.get("name") or old_scope3_ef_id
        # Look up new activity name
        if new_scope3_ef_id:
            new_ef = await db.scope3_ef.find_one({"id": new_scope3_ef_id}, {"_id": 0, "activity": 1, "name": 1})
            if new_ef:
                history_new_values["activity_name"] = new_ef.get("activity") or new_ef.get("name") or new_scope3_ef_id
    
    # Fetch input labels from DB for field change display
    input_label_map = await get_input_label_map_from_db(db)
    
    # Compute field-level changes for better tracking (#3 - Version History)
    field_changes = compute_field_changes(existing, history_new_values, input_label_map=input_label_map)

    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_dict["updated_by"] = current_user["id"]
    update_dict["updated_by_email"] = current_user.get("email", "")
    update_dict["updated_by_name"] = current_user.get("full_name", "")
    update_dict["version"] = existing.get("version", 0) + 1

    # ─── Admin auto-approve ──────────────────────────────────────────────
    # When an admin / super_admin edits a record that currently lives in
    # pending_records, treat the save as "edit + approve". The admin's
    # changes are persisted to the pending doc first, then approve_request
    # promotes it to emission_records and flushes history to
    # emission_history (single source of truth).
    if (
        source_collection == PENDING_COLLECTION
        and current_user.get("role") in ("admin", "super_admin")
    ):
        from modules.approvals.emission_flow_v2 import approve_request

        # Snapshot the pending record BEFORE applying admin's edits so we
        # can compute the admin's diff alone (vs the user's proposed values).
        pre_admin_pending = await db[PENDING_COLLECTION].find_one(
            {"id": record_id}, {"_id": 0}
        )

        await db[PENDING_COLLECTION].update_one(
            {"id": record_id},
            {"$set": update_dict},
        )
        pending_doc = await db[PENDING_COLLECTION].find_one({"id": record_id}, {"_id": 0})
        original_id = (pending_doc or {}).get("original_record_id")

        # admin_field_changes = ONLY what the admin changed during approval.
        admin_diff: List[dict] = []
        if pre_admin_pending and pending_doc:
            admin_diff = compute_field_changes(pre_admin_pending, pending_doc, input_label_map=input_label_map) or []

        ok, message = await approve_request(
            record_id, current_user, admin_field_changes=admin_diff,
        )
        if not ok:
            raise HTTPException(status_code=400, detail=message)
        approved_id = original_id or record_id
        approved = await db[APPROVED_COLLECTION].find_one({"id": approved_id}, {"_id": 0})
        if not approved:
            raise HTTPException(status_code=500, detail="Approved record not found after auto-approve")

        await audit_logger.log(
            action=AuditAction.UPDATE,
            module=AuditModule.EMISSION,
            user_id=current_user["id"],
            user_email=current_user["email"],
            user_role=current_user.get("role", "user"),
            organization_id=approved.get("organization_id"),
            resource_id=approved_id,
            resource_name=f"{record_data.scope} - {record_data.category} ({record_data.reporting_period})",
            description=(
                f"Admin edited & auto-approved pending request for {record_data.category}"
            ),
            old_values=existing,
            new_values=approved,
            metadata={
                "scope": record_data.scope,
                "category": record_data.category,
                "facility_id": record_data.facility_id,
                "total_emissions": approved.get("total_emissions"),
                "auto_approved": True,
            },
        )

        try:
            from events.event_bus import event_bus, Events
            event_bus.emit_nowait(Events.EMISSION_UPDATED, {
                "record_id": approved_id,
                "scope": record_data.scope,
                "category": record_data.category,
                "facility_id": record_data.facility_id,
                "organization_id": approved.get("organization_id"),
                "user_id": current_user.get("id"),
                "auto_approved": True,
            })
        except Exception:
            pass

        return EmissionRecordResponse(**approved)

    # ─── Normal direct-apply path (approved record edit by admin, or
    #     legacy admin direct update) ──────────────────────────────────
    # Save version history entry for this update with detailed field changes
    history_dict = {
        "id": str(uuid.uuid4()),
        "emission_id": record_id,
        "facility_id": existing.get("facility_id"),
        "organization_id": existing.get("organization_id"),
        "scope": existing.get("scope"),
        "category": existing.get("category"),
        "changed_by": current_user["id"],
        "changed_by_email": current_user.get("email", ""),
        "changed_by_name": current_user.get("full_name", ""),
        "changed_at": datetime.now(timezone.utc).isoformat(),
        "version": existing.get("version", 0) + 1,
        "field_changes": field_changes,
        "changes_summary": f"{len(field_changes)} field(s) changed",
        "changes": {
            "action": "updated",
            "old_values": existing,
            "new_values": history_new_values
        }
    }
    await db.emission_history.insert_one(history_dict)

    # Determine target collection - if source was pending, update there; otherwise approved
    target_collection = source_collection or APPROVED_COLLECTION
    await db[target_collection].update_one({"id": record_id}, {"$set": update_dict})
    updated = await db[target_collection].find_one({"id": record_id}, {"_id": 0})

    # Phase B11: emit emission.updated (best-effort).
    # Skip when we wrote to the pending collection — no approved data changed.
    if target_collection == APPROVED_COLLECTION:
        try:
            from events.event_bus import event_bus, Events
            event_bus.emit_nowait(Events.EMISSION_UPDATED, {
                "record_id": record_id,
                "scope": record_data.scope,
                "category": record_data.category,
                "facility_id": record_data.facility_id,
                "organization_id": existing.get("organization_id"),
                "user_id": current_user.get("id"),
            })
        except Exception:
            pass
    
    # Audit log
    await audit_logger.log(
        action=AuditAction.UPDATE,
        module=AuditModule.EMISSION,
        user_id=current_user["id"],
        user_email=current_user["email"],
        user_role=current_user.get("role", "user"),
        organization_id=existing.get("organization_id"),
        resource_id=record_id,
        resource_name=f"{record_data.scope} - {record_data.category} ({record_data.reporting_period})",
        description=f"Updated emission record for {record_data.category}",
        old_values=existing,
        new_values=update_dict,
        metadata={
            "scope": record_data.scope,
            "category": record_data.category,
            "facility_id": record_data.facility_id,
            "total_emissions": update_dict["total_emissions"]
        }
    )
    
    return EmissionRecordResponse(**updated)


@router.get("/emissions", response_model=List[EmissionRecordResponse])
async def get_emission_records(
    facility_id: Optional[str] = None,
    reporting_period: Optional[str] = None,
    scope: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    query = {}
    org_id = current_user.get("organization_id")
    user_id = current_user.get("id")
    user_role = current_user.get("role", "user")
    
    if facility_id:
        query["facility_id"] = facility_id
    if reporting_period:
        query["reporting_period"] = reporting_period
    if scope:
        query["scope"] = scope

    # Use the new fetch_emissions_for_user which combines approved + pending
    records = await fetch_emissions_for_user(current_user, query)
    
    # KPI Assignment-based filtering (admins bypass)
    if user_role not in ["admin", "super_admin"]:
        from modules.esg_assignments.kpi_access_helper import kpi_access_helper
        records = await kpi_access_helper.filter_emissions_by_access(
            user_id=user_id,
            organization_id=org_id,
            records=records,
            reporting_period=reporting_period,
        )
    
    # Filter out biogenic records from non-biogenic scope tabs
    # Biogenic records should ONLY appear in the biogenic tab
    if scope and scope != "biogenic":
        records = [r for r in records if r.get("scope") != "biogenic"]
    
    # Filter out rejected records for regular users (admins can see them)
    if user_role == "user":
        from modules.approvals.emission_flow_v2 import REJECTED_STATUSES
        records = [r for r in records if r.get("approval_status") not in REJECTED_STATUSES]
    
    # Filter out biogenic records with biogenic_scope_selection='scope3' for orgs without scope3 access
    if user_role != "super_admin" and org_id:
        organization = await db.organizations.find_one({"id": org_id}, {"_id": 0, "enabled_access": 1})
        enabled_access = organization.get("enabled_access") if organization else None
        if enabled_access is None:
            enabled_access = ["scope1_2"]
        
        has_scope3_access = "scope1_2_3" in enabled_access
        if not has_scope3_access:
            records = [
                r for r in records
                if not (r.get("scope") == "biogenic" and r.get("biogenic_scope_selection") == "scope3")
            ]

    # Batch-resolve display names for created_by / updated_by ids.
    user_ids = set()
    for r in records:
        if r.get("created_by"):
            user_ids.add(r["created_by"])
        if r.get("updated_by"):
            user_ids.add(r["updated_by"])

    user_map = {}
    if user_ids:
        users = await db.users.find(
            {"id": {"$in": list(user_ids)}},
            {"_id": 0, "id": 1, "full_name": 1, "email": 1},
        ).to_list(1000)
        user_map = {u["id"]: u for u in users}

    for r in records:
        if r.get("created_by") and not r.get("created_by_name"):
            user = user_map.get(r["created_by"])
            if user:
                r["created_by_name"] = user.get("full_name", "")
                if not r.get("created_by_email"):
                    r["created_by_email"] = user.get("email", "")
        if r.get("updated_by") and not r.get("updated_by_name"):
            user = user_map.get(r["updated_by"])
            if user:
                r["updated_by_name"] = user.get("full_name", "")
                if not r.get("updated_by_email"):
                    r["updated_by_email"] = user.get("email", "")

    return [EmissionRecordResponse(**r) for r in records]


@router.get("/emissions/{record_id}", response_model=EmissionRecordResponse)
async def get_emission_record(record_id: str, current_user: dict = Depends(get_current_user)):
    """Fetch a single emission record from pending_records OR emission_records.
    
    Checks pending_records first so users see their latest submitted values.
    Also checks for pending records by original_record_id for update/delete requests.
    """
    # First try to find by ID (checks pending first)
    record, source = await find_record(record_id)
    
    # If not found, check if there's a pending record for this original_record_id
    if not record:
        pending = await db[PENDING_COLLECTION].find_one(
            {"original_record_id": record_id},
            {"_id": 0}
        )
        if pending:
            record = pending
    
    if not record:
        raise HTTPException(status_code=404, detail="Emission record not found")

    # Role-based access check
    role = current_user.get("role")
    if role == "super_admin":
        pass
    elif role == "admin":
        # Admin can access their org's records
        org_id = current_user.get("organization_id")
        record_org = record.get("organization_id")
        # Also check facility's org if record doesn't have org_id
        if not record_org:
            fac = await db.facilities.find_one({"id": record.get("facility_id")}, {"_id": 0, "organization_id": 1})
            record_org = fac.get("organization_id") if fac else None
        if record_org and record_org != org_id:
            raise HTTPException(status_code=403, detail="Not authorized")
    else:  # regular user - use KPI access control
        from modules.esg_assignments.kpi_access_helper import kpi_access_helper
        can_access, reason = await kpi_access_helper.can_access_emission(
            user_id=current_user.get("id"),
            organization_id=current_user.get("organization_id"),
            scope=record.get("scope", "").lower(),
            facility_id=record.get("facility_id"),
            reporting_period=record.get("reporting_period"),
        )
        # Also allow users to access their own pending records
        is_own_pending = (
            record.get("approval_status", "approved") != "approved"
            and record.get("submitted_by") == current_user.get("id")
        )
        if not can_access and not is_own_pending:
            raise HTTPException(status_code=403, detail="Not authorized")

    return EmissionRecordResponse(**record)


@router.get("/emissions/{record_id}/history", response_model=List[EmissionHistoryResponse])
async def get_emission_history(record_id: str, current_user: dict = Depends(get_current_user)):
    """Get version history for an emission record.

    History is the single source of truth in `db.emission_history`.
    - Admin direct create/update writes one doc per change.
    - Approved-from-pending flow flushes all `pending_records` lifecycle
      entries (edit_history + version_history + approval entry) to this
      collection on approval.

    Embedded `version_history` on the record (if any) is treated as a
    legacy fallback for records approved before this change.
    """
    history: List[dict] = []

    # Primary source: emission_history collection.
    rows = await db.emission_history.find(
        {"emission_id": record_id},
        {"_id": 0},
    ).sort("changed_at", -1).to_list(1000)

    for entry in rows:
        # Backfill display names if missing.
        if entry.get("changed_by") and not entry.get("changed_by_email"):
            user = await db.users.find_one(
                {"id": entry["changed_by"]},
                {"_id": 0, "email": 1, "full_name": 1},
            )
            if user:
                entry["changed_by_email"] = user.get("email", "Unknown User")
                entry["changed_by_name"] = user.get("full_name", "")
        history.append(entry)

    # Legacy fallback — if collection is empty for this record, surface any
    # embedded version_history that pre-dates the flush-on-approve change.
    if not history:
        record, _ = await find_record(record_id)
        if not record:
            pending = await db[PENDING_COLLECTION].find_one(
                {"original_record_id": record_id},
                {"_id": 0},
            )
            if pending:
                record = pending

        for entry in (record or {}).get("version_history", []) or []:
            history.append({
                "id": entry.get("id", str(uuid.uuid4())),
                "emission_id": record_id,
                "changed_by": entry.get("changed_by"),
                "changed_by_email": entry.get("changed_by_email", ""),
                "changed_by_name": entry.get("changed_by_name", ""),
                "changed_at": entry.get("changed_at"),
                "version": entry.get("version"),
                "scope": record.get("scope"),
                "category": record.get("category"),
                "field_changes": entry.get("field_changes"),
                "changes_summary": entry.get("changes_summary"),
                "changes": {
                    "action": entry.get("action", "updated"),
                    "old_values": None,
                    "new_values": None,
                },
                "approved_by": entry.get("approved_by"),
                "approved_by_email": entry.get("approved_by_email"),
                "approved_by_name": entry.get("approved_by_name"),
                "approved_at": entry.get("approved_at"),
            })

    history.sort(key=lambda x: x.get("changed_at", ""), reverse=True)

    return [EmissionHistoryResponse(**h) for h in history]


@router.delete("/emissions/{record_id}")
async def delete_emission_record(record_id: str, current_user: dict = Depends(get_current_user)):
    existing, source_collection = await find_record(record_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Emission record not found")

    # Approval-workflow gate
    delete_action, delete_payload = await approval_intercept_delete(record_id, current_user)
    if delete_action == "block":
        raise HTTPException(status_code=403, detail=delete_payload or "Not authorized")
    if delete_action == "queue":
        return {"message": "Delete request submitted for approval"}

    target_collection = (delete_payload or {}).get("target_collection", source_collection)
    result = await db[target_collection].delete_one({"id": record_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Emission record not found")

    # Phase B11: emit emission.deleted (best-effort).
    # Only emit when an approved record actually leaves the dashboard view.
    if target_collection == APPROVED_COLLECTION:
        try:
            from events.event_bus import event_bus, Events
            event_bus.emit_nowait(Events.EMISSION_DELETED, {
                "record_id": record_id,
                "scope": existing.get("scope"),
                "category": existing.get("category"),
                "facility_id": existing.get("facility_id"),
                "organization_id": existing.get("organization_id"),
                "user_id": current_user.get("id"),
            })
        except Exception:
            pass

    audit_logger = get_audit_logger()
    await audit_logger.log(
        action=AuditAction.DELETE,
        module=AuditModule.EMISSION,
        user_id=current_user["id"],
        user_email=current_user["email"],
        user_role=current_user.get("role", "user"),
        organization_id=existing.get("organization_id"),
        resource_id=record_id,
        resource_name=f"{existing.get('scope', '')} - {existing.get('category', '')} ({existing.get('reporting_period', '')})",
        description=f"Deleted emission record for {existing.get('category', 'Unknown')}",
        old_values=existing,
        metadata={
            "scope": existing.get("scope"),
            "category": existing.get("category"),
            "total_emissions": existing.get("total_emissions"),
        },
    )

    return {"message": "Emission record deleted successfully"}
