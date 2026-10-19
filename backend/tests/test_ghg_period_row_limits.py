import pytest
from fastapi import HTTPException

from bulk_upload_scope3.models import RowResult
from bulk_upload_scope3.processors.upload_processor import UploadProcessor
from modules.entitlements import dependencies


class FakeCollection:
    def __init__(self, counts=None):
        self.counts = counts or {}

    async def count_documents(self, query):
        frequency = query["frequency_type"]
        frequency_type = "yearly" if frequency == "yearly" else "monthly"
        return self.counts.get((frequency_type, query["reporting_period"]), 0)


class FakeDB(dict):
    def __init__(self, counts=None):
        super().__init__()
        self.collection = FakeCollection(counts)

    def __getitem__(self, _name):
        return self.collection


@pytest.fixture
def configured_limit(monkeypatch):
    async def fake_entitlements(_org_id):
        return {
            "environment": {
                "ghg": {"enabled": True, "monthly_rows_allowed": 10},
            },
        }

    monkeypatch.setattr(dependencies, "get_resolved_entitlements", fake_entitlements)


@pytest.fixture
def unlimited_limit(monkeypatch):
    async def fake_entitlements(_org_id):
        return {
            "environment": {
                "ghg": {"enabled": True, "monthly_rows_allowed": None},
            },
        }

    monkeypatch.setattr(dependencies, "get_resolved_entitlements", fake_entitlements)


def make_records(frequency_type, reporting_period, count):
    return [
        {
            "id": f"{frequency_type}-{reporting_period}-{index}",
            "frequency_type": frequency_type,
            "reporting_period": reporting_period,
            "scope": "scope1",
            "category": "Stationary Combustion",
            "co2e_emissions": 1,
        }
        for index in range(count)
    ]


@pytest.mark.asyncio
async def test_monthly_limit_is_separate_for_each_reporting_month(configured_limit):
    records = make_records("monthly", "2026-05", 10) + make_records("monthly", "2026-06", 10)

    accepted, rejected = await dependencies.partition_records_by_period_row_limit(
        "org-1", "ghg", "emission_records", records, database=FakeDB()
    )

    assert len(accepted) == 20
    assert rejected == []


@pytest.mark.asyncio
async def test_monthly_limit_rejects_only_rows_above_that_months_allowance(configured_limit):
    records = make_records("monthly", "2026-05", 11)

    accepted, rejected = await dependencies.partition_records_by_period_row_limit(
        "org-1", "ghg", "emission_records", records, database=FakeDB()
    )

    assert len(accepted) == 10
    assert len(rejected) == 1
    assert rejected[0]["reporting_period"] == "2026-05"
    assert "maximum 10 rows" in rejected[0]["message"]
    assert "10 earlier row(s) in this upload" in rejected[0]["message"]


@pytest.mark.asyncio
async def test_existing_monthly_rows_reduce_only_the_matching_month(configured_limit):
    records = make_records("monthly", "2026-05", 7) + make_records("monthly", "2026-06", 10)
    database = FakeDB({("monthly", "2026-05"): 4})

    accepted, rejected = await dependencies.partition_records_by_period_row_limit(
        "org-1", "ghg", "emission_records", records, database=database
    )

    assert len(accepted) == 16
    assert len(rejected) == 1
    assert rejected[0]["reporting_period"] == "2026-05"
    assert rejected[0]["current_count"] == 4


@pytest.mark.asyncio
async def test_yearly_limit_is_twelve_times_monthly_allowance(configured_limit):
    records = make_records("yearly", "CY2026", 121)

    accepted, rejected = await dependencies.partition_records_by_period_row_limit(
        "org-1", "ghg", "emission_records", records, database=FakeDB()
    )

    assert len(accepted) == 120
    assert len(rejected) == 1
    assert rejected[0]["limit"] == 120
    assert "10 monthly rows × 12" in rejected[0]["message"]


@pytest.mark.asyncio
async def test_batch_save_recheck_rejects_when_capacity_changed(configured_limit):
    records = make_records("monthly", "2026-05", 10)
    database = FakeDB({("monthly", "2026-05"): 1})

    with pytest.raises(HTTPException) as exc:
        await dependencies.assert_period_row_batch_limit(
            "org-1", "ghg", "emission_records", records, database=database
        )

    assert exc.value.status_code == 403
    assert "2026-05" in exc.value.detail


@pytest.mark.asyncio
async def test_bulk_preview_marks_excess_row_as_error(configured_limit):
    records = make_records("monthly", "2026-05", 11)
    results = [
        RowResult(
            sheet="Scope1",
            row=index + 2,
            success=True,
            emission_id=record["id"],
            co2e=1,
            row_data={"reporting_period": "2026-05"},
        )
        for index, record in enumerate(records)
    ]
    processor = UploadProcessor(FakeDB(), "org-1", "user-1")

    accepted, errors = await processor._apply_period_row_limits(results, records)

    assert len(accepted) == 10
    assert len(errors) == 1
    assert errors[0].error_type == "PERIOD_ROW_LIMIT_EXCEEDED"
    assert results[-1].success is False


@pytest.mark.asyncio
async def test_unlimited_monthly_rows_allowed_keeps_all_rows_valid(unlimited_limit):
    records = make_records("monthly", "2026-05", 200)

    accepted, rejected = await dependencies.partition_records_by_period_row_limit(
        "org-1", "ghg", "emission_records", records, database=FakeDB({("monthly", "2026-05"): 900})
    )

    assert len(accepted) == 200
    assert rejected == []