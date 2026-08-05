"""
Iteration 110: Assignment Versioning Feature Tests

Verifies:
1. New assignment created with version=1
2. Updating assignment increments version and logs history
3. Newly generated tasks capture assignment_version_at_creation,
   created_with_approval_workflow, created_with_approver_id,
   created_with_facility_snapshot
4. On assignment edit:
   - Completed tasks (data exists) are preserved and stamped with
     assignment_version_at_completion snapshot fields
   - Pending tasks (no data) are updated (updated_at bumped)
5. Assignment history logs version_updated with previous and new state

Uses direct service-layer calls with a single shared event loop (motor is
bound to the first loop it sees), and pymongo (sync) for setup/cleanup.
"""
import os
import sys
import uuid
import asyncio
import pytest
from datetime import datetime, timezone
from dotenv import load_dotenv

sys.path.insert(0, "/app/backend")
load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")

# Shared loop -- motor is bound to first loop seen
LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(LOOP)


def run_async(coro):
    return LOOP.run_until_complete(coro)


from pymongo import MongoClient  # noqa: E402

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")
_sync_client = MongoClient(MONGO_URL)
sync_db = _sync_client[DB_NAME]

# Import service (async) - reuses same event loop
from modules.esg_assignments.assignment_service_v2 import assignment_service_v2  # noqa: E402

ORG_ID = "9067d872-8a3a-4ed9-8494-e3ef04952f7c"
ADMIN_USER_ID = "TEST_admin_user_iter110"
REPORTING_PERIOD = "2026"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _cleanup(subcategory_tag: str):
    """Delete all TEST_ prefixed data related to this test run."""
    sync_db.esg_assignments.delete_many({
        "organization_id": ORG_ID,
        "subcategory": subcategory_tag,
    })
    sync_db.esg_assignment_assignees.delete_many({
        "user_id": {"$regex": "^TEST_"},
    })
    sync_db.esg_assignment_history.delete_many({
        "changed_by_user_id": ADMIN_USER_ID,
    })
    sync_db.esg_reporting_tasks.delete_many({
        "organization_id": ORG_ID,
        "subcategory": subcategory_tag,
    })
    sync_db.environment_records.delete_many({
        "organization_id": ORG_ID,
        "subcategory": subcategory_tag,
    })


