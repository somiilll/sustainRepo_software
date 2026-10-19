"""Live verification for Supplier Training P0 boundaries, controlled R2 lifecycle, and cleanup."""

import json
import os
import re
import uuid
from datetime import datetime, timezone

import pytest
import requests

from r2_storage import get_r2_storage
from shared.database.mongo import db


pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_LIVE_SUPPLIER_TRAINING_P0") != "1",
    reason="Set RUN_LIVE_SUPPLIER_TRAINING_P0=1 to run controlled live Supplier Training verification.",
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
    admin_email = admin_password = supplier_email = supplier_password = None

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

        if role == "admin" and user_type != "supplier" and admin_email is None:
            admin_email, admin_password = email, password
        if user_type == "supplier" and supplier_email is None:
            supplier_email, supplier_password = email, password

    if not all([admin_email, admin_password, supplier_email, supplier_password]):
        pytest.skip("Could not parse required admin/supplier credentials from memory/test_credentials.md")

    return {
        "admin": {"email": admin_email, "password": admin_password},
        "supplier": {"email": supplier_email, "password": supplier_password},
    }


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
def auth_tokens():
    base_url = _backend_base_url()
    creds = _credentials_from_memory()
    admin_token = _login(base_url, creds["admin"]["email"], creds["admin"]["password"])
    supplier_token = _login(base_url, creds["supplier"]["email"], creds["supplier"]["password"])
    return {"base_url": base_url, "admin": admin_token, "supplier": supplier_token}


# Auth boundary checks for training admin/supplier endpoint surfaces
def test_live_training_auth_boundaries(auth_tokens):
    base_url = auth_tokens["base_url"]

    admin_list = requests.get(
        f"{base_url}/api/supplier-assessment/trainings",
        headers=_headers(auth_tokens["admin"]),
        timeout=30,
    )
    assert admin_list.status_code == 200, admin_list.text[:300]
    assert isinstance(admin_list.json(), list)

    admin_supplier_only = requests.get(
        f"{base_url}/api/supplier-assessment/my-assessment/trainings",
        headers=_headers(auth_tokens["admin"]),
        timeout=30,
    )
    assert admin_supplier_only.status_code == 403, admin_supplier_only.text[:300]

    supplier_admin_only = requests.get(
        f"{base_url}/api/supplier-assessment/trainings",
        headers=_headers(auth_tokens["supplier"]),
        timeout=30,
    )
    assert supplier_admin_only.status_code == 403, supplier_admin_only.text[:300]

    supplier_list = requests.get(
        f"{base_url}/api/supplier-assessment/my-assessment/trainings",
        headers=_headers(auth_tokens["supplier"]),
        timeout=30,
    )
    assert supplier_list.status_code == 200, supplier_list.text[:300]
    assert isinstance(supplier_list.json(), list)


