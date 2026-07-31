"""
Multi-Proposal Approval Service

Handles the new workflow where:
- Multiple users can have pending proposals for the same record
- Each user sees only their own proposal
- Approving one proposal auto-rejects all others
- Approved record stays immutable until approval
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from shared.database.mongo import db


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
        """
        proposal = await db.approval_requests.find_one(
            {"id": proposal_id, "status": {"$in": ["pending", "in_review"]}},
            {"_id": 0}
        )
        
        if not proposal:
            return None
        
        now = datetime.now(timezone.utc).isoformat()
        
        # Get approver info
        approver = await db.users.find_one({"id": approver_id}, {"_id": 0, "email": 1, "full_name": 1})
        approver_email = approver.get("email", "") if approver else ""
        approver_name = approver.get("full_name", "") if approver else ""
        
        # Store original if not already stored
        original = proposal.get("original_proposal_data")
        if not original:
            original = proposal.get("entity_snapshot")
        
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
            "entity_snapshot": {
                **proposal.get("entity_snapshot", {}),
                **modified_data,
                "approver_edited": True,
            },
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


# Singleton instance
proposal_service = ProposalService()
