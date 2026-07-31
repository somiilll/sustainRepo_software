"""
Tests for V2 assignment-based filtering fixes:
1. GET /api/facilities returns V2-assigned facilities for non-admin users
2. GET /api/esg-questionnaire/configs filters by V2 assignments for non-admins
3. Non-admin GHG scope1 kpi-access with facility restrictions
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "goyalsomil2001@gmail.com"
NONADMIN_EMAIL = "goyalsomil+4@hotmail.com"
PASSWORD = "TestUser123!"


def _login(email, password):
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    return r


@pytest.fixture(scope="module")
def admin_token():
    r = _login(ADMIN_EMAIL, PASSWORD)
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text[:200]}")
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def user_token():
    r = _login(NONADMIN_EMAIL, PASSWORD)
    if r.status_code != 200:
        pytest.skip(f"Non-admin login failed: {r.status_code} {r.text[:200]}")
    return r.json().get("access_token") or r.json().get("token")


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


# --- Facilities filtering ---
class TestFacilities:
    def test_admin_sees_facilities(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/facilities", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        print(f"Admin facilities count: {len(data)}")

    def test_nonadmin_sees_assigned_facilities(self, user_token):
        r = requests.get(f"{BASE_URL}/api/facilities", headers=_hdr(user_token), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        print(f"Non-admin facilities count: {len(data)}")
        # Expect ~7 per problem statement
        assert len(data) > 0, "Non-admin returned empty facilities list — regression!"
        names = [f.get("name") for f in data]
        print(f"Facility names: {names}")
        # Facility E must be present since scope1 assigned to it
        assert any("Facility E" in (n or "") for n in names), f"Facility E missing from user's facilities: {names}"


# --- ESG Questionnaire configs filtering ---
class TestQuestionnaireConfigs:
    def test_admin_brsr_configs(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/esg-questionnaire/configs?framework=BRSR",
            headers=_hdr(admin_token), timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "configs" in data
        assert data["total"] >= 1
        print(f"Admin BRSR configs: {data['total']}")

    def test_admin_gri_configs(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/esg-questionnaire/configs?framework=GRI",
            headers=_hdr(admin_token), timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total"] >= 1
        print(f"Admin GRI configs: {data['total']}")

    def test_nonadmin_brsr_configs_filtered(self, user_token, admin_token):
        r_user = requests.get(
            f"{BASE_URL}/api/esg-questionnaire/configs?framework=BRSR",
            headers=_hdr(user_token), timeout=30,
        )
        assert r_user.status_code == 200, r_user.text
        r_admin = requests.get(
            f"{BASE_URL}/api/esg-questionnaire/configs?framework=BRSR",
            headers=_hdr(admin_token), timeout=30,
        )
        user_total = r_user.json().get("total", 0)
        admin_total = r_admin.json().get("total", 0)
        print(f"Non-admin BRSR configs: {user_total} vs Admin: {admin_total}")
        # Non-admin should see equal or fewer configs (filtered)
        assert user_total <= admin_total


# --- GHG KPI access ---
class TestGHGAccess:
    def test_nonadmin_ghg_scope1_access(self, user_token):
        r = requests.get(
            f"{BASE_URL}/api/esg-assignments/kpi-access/ghg",
            headers=_hdr(user_token), timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        print(f"GHG access: {data}")
        allowed = data.get("allowed_scopes") or data.get("scopes") or []
        assert "scope1" in allowed, f"scope1 not in allowed_scopes: {data}"
        restrictions = data.get("facility_restrictions") or {}
        assert "scope1" in restrictions or data.get("scope1_facilities"), \
            f"No facility_restrictions for scope1: {data}"
