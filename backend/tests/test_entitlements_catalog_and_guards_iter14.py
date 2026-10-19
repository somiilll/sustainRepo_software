"""P0 entitlement catalog + guard wiring regression tests (read-only API checks)."""

import os
import subprocess
from pathlib import Path

import pytest
import requests
from modules.entitlements.service import normalize_entitlements


CANONICAL_ENTITLEMENT_KEYS = {
    "repo_pilot",
    "environment",
    "social",
    "governance",
    "materiality",
    "reporting",
    "workflow",
    "uploads",
    "targets",
    "reports",
    "mis_reports",
    "peer_benchmarking",
    "supplier_assessment",
    "audit_trails",
    "evidence_storage",
}

ADMIN_ORG_ID = "9067d872-8a3a-4ed9-8494-e3ef04952f7c"


@pytest.fixture(scope="session")
def base_url() -> str:
    """Environment-driven public backend base URL."""
    value = os.environ.get("REACT_APP_BACKEND_URL")
    if not value:
        pytest.skip("REACT_APP_BACKEND_URL is not set")
    return value.rstrip("/")


@pytest.fixture(scope="session")
def api_client() -> requests.Session:
    """Shared HTTP client."""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


def _extract_token(payload: dict) -> str:
    return payload.get("access_token") or payload.get("token") or ""


