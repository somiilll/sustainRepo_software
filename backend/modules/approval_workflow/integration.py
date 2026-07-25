"""
Approval Integration Helper

Provides a simple interface for auto-submitting records for approval
when approval_workflow_enabled is true for the organization.

Usage:
    from modules.approval_workflow.integration import submit_record_for_approval
    
    await submit_record_for_approval(
        record_id="...",
        record_type="emission",  # or "environment", "social", "governance"
        record_data={...},
        organization_id="...",
        current_user={...}
    )
"""

import logging
from typing import Optional, Dict, Any

from shared.database.mongo import db
from .models import EntityType, SubmitForApprovalInput
from .service import ApprovalWorkflowService

logger = logging.getLogger(__name__)


async def is_approval_required(organization_id: str) -> bool:
    """Check if organization has approval workflow enabled."""
    org = await db.organizations.find_one(
        {"id": organization_id},
        {"_id": 0, "approval_workflow_enabled": 1}
    )
    return org.get("approval_workflow_enabled", False) if org else False


async def submit_record_for_approval(
    record_id: str,
    record_type: str,
    record_data: Dict[str, Any],
    organization_id: str,
    current_user: Dict[str, Any],
    comment: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Submit a data record for approval if workflow is enabled.
    
    Args:
        record_id: ID of the record
        record_type: Type of record ("emission", "environment", "social", "governance")
        record_data: Snapshot of the record data
        organization_id: Organization ID
        current_user: Current user dict
        comment: Optional submission comment
    
    Returns:
        {"submitted": bool, "message": str, "request": dict or None}
    """
    # Check if approval is required
    if not await is_approval_required(organization_id):
        return {"submitted": False, "message": "Approval workflow not enabled", "request": None}
    
    # Map record type to entity type and subtype
    type_mapping = {
        "emission": (EntityType.EMISSION_RECORD, "emission"),
        "environment": (EntityType.ESG_RECORD, "environment"),
        "social": (EntityType.ESG_RECORD, "social"),
        "governance": (EntityType.ESG_RECORD, "governance"),
    }
    
    if record_type not in type_mapping:
        logger.warning(f"Unknown record type for approval: {record_type}")
        return {"submitted": False, "message": f"Unknown record type: {record_type}", "request": None}
    
    entity_type, entity_subtype = type_mapping[record_type]
    
    # Build submission input
    submit_data = SubmitForApprovalInput(
        entity_type=entity_type,
        entity_id=record_id,
        entity_subtype=entity_subtype,
        entity_snapshot=record_data,
        comment=comment,
    )
    
    # Submit for approval
    success, message, request = await ApprovalWorkflowService.submit_for_approval(
        organization_id=organization_id,
        data=submit_data,
        current_user=current_user,
    )
    
    if success:
        # Update the record's approval_status to pending
        collection_map = {
            "emission": "emission_records",
            "environment": "environment_records",
            "social": "social_records",
            "governance": "governance_records",
        }
        collection = collection_map.get(record_type)
        if collection:
            await db[collection].update_one(
                {"id": record_id},
                {"$set": {"approval_status": "pending"}}
            )
        
        logger.info(f"Record {record_id} submitted for approval: {message}")
    else:
        logger.warning(f"Failed to submit record {record_id} for approval: {message}")
    
    return {"submitted": success, "message": message, "request": request}


async def update_record_approval_status(
    record_id: str,
    record_type: str,
    approval_status: str,
    rejected_by: Optional[str] = None,
    rejection_reason: Optional[str] = None,
) -> bool:
    """
    Update a record's approval_status field.
    
    Called by the approval workflow when decisions are made.
    """
    collection_map = {
        "emission": "emission_records",
        "environment": "environment_records",
        "social": "social_records",
        "governance": "governance_records",
    }
    
    collection = collection_map.get(record_type)
    if not collection:
        return False
    
    update_doc = {"approval_status": approval_status}
    if approval_status == "rejected" and rejected_by:
        update_doc["rejected_by_user_id"] = rejected_by
    if rejection_reason:
        update_doc["rejection_reason"] = rejection_reason
    
    result = await db[collection].update_one(
        {"id": record_id},
        {"$set": update_doc}
    )
    
    return result.modified_count > 0
