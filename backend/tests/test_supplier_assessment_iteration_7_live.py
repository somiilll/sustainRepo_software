"""Live, non-destructive verification for supplier assessment document/GHG/ESG contracts."""

import os
import re

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

    text = open(path, "r", encoding="utf-8").read()
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


# Module: Supplier Documents STATUS flow immutability + assignment guards
def test_supplier_documents_status_requires_explicit_submit_contract(live_ctx):
    base_url = live_ctx["base_url"]
    response = requests.get(
        f"{base_url}/api/supplier-assessment/my-assessment/documents",
        headers=_supplier_headers(live_ctx),
        timeout=30,
    )
    assert response.status_code == 200, response.text[:300]
    documents = response.json()
    assert isinstance(documents, list)

    status_docs = [doc for doc in documents if doc.get("response_mode") == "STATUS"]
    if not status_docs:
        pytest.skip("No STATUS documents assigned to supplier in current dataset")

    doc = status_docs[0]
    assert isinstance(doc.get("response_options"), list)
    assert len(doc.get("response_options")) > 0

    # Explicit submit payload is required; missing response_value should fail validation.
    invalid = requests.post(
        f"{base_url}/api/supplier-assessment/my-assessment/documents/{doc['id']}/respond",
        json={},
        headers=_supplier_headers(live_ctx),
        timeout=30,
    )
    assert invalid.status_code == 422, invalid.text[:300]


# Module: Backend lock enforcement for already-submitted STATUS responses
def test_submitted_status_response_cannot_be_changed(live_ctx):
    base_url = live_ctx["base_url"]
    list_response = requests.get(
        f"{base_url}/api/supplier-assessment/my-assessment/documents",
        headers=_supplier_headers(live_ctx),
        timeout=30,
    )
    assert list_response.status_code == 200, list_response.text[:300]
    documents = list_response.json()

    submitted_status_docs = [
        doc for doc in documents
        if doc.get("response_mode") == "STATUS" and isinstance(doc.get("selected_response"), str) and doc.get("selected_response")
    ]
    if not submitted_status_docs:
        pytest.skip("No already-submitted STATUS response found to verify immutability")

    doc = submitted_status_docs[0]
    options = doc.get("response_options") or []
    replacement = next((opt for opt in options if opt != doc.get("selected_response")), None)
    if not replacement:
        pytest.skip("No alternate response option available to verify lock behavior")

    attempt = requests.post(
        f"{base_url}/api/supplier-assessment/my-assessment/documents/{doc['id']}/respond",
        json={"response_value": replacement},
        headers=_supplier_headers(live_ctx),
        timeout=30,
    )
    assert attempt.status_code == 400, attempt.text[:300]
    detail = (attempt.json() or {}).get("detail", "")
    assert "locked" in detail.lower()

    verify = requests.get(
        f"{base_url}/api/supplier-assessment/my-assessment/documents",
        headers=_supplier_headers(live_ctx),
        timeout=30,
    )
    assert verify.status_code == 200, verify.text[:300]
    after = next((row for row in verify.json() if row.get("id") == doc["id"]), None)
    assert after is not None
    assert after.get("selected_response") == doc.get("selected_response")


# Module: Targeted supplier access control on selected document assignments
def test_unselected_supplier_cannot_view_document_requirement(live_ctx):
    base_url = live_ctx["base_url"]
    admin_documents = requests.get(
        f"{base_url}/api/supplier-assessment/documents",
        headers=_admin_headers(live_ctx),
        timeout=30,
    )
    assert admin_documents.status_code == 200, admin_documents.text[:300]
    docs = admin_documents.json()
    assert isinstance(docs, list)

    non_assigned = next(
        (
            doc
            for doc in docs
            if isinstance(doc.get("supplier_relationship_ids"), list)
            and len(doc.get("supplier_relationship_ids")) > 0
            and live_ctx["relationship_id"] not in doc.get("supplier_relationship_ids")
        ),
        None,
    )
    if not non_assigned:
        pytest.skip("No selected-supplier document exists where current supplier is intentionally unassigned")

    denied = requests.get(
        f"{base_url}/api/supplier-assessment/my-assessment/documents/{non_assigned['id']}/view",
        headers=_supplier_headers(live_ctx),
        timeout=30,
    )
    assert denied.status_code == 404, denied.text[:300]


