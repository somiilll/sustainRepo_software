"""MIS Reports V1 full-flow regression: summary, exports, schedules, org scoping, and RBAC."""

import os
import uuid

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")

ADMIN_EMAIL = "goyalsomil2001@gmail.com"
NON_ADMIN_EMAIL = "goyalsomil+1@hotmail.com"
SUPPLIER_ADMIN_EMAIL = "goyalsomil+919@hotmail.com"
PASSWORD = "TestUser123!"


@pytest.fixture(scope="session")
def api_client():
    """Shared HTTP client for preview API validation."""
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL is not set")
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


def login_and_get_token(api_client, email: str) -> str:
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": PASSWORD},
        timeout=30,
    )
    assert response.status_code == 200
    payload = response.json()
    token = payload.get("token") or payload.get("access_token")
    assert isinstance(token, str) and len(token) > 20
    assert payload.get("user", {}).get("email") == email
    return token


@pytest.fixture(scope="session")
def admin_headers(api_client):
    return {"Authorization": f"Bearer {login_and_get_token(api_client, ADMIN_EMAIL)}"}


@pytest.fixture(scope="session")
def non_admin_headers(api_client):
    return {"Authorization": f"Bearer {login_and_get_token(api_client, NON_ADMIN_EMAIL)}"}


@pytest.fixture(scope="session")
def supplier_admin_headers(api_client):
    return {"Authorization": f"Bearer {login_and_get_token(api_client, SUPPLIER_ADMIN_EMAIL)}"}


@pytest.fixture(scope="session")
def schema(api_client, admin_headers):
    response = api_client.get(f"{BASE_URL}/api/mis-reports/filter-schema", headers=admin_headers, timeout=30)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data.get("facilities"), list)
    assert data.get("available_scopes") == ["scope1", "scope2", "scope3", "biogenic"]
    return data


def _payload(schema_data, scopes):
    facility_ids = [f["id"] for f in schema_data.get("facilities", [])]
    return {
        "reporting_period_start": "2025-01",
        "reporting_period_end": "2025-12",
        "facility_ids": facility_ids,
        "scopes": scopes,
        "categories": [],
    }


def test_admin_generate_emissions_summary_all_scopes_including_biogenic(api_client, admin_headers, schema):
    """Generate summary for full 2025 across all scopes and validate core output fields."""
    response = api_client.post(
        f"{BASE_URL}/api/mis-reports/emissions-summary",
        json=_payload(schema, ["scope1", "scope2", "scope3", "biogenic"]),
        headers=admin_headers,
        timeout=45,
    )
    assert response.status_code == 200
    data = response.json()

    assert data["filters"]["reporting_period_start"] == "2025-01"
    assert data["filters"]["reporting_period_end"] == "2025-12"
    assert "biogenic" in data["filters"]["scopes"]
    assert isinstance(data["record_count"], int) and data["record_count"] > 0
    assert isinstance(data["total_emissions"], (int, float)) and data["total_emissions"] > 0
    assert data["unit"] == "kg CO2e"
    assert isinstance(data.get("scope_breakdown"), list)
    assert any(row.get("scope") == "biogenic" for row in data["scope_breakdown"])


def test_scope_filter_changes_summary_results(api_client, admin_headers, schema):
    """Changing scopes should alter payload and resulting summary dimensions/counts."""
    all_response = api_client.post(
        f"{BASE_URL}/api/mis-reports/emissions-summary",
        json=_payload(schema, ["scope1", "scope2", "scope3", "biogenic"]),
        headers=admin_headers,
        timeout=45,
    )
    scope1_response = api_client.post(
        f"{BASE_URL}/api/mis-reports/emissions-summary",
        json=_payload(schema, ["scope1"]),
        headers=admin_headers,
        timeout=45,
    )

    assert all_response.status_code == 200
    assert scope1_response.status_code == 200
    all_data = all_response.json()
    scope1_data = scope1_response.json()

    assert scope1_data["filters"]["scopes"] == ["scope1"]
    assert all(row.get("scope") == "scope1" for row in scope1_data.get("scope_breakdown", []))
    assert scope1_data["record_count"] <= all_data["record_count"]
    assert scope1_data["total_emissions"] <= all_data["total_emissions"]


def test_report_generation_creates_history_entry(api_client, admin_headers, schema):
    """Generated summary run should be visible in report history."""
    response = api_client.post(
        f"{BASE_URL}/api/mis-reports/emissions-summary",
        json=_payload(schema, ["scope1", "scope2", "scope3", "biogenic"]),
        headers=admin_headers,
        timeout=45,
    )
    assert response.status_code == 200
    run_id = response.json()["run_id"]

    history = api_client.get(f"{BASE_URL}/api/mis-reports/history", headers=admin_headers, timeout=30)
    assert history.status_code == 200
    items = history.json().get("items", [])
    assert any(item.get("id") == run_id for item in items)


