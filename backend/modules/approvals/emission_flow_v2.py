"""
Approval Workflow V2 for GHG Emissions Module

Architecture:
- `pending_records`: All pending create/update/delete requests with embedded metadata
- `emission_records`: Approved records with embedded version history

Status values:
- pending_create, pending_update, pending_delete
- rejected_create, rejected_update, rejected_delete
- approved

Flow:
1. CREATE: User creates → pending_records (pending_create) → Admin approves → emission_records
2. UPDATE: User edits approved → pending_records (pending_update) → Admin approves → updates emission_records
3. DELETE: User deletes approved → pending_records (pending_delete) → Admin approves → deletes from emission_records
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, Tuple, List, Dict, Any

from shared.database.mongo import db

# Collection names
PENDING_COLLECTION = "pending_records"
APPROVED_COLLECTION = "emission_records"

# Status constants
STATUS_PENDING_CREATE = "pending_create"
STATUS_PENDING_UPDATE = "pending_update"
STATUS_PENDING_DELETE = "pending_delete"
STATUS_REJECTED_CREATE = "rejected_create"
STATUS_REJECTED_UPDATE = "rejected_update"
STATUS_REJECTED_DELETE = "rejected_delete"
STATUS_APPROVED = "approved"

PENDING_STATUSES = (STATUS_PENDING_CREATE, STATUS_PENDING_UPDATE, STATUS_PENDING_DELETE)
REJECTED_STATUSES = (STATUS_REJECTED_CREATE, STATUS_REJECTED_UPDATE, STATUS_REJECTED_DELETE)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _generate_id() -> str:
    return str(uuid.uuid4())


async def is_approval_enabled_for_org(organization_id: Optional[str]) -> bool:
    """Check if approval workflow is enabled for the organization."""
    if not organization_id:
        return False
    org = await db.organizations.find_one(
        {"id": organization_id},
        {"_id": 0, "approval_workflow_enabled": 1}
    )
    return bool(org and org.get("approval_workflow_enabled"))


def compute_field_changes(old_record: dict, new_record: dict) -> List[Dict[str, Any]]:
    """Compute field-level changes between old and new records."""
    changes = []
    
    # Fields to track for changes
    tracked_fields = [
        'quantity', 'quantity_unit', 'category', 'sub_category', 'fuel_type', 'fuel_name',
        'reporting_period', 'responsible_person', 'notes', 'total_emissions', 'co2e_emissions',
        'calculation_method_scope3', 'supplier_name', 'customer_name', 'frequency_type',
        'yearly_total', 'monthly_totals', 'dynamic_field_values', 'input_values', 'outputs'
    ]
    
    for field in tracked_fields:
        old_val = old_record.get(field)
        new_val = new_record.get(field)
        
        # Simple comparison (handles None vs missing)
        if str(old_val) != str(new_val):
            changes.append({
                'field': field,
                'old_value': old_val,
                'new_value': new_val
            })
    
    return changes


def enrich_with_emissions(record: dict) -> dict:
    """Ensure record has denormalized emission fields from outputs."""
    enriched = dict(record)
    outputs = enriched.get("outputs") or {}
    
    enriched["co2_emissions"] = (outputs.get("co2") or {}).get("value", 0) or 0
    enriched["ch4_emissions"] = (outputs.get("ch4") or {}).get("value", 0) or 0
    enriched["n2o_emissions"] = (outputs.get("n2o") or {}).get("value", 0) or 0
    enriched["co2e_emissions"] = (outputs.get("co2e") or {}).get("value", 0) or 0
    enriched["total_emissions"] = enriched["co2e_emissions"]
    
    return enriched


# =============================================================================
# FIND OPERATIONS
# =============================================================================

async def find_record(record_id: str) -> Tuple[Optional[dict], Optional[str]]:
    """
    Find a record by ID, checking pending_records first, then emission_records.
    Returns (record, collection_name) or (None, None) if not found.
    """
    # Check pending first - user should see their latest submitted values
    rec = await db[PENDING_COLLECTION].find_one({"id": record_id}, {"_id": 0})
    if rec:
        return rec, PENDING_COLLECTION
    
    # Check approved
    rec = await db[APPROVED_COLLECTION].find_one({"id": record_id}, {"_id": 0})
    if rec:
        return rec, APPROVED_COLLECTION
    
    return None, None


async def find_pending_by_original_id(original_id: str) -> Optional[dict]:
    """Find pending record by original_record_id (for update/delete of approved records)."""
    return await db[PENDING_COLLECTION].find_one(
        {"original_record_id": original_id},
        {"_id": 0}
    )


# =============================================================================
# CREATE FLOW
# =============================================================================

async def intercept_create(
    payload: dict,
    organization_id: str,
    current_user: dict,
) -> Tuple[str, Optional[dict]]:
    """
    Intercept emission creation.
    
    Returns:
        ("apply", record) - Directly create in emission_records (admin or workflow disabled)
        ("queue", record) - Created in pending_records awaiting approval
    """
    role = current_user.get("role", "user")
    org_enabled = await is_approval_enabled_for_org(organization_id)
    
    # Admins and super_admins bypass approval
    if role in ("admin", "super_admin") or not org_enabled:
        return ("apply", None)
    
    # User with approval enabled - create pending record
    record_id = payload.get("id") or _generate_id()
    enriched = enrich_with_emissions(payload)
    
    pending_record = {
        **enriched,
        "id": record_id,
        "organization_id": organization_id,
        "approval_status": STATUS_PENDING_CREATE,
        "original_record_id": None,  # No original for create
        
        # Submission metadata
        "submitted_by": current_user.get("id"),
        "submitted_by_email": current_user.get("email", ""),
        "submitted_by_name": current_user.get("full_name", ""),
        "submitted_at": _now(),
        
        # Edit history (tracks edits while pending)
        "edit_history": [],
        
        # Version history (will be copied to approved record)
        "version_history": [],
        
        "version": 1,
        "created_at": _now(),
        "created_by": current_user.get("id"),
        "created_by_email": current_user.get("email", ""),
        "created_by_name": current_user.get("full_name", ""),
    }
    
    await db[PENDING_COLLECTION].insert_one(pending_record)
    pending_record.pop("_id", None)
    
    return ("queue", pending_record)


# =============================================================================
# UPDATE FLOW
# =============================================================================

async def intercept_update(
    record_id: str,
    payload: dict,
    current_user: dict,
) -> Tuple[str, Optional[dict]]:
    """
    Intercept emission update.
    
    Returns:
        ("apply", None) - Directly update emission_records (admin or workflow disabled)
        ("queue", record) - Created/updated in pending_records awaiting approval
        ("block", msg) - Cannot edit (e.g., already has pending delete)
    """
    role = current_user.get("role", "user")
    
    # Find existing record
    existing, source = await find_record(record_id)
    if not existing:
        return ("block", "Record not found")
    
    org_id = existing.get("organization_id")
    org_enabled = await is_approval_enabled_for_org(org_id)
    
    # Admins bypass approval
    if role in ("admin", "super_admin") or not org_enabled:
        return ("apply", None)
    
    # User with approval enabled
    cur_status = existing.get("approval_status") or STATUS_APPROVED
    enriched = enrich_with_emissions(payload)
    
    # Case 1: Record is already pending delete - block
    if cur_status == STATUS_PENDING_DELETE:
        return ("block", "Cannot edit record pending deletion")
    
    # Case 2: Record is pending create or pending update - update the pending record
    if cur_status in (STATUS_PENDING_CREATE, STATUS_PENDING_UPDATE):
        # Track edit in history
        field_changes = compute_field_changes(existing, enriched)
        edit_entry = {
            "edited_at": _now(),
            "edited_by": current_user.get("id"),
            "edited_by_email": current_user.get("email", ""),
            "edited_by_name": current_user.get("full_name", ""),
            "field_changes": field_changes,
            "changes_summary": f"{len(field_changes)} field(s) changed"
        }
        
        # Update pending record with new values
        update_data = {
            **enriched,
            "updated_at": _now(),
            "updated_by": current_user.get("id"),
            "updated_by_email": current_user.get("email", ""),
            "updated_by_name": current_user.get("full_name", ""),
        }
        
        await db[PENDING_COLLECTION].update_one(
            {"id": record_id},
            {
                "$set": update_data,
                "$push": {"edit_history": edit_entry}
            }
        )
        
        updated = await db[PENDING_COLLECTION].find_one({"id": record_id}, {"_id": 0})
        return ("queue", updated)
    
    # Case 3: Record is approved or rejected - create new pending_update
    if cur_status in (STATUS_APPROVED, STATUS_REJECTED_CREATE, STATUS_REJECTED_UPDATE, STATUS_REJECTED_DELETE):
        # Check if there's already a pending request for this record
        existing_pending = await find_pending_by_original_id(record_id)
        if existing_pending:
            # Update existing pending request
            field_changes = compute_field_changes(existing_pending, enriched)
            edit_entry = {
                "edited_at": _now(),
                "edited_by": current_user.get("id"),
                "edited_by_email": current_user.get("email", ""),
                "edited_by_name": current_user.get("full_name", ""),
                "field_changes": field_changes,
                "changes_summary": f"{len(field_changes)} field(s) changed"
            }
            
            update_data = {
                **enriched,
                "updated_at": _now(),
                "updated_by": current_user.get("id"),
            }
            
            await db[PENDING_COLLECTION].update_one(
                {"id": existing_pending["id"]},
                {
                    "$set": update_data,
                    "$push": {"edit_history": edit_entry}
                }
            )
            
            updated = await db[PENDING_COLLECTION].find_one({"id": existing_pending["id"]}, {"_id": 0})
            return ("queue", updated)
        
        # Create new pending update record
        pending_id = _generate_id()
        field_changes = compute_field_changes(existing, enriched)
        
        pending_record = {
            **enriched,
            "id": pending_id,
            "original_record_id": record_id,  # Reference to approved record
            "organization_id": org_id,
            "approval_status": STATUS_PENDING_UPDATE,
            
            # Submission metadata
            "submitted_by": current_user.get("id"),
            "submitted_by_email": current_user.get("email", ""),
            "submitted_by_name": current_user.get("full_name", ""),
            "submitted_at": _now(),
            
            # Edit history
            "edit_history": [],
            
            # Version history with initial change
            "version_history": [{
                "version": (existing.get("version", 0) or 0) + 1,
                "changed_at": _now(),
                "changed_by": current_user.get("id"),
                "changed_by_email": current_user.get("email", ""),
                "changed_by_name": current_user.get("full_name", ""),
                "action": "update_requested",
                "field_changes": field_changes,
                "changes_summary": f"{len(field_changes)} field(s) changed"
            }],
            
            # Store original values for comparison
            "original_snapshot": existing,
            
            "version": (existing.get("version", 0) or 0) + 1,
            "updated_at": _now(),
            "updated_by": current_user.get("id"),
            "updated_by_email": current_user.get("email", ""),
            "updated_by_name": current_user.get("full_name", ""),
        }
        
        await db[PENDING_COLLECTION].insert_one(pending_record)
        pending_record.pop("_id", None)
        
        # Mark original record as having pending update
        await db[APPROVED_COLLECTION].update_one(
            {"id": record_id},
            {"$set": {"approval_status": STATUS_PENDING_UPDATE}}
        )
        
        return ("queue", pending_record)
    
    return ("block", f"Unknown status: {cur_status}")


# =============================================================================
# DELETE FLOW
# =============================================================================

async def intercept_delete(
    record_id: str,
    current_user: dict,
) -> Tuple[str, Optional[dict]]:
    """
    Intercept emission deletion.
    
    Returns:
        ("apply", None) - Directly delete from emission_records
        ("queue", record) - Created in pending_records awaiting approval
        ("block", msg) - Cannot delete
    """
    role = current_user.get("role", "user")
    
    # Find existing record
    existing, source = await find_record(record_id)
    if not existing:
        return ("block", "Record not found")
    
    org_id = existing.get("organization_id")
    org_enabled = await is_approval_enabled_for_org(org_id)
    
    # Admins bypass approval
    if role in ("admin", "super_admin") or not org_enabled:
        return ("apply", None)
    
    # User with approval enabled
    cur_status = existing.get("approval_status") or STATUS_APPROVED
    
    # If already pending, block delete
    if cur_status in PENDING_STATUSES:
        return ("block", "Cannot delete record with pending approval")
    
    # If record is only in pending (create), just delete it
    if source == PENDING_COLLECTION and cur_status == STATUS_PENDING_CREATE:
        await db[PENDING_COLLECTION].delete_one({"id": record_id})
        return ("apply", None)
    
    # Create pending delete record
    pending_id = _generate_id()
    
    pending_record = {
        **existing,
        "id": pending_id,
        "original_record_id": record_id,
        "organization_id": org_id,
        "approval_status": STATUS_PENDING_DELETE,
        
        # Submission metadata
        "submitted_by": current_user.get("id"),
        "submitted_by_email": current_user.get("email", ""),
        "submitted_by_name": current_user.get("full_name", ""),
        "submitted_at": _now(),
        
        # Edit history
        "edit_history": [],
        
        # Version history
        "version_history": [{
            "version": (existing.get("version", 0) or 0) + 1,
            "changed_at": _now(),
            "changed_by": current_user.get("id"),
            "changed_by_email": current_user.get("email", ""),
            "changed_by_name": current_user.get("full_name", ""),
            "action": "delete_requested",
        }],
    }
    
    await db[PENDING_COLLECTION].insert_one(pending_record)
    pending_record.pop("_id", None)
    
    # Mark original record as pending delete
    await db[APPROVED_COLLECTION].update_one(
        {"id": record_id},
        {"$set": {"approval_status": STATUS_PENDING_DELETE}}
    )
    
    return ("queue", pending_record)


# =============================================================================
# APPROVAL/REJECTION FLOW
# =============================================================================

async def approve_request(
    pending_id: str,
    approver: dict,
    admin_changes: Optional[dict] = None,
) -> Tuple[bool, str]:
    """
    Approve a pending request.
    
    Args:
        pending_id: ID of the pending record
        approver: Admin user dict
        admin_changes: Optional dict of changes made by admin during approval
    
    Returns:
        (success, message)
    """
    pending = await db[PENDING_COLLECTION].find_one({"id": pending_id}, {"_id": 0})
    if not pending:
        return (False, "Pending record not found")
    
    status = pending.get("approval_status")
    original_id = pending.get("original_record_id")
    
    # Apply admin changes if any
    if admin_changes:
        pending.update(enrich_with_emissions(admin_changes))
    
    # Create approval history entry
    approval_entry = {
        "version": pending.get("version", 1),
        "changed_at": _now(),
        "changed_by": approver.get("id"),
        "changed_by_email": approver.get("email", ""),
        "changed_by_name": approver.get("full_name", ""),
        "action": "approved",
        "approved_by": approver.get("id"),
        "approved_by_email": approver.get("email", ""),
        "approved_by_name": approver.get("full_name", ""),
        "approved_at": _now(),
    }
    
    if status == STATUS_PENDING_CREATE:
        # Create new record in emission_records
        approved_record = {k: v for k, v in pending.items() 
                         if k not in ("original_record_id", "submitted_by", "submitted_by_email", 
                                     "submitted_by_name", "submitted_at", "edit_history", "original_snapshot")}
        approved_record["approval_status"] = STATUS_APPROVED
        approved_record["version_history"] = pending.get("version_history", []) + [approval_entry]
        
        await db[APPROVED_COLLECTION].insert_one(approved_record)
        await db[PENDING_COLLECTION].delete_one({"id": pending_id})
        
        return (True, "Record created successfully")
    
    elif status == STATUS_PENDING_UPDATE:
        if not original_id:
            return (False, "Missing original_record_id for update")
        
        # Get existing record for version history
        existing = await db[APPROVED_COLLECTION].find_one({"id": original_id}, {"_id": 0})
        if not existing:
            return (False, "Original record not found")
        
        # Compute field changes
        field_changes = compute_field_changes(existing, pending)
        approval_entry["field_changes"] = field_changes
        approval_entry["changes_summary"] = f"{len(field_changes)} field(s) changed"
        
        # Build update data
        update_data = {k: v for k, v in pending.items()
                      if k not in ("id", "original_record_id", "submitted_by", "submitted_by_email",
                                  "submitted_by_name", "submitted_at", "edit_history", "original_snapshot")}
        update_data["approval_status"] = STATUS_APPROVED
        update_data["updated_at"] = _now()
        update_data["updated_by"] = approver.get("id")
        update_data["updated_by_email"] = approver.get("email", "")
        update_data["updated_by_name"] = approver.get("full_name", "")
        
        # Merge version histories
        existing_history = existing.get("version_history", [])
        pending_history = pending.get("version_history", [])
        update_data["version_history"] = existing_history + pending_history + [approval_entry]
        
        await db[APPROVED_COLLECTION].update_one(
            {"id": original_id},
            {"$set": update_data}
        )
        await db[PENDING_COLLECTION].delete_one({"id": pending_id})
        
        return (True, "Record updated successfully")
    
    elif status == STATUS_PENDING_DELETE:
        if not original_id:
            return (False, "Missing original_record_id for delete")
        
        # Delete from emission_records
        await db[APPROVED_COLLECTION].delete_one({"id": original_id})
        await db[PENDING_COLLECTION].delete_one({"id": pending_id})
        
        return (True, "Record deleted successfully")
    
    return (False, f"Unknown status: {status}")


async def reject_request(
    pending_id: str,
    rejector: dict,
    reason: Optional[str] = None,
) -> Tuple[bool, str]:
    """
    Reject a pending request.
    
    Returns:
        (success, message)
    """
    pending = await db[PENDING_COLLECTION].find_one({"id": pending_id}, {"_id": 0})
    if not pending:
        return (False, "Pending record not found")
    
    status = pending.get("approval_status")
    original_id = pending.get("original_record_id")
    
    # Determine rejected status
    rejected_status = {
        STATUS_PENDING_CREATE: STATUS_REJECTED_CREATE,
        STATUS_PENDING_UPDATE: STATUS_REJECTED_UPDATE,
        STATUS_PENDING_DELETE: STATUS_REJECTED_DELETE,
    }.get(status)
    
    if not rejected_status:
        return (False, f"Cannot reject status: {status}")
    
    # Create rejection history entry
    rejection_entry = {
        "version": pending.get("version", 1),
        "changed_at": _now(),
        "changed_by": rejector.get("id"),
        "changed_by_email": rejector.get("email", ""),
        "changed_by_name": rejector.get("full_name", ""),
        "action": "rejected",
        "rejected_by": rejector.get("id"),
        "rejected_by_email": rejector.get("email", ""),
        "rejected_by_name": rejector.get("full_name", ""),
        "rejected_at": _now(),
        "rejection_reason": reason,
    }
    
    # Update pending record with rejected status
    await db[PENDING_COLLECTION].update_one(
        {"id": pending_id},
        {
            "$set": {"approval_status": rejected_status},
            "$push": {"version_history": rejection_entry}
        }
    )
    
    # If it was an update/delete, restore original record status
    if original_id:
        await db[APPROVED_COLLECTION].update_one(
            {"id": original_id},
            {"$set": {"approval_status": STATUS_APPROVED}}
        )
    
    return (True, "Request rejected")


# =============================================================================
# FETCH OPERATIONS (for listing)
# =============================================================================

async def fetch_emissions_for_user(
    current_user: dict,
    query: dict = None,
) -> List[dict]:
    """
    Fetch emissions combining approved and pending records for display.
    
    - Approved records are shown unless they have a pending update/delete
    - Pending records are shown with their pending status
    """
    query = query or {}
    user_role = current_user.get("role", "user")
    org_id = current_user.get("organization_id")
    
    # Build base query based on role
    if user_role == "super_admin":
        base_query = query
    elif user_role == "admin":
        facilities = await db.facilities.find(
            {"organization_id": org_id},
            {"_id": 0, "id": 1}
        ).to_list(1000)
        facility_ids = [f["id"] for f in facilities]
        base_query = {**query, "facility_id": {"$in": facility_ids}}
    else:
        assigned = current_user.get("assigned_facilities", [])
        base_query = {**query, "facility_id": {"$in": assigned}}
    
    # Fetch approved records
    approved = await db[APPROVED_COLLECTION].find(base_query, {"_id": 0}).to_list(10000)
    
    # Fetch pending records
    pending = await db[PENDING_COLLECTION].find(base_query, {"_id": 0}).to_list(10000)
    
    # Build result: merge approved + pending, avoiding duplicates
    result = []
    pending_original_ids = {p.get("original_record_id") for p in pending if p.get("original_record_id")}
    
    # Add approved records that don't have pending updates/deletes
    for rec in approved:
        if rec["id"] not in pending_original_ids:
            result.append(rec)
    
    # Add all pending records
    result.extend(pending)
    
    return result


async def fetch_pending_requests(
    organization_id: str,
    status_filter: str = "pending",
) -> List[dict]:
    """Fetch pending approval requests for admin review."""
    if status_filter == "pending":
        query = {
            "organization_id": organization_id,
            "approval_status": {"$in": list(PENDING_STATUSES)}
        }
    elif status_filter == "rejected":
        query = {
            "organization_id": organization_id,
            "approval_status": {"$in": list(REJECTED_STATUSES)}
        }
    else:
        query = {"organization_id": organization_id}
    
    return await db[PENDING_COLLECTION].find(query, {"_id": 0}).to_list(1000)


async def get_pending_count(organization_id: str) -> int:
    """Get count of pending approvals for an organization."""
    return await db[PENDING_COLLECTION].count_documents({
        "organization_id": organization_id,
        "approval_status": {"$in": list(PENDING_STATUSES)}
    })


# =============================================================================
# EXPORTS
# =============================================================================

__all__ = [
    "is_approval_enabled_for_org",
    "find_record",
    "intercept_create",
    "intercept_update",
    "intercept_delete",
    "approve_request",
    "reject_request",
    "fetch_emissions_for_user",
    "fetch_pending_requests",
    "get_pending_count",
    "PENDING_COLLECTION",
    "APPROVED_COLLECTION",
    "STATUS_PENDING_CREATE",
    "STATUS_PENDING_UPDATE",
    "STATUS_PENDING_DELETE",
    "STATUS_APPROVED",
    "PENDING_STATUSES",
    "REJECTED_STATUSES",
]
