"""# Module: Internal Data AI live period-comparison verification
# Features: authenticated /api/internal-ai/chat monthly comparison contract, table shape, privacy and annual-allocation guard
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


def test_live_scope1_july_vs_june_2026_period_comparison_contract():
    if not BASE_URL:
        pytest.fail("Missing REACT_APP_BACKEND_URL (frontend/.env)")
    if not TEST_EMAIL or not TEST_PASSWORD:
        pytest.skip("Set INTERNAL_AI_TEST_EMAIL and INTERNAL_AI_TEST_PASSWORD to run the authenticated live contract test")

    login_resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        timeout=45,
    )
    if login_resp.status_code == 429:
        pytest.fail(f"BLOCKER: /api/auth/login returned 429 (rate limited). Body: {login_resp.text[:300]}")
    assert login_resp.status_code == 200, f"Login failed: {login_resp.status_code} {login_resp.text[:500]}"

    token = (login_resp.json().get("access_token") or login_resp.json().get("token"))
    assert token, f"No token found in login payload keys={list(login_resp.json().keys())}"

    chat_resp = requests.post(
        f"{BASE_URL}/api/internal-ai/chat",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": "Scope 1 in July vs June 2026"},
        timeout=180,
    )
    assert chat_resp.status_code == 200, f"Chat call failed: {chat_resp.status_code} {chat_resp.text[:700]}"

    payload = chat_resp.json()
    assert payload.get("query_type") == "emission_lookup"

    answer = payload.get("answer") or ""
    assert "| Category | Unit | July 2026 | June 2026 |" in answer
    assert "| Variance (July 2026 − June 2026) |" in answer
    assert "| Variance % |" in answer
    assert "| Total |" in answer
    assert "July 2026" in answer and "June 2026" in answer

    table_rows = [line for line in answer.splitlines() if line.strip().startswith("|")]
    assert len(table_rows) >= 4, "Expected markdown table with header, divider, total row, and category rows"

    # Comparison should remain exact-month based, not annual/FY-allocation phrasing.
    lowered = answer.lower()
    assert "annual_value_allocated_to_month" not in lowered
    assert "allocated at" not in lowered
    assert re.search(r"\bfy\s*20\d{2}\b", lowered) is None

    # raw_data must not leak internal record/formula identifiers.
    raw_data = payload.get("raw_data")
    if raw_data is not None:
        raw_text = json.dumps(raw_data, ensure_ascii=False).lower()
        forbidden_terms = [
            "formula_id",
            "record_id",
            "ce_formula_versions",
            "internal_id",
            "_id",
        ]
        for term in forbidden_terms:
            assert term not in raw_text, f"Forbidden identifier leaked in raw_data: {term}"
        assert re.search(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", raw_text) is None
