"""GHG org override delivery tests: validation, persistence, resolved exposure, and restore safety."""

import os
from typing import Any

import pytest
import requests


# Module under test: sustainability-config org-config ghg_overrides API contract
ORG_ID = "9067d872-8a3a-4ed9-8494-e3ef04952f7c"
SUPERADMIN_EMAIL = "superadmin@ecotrack.com"
ORG_ADMIN_EMAIL = "goyalsomil2001@gmail.com"
PASSWORD = "TestUser123!"


def _base_url() -> str:
    url = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if not url:
        with open("/app/frontend/.env", encoding="utf-8") as env_file:
            for line in env_file:
                if line.strip().startswith("REACT_APP_BACKEND_URL="):
                    url = line.split("=", 1)[1].strip()
                    break
    assert url, "REACT_APP_BACKEND_URL is required"
    return url.rstrip("/")


BASE_URL = _base_url()
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session() -> requests.Session:
    client = requests.Session()
    client.headers.update({"Content-Type": "application/json"})
    return client


def _login_token(client: requests.Session, email: str) -> str:
    resp = client.post(
        f"{API}/auth/login",
        json={"email": email, "password": PASSWORD},
        timeout=45,
    )
    assert resp.status_code == 200, f"Login failed for {email}: {resp.status_code} {resp.text[:300]}"
    payload = resp.json()
    token = payload.get("access_token") or payload.get("token")
    assert token, f"Missing token for {email}"
    return token


@pytest.fixture(scope="module")
def tokens(session: requests.Session) -> dict[str, str]:
    return {
        "superadmin": _login_token(session, SUPERADMIN_EMAIL),
        "org_admin": _login_token(session, ORG_ADMIN_EMAIL),
    }


@pytest.fixture(scope="module")
def headers(tokens: dict[str, str]) -> dict[str, dict[str, str]]:
    return {
        "superadmin": {"Authorization": f"Bearer {tokens['superadmin']}", "Content-Type": "application/json"},
        "org_admin": {"Authorization": f"Bearer {tokens['org_admin']}"},
    }


@pytest.fixture(scope="module", autouse=True)
def restore_original_ghg_overrides(session: requests.Session, headers: dict[str, dict[str, str]]):
    """Backup then restore exact ghg_overrides payload for ORG1 after tests."""
    get_resp = session.get(
        f"{API}/sustainability-config/org-config",
        headers=headers["superadmin"],
        params={"org_id": ORG_ID},
        timeout=45,
    )
    assert get_resp.status_code == 200, get_resp.text
    original_cfg = get_resp.json()
    original_ghg_overrides: Any = original_cfg.get("ghg_overrides")

    yield

    restore_resp = session.put(
        f"{API}/sustainability-config/org-config",
        headers=headers["superadmin"],
        params={"org_id": ORG_ID},
        json={"ghg_overrides": original_ghg_overrides if original_ghg_overrides is not None else {}},
        timeout=45,
    )
    assert restore_resp.status_code == 200, (
        f"Restore ghg_overrides failed: {restore_resp.status_code} {restore_resp.text[:300]}"
    )


def test_put_get_and_resolved_expose_ghg_overrides(session: requests.Session, headers: dict[str, dict[str, str]]):
    """Superadmin PUT persists ghg_overrides; superadmin/org-admin GET returns persisted values."""
    override_payload = {
        "disabledCategories": [],
        "capabilityOverrides": {"customFuel": False},
        "processTypeOptions": ["venting", "ch4_overall_combustion"],
    }

    put_resp = session.put(
        f"{API}/sustainability-config/org-config",
        headers=headers["superadmin"],
        params={"org_id": ORG_ID},
        json={"ghg_overrides": override_payload},
        timeout=45,
    )
    assert put_resp.status_code == 200, put_resp.text
    persisted = put_resp.json().get("ghg_overrides") or {}
    assert persisted == override_payload

    get_org_resp = session.get(
        f"{API}/sustainability-config/org-config",
        headers=headers["superadmin"],
        params={"org_id": ORG_ID},
        timeout=45,
    )
    assert get_org_resp.status_code == 200, get_org_resp.text
    raw = get_org_resp.json().get("ghg_overrides") or {}
    assert raw == override_payload

    resolved_resp = session.get(
        f"{API}/sustainability-config/resolved",
        headers=headers["org_admin"],
        timeout=45,
    )
    assert resolved_resp.status_code == 200, resolved_resp.text
    resolved = resolved_resp.json().get("ghg_overrides") or {}
    assert resolved == override_payload


@pytest.mark.parametrize(
    "invalid_ghg_overrides",
    [
        {"processTypeOptions": ["calcination"]},
        {"processTypeOptions": []},
        {"processTypeOptions": ["venting", "venting"]},
        {"capabilityOverrides": {"customFuel": True}},
        {"formulaOverrides": {"venting": "unsafe"}},
        {"calculationInputs": {"x": 1}},
    ],
)
def test_put_rejects_unsafe_or_invalid_ghg_overrides(
    session: requests.Session,
    headers: dict[str, dict[str, str]],
    invalid_ghg_overrides: dict[str, Any],
):
    """Reject unknown process types, empty/duplicate arrays, customFuel=true, and calculation-domain keys."""
    resp = session.put(
        f"{API}/sustainability-config/org-config",
        headers=headers["superadmin"],
        params={"org_id": ORG_ID},
        json={"ghg_overrides": invalid_ghg_overrides},
        timeout=45,
    )
    assert resp.status_code == 422, f"Expected 422 for {invalid_ghg_overrides}, got {resp.status_code}: {resp.text[:300]}"
