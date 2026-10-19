"""Live, non-destructive checks for immutable supplier submission and parent unlock guards."""

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
    credentials_path = Path("/app/memory/test_credentials.md")
    if not credentials_path.exists():
        pytest.skip("/app/memory/test_credentials.md missing")

    text = credentials_path.read_text(encoding="utf-8")
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


# Module: login/auth sanity for both required accounts
def test_admin_and_supplier_login_work(live_ctx):
    assert isinstance(live_ctx.get("admin_token"), str) and len(live_ctx["admin_token"]) > 20
    assert isinstance(live_ctx.get("supplier_token"), str) and len(live_ctx["supplier_token"]) > 20


# Module: supplier GHG submission state and parent submitted-only read contract
def test_ghg_submission_state_and_parent_view_contract(live_ctx):
    base_url = live_ctx["base_url"]

    supplier_state = requests.get(
        f"{base_url}/api/supplier-assessment/my-assessment/emissions/submission",
        headers=_supplier_headers(live_ctx),
        timeout=30,
    )
    assert supplier_state.status_code == 200, supplier_state.text[:300]
    state = supplier_state.json()
    assert isinstance(state.get("entries"), list)
    assert isinstance(state.get("draft_aggregation"), list)
    assert "submission" in state
    assert isinstance(state.get("can_submit"), bool)

    parent_view = requests.get(
        f"{base_url}/api/supplier-assessment/emissions/all",
        headers=_admin_headers(live_ctx),
        timeout=30,
    )
    assert parent_view.status_code == 200, parent_view.text[:300]
    parent = parent_view.json()
    assert isinstance(parent.get("emissions"), list)
    assert isinstance(parent.get("supplier_totals"), list)
    assert isinstance(parent.get("aggregations"), list)

    for emission in parent.get("emissions", []):
        assert emission.get("submitted_to_parent_org")
        assert emission.get("submission_id")
        assert emission.get("submitted_at")


# Module: ESG lock behavior on submitted questionnaire from supplier side
def test_esg_submitted_response_rejects_supplier_edit_attempt(live_ctx):
    base_url = live_ctx["base_url"]
    statuses_response = requests.get(
        f"{base_url}/api/supplier-assessment/my-assessment/questionnaires",
        headers=_supplier_headers(live_ctx),
        timeout=30,
    )
    assert statuses_response.status_code == 200, statuses_response.text[:300]
    statuses = statuses_response.json()
    assert isinstance(statuses, list)

    submitted = next((row for row in statuses if row.get("status") == "submitted"), None)
    if not submitted:
        pytest.skip("No submitted supplier questionnaire available to verify immutable edit rejection")

    edit_attempt = requests.post(
        f"{base_url}/api/supplier-assessment/my-assessment/questionnaires/{submitted['questionnaire_id']}/answers",
        json={"answers": [], "is_draft": True},
        headers=_supplier_headers(live_ctx),
        timeout=30,
    )
    assert edit_attempt.status_code == 409, edit_attempt.text[:300]
    detail = (edit_attempt.json() or {}).get("detail", "")
    assert "submitted" in detail.lower() or "locked" in detail.lower()


# Module: ESG unlock endpoint auth-protected + no-op when no submitted record exists
def test_admin_esg_unlock_auth_and_non_submitted_no_mutation(live_ctx):
    base_url = live_ctx["base_url"]
    statuses_response = requests.get(
        f"{base_url}/api/supplier-assessment/my-assessment/questionnaires",
        headers=_supplier_headers(live_ctx),
        timeout=30,
    )
    assert statuses_response.status_code == 200, statuses_response.text[:300]
    statuses = statuses_response.json()

    target = next((row for row in statuses if row.get("status") == "in_progress"), None)
    if not target:
        pytest.skip("No in-progress questionnaire available to validate non-submitted unlock no-op")

    supplier_forbidden = requests.post(
        f"{base_url}/api/supplier-assessment/suppliers/{live_ctx['relationship_id']}/questionnaires/{target['questionnaire_id']}/reopen",
        headers=_supplier_headers(live_ctx),
        timeout=30,
    )
    assert supplier_forbidden.status_code == 403, supplier_forbidden.text[:300]

    before = requests.get(
        f"{base_url}/api/supplier-assessment/my-assessment/questionnaires/{target['questionnaire_id']}",
        headers=_supplier_headers(live_ctx),
        timeout=30,
    )
    assert before.status_code == 200, before.text[:300]
    before_payload = before.json()
    before_status = before_payload.get("response_status")

    admin_noop = requests.post(
        f"{base_url}/api/supplier-assessment/suppliers/{live_ctx['relationship_id']}/questionnaires/{target['questionnaire_id']}/reopen",
        headers=_admin_headers(live_ctx),
        timeout=30,
    )
    assert admin_noop.status_code == 400, admin_noop.text[:300]
    detail = (admin_noop.json() or {}).get("detail", "")
    assert "reopen" in detail.lower() or "submitted" in detail.lower()

    after = requests.get(
        f"{base_url}/api/supplier-assessment/my-assessment/questionnaires/{target['questionnaire_id']}",
        headers=_supplier_headers(live_ctx),
        timeout=30,
    )
    assert after.status_code == 200, after.text[:300]
    assert after.json().get("response_status") == before_status


