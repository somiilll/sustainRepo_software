"""Live supplier training admin authorization and non-mutation regression checks."""

import os
import re

import pytest
import requests


pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_LIVE_SUPPLIER_TRAINING_AUTHZ") != "1",
    reason="Set RUN_LIVE_SUPPLIER_TRAINING_AUTHZ=1 to run live training authz checks.",
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
        pytest.skip("REACT_APP_BACKEND_URL unavailable for live API checks")
    return base.rstrip("/")


def _credentials_from_memory():
    path = "/app/memory/test_credentials.md"
    if not os.path.exists(path):
        pytest.skip("/app/memory/test_credentials.md missing")

    text = open(path, "r", encoding="utf-8").read()
    blocks = re.split(r"\n## ", text)
    admin = supplier = user = None

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
        if role == "user" and user is None:
            user = {"email": email, "password": password}

    if not admin or not supplier:
        pytest.skip("Required admin/supplier credentials unavailable in memory/test_credentials.md")
    return {"admin": admin, "supplier": supplier, "user": user}


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
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def auth_and_training_context():
    base_url = _backend_base_url()
    creds = _credentials_from_memory()
    admin_token = _login(base_url, creds["admin"]["email"], creds["admin"]["password"])
    supplier_token = _login(base_url, creds["supplier"]["email"], creds["supplier"]["password"])

    user_token = None
    if creds.get("user"):
        user_token = _login(base_url, creds["user"]["email"], creds["user"]["password"])

    trainings_resp = requests.get(
        f"{base_url}/api/supplier-assessment/trainings",
        headers=_headers(admin_token),
        timeout=30,
    )
    assert trainings_resp.status_code == 200, trainings_resp.text[:300]
    trainings = trainings_resp.json()
    assert isinstance(trainings, list)

    if not trainings:
        pytest.skip("No existing trainings available for non-destructive authz checks")

    baseline = trainings[0]
    return {
        "base_url": base_url,
        "admin": admin_token,
        "supplier": supplier_token,
        "user": user_token,
        "training_id": baseline["id"],
        "baseline": baseline,
    }


# Training admin endpoint authorization for PATCH/DELETE and record immutability under forbidden calls
def test_supplier_cannot_patch_training(auth_and_training_context):
    ctx = auth_and_training_context
    training_id = ctx["training_id"]

    patch_resp = requests.patch(
        f"{ctx['base_url']}/api/supplier-assessment/trainings/{training_id}",
        headers=_headers(ctx["supplier"]),
        json={"is_active": False},
        timeout=30,
    )
    assert patch_resp.status_code == 403, patch_resp.text[:300]


def test_supplier_cannot_delete_training(auth_and_training_context):
    ctx = auth_and_training_context
    training_id = ctx["training_id"]

    delete_resp = requests.delete(
        f"{ctx['base_url']}/api/supplier-assessment/trainings/{training_id}",
        headers=_headers(ctx["supplier"]),
        timeout=30,
    )
    assert delete_resp.status_code == 403, delete_resp.text[:300]


def test_non_admin_user_cannot_patch_or_delete_training(auth_and_training_context):
    ctx = auth_and_training_context
    if not ctx.get("user"):
        pytest.skip("Non-admin user credentials unavailable")

    training_id = ctx["training_id"]

    patch_resp = requests.patch(
        f"{ctx['base_url']}/api/supplier-assessment/trainings/{training_id}",
        headers=_headers(ctx["user"]),
        json={"is_active": False},
        timeout=30,
    )
    assert patch_resp.status_code == 403, patch_resp.text[:300]

    delete_resp = requests.delete(
        f"{ctx['base_url']}/api/supplier-assessment/trainings/{training_id}",
        headers=_headers(ctx["user"]),
        timeout=30,
    )
    assert delete_resp.status_code == 403, delete_resp.text[:300]


def test_forbidden_patch_delete_do_not_mutate_training(auth_and_training_context):
    ctx = auth_and_training_context
    training_id = ctx["training_id"]
    baseline = ctx["baseline"]

    after_resp = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/trainings",
        headers=_headers(ctx["admin"]),
        timeout=30,
    )
    assert after_resp.status_code == 200, after_resp.text[:300]
    after_rows = after_resp.json()
    target_after = next((row for row in after_rows if row.get("id") == training_id), None)

    assert target_after is not None, "Training disappeared after forbidden operations"
    assert target_after.get("title") == baseline.get("title")
    assert target_after.get("description") == baseline.get("description")
    assert target_after.get("completion_threshold") == baseline.get("completion_threshold")
    assert target_after.get("due_date") == baseline.get("due_date")
    assert bool(target_after.get("is_active")) == bool(baseline.get("is_active"))