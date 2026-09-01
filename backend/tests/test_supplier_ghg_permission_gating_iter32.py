"""
# Module: Supplier assessment GHG permission gating (config visibility + API enforcement)
# Feature: Supplier cannot use Process/Flaring/Custom Fuel when parent program disallows them
"""

import os
import uuid

import pytest
import requests


def _base_url() -> str:
    base = os.environ.get("REACT_APP_BACKEND_URL")
    if not base:
        pytest.skip("REACT_APP_BACKEND_URL is required for live tests")
    return base.rstrip("/")


def _login(email: str, password: str) -> dict:
    response = requests.post(
        f"{_base_url()}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    token = payload.get("access_token") or payload.get("token")
    assert isinstance(token, str) and token.strip(), payload
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


@pytest.fixture(scope="session")
def supplier_headers() -> dict:
    return _login("goyalsomil+919@hotmail.com", "TestUser123!")


@pytest.fixture(scope="session")
def admin_headers() -> dict:
    return _login("goyalsomil2001@gmail.com", "TestUser123!")


@pytest.fixture(scope="session")
def supplier_config(supplier_headers) -> dict:
    response = requests.get(
        f"{_base_url()}/api/supplier-assessment/my-assessment/emissions/config",
        headers=supplier_headers,
        timeout=30,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert isinstance(payload, dict)
    return payload


def _supplier_create_payload(config: dict, *, category: str, is_custom_fuel: bool = False) -> dict:
    enabled_scopes = config.get("enabled_scopes") or []
    assert enabled_scopes, "Supplier has no enabled scopes"
    scope = "scope1" if "scope1" in enabled_scopes else enabled_scopes[0]
    allowed_months = config.get("allowed_months") or []
    reporting_period = allowed_months[0] if allowed_months else config.get("reporting_period")
    assert reporting_period, "Missing supplier reporting period"
    return {
        "reporting_period": reporting_period,
        "frequency_type": "monthly",
        "scope": scope,
        "category": category,
        "is_custom_fuel": is_custom_fuel,
    }


# Supplier config response contract checks
def test_supplier_config_returns_disabled_permissions_and_allowed_categories_only(supplier_config):
    permissions = supplier_config.get("permissions") or {}
    assert permissions.get("allow_custom_fuels") is False
    assert permissions.get("allow_process_emissions") is False
    assert permissions.get("allow_flaring") is False

    enabled_scopes = supplier_config.get("enabled_scopes") or []
    categories = supplier_config.get("categories") or {}
    assert set(categories.keys()).issubset(set(enabled_scopes))

    flattened_labels = [
        f"{(item or {}).get('label', '')} {(item or {}).get('value', '')}".lower()
        for scope_categories in categories.values()
        for item in (scope_categories or [])
    ]
    assert all("process" not in label for label in flattened_labels)
    assert all("flaring" not in label for label in flattened_labels)


# Supplier create endpoint guard checks
def test_supplier_api_rejects_process_emissions_when_permission_is_false(supplier_headers, supplier_config):
    response = requests.post(
        f"{_base_url()}/api/supplier-assessment/my-assessment/emissions",
        headers=supplier_headers,
        json=_supplier_create_payload(supplier_config, category="Process Emissions"),
        timeout=30,
    )
    assert response.status_code in (400, 403), response.text
    detail = str(response.json().get("detail", "")).lower()
    assert ("process" in detail) or ("not configured" in detail) or ("not permitted" in detail)


def test_supplier_api_rejects_flaring_when_permission_is_false(supplier_headers, supplier_config):
    response = requests.post(
        f"{_base_url()}/api/supplier-assessment/my-assessment/emissions",
        headers=supplier_headers,
        json=_supplier_create_payload(supplier_config, category="Flaring"),
        timeout=30,
    )
    assert response.status_code in (400, 403), response.text
    detail = str(response.json().get("detail", "")).lower()
    assert ("flaring" in detail) or ("not configured" in detail) or ("not permitted" in detail)


def test_supplier_api_rejects_custom_fuel_when_permission_is_false(supplier_headers, supplier_config):
    categories = supplier_config.get("categories") or {}
    enabled_scopes = supplier_config.get("enabled_scopes") or []
    scope = "scope1" if "scope1" in enabled_scopes else enabled_scopes[0]
    scope_categories = categories.get(scope) or []
    if not scope_categories:
        pytest.skip("No supplier categories available for custom-fuel rejection test")
    allowed_category = (scope_categories[0] or {}).get("value") or (scope_categories[0] or {}).get("label")
    assert allowed_category

    response = requests.post(
        f"{_base_url()}/api/supplier-assessment/my-assessment/emissions",
        headers=supplier_headers,
        json=_supplier_create_payload(
            supplier_config,
            category=allowed_category,
            is_custom_fuel=True,
        ),
        timeout=30,
    )
    assert response.status_code in (400, 403), response.text
    detail = str(response.json().get("detail", "")).lower()
    assert ("custom" in detail) or ("not permitted" in detail)


def test_supplier_generic_emissions_api_rejects_custom_fuel_direct_post(supplier_headers, supplier_config):
    facilities_response = requests.get(
        f"{_base_url()}/api/facilities",
        headers=supplier_headers,
        timeout=30,
    )
    assert facilities_response.status_code == 200, facilities_response.text
    facilities = facilities_response.json() or []
    if not facilities:
        pytest.skip("No supplier facilities available for generic emissions API test")

    category = "Stationary Combustion"
    response = requests.post(
        f"{_base_url()}/api/emissions",
        headers=supplier_headers,
        json={
            "facility_id": facilities[0]["id"],
            "reporting_period": (_supplier_create_payload(supplier_config, category=category).get("reporting_period")),
            "frequency_type": "monthly",
            "scope": "scope1",
            "category": category,
            "sub_category": "Natural Gas",
            "is_custom_fuel": True,
            "dynamic_field_values": {},
            "outputs": {},
        },
        timeout=30,
    )
    assert response.status_code in (400, 403), response.text
    detail = str(response.json().get("detail", "")).lower()
    assert ("custom" in detail) or ("access" in detail) or ("assigned" in detail) or ("invalid" in detail)


# Parent/admin control-path checks (supplier restrictions should not leak)
def test_admin_category_catalog_not_reduced_to_supplier_program_subset(admin_headers, supplier_config):
    response = requests.get(
        f"{_base_url()}/api/categories",
        headers=admin_headers,
        timeout=30,
    )
    assert response.status_code == 200, response.text
    categories = response.json() or []
    assert categories

    supplier_scope1_count = len((supplier_config.get("categories") or {}).get("scope1") or [])
    admin_scope1 = [row for row in categories if row.get("scope_code") == "scope1"]
    assert len(admin_scope1) >= supplier_scope1_count


# Auth integration checks requested in playbook instructions
def test_auth_login_sets_http_only_cookie_and_explicit_cors_header():
    trusted_origin = _base_url()
    login_response = requests.post(
        f"{_base_url()}/api/auth/login",
        json={"email": "goyalsomil2001@gmail.com", "password": "TestUser123!"},
        headers={"Origin": trusted_origin},
        timeout=30,
    )
    assert login_response.status_code == 200, login_response.text

    set_cookie = login_response.headers.get("set-cookie", "")
    assert "HttpOnly" in set_cookie

    options_response = requests.options(
        f"{_base_url()}/api/auth/login",
        headers={
            "Origin": trusted_origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
        timeout=30,
    )
    assert options_response.status_code in (200, 204)
    assert options_response.headers.get("access-control-allow-origin") == trusted_origin
    assert options_response.headers.get("access-control-allow-credentials") == "true"


def test_auth_cors_rejects_untrusted_origin():
    options_response = requests.options(
        f"{_base_url()}/api/auth/login",
        headers={
            "Origin": "https://evil.example.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
        timeout=30,
    )
    assert options_response.status_code in (200, 204, 400, 403)
    assert options_response.headers.get("access-control-allow-origin") != "https://evil.example.com"


def test_zzz_auth_brute_force_lockout_after_five_invalid_attempts():
    random_email = f"lockout-{uuid.uuid4().hex[:12]}@example.com"
    statuses = []
    for _ in range(6):
        response = requests.post(
            f"{_base_url()}/api/auth/login",
            json={"email": random_email, "password": "WrongPassword123!"},
            timeout=30,
        )
        statuses.append(response.status_code)
    assert statuses[-1] == 429, f"Expected lockout on final attempt, got status sequence: {statuses}"
