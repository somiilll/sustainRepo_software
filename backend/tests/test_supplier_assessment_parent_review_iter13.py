"""Live API regression checks for parent ESG response review + per-question manual scoring."""

import os
import re
import uuid
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
        pytest.skip("REACT_APP_BACKEND_URL is not available")
    return base.rstrip("/")


def _credentials_from_memory() -> Dict[str, Dict[str, str]]:
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
        role_match = re.search(r"\*\*Role\*\*:\s*([^\n]+)", normalized)
        user_type_match = re.search(r"\*\*User Type\*\*:\s*([^\n]+)", normalized)
        role = role_match.group(1).strip() if role_match else ""
        user_type = user_type_match.group(1).strip() if user_type_match else ""
        creds = {"email": email_match.group(1).strip(), "password": password_match.group(1).strip()}
        if role == "admin" and user_type != "supplier" and admin is None:
            admin = creds
        if user_type == "supplier" and supplier is None:
            supplier = creds
    if not admin:
        pytest.skip("Admin credentials unavailable in /app/memory/test_credentials.md")
    return {"admin": admin, "supplier": supplier or {}}


def _login(base_url: str, email: str, password: str) -> requests.Response:
    response = requests.post(
        f"{base_url}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert response.status_code == 200, f"Login failed: {response.status_code} {response.text[:300]}"
    return response


def _headers(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def ctx() -> Dict[str, Any]:
    # Module: admin auth bootstrap + reporting period lookup
    base_url = _backend_base_url()
    creds = _credentials_from_memory()
    login_response = _login(base_url, creds["admin"]["email"], creds["admin"]["password"])
    token = login_response.json().get("access_token")
    assert token, "Missing access_token in login response"

    periods_response = requests.get(
        f"{base_url}/api/supplier-assessment/reporting-periods",
        headers=_headers(token),
        timeout=30,
    )
    assert periods_response.status_code == 200, periods_response.text[:300]
    periods_payload = periods_response.json()
    return {
        "base_url": base_url,
        "token": token,
        "reporting_period": periods_payload.get("default_period"),
        "created_questionnaire_id": None,
    }


@pytest.fixture(scope="module")
def review_candidate(ctx: Dict[str, Any]) -> Dict[str, Any]:
    # Module: discover submitted supplier ESG response for parent review flow
    questionnaires = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/questionnaires",
        headers=_headers(ctx["token"]),
        timeout=30,
    )
    assert questionnaires.status_code == 200, questionnaires.text[:300]

    for questionnaire in questionnaires.json() or []:
        submissions = requests.get(
            f"{ctx['base_url']}/api/supplier-assessment/questionnaires/{questionnaire['id']}/submissions",
            params={"reporting_period": ctx["reporting_period"]},
            headers=_headers(ctx["token"]),
            timeout=30,
        )
        if submissions.status_code != 200:
            continue
        rows = submissions.json().get("submissions") or []
        for submission in rows:
            response = requests.get(
                f"{ctx['base_url']}/api/supplier-assessment/suppliers/{submission['supplier_id']}/questionnaires/{questionnaire['id']}/responses",
                headers=_headers(ctx["token"]),
                timeout=30,
            )
            if response.status_code != 200:
                continue
            payload = response.json()
            questions = payload.get("questions") or []
            manual_question = next((q for q in questions if (q.get("scoring") or {}).get("rule") == "manual"), None)
            non_manual_question = next((q for q in questions if (q.get("scoring") or {}).get("rule") != "manual"), None)
            if manual_question and non_manual_question:
                return {
                    "questionnaire_id": questionnaire["id"],
                    "supplier_id": submission["supplier_id"],
                    "response": payload,
                    "manual_question": manual_question,
                    "non_manual_question": non_manual_question,
                }
    pytest.skip(
        "No submitted response with both manual and non-manual questions for current period; "
        "environment data limitation"
    )


def test_admin_can_access_esg_questionnaire_list(ctx: Dict[str, Any]):
    # Module: admin access to ESG questionnaire listing
    response = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/questionnaires",
        headers=_headers(ctx["token"]),
        timeout=30,
    )
    assert response.status_code == 200, response.text[:300]
    payload = response.json()
    assert isinstance(payload, list)
    if payload:
        assert isinstance(payload[0].get("id"), str)
        assert isinstance(payload[0].get("name"), str)


def test_questionnaire_create_without_scoring_method_no_500(ctx: Dict[str, Any]):
    # Module: questionnaire creation fallback when scoring_method omitted
    create_payload = {
        "name": f"TEST_ParentReview_NoMethod_{str(uuid.uuid4())[:8]}",
        "description": "TEST questionnaire for no-scoring-method regression",
        "esg_section_weights": {"environment": 34, "social": 33, "governance": 33},
        "overall_supplier_weights": {"esg": 40, "ghg": 40, "revenue": 20},
    }
    created = requests.post(
        f"{ctx['base_url']}/api/supplier-assessment/questionnaires",
        json=create_payload,
        headers=_headers(ctx["token"]),
        timeout=30,
    )
    assert created.status_code != 500, created.text[:300]
    assert created.status_code == 200, created.text[:300]
    created_payload = created.json()
    ctx["created_questionnaire_id"] = created_payload.get("id")
    assert created_payload.get("scoring_method") == "question"


