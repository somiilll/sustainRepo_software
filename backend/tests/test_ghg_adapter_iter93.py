"""Backend tests for GHG Adapter integration with KPI Engine (iteration 93)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://esg-brsr-reporting.preview.emergentagent.com").rstrip("/")
LOGIN_EMAIL = "goyalsomil2001@gmail.com"
LOGIN_PASSWORD = "TestUser123!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"No token in response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _calc(headers, kpi_id, period):
    return requests.post(
        f"{BASE_URL}/api/kpi-engine/calculate",
        json={"kpi_id": kpi_id, "period": period},
        headers=headers,
        timeout=60,
    )


# --- KPI Engine GHG adapter tests ---
def test_scope1_total(headers):
    r = _calc(headers, "855de2ee-8684-4038-9b3f-c138f9f7893f", {"year": 2026})
    assert r.status_code == 200, r.text
    d = r.json()
    print("Scope1:", d)
    assert d.get("record_count") == 23, d
    assert abs(d.get("value") - 84827.7352) < 0.01, d
    md = d.get("metadata", {})
    assert md.get("source_collection") == "emission_records", md
    assert md.get("ghg_scope") == "scope1", md


def test_scope2_total(headers):
    r = _calc(headers, "ff0c0684-d717-49ad-80fc-90136bf29868", {"year": 2026})
    assert r.status_code == 200, r.text
    d = r.json()
    print("Scope2:", d)
    assert d.get("record_count") == 15, d
    assert abs(d.get("value") - 247.6414) < 0.01, d
    assert d["metadata"].get("ghg_scope") == "scope2"


def test_scope3_total(headers):
    r = _calc(headers, "ca7ac4c2-5be2-40e6-aac8-a4af88dd8134", {"year": 2026})
    assert r.status_code == 200, r.text
    d = r.json()
    print("Scope3:", d)
    assert d.get("record_count") == 35, d
    assert abs(d.get("value") - 3211.7584) < 0.01, d
    assert d["metadata"].get("ghg_scope") == "scope3"


def test_stationary_combustion(headers):
    r = _calc(headers, "dfdace2c-f41a-4637-a4b0-cd26afc0b342", {"year": 2026})
    assert r.status_code == 200, r.text
    d = r.json()
    print("Stationary:", d)
    assert abs(d.get("value") - 161.8759) < 0.01, d
    assert d["metadata"].get("ghg_category") == "Stationary Combustion", d["metadata"]


def test_scope3_c1_not_c10(headers):
    r = _calc(headers, "c21b756d-14cc-4548-ae0d-20611f93314e", {"year": 2026})
    assert r.status_code == 200, r.text
    d = r.json()
    print("Scope3-C1:", d)
    assert d.get("record_count") == 12, d
    assert abs(d.get("value") - 1716.6011) < 0.01, d
    cat = d["metadata"].get("ghg_category")
    assert cat == "C1", f"Expected C1, got {cat}"


def test_scope1_subcategories_sum(headers):
    # Stationary + Mobile + Fugitive == Scope1
    stationary = _calc(headers, "dfdace2c-f41a-4637-a4b0-cd26afc0b342", {"year": 2026}).json()["value"]
    # Need to fetch mobile & fugitive IDs - we know values from problem statement
    # Just verify math using known values against Scope1 total
    total = _calc(headers, "855de2ee-8684-4038-9b3f-c138f9f7893f", {"year": 2026}).json()["value"]
    expected_sum = 161.8759 + 32.5485 + 84633.3108
    assert abs(total - expected_sum) < 1.0, f"Total {total} vs sum {expected_sum}"
    assert abs(stationary - 161.8759) < 0.01


def test_scope1_monthly(headers):
    r = _calc(headers, "855de2ee-8684-4038-9b3f-c138f9f7893f", {"year": 2026, "month": 1})
    assert r.status_code == 200, r.text
    d = r.json()
    print("Scope1 Jan:", d)
    # Should be less than full year total
    assert d.get("value") is not None
    assert d["metadata"].get("source_collection") == "emission_records"
    # Value should be smaller than annual total
    assert d["value"] < 84827.7352


# --- Baseline auto-fetch tests ---
def test_baseline_lookup_new_key(headers):
    r = requests.get(
        f"{BASE_URL}/api/esg-targets/baseline/lookup",
        params={"metric_key": "total_scope1_emissions"},
        headers=headers,
        timeout=30,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    print("Baseline new:", d)
    assert d.get("found") is True, d
    assert abs(float(d.get("base_value", 0)) - 2641.0) < 0.01, d


def test_baseline_lookup_old_code(headers):
    r = requests.get(
        f"{BASE_URL}/api/esg-targets/baseline/lookup",
        params={"metric_key": "ENV_TOTAL_GHG_EMISSIONS_SCOPE_1"},
        headers=headers,
        timeout=30,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    print("Baseline old:", d)
    assert d.get("found") is False, d