# Module: Supplier GHG submission API contract + parent snapshot-only behavior
def test_ghg_submission_route_and_parent_snapshot_reading(live_ctx):
    base_url = live_ctx["base_url"]
    supplier_state = requests.get(
        f"{base_url}/api/supplier-assessment/my-assessment/emissions/submission",
        headers=_supplier_headers(live_ctx),
        timeout=30,
    )
    assert supplier_state.status_code == 200, supplier_state.text[:300]
    state_payload = supplier_state.json()
    assert "entries" in state_payload and isinstance(state_payload.get("entries"), list)
    assert "draft_aggregation" in state_payload and isinstance(state_payload.get("draft_aggregation"), list)
    assert "submission" in state_payload
    assert "can_submit" in state_payload

    parent = requests.get(
        f"{base_url}/api/supplier-assessment/emissions/all",
        headers=_admin_headers(live_ctx),
        timeout=30,
    )
    assert parent.status_code == 200, parent.text[:300]
    parent_payload = parent.json()
    assert isinstance(parent_payload.get("emissions"), list)
    assert isinstance(parent_payload.get("aggregations"), list)

    # Parent-facing emissions should carry submission metadata (coming from snapshot submissions).
    for row in parent_payload.get("emissions", []):
        assert "submitted_at" in row

    # Non-destructive snapshot-only check: drafts should not be shown in admin supplier-emissions route.
    if state_payload.get("submission") is None and len(state_payload.get("entries") or []) > 0:
        admin_supplier = requests.get(
            f"{base_url}/api/supplier-assessment/suppliers/{live_ctx['relationship_id']}/emissions",
            headers=_admin_headers(live_ctx),
            timeout=30,
        )
        assert admin_supplier.status_code == 200, admin_supplier.text[:300]
        assert (admin_supplier.json().get("summary") or {}).get("record_count") == 0


# Module: ESG questionnaire final submission lock + admin draft visibility restrictions
def test_esg_submitted_lock_and_admin_draft_exclusion(live_ctx):
    base_url = live_ctx["base_url"]
    supplier_questionnaires = requests.get(
        f"{base_url}/api/supplier-assessment/my-assessment/questionnaires",
        headers=_supplier_headers(live_ctx),
        timeout=30,
    )
    assert supplier_questionnaires.status_code == 200, supplier_questionnaires.text[:300]
    statuses = supplier_questionnaires.json()
    assert isinstance(statuses, list)

    submitted_row = next((row for row in statuses if row.get("status") == "submitted"), None)
    if submitted_row:
        lock_attempt = requests.post(
            f"{base_url}/api/supplier-assessment/my-assessment/questionnaires/{submitted_row['questionnaire_id']}/answers",
            json={"answers": [], "is_draft": True},
            headers=_supplier_headers(live_ctx),
            timeout=30,
        )
        assert lock_attempt.status_code == 409, lock_attempt.text[:300]
        detail = (lock_attempt.json() or {}).get("detail", "")
        assert "locked" in detail.lower() or "submitted" in detail.lower()

    draft_row = next((row for row in statuses if row.get("status") == "in_progress"), None)
    if not draft_row:
        pytest.skip("No in-progress questionnaire found for admin draft visibility exclusion check")

    admin_draft_read = requests.get(
        f"{base_url}/api/supplier-assessment/suppliers/{live_ctx['relationship_id']}/questionnaires/{draft_row['questionnaire_id']}/responses",
        headers=_admin_headers(live_ctx),
        timeout=30,
    )
    assert admin_draft_read.status_code == 404, admin_draft_read.text[:300]
