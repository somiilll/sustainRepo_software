"""Live read-only regression tests for supplier scope enforcement."""
import os

import pytest
import requests


def _base_url() -> str:
    base = os.environ.get("REACT_APP_BACKEND_URL")
    if not base:
        pytest.skip("REACT_APP_BACKEND_URL is required for live tests")
    return base.rstrip("/")


def _login(email: str, password: str) -> requests.Response:
    return requests.post(
        f"{_base_url()}/api/auth/login",
        json={"email": email, "password": password},
        timeout=20,
    )


@pytest.fixture(scope="session")
def supplier_auth_headers() -> dict:
    response = _login("goyalsomil+919@hotmail.com", "TestUser123!")
    assert response.status_code == 200, response.text
    payload = response.json()
    token = payload.get("access_token") or payload.get("token")
    assert isinstance(token, str) and token.strip(), payload
    return {"Authorization": f"Bearer {token}"}


# Supplier scope assignment enforcement checks
def test_supplier_config_exposes_only_scope1_scope2(supplier_auth_headers):
    response = requests.get(
        f"{_base_url()}/api/supplier-assessment/my-assessment/emissions/config",
        headers=supplier_auth_headers,
        timeout=20,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    enabled = data.get("enabled_scopes") or []
    assert enabled == [scope for scope in ("scope1", "scope2") if scope in enabled]
    assert "scope3" not in enabled and "biogenic" not in enabled
    categories = data.get("categories") or {}
    assert set(categories.keys()).issubset(set(enabled))


def test_supplier_submission_exposes_only_assigned_scopes(supplier_auth_headers):
    response = requests.get(
        f"{_base_url()}/api/supplier-assessment/my-assessment/emissions/submission",
        headers=supplier_auth_headers,
        timeout=20,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    enabled = data.get("enabled_scopes") or []
    assert enabled == [scope for scope in ("scope1", "scope2") if scope in enabled]
    assert "scope3" not in enabled and "biogenic" not in enabled


def test_supplier_emission_lists_exclude_unassigned_scopes(supplier_auth_headers):
    assigned = requests.get(
        f"{_base_url()}/api/supplier-assessment/my-assessment/emissions/config",
        headers=supplier_auth_headers,
        timeout=20,
    ).json().get("enabled_scopes") or []

    state_response = requests.get(
        f"{_base_url()}/api/supplier-assessment/my-assessment/emissions",
        headers=supplier_auth_headers,
        timeout=20,
    )
    assert state_response.status_code == 200, state_response.text
    for row in state_response.json():
        assert row.get("scope") in assigned

    list_response = requests.get(
        f"{_base_url()}/api/emissions",
        headers=supplier_auth_headers,
        timeout=20,
    )
    assert list_response.status_code == 200, list_response.text
    for row in list_response.json():
        assert row.get("scope") in assigned


def test_supplier_specific_create_rejects_scope3_even_with_valid_period(supplier_auth_headers):
    config = requests.get(
        f"{_base_url()}/api/supplier-assessment/my-assessment/emissions/config",
        headers=supplier_auth_headers,
        timeout=20,
    ).json()
    allowed_months = config.get("allowed_months") or []
    reporting_period = allowed_months[0] if allowed_months else config.get("reporting_period")
    assert reporting_period

    response = requests.post(
        f"{_base_url()}/api/supplier-assessment/my-assessment/emissions",
        headers={**supplier_auth_headers, "Content-Type": "application/json"},
        json={
            "reporting_period": reporting_period,
            "frequency_type": "monthly",
            "scope": "scope3",
            "category": "TEST_INVALID_SCOPE",
        },
        timeout=20,
    )
    assert response.status_code == 400, response.text
    assert "not enabled" in (response.json().get("detail", "").lower())


def test_generic_emission_create_rejects_supplier_scope3(supplier_auth_headers):
    facilities = requests.get(
        f"{_base_url()}/api/facilities",
        headers=supplier_auth_headers,
        timeout=20,
    )
    assert facilities.status_code == 200, facilities.text
    facility_rows = facilities.json() or []
    if not facility_rows:
        pytest.skip("No supplier facilities available for read-only create rejection test")

    config = requests.get(
        f"{_base_url()}/api/supplier-assessment/my-assessment/emissions/config",
        headers=supplier_auth_headers,
        timeout=20,
    ).json()
    allowed_months = config.get("allowed_months") or []
    reporting_period = allowed_months[0] if allowed_months else config.get("reporting_period")
    assert reporting_period

    payload = {
        "facility_id": facility_rows[0]["id"],
        "reporting_period": reporting_period,
        "frequency_type": "monthly",
        "scope": "scope3",
        "category": "Stationary Combustion",
        "sub_category": "Natural Gas",
        "dynamic_field_values": {},
        "outputs": {},
    }
    response = requests.post(
        f"{_base_url()}/api/emissions",
        headers={**supplier_auth_headers, "Content-Type": "application/json"},
        json=payload,
        timeout=20,
    )
    assert response.status_code in (400, 403), response.text
    detail = str(response.json().get("detail", "")).lower()
    assert "scope" in detail and ("assigned" in detail or "access" in detail)


def test_generic_emission_edit_rejects_scope_change_to_unassigned(supplier_auth_headers):
    records_response = requests.get(
        f"{_base_url()}/api/emissions",
        headers=supplier_auth_headers,
        timeout=20,
    )
    assert records_response.status_code == 200, records_response.text
    rows = records_response.json() or []
    if not rows:
        pytest.skip("No supplier emission records available for read-only update rejection test")

    source = rows[0]
    payload = {
        "facility_id": source["facility_id"],
        "reporting_period": source.get("reporting_period") or "2025-01",
        "frequency_type": source.get("frequency_type") or "monthly",
        "scope": "scope3",
        "category": source.get("category") or "Stationary Combustion",
        "sub_category": source.get("sub_category") or source.get("category") or "Natural Gas",
        "dynamic_field_values": source.get("dynamic_field_values") or {},
        "outputs": source.get("outputs") or {},
    }
    response = requests.put(
        f"{_base_url()}/api/emissions/{source['id']}",
        headers={**supplier_auth_headers, "Content-Type": "application/json"},
        json=payload,
        timeout=20,
    )
    assert response.status_code == 403, response.text
    detail = str(response.json().get("detail", "")).lower()
    assert "scope" in detail and ("assigned" in detail or "access" in detail)


def test_supplier_revision_history_contains_only_assigned_scope_rows(supplier_auth_headers):
    config = requests.get(
        f"{_base_url()}/api/supplier-assessment/my-assessment/emissions/config",
        headers=supplier_auth_headers,
        timeout=20,
    ).json()
    assigned = config.get("enabled_scopes") or []

    records_response = requests.get(
        f"{_base_url()}/api/supplier-assessment/my-assessment/emissions",
        headers=supplier_auth_headers,
        timeout=20,
    )
    assert records_response.status_code == 200, records_response.text
    rows = records_response.json() or []
    if not rows:
        pytest.skip("No supplier emission rows available for revision history check")

    history_response = requests.get(
        f"{_base_url()}/api/supplier-assessment/my-assessment/emissions/{rows[0]['id']}/revisions",
        headers=supplier_auth_headers,
        timeout=20,
    )
    assert history_response.status_code == 200, history_response.text
    revisions = history_response.json().get("revisions") or []
    assert revisions
    for revision in revisions:
        assert revision.get("scope") in assigned
