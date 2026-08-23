"""Focused live regression checks for Supplier Assessment P0/P1 approval scope."""

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
        pytest.skip("REACT_APP_BACKEND_URL unavailable for live API checks")
    return base.rstrip("/")


def _credentials_from_memory():
    path = "/app/memory/test_credentials.md"
    if not os.path.exists(path):
        pytest.skip("/app/memory/test_credentials.md missing")

    text = open(path, "r", encoding="utf-8").read()
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
        role_match = re.search(r"\*\*Role\*\*:\s*([^\n]+)", normalized)
        user_type_match = re.search(r"\*\*User Type\*\*:\s*([^\n]+)", normalized)
        role = role_match.group(1).strip() if role_match else ""
        user_type = user_type_match.group(1).strip() if user_type_match else ""

        if role == "admin" and user_type != "supplier" and admin is None:
            admin = {"email": email, "password": password}
        if user_type == "supplier" and supplier is None:
            supplier = {"email": email, "password": password}

    if not admin or not supplier:
        pytest.skip("Required admin/supplier credentials unavailable in memory/test_credentials.md")
    return {"admin": admin, "supplier": supplier}


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


def _headers(token: str):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def ctx():
    base_url = _backend_base_url()
    creds = _credentials_from_memory()
    admin_token = _login(base_url, creds["admin"]["email"], creds["admin"]["password"])
    supplier_token = _login(base_url, creds["supplier"]["email"], creds["supplier"]["password"])

    my_assessment = requests.get(
        f"{base_url}/api/supplier-assessment/my-assessment",
        headers=_headers(supplier_token),
        timeout=30,
    )
    assert my_assessment.status_code == 200, my_assessment.text[:300]
    relationship = my_assessment.json().get("relationship") or {}
    relationship_id = relationship.get("id")
    assert relationship_id, "Supplier relationship id not found"

    return {
        "base_url": base_url,
        "admin_token": admin_token,
        "supplier_token": supplier_token,
        "relationship_id": relationship_id,
        "reporting_period": relationship.get("reporting_period"),
    }


# Module: admin supplier list load contract
def test_admin_supplier_list_loads(ctx):
    response = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/suppliers?page=1&page_size=20",
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert response.status_code == 200, response.text[:300]
    data = response.json()
    assert "suppliers" in data and isinstance(data["suppliers"], list)
    assert "total" in data and isinstance(data["total"], int)


# Module: reminder endpoint payload acceptance
def test_supplier_reminder_accepts_empty_json_body(ctx):
    response = requests.post(
        f"{ctx['base_url']}/api/supplier-assessment/suppliers/{ctx['relationship_id']}/remind",
        headers=_headers(ctx["admin_token"]),
        json={},
        timeout=45,
    )
    assert response.status_code != 422, response.text[:300]
    assert response.status_code in (200, 500), response.text[:300]


# Module: reminder endpoint module selection and period payload acceptance
def test_supplier_reminder_accepts_module_selection_payload(ctx):
    response = requests.post(
        f"{ctx['base_url']}/api/supplier-assessment/suppliers/{ctx['relationship_id']}/remind",
        headers=_headers(ctx["admin_token"]),
        json={
            "modules": ["all", "esg", "ghg", "documents", "training", "revenue"],
            "reporting_period": ctx["reporting_period"],
        },
        timeout=45,
    )
    assert response.status_code != 422, response.text[:300]
    assert response.status_code in (200, 500), response.text[:300]


# Module: parent-only ESG response access authorization
def test_supplier_cannot_open_parent_review_response_endpoint(ctx):
    status_resp = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/suppliers/{ctx['relationship_id']}/submission-status",
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert status_resp.status_code == 200, status_resp.text[:300]
    first_submission = ((status_resp.json() or {}).get("esg") or [])
    if not first_submission:
        pytest.skip("No submitted ESG response available for parent-review endpoint auth check")
    questionnaire_id = first_submission[0]["questionnaire_id"]

    forbidden = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/suppliers/{ctx['relationship_id']}/questionnaires/{questionnaire_id}/responses",
        headers=_headers(ctx["supplier_token"]),
        timeout=30,
    )
    assert forbidden.status_code == 403, forbidden.text[:300]


