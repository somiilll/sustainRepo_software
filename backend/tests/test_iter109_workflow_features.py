"""
Iteration 109: Tests for 4 workflow features
1) Assignment conflict validation (org vs facility overlap)
2) Delete approval workflow
3) Resubmission rule (rejected records cannot be edited)
4) Aggregate approval status calculation

We use pymongo (sync) for direct DB setup/cleanup and run async service
methods on a single shared event loop to keep motor happy.
"""
import os
import sys
import uuid
import asyncio
import pytest
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv

sys.path.insert(0, "/app/backend")
load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASSWORD = "TestUser123!"

# -----------------------------------------------------------------------------
# Single shared event loop for all async service calls (motor is bound to loop)
# -----------------------------------------------------------------------------
LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(LOOP)


def run_async(coro):
    return LOOP.run_until_complete(coro)


# -----------------------------------------------------------------------------
# Sync pymongo client for direct DB setup/cleanup (avoids motor loop issues)
# -----------------------------------------------------------------------------
from pymongo import MongoClient  # noqa: E402

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")
_sync_client = MongoClient(MONGO_URL)
sync_db = _sync_client[DB_NAME]


# -----------------------------------------------------------------------------
# Fixtures
# -----------------------------------------------------------------------------
@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def api(auth_token):
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json",
    })
    return s


@pytest.fixture(scope="module")
def org_info(api):
    r = api.get(f"{BASE_URL}/api/auth/me", timeout=30)
    assert r.status_code == 200
    data = r.json()
    return {"org_id": data["organization_id"], "user_id": data["id"]}


# =============================================================================
# Feature 4: Aggregate Approval Status (pure function unit tests)
# =============================================================================
class TestAggregateApprovalStatus:
    def test_all_approved(self):
        from modules.esg_assignments.completion_service import (
            calculate_aggregate_approval_status, AggregateApprovalStatus,
        )
        assert calculate_aggregate_approval_status(
            ["approved", "approved", "approved"]
        ) == AggregateApprovalStatus.ALL_APPROVED

    def test_has_rejection_blocks_everything(self):
        from modules.esg_assignments.completion_service import (
            calculate_aggregate_approval_status, AggregateApprovalStatus,
        )
        assert calculate_aggregate_approval_status(
            ["approved", "rejected", "approved"]
        ) == AggregateApprovalStatus.HAS_REJECTION
        assert calculate_aggregate_approval_status(
            ["pending_approval", "rejected"]
        ) == AggregateApprovalStatus.HAS_REJECTION

    def test_partially_approved_3_approved_2_pending(self):
        """Explicit review case: 3 approved + 2 pending => PARTIALLY_APPROVED."""
        from modules.esg_assignments.completion_service import (
            calculate_aggregate_approval_status, AggregateApprovalStatus,
        )
        result = calculate_aggregate_approval_status(
            ["approved", "approved", "approved", "pending_approval", "pending_approval"]
        )
        assert result == AggregateApprovalStatus.PARTIALLY_APPROVED

    def test_all_pending(self):
        from modules.esg_assignments.completion_service import (
            calculate_aggregate_approval_status, AggregateApprovalStatus,
        )
        assert calculate_aggregate_approval_status(
            ["pending_approval", "pending_approval"]
        ) == AggregateApprovalStatus.ALL_PENDING

    def test_empty_list(self):
        from modules.esg_assignments.completion_service import (
            calculate_aggregate_approval_status, AggregateApprovalStatus,
        )
        assert calculate_aggregate_approval_status([]) == AggregateApprovalStatus.NOT_REQUIRED


