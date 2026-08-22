"""Live, read-only contract checks for supplier my-assessment module metadata."""

import os
import re

import pytest
import requests


pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_LIVE_SUPPLIER_METADATA") != "1",
    reason="Set RUN_LIVE_SUPPLIER_METADATA=1 to run live supplier metadata contract check.",
)


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
        pytest.skip("REACT_APP_BACKEND_URL unavailable")
    return base.rstrip("/")


def _supplier_credentials():
    path = "/app/memory/test_credentials.md"
    if not os.path.exists(path):
        pytest.skip("/app/memory/test_credentials.md missing")

    text = open(path, "r", encoding="utf-8").read()
    blocks = re.split(r"\n## ", text)
    for index, block in enumerate(blocks):
        normalized = block if index == 0 else f"## {block}"
        email_match = re.search(r"\*\*Email\*\*:\s*([^\n]+)", normalized)
        password_match = re.search(r"\*\*Password\*\*:\s*([^\n]+)", normalized)
        user_type_match = re.search(r"\*\*User Type\*\*:\s*([^\n]+)", normalized)
        if email_match and password_match and user_type_match and user_type_match.group(1).strip() == "supplier":
            return email_match.group(1).strip(), password_match.group(1).strip()
    pytest.skip("Supplier credentials not found in test_credentials.md")


def _login(base_url: str, email: str, password: str) -> str:
    response = requests.post(
        f"{base_url}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert response.status_code == 200, response.text[:300]
    token = response.json().get("access_token")
    assert token
    return token


def test_live_my_assessment_module_metadata_contract():
    # supplier-assessment/my-assessment module metadata should be registry-backed and well-formed.
    base_url = _backend_base_url()
    supplier_email, supplier_password = _supplier_credentials()
    token = _login(base_url, supplier_email, supplier_password)

    response = requests.get(
        f"{base_url}/api/supplier-assessment/my-assessment",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    assert response.status_code == 200, response.text[:300]
    payload = response.json()

    modules = payload.get("assessment_modules")
    assert isinstance(modules, list)

    valid_codes = {"esg", "ghg", "documents", "training"}
    seen_codes = set()
    for module in modules:
        assert module.get("code") in valid_codes
        assert isinstance(module.get("display_name"), str) and module["display_name"].strip()
        assert isinstance(module.get("supplier_path"), str) and module["supplier_path"].startswith("/")
        assert isinstance(module.get("description"), str) and module["description"].strip()
        assert isinstance(module.get("completion_percent"), (int, float))
        seen_codes.add(module.get("code"))

    assert len(seen_codes) == len(modules)
