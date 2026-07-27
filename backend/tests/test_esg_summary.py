"""Tests for ESG summary/analytics endpoints - iteration 98."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://questionnaire-sync-2.preview.emergentagent.com").rstrip("/")
EMAIL = "goyalsomil2001@gmail.com"
PASSWORD = "TestUser123!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_esg_summary_2026(headers):
    r = requests.get(f"{BASE_URL}/api/dashboard/esg-summary", params={"year": 2026}, headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    print("ESG SUMMARY:", data)
    kpis = data.get("kpis", {})

    # total_employees
    te = kpis.get("total_employees", {})
    assert te.get("value") == 698, f"total_employees.value expected 698, got {te.get('value')}"

    # diversity_pct ~25.5
    dv = data.get("diversity_pct", {})
    assert dv.get("value") is not None
    assert abs(float(dv["value"]) - 25.5) < 0.5, f"diversity_pct expected ~25.5, got {dv.get('value')}"

    # ltifr 266666.67
    lt = data.get("ltifr", {})
    assert lt.get("value") is not None
    assert abs(float(lt["value"]) - 266666.67) < 1, f"ltifr expected 266666.67, got {lt.get('value')}"

    # ap_days 2190.0
    ap = data.get("ap_days", {})
    assert ap.get("value") is not None
    assert abs(float(ap["value"]) - 2190.0) < 0.01, f"ap_days expected 2190.0, got {ap.get('value')}"


def test_esg_analytics_snapshot(headers):
    r = requests.get(
        f"{BASE_URL}/api/dashboard/esg-analytics",
        params={"start_date": "2026-04", "end_date": "2027-03"},
        headers=headers,
        timeout=30,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    print("ESG ANALYTICS keys:", list(data.keys()))

    # find workforce data (employees=698 across 12 months)
    # Structure may vary; look for arrays
    def find_series(obj, key_name):
        if isinstance(obj, dict):
            for k, v in obj.items():
                if k.lower() == key_name.lower() and isinstance(v, list):
                    return v
                r = find_series(v, key_name)
                if r is not None:
                    return r
        elif isinstance(obj, list):
            for it in obj:
                r = find_series(it, key_name)
                if r is not None:
                    return r
        return None

    employees_series = find_series(data, "employees")
    lti_series = find_series(data, "lostTimeInjuries")
    print("employees:", employees_series)
    print("lostTimeInjuries:", lti_series)

    if employees_series is not None:
        vals = [x.get("value") if isinstance(x, dict) else x for x in employees_series]
        assert len(vals) == 12, f"expected 12 months, got {len(vals)}"
        assert all(v == 698 for v in vals), f"expected all 698, got {vals}"

    if lti_series is not None:
        # only 2026-06 should have 80
        for entry in lti_series:
            if isinstance(entry, dict):
                month = entry.get("month") or entry.get("date") or entry.get("period")
                val = entry.get("value")
                if month and "2026-06" in str(month):
                    assert val == 80, f"expected 80 at 2026-06, got {val}"
