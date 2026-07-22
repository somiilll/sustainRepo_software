"""Tests for the KPI Engine module - dynamic KPI calculation endpoints."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://esg-materiality-hub-1.preview.emergentagent.com").rstrip("/")

EMAIL = "esg-test-user@example.com"
PASSWORD = "TestUser123!"

WATER_KPI_ID = "dc794426-138a-4fe5-80e8-111a12fcdc2f"
GHG_KPI_ID = "855de2ee-8684-4038-9b3f-c138f9f7893f"


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token, f"No token in response: {r.json()}"
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# --- Health ---
def test_health():
    r = requests.get(f"{BASE_URL}/api/kpi-engine/health", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "healthy"
    assert data["engine"] == "kpi_engine"
    assert "version" in data


# --- Calculate single KPI by kpi_id (SUM) ---
def test_calculate_water_kpi_by_id(auth_headers):
    payload = {"kpi_id": WATER_KPI_ID, "scope_type": "organization", "period": {"year": 2026}}
    r = requests.post(f"{BASE_URL}/api/kpi-engine/calculate", json=payload, headers=auth_headers, timeout=30)
    assert r.status_code == 200, f"{r.status_code}: {r.text}"
    data = r.json()
    assert data["value"] == 1500.0, f"Expected 1500.0, got {data['value']}"
    assert data["record_count"] == 1
    assert data["aggregation_type"] == "sum"
    assert data["metadata"]["value_field"] == "quantity"
    assert data["metadata"]["section"] == "environment"


# --- Calculate KPI by metric_code ---
def test_calculate_water_kpi_by_metric_code(auth_headers):
    # First discover metric_code for Water KPI
    # Use direct endpoint fetch not required; try common code
    # Note: actual metric_code has a typo in DB ("ENV_WATER_CONSUPTION" - missing 'M')
    payload = {"metric_code": "ENV_WATER_CONSUPTION", "period": {"year": 2026}}
    r = requests.post(f"{BASE_URL}/api/kpi-engine/calculate", json=payload, headers=auth_headers, timeout=30)
    assert r.status_code == 200, f"{r.status_code}: {r.text}"
    data = r.json()
    assert data["value"] == 1500.0
    assert data["record_count"] == 1
    assert data["metadata"]["metric_code"] == "ENV_WATER_CONSUPTION"


# --- Calculate GHG (should be 0 as per context) ---
def test_calculate_ghg_kpi(auth_headers):
    payload = {"kpi_id": GHG_KPI_ID, "period": {"year": 2026}}
    r = requests.post(f"{BASE_URL}/api/kpi-engine/calculate", json=payload, headers=auth_headers, timeout=30)
    assert r.status_code == 200, f"{r.status_code}: {r.text}"
    data = r.json()
    assert data["value"] == 0.0
    assert data["record_count"] == 0


# --- Missing identifier ---
def test_calculate_missing_identifier(auth_headers):
    r = requests.post(f"{BASE_URL}/api/kpi-engine/calculate", json={"period": {"year": 2026}}, headers=auth_headers, timeout=30)
    assert r.status_code == 400


# --- Invalid kpi_id ---
def test_calculate_invalid_kpi_id(auth_headers):
    r = requests.post(f"{BASE_URL}/api/kpi-engine/calculate", json={"kpi_id": "nonexistent-kpi-id-xxx"}, headers=auth_headers, timeout=30)
    assert r.status_code == 404


# --- Auth required ---
def test_calculate_requires_auth():
    r = requests.post(f"{BASE_URL}/api/kpi-engine/calculate", json={"kpi_id": WATER_KPI_ID}, timeout=10)
    assert r.status_code in (401, 403), f"Expected auth error, got {r.status_code}"


# --- Batch ---
def test_calculate_batch(auth_headers):
    payload = {"kpi_ids": [WATER_KPI_ID, GHG_KPI_ID], "period": {"year": 2026}}
    r = requests.post(f"{BASE_URL}/api/kpi-engine/calculate/batch", json=payload, headers=auth_headers, timeout=30)
    assert r.status_code == 200, f"{r.status_code}: {r.text}"
    results = r.json()
    assert WATER_KPI_ID in results
    assert GHG_KPI_ID in results
    assert results[WATER_KPI_ID]["value"] == 1500.0
    assert results[WATER_KPI_ID]["record_count"] == 1
    assert results[GHG_KPI_ID]["value"] == 0.0


def test_calculate_batch_empty(auth_headers):
    r = requests.post(f"{BASE_URL}/api/kpi-engine/calculate/batch", json={"kpi_ids": []}, headers=auth_headers, timeout=30)
    assert r.status_code == 400


# --- Dimension ---
def test_calculate_dimension_by_subcategory(auth_headers):
    payload = {"kpi_id": WATER_KPI_ID, "dimension": "subcategory", "period": {"year": 2026}}
    r = requests.post(f"{BASE_URL}/api/kpi-engine/calculate/dimension", json=payload, headers=auth_headers, timeout=30)
    assert r.status_code == 200, f"{r.status_code}: {r.text}"
    results = r.json()
    assert isinstance(results, dict)
    # Total across groups should equal 1500
    total = sum(v.get("value") or 0 for v in results.values() if isinstance(v, dict))
    assert total == 1500.0, f"Expected total 1500.0 across dimensions, got {total}. Results: {results}"


def test_calculate_dimension_invalid_kpi(auth_headers):
    r = requests.post(f"{BASE_URL}/api/kpi-engine/calculate/dimension",
                      json={"kpi_id": "bad-id", "dimension": "subcategory"},
                      headers=auth_headers, timeout=30)
    assert r.status_code == 404
