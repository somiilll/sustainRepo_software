from modules.supplier_assessment.ghg_submission_service import (
    aggregate_entries,
    exclude_reopened_supplier_submission_revisions,
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