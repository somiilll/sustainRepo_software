"""Tests for baseline_mapping_key + baseline auto-fetch fixes (iteration 93)."""
import os
import requests
import pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
EMAIL = "goyalsomil2001@gmail.com"
PASSWORD = "TestUser123!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token") or (data.get("data") or {}).get("token")
    assert tok, f"No token in login response: {data}"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def test_categories_returns_baseline_mapping_key(headers):
    r = requests.get(f"{BASE_URL}/api/esg-targets/lookup/categories", params={"section": "environment"}, headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    # Find Emissions > GHG Emissions - Scope 1 > Total GHG Emissions Scope 1
    def walk(obj, path=None):
        path = path or []
        found = []
        if isinstance(obj, dict):
            name = obj.get("name") or obj.get("label") or obj.get("title") or ""
            newpath = path + [name] if name else path
            if obj.get("baseline_mapping_key"):
                found.append((newpath, obj))
            for v in obj.values():
                found.extend(walk(v, newpath))
        elif isinstance(obj, list):
            for it in obj:
                found.extend(walk(it, path))
        return found

    found = walk(data)
    print(f"Found {len(found)} entries with baseline_mapping_key")
    keys = {obj["baseline_mapping_key"] for _, obj in found}
    print("Keys sample:", list(keys)[:15])
    assert "total_scope1_emissions" in keys, f"total_scope1_emissions not present. Found: {keys}"
    assert "total_scope2_emissions" in keys
    assert "total_scope3_emissions" in keys


@pytest.mark.parametrize("metric_key,expected_value", [
    ("total_scope1_emissions", 2641.0),
    ("total_scope2_emissions", 1564.0),
    ("total_scope3_emissions", 4961.0113),
    ("stationary_combustion", 1182.0),
])
def test_baseline_lookup_values(headers, metric_key, expected_value):
    r = requests.get(f"{BASE_URL}/api/esg-targets/baseline/lookup", params={"metric_key": metric_key}, headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    print(f"{metric_key} -> {data}")
    assert data.get("found") is True, f"{metric_key} not found: {data}"
    assert abs(float(data.get("base_value", 0)) - expected_value) < 0.01, f"{metric_key}: got {data.get('base_value')} expected {expected_value}"


def test_scope1_base_year(headers):
    r = requests.get(f"{BASE_URL}/api/esg-targets/baseline/lookup", params={"metric_key": "total_scope1_emissions"}, headers=headers)
    data = r.json()
    assert data.get("base_year") == "FY 2017-2018", f"Unexpected base_year: {data.get('base_year')}"


def test_scope3_c1_only_c1_records(headers):
    r = requests.get(f"{BASE_URL}/api/esg-targets/baseline/lookup", params={"metric_key": "scope3_c1"}, headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    print("scope3_c1:", data)
    assert data.get("found") is True
    assert abs(float(data.get("base_value", 0)) - 1149.0113) < 0.01, f"base_value: {data.get('base_value')}"
    breakdown = data.get("breakdown") or data.get("breakdowns") or []
    for entry in breakdown:
        cat = entry.get("category", "")
        # Must start with "C1 " (with space) not C10/C11 etc
        assert cat.startswith("C1 ") or cat.startswith("C1:") or cat == "C1", f"Category leak: {cat}"


def test_mobile_fugitive_mappings(headers):
    for mk in ["mobile_combustion", "fugitive_emissions"]:
        r = requests.get(f"{BASE_URL}/api/esg-targets/baseline/lookup", params={"metric_key": mk}, headers=headers)
        assert r.status_code == 200, r.text
        data = r.json()
        print(f"{mk} -> found={data.get('found')} value={data.get('base_value')}")
        assert data.get("found") is True, f"{mk} not found"


def test_old_metric_code_returns_not_found(headers):
    r = requests.get(f"{BASE_URL}/api/esg-targets/baseline/lookup",
                     params={"metric_key": "ENV_TOTAL_GHG_EMISSIONS_SCOPE_1"}, headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("found") is False, f"Old code should return not found: {data}"
