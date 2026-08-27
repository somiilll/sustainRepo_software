from modules.supplier_assessment.ghg_submission_service import aggregate_entries


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