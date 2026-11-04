"""
Multi-Proposal Approval Service

Handles the new workflow where:
- Multiple users can have pending proposals for the same record
- Each user sees only their own proposal
- Approving one proposal auto-rejects all others
- Approved record stays immutable until approval
"""

import copy
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from fastapi import HTTPException

from shared.database.mongo import db

logger = logging.getLogger(__name__)


def employee_input_changes(old_employees, new_employees, input_label_map=None) -> List[Dict[str, Any]]:
    """Per-employee input diffs (days travelled etc.) for C7 records."""
    from shared.helpers.audit_helpers import compute_user_input_changes

    def slots(employee: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
        if employee.get("monthly_data"):
            return {k: (v or {}).get("inputs") or {} for k, v in employee["monthly_data"].items()}
        if employee.get("yearly_data"):
            return {"yearly": employee["yearly_data"].get("inputs") or {}}
        return {"": employee.get("inputs") or {}}

    old_by_id = {(e.get("employee_id") or e.get("id")): e for e in old_employees or []}
    changes: List[Dict[str, Any]] = []
    for emp in new_employees or []:
        old_slots = slots(old_by_id.get(emp.get("employee_id") or emp.get("id")) or {})
        new_slots = slots(emp)
        for period, new_inputs in new_slots.items():
            name = emp.get("name") or "Employee"
            if len(new_slots) > 1 and period:
                name = f"{name}, {period}"
            changes.extend(compute_user_input_changes(old_slots.get(period, {}), new_inputs, input_label_map, employee_name=name))
    return changes


def build_emission_proposal_history_event(
    current: Dict[str, Any],
    updated: Dict[str, Any],
    proposal: Dict[str, Any],
    *,
    action: str,
    actor_id: str,
    actor_email: str,
    actor_name: str,
    timestamp: str,
    rejection_reason: Optional[str] = None,
    input_label_map: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """Build the linked post-resolution format expected by GHG version history."""
    old_inputs = current.get("dynamic_field_values") or {}
    new_inputs = updated.get("dynamic_field_values") or old_inputs
    field_changes = []
    for key in sorted(set(old_inputs) | set(new_inputs)):
        if old_inputs.get(key) != new_inputs.get(key):
            field_changes.append({
                "field": "input_values",
                "input_key": key,
                "old_value": old_inputs.get(key),
                "new_value": new_inputs.get(key),
                "field_type": "input_values",
            })
    field_changes.extend(employee_input_changes(current.get("employees"), updated.get("employees"), input_label_map))
    for field, label in (("supplier_name", "Supplier Name"), ("supplier_code", "Supplier Code"), ("asset_name", "Asset Name"),
                         ("from_location", "From Location"), ("to_location", "To Location")):
        if (current.get(field) or "") != (updated.get(field) or ""):
            field_changes.append({"field": field, "display_name": label, "old_value": current.get(field) or "", "new_value": updated.get(field) or "", "field_type": "simple"})
    for field in ("co2_emissions", "ch4_emissions", "n2o_emissions", "co2e_emissions", "total_emissions"):
        if current.get(field) != updated.get(field):
            field_changes.append({
                "field": field,
                "old_value": current.get(field),
                "new_value": updated.get(field),
                "field_type": "simple",
            })

    changes = {
        "action": action,
        "request_type": proposal.get("request_type", "update"),
        "proposal_id": proposal.get("id"),
        "old_values": {
            "dynamic_field_values": old_inputs,
            "total_emissions": current.get("total_emissions"),
            "co2e_emissions": current.get("co2e_emissions"),
        },
        "new_values": {
            "dynamic_field_values": new_inputs,
            "total_emissions": updated.get("total_emissions"),
            "co2e_emissions": updated.get("co2e_emissions"),
        },
    }
    if rejection_reason:
        changes["rejection_reason"] = rejection_reason
    approved = action == "approved"
    return {
        "id": str(uuid.uuid4()),
        "emission_id": current.get("id"),
        "facility_id": current.get("facility_id"),
        "organization_id": current.get("organization_id"),
        "scope": current.get("scope"),
        "category": current.get("category"),
        "changed_by": actor_id,
        "changed_by_email": actor_email,
        "changed_by_name": actor_name,
        "changed_at": timestamp,
        "version": updated.get("version", current.get("version")),
        "field_changes": field_changes,
        "changes_summary": "Update Approved" if approved else "Update Rejected",
        "changes": changes,
        "approved_by": actor_id if approved else None,
        "approved_by_email": actor_email if approved else None,
        "approved_by_name": actor_name if approved else None,
        "approved_at": timestamp if approved else None,
        "requested_by": proposal.get("submitted_by"),
        "requested_by_email": proposal.get("submitted_by_email"),
        "requested_by_name": proposal.get("submitted_by_name"),
        "requested_at": proposal.get("submitted_at") or proposal.get("requested_at"),
    }


def build_emission_lifecycle_events(
    current: Dict[str, Any],
    updated: Dict[str, Any],
    proposal: Dict[str, Any],
    approved_event: Dict[str, Any],
    input_label_map: Optional[Dict[str, str]] = None,
) -> List[Dict[str, Any]]:
    """Created-by (submitter) and updated-by (approver edit) entries that precede the approval entry."""
    snapshot = proposal.get("entity_snapshot") or {}
    original = proposal.get("original_proposal_data") or snapshot
    def inputs_of(source: Dict[str, Any]) -> Dict[str, Any]:
        return (source.get("proposed_changes") or {}).get("inputs") or source.get("dynamic_field_values") or source.get("inputs") or {}
    def total_of(source: Dict[str, Any], field: str):
        return (source.get("proposed_changes") or {}).get(field, source.get(field))
    is_create = proposal.get("request_type") == "create"
    events: List[Dict[str, Any]] = []
    base = {k: approved_event.get(k) for k in ("emission_id", "facility_id", "organization_id", "scope", "category")}
    original_inputs = inputs_of(original)
    if is_create:
        events.append({
            **base, "id": str(uuid.uuid4()), "changed_by": proposal.get("submitted_by"),
            "changed_by_email": proposal.get("submitted_by_email"), "changed_by_name": proposal.get("submitted_by_name"),
            "changed_at": proposal.get("submitted_at") or proposal.get("requested_at") or approved_event["changed_at"],
            "version": 1, "field_changes": [], "changes_summary": "Created",
            "changes": {"action": "created", "request_type": "create", "proposal_id": proposal.get("id"), "old_values": None,
                        "new_values": {"dynamic_field_values": original_inputs, "total_emissions": total_of(original, "total_emissions"),
                                       "co2e_emissions": total_of(original, "co2e_emissions")}},
        })
    modification = proposal.get("approver_modifications") or {}
    if proposal.get("original_proposal_data") and modification:
        before = {**current, "dynamic_field_values": original_inputs, "employees": original.get("employees") or current.get("employees")}
        for field in ("co2_emissions", "ch4_emissions", "n2o_emissions", "co2e_emissions", "total_emissions"):
            before[field] = total_of(original, field)
        edit = build_emission_proposal_history_event(
            before, updated, proposal, action="updated", actor_id=modification.get("modified_by"),
            actor_email=modification.get("modified_by_email", ""), actor_name=modification.get("modified_by_name", ""),
            timestamp=modification.get("modified_at") or approved_event["changed_at"], input_label_map=input_label_map,
        )
        edit["changes_summary"] = "Updated by approver"
        edit["changes"]["approver_edit_fields"] = [f for e in proposal.get("approver_edits") or [] for f in e.get("fields", [])]
        edit["changes"]["request_type"] = "update"
        edit["version"] = 1 if is_create else edit.get("version")
        events.append(edit)
    if is_create and events:
        approved_event["field_changes"] = []
        approved_event["changes"]["old_values"] = approved_event["changes"]["new_values"]
        approved_event["changes_summary"] = "Approved"
    return events


def build_rejected_emission_preview(current: Dict[str, Any], proposal: Dict[str, Any]) -> Dict[str, Any]:
    """Build a display-only rejected proposal state without changing the approved record."""
    preview = {**current, "dynamic_field_values": {**(current.get("dynamic_field_values") or {})}}
    snapshot = proposal.get("entity_snapshot") or {}
    proposed = snapshot.get("proposed_changes") or proposal.get("proposed_changes") or {}
    for key, value in (proposed.get("inputs") or {}).items():
        preview["dynamic_field_values"][key] = value
    outputs = proposed.get("outputs") or {}
    output_fields = {
        "co2": "co2_emissions",
        "ch4": "ch4_emissions",
        "n2o": "n2o_emissions",
        "co2e": "co2e_emissions",
    }
    for output_key, record_field in output_fields.items():
        value = outputs.get(output_key)
        if isinstance(value, dict) and value.get("value") is not None:
            preview[record_field] = value["value"]
    co2e = outputs.get("co2e")
    if isinstance(co2e, dict) and co2e.get("value") is not None:
        preview["total_emissions"] = co2e["value"]
    return preview


def build_esg_proposal_version_event(
    current: Dict[str, Any],
    updated: Dict[str, Any],
    proposal: Dict[str, Any],
    *,
    section: str,
    action: str,
    actor_id: str,
    actor_email: str,
    actor_name: str,
    timestamp: str,
    rejection_reason: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a standard section-record version event for immutable proposal outcomes."""
    old_values = current.get("field_values") or {}
    new_values = updated.get("field_values") or old_values
    field_diffs = [
        {
            "field": key,
            "display_name": key.replace("_", " ").title(),
            "old_value": old_values.get(key),
            "new_value": new_values.get(key),
        }
        for key in sorted(set(old_values) | set(new_values))
        if old_values.get(key) != new_values.get(key)
    ]
    snapshot = proposal.get("entity_snapshot") or {}
    submitted_field_diffs = [
        {
            "field": item.get("field_key"),
            "display_name": item.get("field_key", "").replace("_", " ").title(),
            "old_value": item.get("old_value"),
            "new_value": item.get("new_value"),
        }
        for item in snapshot.get("changes_summary", [])
        if item.get("field_key")
    ]
    approver_edited = bool(snapshot.get("approver_edited") or proposal.get("approver_edited"))
    approver_field_diffs = [
        {
            "field": item["field"],
            "display_name": item["display_name"],
            "old_value": item["new_value"],
            "new_value": new_values.get(item["field"]),
        }
        for item in submitted_field_diffs
        if new_values.get(item["field"]) != item["new_value"]
    ] if approver_edited else []
    approved = action == "approved"
    return {
        "id": str(uuid.uuid4()),
        "record_id": current.get("id"),
        "organization_id": current.get("organization_id") or current.get("org_id"),
        "version": updated.get("version", current.get("version")),
        "section": section,
        "snapshot": updated,
        "change_type": action,
        "field_diffs": field_diffs,
        "submitted_field_diffs": submitted_field_diffs,
        "approver_edited": approver_edited,
        "approver_field_diffs": approver_field_diffs,
        "changed_fields": [item["field"] for item in field_diffs],
        "change_reason": rejection_reason if not approved else proposal.get("resolution_comment"),
        "record_was_changed": approved,
        "created_by": actor_id,
        "changed_by_name": actor_name,
        "changed_by_email": actor_email,
        "created_at": timestamp,
        "proposal_id": proposal.get("id"),
        "requested_by": proposal.get("submitted_by"),
        "requested_by_name": proposal.get("submitted_by_name"),
        "requested_by_email": proposal.get("submitted_by_email"),
        "requested_at": proposal.get("submitted_at"),
        "approved_by": actor_id if approved else None,
        "approved_by_name": actor_name if approved else None,
        "approved_by_email": actor_email if approved else None,
        "approved_at": timestamp if approved else None,
        "rejected_by": actor_id if not approved else None,
        "rejected_by_name": actor_name if not approved else None,
        "rejected_by_email": actor_email if not approved else None,
        "rejected_at": timestamp if not approved else None,
        "rejection_reason": rejection_reason,
    }


def build_rejected_esg_preview(current: Dict[str, Any], proposal: Dict[str, Any]) -> Dict[str, Any]:
    """Build a display-only rejected field-value state without mutating the approved record."""
    snapshot = proposal.get("entity_snapshot") or {}
    return {**current, "field_values": snapshot.get("field_values") or current.get("field_values") or {}}


class NoApproverConfiguredError(Exception):
    """Raised when no approver is configured for an assignment."""
    def __init__(self, assignment_id: str):
        self.assignment_id = assignment_id
        super().__init__(f"No approver configured for assignment {assignment_id}")


class ProposalService:
    """Service for managing change proposals."""
    
    # ========================================================================
    # Core Proposal Operations
    # ========================================================================
    
    async def get_user_pending_proposal(
        self,
        record_id: str,
        user_id: str,
        entity_type: str = "esg_record",
    ) -> Optional[Dict[str, Any]]:
        """
        Get the user's pending proposal for a record.
        Returns None if user has no pending proposal.
        
        Rule: One pending proposal per user per record.
        """
        return await db.approval_requests.find_one(
            {
                "entity_id": record_id,
                "entity_type": entity_type,
                "submitted_by": user_id,
                "status": {"$in": ["pending", "in_review"]},
            },
            {"_id": 0}
        )
    
    async def get_all_pending_proposals(
        self,
        record_id: str,
        entity_type: str = "esg_record",
    ) -> List[Dict[str, Any]]:
        """
        Get all pending proposals for a record (for approvers).
        """
        proposals = await db.approval_requests.find(
            {
                "entity_id": record_id,
                "entity_type": entity_type,
                "status": {"$in": ["pending", "in_review"]},
            },
            {"_id": 0}
        ).sort("created_at", 1).to_list(100)
        
        return proposals
    
    async def create_or_update_proposal(
        self,
        record_id: str,
        entity_type: str,
        entity_subtype: str,  # section for ESG, scope for emissions
        org_id: str,
        user_id: str,
        proposed_data: Dict[str, Any],
        current_record: Dict[str, Any],
        assignment: Dict[str, Any],
        changes_summary: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Create a new proposal or update existing one.
        
        Rule: One pending proposal per user per record.
        If user already has a pending proposal, update it.
        
        Raises:
            NoApproverConfiguredError: If no approver is configured in the assignment.
        """
        existing = await self.get_user_pending_proposal(record_id, user_id, entity_type)
        
        # Get user info
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1, "full_name": 1})
        user_email = user.get("email", "") if user else ""
        user_name = user.get("full_name", "") if user else ""
        
        # Get approvers from assignment
        approver_id = assignment.get("approver_id")
        approval_chain = assignment.get("approval_chain", [])
        
        if approval_chain and len(approval_chain) > 0:
            first_item = approval_chain[0]
            if isinstance(first_item, str):
                current_approvers = [first_item]
            else:
                current_approvers = [first_item.get("approver_id")] if first_item else []
            total_levels = len(approval_chain)
        elif approver_id:
            current_approvers = [approver_id]
            total_levels = 1
        else:
            raise NoApproverConfiguredError(assignment.get("id", "unknown"))
        
        now = datetime.now(timezone.utc).isoformat()
        
        # Build entity_snapshot with proposed data
        entity_snapshot = {
            **proposed_data,
            "is_proposal": True,
            "current_record_data": current_record,  # Original approved data for comparison
            "changes_summary": changes_summary or [],
        }
        
        if existing:
            # Update existing proposal
            update_data = {
                "entity_snapshot": entity_snapshot,
                "updated_at": now,
                "submission_comment": "Updated proposal",
            }
            
            # Track edit history within the proposal
            edit_history = existing.get("edit_history", [])
            edit_history.append({
                "edited_at": now,
                "previous_snapshot": existing.get("entity_snapshot"),
            })
            update_data["edit_history"] = edit_history
            
            await db.approval_requests.update_one(
                {"id": existing["id"]},
                {"$set": update_data}
            )
            
            # Return updated proposal
            return await db.approval_requests.find_one(
                {"id": existing["id"]},
                {"_id": 0}
            )
        else:
            # Create new proposal
            proposal_id = str(uuid.uuid4())
            proposal = {
                "id": proposal_id,
                "organization_id": org_id,
                "workflow_id": f"assignment_{assignment.get('id')}",
                "workflow_name": f"{entity_type.replace('_', ' ').title()} Proposal",
                
                # Entity being proposed
                "entity_type": entity_type,
                "entity_id": record_id,
                "entity_subtype": entity_subtype,
                "entity_snapshot": entity_snapshot,
                
                # Submission info
                "submitted_by": user_id,
                "submitted_by_email": user_email,
                "submitted_by_name": user_name,
                "submitted_at": now,
                "submission_comment": "New proposal",
                
                # Current state
                "status": "pending",
                "current_level": 1,
                "current_approvers": current_approvers,
                "total_levels": total_levels,
                
                # Progress tracking
                "steps_completed": [],
                "edit_history": [],  # Track user edits to their proposal
                
                # Approver modifications (filled when approver edits before approval)
                "approver_modified": False,
                "approver_modifications": None,
                "original_proposal_data": None,  # Set when approver modifies
                
                # Metadata
                "created_at": now,
                "updated_at": now,
            }
            
            await db.approval_requests.insert_one(proposal)
            
            # Notify approvers
            try:
                from shared.notifications import create_notification
                for aid in current_approvers:
                    await create_notification(
                        user_id=aid, org_id=org_id,
                        title="New Proposal Submitted",
                        message=f"{user_name or 'A user'} submitted a proposal for review",
                        notification_type="approval",
                        link="/workflow/approver-queue",
                        metadata={"entity_id": record_id, "proposal_id": proposal_id},
                    )
            except Exception as e:
                print(f"Warning: Failed to send proposal notification: {e}")
            
            return proposal
    
    async def approver_edit_proposal(
        self,
        proposal_id: str,
        approver_id: str,
        modified_data: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """
        Approver edits a proposal before approving.
        Preserves original submission for audit trail.
        
        Handles both ESG records (field_values) and emission records (dynamic_field_values).
        """
        proposal = await db.approval_requests.find_one(
            {"id": proposal_id, "status": {"$in": ["pending", "in_review"]}},
            {"_id": 0}
        )
        
        if not proposal:
            return None
        
        now = datetime.now(timezone.utc).isoformat()
        entity_type = proposal.get("entity_type", "esg_record")
        
        # Get approver info
        approver = await db.users.find_one({"id": approver_id}, {"_id": 0, "email": 1, "full_name": 1})
        approver_email = approver.get("email", "") if approver else ""
        approver_name = approver.get("full_name", "") if approver else ""
        
        # Store original if not already stored
        original = proposal.get("original_proposal_data")
        if not original:
            original = proposal.get("entity_snapshot")
        
        # Build the updated entity_snapshot based on entity type
        current_snapshot = proposal.get("entity_snapshot", {})
        new_snapshot = {**current_snapshot}
        
        if entity_type == "emission_record":
            # For emission records, update the correct nested field
            field_values = modified_data.get("field_values", {})
            
            if field_values:
                def merge_inputs(target: Dict[str, Any]) -> Dict[str, Any]:
                    merged = {**target}
                    for key, value in field_values.items():
                        if key.startswith("override_") and isinstance(merged.get(key[9:]), dict):
                            merged[key[9:]] = {**merged[key[9:]], "is_override": bool(value)}
                        elif key.endswith("_justification") and isinstance(merged.get(key[:-14]), dict):
                            merged[key[:-14]] = {**merged[key[:-14]], "justification": value}
                        elif key.endswith("_unit") and isinstance(merged.get(key[:-5]), dict):
                            merged[key[:-5]] = {**merged[key[:-5]], "unit": value}
                        elif key.startswith("override_") or key.endswith(("_justification", "_unit")):
                            continue
                        elif isinstance(merged.get(key), dict) and "value" in merged[key]:
                            try:
                                value = float(value) if value not in (None, "") else value
                            except (TypeError, ValueError):
                                pass
                            merged[key] = {**merged[key], "value": value}
                        else:
                            merged[key] = value
                    return merged

                final_inputs = None
                if "dynamic_field_values" in new_snapshot:
                    new_snapshot["dynamic_field_values"] = final_inputs = merge_inputs(new_snapshot.get("dynamic_field_values", {}))
                if "proposed_changes" in new_snapshot and "inputs" in new_snapshot.get("proposed_changes", {}):
                    final_inputs = merge_inputs(new_snapshot["proposed_changes"].get("inputs", {}))
                    new_snapshot["proposed_changes"] = {**new_snapshot["proposed_changes"], "inputs": final_inputs}
                if "inputs" in new_snapshot and "proposed_changes" not in new_snapshot:
                    new_snapshot["inputs"] = final_inputs = merge_inputs(new_snapshot.get("inputs", {}))

                if final_inputs:
                    record = await db.emission_records.find_one({"id": proposal.get("entity_id")}, {"_id": 0}) or {}
                    recalculated = await self._recalculate_emissions({**record, **{k: v for k, v in new_snapshot.items() if k in ("formula_id", "category_id", "scope")}}, final_inputs, strict=True)
                    if recalculated:
                        totals = {k: recalculated.get(k, 0) for k in ("co2_emissions", "ch4_emissions", "n2o_emissions", "co2e_emissions", "total_emissions")}
                        new_snapshot.update(totals)
                        new_snapshot["outputs"] = recalculated.get("outputs", {})
                        if "proposed_changes" in new_snapshot:
                            new_snapshot["proposed_changes"] = {**new_snapshot["proposed_changes"], **totals, "outputs": recalculated.get("outputs", {})}
            for key in self.EMISSION_DETAIL_FIELDS:
                if key in modified_data:
                    new_snapshot[key] = modified_data[key]
            if modified_data.get("employee_inputs"):
                record = await db.emission_records.find_one({"id": proposal.get("entity_id")}, {"_id": 0}) or {}
                await self._apply_employee_edits(new_snapshot, {**record, **new_snapshot}, modified_data["employee_inputs"])
        else:
            # For ESG records, update field_values directly
            if "field_values" in modified_data:
                new_snapshot["field_values"] = {
                    **new_snapshot.get("field_values", {}),
                    **modified_data["field_values"]
                }
            # Also merge any other top-level modifications
            for key, value in modified_data.items():
                if key != "field_values":
                    new_snapshot[key] = value
        
        new_snapshot["approver_edited"] = True
        changed_fields = (self._changed_edit_fields(current_snapshot, new_snapshot) if entity_type == "esg_record"
                          else self._changed_emission_fields(current_snapshot, new_snapshot))
        
        # Update with approver's modifications
        update_data = {
            "approver_modified": True,
            "original_proposal_data": original,
            "approver_modifications": {
                "modified_by": approver_id,
                "modified_by_email": approver_email,
                "modified_by_name": approver_name,
                "modified_at": now,
                "modified_data": modified_data,
            },
            "entity_snapshot": new_snapshot,
            "updated_at": now,
        }
        
        update_op: Dict[str, Any] = {"$set": update_data}
        if changed_fields:
            update_op["$push"] = {"approver_edits": {
                "level": proposal.get("current_level") or 1, "by_id": approver_id, "by_name": approver_name or approver_email,
                "at": now, "fields": changed_fields,
            }}
        await db.approval_requests.update_one({"id": proposal_id}, update_op)
        
        return await db.approval_requests.find_one({"id": proposal_id}, {"_id": 0})

    EMISSION_DETAIL_FIELDS = (
        "notes", "source_of_information", "record_source", "responsible_person", "responsible_person_designation",
        "responsible_person_contact", "process_names", "process_descriptions", "evidence_files",
        "supplier_name", "supplier_code", "asset_name", "from_location", "to_location",
    )

    async def _apply_employee_edits(self, snapshot: Dict[str, Any], context: Dict[str, Any], edits: List[Dict[str, Any]]) -> None:
        """Apply approver edits to C7 employee inputs, recalculating each edited employee and the record total."""
        from fastapi import HTTPException
        employees = copy.deepcopy(snapshot.get("employees") or [])
        by_id = {e.get("id"): e for e in employees}
        shared = {k: {"value": context.get(k), "unit": ""} for k in
                  ("scope3_ef_id", "scope3_activity", "scope3_activity_type", "scope3_subcategory", "calculation_method_scope3") if context.get(k)}
        formula_doc = await db.ce_formulas.find_one({"id": context.get("formula_id")}, {"_id": 0}) or {}
        expected_units = {i.get("variable"): i.get("expected_unit") or "" for i in (formula_doc.get("definition", formula_doc).get("inputs") or [])}
        for edit in edits:
            employee = by_id.get(edit.get("id"))
            if not employee:
                continue
            period = edit.get("period_key")
            slot = employee.setdefault("yearly_data", {}) if period == "yearly" else (
                employee.setdefault("monthly_data", {}).setdefault(period, {}) if employee.get("monthly_data") and period in employee["monthly_data"] else employee)
            new_inputs = {k: v for k, v in (edit.get("inputs") or {}).items() if v not in (None, "")}
            engine_inputs = dict(shared)
            for key, value in new_inputs.items():
                if key.endswith("_unit"):
                    continue
                try:
                    engine_inputs[key] = {"value": float(value), "unit": new_inputs.get(f"{key}_unit") or expected_units.get(key, "")}
                except (TypeError, ValueError):
                    engine_inputs[key] = {"value": value, "unit": new_inputs.get(f"{key}_unit") or expected_units.get(key, "")}
            result = await self._recalculate_emissions(context, engine_inputs, strict=True)
            if not result:
                raise HTTPException(status_code=422, detail=f"Could not recalculate emissions for {employee.get('name') or 'employee'}")
            slot["inputs"] = new_inputs
            slot["emissions"] = {**(slot.get("emissions") or {}), "co2e": result["co2e_emissions"], "co2": result["co2_emissions"],
                                 "ch4": result["ch4_emissions"], "n2o": result["n2o_emissions"]}
        def employee_co2e(emp: Dict[str, Any]) -> float:
            periods = list((emp.get("monthly_data") or {}).values()) or ([emp["yearly_data"]] if emp.get("yearly_data") else [emp])
            return sum(float((p.get("emissions") or {}).get("co2e") or 0) for p in periods)
        total = sum(employee_co2e(e) for e in employees)
        snapshot["employees"] = employees
        snapshot["co2e_emissions"] = snapshot["total_emissions"] = total
        if isinstance(snapshot.get("yearly_total"), dict):
            snapshot["yearly_total"] = {**snapshot["yearly_total"], "co2e": total}

    @classmethod
    def _changed_emission_fields(cls, before: Dict[str, Any], after: Dict[str, Any]) -> List[str]:
        """Names of the inputs and detail fields an approver changed on an emission request."""
        def inputs(snapshot: Dict[str, Any]) -> Dict[str, Any]:
            return (snapshot.get("proposed_changes") or {}).get("inputs") or snapshot.get("dynamic_field_values") or snapshot.get("inputs") or {}
        old_in, new_in = inputs(before), inputs(after)
        employees_changed = before.get("employees") != after.get("employees")
        changed = [k.replace("_", " ").title() for k in sorted(set(old_in) | set(new_in)) if old_in.get(k) != new_in.get(k)]
        labels = {"notes": "Notes", "source_of_information": "Source of information", "responsible_person": "Person responsible",
                  "responsible_person_designation": "Designation", "responsible_person_contact": "Contact",
                  "process_names": "Process names", "process_descriptions": "Process descriptions", "evidence_files": "Evidence",
                  "supplier_name": "Supplier name", "supplier_code": "Supplier code", "asset_name": "Asset name",
                  "from_location": "From location", "to_location": "To location"}
        changed += [label for key, label in labels.items() if (before.get(key) or None) != (after.get(key) or None)]
        return changed + (["Employee inputs"] if employees_changed else [])

    @staticmethod
    def _changed_edit_fields(before: Dict[str, Any], after: Dict[str, Any]) -> List[str]:
        """Names of the data fields an approver changed between two snapshots."""
        old_fv, new_fv = before.get("field_values") or {}, after.get("field_values") or {}
        changed = [k.replace("_", " ").title() for k in sorted(set(old_fv) | set(new_fv)) if old_fv.get(k) != new_fv.get(k)]
        labels = {"notes": "Notes", "source_of_information": "Source of information", "evidence_files": "Evidence"}
        changed += [label for key, label in labels.items() if before.get(key) != after.get(key)]
        return changed

    async def _approver_chain(self, proposal: Dict[str, Any]) -> List[str]:
        """Ordered approver ids for the assignment behind a request."""
        workflow_id = proposal.get("workflow_id") or ""
        assignment = None
        if workflow_id.startswith("assignment_"):
            assignment = await db.esg_assignments.find_one({"id": workflow_id[len("assignment_"):]}, {"_id": 0})
        if not assignment:
            snap = proposal.get("entity_snapshot") or {}
            query = {"organization_id": proposal.get("organization_id"), "category": snap.get("category"),
                     "subcategory": snap.get("subcategory")}
            assignment = (await db.esg_assignments.find_one({**query, "facility_id": snap.get("facility_id")}, {"_id": 0})
                          if snap.get("facility_id") else None) or await db.esg_assignments.find_one(query, {"_id": 0})
        if not assignment:
            return []
        chain = [c if isinstance(c, str) else (c or {}).get("approver_id") for c in assignment.get("approval_chain") or []]
        chain = [c for c in chain if c]
        return chain or ([assignment["approver_id"]] if assignment.get("approver_id") else [])

    async def _advance_level(self, proposal: Dict[str, Any], approver_id: str, approver_name: str, approver_email: str,
                             comment: Optional[str], now: str) -> Optional[Dict[str, Any]]:
        """Approve the current level of a multi-level ESG request and hand it to the next approver."""
        level = proposal.get("current_level") or 1
        chain = await self._approver_chain(proposal)
        if level >= len(chain):
            return None
        next_approver = chain[level]
        snapshot = proposal.get("entity_snapshot") or {}
        section_to_collection = {"environment": "environment_records", "social": "social_records", "governance": "governance_records"}
        collection = db[section_to_collection.get(proposal.get("entity_subtype"), "environment_records")]
        record = await collection.find_one({"id": proposal.get("entity_id")}, {"_id": 0, "approval_status": 1})
        if record and record.get("approval_status") in ("pending_approval", "pending"):
            saved = {k: snapshot[k] for k in ("field_values", "notes", "source_of_information", "evidence_files") if k in snapshot}
            if saved:
                await collection.update_one({"id": proposal.get("entity_id")}, {"$set": {**saved, "updated_at": now}})
        edits = [e for e in proposal.get("approver_edits") or [] if e.get("level") == level]
        await db.approval_requests.update_one(
            {"id": proposal["id"]},
            {"$set": {"current_level": level + 1, "current_approvers": [next_approver], "status": "pending", "updated_at": now},
             "$push": {"steps_completed": {
                 "id": str(uuid.uuid4()), "level": level, "level_name": f"Level {level}", "action": "approve",
                 "actor_id": approver_id, "actor_email": approver_email, "actor_name": approver_name,
                 "comment": comment, "timestamp": now, "edited_fields": [f for e in edits for f in e.get("fields", [])],
             }}},
        )
        try:
            from shared.notifications import create_notification
            await create_notification(
                user_id=next_approver, org_id=proposal.get("organization_id"), title="Approval Required",
                message=f"{approver_name or 'An approver'} approved level {level}; it now needs your approval",
                notification_type="approval", link="/workflow/approver-queue",
                metadata={"entity_id": proposal.get("entity_id"), "proposal_id": proposal["id"]},
            )
        except Exception as error:
            logger.warning(f"Failed to notify next approver: {error}")
        return {"success": True, "proposal_id": proposal["id"], "advanced_to_level": level + 1, "auto_rejected_count": 0}
    
    async def approve_proposal(
        self,
        proposal_id: str,
        approver_id: str,
        approval_comment: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Approve a proposal.
        
        This will:
        1. Apply the proposed changes to the approved record
        2. Mark this proposal as approved
        3. Auto-reject all other pending proposals for the same record
        4. Create version history entry
        5. Notify the submitter and auto-rejected users
        """
        proposal = await db.approval_requests.find_one(
            {"id": proposal_id, "status": {"$in": ["pending", "in_review"]}},
            {"_id": 0}
        )
        
        if not proposal:
            return {"error": "Proposal not found or already resolved"}
        
        record_id = proposal.get("entity_id")
        entity_type = proposal.get("entity_type")
        org_id = proposal.get("organization_id")
        
        now = datetime.now(timezone.utc).isoformat()
        
        # Get approver info
        approver = await db.users.find_one({"id": approver_id}, {"_id": 0, "email": 1, "full_name": 1})
        approver_email = approver.get("email", "") if approver else ""
        approver_name = approver.get("full_name", "") if approver else ""
        
        if entity_type == "esg_record" and (proposal.get("current_level") or 1) < (proposal.get("total_levels") or 1):
            advanced = await self._advance_level(proposal, approver_id, approver_name, approver_email, approval_comment, now)
            if advanced:
                return advanced
        
        # Get the final data to apply (may include approver modifications)
        entity_snapshot = proposal.get("entity_snapshot", {})
        
        # Remove metadata fields from snapshot before applying to record
        apply_data = {k: v for k, v in entity_snapshot.items() 
                      if k not in ["is_proposal", "current_record_data", "changes_summary", "approver_edited"]}
        
        # 1. Apply changes to the approved record
        await self._apply_proposal_to_record(
            record_id=record_id,
            entity_type=entity_type,
            entity_subtype=proposal.get("entity_subtype"),
            apply_data=apply_data,
            proposal=proposal,
            approver_id=approver_id,
            approver_email=approver_email,
            approver_name=approver_name,
        )
        
        # 2. Mark this proposal as approved
        await db.approval_requests.update_one(
            {"id": proposal_id},
            {"$set": {
                "status": "approved",
                "resolved_at": now,
                "resolved_by": approver_id,
                "resolution_comment": approval_comment,
                "steps_completed": [
                    *proposal.get("steps_completed", []),
                    {
                        "id": str(uuid.uuid4()),
                        "level": proposal.get("current_level") or 1,
                        "level_name": f"Level {proposal.get('current_level') or 1}",
                        "action": "approve",
                        "actor_id": approver_id,
                        "actor_email": approver_email,
                        "actor_name": approver_name,
                        "comment": approval_comment,
                        "timestamp": now,
                    }
                ],
                "updated_at": now,
            }}
        )
        
        # 3. Auto-reject all other pending proposals for this record
        other_proposals = await db.approval_requests.find(
            {
                "entity_id": record_id,
                "entity_type": entity_type,
                "id": {"$ne": proposal_id},
                "status": {"$in": ["pending", "in_review"]},
            },
            {"_id": 0, "id": 1, "submitted_by": 1, "submitted_by_name": 1}
        ).to_list(100)
        
        auto_reject_reason = "Another proposal for this record was approved"
        
        for other in other_proposals:
            await db.approval_requests.update_one(
                {"id": other["id"]},
                {"$set": {
                    "status": "rejected",
                    "resolved_at": now,
                    "resolved_by": "system",
                    "resolution_comment": auto_reject_reason,
                    "auto_rejected": True,
                    "auto_rejected_because": proposal_id,
                    "updated_at": now,
                }}
            )
            
            # Notify user their proposal was auto-rejected
            try:
                from shared.notifications import create_notification
                await create_notification(
                    user_id=other["submitted_by"],
                    org_id=org_id,
                    title="Proposal Not Approved",
                    message=f"Your pending changes were not approved because another proposal for the same record was approved.",
                    notification_type="approval_result",
                    link="/workflow/approver-queue",
                    metadata={
                        "entity_id": record_id,
                        "proposal_id": other["id"],
                        "reason": auto_reject_reason,
                    },
                )
            except Exception as e:
                print(f"Warning: Failed to send auto-reject notification: {e}")
        
        # 4. Notify the submitter their proposal was approved
        try:
            from shared.notifications import create_notification
            await create_notification(
                user_id=proposal["submitted_by"],
                org_id=org_id,
                title="Proposal Approved",
                message=f"Your proposal was approved by {approver_name or 'an approver'}",
                notification_type="approval_result",
                link=f"/records/{proposal.get('entity_subtype')}/{record_id}",
                metadata={
                    "entity_id": record_id,
                    "proposal_id": proposal_id,
                },
            )
        except Exception as e:
            print(f"Warning: Failed to send approval notification: {e}")
        
        await self._sync_task_status(proposal)
        
        return {
            "success": True,
            "proposal_id": proposal_id,
            "auto_rejected_count": len(other_proposals),
        }
    
    async def reject_proposal(
        self,
        proposal_id: str,
        approver_id: str,
        rejection_reason: str,
    ) -> Dict[str, Any]:
        """
        Reject a proposal.
        Other pending proposals remain unaffected.
        """
        proposal = await db.approval_requests.find_one(
            {"id": proposal_id, "status": {"$in": ["pending", "in_review"]}},
            {"_id": 0}
        )
        
        if not proposal:
            return {"error": "Proposal not found or already resolved"}
        
        now = datetime.now(timezone.utc).isoformat()
        
        # Get approver info
        approver = await db.users.find_one({"id": approver_id}, {"_id": 0, "email": 1, "full_name": 1})
        approver_email = approver.get("email", "") if approver else ""
        approver_name = approver.get("full_name", "") if approver else ""
        
        # Mark proposal as rejected
        await db.approval_requests.update_one(
            {"id": proposal_id},
            {"$set": {
                "status": "rejected",
                "resolved_at": now,
                "resolved_by": approver_id,
                "resolution_comment": rejection_reason,
                "steps_completed": [
                    *proposal.get("steps_completed", []),
                    {
                        "id": str(uuid.uuid4()),
                        "level": proposal.get("current_level") or 1,
                        "level_name": f"Level {proposal.get('current_level') or 1}",
                        "action": "reject",
                        "actor_id": approver_id,
                        "actor_email": approver_email,
                        "actor_name": approver_name,
                        "comment": rejection_reason,
                        "timestamp": now,
                    }
                ],
                "updated_at": now,
            }}
        )

        if proposal.get("entity_type") == "emission_record":
            current = await db.emission_records.find_one({"id": proposal.get("entity_id")}, {"_id": 0})
            if current:
                rejected_preview = build_rejected_emission_preview(current, proposal)
                history_event = build_emission_proposal_history_event(
                    current,
                    rejected_preview,
                    proposal,
                    action="rejected",
                    actor_id=approver_id,
                    actor_email=approver_email,
                    actor_name=approver_name,
                    timestamp=now,
                    rejection_reason=rejection_reason,
                )
                history_event["record_was_changed"] = False
                await db.emission_history.insert_one(history_event)
        elif proposal.get("entity_type") == "esg_record":
            section_to_collection = {
                "environment": "environment_records",
                "social": "social_records",
                "governance": "governance_records",
            }
            collection_name = section_to_collection.get(proposal.get("entity_subtype"), "environment_records")
            collection = db[collection_name]
            current = await collection.find_one({"id": proposal.get("entity_id")}, {"_id": 0})
            if current:
                rejected_preview = build_rejected_esg_preview(current, proposal)
                version_event = build_esg_proposal_version_event(
                    current,
                    rejected_preview,
                    proposal,
                    section=proposal.get("entity_subtype") or "environment",
                    action="rejected",
                    actor_id=approver_id,
                    actor_email=approver_email,
                    actor_name=approver_name,
                    timestamp=now,
                    rejection_reason=rejection_reason,
                )
                version_event["record_was_changed"] = False
                await db[collection_name.replace("_records", "_record_versions")].insert_one(version_event)
                # A rejected first submission is the pending item itself; a rejected edit leaves the approved data as is.
                if current.get("approval_status") == "pending_approval":
                    await collection.update_one(
                        {"id": proposal.get("entity_id")},
                        {"$set": {"approval_status": "rejected", "rejection_reason": rejection_reason}},
                    )
        
        # Notify the submitter
        try:
            from shared.notifications import create_notification
            await create_notification(
                user_id=proposal["submitted_by"],
                org_id=proposal.get("organization_id"),
                title="Proposal Rejected",
                message=f"Your proposal was rejected: {rejection_reason[:100]}",
                notification_type="approval_result",
                link="/workflow/approver-queue",
                metadata={
                    "entity_id": proposal.get("entity_id"),
                    "proposal_id": proposal_id,
                    "reason": rejection_reason,
                },
            )
        except Exception as e:
            print(f"Warning: Failed to send rejection notification: {e}")
        
        await self._sync_task_status(proposal)
        
        return {
            "success": True,
            "proposal_id": proposal_id,
        }
    
    async def _sync_task_status(self, proposal: Dict[str, Any]) -> None:
        """Re-sync the stored status of the reporting tasks this proposal's record belongs to."""
        if proposal.get("entity_type") != "esg_record":
            return
        snapshot = proposal.get("entity_snapshot") or {}
        query = {"organization_id": proposal.get("organization_id"), "category": snapshot.get("category")}
        for key in ("subcategory", "sub_subcategory"):
            if snapshot.get(key):
                query[key] = snapshot[key]
        try:
            from modules.esg_records.task_engine import sync_tasks_matching
            await sync_tasks_matching(db, query)
        except Exception as e:
            print(f"Warning: Failed to sync task status: {e}")
    
    async def _apply_proposal_to_record(
        self,
        record_id: str,
        entity_type: str,
        entity_subtype: str,
        apply_data: Dict[str, Any],
        proposal: Dict[str, Any],
        approver_id: str,
        approver_email: str,
        approver_name: str,
    ):
        """
        Apply approved proposal data to the record.
        Creates version history entry.
        
        Handles both ESG records (field_values) and emission records (dynamic_field_values).
        """
        now = datetime.now(timezone.utc).isoformat()
        
        if entity_type == "esg_record":
            # Determine collection based on subtype (section)
            section_to_collection = {
                "environment": "environment_records",
                "social": "social_records",
                "governance": "governance_records",
            }
            collection_name = section_to_collection.get(entity_subtype, "environment_records")
            versions_collection = collection_name.replace("_records", "_record_versions")
            
            collection = db[collection_name]
            versions = db[versions_collection]
            
        elif entity_type == "emission_record":
            collection = db.emission_records
            versions = db.emission_history
            
        else:
            # Fallback
            collection = db[f"{entity_type}s"]
            versions = db[f"{entity_type}_versions"]
        
        # Get current record
        current = await collection.find_one({"id": record_id}, {"_id": 0})
        if not current:
            return
        
        # Update the record with approved data
        update_fields = {
            "approval_status": "approved",
            "status": "completed",
            "updated_at": now,
            "last_approved_at": now,
            "last_approved_by": approver_id,
        }
        
        if entity_type == "emission_record":
            update_fields["version"] = (current.get("version") or 0) + 1
            # For emission records, copy all relevant fields from apply_data
            
            # Determine the final dynamic_field_values to use
            # IMPORTANT: Check proposed_changes.inputs FIRST as it contains the NEW values
            # dynamic_field_values in the snapshot contains ORIGINAL values
            final_dfv = None
            
            if "proposed_changes" in apply_data and "inputs" in apply_data.get("proposed_changes", {}):
                # proposed_changes.inputs contains the NEW proposed values - use these
                current_dfv = current.get("dynamic_field_values", {})
                proposed_inputs = apply_data["proposed_changes"]["inputs"]
                final_dfv = {**current_dfv}
                for key, value in proposed_inputs.items():
                    final_dfv[key] = value
                logger.info(f"[APPROVAL] Using proposed_changes.inputs for update: {list(proposed_inputs.keys())}")
            elif "inputs" in apply_data and "dynamic_field_values" not in apply_data:
                # Legacy format - inputs directly in apply_data (no snapshot structure)
                final_dfv = apply_data["inputs"]
                logger.info(f"[APPROVAL] Using legacy inputs format for update")
            elif "dynamic_field_values" in apply_data:
                # Fallback to dynamic_field_values only if no proposed_changes
                # This handles cases where the entire record is being created/replaced
                final_dfv = apply_data["dynamic_field_values"]
                logger.info(f"[APPROVAL] Using dynamic_field_values from snapshot for update")
            
            if final_dfv:
                update_fields["dynamic_field_values"] = final_dfv
            
            # Check if approver modified the proposal - if so, recalculate emissions
            approver_modified = proposal.get("approver_modified", False)
            recalculated = {}
            
            if approver_modified and final_dfv:
                logger.info(f"[APPROVAL] Approver modified emission proposal, recalculating emissions...")
                recalculated = await self._recalculate_emissions(current, final_dfv)
            
            # Use recalculated values if available, otherwise fall back to proposal values
            if recalculated:
                # Use recalculated outputs and emissions
                update_fields["outputs"] = recalculated.get("outputs", {})
                update_fields["co2_emissions"] = recalculated.get("co2_emissions", 0)
                update_fields["ch4_emissions"] = recalculated.get("ch4_emissions", 0)
                update_fields["n2o_emissions"] = recalculated.get("n2o_emissions", 0)
                update_fields["co2e_emissions"] = recalculated.get("co2e_emissions", 0)
                update_fields["total_emissions"] = recalculated.get("total_emissions", 0)
            else:
                # Use values from proposal (original calculation or no recalc needed)
                # IMPORTANT: Check proposed_changes.outputs FIRST as it contains the NEW calculated values
                if "proposed_changes" in apply_data and "outputs" in apply_data.get("proposed_changes", {}):
                    proposed_outputs = apply_data["proposed_changes"]["outputs"]
                    update_fields["outputs"] = proposed_outputs
                    output_field_map = {
                        "co2": "co2_emissions",
                        "ch4": "ch4_emissions",
                        "n2o": "n2o_emissions",
                        "co2e": "co2e_emissions",
                    }
                    for output_key, emission_field in output_field_map.items():
                        output_value = proposed_outputs.get(output_key)
                        if isinstance(output_value, dict) and output_value.get("value") is not None:
                            update_fields[emission_field] = output_value["value"]
                    co2e_output = proposed_outputs.get("co2e")
                    if isinstance(co2e_output, dict) and co2e_output.get("value") is not None:
                        update_fields["total_emissions"] = co2e_output["value"]
                    logger.info(f"[APPROVAL] Using proposed_changes.outputs for update")
                elif "outputs" in apply_data:
                    update_fields["outputs"] = apply_data["outputs"]
                
                # Copy emission values - check proposed_changes first for these too
                proposed_changes = apply_data.get("proposed_changes", {})
                emission_fields = [
                    "co2e_emissions", "co2_emissions", "ch4_emissions", "n2o_emissions",
                    "total_emissions", "biogenic_co2_emissions"
                ]
                for field in emission_fields:
                    # First check proposed_changes for updated emission values
                    if field in proposed_changes:
                        update_fields[field] = proposed_changes[field]
                    elif field in apply_data:
                        update_fields[field] = apply_data[field]
            
            # Copy other emission-specific fields (regardless of recalculation)
            other_emission_fields = [
                "category", "sub_category", "fuel_type", "scope", 
                "reporting_period", "frequency_type", "notes",
                "evidence_files", "has_custom_ef", "emission_factor_used",
                "calculation_method_scope3", "scope3_activity", "biogenic_scope_selection",
                "source_of_information", "record_source", "responsible_person", "responsible_person_designation",
                "responsible_person_contact", "process_names", "process_descriptions",
                "employees", "monthly_totals", "yearly_total", "from_location", "to_location", "supplier_name", "supplier_code", "asset_name",
            ]
            for field in other_emission_fields:
                if field in apply_data:
                    update_fields[field] = apply_data[field]
                    
        else:
            # For generic ESG records, apply the approved field values and advance the record version.
            update_fields["version"] = (current.get("version") or 0) + 1
            if "field_values" in apply_data:
                update_fields["field_values"] = apply_data["field_values"]
            
            # Copy other approved fields
            for key in ["category", "subcategory", "sub_subcategory", "reporting_period", "notes", "source_of_information", "evidence_files"]:
                if key in apply_data:
                    update_fields[key] = apply_data[key]
        
        await collection.update_one(
            {"id": record_id},
            {"$set": update_fields}
        )
        if entity_type == "emission_record":
            from shared.helpers.audit_helpers import get_input_label_map_from_db
            label_map = await get_input_label_map_from_db(db)
            updated = await collection.find_one({"id": record_id}, {"_id": 0})
            history_event = build_emission_proposal_history_event(
                current,
                updated or {**current, **update_fields},
                proposal,
                action="approved",
                actor_id=approver_id,
                actor_email=approver_email,
                actor_name=approver_name,
                timestamp=now,
                input_label_map=label_map,
            )
            lifecycle = build_emission_lifecycle_events(current, updated or {**current, **update_fields}, proposal, history_event, label_map)
            await db.emission_history.insert_many([*lifecycle, history_event])
        elif entity_type == "esg_record":
            updated = await collection.find_one({"id": record_id}, {"_id": 0})
            version_event = build_esg_proposal_version_event(
                current,
                updated or {**current, **update_fields},
                proposal,
                section=entity_subtype,
                action="approved",
                actor_id=approver_id,
                actor_email=approver_email,
                actor_name=approver_name,
                timestamp=now,
            )
            await versions.insert_one(version_event)
    
    async def count_pending_proposals(
        self,
        record_id: str,
        entity_type: str = "esg_record",
    ) -> int:
        """Count pending proposals for a record."""
        return await db.approval_requests.count_documents({
            "entity_id": record_id,
            "entity_type": entity_type,
            "status": {"$in": ["pending", "in_review"]},
        })
    
    async def _recalculate_emissions(
        self,
        current_record: Dict[str, Any],
        new_dynamic_field_values: Dict[str, Any],
        strict: bool = False,
    ) -> Dict[str, Any]:
        """
        Recalculate emissions using CalcEngine when approver modifies input values.
        
        Args:
            current_record: The existing approved emission record
            new_dynamic_field_values: The updated input values from approver
            
        Returns:
            Dict with recalculated outputs and emission values, or empty dict on failure
        """
        try:
            from calc_engine.execution import CalcEngine, CalculationError
            from calc_engine.formulas import resolve_formula_id, get_decision_tree_for_category
            
            # Get formula_id from the record
            formula_id = current_record.get("formula_id")
            category_id = current_record.get("category_id")
            scope = current_record.get("scope", "scope1")
            
            # If no formula_id, try to resolve from decision tree
            if not formula_id and category_id:
                try:
                    decision_inputs = {
                        "calculation_method_scope3": current_record.get("calculation_method_scope3"),
                        "scope3_activity": current_record.get("scope3_activity"),
                    }
                    formula_id, _ = await resolve_formula_id(
                        db, category_id, decision_inputs
                    )
                except Exception as e:
                    logger.warning(f"[RECALC] Failed to resolve formula from decision tree: {e}")
            
            if not formula_id:
                logger.warning(f"[RECALC] No formula_id found for record, skipping recalculation")
                return {}
            
            # Fetch the formula
            formula_doc = await db.ce_formulas.find_one({"id": formula_id}, {"_id": 0})
            if not formula_doc:
                logger.warning(f"[RECALC] Formula {formula_id} not found")
                return {}
            
            formula = formula_doc.get("definition", formula_doc)
            
            # Build inputs from new_dynamic_field_values
            # The CalcEngine expects inputs in format: { "qty": {"value": 100, "unit": "L"} }
            inputs = {}
            user_overrides = {}
            
            for key, val in new_dynamic_field_values.items():
                if val is None:
                    continue
                    
                if isinstance(val, dict) and "value" in val:
                    if val.get("value") is None and not val.get("is_override"):
                        continue
                    # Already in correct format
                    if val.get("is_override"):
                        user_overrides[key] = val
                    else:
                        inputs[key] = val
                else:
                    # Simple value - wrap it
                    inputs[key] = {"value": val, "unit": ""}
            
            # Build context
            context = {
                "fuel_code": current_record.get("fuel_database_id") or current_record.get("fuel_type"),
                "fuel_database_id": current_record.get("fuel_database_id"),
                "fuel_name": current_record.get("fuel_type") or current_record.get("sub_category"),
                "scope": scope,
                "category_id": category_id,
                "reporting_period": current_record.get("reporting_period"),
            }
            await self._resolve_spend_overrides(current_record, new_dynamic_field_values, inputs, user_overrides, context)
            ef_ref = new_dynamic_field_values.get("scope3_ef_id") or current_record.get("scope3_ef_id")
            ef_id = ef_ref.get("value") if isinstance(ef_ref, dict) else ef_ref
            if ef_id:
                ef_row = await db.scope3_ef.find_one({"id": ef_id}, {"_id": 0})
                if ef_row:
                    context.update({
                        "scope3_ef_id": ef_id, "fuel_name": ef_row.get("activity"), "activity": ef_row.get("activity"),
                        "activity_type": ef_row.get("activity_type"), "scope3_ef_default_unit": ef_row.get("default_unit") or "",
                    })
            
            # Execute CalcEngine
            calc_engine = CalcEngine(db)
            result = await calc_engine.execute(
                formula,
                inputs,
                context=context,
                user_overrides=user_overrides,
                dry_run=False,
                emission_record_id=current_record.get("id"),
                org_id=current_record.get("organization_id"),
            )
            
            outputs = result.get("outputs", {})
            
            # Extract emission values
            recalculated = {
                "outputs": outputs,
                "co2_emissions": outputs.get("co2", {}).get("value", 0) or 0,
                "ch4_emissions": outputs.get("ch4", {}).get("value", 0) or 0,
                "n2o_emissions": outputs.get("n2o", {}).get("value", 0) or 0,
                "co2e_emissions": outputs.get("co2e", {}).get("value", 0) or 0,
                "total_emissions": outputs.get("co2e", {}).get("value", 0) or 0,
            }
            
            logger.info(f"[RECALC] Successfully recalculated emissions: co2e={recalculated['co2e_emissions']}")
            return recalculated
            
        except HTTPException:
            raise
        except ImportError as e:
            logger.error(f"[RECALC] CalcEngine import error: {e}")
            if strict:
                raise HTTPException(status_code=422, detail=f"Could not recalculate emissions: {e}")
            return {}
        except CalculationError as e:
            logger.error(f"[RECALC] Calculation error: {e}")
            if strict:
                raise HTTPException(status_code=422, detail=f"Could not recalculate emissions: {e}")
            return {}
        except Exception as e:
            logger.error(f"[RECALC] Unexpected error during recalculation: {e}")
            if strict:
                raise HTTPException(status_code=422, detail=f"Could not recalculate emissions: {e}")
            return {}

    async def _resolve_spend_overrides(
        self,
        record: Dict[str, Any],
        values: Dict[str, Any],
        inputs: Dict[str, Any],
        user_overrides: Dict[str, Any],
        context: Dict[str, Any],
    ) -> None:
        """Hydrate exchange_rate / ppp / inflation for spend-basis records, like the calc router does."""
        from calc_engine.currency_conversion import (
            PPP_INFLATION_METHOD, STANDARD_METHOD, normalize_currency_method,
            resolve_currency_conversion, resolve_organization_reporting_settings, currency_conversion_source_name,
        )

        def raw(key):
            v = values.get(key)
            if v is None:
                v = record.get(key)
            return v.get("value") if isinstance(v, dict) else v

        if raw("calculation_method_scope3") != "spend_basis":
            return
        method = normalize_currency_method(raw("spend_currency_conversion_method"))
        currency = None
        for v in values.values():
            if isinstance(v, dict) and str(v.get("unit") or "").upper() in {"INR", "USD", "EUR", "GBP", "JPY", "CNY", "AUD", "CAD"}:
                currency = str(v["unit"]).upper()
                break
        keys = ("exchange_rate",) if method == STANDARD_METHOD else ("inflation_rate", "ppp")
        conversion = None
        if currency and currency != "USD":
            org_id = record.get("organization_id")
            settings = await resolve_organization_reporting_settings(db, organization_id=org_id)
            period = record.get("reporting_period")
            conversion = await resolve_currency_conversion(
                db, source_currency=currency, reporting_period=period,
                reporting_year_type=settings["reporting_year_type"],
                financial_year_start_month=settings["financial_year_start_month"], method=method,
            )
            source = {"exchange_rate": "exchange_rate", "inflation_rate": "inflation_factor", "ppp": "purchase_parity"}
            for key in keys:
                if key in user_overrides:
                    continue
                if not conversion or not conversion.get(source[key]):
                    raise HTTPException(status_code=422, detail=f"No active {key.replace('_', ' ')} configured for {currency} and {period or 'the requested period'}")
                user_overrides[key] = {"value": float(conversion[source[key]]), "unit": "", "source_name": currency_conversion_source_name(conversion, method)}
        else:
            for key in keys:
                if key not in user_overrides:
                    user_overrides[key] = {"value": 1.0, "unit": "", "source_name": "Default (USD)"}
        for key in keys:
            inputs.pop(key, None)


# Singleton instance
proposal_service = ProposalService()
