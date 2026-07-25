import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://dashboard-premium-4.preview.emergentagent.com").rstrip("/")
EMAIL = "goyalsomil2001@gmail.com"
PASSWORD = "TestUser123!"


@pytest.fixture(scope="module")
def token():
    # Try common auth endpoints
    for path in ["/api/auth/login", "/api/login", "/api/users/login"]:
        r = requests.post(f"{BASE_URL}{path}", json={"email": EMAIL, "password": PASSWORD})
        if r.status_code == 200:
            data = r.json()
            tok = data.get("access_token") or data.get("token") or (data.get("data") or {}).get("access_token")
            if tok:
                print(f"Auth via {path}")
                return tok
    pytest.skip("Cannot auth")


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_esg_analytics_structure(headers):
    r = requests.get(
        f"{BASE_URL}/api/dashboard/esg-analytics",
        params={"start_date": "2026-04", "end_date": "2027-03"},
        headers=headers,
    )
    print("status:", r.status_code)
    assert r.status_code == 200, r.text
    data = r.json()
    # Sometimes wrapped
    payload = data.get("data", data)
    print("keys:", list(payload.keys()))
    for key in ["emissions", "energy", "water", "waste", "workforce", "safety", "finance", "breaches", "governance"]:
        assert key in payload, f"missing {key}"
    for key in ["emissions", "energy", "water", "waste", "workforce", "safety", "finance", "breaches"]:
        series = payload[key]
        # Series can be object with arrays; ensure some array length == 12
        if isinstance(series, dict):
            for k, v in series.items():
                if isinstance(v, list):
                    assert len(v) == 12, f"{key}.{k} len={len(v)}"
        elif isinstance(series, list):
            assert len(series) == 12
    return payload


def test_water_recycled_in_months(headers):
    r = requests.get(
        f"{BASE_URL}/api/dashboard/esg-analytics",
        params={"start_date": "2026-04", "end_date": "2027-03"},
        headers=headers,
    )
    assert r.status_code == 200
    payload = r.json().get("data", r.json())
    water = payload["water"]
    print("water keys:", list(water.keys()) if isinstance(water, dict) else type(water))
    print("water:", water)
    # months 2026-04..2027-03 => index 2=2026-06, 3=2026-07
    if isinstance(water, dict) and "recycled" in water:
        recycled = water["recycled"]
        print("recycled series:", recycled)
        assert recycled[2] > 0 or recycled[3] > 0, f"expected recycled >0 in Jun/Jul: {recycled}"


def test_emissions_and_waste_zero(headers):
    r = requests.get(
        f"{BASE_URL}/api/dashboard/esg-analytics",
        params={"start_date": "2026-04", "end_date": "2027-03"},
        headers=headers,
    )
    payload = r.json().get("data", r.json())
    emissions = payload["emissions"]
    waste = payload["waste"]
    print("emissions:", emissions)
    print("waste:", waste)
    if isinstance(emissions, dict) and "esg_records" in emissions:
        assert all(v == 0 for v in emissions["esg_records"]), emissions["esg_records"]
    if isinstance(waste, dict) and "generated" in waste:
        assert all(v == 0 for v in waste["generated"]), waste["generated"]


def test_dashboard_metrics_recycled(headers):
    r = requests.get(
        f"{BASE_URL}/api/esg-records/dashboard-metrics",
        params={"start_date": "2026-04", "end_date": "2027-03"},
        headers=headers,
    )
    print("dm status:", r.status_code)
    assert r.status_code == 200, r.text
    data = r.json()
    payload = data.get("data", data)
    print("water block:", payload.get("water"))
    water = payload.get("water") or {}
    recycled = water.get("recycled")
    assert recycled is not None
    assert abs(float(recycled) - 3143.22) < 5.0, f"recycled={recycled}"
