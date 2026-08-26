"""Live + unit regressions for dashboard period filters, lifecycle eligibility, dedup, and KPI key matching."""

import os

import pytest
import requests

from modules.esg_targets.baseline_config import get_metric_mapping
from shared.utils.emission_records import (
    deduplicate_monthly_against_yearly,
    eligible_ghg_record_filter,
)


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASSWORD = "TestUser123!"


@pytest.fixture(scope="module")
def api_base_url() -> str:
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL is not configured")
    return BASE_URL.rstrip("/")


@pytest.fixture(scope="module")
def auth_headers(api_base_url: str) -> dict:
    # Auth module: verify admin login works for protected dashboard APIs.
    response = requests.post(
        f"{api_base_url}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert response.status_code == 200, f"Login failed: {response.status_code} {response.text}"
    payload = response.json()
    token = payload.get("token") or payload.get("access_token") or (payload.get("data") or {}).get("token")
    assert token, f"No bearer token in login response: {payload}"
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def test_dashboard_stats_accepts_complete_reporting_range_for_admin(api_base_url: str, auth_headers: dict):
    # Dashboard stats module: strict valid YYYY-MM..YYYY-MM range returns success.
    response = requests.get(
        f"{api_base_url}/api/dashboard/stats",
        params={"start_period": "2025-04", "end_period": "2026-03"},
        headers=auth_headers,
        timeout=40,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert "total_emissions" in data
    assert "emissions_by_facility" in data


def test_dashboard_stats_rejects_partial_reporting_range_with_422(api_base_url: str, auth_headers: dict):
    # Dashboard stats module: fail-closed behavior for partial range.
    response = requests.get(
        f"{api_base_url}/api/dashboard/stats",
        params={"start_period": "2025-04"},
        headers=auth_headers,
        timeout=30,
    )
    assert response.status_code == 422, response.text
    assert "provided together" in response.text


def test_dashboard_stats_rejects_malformed_reporting_range_with_422(api_base_url: str, auth_headers: dict):
    # Dashboard stats module: malformed periods are rejected, never broadened.
    response = requests.get(
        f"{api_base_url}/api/dashboard/stats",
        params={"start_period": "2025-4", "end_period": "2026-03"},
        headers=auth_headers,
        timeout=30,
    )
    assert response.status_code == 422, response.text
    assert "YYYY-MM" in response.text


def test_dashboard_stats_repeated_facility_id_params_are_accepted_and_respected(api_base_url: str, auth_headers: dict):
    # Dashboard + frontend integration: repeated facility_id params should be honored.
    facilities_response = requests.get(f"{api_base_url}/api/facilities", headers=auth_headers, timeout=30)
    assert facilities_response.status_code == 200, facilities_response.text
    facilities = facilities_response.json() or []
    if len(facilities) < 2:
        pytest.skip("Need at least two facilities for repeated facility_id param test")

    selected = [facilities[0]["id"], facilities[1]["id"]]
    response = requests.get(
        f"{api_base_url}/api/dashboard/stats",
        params=[
            ("start_period", "2025-04"),
            ("end_period", "2026-03"),
            ("facility_id", selected[0]),
            ("facility_id", selected[1]),
        ],
        headers=auth_headers,
        timeout=40,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    returned_ids = {entry.get("facility_id") for entry in data.get("emissions_by_facility", [])}
    assert returned_ids.issubset(set(selected))


def test_eligible_lifecycle_filter_is_canonical_and_excludes_ineligible_states():
    # Emission records utility: canonical lifecycle eligibility query is fail-closed.
    filt = eligible_ghg_record_filter()
    assert filt["is_deleted"] == {"$ne": True}
    assert filt["is_draft"] == {"$ne": True}
    assert filt["is_current_revision"] == {"$ne": False}
    assert set(filt["status"]["$nin"]) >= {"draft", "pending", "rejected", "deleted", "superseded"}


def test_dedup_prefers_fy_yearly_records_over_jan_mar_monthlies():
    # Emission records utility: FY yearly rows must supersede covered monthly Jan-Mar rows.
    records = [
        {
            "facility_id": "f1",
            "category": "stationary_combustion",
            "scope": "scope1",
            "reporting_period": "FY 2025-2026",
            "frequency_type": "yearly",
        },
        {
            "facility_id": "f1",
            "category": "stationary_combustion",
            "scope": "scope1",
            "reporting_period": "2026-01",
            "frequency_type": "monthly",
        },
        {
            "facility_id": "f1",
            "category": "stationary_combustion",
            "scope": "scope1",
            "reporting_period": "2026-03",
            "frequency_type": "monthly",
        },
    ]
    deduped = deduplicate_monthly_against_yearly(records)
    assert len(deduped) == 1
    assert deduped[0]["reporting_period"] == "FY 2025-2026"


def test_kpi_metric_mapping_allows_exact_or_normalized_keys_only():
    # ESG targets mapping: exact/normalized key lookup only, no substring fallback.
    assert get_metric_mapping("total_scope1_emissions") is not None
    assert get_metric_mapping("total-scope1-emissions") is not None
    assert get_metric_mapping("total_scope1_emissions_extra") is None
    assert get_metric_mapping("scope3_c1_and_more") is None
