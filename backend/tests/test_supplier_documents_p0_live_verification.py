"""Live verification for Supplier Documents P0 boundaries, R2 lifecycle, and acceptance persistence."""

import os
import re
import uuid
from datetime import datetime, timezone

import pytest
import requests

from modules.supplier_assessment import documents_service
from modules.supplier_assessment.service import supplier_service
from r2_storage import get_r2_storage
from shared.database.mongo import db


pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_LIVE_SUPPLIER_DOCUMENTS_P0") != "1",
    reason="Set RUN_LIVE_SUPPLIER_DOCUMENTS_P0=1 to run controlled live R2/Mongo verification.",
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


@pytest.fixture(scope="module")
def auth_tokens():
    base_url = _backend_base_url()
    creds = _credentials_from_memory()
    admin = _login(base_url, creds["admin"]["email"], creds["admin"]["password"])
    supplier = _login(base_url, creds["supplier"]["email"], creds["supplier"]["password"])
    return {"base_url": base_url, "admin": admin, "supplier": supplier}


def _headers(token: str):
    return {"Authorization": f"Bearer {token}"}


# Auth boundary checks for document endpoints
def test_live_documents_auth_boundaries(auth_tokens):
    base_url = auth_tokens["base_url"]

    admin_list = requests.get(
        f"{base_url}/api/supplier-assessment/documents",
        headers=_headers(auth_tokens["admin"]),
        timeout=30,
    )
    assert admin_list.status_code == 200, admin_list.text[:300]
    assert isinstance(admin_list.json(), list)

    admin_supplier_only = requests.get(
        f"{base_url}/api/supplier-assessment/my-assessment/documents",
        headers=_headers(auth_tokens["admin"]),
        timeout=30,
    )
    assert admin_supplier_only.status_code == 403, admin_supplier_only.text[:300]

    supplier_admin_list = requests.get(
        f"{base_url}/api/supplier-assessment/documents",
        headers=_headers(auth_tokens["supplier"]),
        timeout=30,
    )
    assert supplier_admin_list.status_code == 403, supplier_admin_list.text[:300]

    supplier_docs = requests.get(
        f"{base_url}/api/supplier-assessment/my-assessment/documents",
        headers=_headers(auth_tokens["supplier"]),
        timeout=30,
    )
    assert supplier_docs.status_code in [200, 404], supplier_docs.text[:300]
    if supplier_docs.status_code == 200:
        assert isinstance(supplier_docs.json(), list)


# Controlled live R2 verify/upload/read/presign/delete lifecycle
@pytest.mark.asyncio
async def test_live_r2_org_facility_lifecycle_disposable_object():
    bucket = _read_env_value("/app/backend/.env", "R2_BUCKET_ORG_FACILITY")
    if bucket != "organization-facility-data-dev":
        pytest.skip("R2 org_facility bucket is not development-scoped; live mutation skipped")

    storage = get_r2_storage()
    unique_prefix = f"supplier-assessment/verification/{uuid.uuid4()}"
    key = f"{unique_prefix}/minimal.pdf"
    payload = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"

    uploaded = False
    try:
        uploaded_result = await storage.upload_file(
            file_content=payload,
            filename="minimal.pdf",
            bucket_type="org_facility",
            content_type="application/pdf",
            object_key=key,
            metadata={"purpose": "p0_verification"},
        )
        assert uploaded_result.get("success") is True
        assert uploaded_result.get("key") == key
        uploaded = True

        content, content_type = await storage.get_file("org_facility", key)
        assert content == payload
        assert content_type.startswith("application/pdf")

        presigned = storage.generate_presigned_url("org_facility", key, expiration=120)
        assert isinstance(presigned, str) and presigned.startswith("http")
    finally:
        if uploaded:
            deleted = await storage.delete_file("org_facility", key)
            assert deleted is True
            assert await storage.file_exists("org_facility", key) is False