# =============================================================================
# Feature 1: Assignment conflict validation (service-level)
# =============================================================================
class TestAssignmentConflict:

    def test_org_level_conflicts_when_facility_level_exists(self, org_info):
        from modules.esg_assignments.assignment_service_v2 import assignment_service_v2
        from fastapi import HTTPException

        rp = f"TEST_CONF_{uuid.uuid4().hex[:8]}"
        org_id = org_info["org_id"]
        fac = sync_db.facilities.find_one(
            {"organization_id": org_id, "is_deleted": {"$ne": True}}, {"id": 1}
        )
        assert fac, "No facility available"
        facility_id = fac["id"]

        existing_id = str(uuid.uuid4())
        sync_db.esg_assignments.insert_one({
            "id": existing_id,
            "organization_id": org_id,
            "category": "Water",
            "subcategory": "Water Withdrawal",
            "sub_subcategory": None,
            "facility_id": facility_id,
            "assignment_level": "facility",
            "reporting_period": rp,
            "entity_type": "record_category",
            "status": "pending",
        })

        try:
            data = {
                "organization_id": org_id,
                "category": "Water",
                "subcategory": "Water Withdrawal",
                "sub_subcategory": None,
                "facility_id": None,
                "assignment_level": "organization",
                "reporting_period": rp,
                "entity_type": "record_category",
            }
            with pytest.raises(HTTPException) as exc:
                run_async(assignment_service_v2._validate_no_assignment_conflict(data))
            assert exc.value.status_code == 409
            detail = exc.value.detail
            assert detail["error"] == "ASSIGNMENT_CONFLICT"
            assert detail["conflict_type"] == "org_vs_facility"
            assert facility_id in detail["existing_facility_ids"]
        finally:
            sync_db.esg_assignments.delete_one({"id": existing_id})

    def test_facility_level_conflicts_when_org_level_exists(self, org_info):
        from modules.esg_assignments.assignment_service_v2 import assignment_service_v2
        from fastapi import HTTPException

        rp = f"TEST_CONF_{uuid.uuid4().hex[:8]}"
        org_id = org_info["org_id"]
        fac = sync_db.facilities.find_one(
            {"organization_id": org_id, "is_deleted": {"$ne": True}}, {"id": 1}
        )
        assert fac, "No facility available"
        facility_id = fac["id"]

        existing_id = str(uuid.uuid4())
        sync_db.esg_assignments.insert_one({
            "id": existing_id,
            "organization_id": org_id,
            "category": "Water",
            "subcategory": "Water Withdrawal",
            "sub_subcategory": None,
            "facility_id": None,
            "assignment_level": "organization",
            "reporting_period": rp,
            "entity_type": "record_category",
            "status": "pending",
        })

        try:
            data = {
                "organization_id": org_id,
                "category": "Water",
                "subcategory": "Water Withdrawal",
                "sub_subcategory": None,
                "facility_id": facility_id,
                "assignment_level": "facility",
                "reporting_period": rp,
                "entity_type": "record_category",
            }
            with pytest.raises(HTTPException) as exc:
                run_async(assignment_service_v2._validate_no_assignment_conflict(data))
            assert exc.value.status_code == 409
            assert exc.value.detail["error"] == "ASSIGNMENT_CONFLICT"
            assert exc.value.detail["conflict_type"] == "facility_vs_org"
            assert exc.value.detail["existing_assignment_id"] == existing_id
        finally:
            sync_db.esg_assignments.delete_one({"id": existing_id})

    def test_no_conflict_when_different_period(self, org_info):
        """Negative: different reporting_period should NOT raise."""
        from modules.esg_assignments.assignment_service_v2 import assignment_service_v2

        rp_existing = f"TEST_CONF_{uuid.uuid4().hex[:8]}"
        rp_new = f"TEST_CONF_{uuid.uuid4().hex[:8]}"
        org_id = org_info["org_id"]

        existing_id = str(uuid.uuid4())
        sync_db.esg_assignments.insert_one({
            "id": existing_id,
            "organization_id": org_id,
            "category": "Water",
            "subcategory": "Water Withdrawal",
            "sub_subcategory": None,
            "facility_id": None,
            "assignment_level": "organization",
            "reporting_period": rp_existing,
            "entity_type": "record_category",
            "status": "pending",
        })

        try:
            data = {
                "organization_id": org_id,
                "category": "Water",
                "subcategory": "Water Withdrawal",
                "sub_subcategory": None,
                "facility_id": "some-facility-id",
                "assignment_level": "facility",
                "reporting_period": rp_new,
                "entity_type": "record_category",
            }
            # Should not raise
            run_async(assignment_service_v2._validate_no_assignment_conflict(data))
        finally:
            sync_db.esg_assignments.delete_one({"id": existing_id})


# =============================================================================
# Feature 3: Resubmission rule
# =============================================================================
class TestRejectedRecordEditBlocked:

    def test_update_rejected_record_service_level(self, org_info):
        from modules.esg_records.service import esg_records_service
        from modules.esg_records.contracts import UpdateRecordRequest
        from fastapi import HTTPException

        org_id = org_info["org_id"]
        rec_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        rec = {
            "id": rec_id,
            "org_id": org_id,
            "organization_id": org_id,
            "category": "Water",
            "subcategory": "Water Withdrawal",
            "facility_id": None,
            "reporting_period": {"reporting_type": "monthly", "year": 2026, "month": 1},
            "field_values": {"test_field": 100},
            "status": "completed",
            "approval_status": "rejected",
            "rejection_reason": "TEST reason",
            "rejected_at": now,
            "is_current": True,
            "version": 1,
            "created_at": now,
            "updated_at": now,
        }
        sync_db.environment_records.insert_one(rec)
        try:
            payload = UpdateRecordRequest(field_values={"test_field": 200})
            with pytest.raises(HTTPException) as exc:
                run_async(esg_records_service.update_record(
                    section="environment",
                    record_id=rec_id,
                    user_id=org_info["user_id"],
                    data=payload,
                ))
            assert exc.value.status_code == 400
            assert exc.value.detail["error"] == "REJECTED_RECORD_EDIT_NOT_ALLOWED"
            assert exc.value.detail["rejection_reason"] == "TEST reason"
        finally:
            sync_db.environment_records.delete_one({"id": rec_id})

    def test_update_rejected_record_via_api(self, api, org_info):
        """End-to-end: PUT /records/{section}/{id} on rejected record => 400."""
        org_id = org_info["org_id"]
        rec_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        sync_db.environment_records.insert_one({
            "id": rec_id,
            "org_id": org_id,
            "organization_id": org_id,
            "category": "Water",
            "subcategory": "Water Withdrawal",
            "facility_id": None,
            "reporting_period": {"reporting_type": "monthly", "year": 2026, "month": 1},
            "field_values": {"volume": 500},
            "status": "completed",
            "approval_status": "rejected",
            "rejection_reason": "TEST rejection API",
            "rejected_at": now,
            "is_current": True,
            "version": 1,
            "created_at": now,
            "updated_at": now,
        })
        try:
            r = api.put(
                f"{BASE_URL}/api/esg-records/records/environment/{rec_id}",
                json={"field_values": {"volume": 600}},
                timeout=30,
            )
            assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
            body = r.json()
            detail = body.get("detail", body)
            if isinstance(detail, dict):
                assert detail.get("error") == "REJECTED_RECORD_EDIT_NOT_ALLOWED"
        finally:
            sync_db.environment_records.delete_one({"id": rec_id})


