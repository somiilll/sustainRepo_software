"""
Test suite for Iteration 112 P0 fixes:

1) Assignment deletion task lifecycle (ACTIVE -> CANCELLED / ORPHANED)
2) GET /api/esg-assignments/audit/cancelled-tasks endpoint
3) PUT esg-records blocks editing when record has pending_approval (409)
4) PUT esg-records blocks multiple pending edit requests (409)
5) admin_override=true bypasses the pending approval checks
"""
import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASSWORD = "TestUser123!"


# -----------------------
# Fixtures
# -----------------------
@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture(scope="module")
def auth():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("access_token") or body.get("token")
    user = body.get("user") or {}
    return {
        "token": token,
        "user_id": user.get("id") or body.get("user_id"),
        "org_id": user.get("organization_id") or body.get("organization_id"),
    }


@pytest.fixture(scope="module")
def headers(auth):
    return {"Authorization": f"Bearer {auth['token']}", "Content-Type": "application/json"}


# -----------------------
# 1) Assignment deletion -> task lifecycle
# -----------------------
class TestAssignmentDeletionLifecycle:
    def _create_assignment(self, headers, auth):
        payload = {
            "entity_type": "record",
            "assignment_level": "category",
            "entity_id": f"TEST_iter112_{uuid.uuid4().hex[:6]}",
            "reporting_period": "FY 2099-2100",
            "assigned_to_user_id": auth["user_id"],
            "role": "owner",
            "start_date": "2099-01-01",
            "end_date": "2099-03-31",
            "filling_frequency": "monthly",
            "filling_due_day": 15,
        }
        r = requests.post(
            f"{BASE_URL}/api/esg-assignments/assignments",
            headers=headers, json=payload, timeout=30
        )
        assert r.status_code == 200, f"Create failed: {r.status_code} {r.text}"
        return r.json()["assignment"]

    def test_delete_assignment_marks_tasks_cancelled(self, headers, auth, mongo):
        assignment = self._create_assignment(headers, auth)
        aid = assignment["id"]

        # Verify some tasks were generated (may be 0-3 depending on task engine behaviour)
        pre_tasks = list(mongo.esg_reporting_tasks.find(
            {"assignment_id": aid}, {"_id": 0, "id": 1, "lifecycle_status": 1}
        ))
        # Task engine may or may not have generated tasks for arbitrary category.
        # Even if none, delete should still succeed.

        # Delete
        r = requests.delete(
            f"{BASE_URL}/api/esg-assignments/assignments/{aid}",
            headers=headers, timeout=30
        )
        assert r.status_code == 200, f"Delete failed: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("success") is True
        assert "tasks_cancelled" in body
        assert "tasks_with_data_orphaned" in body

        # Assignment should be soft-deleted (status=cancelled), not removed
        a = mongo.esg_assignments.find_one({"id": aid}, {"_id": 0, "status": 1, "cancelled_at": 1})
        assert a is not None, "Assignment should still exist (soft delete)"
        assert a.get("status") == "cancelled", f"Expected status=cancelled, got {a.get('status')}"
        assert a.get("cancelled_at") is not None

        # All tasks (if any) should have lifecycle_status set to cancelled or orphaned
        post_tasks = list(mongo.esg_reporting_tasks.find(
            {"assignment_id": aid}, {"_id": 0, "id": 1, "lifecycle_status": 1}
        ))
        for t in post_tasks:
            assert t.get("lifecycle_status") in ("cancelled", "orphaned"), \
                f"Task {t['id']} has lifecycle_status={t.get('lifecycle_status')}"

        # If no tasks were pre-generated, the count assertions are trivially 0
        expected_total = body["tasks_cancelled"] + body["tasks_with_data_orphaned"]
        assert expected_total == len(post_tasks), \
            f"Response counts ({expected_total}) don't match tasks in DB ({len(post_tasks)})"

    def test_delete_nonexistent_assignment_returns_404(self, headers):
        fake_id = f"nonexistent-{uuid.uuid4()}"
        r = requests.delete(
            f"{BASE_URL}/api/esg-assignments/assignments/{fake_id}",
            headers=headers, timeout=30,
        )
        assert r.status_code == 404


