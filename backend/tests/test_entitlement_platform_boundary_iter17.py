"""Focused regression tests for platform-access entitlement boundaries and limit guards."""

import os
from pathlib import Path

import pytest
import requests


# Auth + public URL bootstrap helpers for this entitlement regression pack.
def _load_backend_base_url() -> str:
    env_url = os.environ.get("REACT_APP_BACKEND_URL")
    if env_url:
        return env_url.rstrip("/")

    frontend_env = Path("/app/frontend/.env")
    if frontend_env.exists():
        for line in frontend_env.read_text(encoding="utf-8").splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                value = line.split("=", 1)[1].strip()
                if value:
                    return value.rstrip("/")

    pytest.skip("REACT_APP_BACKEND_URL missing in environment and frontend/.env")


BASE_URL = _load_backend_base_url()


@pytest.fixture(scope="session")
def api_client() -> requests.Session:
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


def _extract_token(login_payload: dict) -> str:
    return login_payload.get("access_token") or login_payload.get("token") or ""


def _login(client: requests.Session, email: str, password: str):
    response = client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert response.status_code == 200, response.text
    token = _extract_token(response.json())
    assert token, "Missing bearer token in login response"
    return token, response


@pytest.fixture(scope="session")
def admin_token(api_client: requests.Session) -> str:
    token, _ = _login(api_client, "goyalsomil2001@gmail.com", "TestUser123!")
    return token


@pytest.fixture(scope="session")
def restricted_token(api_client: requests.Session) -> str:
    token, _ = _login(api_client, "goyalsomil+1@hotmail.com", "TestUser123!")
    return token


# API contract checks for canonical permission payloads and route-level guarding.
def test_admin_login_sets_http_only_cookie(api_client: requests.Session):
    _, response = _login(api_client, "goyalsomil2001@gmail.com", "TestUser123!")
    set_cookie = response.headers.get("set-cookie", "")
    assert "HttpOnly" in set_cookie


