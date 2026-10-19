import pytest

from modules.esg_records.contracts import ReportingPeriod
from modules.esg_records import service as records_service


class _Cursor:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, _length):
        return self.rows


class _Tasks:
    def __init__(self, rows):
        self.rows = rows
        self.last_query = None

    def find(self, query, _projection):
        self.last_query = query
        return _Cursor(self.rows)


class _Assignees:
    def __init__(self, active_task_ids):
        self.active_task_ids = set(active_task_ids)

    async def find_one(self, query):
        return {"task_id": next(iter(self.active_task_ids))} if self.active_task_ids.intersection(query["task_id"]["$in"]) else None


class _DB:
    def __init__(self, tasks, active_task_ids):
        self.esg_reporting_tasks = _Tasks(tasks)
        self.esg_task_assignees = _Assignees(active_task_ids)


def _org_assignment():
    return {
        "id": "assignment-org",
        "assignment_level": "organization",
        "facility_snapshot": {"facility_ids": ["facility-e"]},
    }


@pytest.mark.asyncio
async def test_numeric_month_uses_the_october_org_task_for_a_covered_facility(monkeypatch):
    validator = records_service.ESGRecordsService()
    fake_db = _DB([
        {"id": "org-october", "assignment_id": "assignment-org", "facility_id": None},
    ], ["org-october"])
    monkeypatch.setattr(records_service, "db", fake_db)
    result = await validator._validate_task_period(
        "org-a", "user-a", "Waste", "Spills", None, "facility-e",
        ReportingPeriod(reporting_type="monthly", year=2026, month="10"), _org_assignment(),
    )
    assert result is True
    assert fake_db.esg_reporting_tasks.last_query["period_key"] == "2026-10"


@pytest.mark.asyncio
async def test_org_task_does_not_authorize_a_facility_outside_its_snapshot(monkeypatch):
    validator = records_service.ESGRecordsService()
    monkeypatch.setattr(records_service, "db", _DB([
        {"id": "org-october", "assignment_id": "assignment-org", "facility_id": None},
    ], ["org-october"]))
    result = await validator._validate_task_period(
        "org-a", "user-a", "Waste", "Spills", None, "facility-a",
        ReportingPeriod(reporting_type="monthly", year=2026, month="October"), _org_assignment(),
    )
    assert result is False


@pytest.mark.asyncio
async def test_facility_specific_task_cannot_be_bypassed_by_an_org_task(monkeypatch):
    validator = records_service.ESGRecordsService()
    monkeypatch.setattr(records_service, "db", _DB([
        {"id": "facility-october", "assignment_id": "other-assignment", "facility_id": "facility-e"},
        {"id": "org-october", "assignment_id": "assignment-org", "facility_id": None},
    ], ["org-october"]))
    result = await validator._validate_task_period(
        "org-a", "user-a", "Waste", "Spills", None, "facility-e",
        ReportingPeriod(reporting_type="monthly", year=2026, month="October"), _org_assignment(),
    )
    assert result is False