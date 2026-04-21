"""
Phase 3 Calc Engine rollout tests.

Validates:
- New user-accessible /api/calc-engine/execute-by-category endpoint
- Emissions page prerequisites: /api/emissions, /api/categories, /api/facilities
- Admin user token works for execute-by-category endpoint
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

SUPER = {"email": "superadmin@ecotrack.com", "password": "SuperAdmin123!"}
ADMIN = {"email": "goyalsomil2@hotmail.com", "password": "Test123!"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"Login failed for {creds['email']}: {r.status_code} {r.text[:200]}")
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"No token in login response: {data}"
    return token


@pytest.fixture(scope="module")
def super_token():
    return _login(SUPER)


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def super_headers(super_token):
    return {"Authorization": f"Bearer {super_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------- Health & Prereqs ----------
class TestHealth:
    def test_backend_reachable(self):
        r = requests.get(f"{API}/", timeout=10)
        assert r.status_code in (200, 404, 401)

    def test_categories_listed(self, admin_headers):
        r = requests.get(f"{API}/categories", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)

    def test_emissions_listed(self, admin_headers):
        r = requests.get(f"{API}/emissions", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------- Phase 3 new endpoint ----------
class TestExecuteByCategory:
    """Test the new /api/calc-engine/execute-by-category endpoint is accessible by users."""

    def test_endpoint_exists_and_requires_auth(self):
        # No auth → 401/403
        r = requests.post(
            f"{API}/calc-engine/execute-by-category",
            json={"category_id": "fake"},
            timeout=15,
        )
        assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"

    def test_admin_user_can_access_endpoint(self, admin_headers):
        """Admin (non-superadmin) should be able to access execute-by-category.
        Bogus category returns 404 (not 403)."""
        r = requests.post(
            f"{API}/calc-engine/execute-by-category",
            headers=admin_headers,
            json={
                "category_id": "non-existent-category-id",
                "decision_inputs": {},
                "inputs": {},
                "context": {},
                "user_overrides": {},
                "dry_run": True,
            },
            timeout=20,
        )
        # Must NOT be 403 (forbidden) - that would mean endpoint is superadmin-only
        assert r.status_code != 403, "Endpoint should be accessible to regular users"
        # Expected: 404 (no decision tree for this category)
        assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text[:300]}"
        detail = r.json().get("detail", "")
        assert "decision tree" in detail.lower() or "not" in detail.lower()

    def test_super_admin_can_access_endpoint(self, super_headers):
        r = requests.post(
            f"{API}/calc-engine/execute-by-category",
            headers=super_headers,
            json={
                "category_id": "non-existent-category-id",
                "dry_run": True,
            },
            timeout=20,
        )
        assert r.status_code == 404

    def test_with_real_category_if_tree_exists(self, admin_headers):
        """If a decision tree exists for any category, endpoint should execute (or give a meaningful error).
        Skips if no trees configured."""
        r = requests.get(f"{API}/calc-engine/decision-trees", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        trees = r.json()
        if not trees:
            pytest.skip("No decision trees configured in DB - can only verify endpoint access")
        tree = trees[0]
        cat_id = tree.get("category_id")
        r = requests.post(
            f"{API}/calc-engine/execute-by-category",
            headers=admin_headers,
            json={
                "category_id": cat_id,
                "decision_inputs": {},
                "inputs": {"qty": {"value": 1.0, "unit": "kg"}},
                "context": {},
                "user_overrides": {},
                "dry_run": True,
            },
            timeout=30,
        )
        # Any of these are acceptable - endpoint is reachable, not a 403
        assert r.status_code in (200, 400, 404), f"Unexpected {r.status_code}: {r.text[:300]}"
        assert r.status_code != 403


# ---------- Pre-existing read endpoints (sanity) ----------
class TestCalcEngineReads:
    def test_list_variables(self, admin_headers):
        r = requests.get(f"{API}/calc-engine/variables", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_formulas(self, admin_headers):
        r = requests.get(f"{API}/calc-engine/formulas", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_decision_trees(self, admin_headers):
        r = requests.get(f"{API}/calc-engine/decision-trees", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
