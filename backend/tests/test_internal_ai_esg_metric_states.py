import pytest

from modules.internal_data_ai.query_contracts import QueryType, StructuredQueryPlan
from modules.internal_data_ai.response_builder import _build_esg_record_response
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

    def find(self, *_args, **_kwargs):
        return _Cursor(self.rows)


class _DB:
    def __init__(self, records, facilities=None):
        self.environment_records = _Collection(records)
        self.social_records = _Collection([])
        self.governance_records = _Collection([])
        self.facilities = _Collection(facilities or [])

    def __getitem__(self, name):
        return getattr(self, name)


def _records(*statuses):
    return [
        {
            "id": f"water-{index}",
            "org_id": "org-a",
            "facility_id": "facility-a",
            "category": "Water",
            "subcategory": "Consumption",
            "reporting_period": {"reporting_type": "monthly", "year": 2026, "month": "July"},
            "field_values": {"quantity": 100 + index, "unit": "KL"},
            "status": "completed",
            **({"approval_status": status} if status is not None else {}),
        }
        for index, status in enumerate(statuses)
    ]


@pytest.mark.asyncio
async def test_pending_status_is_distinct_from_no_records_and_missing_status(monkeypatch):
    monkeypatch.setattr(esg_records, "db", _DB(_records("approved", "pending_approval", None), [{"id": "facility-a", "name": "Facility A"}]))

    pending = await esg_records.search_records("org-a", category="Water", record_type="environment", approval_status_filter="pending_approval")
    approved = await esg_records.search_records("org-a", category="Water", record_type="environment", approval_status_filter="approved")

    assert pending["state"] == "PENDING"
    assert pending["records_found"] == 3
    assert pending["matching_status_records"] == 1
    assert pending["records"][0]["state"] == "PENDING"
    assert approved["state"] == "APPROVED"
    assert approved["matching_status_records"] == 1


@pytest.mark.asyncio
async def test_zero_requested_status_and_unavailable_status_remain_separate(monkeypatch):
    monkeypatch.setattr(esg_records, "db", _DB(_records("approved"), [{"id": "facility-a", "name": "Facility A"}]))
    no_pending = await esg_records.search_records("org-a", category="Water", record_type="environment", approval_status_filter="pending_approval")
    assert no_pending["state"] == "FOUND"
    assert no_pending["records_found"] == 1
    assert no_pending["matching_status_records"] == 0

    monkeypatch.setattr(esg_records, "db", _DB(_records(None), [{"id": "facility-a", "name": "Facility A"}]))
    unavailable = await esg_records.search_records("org-a", category="Water", record_type="environment", approval_status_filter="approved")
    assert unavailable["state"] == "STATUS_UNAVAILABLE"
    assert unavailable["records_found"] == 1
    assert unavailable["matching_status_records"] == 0


def test_deterministic_response_preserves_zero_pending_and_status_unavailable_states():
    plan = StructuredQueryPlan(query_type=QueryType.APPROVAL_STATUS_LOOKUP, record_type="environment", category="Water")
    no_pending = _build_esg_record_response(plan, {
        "category": "Water", "period": "All reporting periods", "state": "FOUND", "records_found": 2,
        "matching_status_records": 0, "approval_status_filter": "pending_approval",
        "approval_status_summary": {"PENDING": 0, "APPROVED": 2, "STATUS_UNAVAILABLE": 0}, "records": [],
    }, "text")
    unavailable = _build_esg_record_response(plan, {
        "category": "Water", "period": "July 2026", "state": "STATUS_UNAVAILABLE", "records_found": 1,
        "matching_status_records": 0, "approval_status_filter": "approved",
        "approval_status_summary": {"PENDING": 0, "APPROVED": 0, "STATUS_UNAVAILABLE": 1}, "records": [],
    }, "text")

    assert "No water metric records are pending approval." in no_pending["answer"]
    assert "Records found: 2" in no_pending["answer"]
    assert "No approval-status data was provided" in unavailable["answer"]