def _login(base_url: str, client: requests.Session, email: str, password: str) -> str:
    response = client.post(
        f"{base_url}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert response.status_code == 200, response.text
    token = _extract_token(response.json())
    assert isinstance(token, str) and token, "Missing access token"
    return token


@pytest.fixture(scope="session")
def super_admin_token(base_url: str, api_client: requests.Session) -> str:
    """Super admin auth token for org-config endpoint checks."""
    return _login(base_url, api_client, "superadmin@ecotrack.com", "TestUser123!")


@pytest.fixture(scope="session")
def admin_token(base_url: str, api_client: requests.Session) -> str:
    """Regular admin auth token for module-config and guarded module checks."""
    return _login(base_url, api_client, "goyalsomil2001@gmail.com", "TestUser123!")


def _assert_canonical_entitlements(entitlements: dict):
    assert isinstance(entitlements, dict)
    assert set(entitlements.keys()) == CANONICAL_ENTITLEMENT_KEYS
    assert len(entitlements) == 15
    assert all(isinstance(v, bool) for v in entitlements.values())
    assert "users" not in entitlements


def _assert_detailed_entitlement_schema(entitlements: dict):
    assert isinstance(entitlements, dict)
    assert set(entitlements.keys()) == CANONICAL_ENTITLEMENT_KEYS
    assert "users" not in entitlements
    assert entitlements["environment"]["ghg"]["coverage"] in {"scope_1_2", "scope_3", "scope_1_2_3"}
    assert "monthly_rows_allowed" in entitlements["environment"]["ghg"]
    assert "storage_limit_gb" in entitlements["evidence_storage"]


# Sustainability config API: canonical entitlement catalog after read migration.
def test_superadmin_org_config_returns_canonical_entitlements(
    base_url: str,
    api_client: requests.Session,
    super_admin_token: str,
):
    response = api_client.get(
        f"{base_url}/api/sustainability-config/org-config",
        params={"org_id": ADMIN_ORG_ID},
        headers={"Authorization": f"Bearer {super_admin_token}"},
        timeout=30,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data.get("organization_id") == ADMIN_ORG_ID
    _assert_detailed_entitlement_schema(data.get("entitlements") or {})


# Organization bootstrap API: regular admin sees same canonical entitlement catalog.
def test_admin_module_config_returns_canonical_entitlements(
    base_url: str,
    api_client: requests.Session,
    admin_token: str,
):
    response = api_client.get(
        f"{base_url}/api/organization/module-config",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=30,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    _assert_canonical_entitlements(data.get("entitlements") or {})
    permissions = data.get("permissions") or {}
    assert isinstance(permissions, dict)
    assert len(permissions.keys()) >= 20
    assert isinstance(permissions.get("targets"), bool)
    assert isinstance(permissions.get("targets.sbti"), bool)


# Consistency check between super-admin org-config and admin bootstrap payload.
def test_org_config_and_module_config_entitlements_match(
    base_url: str,
    api_client: requests.Session,
    super_admin_token: str,
    admin_token: str,
):
    admin_cfg = api_client.get(
        f"{base_url}/api/organization/module-config",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=30,
    )
    super_cfg = api_client.get(
        f"{base_url}/api/sustainability-config/org-config",
        params={"org_id": ADMIN_ORG_ID},
        headers={"Authorization": f"Bearer {super_admin_token}"},
        timeout=30,
    )
    assert admin_cfg.status_code == 200, admin_cfg.text
    assert super_cfg.status_code == 200, super_cfg.text
    admin_entitlements = (admin_cfg.json() or {}).get("entitlements") or {}
    super_entitlements = (super_cfg.json() or {}).get("entitlements") or {}
    _assert_canonical_entitlements(admin_entitlements)
    _assert_detailed_entitlement_schema(super_entitlements)
    assert admin_entitlements == normalize_entitlements(super_entitlements)


# Pydantic-level schema validation: positive limits only; null means unlimited.
def test_detailed_schema_limit_validation_rules():
    from modules.sustainability_config.contracts import EntitlementsConfig

    valid = EntitlementsConfig.model_validate({
        "environment": {"ghg": {"monthly_rows_allowed": None}, "energy": {"monthly_rows_allowed": 1}},
        "evidence_storage": {"enabled": True, "storage_limit_gb": None},
    })
    assert valid.environment.ghg.monthly_rows_allowed is None
    assert valid.environment.energy.monthly_rows_allowed == 1
    assert valid.evidence_storage.storage_limit_gb is None

    with pytest.raises(Exception):
        EntitlementsConfig.model_validate({"environment": {"ghg": {"monthly_rows_allowed": 0}}})

    with pytest.raises(Exception):
        EntitlementsConfig.model_validate({"evidence_storage": {"enabled": True, "storage_limit_gb": 0}})


# Guarded module reads should not mutate persisted entitlement settings.
def test_repo_sbti_mis_reads_do_not_mutate_entitlements(
    base_url: str,
    api_client: requests.Session,
    admin_token: str,
):
    headers = {"Authorization": f"Bearer {admin_token}"}

    before_resp = api_client.get(f"{base_url}/api/organization/module-config", headers=headers, timeout=30)
    assert before_resp.status_code == 200, before_resp.text
    before_entitlements = (before_resp.json() or {}).get("entitlements") or {}
    _assert_canonical_entitlements(before_entitlements)

    # Read-only calls (status may vary by org entitlement, but must not mutate settings).
    api_client.get(f"{base_url}/api/repo-pilot/documents", headers=headers, timeout=30)
    api_client.get(f"{base_url}/api/sbti-targets", headers=headers, timeout=30)
    api_client.get(f"{base_url}/api/mis-reports/catalog", headers=headers, timeout=30)

    after_resp = api_client.get(f"{base_url}/api/organization/module-config", headers=headers, timeout=30)
    assert after_resp.status_code == 200, after_resp.text
    after_entitlements = (after_resp.json() or {}).get("entitlements") or {}
    _assert_canonical_entitlements(after_entitlements)
    assert after_entitlements == before_entitlements


# Static resolver checks: Repo Pilot/SBTi/MIS routes resolve from canonical entitlements.
def test_repo_sbti_mis_resolvers_use_entitlements_contracts():
    repo_router = Path("/app/backend/modules/repo_pilot/router.py").read_text(encoding="utf-8")
    sbti_router = Path("/app/backend/modules/sbti_targets/router.py").read_text(encoding="utf-8")
    mis_router = Path("/app/backend/modules/mis_reports/router.py").read_text(encoding="utf-8")

    assert "await assert_entitlement(org_id, \"repo_pilot\")" in repo_router
    assert "await assert_entitlement(org_id, \"targets\")" in sbti_router
    assert "entitlements = await resolve_entitlements(organization_id, migrate=True)" in mis_router
    assert "mis_reports_enabled = entitlements[\"mis_reports\"]" in mis_router


# Server-level guard wiring: required modules must have shared entitlement dependencies.
def test_server_level_guard_wiring_for_required_routes():
    server_text = Path("/app/backend/server.py").read_text(encoding="utf-8")
    expected_include_lines = [
        'include_router(emissions_router, dependencies=[Depends(require_entitlement("environment"))])',
        'include_router(c7_router, dependencies=[Depends(require_entitlement("environment"))])',
        'include_router(hr_workforce_router, dependencies=[Depends(require_entitlement("social"))])',
        'include_router(governance_router, dependencies=[Depends(require_entitlement("governance"))])',
        'include_router(reports_router, dependencies=[Depends(require_entitlement("reports"))])',
        'include_router(approval_workflow_router, dependencies=[Depends(require_entitlement("workflow"))])',
        'include_router(proposal_router, dependencies=[Depends(require_entitlement("workflow"))])',
        'include_router(esg_tracking_router, dependencies=[Depends(require_entitlement("workflow"))])',
        'include_router(ocr_invoice_router, prefix="/ocr-invoice", tags=["OCR Invoice"], dependencies=[Depends(require_entitlement("uploads"))])',
        'include_router(materiality_router, tags=["Materiality Assessment"], dependencies=[Depends(require_entitlement("materiality"))])',
        'include_router(benchmarking_router, tags=["Peer Benchmarking"], dependencies=[Depends(require_entitlement("peer_benchmarking"))])',
        'include_router(supplier_assessment_router, tags=["Supplier Assessment"], dependencies=[Depends(require_entitlement("supplier_assessment"))])',
        'include_router(esg_targets_router, prefix="/esg-targets", tags=["ESG Targets"], dependencies=[Depends(require_entitlement("targets"))])',
        'include_router(repo_pilot_router, prefix="/repo-pilot", tags=["Repo Pilot"], dependencies=[Depends(require_entitlement("repo_pilot"))])',
        'include_router(brsr_report_router, tags=["BRSR Report"], dependencies=[Depends(require_entitlement("reporting"))])',
        # Required in this review: shared server-level guard for SBTi targets too.
        'include_router(sbti_targets_router, prefix="/sbti-targets", tags=["SBTi Targets"], dependencies=[Depends(require_entitlement("targets"))])',
    ]
    for line in expected_include_lines:
        assert line in server_text, f"Missing server-level guard wiring: {line}"


# Safety check: this scope must not alter calc_engine files.
def test_no_calc_engine_files_modified_in_git_status():
    status = subprocess.check_output(["git", "status", "--short"], cwd="/app", text=True)
    assert "backend/calc_engine" not in status
