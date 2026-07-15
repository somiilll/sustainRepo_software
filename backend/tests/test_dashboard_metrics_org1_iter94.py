"""Dashboard metrics regression tests for ORG1 executive ESG cards (iteration 94)."""

import os
import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
ORG1_EMAIL = "goyalsomil2001@gmail.com"
ORG1_PASSWORD = "TestUser123!"


@pytest.fixture(scope="module")
def api_base_url():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL is not set")
    return BASE_URL.rstrip("/")


@pytest.fixture(scope="module")
def auth_token(api_base_url):
    response = requests.post(
        f"{api_base_url}/api/auth/login",
        json={"email": ORG1_EMAIL, "password": ORG1_PASSWORD},
        timeout=30,
    )
    assert response.status_code == 200, f"Login failed: {response.status_code} {response.text}"
    data = response.json()
    assert isinstance(data.get("access_token"), str) and data["access_token"]
    return data["access_token"]


def test_dashboard_metrics_org1_water_recycled_numeric(auth_token, api_base_url):
    """Validate dashboard-metrics includes numeric water.recycled for selected reporting range."""
    response = requests.get(
        f"{api_base_url}/api/esg-records/dashboard-metrics",
        headers={"Authorization": f"Bearer {auth_token}"},
        params={"start_date": "2025-04", "end_date": "2026-03"},
        timeout=30,
    )

    assert response.status_code == 200, f"dashboard-metrics failed: {response.status_code} {response.text}"
    payload = response.json()

    assert isinstance(payload, dict)
    assert isinstance(payload.get("water"), dict), f"Missing water object: {payload}"
    assert "recycled" in payload["water"], f"Missing water.recycled: {payload['water']}"
    assert isinstance(payload["water"]["recycled"], (int, float)), (
        f"water.recycled should be numeric, got {type(payload['water']['recycled'])}"
    )
