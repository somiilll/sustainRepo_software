"""Focused auth session renewal regression for login/refresh/me/logout flows."""

import os
import re
import time

import pytest
import requests


# Modules/features covered: /api/auth/login, /api/auth/refresh, /api/auth/me, /api/auth/logout.


def _read_env_value(path: str, key: str):
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            current_key, value = line.split("=", 1)
            if current_key.strip() == key:
                return value.strip().strip('"').strip("'")
    return None


def _backend_base_url() -> str:
    base = os.environ.get("REACT_APP_BACKEND_URL") or _read_env_value("/app/frontend/.env", "REACT_APP_BACKEND_URL")
    if not base:
        pytest.fail("REACT_APP_BACKEND_URL unavailable for auth session tests")
    return base.rstrip("/")


def _admin_credentials():
    path = "/app/memory/test_credentials.md"
    if not os.path.exists(path):
        pytest.fail("/app/memory/test_credentials.md missing")

    text = open(path, "r", encoding="utf-8").read()
    email_match = re.search(r"\*\*Email\*\*:\s*([^\n]+)", text)
    password_match = re.search(r"\*\*Password\*\*:\s*([^\n]+)", text)
    if not email_match or not password_match:
        pytest.fail("Could not parse admin credentials from /app/memory/test_credentials.md")
    return email_match.group(1).strip(), password_match.group(1).strip()


@pytest.fixture(scope="module")
def base_url() -> str:
    return _backend_base_url()


@pytest.fixture(scope="module")
def admin_credentials():
    return _admin_credentials()


def _extract_refresh_cookie(set_cookie_header: str) -> str | None:
    for part in (set_cookie_header or "").split(","):
        if "sustainrepo_refresh=" in part:
            return part.split("sustainrepo_refresh=", 1)[1].split(";", 1)[0]
    return None


def test_login_returns_access_token_without_refresh_token_and_sets_secure_cookie(base_url: str, admin_credentials):
    email, password = admin_credentials
    response = requests.post(
        f"{base_url}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert response.status_code == 200, response.text[:400]

    payload = response.json()
    assert isinstance(payload.get("access_token"), str) and payload["access_token"]
    assert "refresh_token" not in payload

    set_cookie_header = response.headers.get("set-cookie", "").lower()
    assert "sustainrepo_refresh=" in set_cookie_header
    assert "httponly" in set_cookie_header
    assert "secure" in set_cookie_header
    assert "samesite=" in set_cookie_header


def test_refresh_uses_cookie_rotates_cookie_and_returns_new_access_token(base_url: str, admin_credentials):
    email, password = admin_credentials
    session = requests.Session()

    login_response = session.post(
        f"{base_url}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert login_response.status_code == 200, login_response.text[:400]
    initial_cookie = _extract_refresh_cookie(login_response.headers.get("set-cookie", ""))
    assert initial_cookie

    time.sleep(1.2)
    refresh_response = session.post(f"{base_url}/api/auth/refresh", json={}, timeout=30)
    assert refresh_response.status_code == 200, refresh_response.text[:400]

    payload = refresh_response.json()
    assert isinstance(payload.get("access_token"), str) and payload["access_token"]

    rotated_cookie = _extract_refresh_cookie(refresh_response.headers.get("set-cookie", ""))
    assert rotated_cookie
    assert rotated_cookie != initial_cookie


def test_me_accepts_refreshed_access_token(base_url: str, admin_credentials):
    email, password = admin_credentials
    session = requests.Session()

    login_response = session.post(
        f"{base_url}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert login_response.status_code == 200

    refresh_response = session.post(f"{base_url}/api/auth/refresh", json={}, timeout=30)
    assert refresh_response.status_code == 200, refresh_response.text[:400]
    refreshed_access = refresh_response.json().get("access_token")
    assert isinstance(refreshed_access, str) and refreshed_access

    me_response = session.get(
        f"{base_url}/api/auth/me",
        headers={"Authorization": f"Bearer {refreshed_access}"},
        timeout=30,
    )
    assert me_response.status_code == 200, me_response.text[:400]
    me_payload = me_response.json()
    assert me_payload.get("email") == email


def test_logout_clears_refresh_cookie_and_cookie_only_refresh_then_fails(base_url: str, admin_credentials):
    email, password = admin_credentials
    session = requests.Session()

    login_response = session.post(
        f"{base_url}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert login_response.status_code == 200

    logout_response = session.post(f"{base_url}/api/auth/logout", timeout=30)
    assert logout_response.status_code == 204
    logout_cookie_header = logout_response.headers.get("set-cookie", "").lower()
    assert "sustainrepo_refresh=" in logout_cookie_header
    assert "max-age=0" in logout_cookie_header or "expires=" in logout_cookie_header

    refresh_response = session.post(f"{base_url}/api/auth/refresh", json={}, timeout=30)
    assert refresh_response.status_code == 401


def test_unauthenticated_refresh_returns_401(base_url: str):
    response = requests.post(f"{base_url}/api/auth/refresh", json={}, timeout=30)
    assert response.status_code == 401
    data = response.json()
    assert isinstance(data.get("detail") or data.get("message"), str)
