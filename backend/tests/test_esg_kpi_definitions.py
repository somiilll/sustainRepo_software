"""
Tests for ESG KPI Definitions endpoints (Super Admin).
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://emission-records-v2.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

SUPER_ADMIN_EMAIL = "esg-superadmin@sustainrepo.com"
SUPER_ADMIN_PASSWORD = "ESGAdmin123!"


@pytest.fixture(scope="module")
def token():
    # Try common login endpoints
    for endpoint in ("/api/auth/login", "/api/login", "/api/esg/auth/login"):
        try:
            r = requests.post(f"{BASE_URL}{endpoint}", json={"email": SUPER_ADMIN_EMAIL, "password": SUPER_ADMIN_PASSWORD}, timeout=15)
            if r.status_code == 200:
                data = r.json()
                tok = data.get("token") or data.get("access_token") or (data.get("data") or {}).get("token")
                if tok:
                    return tok
        except Exception:
            continue
    pytest.skip("Login failed - cannot obtain super admin token")


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def created_kpi(headers):
    unique = uuid.uuid4().hex[:6].upper()
    payload = {
        "metric_name": f"TEST_KPI_{unique}",
        "description": "test kpi",
        "section": "environment",
        "category_name": "GHG Emissions",
        "source_type": "records",
        "source_config": {"records": {"section": "environment", "value_field": "co2e", "filters": []}},
        "aggregation_type": "sum",
        "value_field": "co2e",
        "filters": [],
        "dimensions": ["facility", "month"],
        "supported_scopes": ["organization", "facility"],
        "output_type": "number",
        "unit_config": {"default_unit": "tCO2e", "supported_units": ["tCO2e", "kgCO2e"], "allow_unit_conversion": True},
        "status": "draft",
        "tags": ["test"],
    }
    r = requests.post(f"{API}/esg-kpi-definitions", json=payload, headers=headers, timeout=15)
    assert r.status_code == 200, f"Create failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["metric_name"] == payload["metric_name"]
    assert data["metric_code"].startswith("ENV_")
    yield data
    # cleanup
    requests.delete(f"{API}/esg-kpi-definitions/{data['id']}", headers=headers, timeout=15)


# ---------- Tests ----------

def test_list_kpis(headers):
    r = requests.get(f"{API}/esg-kpi-definitions", headers=headers, timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_and_get(headers, created_kpi):
    kid = created_kpi["id"]
    r = requests.get(f"{API}/esg-kpi-definitions/{kid}", headers=headers, timeout=15)
    assert r.status_code == 200
    fetched = r.json()
    assert fetched["id"] == kid
    assert fetched["section"] == "environment"
    assert fetched["aggregation_type"] == "sum"


def test_update_kpi(headers, created_kpi):
    kid = created_kpi["id"]
    r = requests.put(f"{API}/esg-kpi-definitions/{kid}", json={"description": "updated desc", "status": "active"}, headers=headers, timeout=15)
    assert r.status_code == 200
    assert r.json()["description"] == "updated desc"
    # verify persisted
    r2 = requests.get(f"{API}/esg-kpi-definitions/{kid}", headers=headers, timeout=15)
    assert r2.json()["status"] == "active"


def test_duplicate_kpi(headers, created_kpi):
    kid = created_kpi["id"]
    r = requests.post(f"{API}/esg-kpi-definitions/{kid}/duplicate", headers=headers, timeout=15)
    assert r.status_code == 200
    dup = r.json()
    assert dup["id"] != kid
    assert dup["status"] == "draft"
    # cleanup dup
    requests.delete(f"{API}/esg-kpi-definitions/{dup['id']}", headers=headers, timeout=15)


def test_archive_kpi(headers, created_kpi):
    kid = created_kpi["id"]
    r = requests.post(f"{API}/esg-kpi-definitions/{kid}/archive", headers=headers, timeout=15)
    assert r.status_code == 200
    assert r.json()["status"] == "archived"


def test_lookups(headers):
    r1 = requests.get(f"{API}/esg-kpi-definitions/lookup/sections", headers=headers, timeout=15)
    assert r1.status_code == 200
    r2 = requests.get(f"{API}/esg-kpi-definitions/lookup/tags", headers=headers, timeout=15)
    assert r2.status_code == 200


def test_filters_search(headers, created_kpi):
    r = requests.get(f"{API}/esg-kpi-definitions?section=environment", headers=headers, timeout=15)
    assert r.status_code == 200
    for k in r.json():
        assert k["section"] == "environment"
