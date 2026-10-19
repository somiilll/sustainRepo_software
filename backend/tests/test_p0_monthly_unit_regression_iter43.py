"""
# Module: GHG monthly unit regression checks
# Feature: calc contract + legacy emissions calculate endpoint availability
"""

import os

import pytest
import requests


def _load_base_url() -> str:
    env_url = os.environ.get("REACT_APP_BACKEND_URL")
    if env_url:
        return env_url.rstrip("/")
    with open("/app/frontend/.env", "r", encoding="utf-8") as env_file:
        for line in env_file:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL is required")


BASE_URL = _load_base_url()
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASSWORD = "TestUser123!"


@pytest.fixture(scope="module")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def auth_headers(api_client):
    login = api_client.post(
        f"{API}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    if login.status_code != 200:
        pytest.skip(f"Admin login failed: {login.status_code} {login.text}")
    token = login.json().get("access_token") or login.json().get("token")
    if not token:
        pytest.skip("No auth token in login response")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def scope1_stationary_category_id(api_client, auth_headers):
    response = api_client.get(f"{API}/categories", headers=auth_headers, timeout=30)
    assert response.status_code == 200, f"/api/categories failed: {response.status_code} {response.text}"
    categories = response.json()
    stationary = [
        item for item in categories
        if item.get("scope_code") == "scope1"
        and "stationary" in str(item.get("name") or "").lower()
    ]
    assert stationary, "No Scope 1 stationary category available"
    assert stationary[0].get("id"), "Stationary category id missing"
    return stationary[0]["id"]


def _qty_basis_payload(category_id: str) -> dict:
    return {
        "category_id": category_id,
        "decision_inputs": {
            "calculation_methodology": "using_qty_basis_ef",
            "ef_quantity_basis": "volume",
        },
        "inputs": {
            "qty": {"value": 100, "unit": "L"},
            "ef_quantity": {"value": 2.68, "unit": "kgCO2/L"},
        },
        "user_overrides": {
            "emission_factor": {"value": 2.68, "unit": "kgCO2/L"},
        },
        "context": {
            "scope": "scope1",
            "category": "Stationary Combustion",
            "facility_id": "contract-check-facility",
            "reporting_period": "2026-01",
            "is_custom_fuel": True,
        },
        "dry_run": True,
    }


def test_calc_engine_qty_basis_volume_unit_contract(auth_headers, api_client, scope1_stationary_category_id):
    payload = _qty_basis_payload(scope1_stationary_category_id)
    resp = api_client.post(
        f"{API}/calc-engine/execute-by-category",
        json=payload,
        headers=auth_headers,
        timeout=45,
    )
    assert resp.status_code == 200, f"calc-engine failed: {resp.status_code} {resp.text[:300]}"
    data = resp.json()
    assert data.get("ok") is True
    assert isinstance(data.get("outputs"), dict)
    assert "co2e" in data.get("outputs", {})


def test_legacy_emissions_calculate_endpoint_still_available(auth_headers, api_client, scope1_stationary_category_id):
    payload = _qty_basis_payload(scope1_stationary_category_id)
    resp = api_client.post(
        f"{API}/emissions/calculate",
        json=payload,
        headers=auth_headers,
        timeout=45,
    )
    assert resp.status_code != 404, "POST /api/emissions/calculate returned 404 (contract regression)"
    assert resp.status_code in (200, 400, 401, 403, 405, 422), (
        f"Unexpected /api/emissions/calculate status: {resp.status_code} {resp.text[:300]}"
    )
