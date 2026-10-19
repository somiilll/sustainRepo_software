"""# Module: Internal Data AI live FY all-month comparison validation (iter181)
# Features: authenticated /api/internal-ai/chat for exact approved wording, 12 fiscal months, tCO2e table, variance, and strict-month response guards
"""

import os

import pytest
import requests


def _read_backend_url() -> str:
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        with open("/app/frontend/.env", encoding="utf-8") as handle:
            for line in handle:
                if line.strip().startswith("REACT_APP_BACKEND_URL="):
                    url = line.split("=", 1)[1].strip()
                    break
    return (url or "").rstrip("/")


BASE_URL = _read_backend_url()
TEST_EMAIL = os.environ.get("INTERNAL_AI_TEST_EMAIL")
TEST_PASSWORD = os.environ.get("INTERNAL_AI_TEST_PASSWORD")
APPROVED_PROMPT = "Compare Scope 1 emissions of all months of FY 2026-2027"


def _auth_token() -> str:
    if not BASE_URL:
        pytest.fail("Missing REACT_APP_BACKEND_URL (frontend/.env)")
    if not TEST_EMAIL or not TEST_PASSWORD:
        pytest.skip("Set INTERNAL_AI_TEST_EMAIL and INTERNAL_AI_TEST_PASSWORD to run authenticated live tests")

    login_resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        timeout=45,
    )
    if login_resp.status_code == 429:
        pytest.fail(f"BLOCKER: /api/auth/login returned 429 (rate limited). Body: {login_resp.text[:300]}")
    assert login_resp.status_code == 200, f"Login failed: {login_resp.status_code} {login_resp.text[:500]}"

    payload = login_resp.json()
    token = payload.get("access_token") or payload.get("token")
    assert token, f"No token found in login payload keys={list(payload.keys())}"
    return token


def test_live_scope1_all_months_fy_2026_2027_contract():
    token = _auth_token()
    resp = requests.post(
        f"{BASE_URL}/api/internal-ai/chat",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": APPROVED_PROMPT},
        timeout=180,
    )
    assert resp.status_code == 200, f"Chat call failed: {resp.status_code} {resp.text[:700]}"

    payload = resp.json()
    assert payload.get("query_type") == "emission_lookup"
    answer = payload.get("answer") or ""

    expected_months = [
        "April 2026", "May 2026", "June 2026", "July 2026", "August 2026", "September 2026",
        "October 2026", "November 2026", "December 2026", "January 2027", "February 2027", "March 2027",
    ]

    # Ensure all fiscal months are present and in order in the rendered comparison.
    month_positions = [answer.find(month) for month in expected_months]
    assert all(position >= 0 for position in month_positions), f"Missing month columns in answer: {month_positions}"
    assert month_positions == sorted(month_positions), "Months are not rendered in April→March fiscal order"

    assert "| Category | Unit |" in answer
    assert "| Total | tCO2e |" in answer
    assert "variance (april 2026 − may 2026)" in answer.lower()
    assert "variance %" in answer.lower()
    assert "unit not stored" not in answer.lower()

    # Strict-month comparison should not drift to annual-allocation wording.
    lowered = answer.lower()
    assert "annual_value_allocated_to_month" not in lowered
    assert "allocated at" not in lowered

    chart = payload.get("chart")
    if chart is not None:
        data = chart.get("data") or []
        names = [item.get("name") for item in data]
        assert names == expected_months
        assert len(data) == 12