# Controlled live create/list/status/content/progress verification with full cleanup
@pytest.mark.asyncio
async def test_live_training_lifecycle_with_cleanup(auth_tokens):
    bucket = _read_env_value("/app/backend/.env", "R2_BUCKET_SUPPLIER_ASSESSMENT")
    if bucket != "supplier-assessment-dev":
        pytest.skip("R2 supplier_assessment bucket is not supplier-assessment-dev; live mutation skipped")

    base_url = auth_tokens["base_url"]
    admin_headers = _headers(auth_tokens["admin"])
    supplier_headers = _headers(auth_tokens["supplier"])
    now = datetime.now(timezone.utc).isoformat()

    supplier_assessment = requests.get(
        f"{base_url}/api/supplier-assessment/my-assessment",
        headers=supplier_headers,
        timeout=30,
    )
    assert supplier_assessment.status_code == 200, supplier_assessment.text[:300]
    supplier_relationship = supplier_assessment.json().get("relationship") or {}
    supplier_relationship_id = supplier_relationship.get("id")
    assert supplier_relationship_id, "Supplier relationship id not available"

    admin_me = requests.get(f"{base_url}/api/auth/me", headers=admin_headers, timeout=30)
    assert admin_me.status_code == 200
    admin_user_id = admin_me.json().get("id")

    relationship_before = await db.supplier_relationships.find_one({"id": supplier_relationship_id}, {"_id": 0})
    assert relationship_before is not None

    pre_program_rows = await db.supplier_assessment_programs.find(
        {"customer_org_id": relationship_before["customer_org_id"]}, {"_id": 0, "id": 1}
    ).to_list(1000)
    pre_program_ids = {row.get("id") for row in pre_program_rows if row.get("id")}

    unique = f"training-p0-{uuid.uuid4()}"
    training_title = f"TEST_{unique}"
    payload = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
    files = {"file": (f"{unique}.pdf", payload, "application/pdf")}
    form_data = {
        "title": training_title,
        "description": "P0 live controlled training verification",
        "completion_threshold": "80",
        "supplier_relationship_ids": json.dumps([supplier_relationship_id]),
    }

    requirement_id = None
    version_id = None
    content_id = None
    assignment_id = None
    r2_key = None

    try:
        create_response = requests.post(
            f"{base_url}/api/supplier-assessment/trainings",
            headers=admin_headers,
            data=form_data,
            files=files,
            timeout=60,
        )
        assert create_response.status_code == 200, create_response.text[:500]
        created = create_response.json()

        requirement = created.get("training") or {}
        version = created.get("version") or {}
        assignments = created.get("assignments") or []

        requirement_id = requirement.get("id")
        version_id = version.get("id")
        content_id = requirement.get("training_content_id")
        r2_key = version.get("r2_key")
        assignment_id = assignments[0].get("id") if assignments else None

        assert requirement.get("title") == training_title
        assert float(requirement.get("completion_threshold")) == 80.0
        assert version.get("bucket_type") == "supplier_assessment"
        assert version.get("content_type") == "application/pdf"
        assert assignment_id is not None
        assert version_id is not None

        admin_status = requests.get(
            f"{base_url}/api/supplier-assessment/trainings/{requirement_id}/status",
            headers=admin_headers,
            timeout=30,
        )
        assert admin_status.status_code == 200, admin_status.text[:300]
        status_rows = admin_status.json()
        assert any(row.get("supplier_relationship_id") == supplier_relationship_id for row in status_rows)

        supplier_list = requests.get(
            f"{base_url}/api/supplier-assessment/my-assessment/trainings",
            headers=supplier_headers,
            timeout=30,
        )
        assert supplier_list.status_code == 200
        listed = supplier_list.json()
        target = next((row for row in listed if row.get("assignment_id") == assignment_id), None)
        assert target is not None
        assert target.get("status") == "not_started"

        supplier_content = requests.get(
            f"{base_url}/api/supplier-assessment/my-assessment/trainings/{assignment_id}/content",
            headers=supplier_headers,
            timeout=30,
        )
        assert supplier_content.status_code == 200, supplier_content.text[:300]
        content_url = supplier_content.json().get("url")
        assert isinstance(content_url, str) and content_url.startswith("http")

        for progress_value, expected_status in [(0, "not_started"), (50, "in_progress"), (80, "completed")]:
            progress_resp = requests.put(
                f"{base_url}/api/supplier-assessment/my-assessment/trainings/{assignment_id}/progress",
                headers=supplier_headers,
                data={"progress_percent": str(progress_value)},
                timeout=30,
            )
            assert progress_resp.status_code == 200, progress_resp.text[:300]
            progress = progress_resp.json()
            assert progress.get("status") == expected_status
            assert progress.get("training_version_id") == version_id

        stored_progress = await db.supplier_training_progress.find_one(
            {"training_assignment_id": assignment_id, "supplier_relationship_id": supplier_relationship_id},
            {"_id": 0},
        )
        assert stored_progress is not None
        assert stored_progress["status"] == "completed"
        assert stored_progress["training_version_id"] == version_id

        versions_for_content = await db.supplier_training_versions.find(
            {"training_content_id": content_id}, {"_id": 0}
        ).to_list(10)
        assert len(versions_for_content) == 1
        assert versions_for_content[0]["id"] == version_id
        assert versions_for_content[0]["version_number"] == 1
    finally:
        cleanup = {
            "progress": 0,
            "assignments": 0,
            "requirements": 0,
            "versions": 0,
            "contents": 0,
            "programs": 0,
            "relationship_restored": 0,
            "r2_deleted": 0,
        }

        if assignment_id:
            cleanup["progress"] = (
                await db.supplier_training_progress.delete_many({"training_assignment_id": assignment_id})
            ).deleted_count
            cleanup["assignments"] = (
                await db.supplier_training_assignments.delete_many({"id": assignment_id})
            ).deleted_count

        if requirement_id:
            cleanup["requirements"] = (
                await db.supplier_training_requirements.delete_many({"id": requirement_id})
            ).deleted_count
        if version_id:
            cleanup["versions"] = (
                await db.supplier_training_versions.delete_many({"id": version_id})
            ).deleted_count
        if content_id:
            cleanup["contents"] = (
                await db.supplier_training_contents.delete_many({"id": content_id})
            ).deleted_count

        post_program_rows = await db.supplier_assessment_programs.find(
            {"customer_org_id": relationship_before["customer_org_id"]}, {"_id": 0, "id": 1, "created_at": 1, "created_by": 1}
        ).to_list(1000)
        created_program_ids = [
            row["id"]
            for row in post_program_rows
            if row.get("id") not in pre_program_ids and row.get("created_by") == admin_user_id and (row.get("created_at") or "") >= now
        ]
        if created_program_ids:
            cleanup["programs"] = (
                await db.supplier_assessment_programs.delete_many({"id": {"$in": created_program_ids}})
            ).deleted_count

        restore_payload = {
            "assessment_program_id": relationship_before.get("assessment_program_id"),
            "assessment_program_version": relationship_before.get("assessment_program_version"),
            "training_completion_percent": relationship_before.get("training_completion_percent", 0.0),
            "updated_at": relationship_before.get("updated_at"),
            "overall_completion_percent": relationship_before.get("overall_completion_percent"),
            "invitation_status": relationship_before.get("invitation_status"),
        }
        await db.supplier_relationships.update_one(
            {"id": supplier_relationship_id},
            {"$set": restore_payload},
        )
        cleanup["relationship_restored"] = 1

        if r2_key:
            try:
                deleted = await get_r2_storage().delete_file("supplier_assessment", r2_key)
                cleanup["r2_deleted"] = 1 if deleted else 0
            except Exception:
                cleanup["r2_deleted"] = 0

        print(f"CLEANUP_RESULTS: {cleanup}")

        assert cleanup["requirements"] in [0, 1]
        assert cleanup["versions"] in [0, 1]
        assert cleanup["contents"] in [0, 1]
        assert cleanup["assignments"] in [0, 1]
        assert cleanup["relationship_restored"] == 1