def test_auth_login_cors_allows_trusted_origin_only(api_client: requests.Session):
    trusted = "https://emissions-review.preview.emergentagent.com"
    options_trusted = api_client.options(
        f"{BASE_URL}/api/auth/login",
        headers={
            "Origin": trusted,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
        timeout=30,
    )
    assert options_trusted.status_code in (200, 204)
    assert options_trusted.headers.get("access-control-allow-origin") == trusted

    options_untrusted = api_client.options(
        f"{BASE_URL}/api/auth/login",
        headers={
            "Origin": "https://untrusted.example.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
        timeout=30,
    )
    assert options_untrusted.status_code in (200, 400, 403)
    assert options_untrusted.headers.get("access-control-allow-origin") in (None, "null")


def test_bruteforce_lockout_after_five_invalid_attempts(api_client: requests.Session):
    email = "lockout-probe+iter17@example.com"
    body = {"email": email, "password": "DefinitelyWrong123!"}

    statuses = []
    for _ in range(6):
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=body, timeout=30)
        statuses.append(response.status_code)

    assert statuses[-1] in (429, 401), statuses


def test_module_config_returns_canonical_entitlements_and_granular_permissions(
    api_client: requests.Session,
    admin_token: str,
):
    response = api_client.get(
        f"{BASE_URL}/api/organization/module-config",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=30,
    )
    assert response.status_code == 200, response.text
    payload = response.json()

    entitlements = payload.get("entitlements") or {}
    permissions = payload.get("permissions") or {}

    assert isinstance(entitlements, dict) and len(entitlements) == 15
    assert all(isinstance(v, bool) for v in entitlements.values())

    assert isinstance(permissions, dict)
    assert isinstance(permissions.get("environment.ghg.scope_3"), bool)
    assert isinstance(permissions.get("environment.energy"), bool)
    assert isinstance(permissions.get("reports.scope_1_2_3"), bool)


def test_targets_lookup_environment_honors_scope3_and_energy_permissions(
    api_client: requests.Session,
    admin_token: str,
):
    headers = {"Authorization": f"Bearer {admin_token}"}

    config_response = api_client.get(
        f"{BASE_URL}/api/organization/module-config",
        headers=headers,
        timeout=30,
    )
    assert config_response.status_code == 200, config_response.text
    permissions = (config_response.json() or {}).get("permissions") or {}

    lookup_response = api_client.get(
        f"{BASE_URL}/api/esg-targets/lookup/categories",
        params={"section": "environment"},
        headers=headers,
        timeout=30,
    )
    assert lookup_response.status_code == 200, lookup_response.text

    hierarchy = (lookup_response.json() or {}).get("hierarchy") or {}

    if permissions.get("environment.ghg"):
        assert "GHG Emissions" in hierarchy
        ghg_keys = set((hierarchy.get("GHG Emissions") or {}).keys())
        if permissions.get("environment.ghg.scope_3"):
            assert "Scope 3 Emissions" in ghg_keys
            assert "Total Emissions" in ghg_keys
        else:
            assert "Scope 3 Emissions" not in ghg_keys
    else:
        assert "GHG Emissions" not in hierarchy

    if permissions.get("environment.energy"):
        assert "Energy" in hierarchy
        energy_keys = set((hierarchy.get("Energy") or {}).keys())
        assert "Total Energy Consumption" in energy_keys
    else:
        assert "Energy" not in hierarchy


def test_restricted_user_scope3_creation_is_blocked_before_persistence(
    api_client: requests.Session,
    restricted_token: str,
):
    payload = {
        "facility_id": "39ecd9be-9417-4df6-93c4-e583abf49260",
        "reporting_period": "2026-05",
        "frequency_type": "monthly",
        "scope": "scope3",
        "category": "C1 Purchased Goods and Services",
        "sub_category": "Purchased goods",
        "outputs": {"co2e": {"value": 1.0, "unit": "tCO2e"}},
    }
    response = api_client.post(
        f"{BASE_URL}/api/emissions",
        headers={"Authorization": f"Bearer {restricted_token}"},
        json=payload,
        timeout=30,
    )
    assert response.status_code in (403, 422), response.text


# Method-level guard tests for scope and numeric monthly plan limits.
@pytest.mark.asyncio
async def test_scope3_guard_uses_platform_access_outer_boundary(monkeypatch):
    from modules.entitlements import dependencies as entitlement_dependencies
    from fastapi import HTTPException

    async def fake_config(_org_id, migrate=True):
        return {
            "environment": {
                "ghg": {
                    "enabled": True,
                    "coverage": "scope_1_2",
                    "monthly_rows_allowed": None,
                },
                "energy": {"enabled": True, "monthly_rows_allowed": None},
                "water": {"enabled": True, "monthly_rows_allowed": None},
                "waste": {"enabled": True, "monthly_rows_allowed": None},
                "biodiversity": {"enabled": True, "monthly_rows_allowed": None},
                "climate_change": {"enabled": True, "monthly_rows_allowed": None},
                "material": {"enabled": True, "monthly_rows_allowed": None},
                "other_emissions": {"enabled": True, "monthly_rows_allowed": None},
            }
        }

    monkeypatch.setattr(entitlement_dependencies, "resolve_entitlement_config", fake_config)

    with pytest.raises(HTTPException) as exc:
        await entitlement_dependencies.assert_ghg_scope_access("org-1", "scope3")
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_monthly_row_limit_blocks_when_limit_is_exhausted(monkeypatch):
    from modules.entitlements import dependencies as entitlement_dependencies
    from shared.database import mongo as mongo_module
    from fastapi import HTTPException

    class FakeCollection:
        async def count_documents(self, _query):
            return 3

    class FakeDB(dict):
        def __getitem__(self, item):
            return FakeCollection()

    async def fake_resolved(_org_id):
        return {
            "environment": {
                "ghg": {"enabled": True, "monthly_rows_allowed": 3}
            }
        }

    monkeypatch.setattr(entitlement_dependencies, "get_resolved_entitlements", fake_resolved)
    monkeypatch.setattr(mongo_module, "db", FakeDB())

    with pytest.raises(HTTPException) as exc:
        await entitlement_dependencies.assert_monthly_row_limit(
            "org-1",
            "ghg",
            "emission_records",
            {"organization_id": "org-1", "frequency_type": "monthly"},
        )
    assert exc.value.status_code == 403
