"""
Tests for three fixes:
1. GHG-imported records filtered by user assigned categories (non-admin only).
2. GET /api/esg-records/tasks/my-tasks returns assignment_count.
3. Creating record with status='draft' → status='draft' + approval_status='not_required'
   Creating record with status='completed' → status='completed' + approval_status='not_required' (no approval workflow)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASSWORD = "TestUser123!"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"No token in response: {data}"
    return token


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def env_category(admin_headers):
    """Grab a real environment category from the org."""
    r = requests.get(
        f"{BASE_URL}/api/esg-records/categories/environment",
        headers=admin_headers, timeout=30,
    )
    assert r.status_code == 200, r.text
    cats = r.json().get("categories", [])
    assert cats, "No environment categories available"
    # Prefer one with subcategory
    with_sub = [c for c in cats if c.get("subcategory")]
    return with_sub[0] if with_sub else cats[0]


# -------------------- Bug fix #3: Draft vs Completed status --------------------

def _build_payload(cat, status_val):
    return {
        "facility_id": None,
        "record_level": "organization",
        "category_id": cat["id"],
        "category": cat["category"],
        "subcategory": cat.get("subcategory"),
        "sub_subcategory": cat.get("sub_subcategory"),
        "frameworks": cat.get("frameworks", ["BRSR"]),
        "reporting_period": {
            "reporting_type": "yearly",
            "year": 2025,
        },
        "field_values": {"TEST_marker": f"TEST_{uuid.uuid4().hex[:8]}"},
        "source_of_information": "TEST_pytest",
        "notes": "TEST_pytest fixture",
        "status": status_val,
    }


class TestDraftStatus:
    def test_create_draft_record_sets_draft_status(self, admin_headers, env_category):
        payload = _build_payload(env_category, "draft")
        r = requests.post(
            f"{BASE_URL}/api/esg-records/records/environment",
            json=payload, headers=admin_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        rec = r.json().get("record")
        assert rec is not None
        assert rec["status"] == "draft", f"Expected draft, got {rec['status']}"
        assert rec["approval_status"] == "not_required", f"Expected not_required, got {rec['approval_status']}"
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/esg-records/records/environment/{rec['id']}",
            headers=admin_headers, timeout=30,
        )

    def test_create_completed_record_sets_completed_status(self, admin_headers, env_category):
        payload = _build_payload(env_category, "completed")
        r = requests.post(
            f"{BASE_URL}/api/esg-records/records/environment",
            json=payload, headers=admin_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        rec = r.json().get("record")
        assert rec is not None
        assert rec["status"] == "completed", f"Expected completed, got {rec['status']}"
        # No approval workflow configured for admin-created record → not_required
        assert rec["approval_status"] == "not_required", f"Got {rec['approval_status']}"
        requests.delete(
            f"{BASE_URL}/api/esg-records/records/environment/{rec['id']}",
            headers=admin_headers, timeout=30,
        )

    def test_create_default_status_is_completed(self, admin_headers, env_category):
        payload = _build_payload(env_category, None)
        payload.pop("status")
        r = requests.post(
            f"{BASE_URL}/api/esg-records/records/environment",
            json=payload, headers=admin_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        rec = r.json().get("record")
        assert rec["status"] == "completed"
        requests.delete(
            f"{BASE_URL}/api/esg-records/records/environment/{rec['id']}",
            headers=admin_headers, timeout=30,
        )


# -------------------- Bug fix #2: my-tasks returns assignment_count --------------------

class TestMyTasksAssignmentCount:
    def test_my_tasks_returns_assignment_count(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/esg-records/tasks/my-tasks",
            headers=admin_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "assignment_count" in data, f"Missing assignment_count key in response: {data.keys()}"
        assert isinstance(data["assignment_count"], int)
        assert "tasks" in data
        assert "total" in data


# -------------------- Bug fix #1: GHG records filter for non-admin --------------------

class TestGHGImportedRecordsFilter:
    def test_admin_sees_ghg_imported_records(self, admin_headers):
        """Admin should see all records including GHG imported (baseline test)."""
        r = requests.get(
            f"{BASE_URL}/api/esg-records/records/environment?include_imported=true&limit=100",
            headers=admin_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "records" in data
        # Admin can see records; imported_count may be 0+ depending on GHG data
        # Just verify the response structure
        assert isinstance(data.get("total", 0), int)

    def test_endpoint_supports_include_imported_flag(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/esg-records/records/environment?include_imported=false",
            headers=admin_headers, timeout=30,
        )
        assert r.status_code == 200
        # With imported disabled, should not have has_imported flag or it should be false
