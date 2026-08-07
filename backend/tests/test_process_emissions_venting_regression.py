"""Process Emissions (Venting) regression tests for recent Scope 1 fixes."""

import os
import uuid
import requests
import pytest


def _load_base_url() -> str:
    env_url = os.environ.get("REACT_APP_BACKEND_URL")
    if env_url:
        return env_url.rstrip("/")

    # Fallback to frontend env file used by deployed preview environments
    with open("/app/frontend/.env", "r", encoding="utf-8") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")

    raise RuntimeError("REACT_APP_BACKEND_URL is required")


BASE_URL = _load_base_url()
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASSWORD = "TestUser123!"


@pytest.fixture(scope="module")
def auth_headers():
    """Auth fixture for emissions endpoints."""
    login = requests.post(
        f"{API}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    if login.status_code != 200:
        pytest.skip(f"Admin login failed: {login.status_code} {login.text}")
    token = login.json().get("access_token") or login.json().get("token")
    if not token:
        pytest.skip("No auth token returned from login")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def facility_id(auth_headers):
    """Facility fixture for emission creation payloads."""
    resp = requests.get(f"{API}/facilities", headers=auth_headers, timeout=30)
    assert resp.status_code == 200, f"Failed to load facilities: {resp.status_code} {resp.text}"
    facilities = resp.json()
    assert isinstance(facilities, list) and facilities, "No facilities available for test user"
    return facilities[0]["id"]


@pytest.fixture
def cleanup_emission_ids(auth_headers):
    """Cleanup TEST_ prefixed records created during each test."""
    created_ids = []
    yield created_ids
    for eid in created_ids:
        requests.delete(f"{API}/emissions/{eid}", headers=auth_headers, timeout=30)


def _base_process_payload(facility_id: str) -> dict:
    marker = f"TEST_PROCESS_VENTING_{uuid.uuid4().hex[:8]}"
    return {
        "facility_id": facility_id,
        "reporting_period": "2025-12",
        "frequency_type": "monthly",
        "scope": "scope1",
        "category": "Process Emissions",
        "sub_category": "Cement",
        "fuel_type": "Venting Test",
        "process_type": "venting",
        "source_of_information": marker,
        "record_source": marker,
        "notes": marker,
        "process_names": [marker],
        "process_descriptions": [{"name": marker, "description": "Regression test process"}],
        "outputs": {
            "co2": {"value": 0.1234, "unit": "tCO2"},
            "ch4": {"value": 0.0, "unit": "tCH4"},
            "n2o": {"value": 0.0, "unit": "tN2O"},
            "co2e": {"value": 0.1234, "unit": "tCO2e"},
        },
    }


# Scope 1 Process Emissions: Venting + Using Composition of Carbon payload persistency
def test_create_venting_with_carbon_composition_persists_fields(auth_headers, facility_id, cleanup_emission_ids):
    payload = _base_process_payload(facility_id)
    payload["dynamic_field_values"] = {
        "qty": {"value": 100.0, "unit": "kg"},
        "composition_of_carbon": {"value": 85.0, "unit": "%"},
        "oxidation_factor": {"value": 0.98, "unit": ""},
    }

    create = requests.post(f"{API}/emissions", headers=auth_headers, json=payload, timeout=45)
    assert create.status_code == 200, f"Create failed: {create.status_code} {create.text}"
    created = create.json()
    cleanup_emission_ids.append(created["id"])

    assert created.get("process_type") == "venting"
    dfv = created.get("dynamic_field_values") or {}
    assert dfv.get("composition_of_carbon", {}).get("value") == 85.0
    assert dfv.get("oxidation_factor", {}).get("value") == 0.98

    fetched = requests.get(f"{API}/emissions/{created['id']}", headers=auth_headers, timeout=30)
    assert fetched.status_code == 200, f"Fetch failed: {fetched.status_code} {fetched.text}"
    persisted = fetched.json()
    assert persisted.get("process_type") == "venting"
    persisted_dfv = persisted.get("dynamic_field_values") or {}
    assert persisted_dfv.get("composition_of_carbon", {}).get("value") == 85.0
    assert persisted_dfv.get("oxidation_factor", {}).get("value") == 0.98


# Scope 1 Process Emissions: Venting + Using NCV should not carry carbon-composition fields
def test_create_venting_using_ncv_does_not_store_carbon_fields(auth_headers, facility_id, cleanup_emission_ids):
    payload = _base_process_payload(facility_id)
    payload["dynamic_field_values"] = {
        "qty": {"value": 50.0, "unit": "kg"},
        "ncv": {"value": 42.0, "unit": "MJ/kg"},
        "ef_heat": {"value": 74.0, "unit": "kgCO2/GJ"},
    }

    create = requests.post(f"{API}/emissions", headers=auth_headers, json=payload, timeout=45)
    assert create.status_code == 200, f"Create failed: {create.status_code} {create.text}"
    created = create.json()
    cleanup_emission_ids.append(created["id"])

    dfv = created.get("dynamic_field_values") or {}
    assert "composition_of_carbon" not in dfv
    assert "oxidation_factor" not in dfv
    assert "ncv" in dfv
