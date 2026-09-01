"""Live regression checks for parent read-only supplier emission view endpoints."""

import copy
import os
import re
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

import pytest
import requests


def _read_env_value(path: str, key: str) -> Optional[str]:
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            candidate_key, value = line.split("=", 1)
            if candidate_key.strip() == key:
                return value.strip().strip('"').strip("'")
    return None


def _backend_base_url() -> str:
    base = os.environ.get("REACT_APP_BACKEND_URL") or _read_env_value("/app/frontend/.env", "REACT_APP_BACKEND_URL")
    if not base:
        pytest.skip("REACT_APP_BACKEND_URL unavailable for live checks")
    return base.rstrip("/")


def _credentials_from_memory() -> Dict[str, Dict[str, str]]:
    path = "/app/memory/test_credentials.md"
    if not os.path.exists(path):
        pytest.skip("/app/memory/test_credentials.md missing")

    text = Path(path).read_text(encoding="utf-8")
    blocks = re.split(r"\n## ", text)
    admin = supplier = None

    for index, block in enumerate(blocks):
        normalized = block if index == 0 else f"## {block}"
        email_match = re.search(r"\*\*Email\*\*:\s*([^\n]+)", normalized)
        password_match = re.search(r"\*\*Password\*\*:\s*([^\n]+)", normalized)
        if not email_match or not password_match:
            continue
        email = email_match.group(1).strip()
        password = password_match.group(1).strip()
        role = (re.search(r"\*\*Role\*\*:\s*([^\n]+)", normalized) or [None, ""])[1] if re.search(r"\*\*Role\*\*:\s*([^\n]+)", normalized) else ""
        user_type = (re.search(r"\*\*User Type\*\*:\s*([^\n]+)", normalized) or [None, ""])[1] if re.search(r"\*\*User Type\*\*:\s*([^\n]+)", normalized) else ""
        creds = {"email": email, "password": password}

        if role == "admin" and user_type != "supplier" and admin is None:
            admin = creds
        if user_type == "supplier" and supplier is None:
            supplier = creds

    if not admin:
        pytest.skip("Admin credentials unavailable in /app/memory/test_credentials.md")
    if not supplier:
        pytest.skip("Supplier credentials unavailable in /app/memory/test_credentials.md")
    return {"admin": admin, "supplier": supplier}


