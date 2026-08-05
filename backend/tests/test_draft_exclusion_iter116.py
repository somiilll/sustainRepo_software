"""
Iteration 116 - Bug 1 & Bug 2 verification tests
- Bug 1: DataChecker methods exclude draft records (status='draft')
- Bug 2: get_task_status returns PENDING_APPROVAL when data submitted with approval pending
Uses pymongo (sync) for seeding + single dedicated asyncio loop for DataChecker calls
to avoid motor cross-loop issues under pytest-asyncio 1.x.
"""
import os
import sys
import asyncio
import uuid
from datetime import datetime, timezone

import pytest
from pymongo import MongoClient

sys.path.insert(0, "/app/backend")

# Import backend module first so it initializes motor client on default loop
from modules.esg_assignments.completion_service import (  # noqa: E402
    DataChecker, CompletionService, TaskStatus,
)

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

_sync = MongoClient(MONGO_URL)[DB_NAME]

ORG_ID = "9067d872-8a3a-4ed9-8494-e3ef04952f7c"
PERIOD_KEY = "2099-01"
TEST_TAG = "TEST_ITER116"


# One session-wide loop for all async work
_LOOP = asyncio.new_event_loop()


def _run(coro):
    return _LOOP.run_until_complete(coro)


@pytest.fixture(autouse=True)
def clean_records():
    for coll in ["environment_records", "emission_records",
                 "social_records", "governance_records"]:
        _sync[coll].delete_many({"test_tag": TEST_TAG})
    yield
    for coll in ["environment_records", "emission_records",
                 "social_records", "governance_records"]:
        _sync[coll].delete_many({"test_tag": TEST_TAG})


def _now():
    return datetime.now(timezone.utc)


# ---------- Bug 1: draft excluded ----------

def test_environment_draft_excluded():
    _sync.environment_records.insert_one({
        "id": str(uuid.uuid4()), "organization_id": ORG_ID,
        "category": "Water", "subcategory": "Withdrawal",
        "status": "draft",
        "reporting_period": {"year": 2099, "month": 1},
        "test_tag": TEST_TAG, "created_at": _now(), "updated_at": _now(),
    })
    has, _, _ = _run(DataChecker.check_exists(
        ORG_ID, "Water", "Withdrawal", None, PERIOD_KEY))
    assert has is False, "Draft environment record MUST NOT count as data"


def test_environment_submitted_counts():
    _sync.environment_records.insert_one({
        "id": str(uuid.uuid4()), "organization_id": ORG_ID,
        "category": "Water", "subcategory": "Withdrawal",
        "status": "submitted", "approval_status": "pending_approval",
        "reporting_period": {"year": 2099, "month": 1},
        "test_tag": TEST_TAG, "created_at": _now(), "updated_at": _now(),
    })
    has, _, approval = _run(DataChecker.check_exists(
        ORG_ID, "Water", "Withdrawal", None, PERIOD_KEY))
    assert has is True
    assert approval == "pending_approval"


def test_ghg_draft_excluded():
    _sync.emission_records.insert_one({
        "id": str(uuid.uuid4()), "organization_id": ORG_ID,
        "scope": "scope1", "status": "draft",
        "reporting_period": PERIOD_KEY,
        "test_tag": TEST_TAG, "created_at": _now(), "updated_at": _now(),
    })
    has, _, _ = _run(DataChecker.check_exists(
        ORG_ID, "GHG Emissions", "Scope 1", None, PERIOD_KEY))
    assert has is False, "Draft emission record MUST NOT count as data"


def test_ghg_completed_counts():
    _sync.emission_records.insert_one({
        "id": str(uuid.uuid4()), "organization_id": ORG_ID,
        "scope": "scope1", "status": "completed", "approval_status": "approved",
        "reporting_period": PERIOD_KEY,
        "test_tag": TEST_TAG, "created_at": _now(), "updated_at": _now(),
    })
    has, _, approval = _run(DataChecker.check_exists(
        ORG_ID, "GHG Emissions", "Scope 1", None, PERIOD_KEY))
    assert has is True
    assert approval == "approved"


def test_social_draft_excluded():
    _sync.social_records.insert_one({
        "id": str(uuid.uuid4()), "organization_id": ORG_ID,
        "category": "Employees", "subcategory": "Training",
        "status": "draft",
        "reporting_period": {"year": 2099, "month": 1},
        "test_tag": TEST_TAG, "created_at": _now(), "updated_at": _now(),
    })
    has, _, _ = _run(DataChecker.check_exists(
        ORG_ID, "Employees", "Training", None, PERIOD_KEY))
    assert has is False


def test_governance_draft_excluded():
    _sync.governance_records.insert_one({
        "id": str(uuid.uuid4()), "organization_id": ORG_ID,
        "category": "Governance", "subcategory": "Board",
        "status": "draft",
        "test_tag": TEST_TAG, "created_at": _now(), "updated_at": _now(),
    })
    has, _, _ = _run(DataChecker.check_exists(
        ORG_ID, "Governance", "Board", None, PERIOD_KEY))
    assert has is False


# ---------- Bug 2: pending_approval flows through to task status ----------

def test_pending_approval_task_status():
    _sync.environment_records.insert_one({
        "id": str(uuid.uuid4()), "organization_id": ORG_ID,
        "category": "Energy", "subcategory": "Electricity",
        "facility_id": "TEST_FAC_ITER116",
        "status": "submitted", "approval_status": "pending_approval",
        "reporting_period": {"year": 2099, "month": 1},
        "test_tag": TEST_TAG, "created_at": _now(), "updated_at": _now(),
    })
    svc = CompletionService()
    task = {
        "organization_id": ORG_ID, "facility_id": "TEST_FAC_ITER116",
        "category": "Energy", "subcategory": "Electricity",
        "period_key": PERIOD_KEY, "due_at": None,
    }
    status = _run(svc.get_task_status(task))
    assert status == TaskStatus.PENDING_APPROVAL, (
        f"Expected PENDING_APPROVAL, got {status}")


def test_draft_only_task_not_completed():
    """Draft-only records must NOT compute to COMPLETED or PENDING_APPROVAL."""
    _sync.environment_records.insert_one({
        "id": str(uuid.uuid4()), "organization_id": ORG_ID,
        "category": "Energy", "subcategory": "Electricity",
        "facility_id": "TEST_FAC_ITER116_DRAFT",
        "status": "draft",
        "reporting_period": {"year": 2099, "month": 1},
        "test_tag": TEST_TAG, "created_at": _now(), "updated_at": _now(),
    })
    svc = CompletionService()
    task = {
        "organization_id": ORG_ID, "facility_id": "TEST_FAC_ITER116_DRAFT",
        "category": "Energy", "subcategory": "Electricity",
        "period_key": PERIOD_KEY, "due_at": None,
    }
    status = _run(svc.get_task_status(task))
    assert status not in (TaskStatus.COMPLETED, TaskStatus.PENDING_APPROVAL), (
        f"Draft-only should remain pending/overdue, got {status}")
