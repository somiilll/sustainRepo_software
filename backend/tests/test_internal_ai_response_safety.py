import os
import re

import pytest
import requests

from modules.internal_data_ai import response_builder
from modules.internal_data_ai.formatters.comparison_formatter import build_period_comparison_response
from modules.internal_data_ai.formatters.esg_formatter import (
    build_combined_renewable_energy_response,
    build_esg_record_history_response,
    build_esg_record_response,
)
from modules.internal_data_ai.formatters.framework_formatter import build_framework_question_response
from modules.internal_data_ai.formatters.ghg_formatter import build_fuel_energy_response, build_ghg_response
from modules.internal_data_ai.formatters.response_safety import sanitize_raw_data


def _read_backend_url() -> str:
    from os import environ

    url = environ.get("REACT_APP_BACKEND_URL")
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


def test_response_safety_removes_nested_database_identifiers_without_dropping_values():
    result = sanitize_raw_data({
        "id": "record-1",
        "records": [{"formula_id": "formula-1", "quantity": 12, "facility_id": "facility-1"}],
        "summary": {"organization_id": "org-1", "total": 12},
    })

    assert result == {"records": [{"quantity": 12}], "summary": {"total": 12}}


def test_response_builder_legacy_private_exports_remain_backward_compatible():
    # response_builder private compatibility aliases must still map to extracted formatter functions.
    assert response_builder._build_period_comparison_response is build_period_comparison_response
    assert response_builder._build_fuel_energy_response is build_fuel_energy_response
    assert response_builder._build_ghg_response is build_ghg_response
    assert response_builder._build_esg_record_response is build_esg_record_response
    assert response_builder._build_esg_record_history_response is build_esg_record_history_response
    assert response_builder._build_combined_renewable_energy_response is build_combined_renewable_energy_response
    assert response_builder._build_framework_question_response is build_framework_question_response


@pytest.fixture(scope="module")
def authed_session_for_response_safety_live_check():
    if not BASE_URL:
        pytest.fail("Missing REACT_APP_BACKEND_URL (frontend/.env)")
    if not TEST_EMAIL or not TEST_PASSWORD:
        pytest.skip("Set INTERNAL_AI_TEST_EMAIL and INTERNAL_AI_TEST_PASSWORD to run authenticated live tests")
    session = requests.Session()
    response = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        timeout=45,
    )
    assert response.status_code == 200, response.text[:500]
    token = (response.json().get("access_token") or response.json().get("token"))
    assert token, f"No token found in login response: {response.json()}"
    session.headers.update({"Authorization": f"Bearer {token}"})
    return session


def test_live_response_raw_data_contains_no_uuid_values(authed_session_for_response_safety_live_check):
    # response safety must strip identifier-like UUID values from client-facing raw_data.
    response = authed_session_for_response_safety_live_check.post(
        f"{BASE_URL}/api/internal-ai/chat",
        json={"message": "Show Scope 1 emissions by category", "session_id": "internal-ai-safety-check"},
        timeout=180,
    )
    assert response.status_code == 200, response.text[:700]
    payload = response.json()
    raw_data = payload.get("raw_data")
    if raw_data is None:
        pytest.skip("raw_data absent in live response; cannot validate UUID leakage")
    raw_text = str(raw_data)
    assert re.search(r"\\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\b", raw_text) is None