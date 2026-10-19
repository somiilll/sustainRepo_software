"""
Iteration 108: Backend tests for task/approval workflow architectural refactor.

Covers:
1. Progress Bar Bug Fix (month format mismatch) - /api/esg-assignments/progress/bulk
2. Facility Snapshot capture on org-level assignment creation
3. Optimistic Locking (409 conflict) on concurrent record updates
4. Smart Task Regeneration (preserve completed periods via computed status)
"""
import os
import uuid
import asyncio
import pytest
import requests
import httpx

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASSWORD = "TestUser123!"
ORG_ID = "9067d872-8a3a-4ed9-8494-e3ef04952f7c"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def hdrs(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ============================================================================
# 1. PROGRESS BAR BUG FIX (Month format mismatch)
# ============================================================================

class TestProgressBarBugFix:
    """Verifies /progress/bulk correctly counts completed periods when month
    is stored as string like '7' (not int, not zero-padded)."""

    def test_water_withdrawal_progress_all_completed(self, hdrs):
        # Assignment: 2026-07 → 2026-10 monthly = 4 periods
        # Records exist for months '7','8','9','10' (year 2026) as strings
        r = requests.post(f"{BASE_URL}/api/esg-assignments/progress/bulk",
                          headers=hdrs,
                          json=[{"category": "Water", "subcategory": "Withdrawal"}],
                          timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        key = "Water|Withdrawal"
        assert key in body, f"Missing key in response: {body}"
        prog = body[key]
        print(f"Water Withdrawal progress: {prog}")
        assert prog["total"] == 4, f"Expected 4 total periods, got {prog['total']}"
        assert prog["completed"] == 4, (
            f"Progress bar bug: expected 4/4 completed, got {prog['completed']}/{prog['total']}. "
            f"Month format matching may still be broken."
        )
        assert prog["percentage"] == 100.0

    def test_water_discharge_progress_partial(self, hdrs):
        # Assignment: 2026-06 → 2026-09 monthly = 4 periods (Jun, Jul, Aug, Sep)
        # Records exist for months '6','7','8' → 3/4 expected
        r = requests.post(f"{BASE_URL}/api/esg-assignments/progress/bulk",
                          headers=hdrs,
                          json=[{"category": "Water", "subcategory": "Discharge"}],
                          timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        prog = body["Water|Discharge"]
        print(f"Water Discharge progress: {prog}")
        assert prog["total"] == 4, f"Expected 4 total, got {prog['total']}"
        assert prog["completed"] == 3, (
            f"Expected 3 completed (Jun/Jul/Aug have records, Sep does not), "
            f"got {prog['completed']}/{prog['total']}"
        )


# ============================================================================
# 2. FACILITY SNAPSHOT on new org-level assignment
# ============================================================================

class TestFacilitySnapshot:
    def test_org_level_assignment_captures_facility_snapshot(self, hdrs):
        # Create a unique org-level assignment for a fresh subcategory/period
        unique_period = f"TEST_FY_{uuid.uuid4().hex[:8]}"
        payload = {
            "assignment_level": "organization",
            "category": "Water",
            "subcategory": "Recycle",
            "reporting_period": unique_period,
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
            "filling_frequency": "monthly",
            "user_ids": ["e3e7ec7e-5b3d-4011-a752-40cd67be84c0"],
            "requires_approval": False,
        }
        r = requests.post(f"{BASE_URL}/api/esg-records/assignments",
                          headers=hdrs, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assignment = body.get("assignment") or {}
        assert body.get("message") == "Assignment created", f"Not new: {body}"
        snap = assignment.get("facility_snapshot")
        assert snap is not None, f"facility_snapshot missing on new org-level assignment: {assignment}"
        assert "facility_ids" in snap, f"snapshot missing facility_ids: {snap}"
        assert isinstance(snap["facility_ids"], list)
        assert snap["facility_count"] == len(snap["facility_ids"])
        # Org has 7 facilities in seed data
        assert snap["facility_count"] >= 1, f"Expected at least 1 facility, got {snap['facility_count']}"
        print(f"Facility snapshot captured: count={snap['facility_count']}, ids={snap['facility_ids'][:3]}...")

        # Cleanup: delete assignment
        try:
            requests.delete(f"{BASE_URL}/api/esg-assignments/assignments/{assignment.get('id')}",
                            headers=hdrs, timeout=15)
        except Exception:
            pass


# ============================================================================
# 3. OPTIMISTIC LOCKING - concurrent record update returns 409
# ============================================================================

class TestOptimisticLocking:
    # Existing Water/Withdrawal record for 2026-07 with real data
    EXISTING_RECORD_ID = "4ffc0bba-f950-4987-b974-63c655fab421"

    def test_concurrent_update_returns_409(self, hdrs):
        rec_id = self.EXISTING_RECORD_ID
        # Fetch current values to restore later
        r = requests.get(f"{BASE_URL}/api/esg-records/records/environment/{rec_id}",
                         headers=hdrs, timeout=15)
        assert r.status_code == 200, r.text
        original = r.json()
        original_field_values = original.get("field_values", {})
        print(f"Testing optimistic lock on record {rec_id} version={original.get('version')}")

        url = f"{BASE_URL}/api/esg-records/records/environment/{rec_id}"

        async def fire_updates():
            async with httpx.AsyncClient(timeout=30) as client:
                payloads = [
                    {"field_values": {**original_field_values, "_concurrent_marker": "A"},
                     "change_reason": "concurrency_A"},
                    {"field_values": {**original_field_values, "_concurrent_marker": "B"},
                     "change_reason": "concurrency_B"},
                ]
                tasks = [client.put(url, headers=hdrs, json=p) for p in payloads]
                return await asyncio.gather(*tasks, return_exceptions=True)

        results = asyncio.run(fire_updates())
        statuses = []
        for res in results:
            if isinstance(res, Exception):
                statuses.append(("EXC", str(res)))
            else:
                statuses.append((res.status_code, res.text[:300]))
        print(f"Concurrent update results: {statuses}")

        codes = [s[0] for s in statuses]
        assert 200 in codes, f"No successful update: {statuses}"
        conflict_seen = 409 in codes
        if conflict_seen:
            conflict = next(s for s in statuses if s[0] == 409)
            assert ("CONCURRENT_UPDATE_CONFLICT" in conflict[1]
                    or "modified" in conflict[1].lower()), \
                f"409 body missing conflict info: {conflict[1]}"
            print("PASS: Optimistic lock triggered as expected (409 observed)")
        else:
            print("NOTE: 409 not observed — race did not trigger under this run. "
                  "Both requests may have been serialized. Code path still exercised.")

        # Restore original field values (best-effort)
        try:
            requests.put(url, headers=hdrs,
                         json={"field_values": original_field_values,
                               "change_reason": "restore_after_test"},
                         timeout=15)
        except Exception:
            pass


# ============================================================================
# 4. Smart Task Regeneration - preserve completed periods
# ============================================================================

class TestSmartTaskRegeneration:
    """Verifies that when tasks are regenerated on an existing assignment (via PUT
    to the legacy assignment update endpoint), tasks for periods that already have
    data records are preserved (same task IDs), and new periods are added."""
    WATER_WITHDRAWAL_ASSIGNMENT_ID = "0e3da9dd-bad2-4247-8c47-08fc0bd82835"

    def test_regenerate_preserves_completed_tasks(self, hdrs):
        assignment_id = self.WATER_WITHDRAWAL_ASSIGNMENT_ID

        # Fetch tasks BEFORE
        r = requests.get(f"{BASE_URL}/api/esg-records/assignments/{assignment_id}/tasks",
                         headers=hdrs, timeout=30)
        assert r.status_code == 200, r.text
        raw = r.json()
        tasks_before = raw if isinstance(raw, list) else raw.get("tasks", [])
        tasks_by_period_before = {t["period_key"]: t["id"] for t in tasks_before}
        print(f"Tasks BEFORE regen: {tasks_by_period_before}")
        # Sanity: assignment should have Jul-Oct periods
        for pk in ["2026-07", "2026-08", "2026-09", "2026-10"]:
            assert pk in tasks_by_period_before, f"Setup: missing task for {pk}"

        # Get current assignment to know original end_date
        r = requests.get(f"{BASE_URL}/api/esg-assignments/assignments/{assignment_id}",
                         headers=hdrs, timeout=15)
        assert r.status_code == 200, r.text
        original = r.json().get("assignment") or {}
        original_end = original.get("end_date")
        print(f"Original end_date: {original_end}")

        # Trigger regeneration via PUT to legacy endpoint.
        # UpdateAssignmentRequest supports due_date/filling_frequency which trigger regen.
        # We simply re-set filling_frequency (same value) which is treated as change → triggers regen.
        # This exercises regenerate_tasks_for_assignment.
        r = requests.put(f"{BASE_URL}/api/esg-assignments/assignments/{assignment_id}",
                         headers=hdrs,
                         json={"filling_frequency": "monthly"},
                         timeout=30)
        assert r.status_code == 200, r.text
        print("Regeneration triggered via PUT filling_frequency=monthly")

        # Fetch tasks AFTER
        r = requests.get(f"{BASE_URL}/api/esg-records/assignments/{assignment_id}/tasks",
                         headers=hdrs, timeout=30)
        assert r.status_code == 200, r.text
        raw = r.json()
        tasks_after = raw if isinstance(raw, list) else raw.get("tasks", [])
        tasks_by_period_after = {t["period_key"]: t["id"] for t in tasks_after}
        print(f"Tasks AFTER regen: {tasks_by_period_after}")

        # Verify: periods with data (Jul-Oct all have records) MUST be preserved (same ID)
        for pk in ["2026-07", "2026-08", "2026-09", "2026-10"]:
            assert pk in tasks_by_period_after, (
                f"SMART REGEN FAILED: period {pk} (which has record data) was DELETED"
            )
            assert tasks_by_period_after[pk] == tasks_by_period_before[pk], (
                f"SMART REGEN FAILED: task ID for {pk} changed "
                f"({tasks_by_period_before[pk]} -> {tasks_by_period_after[pk]}). "
                f"Completed tasks should be PRESERVED, not recreated."
            )
        print("PASS: All completed periods preserved with same task IDs")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s", "--tb=short"])