# Controlled persistence check for immutable acceptance + completion update path
@pytest.mark.asyncio
async def test_live_acceptance_persistence_and_cleanup():
    now = datetime.now(timezone.utc).isoformat()
    unique = f"p0-live-{uuid.uuid4()}"
    customer_org_id = "9067d872-8a3a-4ed9-8494-e3ef04952f7c"
    program_id = f"program-{unique}"
    version_id = f"version-{unique}"
    requirement_id = f"requirement-{unique}"
    relationship_one_id = f"rel-a-{unique}"
    relationship_two_id = f"rel-b-{unique}"

    bucket = _read_env_value("/app/backend/.env", "R2_BUCKET_ORG_FACILITY")
    if bucket != "organization-facility-data-dev":
        pytest.skip("R2 org_facility bucket is not development-scoped; controlled persistence skipped")

    storage = get_r2_storage()
    r2_key = f"supplier-assessment/verification/{unique}/acceptance-source.pdf"
    payload = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"

    created_r2 = False
    try:
        upload = await storage.upload_file(
            file_content=payload,
            filename="acceptance-source.pdf",
            bucket_type="org_facility",
            content_type="application/pdf",
            object_key=r2_key,
            metadata={"purpose": "p0_acceptance_persistence"},
        )
        assert upload.get("success") is True
        created_r2 = True

        await db.supplier_assessment_programs.insert_one({
            "id": f"program-row-{unique}",
            "program_id": program_id,
            "version": 1,
            "customer_org_id": customer_org_id,
            "config": {"modules": {"documents": {"enabled": True}}},
            "created_by": "p0-live-test",
            "created_at": now,
        })

        relationship_base = {
            "customer_org_id": customer_org_id,
            "assessment_program_id": program_id,
            "assessment_program_version": 1,
            "is_active": True,
            "company_name": "TEST_P0_Supplier",
            "contact_person": "P0 Test",
            "contact_email": f"{unique}@example.com",
            "contact_number": None,
            "revenue_percentage": None,
            "invitation_status": "pending",
            "created_at": now,
            "created_by": "p0-live-test",
            "created_by_email": "p0-live-test@example.com",
        }
        await db.supplier_relationships.insert_one({
            "id": relationship_one_id,
            "supplier_org_id": f"supplier-org-a-{unique}",
            **relationship_base,
        })
        await db.supplier_relationships.insert_one({
            "id": relationship_two_id,
            "supplier_org_id": f"supplier-org-b-{unique}",
            **relationship_base,
        })

        await db.supplier_document_versions.insert_one({
            "id": version_id,
            "customer_org_id": customer_org_id,
            "document_key": f"nda-{unique}",
            "version_number": 1,
            "original_filename": "acceptance-source.pdf",
            "content_type": "application/pdf",
            "file_size": len(payload),
            "bucket_type": "org_facility",
            "r2_key": r2_key,
            "created_by": "p0-live-test",
            "created_at": now,
        })
        await db.supplier_document_requirements.insert_one({
            "id": requirement_id,
            "customer_org_id": customer_org_id,
            "assessment_program_id": program_id,
            "assessment_program_version": 1,
            "document_key": f"nda-{unique}",
            "title": f"TEST_P0_NDA_{unique}",
            "document_version_id": version_id,
            "is_active": True,
            "created_by": "p0-live-test",
            "created_at": now,
        })

        relationship_one = await db.supplier_relationships.find_one({"id": relationship_one_id}, {"_id": 0})
        relationship_two = await db.supplier_relationships.find_one({"id": relationship_two_id}, {"_id": 0})
        assert relationship_one and relationship_two

        accepted_first = await documents_service.accept_supplier_document(
            relationship_one, requirement_id, "supplier-user-a"
        )
        accepted_repeat = await documents_service.accept_supplier_document(
            relationship_one, requirement_id, "supplier-user-a"
        )
        accepted_second_supplier = await documents_service.accept_supplier_document(
            relationship_two, requirement_id, "supplier-user-b"
        )

        assert accepted_first["id"] == accepted_repeat["id"]
        assert accepted_first["accepted_at"] == accepted_repeat["accepted_at"]
        assert accepted_first["document_version_id"] == version_id
        assert accepted_second_supplier["document_version_id"] == version_id

        await supplier_service._update_completion_status(relationship_one_id)
        await supplier_service._update_completion_status(relationship_two_id)

        acceptance_rows = await db.supplier_document_acceptances.find(
            {"document_requirement_id": requirement_id}, {"_id": 0}
        ).to_list(10)
        assert len(acceptance_rows) == 2

        persisted_rel_one = await db.supplier_relationships.find_one({"id": relationship_one_id}, {"_id": 0})
        persisted_rel_two = await db.supplier_relationships.find_one({"id": relationship_two_id}, {"_id": 0})
        assert persisted_rel_one["documents_completion_percent"] == 100.0
        assert persisted_rel_two["documents_completion_percent"] == 100.0
        assert persisted_rel_one["overall_completion_percent"] == 80.0
        assert persisted_rel_two["overall_completion_percent"] == 80.0
    finally:
        cleanup_results = {
            "acceptances": (await db.supplier_document_acceptances.delete_many({"document_requirement_id": requirement_id})).deleted_count,
            "requirements": (await db.supplier_document_requirements.delete_many({"id": requirement_id})).deleted_count,
            "versions": (await db.supplier_document_versions.delete_many({"id": version_id})).deleted_count,
            "relationships": (await db.supplier_relationships.delete_many({"id": {"$in": [relationship_one_id, relationship_two_id]}})).deleted_count,
            "programs": (await db.supplier_assessment_programs.delete_many({"program_id": program_id})).deleted_count,
        }
        print(f"CLEANUP_RESULTS: {cleanup_results}")
        assert cleanup_results["acceptances"] in [0, 2]
        assert cleanup_results["requirements"] in [0, 1]
        assert cleanup_results["versions"] in [0, 1]
        assert cleanup_results["relationships"] in [0, 2]
        assert cleanup_results["programs"] in [0, 1]

        if created_r2:
            await storage.delete_file("org_facility", r2_key)
            assert await storage.file_exists("org_facility", r2_key) is False
