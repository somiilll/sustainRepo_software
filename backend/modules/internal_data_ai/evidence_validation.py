"""Evidence-state validation for deterministic Internal Data AI retrieval results."""
from typing import Optional

from modules.internal_data_ai.query_contracts import EvidenceState
from modules.internal_data_ai.reporting_periods import ResolvedPeriod, resolve_record_period_match


def validate_retrieval_evidence(
    records: list[dict],
    *,
    requested_period: Optional[ResolvedPeriod] = None,
    entity_resolution: Optional[dict] = None,
    relationship_evidence: Optional[dict] = None,
    supported: bool = True,
) -> dict:
    """Classify retrieval evidence without changing or fabricating the underlying data."""
    if not supported:
        return {"evidence_state": EvidenceState.NOT_SUPPORTED.value, "records_found": 0, "record_evidence": [], "missing": []}
    if entity_resolution and entity_resolution.get("status") == "AMBIGUOUS":
        return {
            "evidence_state": EvidenceState.AMBIGUOUS.value,
            "records_found": 0,
            "record_evidence": [],
            "missing": ["unambiguous_entity_resolution"],
        }
    if not records:
        return {"evidence_state": EvidenceState.NOT_FOUND.value, "records_found": 0, "record_evidence": [], "missing": []}

    record_evidence = []
    for record in records:
        period_evidence = (
            resolve_record_period_match(record.get("reporting_period"), requested_period)
            if requested_period else {"period_match": "UNSPECIFIED", "allocation_factor": 1.0}
        )
        record_evidence.append({"record_id": record.get("id"), **period_evidence})

    period_matches = {item["period_match"] for item in record_evidence}
    relationship_state = (relationship_evidence or {}).get("evidence_state")
    missing = []
    if relationship_state == EvidenceState.RELATIONSHIP_MISSING.value:
        missing.append("required_record_formula_relationship")
    elif relationship_state == EvidenceState.FOUND_PARTIAL.value:
        missing.append("complete_calculation_relationship")

    if period_matches == {"MISMATCH"}:
        state = EvidenceState.FOUND_BUT_PERIOD_MISMATCH
    elif relationship_state == EvidenceState.RELATIONSHIP_MISSING.value:
        state = EvidenceState.RELATIONSHIP_MISSING
    elif (
        "ANNUAL_VALUE_ALLOCATED_TO_MONTH" in period_matches
        or relationship_state == EvidenceState.FOUND_PARTIAL.value
    ):
        state = EvidenceState.FOUND_PARTIAL
    else:
        state = EvidenceState.FOUND

    return {
        "evidence_state": state.value,
        "records_found": len(records),
        "record_evidence": record_evidence,
        "missing": missing,
    }