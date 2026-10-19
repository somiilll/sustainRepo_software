"""Live, non-mutating checks for supplier GHG revision history and visibility contracts."""

import os
from pathlib import Path
import re
import uuid

import pytest
import requests


def _resolve_base_url() -> str:
    env_url = (os.environ.get("REACT_APP_BACKEND_URL") or "").strip()
    if env_url:
        return env_url.rstrip("/")

    frontend_env = Path("/app/frontend/.env")
    if frontend_env.exists():
        for raw_line in frontend_env.read_text().splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            if key.strip() == "REACT_APP_BACKEND_URL":
                return value.strip().rstrip("/")
    return ""


BASE_URL = _resolve_base_url()


def _credentials_from_memory():
    credentials_path = Path("/app/memory/test_credentials.md")
    if not credentials_path.exists():
        pytest.skip("/app/memory/test_credentials.md missing")

    credentials = {}
    for block in re.split(r"\n## ", credentials_path.read_text(encoding="utf-8")):
        email_match = re.search(r"\*\*Email\*\*:\s*([^\n]+)", block)
        password_match = re.search(r"\*\*Password\*\*:\s*([^\n]+)", block)
        role_match = re.search(r"\*\*Role\*\*:\s*([^\n]+)", block)
        user_type_match = re.search(r"\*\*User Type\*\*:\s*([^\n]+)", block)
        if not email_match or not password_match:
            continue
        key = "supplier" if user_type_match and user_type_match.group(1).strip() == "supplier" else role_match.group(1).strip() if role_match else ""
        if key in {"supplier", "admin"} and key not in credentials:
            credentials[key] = (email_match.group(1).strip(), password_match.group(1).strip())

    if "supplier" not in credentials or "admin" not in credentials:
        pytest.skip("Supplier and admin test credentials are required")
    return credentials


@pytest.fixture(scope="session")
def api_base_url():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL is missing")
    return BASE_URL


@pytest.fixture(scope="session")
def supplier_session(api_base_url):
    session = requests.Session()
    email, password = _credentials_from_memory()["supplier"]
    login = session.post(
        f"{api_base_url}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert login.status_code == 200, f"Supplier login failed: {login.status_code} {login.text}"
    token = login.json().get("access_token")
    assert token, "Missing access_token in supplier login response"
    session.headers.update({"Authorization": f"Bearer {token}"})
    return session


@pytest.fixture(scope="session")
def admin_session(api_base_url):
    session = requests.Session()
    email, password = _credentials_from_memory()["admin"]
    login = session.post(
        f"{api_base_url}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert login.status_code == 200, f"Admin login failed: {login.status_code} {login.text}"
    token = login.json().get("access_token")
    assert token, "Missing access_token in admin login response"
    session.headers.update({"Authorization": f"Bearer {token}"})
    return session


def test_supplier_emissions_hide_non_current_revisions_when_current_exists(supplier_session, api_base_url):
    """/my-assessment/emissions should not expose old revisions if current revision exists for same lineage."""
    response = supplier_session.get(
        f"{api_base_url}/api/supplier-assessment/my-assessment/emissions", timeout=30
    )
    assert response.status_code == 200, f"Unexpected status: {response.status_code} {response.text}"
    emissions = response.json()
    assert isinstance(emissions, list)

    lineages = {}
    for item in emissions:
        lineage_id = item.get("revision_lineage_id")
        if not lineage_id:
            continue
        lineages.setdefault(lineage_id, []).append(item)

    violating_lineages = []
    for lineage_id, rows in lineages.items():
        has_current = any(row.get("is_current_revision") is True for row in rows)
        has_non_current = any(row.get("is_current_revision") is False for row in rows)
        if has_current and has_non_current:
            violating_lineages.append(lineage_id)

    assert violating_lineages == [], f"Found mixed current+non-current rows in visible logs: {violating_lineages}"


def test_supplier_revision_history_unknown_record_returns_404(supplier_session, api_base_url):
    """Unknown supplier record ID should return not found."""
    unknown_id = f"unknown-{uuid.uuid4()}"
    response = supplier_session.get(
        f"{api_base_url}/api/supplier-assessment/my-assessment/emissions/{unknown_id}/revisions",
        timeout=30,
    )
    assert response.status_code == 404
    data = response.json()
    assert "detail" in data


def test_supplier_revision_history_requires_supplier_auth(admin_session, api_base_url):
    """Customer admin token must not be allowed to hit supplier self-service revisions endpoint."""
    response = admin_session.get(
        f"{api_base_url}/api/supplier-assessment/my-assessment/emissions/unknown/revisions",
        timeout=30,
    )
    assert response.status_code == 403
    data = response.json()
    assert "detail" in data


def test_supplier_revision_history_contract_for_existing_supplier_source_record(supplier_session, api_base_url):
    """If supplier-source record exists, revision history payload must expose lineage/current/revisions and no Mongo _id."""
    emissions_resp = supplier_session.get(
        f"{api_base_url}/api/supplier-assessment/my-assessment/emissions", timeout=30
    )
    assert emissions_resp.status_code == 200
    emissions = emissions_resp.json()
    supplier_rows = [row for row in emissions if row.get("source") == "supplier"]
    if not supplier_rows:
        pytest.skip("No supplier-source emissions visible for this account")

    emission_id = supplier_rows[0]["id"]
    response = supplier_session.get(
        f"{api_base_url}/api/supplier-assessment/my-assessment/emissions/{emission_id}/revisions",
        timeout=30,
    )
    assert response.status_code == 200, f"Unexpected status: {response.status_code} {response.text}"

    payload = response.json()
    assert isinstance(payload.get("lineage_id"), str)
    assert payload.get("current_revision_id")
    assert isinstance(payload.get("revisions"), list)

    for revision in payload["revisions"]:
        assert "_id" not in revision
        assert "lineage_id" in revision
        assert "revision_number" in revision
        assert "is_current_revision" in revision
