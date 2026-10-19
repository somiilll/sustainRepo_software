"""Module: Live Internal AI BRSR routing/count/version-history regression checks."""

import os
import re
import uuid
from typing import Any

import pytest
import requests


def _backend_url() -> str:
    return (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")


BASE_URL = _backend_url()
API_BASE = f"{BASE_URL}/api"
ADMIN_EMAIL = os.environ.get("INTERNAL_AI_TEST_ADMIN_EMAIL")
ADMIN_PASSWORD = os.environ.get("INTERNAL_AI_TEST_ADMIN_PASSWORD")


@pytest.fixture(scope="module")
def session() -> requests.Session:
    client = requests.Session()
    client.headers.update({"Content-Type": "application/json"})
    return client


def _extract_counts(payload: dict[str, Any]) -> tuple[int | None, int | None]:
    text = " ".join(
        [
            str(payload.get("answer") or ""),
            " ".join(str(h) for h in (payload.get("highlights") or [])),
        ]
    )
    patterns = [
        r"(\d+)\s*(?:out\s+of|of|/)\s*(\d+)",
        r"filled\D+(\d+)\D+configured\D+(\d+)",
        r"configured\D+(\d+)\D+filled\D+(\d+)",
    ]
    for idx, pattern in enumerate(patterns):
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if not match:
            continue
        if idx == 2:
            configured, filled = int(match.group(1)), int(match.group(2))
            return filled, configured
        return int(match.group(1)), int(match.group(2))
    return None, None


def _login(session: requests.Session) -> str:
    response = session.post(
        f"{API_BASE}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=60,
    )
    assert response.status_code == 200, f"Login failed: {response.status_code} {response.text[:300]}"
    payload = response.json()
    token = payload.get("access_token") or payload.get("token")
    assert token, f"Login response missing token keys={list(payload.keys())}"
    return token


def _chat(session: requests.Session, token: str, message: str) -> dict[str, Any]:
    response = session.post(
        f"{API_BASE}/internal-ai/chat",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"message": message, "session_id": f"iter176-{uuid.uuid4()}"},
        timeout=180,
    )
    assert response.status_code == 200, f"Chat failed: {response.status_code} {response.text[:800]}"
    payload = response.json()
    assert isinstance(payload, dict), payload
    return payload


@pytest.mark.skipif(not (BASE_URL and ADMIN_EMAIL and ADMIN_PASSWORD), reason="Missing URL or admin credentials")
def test_live_brsr_generic_and_fy_counts_and_history(session: requests.Session):
    # Auth as supplied admin.
    token = _login(session)

    # 1) Generic BRSR count must route to BRSR and be non-zero/non-zero.
    generic_payload = _chat(session, token, "how many brsr questions are filled")
    assert generic_payload.get("query_type") == "brsr_lookup", generic_payload
    generic_filled, generic_configured = _extract_counts(generic_payload)
    assert generic_filled is not None and generic_configured is not None, generic_payload
    assert generic_filled > 0, generic_payload
    assert generic_configured > 0, generic_payload

    # 2) Bare period 2026-2027 must resolve to FY and remain non-zero/non-zero.
    fy_payload = _chat(session, token, "how many brsr questions are filled for 2026-2027")
    assert fy_payload.get("query_type") == "brsr_lookup", fy_payload
    fy_text = f"{fy_payload.get('answer', '')} {' '.join(str(h) for h in fy_payload.get('highlights', []))}".lower().replace("–", "-")
    assert ("fy 2026-27" in fy_text) or ("fy 2026-2027" in fy_text) or ("2026-2027" in fy_text), fy_payload
    fy_filled, fy_configured = _extract_counts(fy_payload)
    assert fy_filled is not None and fy_configured is not None, fy_payload
    assert fy_filled > 0, fy_payload
    assert fy_configured > 0, fy_payload

    # 3) Training coverage version-history question must route to BRSR history and return event(s).
    history_payload = _chat(
        session,
        token,
        "version history of percentage coverage by training and awareness programmes for 2026-2027 in brsr",
    )
    assert history_payload.get("query_type") == "brsr_version_history", history_payload
    answer_text = str(history_payload.get("answer") or "").strip()
    highlights = history_payload.get("highlights") or []
    events = history_payload.get("version_history") or history_payload.get("history") or []
    has_event_signal = bool(events) or ("version" in answer_text.lower()) or any("version" in str(h).lower() for h in highlights)
    assert has_event_signal, history_payload
