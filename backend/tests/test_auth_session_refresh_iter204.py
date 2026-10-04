"""Auth session renewal regression tests for /api/auth login/refresh/me/logout flow."""

import os
import re
import time

import pytest
import requests
from pymongo import MongoClient


# Modules/features covered: auth cookie session renewal, refresh retry prerequisites, CORS/lockout playbook checks.


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
        pytest.fail("REACT_APP_BACKEND_URL unavailable for live auth session tests")
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


@pytest.fixture(scope="module")
def api_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def mongo_db():
    mongo_url = os.environ.get("MONGO_URL") or _read_env_value("/app/backend/.env", "MONGO_URL")
    db_name = os.environ.get("DB_NAME") or _read_env_value("/app/backend/.env", "DB_NAME")
    if not mongo_url or not db_name:
        pytest.skip("MONGO_URL/DB_NAME unavailable; skipping DB assertion")
    client = MongoClient(mongo_url.strip('"').strip("'"))
    db = client[db_name.strip('"').strip("'")]
    try:
        yield db
    finally:
        client.close()


def _parse_refresh_cookie_from_header(set_cookie_header: str) -> str | None:
    for part in (set_cookie_header or "").split(","):
        if "sustainrepo_refresh=" in part:
            return part.split("sustainrepo_refresh=", 1)[1].split(";", 1)[0]
    return None


def test_login_sets_secure_http_only_cookie_and_hides_refresh_value(base_url: str, admin_credentials, api_session: requests.Session):
    email, password = admin_credentials
    response = api_session.post(
        f"{base_url}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert response.status_code == 200, response.text[:400]

    body = response.json()
    access_token = body.get("access_token")
    assert isinstance(access_token, str) and access_token
    assert not body.get("refresh_token"), "refresh_token value should not be exposed in JSON body"

    set_cookie_header = response.headers.get("set-cookie", "")
    assert set_cookie_header
    lower_cookie = set_cookie_header.lower()
    assert "sustainrepo_refresh=" in lower_cookie
    assert "httponly" in lower_cookie
    assert "secure" in lower_cookie
    assert "samesite=" in lower_cookie


def test_refresh_uses_cookie_rotates_cookie_and_returns_access_token(base_url: str, admin_credentials):
    email, password = admin_credentials
    session = requests.Session()

    login_response = session.post(
        f"{base_url}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert login_response.status_code == 200, login_response.text[:400]
    login_cookie_header = login_response.headers.get("set-cookie", "")
    original_refresh_cookie = _parse_refresh_cookie_from_header(login_cookie_header)
    assert original_refresh_cookie, "Expected login to set sustainrepo_refresh cookie"

    time.sleep(1.2)
    refresh_response = session.post(f"{base_url}/api/auth/refresh", json={}, timeout=30)
    assert refresh_response.status_code == 200, refresh_response.text[:400]

    payload = refresh_response.json()
    refreshed_access_token = payload.get("access_token")
    assert isinstance(refreshed_access_token, str) and refreshed_access_token

    rotated_cookie_header = refresh_response.headers.get("set-cookie", "")
    rotated_refresh_cookie = _parse_refresh_cookie_from_header(rotated_cookie_header)
    assert rotated_refresh_cookie, "Expected refresh endpoint to set rotated sustainrepo_refresh cookie"
    assert rotated_refresh_cookie != original_refresh_cookie, "Refresh cookie should rotate on /auth/refresh"


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
    refreshed_access_token = refresh_response.json().get("access_token")
    assert isinstance(refreshed_access_token, str) and refreshed_access_token

    me_response = session.get(
        f"{base_url}/api/auth/me",
        headers={"Authorization": f"Bearer {refreshed_access_token}"},
        timeout=30,
    )
    assert me_response.status_code == 200, me_response.text[:400]

    me_payload = me_response.json()
    assert me_payload.get("email") == email
    assert isinstance(me_payload.get("id"), str) and me_payload.get("id")


def test_logout_clears_cookie_and_refresh_after_logout_fails_401(base_url: str, admin_credentials):
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
    logout_set_cookie = logout_response.headers.get("set-cookie", "").lower()
    assert "sustainrepo_refresh=" in logout_set_cookie
    assert "max-age=0" in logout_set_cookie or "expires=" in logout_set_cookie

    refresh_after_logout = session.post(f"{base_url}/api/auth/refresh", json={}, timeout=30)
    assert refresh_after_logout.status_code == 401
    detail = (refresh_after_logout.json() or {}).get("detail", "")
    assert isinstance(detail, str) and detail.strip()


def test_cors_preflight_allows_trusted_origin_and_credentials(base_url: str):
    trusted_origin = (os.environ.get("REACT_APP_BACKEND_URL") or _read_env_value("/app/frontend/.env", "REACT_APP_BACKEND_URL") or "").rstrip("/")
    response = requests.options(
        f"{base_url}/api/auth/login",
        headers={
            "Origin": trusted_origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
        timeout=30,
    )
    assert response.status_code in {200, 204}
    assert response.headers.get("access-control-allow-origin") == trusted_origin
    assert response.headers.get("access-control-allow-credentials") == "true"


def test_cors_preflight_rejects_untrusted_origin(base_url: str):
    response = requests.options(
        f"{base_url}/api/auth/login",
        headers={
            "Origin": "https://evil.example.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
        timeout=30,
    )
    assert response.status_code in {200, 204, 400, 403}
    assert response.headers.get("access-control-allow-origin") not in {"https://evil.example.com"}


def test_bruteforce_lockout_after_five_invalid_password_attempts(base_url: str):
    probe_email = f"auth-refresh-lockout-{int(time.time())}@example.com"
    statuses = []
    for _ in range(6):
        response = requests.post(
            f"{base_url}/api/auth/login",
            json={"email": probe_email, "password": "WrongPass123!"},
            timeout=30,
        )
        statuses.append(response.status_code)
    assert all(code == 401 for code in statuses[:5]), f"Unexpected pre-lockout statuses: {statuses}"
    assert statuses[-1] == 429, f"Expected lockout status 429, got {statuses}"


def test_seeded_admin_password_hash_uses_bcrypt_2b_prefix(mongo_db, admin_credentials):
    admin_email, _ = admin_credentials
    user = mongo_db.users.find_one({"email": admin_email}, {"_id": 0, "password_hash": 1})
    assert user is not None
    password_hash = user.get("password_hash")
    assert isinstance(password_hash, str)
    assert password_hash.startswith("$2b$"), f"Unexpected bcrypt prefix: {password_hash[:4]}"
