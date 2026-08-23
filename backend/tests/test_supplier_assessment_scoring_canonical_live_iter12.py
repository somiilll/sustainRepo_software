"""Live regression checks for canonical supplier-assessment scoring contracts."""

import os
import re
import uuid

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
    if not admin:
        pytest.skip("Admin credentials unavailable in memory/test_credentials.md")
    return {"admin": admin, "supplier": supplier}


def _login(base_url: str, email: str, password: str) -> requests.Response:
    response = requests.post(
        f"{base_url}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert response.status_code == 200, f"Login failed for {email}: {response.status_code} {response.text[:300]}"
    return response


def _headers(token: str):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def ctx():
    base_url = _backend_base_url()
    creds = _credentials_from_memory()
    admin_login = _login(base_url, creds["admin"]["email"], creds["admin"]["password"])
    admin_token = admin_login.json().get("access_token")
    assert admin_token, "No access_token returned for admin login"
    supplier_token = None
    if creds.get("supplier"):
        supplier_login = _login(base_url, creds["supplier"]["email"], creds["supplier"]["password"])
        supplier_token = supplier_login.json().get("access_token")
    return {
        "base_url": base_url,
        "admin_token": admin_token,
        "supplier_token": supplier_token,
        "auth_cookie_header": admin_login.headers.get("set-cookie", ""),
        "questionnaire_id": None,
        "question_id": None,
    }


@pytest.fixture(scope="module", autouse=True)
def cleanup(ctx):
    yield
    if ctx.get("question_id"):
        requests.delete(
            f"{ctx['base_url']}/api/supplier-assessment/questions/{ctx['question_id']}",
            headers=_headers(ctx["admin_token"]),
            timeout=30,
        )
    if ctx.get("questionnaire_id"):
        requests.delete(
            f"{ctx['base_url']}/api/supplier-assessment/questionnaires/{ctx['questionnaire_id']}",
            headers=_headers(ctx["admin_token"]),
            timeout=30,
        )


# Module: auth/login cookie contract (playbook optional checks)
def test_login_sets_cookie_header(ctx):
    assert ctx["auth_cookie_header"], "Login response missing set-cookie header"


# Module: questionnaire create/update weight persistence
def test_questionnaire_create_without_scoring_method_does_not_500(ctx):
    payload = {
        "name": f"TEST_Canonical_NoMethod_{str(uuid.uuid4())[:8]}",
        "description": "TEST should not 500 when scoring_method omitted",
        "esg_section_weights": {"environment": 34, "social": 33, "governance": 33},
        "overall_supplier_weights": {"esg": 40, "ghg": 40, "revenue": 20},
    }
    created = requests.post(
        f"{ctx['base_url']}/api/supplier-assessment/questionnaires",
        json=payload,
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert created.status_code != 500, created.text[:300]


# Module: questionnaire create/update weight persistence
def test_questionnaire_create_update_persists_new_weight_fields(ctx):
    suffix = str(uuid.uuid4())[:8]
    create_payload = {
        "name": f"TEST_Canonical_{suffix}",
        "description": "TEST live canonical scoring regression",
        "scoring_method": "question",
        "esg_section_weights": {"environment": 50, "social": 30, "governance": 20},
        "overall_supplier_weights": {"esg": 45, "ghg": 35, "revenue": 20},
    }
    created = requests.post(
        f"{ctx['base_url']}/api/supplier-assessment/questionnaires",
        json=create_payload,
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert created.status_code == 200, created.text[:300]
    payload = created.json()
    ctx["questionnaire_id"] = payload["id"]
    assert payload.get("esg_section_weights") == create_payload["esg_section_weights"]
    assert payload.get("overall_supplier_weights") == create_payload["overall_supplier_weights"]

    get_one = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/questionnaires/{ctx['questionnaire_id']}",
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert get_one.status_code == 200, get_one.text[:300]
    fetched = get_one.json()
    assert fetched.get("esg_section_weights") == create_payload["esg_section_weights"]
    assert fetched.get("overall_supplier_weights") == create_payload["overall_supplier_weights"]

    update_payload = {
        "esg_section_weights": {"environment": 40, "social": 40, "governance": 20},
        "overall_supplier_weights": {"esg": 30, "ghg": 50, "revenue": 20},
    }
    updated = requests.put(
        f"{ctx['base_url']}/api/supplier-assessment/questionnaires/{ctx['questionnaire_id']}",
        json=update_payload,
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert updated.status_code == 200, updated.text[:300]
    changed = updated.json()
    assert changed.get("esg_section_weights") == update_payload["esg_section_weights"]
    assert changed.get("overall_supplier_weights") == update_payload["overall_supplier_weights"]


# Module: question importance/exact-weight override persistence
def test_question_create_update_exact_weight_overrides_importance(ctx):
    questionnaire_id = ctx.get("questionnaire_id")
    if not questionnaire_id:
        pytest.skip("Questionnaire setup unavailable due earlier create failure")

    add_payload = {
        "question_text": "TEST: Has formal ESG policy?",
        "response_type": "yes_no",
        "required": True,
        "importance": "critical",
        "exact_numerical_weight": 3.5,
        "category": "environment",
        "order": 0,
        "scoring": {"rule": "boolean", "true_score": 100, "false_score": 0},
    }
    created = requests.post(
        f"{ctx['base_url']}/api/supplier-assessment/questionnaires/{questionnaire_id}/questions",
        json=add_payload,
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert created.status_code == 200, created.text[:300]
    question = created.json()
    ctx["question_id"] = question["id"]
    assert question.get("importance") == "critical"
    assert question.get("exact_numerical_weight") == 3.5
    assert question.get("weight") == 3.5

    update_payload = {"importance": "critical", "exact_numerical_weight": 2.25}
    updated = requests.put(
        f"{ctx['base_url']}/api/supplier-assessment/questions/{ctx['question_id']}",
        json=update_payload,
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert updated.status_code == 200, updated.text[:300]
    changed = updated.json()
    assert changed.get("exact_numerical_weight") == 2.25
    assert changed.get("weight") == 2.25
    assert changed.get("weight") != 6.25


# Module: rankings/supplier list API contracts from persisted snapshots
def test_rankings_and_suppliers_endpoints_return_safely(ctx):
    rankings = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/rankings",
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert rankings.status_code == 200, rankings.text[:300]
    ranking_payload = rankings.json()
    assert isinstance(ranking_payload.get("rankings"), list)
    assert "total_suppliers" in ranking_payload

    suppliers = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/suppliers?page=1&page_size=20",
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert suppliers.status_code == 200, suppliers.text[:300]
    supplier_payload = suppliers.json()
    assert isinstance(supplier_payload.get("suppliers"), list)
    if supplier_payload["suppliers"]:
        assert "canonical_score_snapshot" in supplier_payload["suppliers"][0]


# Module: supplier relationship setup check (setup blocker, not product failure)
def test_supplier_relationship_setup_blocker_visibility(ctx):
    if not ctx.get("supplier_token"):
        pytest.skip("Supplier credentials unavailable")
    response = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/my-assessment",
        headers=_headers(ctx["supplier_token"]),
        timeout=30,
    )
    assert response.status_code in (200, 404), response.text[:300]
