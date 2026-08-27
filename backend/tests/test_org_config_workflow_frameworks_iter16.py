"""Regression tests for Org Config ownership of approval/workflow/framework settings."""

import os
import uuid

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient


load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if BASE_URL:
    BASE_URL = BASE_URL.rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")

SUPERADMIN_EMAIL = "superadmin@ecotrack.com"
SUPERADMIN_PASSWORD = "TestUser123!"
ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASSWORD = "TestUser123!"
ADMIN_ORG_ID = "9067d872-8a3a-4ed9-8494-e3ef04952f7c"


@pytest.fixture(scope="module")
def mongo_db():
    if not MONGO_URL or not DB_NAME:
        pytest.skip("MONGO_URL/DB_NAME is not configured")
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="module")
def superadmin_session():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL is not configured")

    session = requests.Session()
    login = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": SUPERADMIN_EMAIL, "password": SUPERADMIN_PASSWORD},
        timeout=30,
    )
    assert login.status_code == 200, f"Super admin login failed: {login.status_code} {login.text}"
    token = login.json().get("access_token")
    assert token and isinstance(token, str)
    session.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def admin_session():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL is not configured")

    session = requests.Session()
    login = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert login.status_code == 200, f"Admin login failed: {login.status_code} {login.text}"
    token = login.json().get("access_token")
    assert token and isinstance(token, str)
    session.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def restore_admin_org_settings(superadmin_session, mongo_db):
    """Restore canonical and legacy mirrors after tests that mutate organization settings."""
    org_cfg_coll = mongo_db["organization_config"]
    org_coll = mongo_db["organizations"]

    original_cfg = org_cfg_coll.find_one({"organization_id": ADMIN_ORG_ID})
    original_org = org_coll.find_one({"id": ADMIN_ORG_ID})
    yield

    if original_cfg is None:
        superadmin_session.delete(
            f"{BASE_URL}/api/sustainability-config/org-config?org_id={ADMIN_ORG_ID}",
            timeout=30,
        )
    else:
        payload = {
            "organization_settings": (original_cfg.get("organization_settings") or {
                "approval_workflow_enabled": False,
                "multi_level_approval_enabled": False,
                "esg_frameworks_enabled": [],
            })
        }
        superadmin_session.put(
            f"{BASE_URL}/api/sustainability-config/org-config?org_id={ADMIN_ORG_ID}",
            json=payload,
            timeout=30,
        )

    if original_org:
        org_coll.update_one(
            {"id": ADMIN_ORG_ID},
            {"$set": {
                "approval_workflow_enabled": original_org.get("approval_workflow_enabled", False),
                "multi_level_approval_enabled": original_org.get("multi_level_approval_enabled", False),
                "esg_frameworks_enabled": original_org.get("esg_frameworks_enabled", []),
            }},
        )


def test_login_sets_http_only_cookie():
    """Auth regression: successful login should set a cookie with HttpOnly flag."""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert response.status_code == 200
    set_cookie = response.headers.get("set-cookie", "")
    assert "HttpOnly" in set_cookie


