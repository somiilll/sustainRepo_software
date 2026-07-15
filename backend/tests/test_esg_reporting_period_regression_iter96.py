"""Regression tests for ESG reporting period rendering/validation fixes (iteration 96)."""

import os

import pytest
import requests


# Auth + environment ESG record validations for ORG1 admin regression checks
ORG1_EMAIL = "goyalsomil2001@gmail.com"
ORG1_PASSWORD = "TestUser123!"
TARGET_RECORD_ID = "e00d324d-a335-4aa6-bca8-b60a0871fbff"


@pytest.fixture(scope="module")
def api_base_url():
    base = os.environ.get("REACT_APP_BACKEND_URL")
    if not base:
        pytest.skip("REACT_APP_BACKEND_URL is not set")
    return base.rstrip("/")


@pytest.fixture(scope="module")
def auth_token(api_base_url):
    response = requests.post(
        f"{api_base_url}/api/auth/login",
        json={"email": ORG1_EMAIL, "password": ORG1_PASSWORD},
        timeout=30,
    )
    assert response.status_code == 200, f"Login failed: {response.status_code} {response.text}"
    data = response.json()
    token = data.get("access_token")
    assert isinstance(token, str) and token, "Missing access_token in login response"
    return token


def test_environment_records_contains_target_month_year(auth_token, api_base_url):
    """Validate target Waste/Disposal record has nested reporting_period June 2026."""
    response = requests.get(
        f"{api_base_url}/api/esg-records/records/environment",
        headers={"Authorization": f"Bearer {auth_token}"},
        params={"category": "Waste", "limit": 100},
        timeout=30,
    )
    assert response.status_code == 200, f"GET records failed: {response.status_code} {response.text}"

    payload = response.json()
    records = payload.get("records", [])
    assert isinstance(records, list), "records must be a list"

    target = next((r for r in records if r.get("id") == TARGET_RECORD_ID), None)
    assert target is not None, f"Target record {TARGET_RECORD_ID} not found in Waste records"

    reporting_period = target.get("reporting_period") or {}
    assert reporting_period.get("month") == "June"
    assert reporting_period.get("year") == 2026


def test_monthly_final_record_requires_month(auth_token, api_base_url):
    """Negative validation: final monthly submission with blank month should return 422."""
    payload = {
        "record_level": "organization",
        "facility_id": None,
        "category_id": "test-monthly-validation-cat-id",
        "category": "Waste",
        "subcategory": "Disposal",
        "frameworks": ["BRSR"],
        "reporting_period": {
            "reporting_type": "monthly",
            "year": 2026,
            "month": "",
        },
        "field_values": {"quantity": 1, "unit": "kg"},
        "source_of_information": "pytest-validation",
        "notes": "Should fail with 422",
        "status": "completed",
    }

    response = requests.post(
        f"{api_base_url}/api/esg-records/records/environment",
        headers={"Authorization": f"Bearer {auth_token}"},
        json=payload,
        timeout=30,
    )

    assert response.status_code == 422, (
        f"Expected 422 for blank monthly month, got {response.status_code}: {response.text}"
    )
    detail = response.json().get("detail")
    assert detail is not None
