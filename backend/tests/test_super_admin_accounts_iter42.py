"""Super-admin team account endpoints + auth/CORS regression checks for Iteration 42."""

import os
import uuid

import pytest
import requests
from pymongo import MongoClient


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")


@pytest.fixture(scope="module")
def base_url() -> str:
    if not BASE_URL:
        pytest.fail("REACT_APP_BACKEND_URL is not set")
    return BASE_URL


@pytest.fixture(scope="module")
def api_client() -> requests.Session:
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def mongo_db():
    if not MONGO_URL or not DB_NAME:
        pytest.skip("MONGO_URL/DB_NAME not configured; skipping DB-backed assertions")
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    try:
        yield db
    finally:
        client.close()


@pytest.fixture(scope="module")
def super_admin_auth(api_client: requests.Session, base_url: str) -> dict:
    response = api_client.post(
        f"{base_url}/api/auth/login",
        json={"email": "superadmin@ecotrack.com", "password": "TestUser123!"},
        timeout=30,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    return {
        "token": data["access_token"],
        "user": data["user"],
        "response": response,
    }


@pytest.fixture(scope="module")
def admin_auth(api_client: requests.Session, base_url: str) -> dict:
    response = api_client.post(
        f"{base_url}/api/auth/login",
        json={"email": "goyalsomil2001@gmail.com", "password": "TestUser123!"},
        timeout=30,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    return {"token": data["access_token"], "user": data["user"]}


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# Auth/session playbook checks
def test_super_admin_login_success(super_admin_auth):
    assert super_admin_auth["user"]["role"] == "super_admin"
    assert isinstance(super_admin_auth["token"], str) and len(super_admin_auth["token"]) > 20


def test_login_sets_httponly_cookie(super_admin_auth):
    set_cookie = super_admin_auth["response"].headers.get("set-cookie", "")
    assert set_cookie, "Expected set-cookie header on login response"
    assert "httponly" in set_cookie.lower(), f"Cookie missing HttpOnly flag: {set_cookie}"


def test_bcrypt_hash_prefix_for_seeded_super_admin(mongo_db):
    user = mongo_db.users.find_one(
        {"email": "superadmin@ecotrack.com"},
        {"_id": 0, "password_hash": 1},
    )
    assert user is not None
    password_hash = user.get("password_hash")
    assert isinstance(password_hash, str)
    assert password_hash.startswith("$2b$"), f"Unexpected bcrypt hash prefix: {password_hash[:4]}"


def test_cors_preflight_allows_configured_origin(base_url: str):
    origin = base_url
    response = requests.options(
        f"{base_url}/api/auth/login",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
        timeout=30,
    )
    assert response.status_code in [200, 204]
    assert response.headers.get("access-control-allow-origin") == origin
    assert response.headers.get("access-control-allow-credentials") == "true"


def test_cors_preflight_blocks_untrusted_origin(base_url: str):
    response = requests.options(
        f"{base_url}/api/auth/login",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
        timeout=30,
    )
    assert response.status_code in [200, 204, 400, 403]
    assert not response.headers.get("access-control-allow-origin"), (
        "Untrusted origin should not receive Access-Control-Allow-Origin header"
    )


def test_bruteforce_lockout_triggers_after_five_failures(base_url: str):
    probe_email = f"lockout_probe_{uuid.uuid4().hex[:10]}@example.com"
    failures = []
    for _ in range(5):
        res = requests.post(
            f"{base_url}/api/auth/login",
            json={"email": probe_email, "password": "WrongPass123!"},
            timeout=30,
        )
        failures.append(res.status_code)
    blocked = requests.post(
        f"{base_url}/api/auth/login",
        json={"email": probe_email, "password": "WrongPass123!"},
        timeout=30,
    )
    assert all(code == 401 for code in failures), f"Unexpected pre-lockout statuses: {failures}"
    assert blocked.status_code == 429, blocked.text


def test_valid_admin_login_still_works_after_unrelated_lockout(base_url: str):
    response = requests.post(
        f"{base_url}/api/auth/login",
        json={"email": "goyalsomil2001@gmail.com", "password": "TestUser123!"},
        timeout=30,
    )
    assert response.status_code == 200, response.text


# Super-admin Team Accounts API checks
def test_get_super_admin_accounts_excludes_password_hash_and_super_admins(
    api_client: requests.Session,
    base_url: str,
    super_admin_auth: dict,
):
    response = api_client.get(
        f"{base_url}/api/super-admin/accounts",
        headers=_auth_headers(super_admin_auth["token"]),
        timeout=30,
    )
    assert response.status_code == 200, response.text
    accounts = response.json()
    assert isinstance(accounts, list)
    for account in accounts:
        assert account["role"] in ["admin", "user"]
        assert "password_hash" not in account


def test_get_super_admin_accounts_only_active_users_and_admins(
    api_client: requests.Session,
    base_url: str,
    super_admin_auth: dict,
    mongo_db,
):
    response = api_client.get(
        f"{base_url}/api/super-admin/accounts",
        headers=_auth_headers(super_admin_auth["token"]),
        timeout=30,
    )
    assert response.status_code == 200, response.text
    accounts = response.json()
    ids = [a["id"] for a in accounts if a.get("id")]
    if not ids:
        pytest.skip("No user/admin accounts returned")

    inactive_count = mongo_db.users.count_documents({"id": {"$in": ids}, "is_active": False})
    assert inactive_count == 0, f"Found {inactive_count} inactive accounts returned by API"


def test_post_super_admin_accounts_rejects_unauthenticated(api_client: requests.Session, base_url: str):
    payload = {
        "email": f"unauth_probe_{uuid.uuid4().hex[:8]}@example.com",
        "full_name": "Unauth Probe",
        "organization_id": "missing-org",
        "role": "user",
    }
    response = api_client.post(f"{base_url}/api/super-admin/accounts", json=payload, timeout=30)
    assert response.status_code in [401, 403], response.text


def test_post_super_admin_accounts_rejects_non_super_admin(
    api_client: requests.Session,
    base_url: str,
    admin_auth: dict,
):
    payload = {
        "email": f"nonsa_probe_{uuid.uuid4().hex[:8]}@example.com",
        "full_name": "Non SA Probe",
        "organization_id": "missing-org",
        "role": "user",
    }
    response = api_client.post(
        f"{base_url}/api/super-admin/accounts",
        headers=_auth_headers(admin_auth["token"]),
        json=payload,
        timeout=30,
    )
    assert response.status_code == 403, response.text


def test_post_super_admin_accounts_rejects_invalid_role_without_creating_account(
    api_client: requests.Session,
    base_url: str,
    super_admin_auth: dict,
):
    email = f"badrole_{uuid.uuid4().hex[:10]}@example.com"
    payload = {
        "email": email,
        "full_name": "Role Validation",
        "organization_id": "missing-org",
        "role": "super_admin",
    }
    response = api_client.post(
        f"{base_url}/api/super-admin/accounts",
        headers=_auth_headers(super_admin_auth["token"]),
        json=payload,
        timeout=30,
    )
    assert response.status_code == 422, response.text

    list_res = api_client.get(
        f"{base_url}/api/super-admin/accounts",
        headers=_auth_headers(super_admin_auth["token"]),
        timeout=30,
    )
    assert list_res.status_code == 200
    assert not any(a.get("email") == email for a in list_res.json())


def test_post_super_admin_accounts_rejects_invalid_email_and_empty_name(
    api_client: requests.Session,
    base_url: str,
    super_admin_auth: dict,
):
    payload = {
        "email": "invalid-email",
        "full_name": "",
        "organization_id": "any-org",
        "role": "user",
    }
    response = api_client.post(
        f"{base_url}/api/super-admin/accounts",
        headers=_auth_headers(super_admin_auth["token"]),
        json=payload,
        timeout=30,
    )
    assert response.status_code == 422, response.text


def test_post_super_admin_accounts_rejects_invalid_organization_and_does_not_create(
    api_client: requests.Session,
    base_url: str,
    super_admin_auth: dict,
):
    email = f"invalidorg_{uuid.uuid4().hex[:10]}@example.com"
    payload = {
        "email": email,
        "full_name": "Invalid Org",
        "organization_id": str(uuid.uuid4()),
        "role": "user",
    }
    response = api_client.post(
        f"{base_url}/api/super-admin/accounts",
        headers=_auth_headers(super_admin_auth["token"]),
        json=payload,
        timeout=30,
    )
    assert response.status_code == 404, response.text

    list_res = api_client.get(
        f"{base_url}/api/super-admin/accounts",
        headers=_auth_headers(super_admin_auth["token"]),
        timeout=30,
    )
    assert list_res.status_code == 200
    assert not any(a.get("email") == email for a in list_res.json())


def test_safe_happy_path_creation_blocked_due_to_live_email_side_effects():
    pytest.skip(
        "Blocked intentionally: live invitation email delivery cannot be safely exercised "
        "in shared preview without sending real emails"
    )


def test_delete_super_admin_accounts_returns_404_for_unknown_id(
    api_client: requests.Session,
    base_url: str,
    super_admin_auth: dict,
):
    unknown_id = str(uuid.uuid4())
    response = api_client.delete(
        f"{base_url}/api/super-admin/accounts/{unknown_id}",
        headers=_auth_headers(super_admin_auth["token"]),
        timeout=30,
    )
    assert response.status_code == 404, response.text


def test_delete_super_admin_accounts_cannot_delete_super_admin(
    api_client: requests.Session,
    base_url: str,
    super_admin_auth: dict,
):
    super_admin_id = super_admin_auth["user"]["id"]
    response = api_client.delete(
        f"{base_url}/api/super-admin/accounts/{super_admin_id}",
        headers=_auth_headers(super_admin_auth["token"]),
        timeout=30,
    )
    assert response.status_code == 404, response.text


# Legacy compatibility check
def test_legacy_get_super_admin_admins_still_works(
    api_client: requests.Session,
    base_url: str,
    super_admin_auth: dict,
):
    response = api_client.get(
        f"{base_url}/api/super-admin/admins",
        headers=_auth_headers(super_admin_auth["token"]),
        timeout=30,
    )
    assert response.status_code == 200, response.text
    admins = response.json()
    assert isinstance(admins, list)
    for admin in admins:
        assert admin.get("role") == "admin"
