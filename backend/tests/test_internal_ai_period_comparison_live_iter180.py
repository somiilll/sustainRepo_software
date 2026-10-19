"""# Module: Internal Data AI live period comparison coverage (iter180)
# Features: authenticated /api/internal-ai/chat two- and three-month comparison contracts, table columns, tCO2e standard, chart points, and privacy guard
"""

import json
import os
import re

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


def _chat(token: str, message: str) -> dict:
    chat_resp = requests.post(
        f"{BASE_URL}/api/internal-ai/chat",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": message},
        timeout=180,
    )
    assert chat_resp.status_code == 200, f"Chat call failed: {chat_resp.status_code} {chat_resp.text[:700]}"
    return chat_resp.json()


def _assert_no_identifier_leak(payload: dict):
    answer = payload.get("answer") or ""
    lowered_answer = answer.lower()
    for forbidden in ["formula_id", "record_id", "ce_formula_versions", "internal_id", "_id"]:
        assert forbidden not in lowered_answer, f"Forbidden term leaked in answer: {forbidden}"

    raw_data = payload.get("raw_data")
    if raw_data is not None:
        raw_text = json.dumps(raw_data, ensure_ascii=False).lower()
        forbidden_terms = ["formula_id", "record_id", "ce_formula_versions", "internal_id", "_id"]
        for term in forbidden_terms:
            assert term not in raw_text, f"Forbidden identifier leaked in raw_data: {term}"
        assert re.search(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", raw_text) is None


def test_live_scope1_july_vs_june_2026_two_month_compatibility_contract():
    token = _auth_token()
    payload = _chat(token, "Scope 1 emissions in July vs June 2026")

    assert payload.get("query_type") == "emission_lookup"
    answer = payload.get("answer") or ""
    assert "| Category | Unit | July 2026 | June 2026 |" in answer
    assert "| Variance (July 2026 − June 2026) |" in answer
    assert "| Variance % |" in answer
    assert "| Total | tCO2e |" in answer
    assert "unit not stored" not in answer.lower()

    _assert_no_identifier_leak(payload)


def test_live_scope1_july_vs_june_vs_may_2026_three_month_comparison_contract():
    token = _auth_token()
    payload = _chat(token, "Scope 1 emissions in July vs June vs May 2026")

    assert payload.get("query_type") == "emission_lookup"
    answer = payload.get("answer") or ""

    # Exact-month table coverage for all three periods
    assert "| Category | Unit | July 2026 | June 2026 | May 2026 |" in answer
    assert "| Total | tCO2e |" in answer
    assert "Variance (July 2026 − June 2026)" in answer
    assert "Variance (July 2026 − May 2026)" in answer
    assert "variance % (july 2026 vs june 2026)" in answer.lower()
    assert "variance % (july 2026 vs may 2026)" in answer.lower()
    assert "unit not stored" not in answer.lower()

    # Ensure all named months are represented and no FY/allocation drift appears in rendered answer
    lowered = answer.lower()
    assert "july 2026" in lowered and "june 2026" in lowered and "may 2026" in lowered
    assert "annual_value_allocated_to_month" not in lowered
    assert "allocated at" not in lowered
    assert re.search(r"\bfy\s*20\d{2}\b", lowered) is None

    # Chart should provide one point per compared period when chart exists.
    chart = payload.get("chart")
    if chart is not None:
        data = chart.get("data") or []
        names = [item.get("name") for item in data]
        assert names == ["July 2026", "June 2026", "May 2026"]
        assert len(data) == 3

    _assert_no_identifier_leak(payload)
