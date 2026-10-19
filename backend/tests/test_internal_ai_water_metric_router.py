import pytest

from modules.internal_data_ai.metric_resolver import resolve_water_metric
from modules.internal_data_ai.services import esg_records


class _Cursor:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, *_args):
        return self

    async def to_list(self, _length):
        return self.rows


class _Collection:
    def __init__(self, rows):
        self.rows = rows
        self.query = None

    def find(self, query, *_args, **_kwargs):
        self.query = query
        return _Cursor(self.rows)


class _DB:
    def __init__(self, rows):
        self.environment_records = _Collection(rows)
        self.social_records = _Collection([])
        self.governance_records = _Collection([])
        self.facilities = _Collection([])

    def __getitem__(self, name):
        return getattr(self, name)


@pytest.mark.parametrize(("question", "subcategory", "field_key"), [
    ("How much water did we use?", "Consumption", "quantity"),
    ("How much groundwater was consumed?", "Consumption", "water_consumed_through_ground_water"),
    ("How much water was discharged to surface water?", "Discharge", "water_discharged_to_surface_water"),
    ("How much water did we withdraw in water-stressed areas?", "Withdrawal", "water_withdrawal_in_water_stress_area"),
    ("How much water was recycled?", "Recycle", "total_quantity_of_water_recycled"),
])
def test_water_router_resolves_exact_subcategory_and_field(question, subcategory, field_key):
    resolution = resolve_water_metric(question)
    assert resolution.section == "environment"
    assert resolution.category == "Water"
    assert resolution.subcategory == subcategory
    assert resolution.field_key == field_key


def test_water_recycling_percent_is_a_derived_metric_not_a_stored_field():
    resolution = resolve_water_metric("What percentage of water was recycled?")
    assert resolution.subcategory == "Recycle"
    assert resolution.field_key == "total_quantity_of_water_recycled"
    assert resolution.derived_metric == "water_recycling_percentage"


@pytest.mark.asyncio
async def test_water_search_enforces_current_non_deleted_records_and_preserves_stored_units(monkeypatch):
    rows = [{
        "org_id": "org-a", "category": "Water", "subcategory": "Consumption", "facility_id": None,
        "reporting_period": {"reporting_type": "monthly", "year": 2026, "month": "July"},
        "field_values": {"quantity": 10, "quantity_unit": "KiloLitres"}, "status": "completed", "approval_status": "approved",
    }]
    fake_db = _DB(rows)
    monkeypatch.setattr(esg_records, "db", fake_db)
    monkeypatch.setattr(esg_records, "configured_field_candidates", lambda *_args, **_kwargs: _async_result([{"key": "quantity", "label": "Total Water Consumed"}]))

    result = await esg_records.search_records(
        "org-a", category="Water", record_type="environment", subcategory="Consumption",
        metric_field_key="quantity", metric_field_label="Total Water Consumed",
    )

    rendered_query = str(fake_db.environment_records.query)
    assert "is_current" in rendered_query
    assert "deleted_at" in rendered_query
    assert result["records"][0]["metric_value"] == {
        "field_key": "quantity", "field_label": "Total Water Consumed", "value": 10,
        "unit": "KiloLitres", "state": "AVAILABLE",
    }
    assert result["aggregates"] == [{
        "period": "July 2026", "value": 10000.0, "unit": "L", "records": 1, "facilities": ["Organization level"],
    }]


async def _async_result(value):
    return value