# =============================================================================
# Feature 2: Delete approval workflow
# =============================================================================
class TestDeleteApprovalWorkflow:

    def test_delete_approved_record_with_workflow_creates_approval_request(self, org_info):
        from modules.esg_records.service import esg_records_service

        org_id = org_info["org_id"]
        user_id = org_info["user_id"]
        rp_month = {"reporting_type": "monthly", "year": 2026, "month": 2}
        now = datetime.now(timezone.utc).isoformat()

        assignment_id = str(uuid.uuid4())
        rec_id = str(uuid.uuid4())

        sync_db.esg_assignments.insert_one({
            "id": assignment_id,
            "organization_id": org_id,
            "category": "Water",
            "subcategory": "TEST_Del_Approval",
            "sub_subcategory": None,
            "facility_id": None,
            "assignment_level": "organization",
            "reporting_period": "2026",
            "entity_type": "record_category",
            "status": "pending",
            "requires_approval": True,
            "approver_id": user_id,
            "approval_chain": [],
        })

        sync_db.environment_records.insert_one({
            "id": rec_id,
            "org_id": org_id,
            "organization_id": org_id,
            "category": "Water",
            "subcategory": "TEST_Del_Approval",
            "facility_id": None,
            "reporting_period": rp_month,
            "field_values": {"volume": 100},
            "status": "completed",
            "approval_status": "approved",
            "is_current": True,
            "version": 1,
            "created_at": now,
            "updated_at": now,
        })

        try:
            result = run_async(esg_records_service.delete_record(
                section="environment",
                record_id=rec_id,
                org_id=org_id,
                user_id=user_id,
            ))
            assert result.get("status") == "pending_approval", (
                f"Expected pending_approval, got: {result}"
            )
            assert "approval_request_id" in result

            still_there = sync_db.environment_records.find_one({"id": rec_id})
            assert still_there is not None
            assert still_there.get("pending_deletion") is True

            req = sync_db.approval_requests.find_one({"id": result["approval_request_id"]})
            assert req is not None
            assert req["request_type"] == "delete"
            assert req["entity_id"] == rec_id
            assert req["entity_type"] == "esg_record"
            assert req["status"] == "pending"

            # Approve the delete request via make_decision
            from modules.approval_workflow.service import ApprovalWorkflowService
            from modules.approval_workflow.models import ApprovalDecisionInput, ApprovalAction
            decision = ApprovalDecisionInput(action=ApprovalAction.APPROVE, comment="Approved for test")
            success, msg, updated = run_async(ApprovalWorkflowService.make_decision(
                request_id=result["approval_request_id"],
                decision=decision,
                current_user={"id": user_id, "role": "admin", "organization_id": org_id},
            ))
            assert success, f"Approval failed: {msg}"

            gone = sync_db.environment_records.find_one({"id": rec_id, "is_current": True})
            assert gone is None, "Record should be hard-deleted after approval"
        finally:
            sync_db.esg_assignments.delete_one({"id": assignment_id})
            sync_db.environment_records.delete_one({"id": rec_id})
            sync_db.approval_requests.delete_many({"entity_id": rec_id})

    def test_delete_without_approval_workflow_hard_deletes(self, org_info):
        """No requires_approval => immediate hard delete."""
        from modules.esg_records.service import esg_records_service

        org_id = org_info["org_id"]
        user_id = org_info["user_id"]
        rec_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        sync_db.environment_records.insert_one({
            "id": rec_id,
            "org_id": org_id,
            "organization_id": org_id,
            "category": "Water",
            "subcategory": "TEST_NoApproval",
            "facility_id": None,
            "reporting_period": {"reporting_type": "monthly", "year": 2026, "month": 3},
            "field_values": {"volume": 50},
            "status": "completed",
            "approval_status": "approved",
            "is_current": True,
            "version": 1,
            "created_at": now,
            "updated_at": now,
        })

        try:
            result = run_async(esg_records_service.delete_record(
                section="environment",
                record_id=rec_id,
                org_id=org_id,
                user_id=user_id,
            ))
            assert result.get("status") != "pending_approval", f"Got: {result}"
            gone = sync_db.environment_records.find_one({"id": rec_id, "is_current": True})
            assert gone is None
        finally:
            sync_db.environment_records.delete_one({"id": rec_id})
