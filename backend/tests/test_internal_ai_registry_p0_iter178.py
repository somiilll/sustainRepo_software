"""Live P0 regression tests for Internal Data AI question-registry routing and privacy-safe output."""
import json
import os
import uuid

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
ADMIN_EMAIL = os.environ.get("INTERNAL_AI_TEST_EMAIL")
ADMIN_PASSWORD = os.environ.get("INTERNAL_AI_TEST_PASSWORD")


@pytest.fixture(scope="module")
def api_base() -> str:
    assert BASE_URL, "REACT_APP_BACKEND_URL is required"
    return BASE_URL.rstrip("/")


@pytest.fixture(scope="module")
def token(api_base: str) -> str:
    # Auth + Internal AI chat P0 coverage
    assert ADMIN_EMAIL and ADMIN_PASSWORD, "INTERNAL_AI_TEST_EMAIL and INTERNAL_AI_TEST_PASSWORD are required"
    response = requests.post(
        f"{api_base}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert response.status_code == 200, f"Login failed: {response.status_code} {response.text[:300]}"
    data = response.json()
    auth_token = data.get("access_token") or data.get("token")
    assert auth_token, f"Token missing in login response keys={list(data.keys())}"
    return auth_token


@pytest.fixture(scope="module")
def client(token: str) -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
    )
    return session


def _ask(client: requests.Session, api_base: str, message: str) -> dict:
    response = client.post(
        f"{api_base}/api/internal-ai/chat",
        json={"message": message, "session_id": f"iter178-{uuid.uuid4()}"},
        timeout=120,
    )
    assert response.status_code == 200, f"Chat failed: {response.status_code} {response.text[:500]}"
    return response.json()


def _visible_text(payload: dict) -> str:
    answer = payload.get("answer") or ""
    highlight_blob = []
    for item in payload.get("highlights") or []:
        if isinstance(item, dict):
            highlight_blob.append(f"{item.get('label', '')} {item.get('value', '')}")
        else:
            highlight_blob.append(str(item))
    return f"{answer} {' | '.join(highlight_blob)}".lower()


def test_cin_routes_to_brsr_with_confidence_and_no_internal_key(client: requests.Session, api_base: str):
    payload = _ask(client, api_base, "What is our CIN?")

    assert payload.get("query_type") == "brsr_lookup"
    assert payload.get("framework_confidence") == pytest.approx(0.95, abs=1e-6)

    highlights = payload.get("highlights") or []
    labels = [str(h.get("label", "")).strip().lower() for h in highlights if isinstance(h, dict)]
    assert "question" not in labels

    visible = _visible_text(payload)
    assert "brsr_a_cin" not in visible
    assert "1234567890" in json.dumps(payload), "Expected CIN value not present in response"


def test_biodiversity_routes_to_gri_with_confidence_and_label(client: requests.Session, api_base: str):
    payload = _ask(client, api_base, "Which sites are in areas of biodiversity importance?")

    assert payload.get("query_type") == "gri_lookup"
    assert payload.get("framework_confidence") == pytest.approx(0.95, abs=1e-6)

    visible = _visible_text(payload)
    assert "areas of biodiversity importance" in visible
    assert "gri_101_5_a_i" not in visible
