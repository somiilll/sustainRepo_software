"""Regression tests for org config null ESG frameworks behavior (unit + live API)."""

import os

import pytest
import requests

from modules.organizations.contracts import OrganizationCreate
from modules.sustainability_config.service import normalize_organization_settings


# Module/feature under test: sustainability_config org settings normalization + organizations contract defaults.
TESTING_ORG_ID = "5dddcee5-af1e-4c3a-9188-91f1816f1226"
SUPER_ADMIN_EMAIL = "superadmin@ecotrack.com"
SUPER_ADMIN_PASSWORD = "TestUser123!"


def _base_url() -> str:
    base = os.environ.get("REACT_APP_BACKEND_URL")
    if not base:
        pytest.skip("REACT_APP_BACKEND_URL not set")
    return base.rstrip("/")


def test_normalize_organization_settings_converts_null_frameworks_to_empty_list():
    normalized = normalize_organization_settings({"esg_frameworks_enabled": None})
    assert normalized["esg_frameworks_enabled"] == []


def test_organization_create_converts_explicit_null_frameworks_to_empty_list():
    organization = OrganizationCreate(
        name="TEST_NullFrameworksOrg",
        corporate_address="TEST_Address",
        subscription_expires_at="2026-12-31",
        esg_frameworks_enabled=None,
    )
    assert organization.esg_frameworks_enabled == []


def test_org_config_endpoint_returns_empty_framework_list_for_testing_org():
    base_url = _base_url()
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})

    login_response = session.post(
        f"{base_url}/api/auth/login",
        json={"email": SUPER_ADMIN_EMAIL, "password": SUPER_ADMIN_PASSWORD},
        timeout=30,
    )
    if login_response.status_code != 200:
        pytest.skip(f"Super admin login failed: {login_response.status_code}")

    token = login_response.json().get("access_token")
    if not token:
        pytest.skip("No access token returned for super admin login")

    response = session.get(
        f"{base_url}/api/sustainability-config/org-config",
        params={"org_id": TESTING_ORG_ID},
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )

    assert response.status_code == 200
    payload = response.json()
    settings = payload.get("organization_settings") or {}
    assert settings.get("esg_frameworks_enabled") == []
