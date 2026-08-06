"""
Test dual-status architecture for ESG data entry records.

Verifies:
- POST /api/esg-records/records/{section}: creates with status='completed', approval_status='not_required'
  when no approval workflow exists.
- PUT /api/esg-records/records/{section}/{record_id} with status='submitted' or 'completed'
  updates to status='completed' + approval_status based on workflow.
- PUT with status='draft' -> status='draft' + approval_status='not_required'.
"""

import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://carbon-methodology.preview.emergentagent.com").rstrip("/")

# Admin user with organization (bypass assignment check via skip_assignment_check=True in service)
EMAIL = "goyalsomil2001@gmail.com"
PASSWORD = "TestUser123!"
SECTION = "environment"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def env_category(headers):
    """Pick any active environment category to associate with test records."""
    r = requests.get(f"{BASE_URL}/api/esg-records/categories/{SECTION}", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    cats = r.json().get("categories") or []
    assert len(cats) > 0, "No categories found"
    return cats[0]


def _build_payload(category):
    return {
        "record_level": "organization",
        "facility_id": None,
        "category_id": category["id"],
        "category": category["category"],
        "subcategory": category.get("subcategory"),
        "sub_subcategory": category.get("sub_subcategory"),
        "frameworks": category.get("frameworks", ["BRSR"]),
        "reporting_period": {"reporting_type": "yearly", "year": 2026},
        "field_values": {"test_marker": f"TEST_{uuid.uuid4().hex[:8]}"},
        "source_of_information": "TEST_dual_status_records",
        "notes": "TEST_dual_status",
    }


class TestDualStatusCreate:
    """create_record should default status='completed', approval_status='not_required'."""

    def test_create_no_approval_workflow(self, headers, env_category):
        payload = _build_payload(env_category)
        r = requests.post(f"{BASE_URL}/api/esg-records/records/{SECTION}", json=payload, headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        record = r.json()["record"]
        assert record["status"] == "completed", f"Expected status=completed, got {record['status']}"
        assert record["approval_status"] == "not_required", (
            f"Expected approval_status=not_required, got {record.get('approval_status')}"
        )
        # cleanup
        requests.delete(f"{BASE_URL}/api/esg-records/records/{SECTION}/{record['id']}", headers=headers, timeout=30)


class TestDualStatusUpdate:
    """update_record should apply dual-status logic."""

    @pytest.fixture
    def created_record_id(self, headers, env_category):
        payload = _build_payload(env_category)
        r = requests.post(f"{BASE_URL}/api/esg-records/records/{SECTION}", json=payload, headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        rid = r.json()["record"]["id"]
        yield rid
        requests.delete(f"{BASE_URL}/api/esg-records/records/{SECTION}/{rid}", headers=headers, timeout=30)

    def test_update_submitted_maps_to_completed_not_required(self, headers, created_record_id):
        r = requests.put(
            f"{BASE_URL}/api/esg-records/records/{SECTION}/{created_record_id}",
            json={"status": "submitted", "notes": "TEST_submit"},
            headers=headers,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        rec = r.json()["record"]
        assert rec["status"] == "completed"
        assert rec["approval_status"] == "not_required"

        # verify persistence
        g = requests.get(f"{BASE_URL}/api/esg-records/records/{SECTION}/{created_record_id}", headers=headers, timeout=30)
        assert g.status_code == 200
        got = g.json()
        assert got["status"] == "completed"
        assert got["approval_status"] == "not_required"

    def test_update_draft_status(self, headers, created_record_id):
        r = requests.put(
            f"{BASE_URL}/api/esg-records/records/{SECTION}/{created_record_id}",
            json={"status": "draft"},
            headers=headers,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        rec = r.json()["record"]
        assert rec["status"] == "draft"
        assert rec["approval_status"] == "not_required"

    def test_update_completed_status(self, headers, created_record_id):
        r = requests.put(
            f"{BASE_URL}/api/esg-records/records/{SECTION}/{created_record_id}",
            json={"status": "completed"},
            headers=headers,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        rec = r.json()["record"]
        assert rec["status"] == "completed"
        assert rec["approval_status"] == "not_required"