# Module: submitted document response remains immutable against alternate response
def test_submitted_document_response_rejects_supplier_change(live_ctx):
    base_url = live_ctx["base_url"]
    docs_response = requests.get(
        f"{base_url}/api/supplier-assessment/my-assessment/documents",
        headers=_supplier_headers(live_ctx),
        timeout=30,
    )
    assert docs_response.status_code == 200, docs_response.text[:300]
    docs = docs_response.json()
    assert isinstance(docs, list)

    submitted_status_doc = next(
        (
            doc
            for doc in docs
            if doc.get("response_mode") == "STATUS" and isinstance(doc.get("selected_response"), str) and doc.get("selected_response")
        ),
        None,
    )
    if not submitted_status_doc:
        pytest.skip("No submitted STATUS-mode document found to test immutability")

    options = submitted_status_doc.get("response_options") or []
    alternate = next((option for option in options if option != submitted_status_doc.get("selected_response")), None)
    if not alternate:
        pytest.skip("No alternate status option available to verify lock")

    edit_attempt = requests.post(
        f"{base_url}/api/supplier-assessment/my-assessment/documents/{submitted_status_doc['id']}/respond",
        json={"response_value": alternate},
        headers=_supplier_headers(live_ctx),
        timeout=30,
    )
    assert edit_attempt.status_code == 400, edit_attempt.text[:300]
    detail = (edit_attempt.json() or {}).get("detail", "")
    assert "locked" in detail.lower()


# Module: document unlock endpoint auth and eligibility constraints
def test_admin_document_unlock_auth_and_requires_eligible_submission(live_ctx):
    base_url = live_ctx["base_url"]
    docs_response = requests.get(
        f"{base_url}/api/supplier-assessment/my-assessment/documents",
        headers=_supplier_headers(live_ctx),
        timeout=30,
    )
    assert docs_response.status_code == 200, docs_response.text[:300]
    docs = docs_response.json()

    unsubmitted_doc = next(
        (
            doc
            for doc in docs
            if not doc.get("selected_response")
            and not doc.get("accepted")
            and doc.get("submission_status") != "reopened"
        ),
        None,
    )
    if not unsubmitted_doc:
        pytest.skip("No unsubmitted assigned document available to validate unlock eligibility guard")

    supplier_forbidden = requests.post(
        f"{base_url}/api/supplier-assessment/suppliers/{live_ctx['relationship_id']}/documents/{unsubmitted_doc['id']}/reopen",
        headers=_supplier_headers(live_ctx),
        timeout=30,
    )
    assert supplier_forbidden.status_code == 403, supplier_forbidden.text[:300]

    admin_ineligible = requests.post(
        f"{base_url}/api/supplier-assessment/suppliers/{live_ctx['relationship_id']}/documents/{unsubmitted_doc['id']}/reopen",
        headers=_admin_headers(live_ctx),
        timeout=30,
    )
    assert admin_ineligible.status_code == 400, admin_ineligible.text[:300]
    detail = (admin_ineligible.json() or {}).get("detail", "")
    assert "no submitted" in detail.lower() or "unlock" in detail.lower()


# Module: GHG unlock endpoint auth-protected and only for submitted datasets
def test_admin_ghg_unlock_auth_and_requires_real_submitted_dataset(live_ctx):
    base_url = live_ctx["base_url"]

    supplier_forbidden = requests.post(
        f"{base_url}/api/supplier-assessment/suppliers/{live_ctx['relationship_id']}/emissions/reopen",
        headers=_supplier_headers(live_ctx),
        timeout=30,
    )
    assert supplier_forbidden.status_code == 403, supplier_forbidden.text[:300]

    state_response = requests.get(
        f"{base_url}/api/supplier-assessment/my-assessment/emissions/submission",
        headers=_supplier_headers(live_ctx),
        timeout=30,
    )
    assert state_response.status_code == 200, state_response.text[:300]
    state = state_response.json()

    if not state.get("submission"):
        admin_ineligible = requests.post(
            f"{base_url}/api/supplier-assessment/suppliers/{live_ctx['relationship_id']}/emissions/reopen",
            headers=_admin_headers(live_ctx),
            timeout=30,
        )
        assert admin_ineligible.status_code == 400, admin_ineligible.text[:300]
        detail = (admin_ineligible.json() or {}).get("detail", "")
        assert "no submitted" in detail.lower() or "unlock" in detail.lower()
    else:
        # Non-mutating check: if already reopened, endpoint must prevent duplicate unlock attempts.
        if state["submission"].get("status") == "reopened":
            duplicate_unlock = requests.post(
                f"{base_url}/api/supplier-assessment/suppliers/{live_ctx['relationship_id']}/emissions/reopen",
                headers=_admin_headers(live_ctx),
                timeout=30,
            )
            assert duplicate_unlock.status_code == 400, duplicate_unlock.text[:300]
            detail = (duplicate_unlock.json() or {}).get("detail", "")
            assert "already unlocked" in detail.lower() or "unlock" in detail.lower()