"""
Multi-Proposal Approval Service

Handles the new workflow where:
- Multiple users can have pending proposals for the same record
- Each user sees only their own proposal
- Approving one proposal auto-rejects all others
- Approved record stays immutable until approval
"""

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from shared.database.mongo import db

logger = logging.getLogger(__name__)


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
                # Update dynamic_field_values if it exists
                if "dynamic_field_values" in new_snapshot:
                    updated_dfv = {**new_snapshot.get("dynamic_field_values", {})}
                    for key, value in field_values.items():
                        # Preserve the {value, unit} structure if the field originally had it
                        if key in updated_dfv and isinstance(updated_dfv[key], dict) and "value" in updated_dfv[key]:
                            updated_dfv[key] = {**updated_dfv[key], "value": value}
                        else:
                            updated_dfv[key] = value
                    new_snapshot["dynamic_field_values"] = updated_dfv
                
                # Also update proposed_changes.inputs if it exists
                if "proposed_changes" in new_snapshot and "inputs" in new_snapshot.get("proposed_changes", {}):
                    updated_inputs = {**new_snapshot["proposed_changes"].get("inputs", {})}
                    for key, value in field_values.items():
                        if key in updated_inputs and isinstance(updated_inputs[key], dict) and "value" in updated_inputs[key]:
                            updated_inputs[key] = {**updated_inputs[key], "value": value}
                        else:
                            updated_inputs[key] = value
                    new_snapshot["proposed_changes"] = {
                        **new_snapshot.get("proposed_changes", {}),
                        "inputs": updated_inputs
                    }
                
                # Also update inputs if it exists (legacy format)
                if "inputs" in new_snapshot and "proposed_changes" not in new_snapshot:
                    updated_inputs = {**new_snapshot.get("inputs", {})}
                    for key, value in field_values.items():
                        if key in updated_inputs and isinstance(updated_inputs[key], dict) and "value" in updated_inputs[key]:
                            updated_inputs[key] = {**updated_inputs[key], "value": value}
                        else:
                            updated_inputs[key] = value
                    new_snapshot["inputs"] = updated_inputs
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
        
        await db.approval_requests.update_one(
            {"id": proposal_id},
            {"$set": update_data}
        )
        
        return await db.approval_requests.find_one({"id": proposal_id}, {"_id": 0})
    
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
                        "level": 1,
                        "level_name": "Approval",
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
                        "level": 1,
                        "level_name": "Rejection",
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
        
        return {
            "success": True,
            "proposal_id": proposal_id,
        }
    
    async def _apply_proposal_to_record(
        self,
        record_id: str,
        entity_type: str,
        entity_subtype: str,
        apply_data: Dict[str, Any],
        proposal: Dict[str, Any],
        approver_id: str,
        approver_email: str,
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
        
        # Create version snapshot of current state
        version_id = str(uuid.uuid4())
        version_entry = {
            **current,
            "version_id": version_id,
            "version_created_at": now,
            "version_type": "proposal_approved",
            "proposal_id": proposal.get("id"),
            "proposed_by": proposal.get("submitted_by"),
            "proposed_by_email": proposal.get("submitted_by_email"),
            "approved_by": approver_id,
            "approved_by_email": approver_email,
            "was_approver_modified": proposal.get("approver_modified", False),
        }
        
        await versions.insert_one(version_entry)
        
        # Update the record with approved data
        update_fields = {
            "approval_status": "approved",
            "status": "completed",
            "updated_at": now,
            "last_approved_at": now,
            "last_approved_by": approver_id,
        }
        
        if entity_type == "emission_record":
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
                    update_fields["outputs"] = apply_data["proposed_changes"]["outputs"]
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
                "calculation_method_scope3", "scope3_activity", "biogenic_scope_selection"
            ]
            for field in other_emission_fields:
                if field in apply_data:
                    update_fields[field] = apply_data[field]
                    
        else:
            # For ESG records, use existing logic
            # Merge in the approved field values
            if "field_values" in apply_data:
                update_fields["field_values"] = apply_data["field_values"]
            
            # Copy other approved fields
            for key in ["category", "subcategory", "sub_subcategory", "reporting_period", "notes"]:
                if key in apply_data:
                    update_fields[key] = apply_data[key]
        
        await collection.update_one(
            {"id": record_id},
            {"$set": update_fields}
        )
    
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
            
        except ImportError as e:
            logger.error(f"[RECALC] CalcEngine import error: {e}")
            return {}
        except CalculationError as e:
            logger.error(f"[RECALC] Calculation error: {e}")
            return {}
        except Exception as e:
            logger.error(f"[RECALC] Unexpected error during recalculation: {e}")
            return {}


# Singleton instance
proposal_service = ProposalService()
