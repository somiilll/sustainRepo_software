"""Live regression tests for supplier-assessment evidence visibility and ESG evidence enforcement."""

import os
import re
import uuid
from typing import Any, Dict, Optional

import pytest
import requests


# Module: shared test bootstrapping (env + credentials + auth)
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

    admin_match = re.search(
        r"##\s+Admin Account[\s\S]*?\*\*Email\*\*:\s*([^\n]+)[\s\S]*?\*\*Password\*\*:\s*([^\n]+)",
        text,
    )
    supplier_match = re.search(
        r"##\s+Supplier Account[\s\S]*?\*\*Email\*\*:\s*([^\n]+)[\s\S]*?\*\*Password\*\*:\s*([^\n]+)",
        text,
    )
    if not admin_match or not supplier_match:
        pytest.skip("Admin/Supplier credentials missing in /app/memory/test_credentials.md")
    return {
        "admin": {"email": admin_match.group(1).strip(), "password": admin_match.group(2).strip()},
        "supplier": {"email": supplier_match.group(1).strip(), "password": supplier_match.group(2).strip()},
    }


def _login(base_url: str, email: str, password: str) -> Dict[str, Any]:
    response = requests.post(
        f"{base_url}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert response.status_code == 200, f"Login failed for {email}: {response.status_code} {response.text[:300]}"
    payload = response.json()
    token = payload.get("access_token") or payload.get("token")
    assert token, f"No token in login payload keys={list(payload.keys())}"
    return payload


def _headers(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def ctx() -> Dict[str, Any]:
    base_url = _backend_base_url()
    creds = _credentials_from_memory()

    admin_login = _login(base_url, creds["admin"]["email"], creds["admin"]["password"])
    supplier_login = _login(base_url, creds["supplier"]["email"], creds["supplier"]["password"])
    admin_token = admin_login.get("access_token") or admin_login.get("token")
    supplier_token = supplier_login.get("access_token") or supplier_login.get("token")

    suppliers = requests.get(
        f"{base_url}/api/supplier-assessment/suppliers?page=1&page_size=100",
        headers=_headers(admin_token),
        timeout=30,
    )
    assert suppliers.status_code == 200, suppliers.text[:300]
    supplier_rows = suppliers.json().get("suppliers") or []
    supplier_relationship = next(
        (row for row in supplier_rows if (row.get("contact_email") or "").lower() == creds["supplier"]["email"].lower()),
        None,
    )
    if not supplier_relationship:
        pytest.skip("Supplier relationship not found for supplier credentials in this environment")

    # Module: disposable questionnaire + questions setup for evidence_requirement contract and submit enforcement
    questionnaire_payload = {
        "name": f"TEST_Evidence_Iter24_{str(uuid.uuid4())[:8]}",
        "description": "Disposable questionnaire for evidence contract tests",
        "assignment_mode": "selected",
        "supplier_relationship_ids": [supplier_relationship["id"]],
        "esg_section_weights": {"environment": 34, "social": 33, "governance": 33},
        "overall_supplier_weights": {"esg": 40, "ghg": 40, "revenue": 20},
    }
    create_questionnaire = requests.post(
        f"{base_url}/api/supplier-assessment/questionnaires",
        json=questionnaire_payload,
        headers=_headers(admin_token),
        timeout=30,
    )
    assert create_questionnaire.status_code == 200, create_questionnaire.text[:400]
    questionnaire_id = create_questionnaire.json().get("id")
    assert questionnaire_id, "Created questionnaire missing id"

    required_question_payload = {
        "question_text": "TEST_Provide current ESG policy summary",
        "description": "Used for draft/final enforcement checks",
        "response_type": "text",
        "required": True,
        "evidence_requirement": "required",
        "importance": "medium",
        "category": "environment",
        "order": 1,
    }
    required_question = requests.post(
        f"{base_url}/api/supplier-assessment/questionnaires/{questionnaire_id}/questions",
        json=required_question_payload,
        headers=_headers(admin_token),
        timeout=30,
    )
    assert required_question.status_code == 200, required_question.text[:400]
    required_question_id = required_question.json().get("id")
    assert required_question_id, "Required question missing id"

    optional_question_payload = {
        "question_text": "TEST_Optional evidence question",
        "description": "Used for valid evidence_requirement acceptance",
        "response_type": "text",
        "required": True,
        "evidence_requirement": "optional",
        "importance": "medium",
        "category": "social",
        "order": 2,
    }
    optional_question = requests.post(
        f"{base_url}/api/supplier-assessment/questionnaires/{questionnaire_id}/questions",
        json=optional_question_payload,
        headers=_headers(admin_token),
        timeout=30,
    )
    assert optional_question.status_code == 200, optional_question.text[:400]

    context = {
        "base_url": base_url,
        "admin_token": admin_token,
        "supplier_token": supplier_token,
        "supplier_email": creds["supplier"]["email"],
        "supplier_relationship_id": supplier_relationship["id"],
        "questionnaire_id": questionnaire_id,
        "required_question_id": required_question_id,
    }

    yield context

    requests.delete(
        f"{base_url}/api/supplier-assessment/questionnaires/{questionnaire_id}",
        headers=_headers(admin_token),
        timeout=30,
    )


# Module: parent GHG evidence API auth + response shape contract
def test_01_parent_ghg_evidence_endpoint_auth_and_shape(ctx: Dict[str, Any]):
    response = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/emissions/all",
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert response.status_code == 200, response.text[:300]
    payload = response.json()
    assert isinstance(payload.get("emissions"), list)

    candidate = next((row for row in payload["emissions"] if row.get("evidence_files")), None)
    if not candidate:
        pytest.skip("No submitted supplier emission with evidence_files available in current environment")
    file_row = candidate["evidence_files"][0]

    authorized = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/emissions/{candidate['id']}/evidence/{file_row['id']}",
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert authorized.status_code == 200, authorized.text[:300]
    authorized_payload = authorized.json()
    assert isinstance(authorized_payload.get("url"), str) and authorized_payload["url"].startswith("http")
    assert isinstance(authorized_payload.get("filename"), str) and len(authorized_payload["filename"]) > 0

    unauthorized = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/emissions/{candidate['id']}/evidence/{file_row['id']}",
        timeout=30,
    )
    assert unauthorized.status_code in (401, 403), unauthorized.text[:300]


# Module: supplier questionnaire retrieval includes question-level evidence requirements
def test_02_supplier_assigned_questionnaire_exposes_evidence_requirement(ctx: Dict[str, Any]):
    listing = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/my-assessment/questionnaires",
        headers=_headers(ctx["supplier_token"]),
        timeout=30,
    )
    assert listing.status_code == 200, listing.text[:300]
    rows = listing.json() or []
    assert any(item.get("questionnaire_id") == ctx["questionnaire_id"] for item in rows)

    questionnaire = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/my-assessment/questionnaires/{ctx['questionnaire_id']}",
        headers=_headers(ctx["supplier_token"]),
        timeout=30,
    )
    assert questionnaire.status_code == 200, questionnaire.text[:300]
    payload = questionnaire.json()
    assert isinstance(payload.get("questions"), list) and len(payload["questions"]) >= 2
    for question in payload["questions"]:
        assert question.get("evidence_requirement") in {"not_required", "optional", "required"}
        assert isinstance(question.get("evidence_files") or [], list)


