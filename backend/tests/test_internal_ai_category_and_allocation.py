import pytest

from modules.internal_data_ai.entity_guards import category_is_explicitly_mentioned
from modules.internal_data_ai.reporting_periods import ResolvedPeriod, annual_record_allocation
from modules.internal_data_ai.services import emissions


class _Cursor:
    def __init__(self, documents):
        self.documents = documents

    def sort(self, *_args):
        return self

    async def to_list(self, _length):
        return self.documents


class _Collection:
    def __init__(self, documents):
        self.documents = documents
        self.find_calls = []

    def find(self, query, _projection=None):
        self.find_calls.append(query)
        return _Cursor(self.documents)


class _DB:
    def __init__(self, emission_records):
        self.emission_records = _Collection(emission_records)
        self.facilities = _Collection([])


def _july_2026():
    return {
        "start_month": "2026-07",
        "end_month": "2026-07",
        "label": "July 2026",
        "source": "explicit",
        "fiscal_start_month": 4,
    }


class TestCategoryGuard:
    def test_diesel_question_does_not_imply_stationary_combustion(self):
        assert not category_is_explicitly_mentioned("Diesel consumption in July 2026", "Stationary Combustion")

    def test_explicit_category_is_retained(self):
        assert category_is_explicitly_mentioned("Stationary diesel consumption in July 2026", "Stationary Combustion")


class TestAnnualAllocation:
    def test_july_receives_one_twelfth_of_matching_financial_year_value(self):
        period = ResolvedPeriod("2026-07", "2026-07", "July 2026", "explicit", fiscal_start_month=4)
        assert annual_record_allocation("FY 2026-27", period) == pytest.approx(1 / 12)
        assert annual_record_allocation("FY 2025-26", period) == 0

    @pytest.mark.asyncio
    async def test_diesel_query_keeps_mobile_and_allocates_fy_record(self, monkeypatch):
        records = [
            {"id": "stationary-a", "organization_id": "org-a", "facility_id": "facility-e", "fuel_type": "Diesel", "category": "Stationary Combustion", "reporting_period": "2026-07", "dynamic_field_values": {"qty": {"value": 323, "unit": "L"}}},
            {"id": "stationary-b", "organization_id": "org-a", "facility_id": "facility-e", "fuel_type": "Diesel", "category": "Stationary Combustion", "reporting_period": "2026-07", "dynamic_field_values": {"qty": {"value": 5177.2, "unit": "L"}}},
            {"id": "mobile", "organization_id": "org-a", "facility_id": "facility-e", "fuel_type": "Diesel", "category": "Mobile Combustion", "reporting_period": "2026-07", "dynamic_field_values": {"qty": {"value": 5678, "unit": "L"}}},
            {"id": "annual", "organization_id": "org-a", "facility_id": "facility-a", "fuel_type": "Diesel", "category": "Stationary Combustion", "reporting_period": "FY 2026-27", "dynamic_field_values": {"qty": {"value": 12000, "unit": "L"}}},
        ]
        fake_db = _DB(records)
        monkeypatch.setattr(emissions, "db", fake_db)

        result = await emissions.search_records(org_id="org-a", fuel_type="Diesel", period=_july_2026())

        assert [record["id"] for record in result["records"]] == ["stationary-a", "stationary-b", "mobile", "annual"]
        assert result["records"][-1]["quantity"] == 1000
        assert result["consumption_totals"] == [{"quantity": 12178.2, "unit": "L", "records": 4}]
        assert "category" not in str(fake_db.emission_records.find_calls[0])