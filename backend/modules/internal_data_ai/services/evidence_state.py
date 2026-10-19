"""Async adapter for evidence validation inside the existing service executor."""
from modules.internal_data_ai.evidence_validation import validate_retrieval_evidence
from modules.internal_data_ai.reporting_periods import period_from_payload


async def validate(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    """Validate already authorized retrieval output; org/facility arguments are executor-owned."""
    return validate_retrieval_evidence(
        kwargs.get("emission_records") or [],
        requested_period=period_from_payload(kwargs.get("period")),
        entity_resolution=kwargs.get("entity_resolution"),
        relationship_evidence=kwargs.get("relationships"),
        supported=kwargs.get("supported", True),
    )