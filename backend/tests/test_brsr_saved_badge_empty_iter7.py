# BRSR: empty-saved responses must not report 'saved' status; progress endpoint shape (read-only)
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
PERIOD = "FY%202026-2027"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "goyalsomil2001@gmail.com", "password": "TestUser123!"})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    d = r.json()
    tok = d.get("access_token") or d.get("token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="module")
def statuses(client):
    r = client.get(f"{BASE_URL}/api/esg-questionnaire/responses/BRSR/section_a/{PERIOD}/statuses")
    assert r.status_code == 200, r.text
    return r.json().get("statuses", {})


# Empty-saved fix
def test_registered_address_not_saved(statuses):
    assert (statuses.get("brsr_a_registered_address") or {}).get("status") != "saved"


def test_contact_person_not_saved(statuses):
    assert (statuses.get("brsr_a_contact_person") or {}).get("status") != "saved"


def test_entity_name_saved(statuses):
    assert statuses.get("brsr_a_entity_name", {}).get("status") == "saved"


def test_corporate_address_saved(statuses):
    assert statuses.get("brsr_a_corporate_address", {}).get("status") == "saved"


# Progress endpoint
def test_progress_shape(client):
    r = client.get(f"{BASE_URL}/api/brsr-report/progress", params={"reporting_period": "FY 2026-2027"})
    assert r.status_code == 200, r.text
    data = r.json()
    sections = data.get("sections", data)
    for sk in ("section_a", "section_b", "section_c"):
        sec = sections[sk]
        for f in ("total", "answered", "percent", "counts", "groups"):
            assert f in sec, f"{sk} missing {f}"
        assert isinstance(sec["total"], int)
    names = [g.get("label") or g.get("name") or g.get("title") for g in sections["section_b"]["groups"]]
    assert "Policy and management processes" in names
    assert "Governance, leadership and oversight" in names