def _login(base_url: str, email: str, password: str) -> str:
    response = requests.post(
        f"{base_url}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert response.status_code == 200, f"Login failed for {email}: {response.status_code} {response.text[:300]}"
    payload = response.json()
    token = payload.get("access_token")
    assert token, f"No access_token returned for {email}"
    return token


def _headers(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _build_put_payload(rec: Dict[str, Any]) -> Dict[str, Any]:
    """Build a non-mutating PUT payload for /api/emissions/{id} from an existing record."""
    payload = {
        "scope": rec.get("scope"),
        "category": rec.get("category"),
        "category_id": rec.get("category_id"),
        "sub_category": rec.get("sub_category"),
        "fuel_type": rec.get("fuel_type"),
        "facility_id": rec.get("facility_id"),
        "reporting_period": rec.get("reporting_period"),
        "frequency_type": rec.get("frequency_type") or "monthly",
        "dynamic_field_values": copy.deepcopy(rec.get("dynamic_field_values") or {}),
        "outputs": copy.deepcopy(rec.get("outputs") or {}),
        "notes": rec.get("notes") or "",
        "evidence_files": rec.get("evidence_files") or [],
        "emission_factor": rec.get("emission_factor"),
        "is_custom_factor": rec.get("is_custom_factor", False),
        "process_names": rec.get("process_names") or [],
        "process_descriptions": rec.get("process_descriptions") or [],
        "responsible_person": rec.get("responsible_person") or "",
        "responsible_person_designation": rec.get("responsible_person_designation") or "",
        "responsible_person_contact": rec.get("responsible_person_contact") or "",
        "source_of_information": rec.get("source_of_information") or "",
        "scope3_activity": rec.get("scope3_activity"),
        "calculation_method_scope3": rec.get("calculation_method_scope3"),
        "biogenic_scope_selection": rec.get("biogenic_scope_selection"),
        "scope3_ef_id": rec.get("scope3_ef_id"),
    }
    return {k: v for k, v in payload.items() if v is not None}


@pytest.fixture(scope="module")
def ctx() -> Dict[str, Any]:
    base_url = _backend_base_url()
    creds = _credentials_from_memory()
    admin_token = _login(base_url, creds["admin"]["email"], creds["admin"]["password"])
    supplier_token = _login(base_url, creds["supplier"]["email"], creds["supplier"]["password"])

    parent_rows_response = requests.get(
        f"{base_url}/api/supplier-assessment/emissions/all",
        headers=_headers(admin_token),
        timeout=30,
    )
    assert parent_rows_response.status_code == 200, parent_rows_response.text[:300]
    rows = parent_rows_response.json().get("emissions") or []
    if not rows:
        pytest.skip("No submitted supplier emissions available for parent in this environment")
    candidate = rows[0]
    evidence_candidate = next((row for row in rows if (row.get("evidence_files") or [])), None)

    supplier_rows_response = requests.get(
        f"{base_url}/api/supplier-assessment/my-assessment/emissions",
        headers=_headers(supplier_token),
        timeout=30,
    )
    assert supplier_rows_response.status_code == 200, supplier_rows_response.text[:300]
    supplier_rows = supplier_rows_response.json() or []
    draft = next((row for row in supplier_rows if not row.get("submitted_to_parent_org")), None)

    return {
        "base_url": base_url,
        "admin_token": admin_token,
        "supplier_token": supplier_token,
        "submitted_emission": candidate,
        "submitted_emission_with_evidence": evidence_candidate,
        "supplier_draft": draft,
    }


# Module: authenticated parent access and response contract for read-only emission detail.
def test_parent_detail_returns_visible_submitted_record_without_raw_evidence_url(ctx: Dict[str, Any]):
    emission_id = ctx["submitted_emission"]["id"]
    response = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/emissions/{emission_id}",
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert response.status_code == 200, response.text[:300]
    payload = response.json()

    assert payload.get("id") == emission_id
    assert payload.get("source") == "supplier"
    assert payload.get("submitted_to_parent_org")
    assert "evidence_url" not in payload
    assert "evidence_file_name" not in payload
    assert isinstance(payload.get("evidence_files"), list)
    for file_meta in payload.get("evidence_files", []):
        assert isinstance(file_meta.get("id"), str)
        assert isinstance(file_meta.get("original_filename"), str)
        assert "content_type" in file_meta
        assert "file_size" in file_meta


# Module: unauthenticated access control guard for parent detail endpoint.
def test_parent_detail_rejects_unauthenticated_request(ctx: Dict[str, Any]):
    emission_id = ctx["submitted_emission"]["id"]
    response = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/emissions/{emission_id}",
        timeout=30,
    )
    assert response.status_code in (401, 403), response.text[:300]


# Module: parent detail endpoint must hide non-parent-visible or non-submitted records.
def test_parent_detail_returns_not_found_for_non_parent_visible_or_non_submitted_id(ctx: Dict[str, Any]):
    target_id = (ctx.get("supplier_draft") or {}).get("id") or str(uuid.uuid4())
    response = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/emissions/{target_id}",
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert response.status_code in (403, 404), response.text[:300]


# Module: secure evidence view/download links from the read-only parent detail record.
def test_parent_detail_evidence_endpoint_returns_secure_links_when_evidence_exists(ctx: Dict[str, Any]):
    evidence_row = ctx.get("submitted_emission_with_evidence")
    if not evidence_row:
        pytest.skip("No submitted supplier emission with evidence_files found for parent in this environment")

    emission_id = evidence_row["id"]
    detail_response = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/emissions/{emission_id}",
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert detail_response.status_code == 200, detail_response.text[:300]
    detail_payload = detail_response.json()

    evidence_files = detail_payload.get("evidence_files") or []
    if not evidence_files:
        pytest.skip("Selected submitted emission has no evidence_files in this environment")

    file_id = evidence_files[0]["id"]
    view_response = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/emissions/{emission_id}/evidence/{file_id}",
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert view_response.status_code == 200, view_response.text[:300]
    view_payload = view_response.json()
    assert isinstance(view_payload.get("url"), str) and view_payload["url"].startswith("http")
    assert view_payload.get("filename")

    download_response = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/emissions/{emission_id}/evidence/{file_id}",
        params={"download": "true"},
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert download_response.status_code == 200, download_response.text[:300]
    download_payload = download_response.json()
    assert isinstance(download_payload.get("url"), str) and download_payload["url"].startswith("http")
    assert download_payload.get("filename") == view_payload.get("filename")


# Module: global emission update endpoint must reject parent edits against supplier-submitted records.
def test_global_put_rejects_parent_edit_attempt_for_supplier_submitted_record(ctx: Dict[str, Any]):
    emission_id = ctx["submitted_emission"]["id"]

    before_response = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/emissions/{emission_id}",
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert before_response.status_code == 200, before_response.text[:300]
    before_payload = before_response.json()

    global_get = requests.get(
        f"{ctx['base_url']}/api/emissions/{emission_id}",
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    if global_get.status_code == 200:
        put_payload = _build_put_payload(global_get.json())
    elif global_get.status_code in (401, 403):
        # Authorization is already denying record-level access on global emissions route.
        # Build best-effort non-mutating payload from parent detail to verify PUT stays rejected.
        put_payload = _build_put_payload(before_payload)
    else:
        pytest.skip(f"Could not establish precondition on /api/emissions/{{id}}: status={global_get.status_code}")

    put_response = requests.put(
        f"{ctx['base_url']}/api/emissions/{emission_id}",
        headers=_headers(ctx["admin_token"]),
        json=put_payload,
        timeout=30,
    )

    if put_response.status_code == 422:
        pytest.skip(
            "Could not establish a safe non-mutating payload shape for /api/emissions/{id}; "
            "authorization guard could not be validated via PUT in this run"
        )
    assert put_response.status_code in (401, 403, 404, 409), put_response.text[:300]

    after_response = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/emissions/{emission_id}",
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert after_response.status_code == 200, after_response.text[:300]
    after_payload = after_response.json()
    assert after_payload.get("id") == before_payload.get("id")
    assert after_payload.get("submitted_to_parent_org") == before_payload.get("submitted_to_parent_org")
    assert after_payload.get("total_emissions") == before_payload.get("total_emissions")
