"""
Tests for the per-facility approval config bug fix.

Bug: When assigning at facility level with per-facility approval settings
(requires_approval + approver_id), the values were not being saved.

Fix:
- Frontend now sends: facility_assignments = {facility_id: {user_ids, requires_approval, approver_id}}
- Backend `replace_org_with_facility_assignments` handles both:
  - Legacy list format: {facility_id: [user_ids]}
  - New dict format: {facility_id: {user_ids, requires_approval, approver_id}}

Tests target GHG Emissions -> Scope 2 with facility 39ecd9be-9417-4df6-93c4-e583abf49260.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASSWORD = "TestUser123!"
TARGET_FACILITY_ID = "39ecd9be-9417-4df6-93c4-e583abf49260"

CATEGORY = "GHG Emissions"
SUBCATEGORY = "Scope 2"
SUB_SUBCATEGORY = None

REPORTING_PERIOD_BASE = f"TEST_FY_{uuid.uuid4().hex[:8]}"


# -----------------------------
# Fixtures
# -----------------------------

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


@pytest.fixture(scope="session")
def facilities(auth_headers):
    r = requests.get(f"{API}/facilities", headers=auth_headers, timeout=15)
    if r.status_code != 200:
        return []
    data = r.json()
    if isinstance(data, dict):
        return data.get("facilities") or data.get("items") or data.get("data") or []
    return data


def _pick_two_users(admin_user, org_users):
    admin_id = admin_user.get("id")
    ids = [u.get("id") for u in org_users if u.get("id")]
    others = [i for i in ids if i != admin_id]
    if len(others) >= 2:
        return others[0], others[1]
    if len(others) == 1:
        return others[0], admin_id
    return admin_id, admin_id


def _pick_facility_id(facilities):
    """Prefer the target facility from problem statement, else the first facility."""
    ids = [f.get("id") for f in facilities if f.get("id")]
    if TARGET_FACILITY_ID in ids:
        return TARGET_FACILITY_ID
    if ids:
        return ids[0]
    return TARGET_FACILITY_ID  # last resort


# -----------------------------
# Bug fix tests: New dict format
# -----------------------------

class TestPerFacilityApprovalConfigNewFormat:
    def test_new_dict_format_saves_per_facility_approval(
        self, auth_headers, admin_user, org_users, facilities
    ):
        """Fix verification: send new dict format with requires_approval + approver_id
        per facility. Verify persistence."""
        assignee_id, approver_id = _pick_two_users(admin_user, org_users)
        facility_id = _pick_facility_id(facilities)

        payload = {
            "assignment_level": "facility",
            "category": CATEGORY,
            "subcategory": SUBCATEGORY,
            "sub_subcategory": SUB_SUBCATEGORY,
            "reporting_period": REPORTING_PERIOD_BASE + "_new_fmt",
            "facility_assignments": {
                facility_id: {
                    "user_ids": [assignee_id],
                    "requires_approval": True,
                    "approver_id": approver_id,
                }
            },
            # Note: intentionally NOT setting top-level requires_approval/approver_id
            # to prove that per-facility values are respected.
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
            "filling_frequency": "monthly",
        }

        r = requests.post(
            f"{API}/esg-records/assignments",
            headers=auth_headers,
            json=payload,
            timeout=60,
        )
        assert r.status_code == 200, f"Create failed: {r.status_code} {r.text}"

        body = r.json()
        assignments = body.get("assignments") or []
        assert len(assignments) >= 1, f"No assignments returned: {body}"

        assignment = assignments[0]
        assert assignment.get("assignment_level") == "facility"
        assert assignment.get("facility_id") == facility_id
        assert assignment.get("requires_approval") is True, (
            f"BUG: requires_approval not saved from per-facility config: {assignment}"
        )
        assert assignment.get("approver_id") == approver_id, (
            f"BUG: approver_id not saved from per-facility config. "
            f"expected={approver_id} got={assignment.get('approver_id')}"
        )

        # Verify via tracker GET
        rp = payload["reporting_period"]
        r2 = requests.get(
            f"{API}/esg-records/tracker/energy",
            headers=auth_headers,
            params={
                "reporting_period": rp,
                "category": CATEGORY,
            },
            timeout=30,
        )
        assert r2.status_code == 200, f"tracker/energy failed: {r2.status_code} {r2.text}"

        tracker_body = r2.json()
        tracker_assignments = tracker_body.get("assignments") or []
        # Filter for our specific facility + subcategory
        target = [
            a for a in tracker_assignments
            if a.get("facility_id") == facility_id
            and a.get("subcategory") == SUBCATEGORY
            and a.get("reporting_period") == rp
        ]
        assert target, (
            f"Assignment not returned from tracker for facility={facility_id}, "
            f"reporting_period={rp}. Got {len(tracker_assignments)} assignments overall."
        )
        got = target[0]
        assert got.get("requires_approval") is True, (
            f"BUG: tracker returns requires_approval={got.get('requires_approval')} "
            f"(expected True). Full doc: {got}"
        )
        assert got.get("approver_id") == approver_id, (
            f"BUG: tracker returns approver_id={got.get('approver_id')} "
            f"(expected {approver_id})"
        )

    def test_new_dict_format_no_approval(
        self, auth_headers, admin_user, org_users, facilities
    ):
        """When per-facility requires_approval=False, both fields persist as False/None."""
        assignee_id, _ = _pick_two_users(admin_user, org_users)
        facility_id = _pick_facility_id(facilities)

        payload = {
            "assignment_level": "facility",
            "category": CATEGORY,
            "subcategory": SUBCATEGORY,
            "sub_subcategory": SUB_SUBCATEGORY,
            "reporting_period": REPORTING_PERIOD_BASE + "_new_fmt_noapp",
            "facility_assignments": {
                facility_id: {
                    "user_ids": [assignee_id],
                    "requires_approval": False,
                    "approver_id": None,
                }
            },
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
            "filling_frequency": "monthly",
        }

        r = requests.post(
            f"{API}/esg-records/assignments",
            headers=auth_headers,
            json=payload,
            timeout=60,
        )
        assert r.status_code == 200, f"Create failed: {r.text}"
        assignment = (r.json().get("assignments") or [{}])[0]
        assert assignment.get("requires_approval") is False
        assert assignment.get("approver_id") in (None, "")

    def test_legacy_list_format_still_works(
        self, auth_headers, admin_user, org_users, facilities
    ):
        """Regression: legacy list format {facility_id: [user_ids]} should still create
        assignments (approval settings inherited from top-level payload)."""
        assignee_id, approver_id = _pick_two_users(admin_user, org_users)
        facility_id = _pick_facility_id(facilities)

        payload = {
            "assignment_level": "facility",
            "category": CATEGORY,
            "subcategory": SUBCATEGORY,
            "sub_subcategory": SUB_SUBCATEGORY,
            "reporting_period": REPORTING_PERIOD_BASE + "_legacy_fmt",
            "facility_assignments": {facility_id: [assignee_id]},
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
            timeout=60,
        )
        assert r.status_code == 200, f"Create failed: {r.text}"
        assignment = (r.json().get("assignments") or [{}])[0]
        assert assignment.get("facility_id") == facility_id
        # With legacy list format, top-level approval settings apply.
        assert assignment.get("requires_approval") is True
        assert assignment.get("approver_id") == approver_id

    def test_mixed_per_facility_configs(
        self, auth_headers, admin_user, org_users, facilities
    ):
        """Two facilities, one with approval on, one with approval off - both should
        persist independently."""
        assignee_id, approver_id = _pick_two_users(admin_user, org_users)
        ids = [f.get("id") for f in facilities if f.get("id")]
        if len(ids) < 2:
            pytest.skip("Need at least 2 facilities for this test")

        # Prefer target facility as facility_a
        if TARGET_FACILITY_ID in ids:
            facility_a = TARGET_FACILITY_ID
            facility_b = next(fid for fid in ids if fid != TARGET_FACILITY_ID)
        else:
            facility_a, facility_b = ids[0], ids[1]

        rp = REPORTING_PERIOD_BASE + "_mixed"
        payload = {
            "assignment_level": "facility",
            "category": CATEGORY,
            "subcategory": SUBCATEGORY,
            "sub_subcategory": SUB_SUBCATEGORY,
            "reporting_period": rp,
            "facility_assignments": {
                facility_a: {
                    "user_ids": [assignee_id],
                    "requires_approval": True,
                    "approver_id": approver_id,
                },
                facility_b: {
                    "user_ids": [assignee_id],
                    "requires_approval": False,
                    "approver_id": None,
                },
            },
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
            "filling_frequency": "monthly",
        }

        r = requests.post(
            f"{API}/esg-records/assignments",
            headers=auth_headers,
            json=payload,
            timeout=60,
        )
        assert r.status_code == 200, f"Create failed: {r.text}"

        body = r.json()
        assignments = body.get("assignments") or []
        by_facility = {a.get("facility_id"): a for a in assignments}

        assert facility_a in by_facility, f"Missing assignment for facility_a: {by_facility.keys()}"
        assert facility_b in by_facility, f"Missing assignment for facility_b: {by_facility.keys()}"

        a = by_facility[facility_a]
        assert a.get("requires_approval") is True, f"facility_a approval not set: {a}"
        assert a.get("approver_id") == approver_id, f"facility_a approver wrong: {a}"

        b = by_facility[facility_b]
        assert b.get("requires_approval") is False, f"facility_b should have approval off: {b}"
        assert b.get("approver_id") in (None, ""), f"facility_b should have no approver: {b}"
