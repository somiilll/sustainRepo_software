"""Canonical assignment orchestration for supplier assessment modules."""
from typing import Any, Dict, List, Optional


async def synchronize_supplier_assignments(
    relationship: Dict[str, Any],
    document_requirement_ids: Optional[List[str]] = None,
    training_requirement_ids: Optional[List[str]] = None,
    created_by: Optional[str] = None,
) -> Dict[str, List[str]]:
    """Apply explicit module selections without reviving historical assignments."""
    from modules.supplier_assessment import documents_service, training_service

    assignments: Dict[str, List[str]] = {}
    if document_requirement_ids is not None:
        assignments["documents"] = await documents_service.synchronize_document_assignments(
            relationship,
            document_requirement_ids,
            created_by or relationship.get("created_by") or "system",
        )
    if training_requirement_ids is not None:
        assignments["training"] = await training_service.synchronize_training_assignments(
            relationship,
            training_requirement_ids,
        )
    return assignments