# Module: QuestionCreate evidence_requirement contract (valid accepted, invalid rejected)
def test_03_question_create_rejects_invalid_evidence_requirement(ctx: Dict[str, Any]):
    invalid_payload = {
        "question_text": "TEST_Invalid evidence requirement",
        "description": "Should be rejected",
        "response_type": "text",
        "required": True,
        "evidence_requirement": "mandatory",
        "importance": "medium",
        "category": "governance",
        "order": 999,
    }
    invalid = requests.post(
        f"{ctx['base_url']}/api/supplier-assessment/questionnaires/{ctx['questionnaire_id']}/questions",
        json=invalid_payload,
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert invalid.status_code == 422, invalid.text[:300]


# Module: draft save allowed, final submit blocked when required evidence is missing
def test_04_final_submit_requires_required_question_evidence(ctx: Dict[str, Any]):
    answers_payload = {
        "answers": [{"question_id": ctx["required_question_id"], "answer": "TEST draft answer"}],
        "is_draft": True,
        "data_verified": False,
    }
    draft = requests.post(
        f"{ctx['base_url']}/api/supplier-assessment/my-assessment/questionnaires/{ctx['questionnaire_id']}/answers",
        json=answers_payload,
        headers=_headers(ctx["supplier_token"]),
        timeout=30,
    )
    assert draft.status_code == 200, draft.text[:300]
    assert draft.json().get("status") == "in_progress"

    final_without_evidence = requests.post(
        f"{ctx['base_url']}/api/supplier-assessment/my-assessment/questionnaires/{ctx['questionnaire_id']}/answers",
        json={
            "answers": [{"question_id": ctx["required_question_id"], "answer": "TEST final attempt"}],
            "is_draft": False,
            "data_verified": True,
        },
        headers=_headers(ctx["supplier_token"]),
        timeout=30,
    )
    assert final_without_evidence.status_code == 400, final_without_evidence.text[:400]
    assert "Evidence is required" in final_without_evidence.text


# Module: supplier evidence endpoint auth + parent draft-visibility guard + evidence linkage validation
def test_05_question_evidence_preview_download_visibility_and_linkage(ctx: Dict[str, Any]):
    evidence_filename = f"test-evidence-{str(uuid.uuid4())[:8]}.pdf"
    upload = requests.post(
        f"{ctx['base_url']}/api/supplier-assessment/my-assessment/questionnaires/{ctx['questionnaire_id']}/questions/{ctx['required_question_id']}/evidence",
        headers={"Authorization": f"Bearer {ctx['supplier_token']}"},
        files={"file": (evidence_filename, b"%PDF-1.4\n%test evidence\n", "application/pdf")},
        timeout=60,
    )
    assert upload.status_code == 200, upload.text[:400]
    upload_payload = upload.json()
    evidence_id = upload_payload.get("id")
    assert isinstance(evidence_id, str) and evidence_id

    supplier_view = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/my-assessment/questionnaires/{ctx['questionnaire_id']}/questions/{ctx['required_question_id']}/evidence/{evidence_id}",
        headers=_headers(ctx["supplier_token"]),
        timeout=30,
    )
    assert supplier_view.status_code == 200, supplier_view.text[:300]
    supplier_payload = supplier_view.json()
    assert isinstance(supplier_payload.get("url"), str) and supplier_payload["url"].startswith("http")
    assert isinstance(supplier_payload.get("filename"), str) and len(supplier_payload["filename"]) > 0

    supplier_wrong_id = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/my-assessment/questionnaires/{ctx['questionnaire_id']}/questions/{ctx['required_question_id']}/evidence/{str(uuid.uuid4())}",
        headers=_headers(ctx["supplier_token"]),
        timeout=30,
    )
    assert supplier_wrong_id.status_code == 404, supplier_wrong_id.text[:300]

    # Parent must not access draft-only evidence.
    parent_before_submit = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/suppliers/{ctx['supplier_relationship_id']}/questionnaires/{ctx['questionnaire_id']}/questions/{ctx['required_question_id']}/evidence/{evidence_id}",
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert parent_before_submit.status_code == 404, parent_before_submit.text[:300]

    final_with_evidence = requests.post(
        f"{ctx['base_url']}/api/supplier-assessment/my-assessment/questionnaires/{ctx['questionnaire_id']}/answers",
        json={
            "answers": [{"question_id": ctx["required_question_id"], "answer": "TEST final answer with evidence"}],
            "is_draft": False,
            "data_verified": True,
        },
        headers=_headers(ctx["supplier_token"]),
        timeout=30,
    )
    assert final_with_evidence.status_code == 200, final_with_evidence.text[:400]
    assert final_with_evidence.json().get("status") == "submitted"

    parent_after_submit = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/suppliers/{ctx['supplier_relationship_id']}/questionnaires/{ctx['questionnaire_id']}/questions/{ctx['required_question_id']}/evidence/{evidence_id}",
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert parent_after_submit.status_code == 200, parent_after_submit.text[:300]
    parent_payload = parent_after_submit.json()
    assert isinstance(parent_payload.get("url"), str) and parent_payload["url"].startswith("http")
    assert isinstance(parent_payload.get("filename"), str) and len(parent_payload["filename"]) > 0

    parent_wrong_id = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/suppliers/{ctx['supplier_relationship_id']}/questionnaires/{ctx['questionnaire_id']}/questions/{ctx['required_question_id']}/evidence/{str(uuid.uuid4())}",
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert parent_wrong_id.status_code == 404, parent_wrong_id.text[:300]
