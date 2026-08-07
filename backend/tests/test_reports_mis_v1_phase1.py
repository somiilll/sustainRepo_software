"""MIS Reports V1 Phase-1 API regression tests (catalog/filter-schema/history + permissions)."""

import os

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")

ADMIN_EMAIL = "goyalsomil2001@gmail.com"
SUPPLIER_ADMIN_EMAIL = "goyalsomil+919@hotmail.com"
USER_EMAIL = "goyalsomil+1@hotmail.com"
PASSWORD = "TestUser123!"


@pytest.fixture(scope="session")
def api_client():
    """Shared HTTP client for external preview API checks."""
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL is not set")

    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


def login_and_get_token(api_client, email: str, password: str) -> str:
    """Authenticate test user and return bearer token."""
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert response.status_code == 200
    payload = response.json()
    token = payload.get("token") or payload.get("access_token")
    assert token
    assert payload.get("user", {}).get("email") == email
    return token


def test_mis_reports_catalog_admin_permission_aware(api_client):
    """Catalog endpoint returns six templates and ready entries for admin."""
    token = login_and_get_token(api_client, ADMIN_EMAIL, PASSWORD)
    response = api_client.get(
        f"{BASE_URL}/api/mis-reports/catalog",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["can_generate_reports"] is True
    assert isinstance(data.get("templates"), list)
    assert len(data["templates"]) == 6

    template_map = {template["id"]: template for template in data["templates"]}
    assert "ghg_inventory" in template_map
    assert "ai_executive_summary" in template_map
    assert template_map["ghg_inventory"]["status"] == "ready"
    assert template_map["ghg_inventory"]["action_label"] == "Configure report"
    assert template_map["ai_executive_summary"]["status"] == "ready"
    assert template_map["ai_executive_summary"]["action_label"] == "Configure report"


def test_mis_reports_filter_schema_admin_active_facilities(api_client):
    """Filter schema returns active facility metadata and standard scope filters for admin."""
    token = login_and_get_token(api_client, ADMIN_EMAIL, PASSWORD)
    response = api_client.get(
        f"{BASE_URL}/api/mis-reports/filter-schema",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["reporting_period_format"] == "YYYY-MM"
    assert data["supports_financial_year"] is True
    assert data["supports_calendar_year"] is True
    assert isinstance(data.get("facilities"), list)
    assert len(data["facilities"]) > 0

    first_facility = data["facilities"][0]
    assert isinstance(first_facility.get("id"), str)
    assert isinstance(first_facility.get("name"), str)
    assert data.get("available_scopes") == ["scope1", "scope2", "scope3", "biogenic"]


def test_mis_reports_history_admin_valid_org_response(api_client):
    """History endpoint returns valid organization-scoped structure for admin."""
    token = login_and_get_token(api_client, ADMIN_EMAIL, PASSWORD)
    response = api_client.get(
        f"{BASE_URL}/api/mis-reports/history",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )

    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert isinstance(data["items"], list)

    if data["items"]:
        first_item = data["items"][0]
        assert isinstance(first_item.get("id"), str)
        assert isinstance(first_item.get("template_id"), str)
        assert isinstance(first_item.get("template_name"), str)


def test_mis_reports_catalog_non_admin_permission_restriction(api_client):
    """Catalog is visible to user, but report generation actions are disabled for non-admin."""
    token = login_and_get_token(api_client, USER_EMAIL, PASSWORD)
    response = api_client.get(
        f"{BASE_URL}/api/mis-reports/catalog",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["can_generate_reports"] is False
    assert isinstance(data.get("templates"), list)
    assert len(data["templates"]) == 6
    assert all(template["available"] is False for template in data["templates"])
    assert all(template.get("action_label") is None for template in data["templates"])


def test_mis_reports_filter_and_history_reject_non_admin(api_client):
    """Filter schema and history endpoints reject non-admin access."""
    token = login_and_get_token(api_client, USER_EMAIL, PASSWORD)
    headers = {"Authorization": f"Bearer {token}"}

    filter_response = api_client.get(f"{BASE_URL}/api/mis-reports/filter-schema", headers=headers, timeout=30)
    history_response = api_client.get(f"{BASE_URL}/api/mis-reports/history", headers=headers, timeout=30)

    assert filter_response.status_code == 403
    assert "MIS Reports are only accessible to admins" in filter_response.json().get("detail", "")
    assert history_response.status_code == 403
    assert "MIS Reports are only accessible to admins" in history_response.json().get("detail", "")


def test_mis_reports_filter_schema_matches_supplier_org_facilities(api_client):
    """Supplier admin sees filter facilities scoped to its own organization."""
    token = login_and_get_token(api_client, SUPPLIER_ADMIN_EMAIL, PASSWORD)
    headers = {"Authorization": f"Bearer {token}"}

    filter_response = api_client.get(f"{BASE_URL}/api/mis-reports/filter-schema", headers=headers, timeout=30)
    facilities_response = api_client.get(f"{BASE_URL}/api/facilities", headers=headers, timeout=30)

    assert filter_response.status_code == 200
    assert facilities_response.status_code == 200

    filter_data = filter_response.json()
    facilities_data = facilities_response.json()

    filter_ids = {facility["id"] for facility in filter_data.get("facilities", [])}
    active_facility_ids = {facility["id"] for facility in facilities_data if facility.get("is_active") is not False}

    assert len(filter_ids) > 0
    assert filter_ids == active_facility_ids
