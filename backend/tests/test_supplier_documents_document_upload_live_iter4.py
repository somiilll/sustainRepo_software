"""Live admin API smoke checks for supplier document response modes (temp create/delete)."""

import os
import re
import uuid

import pytest
import requests


def _backend_base_url() -> str:
    base = os.environ.get("REACT_APP_BACKEND_URL")
    if not base and os.path.exists("/app/frontend/.env"):
        for line in open("/app/frontend/.env", "r", encoding="utf-8"):
            if line.startswith("REACT_APP_BACKEND_URL="):
                base = line.split("=", 1)[1].strip()
                break
    if not base:
        pytest.skip("REACT_APP_BACKEND_URL unavailable")
    return base.rstrip("/")


def _admin_credentials():
    path = "/app/memory/test_credentials.md"
    if not os.path.exists(path):
        pytest.skip("/app/memory/test_credentials.md missing")
    text = open(path, "r", encoding="utf-8").read()
    email = re.search(r"\*\*Email\*\*:\s*([^\n]+)", text)
    password = re.search(r"\*\*Password\*\*:\s*([^\n]+)", text)
    if not email or not password:
        pytest.skip("Admin credentials unavailable in /app/memory/test_credentials.md")
    return email.group(1).strip(), password.group(1).strip()


@pytest.fixture(scope="module")
def admin_session():
    base_url = _backend_base_url()
    email, password = _admin_credentials()
    auth = requests.post(
        f"{base_url}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert auth.status_code == 200, auth.text[:300]
    token = auth.json().get("access_token")
    assert token, "access_token missing"
    return base_url, {"Authorization": f"Bearer {token}"}


@pytest.fixture
def cleanup_requirements(admin_session):
    base_url, headers = admin_session
    created_ids = []
    yield created_ids
    for requirement_id in created_ids:
        requests.delete(
            f"{base_url}/api/supplier-assessment/documents/{requirement_id}",
            headers=headers,
            timeout=30,
        )


# Feature area: live router contract for ACCEPTANCE/STATUS/DOCUMENT_UPLOAD creation
@pytest.mark.parametrize(
    "response_mode,response_options,expected_mode",
    [
        ("DOCUMENT_UPLOAD", [], "DOCUMENT_UPLOAD"),
        ("ACCEPTANCE", [], "ACCEPTANCE"),
        ("STATUS", ["Done", "In progress"], "STATUS"),
    ],
)
def test_live_document_publish_accepts_all_supported_response_modes(admin_session, cleanup_requirements, response_mode, response_options, expected_mode):
    base_url, headers = admin_session
    unique = uuid.uuid4().hex[:8]
    payload = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
    files = {
        "file": (f"iter4-{unique}.pdf", payload, "application/pdf"),
    }
    data = {
        "title": f"TEST_ITER4_{response_mode}_{unique}",
        "response_mode": response_mode,
        "response_options_json": str(response_options).replace("'", '"'),
        "supplier_relationship_ids": "[]",
        "due_date": "",
    }
    response = requests.post(
        f"{base_url}/api/supplier-assessment/documents",
        headers=headers,
        files=files,
        data=data,
        timeout=45,
    )

    assert response.status_code == 200, response.text[:500]
    body = response.json()
    assert body.get("requirements"), body
    requirement = body["requirements"][0]
    assert requirement["response_mode"] == expected_mode
    if expected_mode == "STATUS":
        assert requirement["response_options"] == response_options
    else:
        assert requirement["response_options"] == []
    cleanup_requirements.append(requirement["id"])