# -----------------------
# 2) Audit endpoint for cancelled tasks
# -----------------------
class TestAuditCancelledTasks:
    def test_audit_endpoint_returns_cancelled_tasks(self, headers, auth, mongo):
        # Seed a synthetic cancelled task directly into DB to ensure endpoint returns results.
        task_id = f"TEST_task_{uuid.uuid4().hex[:8]}"
        mongo.esg_reporting_tasks.insert_one({
            "id": task_id,
            "organization_id": auth["org_id"],
            "assignment_id": f"TEST_assignment_{uuid.uuid4().hex[:8]}",
            "category": "TEST_Category",
            "subcategory": "TEST_Subcategory",
            "period_key": "2099-01",
            "lifecycle_status": "cancelled",
            "cancelled_at": datetime.now(timezone.utc).isoformat(),
            "cancelled_reason": "assignment_deleted",
        })

        try:
            r = requests.get(
                f"{BASE_URL}/api/esg-assignments/audit/cancelled-tasks",
                headers=headers, params={"lifecycle_status": "cancelled"}, timeout=30,
            )
            assert r.status_code == 200, f"Audit endpoint failed: {r.status_code} {r.text}"
            data = r.json()
            assert "tasks" in data
            assert "total" in data
            assert data["lifecycle_status"] == "cancelled"
            # The seeded task should appear
            ids = [t.get("id") for t in data["tasks"]]
            assert task_id in ids, f"Seeded task not present in audit result. Got {len(ids)} tasks."
        finally:
            mongo.esg_reporting_tasks.delete_one({"id": task_id})

    def test_audit_endpoint_orphaned_filter(self, headers, auth, mongo):
        task_id = f"TEST_task_{uuid.uuid4().hex[:8]}"
        mongo.esg_reporting_tasks.insert_one({
            "id": task_id,
            "organization_id": auth["org_id"],
            "assignment_id": f"TEST_assignment_{uuid.uuid4().hex[:8]}",
            "category": "TEST_Category",
            "period_key": "2099-02",
            "lifecycle_status": "orphaned",
            "orphaned_at": datetime.now(timezone.utc).isoformat(),
        })
        try:
            r = requests.get(
                f"{BASE_URL}/api/esg-assignments/audit/cancelled-tasks",
                headers=headers, params={"lifecycle_status": "orphaned"}, timeout=30,
            )
            assert r.status_code == 200
            data = r.json()
            ids = [t.get("id") for t in data["tasks"]]
            assert task_id in ids
        finally:
            mongo.esg_reporting_tasks.delete_one({"id": task_id})


# -----------------------
# Helper: create an ESG record and put it in pending_approval state
# -----------------------
def _create_test_record(headers, mongo, auth, category="Water", month="June"):
    payload = {
        "record_level": "organization",
        "category_id": f"test_{category}_{uuid.uuid4().hex[:6]}",
        "category": category,
        "subcategory": "Withdrawal",
        "frameworks": ["BRSR"],
        "reporting_period": {
            "reporting_type": "monthly",
            "year": 2099,
            "month": month,
        },
        "field_values": {"test_field": 100},
        "notes": f"TEST_iter112_{uuid.uuid4().hex[:8]}",
        "status": "completed",
    }
    r = requests.post(
        f"{BASE_URL}/api/esg-records/records/environment",
        headers=headers, json=payload, timeout=30,
    )
    assert r.status_code == 200, f"Create record failed: {r.status_code} {r.text}"
    return r.json()["record"]


def _set_pending_approval(mongo, record_id, org_id, user_id, is_edit=False):
    """Directly set the record to pending_approval and insert a matching approval_request."""
    mongo.environment_records.update_one(
        {"id": record_id, "is_current": True},
        {"$set": {"approval_status": "pending_approval"}}
    )
    req_id = str(uuid.uuid4())
    mongo.approval_requests.insert_one({
        "id": req_id,
        "entity_id": record_id,
        "entity_type": "esg_record",
        "status": "pending",
        "organization_id": org_id,
        "submitted_by": user_id,
        "submitted_at": datetime.now(timezone.utc).isoformat(),
        "entity_snapshot": {"is_edit": is_edit},
    })
    return req_id


