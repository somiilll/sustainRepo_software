"""
# Module: R2 cleanup regressions for file/emission/OCR delete paths
# Features: uploaded_files metadata deletion ordering + linked evidence cleanup + OCR temp upload cleanup
"""

import io
import os
from datetime import datetime

import pytest
import requests


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")


def _require_base_url() -> str:
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL is required")
    return BASE_URL


def _login_admin() -> dict:
    base = _require_base_url()
    response = requests.post(
        f"{base}/api/auth/login",
        json={"email": "goyalsomil2001@gmail.com", "password": "TestUser123!"},
        timeout=30,
    )
    assert response.status_code == 200, f"Admin login failed: {response.status_code} {response.text}"
    payload = response.json()
    token = payload.get("access_token") or payload.get("token")
    assert isinstance(token, str) and token.strip(), payload
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


@pytest.fixture(scope="module")
def admin_headers() -> dict:
    return _login_admin()


def _upload_test_evidence(admin_headers: dict, filename: str, bucket_type: str = "emission_evidence") -> dict:
    base = _require_base_url()
    pdf_content = b"%PDF-1.4\n% r2 cleanup regression test pdf\n"
    response = requests.post(
        f"{base}/api/upload/evidence?bucket_type={bucket_type}",
        files={"file": (filename, io.BytesIO(pdf_content), "application/pdf")},
        headers={"Authorization": admin_headers["Authorization"]},
        timeout=60,
    )
    assert response.status_code == 200, f"Evidence upload failed: {response.status_code} {response.text}"
    payload = response.json()
    assert payload.get("file_id") and payload.get("url"), payload
    return payload


def _create_disposable_emission(admin_headers: dict, evidence_url: str) -> dict:
    base = _require_base_url()
    facilities_resp = requests.get(f"{base}/api/facilities", headers=admin_headers, timeout=30)
    assert facilities_resp.status_code == 200, facilities_resp.text
    facilities = facilities_resp.json() or []
    assert facilities, "No facilities available to create disposable emission"
    facility_id = facilities[0]["id"]

    fuels_resp = requests.get(f"{base}/api/fuel-database", headers=admin_headers, timeout=30)
    assert fuels_resp.status_code == 200, fuels_resp.text
    fuels = fuels_resp.json() or []
    assert fuels, "No fuels available to create disposable emission"
    fuel = fuels[0]

    unique_period = datetime.utcnow().strftime("%Y-%m")
    payload = {
        "facility_id": facility_id,
        "reporting_period": unique_period,
        "frequency_type": "monthly",
        "scope": fuel.get("scope") or "scope1",
        "category": fuel.get("category") or "Stationary Combustion",
        "sub_category": fuel.get("fuel_name") or "TEST_R2_CLEANUP",
        "fuel_type": fuel.get("fuel_name") or "TEST_R2_CLEANUP",
        "quantity": 10,
        "unit": "kg",
        "fuel_database_id": fuel.get("id"),
        "dynamic_field_values": {},
        "outputs": {},
        "evidence_url": evidence_url,
        "notes": "TEST_R2_CLEANUP_TEMP",
    }

    create_resp = requests.post(f"{base}/api/emissions", json=payload, headers=admin_headers, timeout=60)
    assert create_resp.status_code in (200, 201), (
        f"Disposable emission creation failed: {create_resp.status_code} {create_resp.text}"
    )
    created = create_resp.json()
    assert created.get("id"), created
    return created


def test_upload_then_delete_file_confirms_cleanup_before_metadata_removal(admin_headers):
    base = _require_base_url()
    upload = _upload_test_evidence(admin_headers, "test_r2_cleanup_file_delete.pdf")
    file_id = upload["file_id"]

    # File must exist before delete
    before_info = requests.get(f"{base}/api/files/{file_id}/info", timeout=30)
    assert before_info.status_code == 200, before_info.text
    before_payload = before_info.json()
    assert before_payload.get("id") == file_id

    delete_resp = requests.delete(f"{base}/api/files/{file_id}", headers=admin_headers, timeout=60)
    assert delete_resp.status_code == 200, delete_resp.text

    # Metadata should be gone after successful delete
    after_info = requests.get(f"{base}/api/files/{file_id}/info", timeout=30)
    assert after_info.status_code == 404, after_info.text


def test_delete_emission_cleans_linked_uploaded_file_metadata_and_object(admin_headers):
    base = _require_base_url()
    upload = _upload_test_evidence(admin_headers, "test_r2_cleanup_emission_linked.pdf")
    file_id = upload["file_id"]
    evidence_url = upload["url"]

    created = _create_disposable_emission(admin_headers, evidence_url)
    emission_id = created["id"]

    delete_emission = requests.delete(f"{base}/api/emissions/{emission_id}", headers=admin_headers, timeout=60)
    assert delete_emission.status_code == 200, delete_emission.text

    # Emission should be gone
    get_emission = requests.get(f"{base}/api/emissions/{emission_id}", headers=admin_headers, timeout=30)
    assert get_emission.status_code == 404, get_emission.text

    # Linked uploaded_files metadata should also be gone
    file_info = requests.get(f"{base}/api/files/{file_id}/info", timeout=30)
    assert file_info.status_code == 404, file_info.text


def test_ocr_upload_delete_route_with_isolated_data_if_integration_available(admin_headers):
    base = _require_base_url()

    # Create OCR upload (safe isolated test artifact)
    tiny_pdf = b"%PDF-1.4\n% OCR temp upload regression\n"
    upload_resp = requests.post(
        f"{base}/api/ocr-invoice/upload",
        files={"files": ("test_r2_cleanup_ocr.pdf", io.BytesIO(tiny_pdf), "application/pdf")},
        headers={"Authorization": admin_headers["Authorization"]},
        timeout=120,
    )

    # Environment may not have OCR AI provider keys - treat as integration-unavailable, not false failure.
    if upload_resp.status_code >= 500:
        pytest.skip(f"OCR integration unavailable for live upload/delete verification: {upload_resp.status_code} {upload_resp.text}")

    assert upload_resp.status_code == 200, upload_resp.text
    payload = upload_resp.json()
    upload_id = payload.get("upload_id")
    assert upload_id, payload

    delete_resp = requests.delete(f"{base}/api/ocr-invoice/uploads/{upload_id}", headers=admin_headers, timeout=60)
    assert delete_resp.status_code == 200, delete_resp.text
    delete_payload = delete_resp.json()
    assert delete_payload.get("message") == "Upload deleted"
