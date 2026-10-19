"""Authenticated live contracts for the main Internal Data AI question categories."""
import json
import os
import re
import uuid

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
CHAT_TIMEOUT_SECONDS = 180


@pytest.fixture(scope="module")
def authed_session():
    if not BASE_URL:
        pytest.fail("Missing REACT_APP_BACKEND_URL (frontend/.env)")
    if not TEST_EMAIL or not TEST_PASSWORD:
        pytest.skip("Set INTERNAL_AI_TEST_EMAIL and INTERNAL_AI_TEST_PASSWORD to run authenticated live tests")

    session = requests.Session()
    login_response = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        timeout=45,
    )
    if login_response.status_code == 429:
        pytest.fail(f"BLOCKER: /api/auth/login returned 429. Body: {login_response.text[:300]}")
    assert login_response.status_code == 200, login_response.text[:500]
    token = (login_response.json().get("access_token") or login_response.json().get("token"))
    assert token, f"No token found in login response: {login_response.json()}"
    session.headers.update({"Authorization": f"Bearer {token}"})
    return session


def _ask(session: requests.Session, message: str) -> dict:
    response = session.post(
        f"{BASE_URL}/api/internal-ai/chat",
        json={"message": message, "session_id": f"internal-ai-live-{uuid.uuid4()}"},
        timeout=CHAT_TIMEOUT_SECONDS,
    )
    assert response.status_code == 200, response.text[:700]
    payload = response.json()
    assert isinstance(payload.get("answer"), str) and payload["answer"].strip(), payload
    assert payload.get("session_id"), payload
    return payload


def _assert_no_internal_identifiers(payload: dict) -> None:
    rendered = (payload.get("answer") or "").lower()
    raw_data = payload.get("raw_data")
    raw_text = json.dumps(raw_data, ensure_ascii=False).lower() if raw_data is not None else ""
    for forbidden in ("formula_id", "record_id", "ce_formula_versions", "internal_id", "_id"):
        assert forbidden not in rendered, f"Forbidden identifier leaked in answer: {forbidden}"
        assert forbidden not in raw_text, f"Forbidden identifier leaked in raw data: {forbidden}"
    assert re.search(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", rendered) is None


def test_live_single_metric_question_returns_a_period_bound_emissions_answer(authed_session):
    payload = _ask(authed_session, "What were Scope 1 emissions in August 2026?")

    assert payload.get("query_type") == "emission_lookup"
    assert "august 2026" in payload["answer"].lower()
    _assert_no_internal_identifiers(payload)


def test_live_year_over_year_question_uses_explicit_comparison_periods(authed_session):
    payload = _ask(authed_session, "Compare Scope 1 emissions in August 2026 vs August 2025")

    assert payload.get("query_type") == "emission_lookup"
    answer = payload["answer"].lower()
    assert "august 2026" in answer and "august 2025" in answer
    assert "annual_value_allocated_to_month" not in answer
    _assert_no_internal_identifiers(payload)


def test_live_scope_breakdown_question_preserves_scope_and_emissions_contract(authed_session):
    payload = _ask(authed_session, "Show Scope 1 emissions by category")

    assert payload.get("query_type") == "emission_lookup"
    assert "scope 1" in payload["answer"].lower()
    assert "tco2e" in payload["answer"].lower()
    _assert_no_internal_identifiers(payload)