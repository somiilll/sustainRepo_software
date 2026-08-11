"""
Tests for BRSR question assignment fixes:
1. Reassign preserves due_date
2. Reassign with multiple users replaces assignees correctly (doesn't drop the new ones)
3. Assigning with 2 users - both appear in assignees list
"""
import os
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://sustain-dashboard.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASSWORD = "TestUser123!"
REPORTING_PERIOD = "FY 2026-2027"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def org_users(headers):
    """Get at least 3 users from the org."""
    r = requests.get(f"{BASE_URL}/api/admin/users", headers=headers, timeout=30)
    assert r.status_code == 200, f"users list failed: {r.status_code} {r.text}"
    data = r.json()
    users = data if isinstance(data, list) else data.get("users", data.get("data", []))
    assert len(users) >= 3, f"Need at least 3 users in org, got {len(users)}: {users}"
    return users[:3]


@pytest.fixture(scope="module")
def section_b_questions(headers):
    """Fetch SECTION_B disclosures for BRSR."""
    r = requests.get(
        f"{BASE_URL}/api/tracking/all/frameworks/brsr/sections/SECTION_B",
        params={"reporting_period": REPORTING_PERIOD},
        headers=headers, timeout=60,
    )
    assert r.status_code == 200, f"Fetch section B failed: {r.status_code} {r.text}"
    data = r.json()
    # Discover disclosure list — structure may vary
    disclosures = data.get("disclosures") or data.get("items") or []
    if not disclosures and isinstance(data, dict):
        # Try nested sections
        for v in data.values():
            if isinstance(v, list) and v and isinstance(v[0], dict) and "entity_id" in v[0]:
                disclosures = v
                break
    assert disclosures, f"No SECTION_B disclosures found: keys={list(data.keys()) if isinstance(data, dict) else type(data)}"
    return disclosures


def _find_disclosure(section_b_questions):
    # Choose a stable question_key
    for d in section_b_questions:
        qk = d.get("entity_id") or d.get("question_key")
        if qk:
            return qk
    pytest.fail("Could not find a disclosure question key")


def _get_assignment_for_question(headers, question_key):
    """Fetch section B and return the assignee list & due date for a given question_key."""
    r = requests.get(
        f"{BASE_URL}/api/tracking/all/frameworks/brsr/sections/SECTION_B",
        params={"reporting_period": REPORTING_PERIOD},
        headers=headers, timeout=60,
    )
    assert r.status_code == 200
    data = r.json()
    disclosures = data.get("disclosures") or data.get("items") or []
    if not disclosures and isinstance(data, dict):
        for v in data.values():
            if isinstance(v, list) and v and isinstance(v[0], dict) and "entity_id" in v[0]:
                disclosures = v
                break
    for d in disclosures:
        if (d.get("entity_id") or d.get("question_key")) == question_key:
            return d
    return None


class TestBRSRAssignmentFix:

    def test_1_assign_two_users_with_due_date(self, headers, org_users, section_b_questions):
        """Assign a BRSR question to 2 users with a due date and verify."""
        qk = _find_disclosure(section_b_questions)
        u1, u2 = org_users[0]["id"], org_users[1]["id"]
        due = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()

        payload = {
            "framework_id": "brsr",
            "section_id": "SECTION_B",
            "disclosure_ids": [qk],
            "assigned_user_ids": [u1, u2],
            "due_date": due,
            "reminder_enabled": True,
            "reminder_frequency": "weekly",
            "skip_already_assigned": False,
        }
        r = requests.post(
            f"{BASE_URL}/api/tracking/all/assign",
            params={"reporting_period": REPORTING_PERIOD},
            headers=headers, json=payload, timeout=60,
        )
        assert r.status_code == 200, f"Assign failed: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("success") is True, body

        # Verify via READ path
        d = _get_assignment_for_question(headers, qk)
        assert d is not None, f"Question {qk} not returned"
        assignees = d.get("assignees") or []
        assignee_ids = {a.get("user_id") for a in assignees}
        assert u1 in assignee_ids and u2 in assignee_ids, f"Expected both {u1},{u2} in {assignee_ids}"
        assert d.get("due_date"), f"due_date missing on assignment: {d}"

        # Persist for next tests
        pytest.brsr_qk = qk
        pytest.brsr_first_due = due

    def test_2_reassign_replaces_users_not_drop(self, headers, org_users):
        """Reassign the same question to user B and user C — only B and C should appear."""
        qk = pytest.brsr_qk
        uB, uC = org_users[1]["id"], org_users[2]["id"]
        due = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

        payload = {
            "framework_id": "brsr",
            "section_id": "SECTION_B",
            "disclosure_ids": [qk],
            "assigned_user_ids": [uB, uC],
            "due_date": due,
            "reminder_enabled": True,
            "reminder_frequency": "monthly",
            "skip_already_assigned": False,
        }
        r = requests.post(
            f"{BASE_URL}/api/tracking/all/assign",
            params={"reporting_period": REPORTING_PERIOD},
            headers=headers, json=payload, timeout=60,
        )
        assert r.status_code == 200, f"Reassign failed: {r.status_code} {r.text}"

        d = _get_assignment_for_question(headers, qk)
        assert d is not None
        assignees = d.get("assignees") or []
        assignee_ids = {a.get("user_id") for a in assignees}
        assert assignee_ids == {uB, uC}, (
            f"Reassign should replace to exactly {{{uB},{uC}}}, got {assignee_ids}"
        )
        # Due date updated
        assert d.get("due_date"), "due_date missing after reassign"
        # Verify due_date changed from first assignment
        assert d.get("due_date") != pytest.brsr_first_due, (
            f"due_date should be updated on reassign: {d.get('due_date')} vs {pytest.brsr_first_due}"
        )

    def test_3_reassign_add_user_keeps_all(self, headers, org_users):
        """Reassign with 3 users — all three should appear (per user story: adding user should NOT remove others)."""
        qk = pytest.brsr_qk
        u1, u2, u3 = org_users[0]["id"], org_users[1]["id"], org_users[2]["id"]
        due = (datetime.now(timezone.utc) + timedelta(days=45)).isoformat()

        payload = {
            "framework_id": "brsr",
            "section_id": "SECTION_B",
            "disclosure_ids": [qk],
            "assigned_user_ids": [u1, u2, u3],
            "due_date": due,
            "skip_already_assigned": False,
        }
        r = requests.post(
            f"{BASE_URL}/api/tracking/all/assign",
            params={"reporting_period": REPORTING_PERIOD},
            headers=headers, json=payload, timeout=60,
        )
        assert r.status_code == 200, r.text

        d = _get_assignment_for_question(headers, qk)
        assert d is not None
        assignee_ids = {a.get("user_id") for a in (d.get("assignees") or [])}
        assert assignee_ids == {u1, u2, u3}, (
            f"Expected all 3 users {u1, u2, u3} present, got {assignee_ids}"
        )
        assert d.get("due_date"), "due_date missing"
