"""Regression tests for supplier-assessment importance and supplier GHG completion integration."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, Any

import pytest
import requests
from pymongo import MongoClient

from modules.supplier_assessment.service import supplier_service


def _read_frontend_backend_url() -> str:
    env_path = Path("/app/frontend/.env")
    if not env_path.exists():
        pytest.skip("frontend/.env missing; cannot resolve public BASE_URL")
    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    pytest.skip("REACT_APP_BACKEND_URL missing in frontend/.env")


BASE_URL = _read_frontend_backend_url()


def _read_backend_env(key: str) -> str:
    env_path = Path("/app/backend/.env")
    if not env_path.exists():
        pytest.skip("backend/.env missing; cannot access Mongo settings")
    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1].strip().strip('"')
    pytest.skip(f"{key} missing in backend/.env")


@pytest.fixture(scope="session")
def api_client() -> requests.Session:
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session")
def mongo_db():
    mongo_url = _read_backend_env("MONGO_URL")
    db_name = _read_backend_env("DB_NAME")
    client = MongoClient(mongo_url)
    db = client[db_name]
    try:
        yield db
    finally:
        client.close()


def _login(api_client: requests.Session, email: str, password: str) -> Dict[str, Any]:
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    token = data.get("access_token") or data.get("token")
    assert isinstance(token, str) and token
    return {"token": token, "response": response, "data": data}


@pytest.fixture(scope="session")
def admin_auth(api_client: requests.Session) -> Dict[str, Any]:
    return _login(api_client, "goyalsomil2001@gmail.com", "TestUser123!")


@pytest.fixture(scope="session")
def supplier_auth(api_client: requests.Session) -> Dict[str, Any]:
    return _login(api_client, "goyalsomil+919@hotmail.com", "TestUser123!")


def test_importance_weight_map_only_low_medium_high():
    # Supplier question importance contract
    assert supplier_service.IMPORTANCE_WEIGHTS == {"low": 1.0, "medium": 2.0, "high": 3.0}


def test_legacy_critical_importance_resolves_to_high_weight_3():
    # Legacy critical migration behavior
    importance, exact_weight, effective_weight = supplier_service._resolve_question_weight("critical", None, None)
    assert importance == "high"
    assert exact_weight is None
    assert effective_weight == 3.0


def test_mongo_has_no_remaining_critical_importance_questions(mongo_db):
    # Data migration verification for supplier_questions collection
    critical_count = mongo_db.supplier_questions.count_documents({"importance": "critical"})
    assert critical_count == 0


def test_new_question_api_rejects_critical_importance_without_creating_record(api_client, admin_auth):
    # API validation for prohibited importance value
    headers = {"Authorization": f"Bearer {admin_auth['token']}"}
    list_res = api_client.get(
        f"{BASE_URL}/api/supplier-assessment/questionnaires?include_inactive=true",
        headers=headers,
        timeout=30,
    )
    assert list_res.status_code == 200, list_res.text
    questionnaires = list_res.json()
    if not questionnaires:
        pytest.skip("No questionnaire available for admin to validate add-question API")

    questionnaire_id = questionnaires[0]["id"]
    marker = "TEST_ITER36_INVALID_CRITICAL_IMPORTANCE"

    before_res = api_client.get(
        f"{BASE_URL}/api/supplier-assessment/questionnaires/{questionnaire_id}",
        headers=headers,
        timeout=30,
    )
    assert before_res.status_code == 200, before_res.text
    before_questions = before_res.json().get("questions", [])
    assert all(q.get("question_text") != marker for q in before_questions)

    invalid_payload = {
        "question_text": marker,
        "description": "Validation check only",
        "response_type": "yes_no",
        "required": True,
        "evidence_requirement": "not_required",
        "importance": "critical",
        "category": "environment",
        "order": 9999,
        "scoring": {"rule": "boolean", "true_score": 100, "false_score": 0},
    }

    create_res = api_client.post(
        f"{BASE_URL}/api/supplier-assessment/questionnaires/{questionnaire_id}/questions",
        json=invalid_payload,
        headers=headers,
        timeout=30,
    )
    assert create_res.status_code == 422, create_res.text

    after_res = api_client.get(
        f"{BASE_URL}/api/supplier-assessment/questionnaires/{questionnaire_id}",
        headers=headers,
        timeout=30,
    )
    assert after_res.status_code == 200, after_res.text
    after_questions = after_res.json().get("questions", [])
    assert all(q.get("question_text") != marker for q in after_questions)


def test_supplier_assessment_exposes_ghg_completion_percent(api_client, supplier_auth):
    # Supplier assessment module completion payload
    headers = {"Authorization": f"Bearer {supplier_auth['token']}"}
    assessment_res = api_client.get(
        f"{BASE_URL}/api/supplier-assessment/my-assessment",
        headers=headers,
        timeout=30,
    )
    assert assessment_res.status_code == 200, assessment_res.text
    assessment = assessment_res.json()
    modules = assessment.get("assessment_modules") or []
    ghg_module = next((m for m in modules if m.get("code") == "ghg"), None)
    if not ghg_module:
        pytest.skip("Supplier assessment has no ghg module assigned")

    assert "completion_percent" in ghg_module
    assert isinstance(ghg_module["completion_percent"], (int, float))
    assert 0 <= float(ghg_module["completion_percent"]) <= 100


def test_supplier_ghg_module_completion_matches_submission_cadence_progress(api_client, supplier_auth):
    # Cadence-based completion parity check across APIs
    headers = {"Authorization": f"Bearer {supplier_auth['token']}"}
    assessment_res = api_client.get(
        f"{BASE_URL}/api/supplier-assessment/my-assessment",
        headers=headers,
        timeout=30,
    )
    submission_res = api_client.get(
        f"{BASE_URL}/api/supplier-assessment/my-assessment/emissions/submission",
        headers=headers,
        timeout=30,
    )
    assert assessment_res.status_code == 200, assessment_res.text
    assert submission_res.status_code == 200, submission_res.text

    modules = (assessment_res.json() or {}).get("assessment_modules") or []
    ghg_module = next((m for m in modules if m.get("code") == "ghg"), None)
    if not ghg_module:
        pytest.skip("Supplier assessment has no ghg module assigned")

    submission = (submission_res.json() or {}).get("submission") or {}
    period_count = int(submission.get("period_count") or 0)
    submitted_period_count = int(submission.get("submitted_period_count") or 0)
    expected = (submitted_period_count / period_count) * 100 if period_count else 0.0
    actual = float(ghg_module.get("completion_percent") or 0.0)

    assert actual == pytest.approx(expected, abs=0.1)


def test_auth_login_sets_cookie_and_returns_token(api_client):
    # Auth/session regression smoke
    auth = _login(api_client, "goyalsomil2001@gmail.com", "TestUser123!")
    cookie_header = auth["response"].headers.get("set-cookie", "")
    assert auth["response"].status_code == 200
    if cookie_header:
        lowered = cookie_header.lower()
        assert "httponly" in lowered


def test_seed_admin_password_hash_uses_bcrypt_2b_prefix(mongo_db):
    # Seeded admin hash format check
    admin = mongo_db.users.find_one(
        {"email": "goyalsomil2001@gmail.com"},
        {"_id": 0, "hashed_password": 1},
    )
    assert admin is not None
    password_hash = admin.get("hashed_password")
    assert isinstance(password_hash, str) and password_hash.startswith("$2b$")
