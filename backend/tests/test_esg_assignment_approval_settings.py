"""
Tests for ESG assignment approval settings (requires_approval + approver_id) persistence.

Verifies fix that ensures approver_id is saved for both facility-level and organization-level
assignments via POST /api/esg-records/assignments.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASSWORD = "TestUser123!"
FACILITY_ID = "c2ec2a8f-fffc-4cfc-958c-85073ce3ab63"

# Use a unique reporting period per run to avoid cross-run interference,
# but stable per-test-session to allow update-verification patterns.
REPORTING_PERIOD = f"TEST_FY_{uuid.uuid4().hex[:8]}"

TEST_CATEGORY = "Environment"
TEST_SUBCATEGORY = "Energy"
TEST_SUB_SUBCATEGORY = "Consumption"


@pytest.fixture(scope="session")
def auth_headers():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"No token in login response: {data}"
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def admin_user(auth_headers):
    r = requests.get(f"{API}/auth/me", headers=auth_headers, timeout=15)
    assert r.status_code == 200, f"auth/me failed: {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def org_users(auth_headers):
    """Fetch users in org for use as assignees / approvers."""
    # Try a couple of common endpoints
    for path in ["/users", "/organizations/users", "/admin/users"]:
        r = requests.get(f"{API}{path}", headers=auth_headers, timeout=15)
        if r.status_code == 200:
            data = r.json()
            if isinstance(data, dict):
                users = data.get("users") or data.get("items") or data.get("data") or []
            else:
                users = data
            if users:
                return users
    pytest.skip("Could not fetch org users list")


def _pick_two_users(admin_user, org_users):
    """Return (assignee_id, approver_id) preferring users other than admin."""
    admin_id = admin_user.get("id")
    ids = [u.get("id") for u in org_users if u.get("id")]
    # Prefer non-admin ids
    others = [i for i in ids if i != admin_id]
    if len(others) >= 2:
        return others[0], others[1]
    if len(others) == 1:
        return others[0], admin_id
    # Fall back to using admin id for both
    return admin_id, admin_id


def _cleanup_assignment(auth_headers, org_id, facility_id):
    """Best-effort cleanup by DELETE /api/esg-records/assignments/{id}
    (skipped if endpoint not available)."""
    # We don't strictly need cleanup because reporting_period is unique per run.
    return


# --------------------------------------------------------------------------
# FACILITY-LEVEL ASSIGNMENT
# --------------------------------------------------------------------------
class TestFacilityLevelApprovalSettings:
    def test_create_facility_level_with_approval(self, auth_headers, admin_user, org_users):
        assignee_id, approver_id = _pick_two_users(admin_user, org_users)

        payload = {
            "assignment_level": "facility",
            "category": TEST_CATEGORY,
            "subcategory": TEST_SUBCATEGORY,
            "sub_subcategory": TEST_SUB_SUBCATEGORY,
            "reporting_period": REPORTING_PERIOD + "_facility",
            "facility_assignments": {
                FACILITY_ID: [assignee_id],
            },
            "requires_approval": True,
            "approver_id": approver_id,
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
            "filling_frequency": "monthly",
        }

        r = requests.post(
            f"{API}/esg-records/assignments",
            headers=auth_headers,
            json=payload,
            timeout=30,
        )
        assert r.status_code == 200, f"Create failed: {r.status_code} {r.text}"

        body = r.json()
        assignments = body.get("assignments") or []
        assert len(assignments) >= 1, f"No assignments returned: {body}"

        assignment = assignments[0]
        # Persistence assertions on response
        assert assignment.get("requires_approval") is True, (
            f"requires_approval not set correctly: {assignment}"
        )
        assert assignment.get("approver_id") == approver_id, (
            f"approver_id not saved. expected={approver_id} got={assignment.get('approver_id')}"
        )
        assert assignment.get("facility_id") == FACILITY_ID
        assert assignment.get("assignment_level") == "facility"

        # Verify by GET via tracker endpoint
        assignment_id = assignment.get("id")
        assert assignment_id, "Assignment id missing"

        # Progress endpoint returns 200 if assignment exists in DB
        r2 = requests.get(
            f"{API}/esg-assignments/assignments/{assignment_id}",
            headers=auth_headers,
            timeout=15,
        )
        # Endpoint may or may not exist under esg-assignments; try tracker fallback
        if r2.status_code == 200:
            fetched = r2.json().get("assignment", r2.json())
            assert fetched.get("requires_approval") is True
            assert fetched.get("approver_id") == approver_id
        else:
            # Fallback: query DB via progress endpoint just to confirm existence
            r3 = requests.get(
                f"{API}/esg-assignments/progress/{assignment_id}",
                headers=auth_headers,
                timeout=15,
            )
            assert r3.status_code == 200, (
                f"Assignment could not be fetched back. detail_get={r2.status_code} "
                f"progress_get={r3.status_code} body={r3.text}"
            )

    def test_facility_level_without_approver_id(self, auth_headers, admin_user, org_users):
        """When requires_approval=False and no approver_id, both should still be
        persisted correctly (False + None)."""
        assignee_id, _ = _pick_two_users(admin_user, org_users)
        payload = {
            "assignment_level": "facility",
            "category": TEST_CATEGORY,
            "subcategory": TEST_SUBCATEGORY,
            "sub_subcategory": TEST_SUB_SUBCATEGORY,
            "reporting_period": REPORTING_PERIOD + "_facility_noapp",
            "facility_assignments": {FACILITY_ID: [assignee_id]},
            "requires_approval": False,
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
            "filling_frequency": "monthly",
        }
        r = requests.post(
            f"{API}/esg-records/assignments",
            headers=auth_headers,
            json=payload,
            timeout=30,
        )
        assert r.status_code == 200, f"Create failed: {r.text}"
        assignment = (r.json().get("assignments") or [{}])[0]
        assert assignment.get("requires_approval") is False
        assert assignment.get("approver_id") in (None, "", [])


# --------------------------------------------------------------------------
# ORGANIZATION-LEVEL ASSIGNMENT
# --------------------------------------------------------------------------
class TestOrgLevelApprovalSettings:
    def test_create_org_level_with_approval(self, auth_headers, admin_user, org_users):
        assignee_id, approver_id = _pick_two_users(admin_user, org_users)
        payload = {
            "assignment_level": "organization",
            "category": TEST_CATEGORY,
            "subcategory": TEST_SUBCATEGORY,
            "sub_subcategory": TEST_SUB_SUBCATEGORY,
            "reporting_period": REPORTING_PERIOD + "_org",
            "user_ids": [assignee_id],
            "requires_approval": True,
            "approver_id": approver_id,
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
            "filling_frequency": "monthly",
        }
        r = requests.post(
            f"{API}/esg-records/assignments",
            headers=auth_headers,
            json=payload,
            timeout=30,
        )
        assert r.status_code == 200, f"Create failed: {r.status_code} {r.text}"

        body = r.json()
        assignment = body.get("assignment") or {}
        assert assignment, f"No assignment in response: {body}"

        assert assignment.get("requires_approval") is True
        assert assignment.get("approver_id") == approver_id
        assert assignment.get("facility_id") in (None, "")
        assert assignment.get("assignment_level") == "organization"

        # Update path: send again with a different approver_id (still org-level)
        _, second_approver = _pick_two_users(admin_user, org_users)
        if second_approver == approver_id and len(org_users) > 2:
            # try different one
            candidates = [u.get("id") for u in org_users if u.get("id") and u.get("id") not in (approver_id, assignee_id)]
            if candidates:
                second_approver = candidates[0]

        payload2 = {**payload, "approver_id": second_approver}
        r2 = requests.post(
            f"{API}/esg-records/assignments",
            headers=auth_headers,
            json=payload2,
            timeout=30,
        )
        assert r2.status_code == 200, f"Update failed: {r2.text}"
        updated = r2.json().get("assignment") or {}
        assert updated.get("approver_id") == second_approver, (
            f"approver_id not updated. want={second_approver} got={updated.get('approver_id')}"
        )
        assert updated.get("requires_approval") is True
