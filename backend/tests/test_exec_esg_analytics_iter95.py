"""Executive ESG analytics API regression tests (iteration 95)."""

import os

import pytest
import requests


# Auth + analytics coverage for executive ESG dashboard backend integration
ORG1_EMAIL = "goyalsomil2001@gmail.com"
ORG1_PASSWORD = "TestUser123!"


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
    payload = response.json()
    token = payload.get("access_token")
    assert isinstance(token, str) and token
    return token


def test_esg_analytics_endpoint_shape(auth_token, api_base_url):
    response = requests.get(
        f"{api_base_url}/api/dashboard/esg-analytics",
        headers={"Authorization": f"Bearer {auth_token}"},
        params={"start_date": "2025-04", "end_date": "2026-03"},
        timeout=30,
    )

    assert response.status_code == 200, f"esg-analytics failed: {response.status_code} {response.text}"
    payload = response.json()

    expected_series = [
        "emissions",
        "energy",
        "water",
        "waste",
        "workforce",
        "safety",
        "finance",
        "breaches",
        "governance",
    ]
    for key in expected_series:
        assert key in payload, f"Missing key: {key}"

    for key in ["emissions", "energy", "water", "waste", "workforce", "safety", "finance", "breaches"]:
        assert isinstance(payload[key], list), f"{key} should be a list"

    assert isinstance(payload["governance"], dict), "governance should be an object"
