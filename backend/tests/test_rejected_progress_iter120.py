"""
Iteration 120 regression tests

Bugs under test:
1) Progress calculation must count 'pending_approval' records as COMPLETED
   but must EXCLUDE 'rejected' records from the completed count.
2) Rejected records must count towards pending/overdue (not silently ignored).
3) update_record on a record whose approval_status='rejected' must raise
   HTTP 400 with a structured detail object including keys:
      error, message, rejection_reason, rejected_at, suggestion
   (so the frontend can render `.message` and not the object itself).

Uses the live admin org and directly inserts / cleans up temporary
environment_records docs. All test data is prefixed with TEST_ITER120_.
"""
import sys
import asyncio
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from fastapi import HTTPException

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

# Bind persistent loop to motor client (same pattern as iter119)
_LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(_LOOP)

from shared.database.mongo import db  # noqa: E402
from modules.esg_assignments.completion_service import (  # noqa: E402
    CompletionService, DataChecker,
)
from modules.esg_records.service import ESGRecordsService  # noqa: E402
from modules.esg_records.contracts import UpdateRecordRequest  # noqa: E402


ORG_ID = "9067d872-8a3a-4ed9-8494-e3ef04952f7c"
TEST_TAG = "TEST_ITER120"
TEST_CATEGORY = f"{TEST_TAG}_CustomMetric"
TEST_SUBCATEGORY = "Metric1"


def run_async(coro):
    return _LOOP.run_until_complete(coro)


