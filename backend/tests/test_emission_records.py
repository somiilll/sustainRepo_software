import pytest

from shared.utils.emission_records import (
    canonicalize_emission_record,
    deduplicate_monthly_against_yearly,
    eligible_ghg_record_filter,
    emission_proration,
    reporting_period_query_values,
)


def test_eligible_filter_excludes_ineligible_record_lifecycle_states():
    query = eligible_ghg_record_filter()

    assert query["is_deleted"] == {"$ne": True}
    assert query["is_draft"] == {"$ne": True}
    assert query["is_current_revision"] == {"$ne": False}
    assert query["approval_status"] == {"$in": ["approved", "not_required", None]}
    assert set(query["status"]["$nin"]) >= {"draft", "pending", "rejected", "deleted", "superseded"}


@pytest.mark.parametrize(
    ("record", "expected_scope", "expected_period", "expected_frequency"),
    [
        ({"scope": "Scope 1", "reporting_period": "2025-04"}, "scope1", "2025-04", "monthly"),
        ({"scope": "scope2", "reporting_period": "CY2025", "frequency_type": "yearly"}, "scope2", "CY 2025", "yearly"),
        ({"scope": "Scope 3", "reporting_period": "FY2025-26", "frequency_type": "yearly"}, "scope3", "FY 2025-2026", "yearly"),
    ],
)
def test_canonicalizes_supported_legacy_scope_and_period_values(record, expected_scope, expected_period, expected_frequency):
    normalized = canonicalize_emission_record(record)

    assert normalized["scope"] == expected_scope
    assert normalized["reporting_period"] == expected_period
    assert normalized["frequency_type"] == expected_frequency


def test_rejects_unknown_periods_instead_of_including_them():
    assert canonicalize_emission_record({"scope": "scope1", "reporting_period": "FY 2025-2025"}) is None
    assert canonicalize_emission_record({"scope": "scope1", "reporting_period": "2025-13"}) is None
    assert emission_proration("not-a-period", "2025-01", "2025-12") == 0


def test_reporting_range_uses_only_explicit_exact_period_values():
    query_values = reporting_period_query_values("2025-04", "2026-03")

    assert "2025-04" in query_values
    assert "FY 2025-2026" in query_values
    assert "FY2025-26" in query_values
    assert "CY 2025" in query_values
    assert all("$regex" not in value for value in query_values)


def test_yearly_record_excludes_matching_monthly_records_across_fy_boundary():
    records = [
        {"facility_id": "f1", "category": "Stationary", "scope": "scope1", "reporting_period": "FY 2025-2026", "frequency_type": "yearly"},
        {"facility_id": "f1", "category": "Stationary", "scope": "scope1", "reporting_period": "2025-04", "frequency_type": "monthly"},
        {"facility_id": "f1", "category": "Stationary", "scope": "scope1", "reporting_period": "2026-03", "frequency_type": "monthly"},
        {"facility_id": "f1", "category": "Mobile", "scope": "scope1", "reporting_period": "2026-03", "frequency_type": "monthly"},
    ]

    remaining = deduplicate_monthly_against_yearly(records)

    assert [record["reporting_period"] for record in remaining] == ["FY 2025-2026", "2026-03"]