"""Module: Internal AI live regression for evidence and BRSR routing/count outputs."""

import os
import re
from typing import Any

import pytest
import requests


def _read_backend_url() -> str:
    return os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


BASE_URL = _read_backend_url()
API_BASE = f"{BASE_URL}/api"
ADMIN_EMAIL = os.environ.get("INTERNAL_AI_TEST_ADMIN_EMAIL")
ADMIN_PASSWORD = os.environ.get("INTERNAL_AI_TEST_ADMIN_PASSWORD")


@pytest.fixture(scope="module")
def session() -> requests.Session:
    client = requests.Session()
    client.headers.update({"Content-Type": "application/json"})
    return client


def _login(session: requests.Session) -> str:
    response = session.post(
        f"{API_BASE}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=60,
    )
    if response.status_code == 429:
        pytest.fail(f"BLOCKER: login rate limited (429). Body: {response.text[:300]}")
    assert response.status_code == 200, f"Login failed: {response.status_code} {response.text[:300]}"
    payload = response.json()
    token = payload.get("access_token") or payload.get("token")
    assert token, f"No token in login payload keys={list(payload.keys())}"
    return token


@pytest.fixture(scope="module")
def admin_token(session: requests.Session) -> str:
    if not BASE_URL:
        pytest.skip("Missing REACT_APP_BACKEND_URL")
    return _login(session)


def _ask(session: requests.Session, token: str, message: str, session_id: str) -> dict[str, Any]:
    response = session.post(
        f"{API_BASE}/internal-ai/chat",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"message": message, "session_id": session_id},
        timeout=180,
    )
    assert response.status_code == 200, f"Chat failed: {response.status_code} {response.text[:900]}"
    payload = response.json()
    assert isinstance(payload.get("answer"), str), payload
    return payload


@pytest.mark.skipif(
    not (BASE_URL and ADMIN_EMAIL and ADMIN_PASSWORD),
    reason="Missing Internal AI live-test URL or credentials",
)
def test_live_evidence_and_brsr_specific_queries(admin_token: str, session: requests.Session):
    # Feature 1: evidence lookup for water consumption must return linked file.
    evidence_payload = _ask(
        session,
        admin_token,
        "Show evidence for water consumption",
        "iter175-water-evidence",
    )
    assert evidence_payload.get("query_type") == "evidence_lookup", evidence_payload
    evidence_files = evidence_payload.get("evidence") or []
    assert evidence_files, f"Expected non-empty evidence list. payload={evidence_payload}"
    evidence_filenames = [str(file_item.get("filename") or "") for file_item in evidence_files if isinstance(file_item, dict)]
    assert any(name.strip() for name in evidence_filenames), evidence_payload
    assert any("screenshot 2026-07-13" in name.lower() for name in evidence_filenames), evidence_payload

    # Feature 2: BRSR P1 filled-count must stay on BRSR scope and report exactly 3.
    p1_payload = _ask(
        session,
        admin_token,
        "How many BRSR questions in P1 are filled?",
        "iter175-brsr-p1-filled",
    )
    assert p1_payload.get("query_type") == "brsr_lookup", p1_payload
    p1_text = f"{p1_payload.get('answer', '')} {p1_payload.get('highlights', [])}".lower()
    assert "p1" in p1_text, p1_payload
    filled_count = re.search(r"\b(\d+)\s+of\s+\d+\b", p1_text)
    assert filled_count and int(filled_count.group(1)) == 3, p1_payload

    # Feature 3: BRSR training coverage must use stored FY 2026-2027 values.
    coverage_payload = _ask(
        session,
        admin_token,
        "What is the percentage coverage by training and awareness programmes in BRSR for financial year 2026-2027?",
        "iter175-brsr-training-coverage",
    )
    assert coverage_payload.get("query_type") == "brsr_lookup", coverage_payload
    coverage_text = f"{coverage_payload.get('answer', '')} {coverage_payload.get('highlights', [])}".lower()
    for expected in ("bod", "100", "kmp", "83", "employees", "50", "workers", "10"):
        assert expected in coverage_text, coverage_payload
