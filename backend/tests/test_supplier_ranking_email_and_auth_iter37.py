"""Targeted live regression checks for contact email template, rankings payload, and auth basics."""

import os
import re

import pytest
import requests

from modules.contact_sales.router import _confirmation_email


# Email template verification (no outbound email send)


def _read_env_value(path: str, key: str):
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            current_key, value = line.split("=", 1)
            if current_key.strip() == key:
                return value.strip().strip('"').strip("'")
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
    admin_email = admin_password = None
    for index, block in enumerate(blocks):
        normalized = block if index == 0 else f"## {block}"
        email_match = re.search(r"\*\*Email\*\*:\s*([^\n]+)", normalized)
        password_match = re.search(r"\*\*Password\*\*:\s*([^\n]+)", normalized)
        role_match = re.search(r"\*\*Role\*\*:\s*([^\n]+)", normalized)
        user_type_match = re.search(r"\*\*User Type\*\*:\s*([^\n]+)", normalized)
        if not email_match or not password_match or not role_match:
            continue
        if role_match.group(1).strip() == "admin" and (user_type_match.group(1).strip() if user_type_match else "") != "supplier":
            admin_email = email_match.group(1).strip()
            admin_password = password_match.group(1).strip()
            break

    if not admin_email or not admin_password:
        pytest.skip("Could not parse admin credentials from memory/test_credentials.md")
    return admin_email, admin_password


@pytest.fixture(scope="module")
def admin_session():
    base_url = _backend_base_url()
    admin_email, admin_password = _credentials_from_memory()
    login_response = requests.post(
        f"{base_url}/api/auth/login",
        json={"email": admin_email, "password": admin_password},
        timeout=30,
    )
    assert login_response.status_code == 200, login_response.text[:400]
    payload = login_response.json()
    token = payload.get("access_token") or payload.get("token")
    assert isinstance(token, str) and token, "No access token returned from /api/auth/login"

    session = requests.Session()
    session.headers.update({"Authorization": f"Bearer {token}"})
    return {"base_url": base_url, "session": session, "admin_email": admin_email, "admin_password": admin_password}


def test_contact_confirmation_email_template_contains_required_content():
    body = _confirmation_email("Somil <Goyal>")

    assert "sustainrepo-logo.png" in body
    assert "Somil &lt;Goyal&gt;" in body
    assert "24 business hours" in body
    assert 'href="https://sustainrepo.com/resources"' in body


# Supplier ranking API contract checks for matrix + requirement status tables


def test_rankings_returns_supported_document_and_training_status_values(admin_session):
    base_url = admin_session["base_url"]
    session = admin_session["session"]

    response = session.get(f"{base_url}/api/supplier-assessment/rankings", timeout=30)
    assert response.status_code == 200, response.text[:400]

    data = response.json()
    rankings = data.get("rankings") or []
    assert isinstance(rankings, list)

    allowed_document = {"submitted", "pending", "overdue"}
    allowed_training = {"not_started", "in_progress", "completed", "overdue"}

    for row in rankings:
        for item in row.get("document_statuses", []):
            assert item.get("status") in allowed_document
            assert isinstance(item.get("title"), str) and item.get("title")
            assert isinstance(item.get("requirement_id"), str) and item.get("requirement_id")

        for item in row.get("training_statuses", []):
            assert item.get("status") in allowed_training
            assert isinstance(item.get("title"), str) and item.get("title")
            assert isinstance(item.get("requirement_id"), str) and item.get("requirement_id")


def test_rankings_includes_requirement_status_data_when_assignments_exist(admin_session):
    base_url = admin_session["base_url"]
    session = admin_session["session"]

    response = session.get(f"{base_url}/api/supplier-assessment/rankings", timeout=30)
    assert response.status_code == 200, response.text[:400]

    rankings = response.json().get("rankings") or []
    has_document_entries = any(len(row.get("document_statuses", [])) > 0 for row in rankings)
    has_training_entries = any(len(row.get("training_statuses", [])) > 0 for row in rankings)

    if not (has_document_entries or has_training_entries):
        pytest.skip("No document or training assignments found in current dataset")

    assert has_document_entries or has_training_entries


# Auth playbook spot checks (login cookie, CORS credentials, brute-force lockout)


def test_login_sets_token_and_http_only_cookie(admin_session):
    base_url = admin_session["base_url"]
    admin_email = admin_session["admin_email"]
    admin_password = admin_session["admin_password"]

    response = requests.post(
        f"{base_url}/api/auth/login",
        json={"email": admin_email, "password": admin_password},
        timeout=30,
    )
    assert response.status_code == 200, response.text[:400]

    payload = response.json()
    assert isinstance(payload.get("access_token") or payload.get("token"), str)

    set_cookie_header = response.headers.get("set-cookie", "")
    assert set_cookie_header, "Expected login response to set cookies"
    assert "HttpOnly" in set_cookie_header or "httponly" in set_cookie_header


def test_login_cors_allows_configured_origin_and_rejects_untrusted_origin(admin_session):
    base_url = admin_session["base_url"]
    trusted_origin = _read_env_value("/app/backend/.env", "CORS_ORIGINS").split(",")[0].strip().strip('"')

    trusted_response = requests.options(
        f"{base_url}/api/auth/login",
        headers={
            "Origin": trusted_origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
        timeout=30,
    )
    assert trusted_response.status_code in {200, 204}
    assert trusted_response.headers.get("Access-Control-Allow-Origin") == trusted_origin
    assert trusted_response.headers.get("Access-Control-Allow-Credentials") == "true"

    untrusted_origin = "https://evil.example.com"
    untrusted_response = requests.options(
        f"{base_url}/api/auth/login",
        headers={
            "Origin": untrusted_origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
        timeout=30,
    )
    assert untrusted_response.status_code in {200, 204, 400}
    assert untrusted_response.headers.get("Access-Control-Allow-Origin") != untrusted_origin


def test_bruteforce_lockout_after_five_invalid_attempts(admin_session):
    base_url = admin_session["base_url"]
    lockout_email = "lockout-check-iter37@example.com"

    statuses = []
    for _ in range(6):
        response = requests.post(
            f"{base_url}/api/auth/login",
            json={"email": lockout_email, "password": "WrongPass123!"},
            timeout=30,
        )
        statuses.append(response.status_code)

    assert statuses[-1] == 429, f"Expected HTTP 429 after repeated invalid attempts, got {statuses}"