def _make_assignment_data(subcategory_tag: str, **overrides):
    data = {
        "organization_id": ORG_ID,
        "entity_type": "record_category",
        "category": "Water",
        "subcategory": subcategory_tag,
        "sub_subcategory": None,
        "facility_id": None,
        "assignment_level": "organization",
        "reporting_period": REPORTING_PERIOD,
        "start_date": "2026-01-01",
        "end_date": "2026-03-31",
        "timezone": "Asia/Kolkata",
        "filling_frequency": "monthly",
        "due_config": {"offset_days": 15, "timezone": "Asia/Kolkata"},
        "requires_approval": False,
        "approver_id": None,
        "approval_chain": [],
    }
    data.update(overrides)
    return data


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
class TestAssignmentVersioning:
    """Assignment versioning end-to-end at the service layer."""

    def test_01_new_assignment_has_version_1(self):
        subcat = f"TEST_iter110_v1_{uuid.uuid4().hex[:8]}"
        _cleanup(subcat)
        try:
            data = _make_assignment_data(subcat)
            assignment, is_new = run_async(
                assignment_service_v2.create_or_update_assignment(
                    data=data, user_ids=[ADMIN_USER_ID],
                    created_by_user_id=ADMIN_USER_ID,
                )
            )
            assert is_new is True
            assert assignment["version"] == 1
            # Facility snapshot captured for org-level
            assert assignment.get("facility_snapshot") is not None
            assert "facility_ids" in assignment["facility_snapshot"]

            # Verify created history entry
            hist = list(sync_db.esg_assignment_history.find({
                "assignment_id": assignment["id"],
            }))
            actions = [h["action"] for h in hist]
            assert "created" in actions
        finally:
            _cleanup(subcat)

    def test_02_update_increments_version_and_logs_changes(self):
        subcat = f"TEST_iter110_v2_{uuid.uuid4().hex[:8]}"
        _cleanup(subcat)
        try:
            data = _make_assignment_data(subcat, requires_approval=False)
            a1, _ = run_async(
                assignment_service_v2.create_or_update_assignment(
                    data=data, user_ids=[ADMIN_USER_ID],
                    created_by_user_id=ADMIN_USER_ID,
                )
            )
            assert a1["version"] == 1

            # Update: enable approval, change approver
            data2 = _make_assignment_data(
                subcat,
                requires_approval=True,
                approver_id="TEST_approver_1",
                filling_frequency="quarterly",
            )
            a2, is_new = run_async(
                assignment_service_v2.create_or_update_assignment(
                    data=data2, user_ids=[ADMIN_USER_ID],
                    created_by_user_id=ADMIN_USER_ID,
                )
            )
            assert is_new is False
            assert a2["version"] == 2
            assert a2["requires_approval"] is True
            assert a2["approver_id"] == "TEST_approver_1"
            assert a2["filling_frequency"] == "quarterly"

            # Third update to be sure it increments again
            data3 = _make_assignment_data(
                subcat,
                requires_approval=True,
                approver_id="TEST_approver_2",
                filling_frequency="quarterly",
            )
            a3, _ = run_async(
                assignment_service_v2.create_or_update_assignment(
                    data=data3, user_ids=[ADMIN_USER_ID],
                    created_by_user_id=ADMIN_USER_ID,
                )
            )
            assert a3["version"] == 3

            # History: version_updated entry with changes payload
            hist = list(sync_db.esg_assignment_history.find({
                "assignment_id": a1["id"],
                "action": "version_updated",
            }))
            assert len(hist) >= 2
            latest = sorted(hist, key=lambda h: h["created_at"])[-1]
            assert latest["previous_value"]["version"] in (1, 2)
            assert latest["new_value"]["version"] in (2, 3)
            assert "changes" in latest["new_value"]
            # approver_id change captured
            changes = latest["new_value"]["changes"]
            assert "approver_id" in changes
        finally:
            _cleanup(subcat)

    def test_03_new_tasks_have_versioning_fields(self):
        subcat = f"TEST_iter110_v3_{uuid.uuid4().hex[:8]}"
        _cleanup(subcat)
        try:
            data = _make_assignment_data(
                subcat,
                requires_approval=True,
                approver_id="TEST_approver_task",
            )
            a1, _ = run_async(
                assignment_service_v2.create_or_update_assignment(
                    data=data, user_ids=[ADMIN_USER_ID],
                    created_by_user_id=ADMIN_USER_ID,
                )
            )
            # Query tasks created by task engine
            tasks = list(sync_db.esg_reporting_tasks.find({
                "assignment_id": a1["id"],
            }))
            assert len(tasks) > 0, "Task engine should have generated at least one task"

            for t in tasks:
                assert t.get("assignment_version_at_creation") == 1, \
                    f"Task missing assignment_version_at_creation: {t}"
                assert t.get("created_with_approval_workflow") is True
                assert t.get("created_with_approver_id") == "TEST_approver_task"
                # facility_snapshot captured (org-level)
                assert t.get("created_with_facility_snapshot") is not None
                assert "facility_ids" in t["created_with_facility_snapshot"]
        finally:
            _cleanup(subcat)

    def test_04_edit_preserves_completed_and_updates_pending_tasks(self):
        subcat = f"TEST_iter110_v4_{uuid.uuid4().hex[:8]}"
        _cleanup(subcat)
        try:
            data = _make_assignment_data(
                subcat,
                requires_approval=False,
                approver_id=None,
            )
            a1, _ = run_async(
                assignment_service_v2.create_or_update_assignment(
                    data=data, user_ids=[ADMIN_USER_ID],
                    created_by_user_id=ADMIN_USER_ID,
                )
            )
            assert a1["version"] == 1

            tasks_v1 = list(sync_db.esg_reporting_tasks.find({
                "assignment_id": a1["id"],
            }))
            assert len(tasks_v1) >= 2, "Need at least 2 tasks (monthly Jan-Mar 2026)"

            # Pick first task's period, seed environment_record → "completed"
            first_task = sorted(tasks_v1, key=lambda t: t["period_key"])[0]
            completed_period = first_task["period_key"]  # e.g. 2026-01
            year, month = completed_period.split("-")
            sync_db.environment_records.insert_one({
                "id": f"TEST_env_rec_{uuid.uuid4().hex[:8]}",
                "organization_id": ORG_ID,
                "category": "Water",
                "subcategory": subcat,
                "reporting_period": {"year": int(year), "month": int(month)},
                "value": 100,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            })

            # Update assignment: change approver + enable approval
            data2 = _make_assignment_data(
                subcat,
                requires_approval=True,
                approver_id="TEST_approver_new",
            )
            a2, _ = run_async(
                assignment_service_v2.create_or_update_assignment(
                    data=data2, user_ids=[ADMIN_USER_ID],
                    created_by_user_id=ADMIN_USER_ID,
                )
            )
            assert a2["version"] == 2

            # Re-fetch tasks
            tasks_v2 = list(sync_db.esg_reporting_tasks.find({
                "assignment_id": a1["id"],
            }))
            by_id = {t["id"]: t for t in tasks_v2}

            # Completed task should have snapshot fields set
            completed_now = by_id[first_task["id"]]
            assert completed_now.get("assignment_version_at_completion") == 1, \
                f"Completed task should be stamped with pre-update version=1, got: {completed_now.get('assignment_version_at_completion')}"
            assert completed_now.get("completed_with_approval_workflow") is False, \
                "Completed task should preserve original approval workflow (False)"
            assert completed_now.get("completed_with_approver_id") is None
            # facility snapshot preserved from creation-time
            assert completed_now.get("completed_with_facility_snapshot") is not None

            # Pending task should NOT have completion snapshot; updated_at bumped
            pending_task = None
            for t in tasks_v1:
                if t["id"] != first_task["id"]:
                    pending_task = t
                    break
            assert pending_task is not None
            pending_now = by_id[pending_task["id"]]
            assert pending_now.get("assignment_version_at_completion") is None, \
                "Pending task should NOT be stamped with completion snapshot"
            # updated_at should differ (bumped by pending-update branch)
            assert pending_now.get("updated_at") != pending_task.get("updated_at")
        finally:
            _cleanup(subcat)

    def test_05_history_records_previous_and_new_state(self):
        subcat = f"TEST_iter110_v5_{uuid.uuid4().hex[:8]}"
        _cleanup(subcat)
        try:
            data = _make_assignment_data(subcat, requires_approval=False)
            a1, _ = run_async(
                assignment_service_v2.create_or_update_assignment(
                    data=data, user_ids=[ADMIN_USER_ID],
                    created_by_user_id=ADMIN_USER_ID,
                )
            )
            data2 = _make_assignment_data(
                subcat,
                requires_approval=True,
                approver_id="TEST_hist_approver",
            )
            run_async(
                assignment_service_v2.create_or_update_assignment(
                    data=data2, user_ids=[ADMIN_USER_ID],
                    created_by_user_id=ADMIN_USER_ID,
                )
            )
            hist = list(sync_db.esg_assignment_history.find({
                "assignment_id": a1["id"],
                "action": "version_updated",
            }))
            assert len(hist) == 1
            entry = hist[0]
            prev = entry["previous_value"]
            new = entry["new_value"]

            # Previous version snapshot
            assert prev["version"] == 1
            assert prev["requires_approval"] is False
            assert prev.get("approver_id") is None

            # New version + change map
            assert new["version"] == 2
            assert "changes" in new
            assert new["changes"].get("requires_approval") == {
                "old": False, "new": True,
            }
            assert new["changes"].get("approver_id") == {
                "old": None, "new": "TEST_hist_approver",
            }
        finally:
            _cleanup(subcat)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
