from modules.supplier_assessment.ghg_submission_service import (
    aggregate_entries,
    exclude_reopened_supplier_submission_revisions,
    period_submitted_scope_totals,
)


def test_ghg_aggregation_groups_submitted_entries_by_scope_and_category():
    rows = aggregate_entries([
        {"scope": "scope1", "category": "Stationary combustion", "total_emissions": 12.5},
        {"scope": "scope1", "category": "Stationary combustion", "total_emissions": 7.5},
        {"scope": "scope2", "category": "Purchased electricity", "total_emissions": 4},
    ])

    assert rows == [
        {"scope": "scope1", "category": "Stationary combustion", "entry_count": 2, "total_emissions": 20.0},
        {"scope": "scope2", "category": "Purchased electricity", "entry_count": 1, "total_emissions": 4.0},
    ]


def test_supplier_log_filter_hides_historical_revisions_without_lineage_id():
    records = [
        {"id": "old-april", "source": "supplier", "is_current_revision": False},
        {"id": "current-april", "source": "supplier", "is_current_revision": True},
        {"id": "normal-record", "source": "supplier"},
    ]

    filtered = exclude_reopened_supplier_submission_revisions(records)

    assert [record["id"] for record in filtered] == ["current-april", "normal-record"]


def test_period_submitted_scope_totals_only_include_the_selected_period():
    totals = period_submitted_scope_totals([
        {"scope": "scope1", "reporting_period": "2026-04", "total_emissions": 1.25},
        {"scope": "scope1", "reporting_period": "2026-04", "co2e_emissions": 0.75},
        {"scope": "scope2", "reporting_period": "2026-04", "total_emissions": 4.5},
        {"scope": "scope2", "reporting_period": "2026-05", "total_emissions": 100},
    ], ["2026-04"])

    assert totals == {"scope1": 2.0, "scope2": 4.5}


def test_period_submitted_scope_totals_use_last_submitted_revision_during_resubmission():
    totals = period_submitted_scope_totals([
        {"id": "old-entry", "scope": "scope1", "reporting_period": "2026-04", "total_emissions": 10, "revision_number": 1, "submitted_to_parent_org": "2026-05-01T00:00:00+00:00"},
        {"id": "new-entry", "revision_lineage_id": "old-entry", "scope": "scope1", "reporting_period": "2026-04", "total_emissions": 12, "revision_number": 2, "submitted_to_parent_org": "2026-06-01T00:00:00+00:00"},
    ], ["2026-04"])

    assert totals == {"scope1": 12.0, "scope2": 0.0}