@pytest.mark.parametrize(
    "fmt,content_type",
    [
        ("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        ("pdf", "application/pdf"),
    ],
)
def test_export_endpoints_return_non_empty_file_with_valid_content_type(api_client, admin_headers, schema, fmt, content_type):
    """Export APIs should return download bytes with correct MIME type."""
    response = api_client.post(
        f"{BASE_URL}/api/mis-reports/emissions-summary/export/{fmt}",
        json=_payload(schema, ["scope1", "scope2", "scope3", "biogenic"]),
        headers=admin_headers,
        timeout=60,
    )
    assert response.status_code == 200
    assert response.headers.get("content-type", "").startswith(content_type)
    assert len(response.content) > 200


def test_create_disabled_schedule_appears_without_delivery(api_client, admin_headers, supplier_admin_headers, schema):
    """Create disabled schedule and verify it appears, with no delivery generated and org scoping respected."""
    unique_name = f"TEST_MIS_DISABLED_{uuid.uuid4().hex[:8]}"

    before_deliveries = api_client.get(f"{BASE_URL}/api/mis-reports/deliveries", headers=admin_headers, timeout=30)
    assert before_deliveries.status_code == 200
    before_delivery_count = len(before_deliveries.json())

    create_response = api_client.post(
        f"{BASE_URL}/api/mis-reports/schedules",
        json={
            "name": unique_name,
            "frequency": "monthly",
            "recipient_emails": ["goyalsomil+reports@hotmail.com"],
            "filters": _payload(schema, ["scope1", "scope2", "scope3", "biogenic"]),
            "is_enabled": False,
        },
        headers=admin_headers,
        timeout=45,
    )
    assert create_response.status_code == 200
    created = create_response.json()
    assert created["name"] == unique_name
    assert created["is_enabled"] is False
    assert created["next_run_at"] is None

    schedules_admin = api_client.get(f"{BASE_URL}/api/mis-reports/schedules", headers=admin_headers, timeout=30)
    assert schedules_admin.status_code == 200
    admin_schedule_ids = {item.get("id") for item in schedules_admin.json()}
    assert created["id"] in admin_schedule_ids

    schedules_supplier = api_client.get(f"{BASE_URL}/api/mis-reports/schedules", headers=supplier_admin_headers, timeout=30)
    assert schedules_supplier.status_code == 200
    supplier_schedule_ids = {item.get("id") for item in schedules_supplier.json()}
    assert created["id"] not in supplier_schedule_ids

    after_deliveries = api_client.get(f"{BASE_URL}/api/mis-reports/deliveries", headers=admin_headers, timeout=30)
    assert after_deliveries.status_code == 200
    after_list = after_deliveries.json()
    assert len(after_list) == before_delivery_count
    assert all(delivery.get("schedule_id") != created["id"] for delivery in after_list)

    cleanup = api_client.delete(
        f"{BASE_URL}/api/mis-reports/schedules/{created['id']}",
        headers=admin_headers,
        timeout=30,
    )
    assert cleanup.status_code == 200
    assert cleanup.json().get("success") is True


@pytest.mark.parametrize(
    "method,path",
    [
        ("post", "/api/mis-reports/emissions-summary"),
        ("post", "/api/mis-reports/emissions-summary/export/xlsx"),
        ("get", "/api/mis-reports/schedules"),
        ("post", "/api/mis-reports/schedules"),
        ("get", "/api/mis-reports/deliveries"),
    ],
)
def test_non_admin_cannot_access_generation_exports_schedules_or_deliveries(
    api_client,
    non_admin_headers,
    schema,
    method,
    path,
):
    """Non-admin users must be forbidden for MIS generation/export/schedule/delivery actions."""
    if path == "/api/mis-reports/schedules" and method == "post":
        payload = {
            "name": "TEST_DENIED",
            "frequency": "monthly",
            "recipient_emails": ["blocked@example.com"],
            "filters": _payload(schema, ["scope1"]),
            "is_enabled": False,
        }
    else:
        payload = _payload(schema, ["scope1"])

    url = f"{BASE_URL}{path}"
    response = (
        api_client.get(url, headers=non_admin_headers, timeout=30)
        if method == "get"
        else api_client.post(url, json=payload, headers=non_admin_headers, timeout=30)
    )

    assert response.status_code == 403
    assert "MIS Reports are only accessible to admins" in response.json().get("detail", "")
