"""Targeted live checks for base-year validate-for-report route ordering and auth access."""

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


def _admin_credentials():
    path = "/app/memory/test_credentials.md"
    if not os.path.exists(path):
        pytest.skip("/app/memory/test_credentials.md missing")

    text = open(path, "r", encoding="utf-8").read()
    blocks = re.split(r"\n## ", text)
    for index, block in enumerate(blocks):
        normalized = block if index == 0 else f"## {block}"
        email_match = re.search(r"\*\*Email\*\*:\s*([^\n]+)", normalized)
        password_match = re.search(r"\*\*Password\*\*:\s*([^\n]+)", normalized)
        role_match = re.search(r"\*\*Role\*\*:\s*([^\n]+)", normalized)
        user_type_match = re.search(r"\*\*User Type\*\*:\s*([^\n]+)", normalized)
        if not email_match or not password_match:
            continue
        role = role_match.group(1).strip() if role_match else ""
        user_type = user_type_match.group(1).strip() if user_type_match else ""
        if role == "admin" and user_type != "supplier":
            return {
                "email": email_match.group(1).strip(),
                "password": password_match.group(1).strip(),
            }

    pytest.skip("Admin credentials not found in /app/memory/test_credentials.md")


@pytest.fixture(scope="module")
def admin_ctx():
    base_url = _backend_base_url()
    creds = _admin_credentials()
    login = requests.post(
        f"{base_url}/api/auth/login",
        json={"email": creds["email"], "password": creds["password"]},
        timeout=30,
    )
    assert login.status_code == 200, f"Admin login failed: {login.status_code} {login.text[:300]}"
    payload = login.json()
    token = payload.get("access_token")
    assert isinstance(token, str) and token, "Expected non-empty access_token in login response"
    assert payload.get("user", {}).get("email") == creds["email"], "Login response user/email mismatch"
    return {"base_url": base_url, "token": token}


# Module: base-year emissions public route ordering contract
def test_validate_for_report_non_404_for_authenticated_admin(admin_ctx):
    response = requests.get(
        f"{admin_ctx['base_url']}/api/base-year-emissions/validate-for-report",
        headers={"Authorization": f"Bearer {admin_ctx['token']}"},
        timeout=30,
    )

    assert response.status_code != 404, "Route ordering regression: validate-for-report resolved to 404"
    assert response.status_code < 500, f"Unexpected server error: {response.status_code} {response.text[:300]}"

    body = response.json()
    assert isinstance(body, dict), "Expected JSON object response"
    if response.status_code == 200:
        assert any(k in body for k in ["can_generate", "valid"]), "Expected success indicator key in 200 payload"
        if "can_generate" in body:
            assert isinstance(body.get("can_generate"), bool), "can_generate should be boolean"
        if "valid" in body:
            assert isinstance(body.get("valid"), bool), "valid should be boolean"
    else:
        assert any(k in body for k in ["detail", "message", "error"]), "Expected structured non-200 error body"
