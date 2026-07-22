"""
Backend tests for Assignment-Aware KPI Access Control and Completion Tracking.

Covers:
- /api/esg-assignments/kpi-access/ghg
- /api/esg-assignments/kpi-access/facilities
- /api/esg-assignments/kpi-access/facilities/list
- /api/esg-assignments/assignments/{id}/progress
- Admin bypass (full access)
- Emissions/Sinks endpoint access filtering
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://esg-task-engine.preview.emergentagent.com").rstrip("/")

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
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_user(admin_token):
    r = requests.get(
        f"{BASE_URL}/api/auth/me",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=30,
    )
    assert r.status_code == 200
    return r.json()


# ---------- KPI Access: GHG ----------

class TestGHGAccessEndpoint:
    def test_ghg_access_admin_full_access(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/esg-assignments/kpi-access/ghg", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("has_full_access") is True
        assert set(["scope1", "scope2", "scope3", "biogenic"]).issubset(set(data.get("allowed_scopes", [])))
        assert data.get("has_sinks_access") is True

    def test_ghg_access_with_reporting_period(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/esg-assignments/kpi-access/ghg?reporting_period=2024",
            headers=admin_headers,
            timeout=30,
        )
        assert r.status_code == 200
        data = r.json()
        assert data.get("has_full_access") is True


class TestFacilityAccessEndpoint:
    def test_facility_access_admin_ghg_scope1(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/esg-assignments/kpi-access/facilities?category=GHG Emissions&subcategory=GHG Emissions - Scope 1",
            headers=admin_headers,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("has_full_access") is True
        # For admin: allowed_facility_ids should be None
        assert data.get("allowed_facility_ids") is None

    def test_facility_access_missing_category(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/esg-assignments/kpi-access/facilities",
            headers=admin_headers,
            timeout=30,
        )
        # category is required
        assert r.status_code in (400, 422)


class TestFacilitiesListEndpoint:
    def test_facilities_list_admin_returns_all(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/esg-assignments/kpi-access/facilities/list?category=GHG Emissions",
            headers=admin_headers,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "facilities" in data
        assert "total" in data
        assert isinstance(data["facilities"], list)
        # ORG1 should have 7 facilities per test_credentials.md
        assert data["total"] >= 1, f"Expected some facilities but got {data['total']}"
        for f in data["facilities"]:
            assert "id" in f
            assert "name" in f

    def test_facilities_list_with_subcategory(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/esg-assignments/kpi-access/facilities/list?category=GHG Emissions&subcategory=GHG Emissions - Scope 1",
            headers=admin_headers,
            timeout=30,
        )
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data.get("facilities"), list)


# ---------- Assignment Progress ----------

class TestAssignmentProgressEndpoint:
    def test_progress_not_found_returns_error(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/esg-assignments/assignments/nonexistent-id-xyz/progress",
            headers=admin_headers,
            timeout=30,
        )
        # Should return 200 with error field per implementation
        assert r.status_code in (200, 404)
        if r.status_code == 200:
            data = r.json()
            assert "error" in data or data.get("assignment_id") is None

    def test_progress_for_existing_assignment(self, admin_headers):
        # First, list assignments and find one
        r = requests.get(
            f"{BASE_URL}/api/esg-assignments/assignments",
            headers=admin_headers,
            timeout=30,
        )
        if r.status_code != 200:
            pytest.skip(f"Cannot list assignments: {r.status_code}")
        payload = r.json()
        items = payload if isinstance(payload, list) else payload.get("assignments", payload.get("items", []))
        if not items:
            pytest.skip("No assignments in DB to test progress on")
        aid = items[0].get("id")
        if not aid:
            pytest.skip("Assignment doc missing id field")
        pr = requests.get(
            f"{BASE_URL}/api/esg-assignments/assignments/{aid}/progress",
            headers=admin_headers,
            timeout=30,
        )
        assert pr.status_code == 200, pr.text
        data = pr.json()
        assert "assignment_level" in data
        assert "is_complete" in data
        assert "total_facilities" in data
        assert "facilities_with_data" in data


# ---------- Emissions endpoint filtering ----------

class TestEmissionsAccessControl:
    def test_get_emissions_admin_ok(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/emissions", headers=admin_headers, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        # Response should be list or dict with records
        assert isinstance(data, (list, dict))


class TestSinksAccessControl:
    def test_get_sinks_admin_ok(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/sinks", headers=admin_headers, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, (list, dict))
