"""
Tests for the new ESG Assignment data model (V2):
- One assignment doc per work item + separate esg_assignment_assignees
- Org-level ↔ Facility-level switching
- Multiple assignees per assignment
- KPI access endpoint compatibility
"""

import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASS = "TestUser123!"


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    # Try common auth endpoints
    for path in ["/api/auth/login", "/api/esg-auth/login", "/api/users/login"]:
        r = s.post(f"{BASE_URL}{path}", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
        if r.status_code == 200 and (r.json().get("token") or r.json().get("access_token")):
            data = r.json()
            token = data.get("token") or data.get("access_token")
            s.headers.update({"Authorization": f"Bearer {token}"})
            s.user = data.get("user") or {}
            s.org_id = s.user.get("organization_id") or "9067d872-8a3a-4ed9-8494-e3ef04952f7c"
            return s
    pytest.skip("Auth failed - cannot login admin")


@pytest.fixture(scope="module")
def org_facilities(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/facilities")
    if r.status_code != 200:
        pytest.skip(f"Cannot fetch facilities: {r.status_code}")
    data = r.json()
    facs = data if isinstance(data, list) else data.get("facilities", [])
    if len(facs) < 2:
        pytest.skip("Need at least 2 facilities")
    return facs


@pytest.fixture(scope="module")
def org_users(admin_session):
    # try common users endpoint
    for path in ["/api/users", "/api/esg-users", "/api/organizations/users"]:
        r = admin_session.get(f"{BASE_URL}{path}")
        if r.status_code == 200:
            d = r.json()
            users = d if isinstance(d, list) else d.get("users", [])
            if users:
                return users
    pytest.skip("Cannot fetch users list")


# ---------- Helpers ----------

TEST_CATEGORY = "Emissions"
TEST_SUBCATEGORY = "Scope 1"
TEST_PERIOD = "FY 2025-2026"


def _cleanup(admin_session):
    """Delete any test assignments for the test category via direct DB API not available;
    rely on switching operations to clean up."""
    pass


def _base_payload(user_id):
    return {
        "category": TEST_CATEGORY,
        "subcategory": TEST_SUBCATEGORY,
        "sub_subcategory": None,
        "reporting_period": TEST_PERIOD,
        "start_date": "2025-04-01",
        "end_date": "2026-03-31",
        "timezone": "Asia/Kolkata",
        "filling_frequency": "monthly",
        "due_config": {"type": "end_of_month"},
        "reminder_enabled": False,
        "requires_approval": False,
    }


# ---------- Tests ----------

class TestOrgLevelAssignment:
    """Test 1: Org-level create with multiple assignees creates ONE assignment doc"""

    def test_create_org_level_with_multiple_users(self, admin_session, org_users):
        user_ids = [u["id"] for u in org_users[:2]]
        payload = {
            **_base_payload(user_ids[0]),
            "assignment_level": "organization",
            "user_ids": user_ids,
        }
        r = admin_session.post(f"{BASE_URL}/api/esg-records/assignments", json=payload)
        assert r.status_code == 200, f"Failed: {r.status_code} {r.text[:400]}"
        body = r.json()
        assert "assignment" in body, body
        a = body["assignment"]
        assert a["facility_id"] is None
        assert a["assignment_level"] == "organization"
        assignees = a.get("assignees", [])
        assert len(assignees) == len(user_ids), f"Expected {len(user_ids)} assignees, got {len(assignees)}"
        assigned_ids = {x["user_id"] for x in assignees}
        assert assigned_ids == set(user_ids)
        # store id for later
        pytest.org_assignment_id = a["id"]


class TestSwitchOrgToFacility:
    """Test 2: Switching org->facility deletes org assignment, creates facility ones"""

    def test_switch_to_facility_level(self, admin_session, org_users, org_facilities):
        user_ids = [u["id"] for u in org_users[:2]]
        fac_ids = [f["id"] for f in org_facilities[:2]]
        facility_assignments = {
            fac_ids[0]: [user_ids[0]],
            fac_ids[1]: user_ids,  # 2 users on 2nd facility
        }
        payload = {
            **_base_payload(user_ids[0]),
            "assignment_level": "facility",
            "facility_assignments": facility_assignments,
        }
        r = admin_session.post(f"{BASE_URL}/api/esg-records/assignments", json=payload)
        assert r.status_code == 200, f"Failed: {r.status_code} {r.text[:400]}"
        body = r.json()
        assert body.get("deleted_org_level", 0) >= 1, f"Expected deleted_org_level>=1, got {body}"
        assert len(body.get("assignments", [])) == 2
        for a in body["assignments"]:
            assert a["facility_id"] in fac_ids
            assert a["assignment_level"] == "facility"
            assert len(a.get("assignees", [])) >= 1
        pytest.facility_ids_used = fac_ids


class TestSwitchFacilityToOrg:
    """Test 3: Switching facility->org deletes facility assignments, creates org one"""

    def test_switch_to_org_level(self, admin_session, org_users):
        user_ids = [u["id"] for u in org_users[:1]]
        payload = {
            **_base_payload(user_ids[0]),
            "assignment_level": "organization",
            "user_ids": user_ids,
        }
        r = admin_session.post(f"{BASE_URL}/api/esg-records/assignments", json=payload)
        assert r.status_code == 200, f"Failed: {r.status_code} {r.text[:400]}"
        body = r.json()
        # Should have deleted facility-level ones
        assert body.get("deleted_facility_level", 0) >= 1, f"Expected deleted_facility_level>=1, got {body}"
        a = body.get("assignment")
        assert a is not None
        assert a["facility_id"] is None
        assert a["assignment_level"] == "organization"


class TestTrackerReflectsAssignees:
    """Test 7: After creating assignment, tracker should show correct assignees"""

    def test_tracker_shows_assignment(self, admin_session):
        r = admin_session.get(
            f"{BASE_URL}/api/esg-records/tracker/environment",
            params={"reporting_period": TEST_PERIOD, "category": TEST_CATEGORY},
        )
        assert r.status_code == 200, r.text[:400]
        data = r.json()
        assignments = data.get("assignments", [])
        # Find our category assignment
        matching = [
            a for a in assignments
            if a.get("category") == TEST_CATEGORY and a.get("subcategory") == TEST_SUBCATEGORY
            and a.get("reporting_period") == TEST_PERIOD
        ]
        assert len(matching) >= 1, f"No matching tracker rows found. Got: {[(a.get('category'), a.get('subcategory')) for a in assignments[:10]]}"


class TestKPIAccessGHG:
    """Test 4: /api/esg-assignments/kpi-access/ghg works after migration"""

    def test_ghg_access_admin(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/esg-assignments/kpi-access/ghg")
        assert r.status_code == 200, r.text[:400]
        data = r.json()
        # Admin should have full access
        assert data.get("has_full_access") is True or data.get("scopes") is not None


class TestGHGCategoryEndToEnd:
    """Test 8: verify esg_assignment_assignees has records by using GET assignment endpoint"""

    def test_ghg_category_assignment_and_assignees(self, admin_session, org_users):
        # Create a GHG category assignment (Emissions/Scope 2) org-level with 2 users
        user_ids = [u["id"] for u in org_users[:2]]
        payload = {
            "category": "Emissions",
            "subcategory": "Scope 2",
            "sub_subcategory": None,
            "reporting_period": TEST_PERIOD,
            "start_date": "2025-04-01",
            "end_date": "2026-03-31",
            "timezone": "Asia/Kolkata",
            "filling_frequency": "monthly",
            "assignment_level": "organization",
            "user_ids": user_ids,
        }
        r = admin_session.post(f"{BASE_URL}/api/esg-records/assignments", json=payload)
        assert r.status_code == 200, r.text[:400]
        body = r.json()
        a = body.get("assignment")
        assert a is not None
        # Assignees must be present
        assignees = a.get("assignees", [])
        assert len(assignees) == 2
        for ass in assignees:
            assert "user_id" in ass
            assert ass.get("removed_at") is None
