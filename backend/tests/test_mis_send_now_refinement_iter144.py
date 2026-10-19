"""MIS Reports send-now refinement regression checks (live API)."""

import os

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASSWORD = "TestUser123!"


@pytest.fixture(scope="session")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session")
def auth_token(api_client):
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL is not available")

    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data.get("access_token"), str) and data["access_token"]
    assert data.get("user", {}).get("email") == ADMIN_EMAIL
    return data["access_token"]


@pytest.fixture(scope="session")
def monthly_schedule(api_client, auth_token):
    response = api_client.get(
        f"{BASE_URL}/api/mis-reports/schedules",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=30,
    )
    assert response.status_code == 200
    schedules = response.json()
    assert isinstance(schedules, list)

    target = next(
        (
            schedule
            for schedule in schedules
            if schedule.get("frequency") == "monthly"
            and "monthly esg reports" in (schedule.get("name") or "").lower()
        ),
        None,
    )
    if not target:
        pytest.skip("Monthly ESG reports schedule was not found")

    assert isinstance(target.get("id"), str) and target["id"]
    return target


# Module: MIS Reports schedule period resolution preview endpoint
def test_monthly_schedule_resolved_period_matches_aug_2026(
    api_client, auth_token, monthly_schedule
):
    schedule_id = monthly_schedule["id"]
    response = api_client.get(
        f"{BASE_URL}/api/mis-reports/schedules/{schedule_id}/resolved-period",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=30,
    )

    assert response.status_code == 200
    data = response.json()

    assert data.get("frequency") == "monthly"
    assert data.get("reporting_period", {}).get("start_date") == "2026-08-01"
    assert data.get("comparison_period", {}).get("start_date") == "2026-07-01"
    assert data.get("ytd_period", {}).get("start_date") == "2026-04-01"