def _read_env(k):
    import os
    v = os.environ.get(k)
    if v:
        return v
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith(k + "="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return None


BASE_URL = (_read_env("REACT_APP_BACKEND_URL") or "").rstrip("/")


# ---------- helpers ----------

async def _insert_env_record(period_month: int, period_year: int, approval_status,
                             facility_id=None, status="completed"):
    """Insert a fake env record and return its id."""
    rec_id = f"{TEST_TAG}_{uuid.uuid4()}"
    doc = {
        "id": rec_id,
        "organization_id": ORG_ID,
        "org_id": ORG_ID,
        "category": TEST_CATEGORY,
        "subcategory": TEST_SUBCATEGORY,
        "facility_id": facility_id,
        "reporting_period": {"year": period_year, "month": period_month},
        "status": status,
        "approval_status": approval_status,
        "rejection_reason": ("bad data" if approval_status == "rejected" else None),
        "rejected_at": (datetime.now(timezone.utc).isoformat() if approval_status == "rejected" else None),
        "is_current": True,
        "field_values": {"value": 100},
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    await db.environment_records.insert_one(doc)
    return rec_id


async def _cleanup():
    await db.environment_records.delete_many(
        {"$or": [
            {"id": {"$regex": f"^{TEST_TAG}_"}},
            {"category": TEST_CATEGORY},
        ]}
    )


@pytest.fixture(scope="module", autouse=True)
def cleanup_module():
    run_async(_cleanup())
    yield
    run_async(_cleanup())


# ---------- Progress calculation tests ----------

class TestProgressExcludesRejected:
    """CompletionService._calculate_facility_level and _calculate_org_level
    must exclude rejected records from completed."""

    def test_pending_approval_counts_as_completed(self):
        """A record with approval_status='pending_approval' should be counted
        as completed for progress."""
        async def _t():
            await _cleanup()
            await _insert_env_record(1, 2025, "pending_approval", facility_id="fac_test_1")
            svc = CompletionService()
            # Facility-level assignment simulated
            assignment = {
                "organization_id": ORG_ID,
                "category": TEST_CATEGORY,
                "subcategory": TEST_SUBCATEGORY,
                "facility_id": "fac_test_1",
                "assignment_level": "facility",
                "start_date": "2025-01-01",
                "end_date": "2025-01-31",
                "filling_frequency": "monthly",
                "filling_due_day": 15,
            }
            res = await svc.get_assignment_progress(assignment, include_period_details=True)
            print(f"pending_approval progress: {res.to_dict()}")
            assert res.total == 1
            assert res.completed == 1, f"pending_approval must count as completed, got {res.to_dict()}"
            assert res.pending == 0
            assert res.overdue == 0

        run_async(_t())

    def test_rejected_does_not_count_as_completed(self):
        """A record with approval_status='rejected' MUST NOT be counted as
        completed. It should be pending/overdue based on due date."""
        async def _t():
            await _cleanup()
            await _insert_env_record(1, 2025, "rejected", facility_id="fac_test_2")
            svc = CompletionService()
            assignment = {
                "organization_id": ORG_ID,
                "category": TEST_CATEGORY,
                "subcategory": TEST_SUBCATEGORY,
                "facility_id": "fac_test_2",
                "assignment_level": "facility",
                "start_date": "2025-01-01",
                "end_date": "2025-01-31",
                "filling_frequency": "monthly",
                "filling_due_day": 15,
            }
            res = await svc.get_assignment_progress(assignment, include_period_details=True)
            print(f"rejected progress: {res.to_dict()}")
            assert res.total == 1
            assert res.completed == 0, f"rejected must NOT count as completed. Got {res.to_dict()}"
            # Jan 2025 with due_day=15 -> overdue relative to today
            assert res.overdue + res.pending == 1
            assert res.overdue == 1, "Jan 2025 is well past due -> should be overdue"

        run_async(_t())

    def test_approved_counts_as_completed(self):
        async def _t():
            await _cleanup()
            await _insert_env_record(1, 2025, "approved", facility_id="fac_test_3")
            svc = CompletionService()
            assignment = {
                "organization_id": ORG_ID,
                "category": TEST_CATEGORY,
                "subcategory": TEST_SUBCATEGORY,
                "facility_id": "fac_test_3",
                "assignment_level": "facility",
                "start_date": "2025-01-01",
                "end_date": "2025-01-31",
                "filling_frequency": "monthly",
                "filling_due_day": 15,
            }
            res = await svc.get_assignment_progress(assignment, include_period_details=True)
            print(f"approved progress: {res.to_dict()}")
            assert res.completed == 1
        run_async(_t())

    def test_mixed_pending_and_rejected_over_two_periods(self):
        """Two-month assignment: Jan=rejected, Feb=pending_approval.
        Expected: total=2, completed=1 (feb), overdue=1 (jan)."""
        async def _t():
            await _cleanup()
            await _insert_env_record(1, 2025, "rejected", facility_id="fac_test_4")
            await _insert_env_record(2, 2025, "pending_approval", facility_id="fac_test_4")
            svc = CompletionService()
            assignment = {
                "organization_id": ORG_ID,
                "category": TEST_CATEGORY,
                "subcategory": TEST_SUBCATEGORY,
                "facility_id": "fac_test_4",
                "assignment_level": "facility",
                "start_date": "2025-01-01",
                "end_date": "2025-02-28",
                "filling_frequency": "monthly",
                "filling_due_day": 15,
            }
            res = await svc.get_assignment_progress(assignment, include_period_details=True)
            print(f"mixed progress: {res.to_dict()}")
            assert res.total == 2
            assert res.completed == 1
            assert res.overdue == 1
        run_async(_t())


# ---------- update_record rejected error contract ----------

class TestUpdateRecordRejectedContract:
    """update_record must raise HTTPException(400) with structured detail
    dict so the frontend can render .message safely."""

    def test_update_rejected_raises_structured_error(self):
        async def _t():
            await _cleanup()
            rec_id = f"{TEST_TAG}_upd_{uuid.uuid4()}"
            now = datetime.now(timezone.utc)
            await db.environment_records.insert_one({
                "id": rec_id,
                "organization_id": ORG_ID,
                "org_id": ORG_ID,
                "category": TEST_CATEGORY,
                "subcategory": TEST_SUBCATEGORY,
                "facility_id": None,
                "reporting_period": {"year": 2025, "month": 1},
                "status": "completed",
                "approval_status": "rejected",
                "rejection_reason": "invalid units",
                "rejected_at": now.isoformat(),
                "is_current": True,
                "field_values": {"value": 100},
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
            })

            svc = ESGRecordsService()
            # Mimic frontend PUT payload
            update_payload = UpdateRecordRequest(
                field_values={"value": 999},
                status="completed",
            )
            with pytest.raises(HTTPException) as exc_info:
                # section "environment" maps to environment_records
                await svc.update_record(
                    section="environment",
                    record_id=rec_id,
                    user_id="some_user",
                    data=update_payload,
                )
            exc = exc_info.value
            print(f"HTTPException: status={exc.status_code} detail={exc.detail}")
            assert exc.status_code == 400
            assert isinstance(exc.detail, dict), \
                f"Detail must be a dict (structured), got {type(exc.detail)}: {exc.detail}"
            for key in ("error", "message", "rejection_reason", "suggestion"):
                assert key in exc.detail, f"Missing key '{key}' in detail: {exc.detail}"
            assert exc.detail["error"] == "REJECTED_RECORD_EDIT_NOT_ALLOWED"
            assert "rejected" in exc.detail["message"].lower()
            assert exc.detail["rejection_reason"] == "invalid units"

        run_async(_t())


# ---------- HTTP-level smoke: PUT rejected returns structured JSON ----------

class TestUpdateRecordHTTP:
    """Verify the /api/esg-records/records/{section}/{id} PUT endpoint
    returns 400 with a JSON-serializable structured detail when trying to
    edit a rejected record. The frontend depends on `detail.message`."""

    @pytest.fixture(scope="class")
    def auth(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": "goyalsomil2001@gmail.com",
                                "password": "TestUser123!"})
        assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
        tok = r.json().get("access_token") or r.json().get("token")
        assert tok
        return {"Authorization": f"Bearer {tok}"}

    def test_put_rejected_record_returns_structured_error(self, auth):
        async def _seed():
            rec_id = f"{TEST_TAG}_http_{uuid.uuid4()}"
            now = datetime.now(timezone.utc)
            await db.environment_records.insert_one({
                "id": rec_id,
                "organization_id": ORG_ID,
                "org_id": ORG_ID,
                "category": TEST_CATEGORY,
                "subcategory": TEST_SUBCATEGORY,
                "facility_id": None,
                "reporting_period": {"year": 2025, "month": 3},
                "status": "completed",
                "approval_status": "rejected",
                "rejection_reason": "wrong period",
                "rejected_at": now.isoformat(),
                "is_current": True,
                "field_values": {"value": 12},
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
            })
            return rec_id

        rec_id = run_async(_seed())
        try:
            r = requests.put(
                f"{BASE_URL}/api/esg-records/records/environment/{rec_id}",
                headers={**auth, "Content-Type": "application/json"},
                json={"field_values": {"value": 42}, "status": "completed"},
                timeout=15,
            )
            print(f"PUT status={r.status_code} body={r.text[:500]}")
            assert r.status_code == 400, f"Expected 400, got {r.status_code}"
            body = r.json()
            detail = body.get("detail")
            assert isinstance(detail, dict), \
                f"detail must be object so FE can render detail.message, got {type(detail)}"
            assert detail.get("error") == "REJECTED_RECORD_EDIT_NOT_ALLOWED"
            assert "message" in detail and isinstance(detail["message"], str)
            assert detail.get("rejection_reason") == "wrong period"
        finally:
            run_async(db.environment_records.delete_one({"id": rec_id}))
