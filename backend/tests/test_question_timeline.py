# Question version-history timeline API tests (read-only)
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
YEAR = "FY%202025-2026"


@pytest.fixture(scope="module")
def headers():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "goyalsomil2001@gmail.com", "password": "TestUser123!"})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    d = r.json()
    tok = d.get("access_token") or d.get("token")
    return {"Authorization": f"Bearer {tok}"}


@pytest.mark.parametrize("qk", ["brsr_a_employees_workers", "brsr_a_turnover_rate"])
def test_timeline_kpi_synced(headers, qk):
    r = requests.get(f"{BASE_URL}/api/esg-questionnaire/timeline/BRSR/{qk}/{YEAR}", headers=headers)
    assert r.status_code == 200, r.text
    ev = r.json()["events"]
    kpi = [e for e in ev if e["event_type"] == "KPI_SYNCED"]
    assert kpi, f"no KPI_SYNCED for {qk}"
    for e in kpi:
        assert e["timestamp"].endswith("+00:00"), e["timestamp"]


def test_timeline_women_representation(headers):
    r = requests.get(f"{BASE_URL}/api/esg-questionnaire/timeline/BRSR/brsr_a_women_representation/{YEAR}", headers=headers)
    assert r.status_code == 200
    assert "events" in r.json()


def test_old_history_endpoint_removed(headers):
    r = requests.get(f"{BASE_URL}/api/esg-questionnaire/history/brsr_a_employees_workers", headers=headers)
    assert r.status_code == 404


def test_timeline_requires_auth():
    r = requests.get(f"{BASE_URL}/api/esg-questionnaire/timeline/BRSR/brsr_a_employees_workers/{YEAR}")
    assert r.status_code in (401, 403)
