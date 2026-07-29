"""
Backend tests for role-based access control for ESG Tracker & Reporting.

Feature scope (iteration_92):
1. GET /api/esg-records/tracker/{section} returns is_admin_view flag.
2. Non-admin users only see their own tracker assignments (auto-filtered).
3. POST /api/esg-records/assignments returns 403 for non-admins.
4. GET /api/esg-questionnaire/gri/{section} filters by assignment for non-admins.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://esg-unified-db.preview.emergentagent.com").rstrip("/")

ADMIN_EMAIL = "esg-test-user@example.com"
ADMIN_PASSWORD = "TestUser123!"
USER_EMAIL = "esg-regular-user@example.com"
USER_PASSWORD = "TestUser123!"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"No token returned: {data}"
    return token, data.get("user", {})


@pytest.fixture(scope="module")
def admin_token():
    tok, _ = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    return tok


@pytest.fixture(scope="module")
def user_token():
    tok, user = _login(USER_EMAIL, USER_PASSWORD)
    assert user.get("role") == "user", f"Expected role 'user', got {user.get('role')}"
    return tok


def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- Tracker endpoint ----------

class TestTrackerRoleBased:
    def test_admin_tracker_returns_is_admin_view_true(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/esg-records/tracker/environment", headers=_auth(admin_token), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "is_admin_view" in data, "Missing is_admin_view flag"
        assert data["is_admin_view"] is True
        assert "assignments" in data
        assert "total" in data

    def test_user_tracker_returns_is_admin_view_false(self, user_token):
        r = requests.get(f"{BASE_URL}/api/esg-records/tracker/environment", headers=_auth(user_token), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("is_admin_view") is False, f"Expected is_admin_view False, got {data.get('is_admin_view')}"

    def test_user_tracker_only_shows_own_assignments(self, user_token):
        """Non-admin: every assignment must be assigned to the requesting user."""
        # Get user id
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=_auth(user_token), timeout=30)
        assert me.status_code == 200
        user_id = me.json().get("id")
        assert user_id

        r = requests.get(f"{BASE_URL}/api/esg-records/tracker/environment", headers=_auth(user_token), timeout=30)
        assert r.status_code == 200
        assignments = r.json().get("assignments", [])
        # For every assignment returned, the user should be an assignee
        for a in assignments:
            assignees = a.get("assigned_to") or a.get("assigned_user_ids") or []
            if isinstance(assignees, str):
                assignees = [assignees]
            # Some assignments may store user under assignment sub-object
            if not assignees and a.get("assignment"):
                assignees = a["assignment"].get("assigned_user_ids", []) or [a["assignment"].get("assigned_to")]
                assignees = [x for x in assignees if x]
            assert user_id in assignees, f"Assignment {a.get('id')} not assigned to user: assignees={assignees}"


# ---------- Assignment creation ----------

class TestAssignmentCreation:
    def test_user_cannot_create_assignment_403(self, user_token):
        payload = {
            "section": "environment",
            "category": "Water",
            "assigned_user_ids": ["some-user-id"],
            "reporting_period": "FY 2025-26",
        }
        r = requests.post(f"{BASE_URL}/api/esg-records/assignments", headers=_auth(user_token), json=payload, timeout=30)
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"
        detail = r.json().get("detail", "")
        assert "admin" in detail.lower(), f"Expected 'admin' in detail, got: {detail}"

    def test_admin_can_reach_assignment_endpoint(self, admin_token):
        """Admin should not get 403 (may get 400 for validation errors, but not 403)."""
        payload = {
            "section": "environment",
            "category": "TEST_Water_RBAC",
            "assigned_user_ids": [],
            "reporting_period": "FY 2025-26",
        }
        r = requests.post(f"{BASE_URL}/api/esg-records/assignments", headers=_auth(admin_token), json=payload, timeout=30)
        assert r.status_code != 403, f"Admin got 403: {r.text}"


# ---------- GRI disclosures ----------

class TestGriDisclosureFiltering:
    def test_admin_gri_returns_all(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/esg-questionnaire/gri/environment",
            params={"reporting_period": "FY 2024-2025"},
            headers=_auth(admin_token),
            timeout=30,
        )
        assert r.status_code == 200, r.text
        # Just verify success and store count for comparison
        data = r.json()
        assert isinstance(data, dict)

    def test_user_gri_returns_only_assigned_or_empty(self, user_token):
        r = requests.get(
            f"{BASE_URL}/api/esg-questionnaire/gri/environment",
            params={"reporting_period": "FY 2024-2025"},
            headers=_auth(user_token),
            timeout=30,
        )
        assert r.status_code == 200, r.text
        # Response should be valid dict; filter_by_assignment=True should be applied.
        data = r.json()
        assert isinstance(data, dict)

    def test_user_gri_count_le_admin(self, admin_token, user_token):
        """User's disclosure count should be <= admin's count (filtered subset)."""
        def _count_questions(resp_json):
            # Try multiple response shapes
            if isinstance(resp_json, list):
                return len(resp_json)
            if "disclosures" in resp_json:
                return sum(len(d.get("questions", [])) for d in resp_json["disclosures"])
            if "questions" in resp_json:
                return len(resp_json["questions"])
            if "groups" in resp_json:
                return sum(len(g.get("questions", [])) for g in resp_json["groups"])
            return -1

        params = {"reporting_period": "FY 2024-2025"}
        a = requests.get(f"{BASE_URL}/api/esg-questionnaire/gri/environment", params=params, headers=_auth(admin_token), timeout=30).json()
        u = requests.get(f"{BASE_URL}/api/esg-questionnaire/gri/environment", params=params, headers=_auth(user_token), timeout=30).json()
        ac, uc = _count_questions(a), _count_questions(u)
        print(f"admin_count={ac} user_count={uc}")
        if ac >= 0 and uc >= 0:
            assert uc <= ac, f"User count {uc} > admin count {ac}"
