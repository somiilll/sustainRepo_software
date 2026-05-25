"""
Emissions read/list/write router.

Phase B4 added: GET /emissions, GET /emissions/{id}/history, DELETE /emissions/{id}.
Phase B5 added: POST /emissions, PUT /emissions/{id}.

Phase B5 still keeps these routes thin: they integrate the calc-engine
service inline (same as legacy server.py) — extracting that flow into a
dedicated emissions service comes in Phase B5b. Behaviour is byte-identical.
"""
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from audit_logger import AuditAction, AuditModule, get_audit_logger
from modules.approvals.emission_flow import (
    APPROVED_COLLECTION,
    PENDING_COLLECTION,
    fetch_pending_for_user,
    find_emission_anywhere,
    intercept_create as approval_intercept_create,
    intercept_delete as approval_intercept_delete,
    intercept_update as approval_intercept_update,
    merge_visible_emissions,
)
from modules.auth.dependencies import get_current_user
from modules.emissions.contracts import (
    EmissionHistoryResponse,
    EmissionRecordCreate,
    EmissionRecordResponse,
)
from shared.database.mongo import db
from shared.helpers.audit_helpers import compute_field_changes

router = APIRouter()


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
    facility = await db.facilities.find_one({"id": record_data.facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    
    # Check access
    if current_user["role"] == "user" and record_data.facility_id not in current_user.get("assigned_facilities", []):
        raise HTTPException(status_code=403, detail="Not authorized")
    if current_user["role"] == "admin" and facility["organization_id"] != current_user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Not authorized")
    
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
    
    # Approval workflow gate (set approval_status + create approval_request if needed).
    # When pending, the doc is written into pending_emission_records by the hook
    # and we early-return — the rest of the normal create flow (history,
    # event-bus, base-year sync) does NOT run for unapproved records.
    approval_pending = await approval_intercept_create(record_dict, dict(record_dict), current_user)
    if approval_pending:
        # Audit the submission attempt, then return.
        await audit_logger.log(
            action=AuditAction.CREATE,
            module=AuditModule.EMISSION,
            user_id=current_user["id"],
            user_email=current_user["email"],
            user_role=current_user.get("role", "user"),
            organization_id=record_dict["organization_id"],
            resource_id=record_id,
            resource_name=f"{record_data.scope} - {record_data.category} ({record_data.reporting_period})",
            description=f"Submitted emission record for approval ({record_data.category})",
            new_values=record_dict,
            metadata={
                "scope": record_data.scope,
                "category": record_data.category,
                "facility_id": record_data.facility_id,
                "approval_status": record_dict.get("approval_status"),
            },
        )
        return EmissionRecordResponse(**record_dict)
    
    await db.emission_records.insert_one(record_dict)
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
    
    if not approval_pending:
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
    
    return EmissionRecordResponse(**record_dict)

# Phase B4: GET /emissions moved to modules/emissions/router.py


@router.put("/emissions/{record_id}", response_model=EmissionRecordResponse)
async def update_emission_record(
    record_id: str,
    record_data: EmissionRecordCreate,
    current_user: dict = Depends(get_current_user)
):
    # Records can live in either emission_records (approved) or
    # pending_emission_records (in-flight). Look in both.
    existing, source_collection = await find_emission_anywhere(record_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Emission record not found")
    
    # Approval-workflow gate (no-op when org doesn't have it enabled).
    approval_action, approval_payload = await approval_intercept_update(
        existing, source_collection, record_data, current_user
    )
    if approval_action == "block":
        raise HTTPException(status_code=403, detail=approval_payload.get("detail", "Not authorized"))
    if approval_action == "queue":
        # Approval request created; emission_records untouched. Return original.
        return EmissionRecordResponse(**(approval_payload or existing))
    skip_history = approval_action == "skip_history"
    target_collection = (approval_payload or {}).get("target_collection", source_collection)
    
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
    
    # Compute field-level changes for better tracking (#3 - Version History)
    field_changes = compute_field_changes(existing, history_new_values)
    
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
        "field_changes": field_changes,  # New: detailed field-level changes
        "changes_summary": f"{len(field_changes)} field(s) changed",
        "changes": {
            "action": "updated",
            "old_values": existing,
            "new_values": history_new_values
        }
    }
    if not skip_history:
        await db.emission_history.insert_one(history_dict)
    
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_dict["updated_by"] = current_user["id"]
    update_dict["updated_by_email"] = current_user.get("email", "")
    update_dict["updated_by_name"] = current_user.get("full_name", "")
    if not skip_history:
        update_dict["version"] = existing.get("version", 0) + 1  # Increment version
    else:
        # Editing a record that is still under review — preserve version.
        update_dict["version"] = existing.get("version", 0)
        # Preserve approval_status so it doesn't get overwritten by the form payload.
        update_dict["approval_status"] = existing.get("approval_status")
    
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
    org_id = None
    if current_user["role"] == "super_admin":
        pass  # Can see all
    elif current_user["role"] == "admin":
        org_id = current_user.get("organization_id")
        if not org_id:
            return []  # Admin without org has no emissions
        facilities = await db.facilities.find(
            {"organization_id": org_id},
            {"_id": 0},
        ).to_list(1000)
        facility_ids = [f["id"] for f in facilities]
        query["facility_id"] = {"$in": facility_ids}
    else:  # user
        assigned = current_user.get("assigned_facilities", [])
        query["facility_id"] = {"$in": assigned}
        # Get org_id from user for access check
        org_id = current_user.get("organization_id")

    if facility_id:
        query["facility_id"] = facility_id
    if reporting_period:
        query["reporting_period"] = reporting_period
    if scope:
        query["scope"] = scope

    records = await db.emission_records.find(query, {"_id": 0}).to_list(10000)
    # Pull in pending / rejected proposals so the FE can show them with badges.
    pending_records = await fetch_pending_for_user(current_user, query)
    records = merge_visible_emissions(records, pending_records)
    
    # Filter out biogenic records with biogenic_scope_selection='scope3' for orgs without scope3 access
    # Super admins see all; other users have org-level restrictions
    if current_user["role"] != "super_admin" and org_id:
        organization = await db.organizations.find_one({"id": org_id}, {"_id": 0, "enabled_access": 1})
        enabled_access = organization.get("enabled_access") if organization else None
        # Default to scope1_2 if enabled_access is None
        if enabled_access is None:
            enabled_access = ["scope1_2"]
        
        # If org does NOT have scope1_2_3 access, filter out biogenic records with scope3 selection
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
    """Fetch a single emission record from approved OR pending collection.

    Used by the Approvals deep-link so admins can open the edit dialog for a
    pending submission that the GHG ledger filters out.
    """
    record, _ = await find_emission_anywhere(record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Emission record not found")

    # Role-based access check.
    role = current_user.get("role")
    if role == "super_admin":
        pass
    elif role == "admin":
        if record.get("organization_id") != current_user.get("organization_id"):
            raise HTTPException(status_code=403, detail="Not authorized")
    else:  # regular user
        assigned = current_user.get("assigned_facilities", []) or []
        is_own_pending = (
            record.get("approval_status", "approved") != "approved"
            and record.get("created_by") == current_user.get("id")
        )
        if record.get("facility_id") not in assigned and not is_own_pending:
            raise HTTPException(status_code=403, detail="Not authorized")

    return EmissionRecordResponse(**record)


@router.get("/emissions/{record_id}/history", response_model=List[EmissionHistoryResponse])
async def get_emission_history(record_id: str, current_user: dict = Depends(get_current_user)):
    # Sort by changed_at descending so newest entry appears first.
    history = await db.emission_history.find(
        {"emission_id": record_id},
        {"_id": 0},
    ).sort("changed_at", -1).to_list(1000)

    # Populate changed_by_email and changed_by_name for each history entry.
    for entry in history:
        if entry.get("changed_by"):
            user = await db.users.find_one(
                {"id": entry["changed_by"]},
                {"_id": 0, "email": 1, "full_name": 1},
            )
            if user:
                entry["changed_by_email"] = user.get("email", "Unknown User")
                entry["changed_by_name"] = user.get("full_name", "")
            else:
                entry["changed_by_email"] = "Unknown User"
                entry["changed_by_name"] = ""
        else:
            entry["changed_by_email"] = "Unknown User"
            entry["changed_by_name"] = ""

    return [EmissionHistoryResponse(**h) for h in history]


@router.delete("/emissions/{record_id}")
async def delete_emission_record(record_id: str, current_user: dict = Depends(get_current_user)):
    existing, source_collection = await find_emission_anywhere(record_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Emission record not found")

    # Approval-workflow gate.
    delete_action, delete_payload = await approval_intercept_delete(existing, source_collection, current_user)
    if delete_action == "block":
        raise HTTPException(status_code=403, detail=(delete_payload or {}).get("detail", "Not authorized"))
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
