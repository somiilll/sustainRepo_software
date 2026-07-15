"""Tests for energy service fixes in ESG dashboard endpoints."""
import os
import requests
import pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

EMAIL = "goyalsomil2001@gmail.com"
PASSWORD = "TestUser123!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"No token in response: {data}"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_dashboard_metrics_energy_breakdown(headers):
    r = requests.get(
        f"{BASE_URL}/api/esg-records/dashboard-metrics",
        params={"start_date": "2025-04", "end_date": "2026-03"},
        headers=headers, timeout=60
    )
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    print("DASHBOARD METRICS RESPONSE KEYS:", list(data.keys()))
    energy = data.get("energy", {})
    print("ENERGY:", energy)
    em = energy.get("emission_records", {})
    elec = em.get("electricity", {})
    fuel = em.get("fuel", {})
    print("Electricity:", elec)
    print("Fuel:", fuel)
    print("Total:", energy.get("total"))

    # Assertions per problem statement
    # electricity.renewable ~ 0.51 MWh
    assert elec.get("renewable", 0) > 0.4 and elec.get("renewable", 0) < 0.7, \
        f"electricity.renewable expected ~0.51 got {elec.get('renewable')}"
    # fuel.non_renewable ~1837.86
    fnr = fuel.get("non_renewable", 0)
    assert 1800 < fnr < 1900, f"fuel.non_renewable expected ~1837.86 got {fnr}"
    # total ~2320.08
    total = energy.get("total", 0)
    assert 2250 < total < 2400, f"energy.total expected ~2320.08 got {total}"


def test_esg_analytics_energy_water(headers):
    r = requests.get(
        f"{BASE_URL}/api/dashboard/esg-analytics",
        params={"start_date": "2026-04", "end_date": "2027-03"},
        headers=headers, timeout=60
    )
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    print("ANALYTICS KEYS:", list(data.keys()))
    energy_series = data.get("energy") or data.get("energy_series") or []
    water = data.get("water") or {}
    print("ENERGY series len:", len(energy_series) if isinstance(energy_series, list) else energy_series)
    print("ENERGY sample:", energy_series[:3] if isinstance(energy_series, list) else energy_series)
    print("WATER:", water)
    # Loose validation - series exists
    assert energy_series, "energy series should not be empty"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
