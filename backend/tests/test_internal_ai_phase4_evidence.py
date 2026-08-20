from modules.internal_data_ai.evidence_validation import validate_retrieval_evidence
from modules.internal_data_ai.reporting_periods import ResolvedPeriod


def _july():
    return ResolvedPeriod("2026-07", "2026-07", "July 2026", "explicit", fiscal_start_month=4)


def test_exact_record_is_found():
    result = validate_retrieval_evidence([{"id": "r1", "reporting_period": "2026-07"}], requested_period=_july())
    assert result["evidence_state"] == "FOUND"
    assert result["record_evidence"] == [{"record_id": "r1", "period_match": "EXACT", "allocation_factor": 1.0}]


def test_annual_value_is_partial_and_explicitly_derived():
    result = validate_retrieval_evidence([{"id": "r1", "reporting_period": "FY 2026-27"}], requested_period=_july())
    assert result["evidence_state"] == "FOUND_PARTIAL"
    assert result["record_evidence"][0]["period_match"] == "ANNUAL_VALUE_ALLOCATED_TO_MONTH"
    assert result["record_evidence"][0]["allocation_factor"] == 1 / 12


def test_different_period_is_not_reported_as_found_exactly():
    result = validate_retrieval_evidence([{"id": "r1", "reporting_period": "FY 2025-26"}], requested_period=_july())
    assert result["evidence_state"] == "FOUND_BUT_PERIOD_MISMATCH"


def test_missing_ambiguous_unsupported_and_relationship_states_are_explicit():
    assert validate_retrieval_evidence([])["evidence_state"] == "NOT_FOUND"
    assert validate_retrieval_evidence([], entity_resolution={"status": "AMBIGUOUS"})["evidence_state"] == "AMBIGUOUS"
    assert validate_retrieval_evidence([], supported=False)["evidence_state"] == "NOT_SUPPORTED"
    partial = validate_retrieval_evidence(
        [{"id": "r1", "reporting_period": "2026-07"}],
        requested_period=_july(),
        relationship_evidence={"evidence_state": "RELATIONSHIP_MISSING"},
    )
    assert partial["evidence_state"] == "RELATIONSHIP_MISSING"
    assert partial["missing"] == ["required_record_formula_relationship"]