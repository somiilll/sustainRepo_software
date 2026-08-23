"""Read-only live regression checks for simplified supplier GHG submission persistence."""

import os
import re
from pathlib import Path

import pytest
import requests


def _read_env_value(path: str, key: str):
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            if k.strip() == key:
                return v.strip().strip('"').strip("'")
    return None


def _backend_base_url() -> str:
    base = os.environ.get("REACT_APP_BACKEND_URL") or _read_env_value("/app/frontend/.env", "REACT_APP_BACKEND_URL")
    if not base:
        pytest.skip("REACT_APP_BACKEND_URL unavailable for live checks")
    return base.rstrip("/")


def _credentials_from_memory():
    path = "/app/memory/test_credentials.md"
    if not os.path.exists(path):
        pytest.skip("/app/memory/test_credentials.md missing")

    text = Path(path).read_text(encoding="utf-8")
    blocks = re.split(r"\n## ", text)
    admin_email = admin_password = supplier_email = supplier_password = None

    for index, block in enumerate(blocks):
        normalized = block if index == 0 else f"## {block}"
        email_match = re.search(r"\*\*Email\*\*:\s*([^\n]+)", normalized)
        password_match = re.search(r"\*\*Password\*\*:\s*([^\n]+)", normalized)
        if not email_match or not password_match:
            continue
        email = email_match.group(1).strip()
        password = password_match.group(1).strip()
        role_match = re.search(r"\*\*Role\*\*:\s*([^\n]+)", normalized)
        user_type_match = re.search(r"\*\*User Type\*\*:\s*([^\n]+)", normalized)
        role = role_match.group(1).strip() if role_match else ""
        user_type = user_type_match.group(1).strip() if user_type_match else ""

        if role == "admin" and user_type != "supplier" and admin_email is None:
            admin_email, admin_password = email, password
        if user_type == "supplier" and supplier_email is None:
            supplier_email, supplier_password = email, password

    if not all([admin_email, admin_password, supplier_email, supplier_password]):
        pytest.skip("Could not parse admin/supplier credentials from test_credentials.md")

    return {
        "admin": {"email": admin_email, "password": admin_password},
        "supplier": {"email": supplier_email, "password": supplier_password},
    }


def _login(base_url: str, email: str, password: str) -> str:
    response = requests.post(
        f"{base_url}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert response.status_code == 200, f"Login failed for {email}: {response.status_code} {response.text[:300]}"
    token = response.json().get("access_token")
    assert token, f"No access_token returned for {email}"
    return token


@pytest.fixture(scope="module")
def live_ctx():
    base_url = _backend_base_url()
    creds = _credentials_from_memory()
    admin_token = _login(base_url, creds["admin"]["email"], creds["admin"]["password"])
    supplier_token = _login(base_url, creds["supplier"]["email"], creds["supplier"]["password"])

    supplier_assessment = requests.get(
        f"{base_url}/api/supplier-assessment/my-assessment",
        headers={"Authorization": f"Bearer {supplier_token}"},
        timeout=30,
    )
    assert supplier_assessment.status_code == 200, supplier_assessment.text[:300]
    relationship = supplier_assessment.json().get("relationship") or {}
    relationship_id = relationship.get("id")
    assert relationship_id

    return {
        "base_url": base_url,
        "admin_token": admin_token,
        "supplier_token": supplier_token,
        "relationship_id": relationship_id,
    }


def _admin_headers(ctx):
    return {"Authorization": f"Bearer {ctx['admin_token']}"}


def _supplier_headers(ctx):
    return {"Authorization": f"Bearer {ctx['supplier_token']}"}


# Module: code hygiene checks for removed runtime collections
def test_runtime_has_no_supplier_ghg_removed_collection_references():
    root = Path("/app")
    patterns = ("supplier_ghg_entries", "supplier_ghg_submissions")
    target_dirs = [root / "backend" / "modules", root / "frontend" / "src"]
    matches = []

    for target_dir in target_dirs:
        for file_path in target_dir.rglob("*"):
            if file_path.suffix not in {".py", ".js", ".jsx", ".ts", ".tsx"}:
                continue
            text = file_path.read_text(encoding="utf-8", errors="ignore")
            for pattern in patterns:
                if pattern in text:
                    matches.append(f"{file_path}: {pattern}")

    assert matches == [], f"Found removed collection references: {matches}"


# Module: supplier draft-state endpoint contract on emission_records
def test_supplier_submission_state_exposes_emission_records_as_drafts(live_ctx):
    base_url = live_ctx["base_url"]

    state_response = requests.get(
        f"{base_url}/api/supplier-assessment/my-assessment/emissions/submission",
        headers=_supplier_headers(live_ctx),
        timeout=30,
    )
    assert state_response.status_code == 200, state_response.text[:300]
    state_payload = state_response.json()

    emissions_response = requests.get(
        f"{base_url}/api/supplier-assessment/my-assessment/emissions",
        headers=_supplier_headers(live_ctx),
        timeout=30,
    )
    assert emissions_response.status_code == 200, emissions_response.text[:300]
    emissions_payload = emissions_response.json()

    assert isinstance(state_payload.get("entries"), list)
    assert isinstance(state_payload.get("draft_aggregation"), list)
    assert isinstance(emissions_payload, list)
    assert len(state_payload["entries"]) == len(emissions_payload)

    for row in state_payload["draft_aggregation"]:
        assert isinstance(row.get("scope"), str)
        assert isinstance(row.get("entry_count"), int)
        assert isinstance(row.get("total_emissions"), (int, float))

    # If legacy scope1 drafts exist in current data, they must remain as drafts and aggregate > 0.
    scope1_draft_total = sum(
        float(row.get("total_emissions") or 0)
        for row in state_payload.get("draft_aggregation", [])
        if row.get("scope") == "scope1"
    )
    if any((entry.get("scope") == "scope1" and not entry.get("submitted_to_parent_org")) for entry in state_payload["entries"]):
        assert scope1_draft_total > 0


# Module: parent endpoint must return submitted-only supplier emissions
def test_parent_emissions_all_returns_submitted_only_and_excludes_supplier_drafts(live_ctx):
    base_url = live_ctx["base_url"]

    supplier_state_response = requests.get(
        f"{base_url}/api/supplier-assessment/my-assessment/emissions/submission",
        headers=_supplier_headers(live_ctx),
        timeout=30,
    )
    assert supplier_state_response.status_code == 200, supplier_state_response.text[:300]
    supplier_state = supplier_state_response.json()

    parent_response = requests.get(
        f"{base_url}/api/supplier-assessment/emissions/all",
        headers=_admin_headers(live_ctx),
        timeout=30,
    )
    assert parent_response.status_code == 200, parent_response.text[:300]
    parent_payload = parent_response.json()

    assert isinstance(parent_payload.get("emissions"), list)
    assert isinstance(parent_payload.get("supplier_totals"), list)
    assert isinstance(parent_payload.get("aggregations"), list)
    assert isinstance(parent_payload.get("grand_total"), (int, float))

    for entry in parent_payload["emissions"]:
        assert entry.get("submitted_to_parent_org")
        assert entry.get("submission_id")
        assert entry.get("submitted_at")

    unsubmitted_ids = {
        row["id"]
        for row in supplier_state.get("entries", [])
        if row.get("id") and not row.get("submitted_to_parent_org")
    }
    parent_ids = {row.get("id") for row in parent_payload["emissions"] if row.get("id")}
    assert unsubmitted_ids.isdisjoint(parent_ids)