# -----------------------
# 3) Pending approval edit blocking
# -----------------------
class TestPendingApprovalEditBlock:
    def test_edit_with_pending_approval_returns_409(self, headers, auth, mongo):
        record = _create_test_record(headers, mongo, auth, month="July")
        rid = record["id"]
        req_id = _set_pending_approval(mongo, rid, auth["org_id"], auth["user_id"], is_edit=False)

        try:
            r = requests.put(
                f"{BASE_URL}/api/esg-records/records/environment/{rid}",
                headers=headers,
                json={"field_values": {"test_field": 999}},
                timeout=30,
            )
            assert r.status_code == 409, f"Expected 409, got {r.status_code}: {r.text}"
            body = r.json()
            detail = body.get("detail", body)
            assert detail.get("error") == "PENDING_APPROVAL_EDIT_NOT_ALLOWED", detail
        finally:
            mongo.approval_requests.delete_one({"id": req_id})
            mongo.environment_records.delete_many({"id": rid})

    def test_admin_override_bypasses_pending_approval(self, headers, auth, mongo):
        record = _create_test_record(headers, mongo, auth, month="August")
        rid = record["id"]
        req_id = _set_pending_approval(mongo, rid, auth["org_id"], auth["user_id"], is_edit=False)

        try:
            r = requests.put(
                f"{BASE_URL}/api/esg-records/records/environment/{rid}?admin_override=true",
                headers=headers,
                json={"field_values": {"test_field": 777}},
                timeout=30,
            )
            assert r.status_code == 200, f"Admin override failed: {r.status_code} {r.text}"
            body = r.json()
            assert "record" in body
        finally:
            mongo.approval_requests.delete_one({"id": req_id})
            mongo.environment_records.delete_many({"id": rid})


# -----------------------
# 4) Multiple pending edit requests blocking
# -----------------------
class TestMultiplePendingEditRequests:
    def test_multiple_pending_edit_requests_blocked(self, headers, auth, mongo):
        """
        Set the record to approved (so pending_approval rule doesn't fire),
        but insert a pending edit approval request. New PUT should be blocked with 409.
        """
        record = _create_test_record(headers, mongo, auth, month="September")
        rid = record["id"]

        # Make the record 'approved' so pending_approval check is skipped
        mongo.environment_records.update_one(
            {"id": rid, "is_current": True},
            {"$set": {"approval_status": "approved"}}
        )
        # Insert a pending EDIT approval request
        req_id = str(uuid.uuid4())
        mongo.approval_requests.insert_one({
            "id": req_id,
            "entity_id": rid,
            "entity_type": "esg_record",
            "status": "pending",
            "organization_id": auth["org_id"],
            "submitted_by": auth["user_id"],
            "submitted_at": datetime.now(timezone.utc).isoformat(),
            "entity_snapshot": {"is_edit": True},
        })

        try:
            r = requests.put(
                f"{BASE_URL}/api/esg-records/records/environment/{rid}",
                headers=headers,
                json={"field_values": {"test_field": 555}},
                timeout=30,
            )
            assert r.status_code == 409, f"Expected 409, got {r.status_code}: {r.text}"
            body = r.json()
            detail = body.get("detail", body)
            assert detail.get("error") == "MULTIPLE_PENDING_EDITS_NOT_ALLOWED", detail
            assert detail.get("existing_request_id") == req_id
        finally:
            mongo.approval_requests.delete_one({"id": req_id})
            mongo.environment_records.delete_many({"id": rid})

    def test_admin_override_bypasses_multiple_pending_edits(self, headers, auth, mongo):
        record = _create_test_record(headers, mongo, auth, month="October")
        rid = record["id"]

        mongo.environment_records.update_one(
            {"id": rid, "is_current": True},
            {"$set": {"approval_status": "approved"}}
        )
        req_id = str(uuid.uuid4())
        mongo.approval_requests.insert_one({
            "id": req_id,
            "entity_id": rid,
            "entity_type": "esg_record",
            "status": "pending",
            "organization_id": auth["org_id"],
            "submitted_by": auth["user_id"],
            "submitted_at": datetime.now(timezone.utc).isoformat(),
            "entity_snapshot": {"is_edit": True},
        })

        try:
            r = requests.put(
                f"{BASE_URL}/api/esg-records/records/environment/{rid}?admin_override=true",
                headers=headers,
                json={"field_values": {"test_field": 333}},
                timeout=30,
            )
            assert r.status_code == 200, f"Admin override failed: {r.status_code} {r.text}"
        finally:
            mongo.approval_requests.delete_one({"id": req_id})
            mongo.environment_records.delete_many({"id": rid})


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
