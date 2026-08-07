"""Tests for metric-behavior semantics in ESG analytics endpoints."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://ghg-calc-engine-3.preview.emergentagent.com").rstrip("/")
EMAIL = "goyalsomil2001@gmail.com"
PASSWORD = "TestUser123!"


@pytest.fixture(scope="module")
def headers():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def analytics(headers):
    r = requests.get(
        f"{BASE_URL}/api/dashboard/esg-analytics",
        params={"start_date": "2026-04", "end_date": "2027-03"},
        headers=headers,
        timeout=60,
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_workforce_snapshot_employees_carry_forward(analytics):
    workforce = analytics.get("workforce", [])
    assert len(workforce) == 12, f"expected 12 months, got {len(workforce)}"
    for w in workforce:
        assert w.get("employees") == 698.0, f"period {w['period']}: employees={w.get('employees')}, expected 698"


def test_workforce_flow_injuries_only_in_june(analytics):
    workforce = analytics.get("workforce", [])
    lti_map = {w["period"]: w.get("lostTimeInjuries", 0) for w in workforce}
    assert lti_map.get("2026-06") == 80.0, f"expected 80 in 2026-06, got {lti_map.get('2026-06')}"
    for p, v in lti_map.items():
        if p != "2026-06":
            assert v == 0.0, f"lostTimeInjuries should be 0 in {p}, got {v}"


def test_water_recycled_series(analytics):
    water = analytics.get("water", [])
    wmap = {w["period"]: w for w in water}
    rec_06 = wmap["2026-06"].get("recycled", 0)
    rec_07 = wmap["2026-07"].get("recycled", 0)
    assert abs(rec_06 - 21.22) < 1.0, f"expected ~21.22 in 2026-06, got {rec_06}"
    assert abs(rec_07 - 3122.0) < 5.0, f"expected ~3122.0 in 2026-07, got {rec_07}"


def test_dashboard_metrics_water_recycled(headers):
    r = requests.get(
        f"{BASE_URL}/api/esg-records/dashboard-metrics",
        params={"start_date": "2026-04", "end_date": "2027-03"},
        headers=headers,
        timeout=60,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    recycled = data.get("water", {}).get("recycled", 0)
    assert abs(recycled - 3143.22) < 5.0, f"expected water.recycled ~3143.22, got {recycled}"
    # waste and emissions (esg_records) should be 0
    waste = data.get("waste", {})
    assert waste.get("generated", 0) == 0 and waste.get("total", 0) == 0, f"expected waste=0, got {waste}"
    esg_ghg = data.get("emissions", {}).get("ghg_emissions", {}).get("esg_records", {})
    assert esg_ghg.get("total", 0) == 0.0, f"expected esg_records ghg total=0, got {esg_ghg}"
