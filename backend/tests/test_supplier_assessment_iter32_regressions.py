"""# Module: Supplier Assessment + Supplier-originated GHG policy regressions (Iter 32)."""

import os
from typing import Any, Dict, List

import pytest
import requests


KNOWN_SUPPLIER_RELATIONSHIP_ID = "f3abc4d8-1223-46cf-8e20-c8d5be97a2dd"
ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASSWORD = "TestUser123!"
SUPPLIER_EMAIL = "goyalsomil+919@hotmail.com"
SUPPLIER_PASSWORD = "TestUser123!"


def _base_url() -> str:
    value = os.environ.get("REACT_APP_BACKEND_URL")
    if not value:
        pytest.skip("REACT_APP_BACKEND_URL is required")
    return value.rstrip("/")


def _login(email: str, password: str) -> Dict[str, Any]:
    response = requests.post(
        f"{_base_url()}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    token = payload.get("access_token") or payload.get("token")
    assert isinstance(token, str) and token.strip(), payload
    return {"payload": payload, "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="session")
def admin_auth() -> Dict[str, Any]:
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="session")
def supplier_auth() -> Dict[str, Any]:
    return _login(SUPPLIER_EMAIL, SUPPLIER_PASSWORD)


def _supplier_period_and_scope(supplier_headers: Dict[str, str]) -> Dict[str, str]:
    config_response = requests.get(
        f"{_base_url()}/api/supplier-assessment/my-assessment/emissions/config",
        headers=supplier_headers,
        timeout=30,
    )
    assert config_response.status_code == 200, config_response.text
    config = config_response.json()
    enabled_scopes = config.get("enabled_scopes") or []
    assert enabled_scopes, config
    allowed_months = config.get("allowed_months") or []
    if allowed_months:
        return {"scope": enabled_scopes[0], "reporting_period": allowed_months[0], "frequency_type": "monthly"}
    reporting_period = config.get("reporting_period")
    assert reporting_period, config
    return {"scope": enabled_scopes[0], "reporting_period": reporting_period, "frequency_type": "yearly"}


def _first_supplier_facility_id(supplier_headers: Dict[str, str]) -> str:
    facilities_response = requests.get(
        f"{_base_url()}/api/facilities",
        headers=supplier_headers,
        timeout=30,
    )
    assert facilities_response.status_code == 200, facilities_response.text
    facilities = facilities_response.json() or []
    assert facilities, "Supplier has no facilities for generic /api/emissions validation"
    facility_id = facilities[0].get("id")
    assert facility_id
    return facility_id


def _module_codes(rows: List[Dict[str, Any]]) -> set[str]:
    return {row.get("code") for row in rows if row.get("code")}


# Reminder pending + submission status contracts for supplier module list parity
def test_reminder_pending_excludes_ghg_for_known_supplier(admin_auth):
    response = requests.get(
        f"{_base_url()}/api/supplier-assessment/suppliers/{KNOWN_SUPPLIER_RELATIONSHIP_ID}/reminder-pending",
        headers=admin_auth["headers"],
        timeout=30,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    modules = data.get("modules") or []
    assert isinstance(modules, list)
    codes = _module_codes(modules)
    assert "ghg" not in codes


def test_reminder_pending_matches_incomplete_submission_modules(admin_auth):
    pending_response = requests.get(
        f"{_base_url()}/api/supplier-assessment/suppliers/{KNOWN_SUPPLIER_RELATIONSHIP_ID}/reminder-pending",
        headers=admin_auth["headers"],
        timeout=30,
    )
    assert pending_response.status_code == 200, pending_response.text
    pending_codes = _module_codes(pending_response.json().get("modules") or [])

    status_response = requests.get(
        f"{_base_url()}/api/supplier-assessment/suppliers/{KNOWN_SUPPLIER_RELATIONSHIP_ID}/submission-status",
        headers=admin_auth["headers"],
        timeout=30,
    )
    assert status_response.status_code == 200, status_response.text
    status_payload = status_response.json()

    esg_items = status_payload.get("esg_items") or []
    esg_incomplete = any((item.get("status") not in {"locked", "completed"}) for item in esg_items)
    ghg_status = (status_payload.get("ghg") or {}).get("status")
    ghg_incomplete = ghg_status not in {"locked", "completed"}
    documents_incomplete = any((item.get("status") not in {"locked", "completed"}) for item in (status_payload.get("documents") or []))
    trainings_incomplete = any((item.get("status") not in {"locked", "completed"}) for item in (status_payload.get("training") or []))

    if esg_incomplete:
        assert "esg" in pending_codes
    else:
        assert "esg" not in pending_codes
    if ghg_incomplete:
        assert "ghg" in pending_codes
    else:
        assert "ghg" not in pending_codes
    if documents_incomplete:
        assert "documents" in pending_codes
    else:
        assert "documents" not in pending_codes
    if trainings_incomplete:
        assert "training" in pending_codes
    else:
        assert "training" not in pending_codes


def test_submission_status_due_dates_present_for_locked_items(admin_auth):
    response = requests.get(
        f"{_base_url()}/api/supplier-assessment/suppliers/{KNOWN_SUPPLIER_RELATIONSHIP_ID}/submission-status",
        headers=admin_auth["headers"],
        timeout=30,
    )
    assert response.status_code == 200, response.text
    payload = response.json()

    locked_esg = [item for item in (payload.get("esg") or []) if item.get("status") in {"locked", "completed"}]
    for item in locked_esg:
        assert item.get("due_date"), item

    ghg = payload.get("ghg") or {}
    if ghg.get("status") in {"locked", "completed"}:
        assert ghg.get("due_date"), ghg


# Supplier documents/trainings UI payload due-date visibility contracts
def test_supplier_documents_include_due_date_field(supplier_auth):
    response = requests.get(
        f"{_base_url()}/api/supplier-assessment/my-assessment/documents",
        headers=supplier_auth["headers"],
        timeout=30,
    )
    assert response.status_code == 200, response.text
    rows = response.json() or []
    for row in rows:
        assert "due_date" in row, row


def test_supplier_training_include_due_date_field(supplier_auth):
    response = requests.get(
        f"{_base_url()}/api/supplier-assessment/my-assessment/trainings",
        headers=supplier_auth["headers"],
        timeout=30,
    )
    assert response.status_code == 200, response.text
    rows = response.json() or []
    for row in rows:
        assert "due_date" in row


# Supplier-originated GHG policy enforcement (must reject disallowed capability payloads)
@pytest.mark.parametrize(
    "category,category_id,is_custom_fuel,detail_phrase",
    [
        ("Process Emissions", "process_emissions", False, "process emissions are not permitted"),
        ("Flaring", "flaring__stationary_combustion", False, "flaring is not permitted"),
        ("Stationary Combustion", None, True, "custom fuels are not permitted"),
    ],
)
def test_supplier_specific_emission_create_rejects_disallowed_capabilities(
    supplier_auth,
    category,
    category_id,
    is_custom_fuel,
    detail_phrase,
):
    assignment = _supplier_period_and_scope(supplier_auth["headers"])
    payload = {
        "reporting_period": assignment["reporting_period"],
        "frequency_type": assignment["frequency_type"],
        "scope": assignment["scope"],
        "category": category,
        "category_id": category_id,
        "sub_category": "TEST_DISALLOWED_CATEGORY",
        "is_custom_fuel": is_custom_fuel,
        "dynamic_field_values": {},
        "decision_inputs": {},
    }
    response = requests.post(
        f"{_base_url()}/api/supplier-assessment/my-assessment/emissions",
        headers={**supplier_auth["headers"], "Content-Type": "application/json"},
        json=payload,
        timeout=30,
    )
    assert response.status_code == 403, response.text
    detail = str(response.json().get("detail", "")).lower()
    assert detail_phrase in detail


@pytest.mark.parametrize(
    "category,category_id,is_custom_fuel,detail_phrase",
    [
        ("Process Emissions", "process_emissions", False, "process emissions are not permitted"),
        ("Flaring", "flaring__stationary_combustion", False, "flaring is not permitted"),
        ("Stationary Combustion", None, True, "custom fuels are not permitted"),
    ],
)
def test_generic_emissions_create_rejects_supplier_disallowed_capabilities(
    supplier_auth,
    category,
    category_id,
    is_custom_fuel,
    detail_phrase,
):
    assignment = _supplier_period_and_scope(supplier_auth["headers"])
    facility_id = _first_supplier_facility_id(supplier_auth["headers"])
    payload = {
        "facility_id": facility_id,
        "reporting_period": assignment["reporting_period"],
        "frequency_type": assignment["frequency_type"],
        "scope": assignment["scope"],
        "category": category,
        "category_id": category_id,
        "sub_category": "TEST_DISALLOWED_CATEGORY",
        "is_custom_fuel": is_custom_fuel,
        "dynamic_field_values": {},
        "outputs": {},
    }
    response = requests.post(
        f"{_base_url()}/api/emissions",
        headers={**supplier_auth["headers"], "Content-Type": "application/json"},
        json=payload,
        timeout=30,
    )
    assert response.status_code == 403, response.text
    detail = str(response.json().get("detail", "")).lower()
    assert detail_phrase in detail


# Existing supplier assessment APIs should remain healthy after policy changes
def test_supplier_assessment_core_flows_still_load(admin_auth, supplier_auth):
    admin_suppliers = requests.get(
        f"{_base_url()}/api/supplier-assessment/suppliers?page=1&page_size=10",
        headers=admin_auth["headers"],
        timeout=30,
    )
    assert admin_suppliers.status_code == 200, admin_suppliers.text
    admin_payload = admin_suppliers.json()
    assert isinstance(admin_payload.get("suppliers"), list)
    assert isinstance(admin_payload.get("total"), int)

    supplier_assessment = requests.get(
        f"{_base_url()}/api/supplier-assessment/my-assessment",
        headers=supplier_auth["headers"],
        timeout=30,
    )
    assert supplier_assessment.status_code == 200, supplier_assessment.text
    supplier_payload = supplier_assessment.json()
    assert isinstance(supplier_payload.get("relationship"), dict)
    assert isinstance(supplier_payload.get("assessment_modules"), list)