def test_review_submissions_action_returns_parent_visible_rows(ctx: Dict[str, Any], review_candidate: Dict[str, Any]):
    # Module: parent review submissions endpoint contract
    response = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/questionnaires/{review_candidate['questionnaire_id']}/submissions",
        params={"reporting_period": ctx["reporting_period"]},
        headers=_headers(ctx["token"]),
        timeout=30,
    )
    assert response.status_code == 200, response.text[:300]
    payload = response.json()
    assert isinstance(payload.get("submissions"), list)
    assert any(item.get("supplier_id") == review_candidate["supplier_id"] for item in payload["submissions"])


def test_admin_can_open_supplier_response_from_review_list(ctx: Dict[str, Any], review_candidate: Dict[str, Any]):
    # Module: open supplier response details from parent review list
    response = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/suppliers/{review_candidate['supplier_id']}/questionnaires/{review_candidate['questionnaire_id']}/responses",
        headers=_headers(ctx["token"]),
        timeout=30,
    )
    assert response.status_code == 200, response.text[:300]
    payload = response.json()
    assert payload.get("id") == review_candidate["questionnaire_id"]
    assert isinstance(payload.get("questions"), list)
    assert any((question.get("scoring") or {}).get("rule") == "manual" for question in payload["questions"])


def test_manual_score_endpoint_rejects_non_manual_question(ctx: Dict[str, Any], review_candidate: Dict[str, Any]):
    # Module: manual-score guard rejects non-manual questions
    non_manual_question_id = review_candidate["non_manual_question"]["id"]
    response = requests.put(
        f"{ctx['base_url']}/api/supplier-assessment/suppliers/{review_candidate['supplier_id']}/questionnaires/{review_candidate['questionnaire_id']}/questions/{non_manual_question_id}/manual-score",
        json={"score": 55},
        headers=_headers(ctx["token"]),
        timeout=30,
    )
    assert response.status_code == 400, response.text[:300]
    assert "manual" in response.text.lower()


def test_manual_score_endpoint_validates_range(ctx: Dict[str, Any], review_candidate: Dict[str, Any]):
    # Module: manual-score validation accepts only 0..100
    manual_question_id = review_candidate["manual_question"]["id"]
    response = requests.put(
        f"{ctx['base_url']}/api/supplier-assessment/suppliers/{review_candidate['supplier_id']}/questionnaires/{review_candidate['questionnaire_id']}/questions/{manual_question_id}/manual-score",
        json={"score": 101},
        headers=_headers(ctx["token"]),
        timeout=30,
    )
    assert response.status_code in (400, 422), response.text[:300]


def test_saved_manual_question_score_recalculates_and_updates_breakdown(ctx: Dict[str, Any], review_candidate: Dict[str, Any]):
    # Module: save per-question manual score + recalc + parent-visible score breakdown update
    manual_question = review_candidate["manual_question"]
    question_id = manual_question["id"]
    original_score = manual_question.get("manual_score")
    score_to_set = float(original_score) if original_score is not None else 73.0

    save_response = requests.put(
        f"{ctx['base_url']}/api/supplier-assessment/suppliers/{review_candidate['supplier_id']}/questionnaires/{review_candidate['questionnaire_id']}/questions/{question_id}/manual-score",
        json={"score": score_to_set},
        headers=_headers(ctx["token"]),
        timeout=30,
    )
    assert save_response.status_code == 200, save_response.text[:300]
    save_payload = save_response.json()
    assert isinstance(save_payload.get("score_breakdown"), dict)
    assert isinstance(save_payload.get("calculated_score"), (float, int))
    question_scores = save_payload["score_breakdown"].get("question_scores") or []
    scored_row = next((item for item in question_scores if item.get("question_id") == question_id), None)
    assert scored_row is not None
    details = scored_row.get("calculation_details") or {}
    assert details.get("score_source") == "parent_manual_review"
    assert float(details.get("manual_score")) == score_to_set

    refreshed_response = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/suppliers/{review_candidate['supplier_id']}/questionnaires/{review_candidate['questionnaire_id']}/responses",
        headers=_headers(ctx["token"]),
        timeout=30,
    )
    assert refreshed_response.status_code == 200, refreshed_response.text[:300]
    refreshed_payload = refreshed_response.json()
    refreshed_question = next((q for q in (refreshed_payload.get("questions") or []) if q.get("id") == question_id), None)
    assert refreshed_question is not None
    assert float(refreshed_question.get("manual_score")) == score_to_set
    assert isinstance(refreshed_payload.get("canonical_score_snapshot"), dict)


@pytest.fixture(scope="module", autouse=True)
def cleanup(ctx: Dict[str, Any]):
    yield
    if ctx.get("created_questionnaire_id"):
        requests.delete(
            f"{ctx['base_url']}/api/supplier-assessment/questionnaires/{ctx['created_questionnaire_id']}",
            headers=_headers(ctx["token"]),
            timeout=30,
        )
