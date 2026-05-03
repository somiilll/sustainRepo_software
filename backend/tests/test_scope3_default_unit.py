"""
Tests for Scope3 EF `default_unit` field feature.

Covers:
- Create Scope 3 EF with default_unit
- Update Scope 3 EF with default_unit
- GET endpoints return default_unit (for both super-admin and users)
- default_unit optional (can be null/omitted)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
SUPER_ADMIN_EMAIL = "superadmin@ecotrack.com"
SUPER_ADMIN_PASSWORD = "SuperAdmin123!"


@pytest.fixture(scope="module")
def super_admin_token():
    resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": SUPER_ADMIN_EMAIL, "password": SUPER_ADMIN_PASSWORD},
        timeout=20,
    )
    assert resp.status_code == 200, f"Login failed: {resp.status_code} {resp.text}"
    token = resp.json().get("access_token") or resp.json().get("token")
    assert token, "No token in login response"
    return token


@pytest.fixture(scope="module")
def headers(super_admin_token):
    return {
        "Authorization": f"Bearer {super_admin_token}",
        "Content-Type": "application/json",
    }


@pytest.fixture(scope="module")
def created_entries():
    """Track created entries for cleanup"""
    ids = []
    yield ids


def _cleanup(headers, entry_id):
    try:
        requests.delete(
            f"{BASE_URL}/api/super-admin/scope3-ef/{entry_id}",
            headers=headers,
            timeout=15,
        )
    except Exception:
        pass


class TestScope3DefaultUnit:
    def test_create_with_default_unit(self, headers, created_entries):
        payload = {
            "scope": "Scope 3.1",
            "category": "Purchased goods and services",
            "activity": f"TEST_DU_{uuid.uuid4().hex[:8]}",
            "method": "activity",
            "industry_sectors": ["TEST_Sector"],
            "region": "Global",
            "year_applicable": 2024,
            "emission_factor": 1.234,
            "unit": "kgCO2e/kg",
            "allowed_units": ["kg", "t", "g"],
            "default_unit": "t",
            "source": "TEST_SOURCE",
        }
        r = requests.post(
            f"{BASE_URL}/api/super-admin/scope3-ef",
            json=payload,
            headers=headers,
            timeout=20,
        )
        assert r.status_code == 200, f"Create failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["default_unit"] == "t"
        assert data["allowed_units"] == sorted(["kg", "t", "g"]) or set(
            data["allowed_units"]
        ) == {"kg", "t", "g"}
        assert "id" in data
        created_entries.append(data["id"])

    def test_create_without_default_unit_is_allowed(self, headers, created_entries):
        payload = {
            "scope": "Scope 3.1",
            "category": "Purchased goods and services",
            "activity": f"TEST_DU_NONE_{uuid.uuid4().hex[:8]}",
            "method": "activity",
            "industry_sectors": ["TEST_Sector2"],
            "region": "Global",
            "year_applicable": 2024,
            "emission_factor": 0.5,
            "unit": "kgCO2e/kg",
            "allowed_units": ["kg"],
            "source": "TEST_SOURCE",
        }
        r = requests.post(
            f"{BASE_URL}/api/super-admin/scope3-ef",
            json=payload,
            headers=headers,
            timeout=20,
        )
        assert r.status_code == 200, f"Create failed: {r.status_code} {r.text}"
        data = r.json()
        assert data.get("default_unit") in (None, "")
        created_entries.append(data["id"])

    def test_get_all_returns_default_unit(self, headers, created_entries):
        assert created_entries, "No entries created to verify"
        first_id = created_entries[0]
        r = requests.get(
            f"{BASE_URL}/api/super-admin/scope3-ef", headers=headers, timeout=20
        )
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        target = next((x for x in items if x["id"] == first_id), None)
        assert target is not None, "Created entry not present in list"
        assert target["default_unit"] == "t"

    def test_get_for_users_returns_default_unit(self, headers, created_entries):
        first_id = created_entries[0]
        # This endpoint accepts any authenticated user; super admin works too.
        r = requests.get(f"{BASE_URL}/api/scope3-ef", headers=headers, timeout=20)
        assert r.status_code == 200
        items = r.json()
        target = next((x for x in items if x["id"] == first_id), None)
        assert target is not None
        assert target["default_unit"] == "t"

    def test_update_sets_default_unit(self, headers, created_entries):
        # Update the second entry (without default_unit) to set one
        entry_id = created_entries[1]
        payload = {
            "scope": "Scope 3.1",
            "category": "Purchased goods and services",
            "activity": f"TEST_DU_UPD_{uuid.uuid4().hex[:8]}",
            "method": "activity",
            "industry_sectors": ["TEST_Sector2"],
            "region": "Global",
            "year_applicable": 2024,
            "emission_factor": 0.5,
            "unit": "kgCO2e/kg",
            "allowed_units": ["kg", "t"],
            "default_unit": "kg",
            "source": "TEST_SOURCE",
        }
        r = requests.put(
            f"{BASE_URL}/api/super-admin/scope3-ef/{entry_id}",
            json=payload,
            headers=headers,
            timeout=20,
        )
        assert r.status_code == 200, f"Update failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["default_unit"] == "kg"

        # Verify persistence via GET
        r2 = requests.get(
            f"{BASE_URL}/api/super-admin/scope3-ef", headers=headers, timeout=20
        )
        items = r2.json()
        target = next((x for x in items if x["id"] == entry_id), None)
        assert target is not None
        assert target["default_unit"] == "kg"

    def test_update_clears_default_unit(self, headers, created_entries):
        entry_id = created_entries[0]
        payload = {
            "scope": "Scope 3.1",
            "category": "Purchased goods and services",
            "activity": f"TEST_DU_CLR_{uuid.uuid4().hex[:8]}",
            "method": "activity",
            "industry_sectors": ["TEST_Sector"],
            "region": "Global",
            "year_applicable": 2024,
            "emission_factor": 1.234,
            "unit": "kgCO2e/kg",
            "allowed_units": ["kg", "t", "g"],
            "default_unit": None,
            "source": "TEST_SOURCE",
        }
        r = requests.put(
            f"{BASE_URL}/api/super-admin/scope3-ef/{entry_id}",
            json=payload,
            headers=headers,
            timeout=20,
        )
        assert r.status_code == 200
        data = r.json()
        assert data.get("default_unit") in (None, "")

    def test_cleanup(self, headers, created_entries):
        for eid in created_entries:
            _cleanup(headers, eid)
