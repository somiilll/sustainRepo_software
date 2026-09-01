"""Live API regression for supplier ranking payload cleanup and emissions endpoint availability."""

import os
import re

import pytest
import requests


# Ranking + emissions API payload contract checks after assignment/ranking refactor


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
    token = login_response.json().get("access_token")
    assert token, "No access_token returned from /api/auth/login"

    session = requests.Session()
    session.headers.update({"Authorization": f"Bearer {token}"})
    return {"base_url": base_url, "session": session}


def test_rankings_payload_excludes_legacy_emissions_fields(admin_session):
    base_url = admin_session["base_url"]
    session = admin_session["session"]

    rankings_response = session.get(f"{base_url}/api/supplier-assessment/rankings", timeout=30)
    assert rankings_response.status_code == 200, rankings_response.text[:400]
    body = rankings_response.json()

    assert isinstance(body.get("rankings"), list)
    assert "averages" in body

    forbidden_row_fields = {
        "scope1_emissions",
        "scope2_emissions",
        "total_emissions",
        "emissions_by_scope",
    }
    for row in body["rankings"]:
        for field in forbidden_row_fields:
            assert field not in row, f"Legacy ranking field still present: {field}"

    averages = body.get("averages") or {}
    assert "ghg" not in averages, "Obsolete ghg average should not be present"


def test_emissions_all_endpoint_available_for_current_period(admin_session):
    base_url = admin_session["base_url"]
    session = admin_session["session"]

    suppliers_response = session.get(f"{base_url}/api/supplier-assessment/suppliers?page=1&page_size=1", timeout=30)
    assert suppliers_response.status_code == 200, suppliers_response.text[:400]
    suppliers_payload = suppliers_response.json()
    suppliers = suppliers_payload.get("suppliers") or []
    reporting_period = suppliers[0].get("reporting_period") if suppliers else None

    endpoint = f"{base_url}/api/supplier-assessment/emissions/all"
    if reporting_period:
        endpoint = f"{endpoint}?reporting_period={requests.utils.quote(reporting_period, safe='')}"
    emissions_response = session.get(endpoint, timeout=30)
    assert emissions_response.status_code == 200, emissions_response.text[:400]
    emissions_payload = emissions_response.json()

    assert isinstance(emissions_payload.get("emissions"), list)
    assert isinstance(emissions_payload.get("supplier_totals"), list)
