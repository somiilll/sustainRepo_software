"""Density mismatch API contract regression tests for Scope 1 Process Emissions."""

import os
import uuid

import pytest
import requests


def _load_base_url() -> str:
    env_url = os.environ.get("REACT_APP_BACKEND_URL")
    if env_url:
        return env_url.rstrip("/")
    with open("/app/frontend/.env", "r", encoding="utf-8") as env_file:
        for line in env_file:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL is required")


BASE_URL = _load_base_url()
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def auth_headers():
    """Admin auth for emission create/update checks."""
    login = requests.post(
        f"{API}/auth/login",
        json={"email": "goyalsomil2001@gmail.com", "password": "TestUser123!"},
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
    """Facility fixture for create payloads."""
    response = requests.get(f"{API}/facilities", headers=auth_headers, timeout=30)
    assert response.status_code == 200, f"Failed to load facilities: {response.status_code} {response.text}"
    facilities = response.json()
    assert facilities and isinstance(facilities, list), "No facilities available"
    return facilities[0]["id"]


@pytest.fixture
def cleanup_ids(auth_headers):
    """Cleanup test records created by this suite."""
    ids = []
    yield ids
    for emission_id in ids:
        requests.delete(f"{API}/emissions/{emission_id}", headers=auth_headers, timeout=30)


def _payload(facility_id: str) -> dict:
    marker = f"TEST_DENSITY_ITER26_{uuid.uuid4().hex[:8]}"
    return {
        "facility_id": facility_id,
        "reporting_period": "2025-12",
        "frequency_type": "monthly",
        "scope": "scope1",
        "category": "Process Emissions",
        "sub_category": "Cement",
        "fuel_type": "Density Contract",
        "process_type": "venting",
        "source_of_information": marker,
        "record_source": marker,
        "notes": marker,
        "outputs": {
            "co2": {"value": 0.11, "unit": "tCO2"},
            "ch4": {"value": 0.0, "unit": "tCH4"},
            "n2o": {"value": 0.0, "unit": "tN2O"},
            "co2e": {"value": 0.11, "unit": "tCO2e"},
        },
    }


# Quantity-basis EF: reject mass/volume mismatch without usable density
def test_qty_basis_mismatch_requires_density_422(auth_headers, facility_id):
    payload = _payload(facility_id)
    payload["calculation_methodology"] = "using_qty_basis_ef"
    payload["dynamic_field_values"] = {
        "qty": {"value": 100.0, "unit": "kg"},
        "ef_quantity": {"value": 2.0, "unit": "kgCO2/L"},
    }

    create = requests.post(f"{API}/emissions", headers=auth_headers, json=payload, timeout=45)
    assert create.status_code == 422, f"Expected 422, got {create.status_code}: {create.text}"
    detail = create.json().get("detail", "")
    assert "Density (L/kg) is required" in detail


# Quantity-basis EF: accept the same mismatch once density is provided
def test_qty_basis_mismatch_with_density_succeeds(auth_headers, facility_id, cleanup_ids):
    payload = _payload(facility_id)
    payload["calculation_methodology"] = "using_qty_basis_ef"
    payload["dynamic_field_values"] = {
        "qty": {"value": 100.0, "unit": "kg"},
        "ef_quantity": {"value": 2.0, "unit": "kgCO2/L"},
        "density": {"value": 1.25, "unit": "L/kg", "is_override": True},
    }

    create = requests.post(f"{API}/emissions", headers=auth_headers, json=payload, timeout=45)
    assert create.status_code == 200, f"Create with density failed: {create.status_code} {create.text}"
    created = create.json()
    cleanup_ids.append(created["id"])
    assert created["dynamic_field_values"]["density"]["unit"] == "L/kg"


# Carbon composition + mass quantity: same-dimension path must not require density
def test_carbon_composition_mass_quantity_does_not_require_density(auth_headers, facility_id, cleanup_ids):
    payload = _payload(facility_id)
    payload["calculation_methodology"] = "using_carbon_composition"
    payload["dynamic_field_values"] = {
        "qty": {"value": 25.0, "unit": "kg"},
        "composition_of_carbon": {"value": 85.0, "unit": "%"},
        "oxidation_factor": {"value": 0.98, "unit": ""},
    }

    create = requests.post(f"{API}/emissions", headers=auth_headers, json=payload, timeout=45)
    assert create.status_code == 200, f"Expected success without density: {create.status_code} {create.text}"
    created = create.json()
    cleanup_ids.append(created["id"])
    assert "density" not in (created.get("dynamic_field_values") or {})


# PUT path: mismatch must still be blocked when density is removed
def test_update_rejects_removed_density_on_mismatch(auth_headers, facility_id, cleanup_ids):
    payload = _payload(facility_id)
    payload["calculation_methodology"] = "using_qty_basis_ef"
    payload["dynamic_field_values"] = {
        "qty": {"value": 100.0, "unit": "kg"},
        "ef_quantity": {"value": 2.0, "unit": "kgCO2/L"},
        "density": {"value": 1.25, "unit": "L/kg", "is_override": True},
    }
    create = requests.post(f"{API}/emissions", headers=auth_headers, json=payload, timeout=45)
    assert create.status_code == 200, f"Create with density failed: {create.status_code} {create.text}"
    created = create.json()
    cleanup_ids.append(created["id"])

    payload["dynamic_field_values"].pop("density")
    update = requests.put(
        f"{API}/emissions/{created['id']}",
        headers=auth_headers,
        json=payload,
        timeout=45,
    )
    assert update.status_code == 422, f"Expected 422 on update mismatch: {update.status_code} {update.text}"
    assert "Density (L/kg) is required" in update.json().get("detail", "")
