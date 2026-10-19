"""Live auxiliary Internal Data AI validation for calorific/BRSR/approval/evidence query routes."""
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


def _payload_text(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False)


def _extract_first_int(payload: dict) -> int | None:
    # prefer highlights first
    for item in payload.get("highlights") or []:
        value = item.get("value") if isinstance(item, dict) else None
        if value is None:
            continue
        if isinstance(value, int):
            return value
        match = re.search(r"\b\d+\b", str(value))
        if match:
            return int(match.group(0))
    answer = payload.get("answer") or ""
    match = re.search(r"\b\d+\b", answer)
    return int(match.group(0)) if match else None


BASE_URL = _read_backend_url()


def test_live_auxiliary_internal_ai_queries_single_login():
    if not BASE_URL:
        pytest.fail("Missing REACT_APP_BACKEND_URL (frontend/.env)")

    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})

    login_resp = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "goyalsomil2001@gmail.com", "password": "TestUser123!"},
        timeout=45,
    )
    if login_resp.status_code == 429:
        pytest.fail(f"BLOCKER: /api/auth/login returned 429 (rate limited). Body: {login_resp.text[:300]}")
    assert login_resp.status_code == 200, f"Login failed: {login_resp.status_code} {login_resp.text[:300]}"

    token = (login_resp.json().get("access_token") or login_resp.json().get("token"))
    assert token, f"No token found in login payload keys={list(login_resp.json().keys())}"

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # (1) calorific value lookup — aug alias must resolve to August 2026 and return 0.1 TJ/kg for Facility E.
    q1 = session.post(
        f"{BASE_URL}/api/internal-ai/chat",
        headers=headers,
        json={"message": "what is the calorific value for diesel for record for aug 2026", "session_id": "iter164-aux-q1"},
        timeout=120,
    )
    assert q1.status_code == 200, f"Q1 failed: {q1.status_code} {q1.text[:500]}"
    q1_json = q1.json()
    q1_text = _payload_text(q1_json).lower()
    assert q1_json.get("query_type") == "calculation_property_lookup"
    assert re.search(r"\b0\.1(?:0+)?\b", q1_text), q1_json
    assert re.search(r"tj\s*/\s*kg", q1_text), q1_json
    assert "facility e" in q1_text, q1_json

    # (2) BRSR filled count — concrete count, not placeholder PENDING.
    q2 = session.post(
        f"{BASE_URL}/api/internal-ai/chat",
        headers=headers,
        json={"message": "how many questions of brsr are filled for FY 2026-2027?", "session_id": "iter164-aux-q2"},
        timeout=120,
    )
    assert q2.status_code == 200, f"Q2 failed: {q2.status_code} {q2.text[:500]}"
    q2_json = q2.json()
    assert q2_json.get("query_type") == "brsr_lookup"
    assert "PENDING" not in _payload_text(q2_json), q2_json
    q2_count = _extract_first_int(q2_json)
    assert q2_count is not None, q2_json

    # (3) water awaiting approval count — concrete count, not placeholder PENDING.
    q3 = session.post(
        f"{BASE_URL}/api/internal-ai/chat",
        headers=headers,
        json={"message": "how many entry for water is still awaiting approval", "session_id": "iter164-aux-q3"},
        timeout=120,
    )
    assert q3.status_code == 200, f"Q3 failed: {q3.status_code} {q3.text[:500]}"
    q3_json = q3.json()
    assert q3_json.get("query_type") == "approval_status_lookup"
    assert "PENDING" not in _payload_text(q3_json), q3_json
    q3_count = _extract_first_int(q3_json)
    assert q3_count is not None, q3_json

    # (4) evidence lookup — sept alias must resolve to September 2025 and return determinate yes/no.
    q4 = session.post(
        f"{BASE_URL}/api/internal-ai/chat",
        headers=headers,
        json={"message": "is there any attachment for Petrol/Motor Gasoline for sept 2025 record?", "session_id": "iter164-aux-q4"},
        timeout=120,
    )
    assert q4.status_code == 200, f"Q4 failed: {q4.status_code} {q4.text[:500]}"
    q4_json = q4.json()
    q4_text = _payload_text(q4_json).lower()
    assert q4_json.get("query_type") == "evidence_lookup"
    assert "PENDING" not in _payload_text(q4_json), q4_json
    assert ("september 2025" in q4_text) or ("2025-09" in q4_text), q4_json
    assert any(token in (q4_json.get("answer") or "").lower() for token in ["yes", "no", "there is", "there are"]), q4_json
