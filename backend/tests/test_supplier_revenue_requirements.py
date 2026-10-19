import pytest
from pydantic import ValidationError

from modules.supplier_assessment.contracts import RevenueInfoUpdate
from modules.supplier_assessment import service as service_module


class FakeCollection:
    def __init__(self, find_result=None):
        self.find_result = find_result
        self.inserted = []

    async def find_one(self, *_args, **_kwargs):
        return self.find_result

    async def insert_one(self, document):
        self.inserted.append(dict(document))


class FakeDB:
    def __init__(self, relationship):
        self.supplier_relationships = FakeCollection(relationship)
        self.supplier_revenue_submissions = FakeCollection(None)


def test_revenue_percentage_is_always_required():
    with pytest.raises(ValidationError):
        RevenueInfoUpdate(revenue_amount=1000, revenue_currency="USD")


def test_annual_revenue_amount_remains_optional_in_update_contract():
    payload = RevenueInfoUpdate(revenue_percentage=25, revenue_currency="USD")
    assert payload.revenue_percentage == 25
    assert payload.revenue_amount is None


@pytest.mark.asyncio
async def test_optional_annual_amount_does_not_block_submission(monkeypatch):
    fake_db = FakeDB({
        "id": "relationship-1",
        "supplier_org_id": "supplier-1",
        "customer_org_id": "customer-1",
        "reporting_period": "FY 2026-27",
        "revenue_percentage": 20,
        "revenue_amount": None,
        "revenue_required": False,
    })
    monkeypatch.setattr(service_module, "db", fake_db)

    async def no_score(_relationship_id):
        return None

    async def no_completion(_relationship_id):
        return None

    monkeypatch.setattr(service_module.supplier_service, "refresh_supplier_canonical_score", no_score)
    monkeypatch.setattr(service_module.supplier_service, "_update_completion_status", no_completion)

    submission = await service_module.supplier_service.submit_revenue_info(
        "relationship-1", "supplier-1", "user-1"
    )

    assert submission["revenue_percentage"] == 20
    assert submission["revenue_amount"] is None


@pytest.mark.asyncio
async def test_required_annual_amount_blocks_submission_when_missing(monkeypatch):
    fake_db = FakeDB({
        "id": "relationship-1",
        "supplier_org_id": "supplier-1",
        "customer_org_id": "customer-1",
        "reporting_period": "FY 2026-27",
        "revenue_percentage": 20,
        "revenue_amount": None,
        "revenue_required": True,
    })
    monkeypatch.setattr(service_module, "db", fake_db)

    with pytest.raises(ValueError, match="mandatory annual revenue amount"):
        await service_module.supplier_service.submit_revenue_info(
            "relationship-1", "supplier-1", "user-1"
        )