def test_login_cors_allows_known_origin_and_blocks_untrusted_origin():
    """Auth regression: CORS must reflect trusted origins only when credentials are requested."""
    trusted = requests.options(
        f"{BASE_URL}/api/auth/login",
        headers={
            "Origin": BASE_URL,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
        timeout=30,
    )
    assert trusted.status_code in (200, 204)
    assert trusted.headers.get("access-control-allow-origin") == BASE_URL
    assert trusted.headers.get("access-control-allow-credentials") == "true"

    untrusted = requests.options(
        f"{BASE_URL}/api/auth/login",
        headers={
            "Origin": "https://untrusted.example.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
        timeout=30,
    )
    assert untrusted.status_code in (200, 204)
    assert untrusted.headers.get("access-control-allow-origin") in (None, "")


def test_bcrypt_hash_uses_2b_prefix(mongo_db):
    """Auth regression: seeded admin password hash should use $2b$ bcrypt variant."""
    user = mongo_db["users"].find_one({"email": ADMIN_EMAIL}, {"_id": 0, "password_hash": 1})
    assert user and isinstance(user.get("password_hash"), str)
    assert user["password_hash"].startswith("$2b$")


def test_org_config_get_returns_organization_settings_and_migrates_legacy_record(superadmin_session, mongo_db):
    """Org Config GET should include canonical organization_settings for legacy records lacking this field."""
    legacy_org_id = f"TEST_LEGACY_{uuid.uuid4().hex[:10]}"
    org_cfg_coll = mongo_db["organization_config"]
    org_coll = mongo_db["organizations"]

    org_coll.insert_one({
        "id": legacy_org_id,
        "name": "TEST legacy org",
        "approval_workflow_enabled": True,
        "multi_level_approval_enabled": True,
        "esg_frameworks_enabled": ["BRSR"],
    })
    org_cfg_coll.insert_one({
        "organization_id": legacy_org_id,
        "modules": {"enabled": None},
        "created_by": "test",
        "updated_by": "test",
    })

    try:
        response = superadmin_session.get(
            f"{BASE_URL}/api/sustainability-config/org-config?org_id={legacy_org_id}",
            timeout=30,
        )
        assert response.status_code == 200
        data = response.json()
        settings = data.get("organization_settings")
        assert isinstance(settings, dict)
        assert settings["approval_workflow_enabled"] is True
        assert settings["multi_level_approval_enabled"] is True
        assert settings["esg_frameworks_enabled"] == ["BRSR"]

        persisted = org_cfg_coll.find_one({"organization_id": legacy_org_id}, {"_id": 0, "organization_settings": 1})
        assert isinstance(persisted.get("organization_settings"), dict)
    finally:
        org_cfg_coll.delete_one({"organization_id": legacy_org_id})
        org_coll.delete_one({"id": legacy_org_id})


def test_org_config_update_accepts_valid_frameworks(superadmin_session):
    """Org Config update accepts BRSR/GRI canonical values."""
    response = superadmin_session.put(
        f"{BASE_URL}/api/sustainability-config/org-config?org_id={ADMIN_ORG_ID}",
        json={
            "organization_settings": {
                "approval_workflow_enabled": True,
                "multi_level_approval_enabled": True,
                "esg_frameworks_enabled": ["BRSR", "GRI"],
            }
        },
        timeout=30,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["organization_settings"]["esg_frameworks_enabled"] == ["BRSR", "GRI"]


def test_org_config_update_rejects_invalid_framework_value(superadmin_session):
    """Org Config update rejects frameworks outside BRSR/GRI."""
    response = superadmin_session.put(
        f"{BASE_URL}/api/sustainability-config/org-config?org_id={ADMIN_ORG_ID}",
        json={
            "organization_settings": {
                "approval_workflow_enabled": False,
                "multi_level_approval_enabled": False,
                "esg_frameworks_enabled": ["CDP"],
            }
        },
        timeout=30,
    )
    assert response.status_code == 422
    detail = response.json().get("detail", [])
    assert any("BRSR" in str(item) or "GRI" in str(item) for item in detail)


def test_module_config_reads_workflow_frameworks_from_canonical_org_config(
    superadmin_session,
    admin_session,
    restore_admin_org_settings,
):
    """/api/organization/module-config should resolve workflow/framework values from organization_config settings."""
    target_settings = {
        "approval_workflow_enabled": True,
        "multi_level_approval_enabled": False,
        "esg_frameworks_enabled": ["GRI"],
    }
    save = superadmin_session.put(
        f"{BASE_URL}/api/sustainability-config/org-config?org_id={ADMIN_ORG_ID}",
        json={"organization_settings": target_settings},
        timeout=30,
    )
    assert save.status_code == 200

    response = admin_session.get(f"{BASE_URL}/api/organization/module-config", timeout=30)
    assert response.status_code == 200
    data = response.json()
    assert data["approval_workflow_enabled"] is True
    assert data["multi_level_approval_enabled"] is False
    assert data["esg_frameworks_enabled"] == ["GRI"]


def test_legacy_superadmin_endpoints_update_org_config_and_legacy_mirror(
    superadmin_session,
    mongo_db,
    restore_admin_org_settings,
):
    """Legacy ESG-framework/multi-level endpoints should write canonical org config and keep organization mirror updated."""
    toggle = superadmin_session.put(
        f"{BASE_URL}/api/super-admin/organizations/{ADMIN_ORG_ID}/multi-level-approval?enabled=true",
        timeout=30,
    )
    assert toggle.status_code == 200
    assert toggle.json()["multi_level_approval_enabled"] is True

    frameworks = superadmin_session.put(
        f"{BASE_URL}/api/super-admin/organizations/{ADMIN_ORG_ID}/esg-frameworks",
        json=["BRSR"],
        timeout=30,
    )
    assert frameworks.status_code == 200
    assert frameworks.json()["esg_frameworks_enabled"] == ["BRSR"]

    cfg = superadmin_session.get(
        f"{BASE_URL}/api/sustainability-config/org-config?org_id={ADMIN_ORG_ID}",
        timeout=30,
    )
    assert cfg.status_code == 200
    settings = cfg.json().get("organization_settings", {})
    assert settings.get("multi_level_approval_enabled") is True
    assert settings.get("esg_frameworks_enabled") == ["BRSR"]

    org = mongo_db["organizations"].find_one(
        {"id": ADMIN_ORG_ID},
        {"_id": 0, "multi_level_approval_enabled": 1, "esg_frameworks_enabled": 1},
    )
    assert org["multi_level_approval_enabled"] is True
    assert org["esg_frameworks_enabled"] == ["BRSR"]


def test_bruteforce_lockout_after_five_invalid_passwords():
    """Auth regression: valid-format email should be rate limited after repeated failures."""
    probe_email = f"lockout_probe_{uuid.uuid4().hex[:8]}@example.com"
    last_status = None
    for _ in range(6):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": probe_email, "password": "WrongPassword123!"},
            timeout=30,
        )
        last_status = response.status_code
    assert last_status == 429