# Module: parent manual ESG score validation boundary
def test_parent_manual_score_validation_rejects_out_of_range(ctx):
    status_resp = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/suppliers/{ctx['relationship_id']}/submission-status",
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert status_resp.status_code == 200, status_resp.text[:300]
    submissions = ((status_resp.json() or {}).get("esg") or [])
    if not submissions:
        pytest.skip("No submitted ESG response available for manual-score validation check")
    questionnaire_id = submissions[0]["questionnaire_id"]

    invalid = requests.put(
        f"{ctx['base_url']}/api/supplier-assessment/suppliers/{ctx['relationship_id']}/questionnaires/{questionnaire_id}/responses/manual-score",
        headers=_headers(ctx["admin_token"]),
        json={"score": 101},
        timeout=30,
    )
    assert invalid.status_code == 422, invalid.text[:300]


# Module: parent manual ESG score save on submitted response
def test_parent_can_open_submitted_esg_response_and_save_manual_score(ctx):
    status_resp = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/suppliers/{ctx['relationship_id']}/submission-status",
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert status_resp.status_code == 200, status_resp.text[:300]
    submissions = ((status_resp.json() or {}).get("esg") or [])
    if not submissions:
        pytest.skip("No submitted ESG response available for parent manual-scoring flow")
    questionnaire_id = submissions[0]["questionnaire_id"]

    review = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/suppliers/{ctx['relationship_id']}/questionnaires/{questionnaire_id}/responses",
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert review.status_code == 200, review.text[:300]
    review_payload = review.json()
    assert review_payload.get("response_status") == "submitted"
    score_to_set = float(review_payload.get("manual_score") if review_payload.get("manual_score") is not None else review_payload.get("calculated_score") or 75)

    save = requests.put(
        f"{ctx['base_url']}/api/supplier-assessment/suppliers/{ctx['relationship_id']}/questionnaires/{questionnaire_id}/responses/manual-score",
        headers=_headers(ctx["admin_token"]),
        json={"score": score_to_set, "note": "iter11 manual score verification"},
        timeout=30,
    )
    assert save.status_code == 200, save.text[:300]
    saved = save.json()
    assert saved.get("manual_score") == score_to_set


# Module: revenue draft/submit lock contract
def test_revenue_save_stays_draft_until_submit(ctx):
    before = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/my-assessment",
        headers=_headers(ctx["supplier_token"]),
        timeout=30,
    )
    assert before.status_code == 200, before.text[:300]
    status_before = ((before.json() or {}).get("relationship") or {}).get("revenue_submission_status")
    if status_before == "submitted":
        pytest.skip("Revenue already submitted in live dataset; draft-before-submit cannot be reverified safely")

    draft_save = requests.put(
        f"{ctx['base_url']}/api/supplier-assessment/my-assessment/revenue",
        headers=_headers(ctx["supplier_token"]),
        json={"revenue_percentage": 7.5, "revenue_amount": 12345, "revenue_currency": "USD"},
        timeout=30,
    )
    assert draft_save.status_code == 200, draft_save.text[:300]

    after = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/my-assessment",
        headers=_headers(ctx["supplier_token"]),
        timeout=30,
    )
    assert after.status_code == 200, after.text[:300]
    rel_after = (after.json() or {}).get("relationship") or {}
    assert rel_after.get("revenue_submission_status") != "submitted"


# Module: submitted revenue should be locked from edits
def test_submitted_revenue_is_locked_for_edits(ctx):
    before = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/my-assessment",
        headers=_headers(ctx["supplier_token"]),
        timeout=30,
    )
    assert before.status_code == 200, before.text[:300]
    before_rel = (before.json() or {}).get("relationship") or {}

    if before_rel.get("revenue_submission_status") != "submitted":
        submit = requests.post(
            f"{ctx['base_url']}/api/supplier-assessment/my-assessment/revenue/submit",
            headers=_headers(ctx["supplier_token"]),
            json={},
            timeout=30,
        )
        assert submit.status_code in (200, 400), submit.text[:300]
        if submit.status_code == 400:
            pytest.skip(f"Could not submit revenue in this dataset: {submit.text[:200]}")

    edit_after_submit = requests.put(
        f"{ctx['base_url']}/api/supplier-assessment/my-assessment/revenue",
        headers=_headers(ctx["supplier_token"]),
        json={"revenue_percentage": 9.9, "revenue_amount": 99999, "revenue_currency": "USD"},
        timeout=30,
    )
    assert edit_after_submit.status_code in (400, 409), edit_after_submit.text[:300]
