"""# Module: Supplier assessment admin due-date + assignment workflow regressions (Iter 33)."""

from __future__ import annotations

import io
import os
import uuid
from typing import Any, Dict, List, Optional

import pytest
import requests


ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASSWORD = "TestUser123!"
SUPPLIER_EMAIL = "goyalsomil+919@hotmail.com"
SUPPLIER_PASSWORD = "TestUser123!"


def _base_url() -> str:
    value = os.environ.get("REACT_APP_BACKEND_URL")
    if not value:
        pytest.skip("REACT_APP_BACKEND_URL is required")
    return value.rstrip("/")


def _login(email: str, password: str) -> Dict[str, Any]:
    response = requests.post(
        f"{_base_url()}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    token = payload.get("access_token") or payload.get("token")
    assert isinstance(token, str) and token.strip(), payload
    return {"payload": payload, "headers": {"Authorization": f"Bearer {token}"}}


def _pdf_bytes(title: str) -> bytes:
    return (
        b"%PDF-1.4\n"
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n"
        b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R>>endobj\n"
        b"4 0 obj<</Length 44>>stream\n"
        + f"BT /F1 12 Tf 50 100 Td ({title}) Tj ET\n".encode("utf-8")
        + b"endstream endobj\n"
        b"xref\n0 5\n0000000000 65535 f \n"
        b"0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \n0000000207 00000 n \n"
        b"trailer<</Size 5/Root 1 0 R>>\nstartxref\n300\n%%EOF"
    )


@pytest.fixture(scope="session")
def admin_auth() -> Dict[str, Any]:
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="session")
def supplier_auth() -> Dict[str, Any]:
    return _login(SUPPLIER_EMAIL, SUPPLIER_PASSWORD)


@pytest.fixture(scope="session")
def admin_suppliers(admin_auth: Dict[str, Any]) -> List[Dict[str, Any]]:
    response = requests.get(
        f"{_base_url()}/api/supplier-assessment/suppliers?page=1&page_size=100",
        headers=admin_auth["headers"],
        timeout=30,
    )
    assert response.status_code == 200, response.text
    suppliers = response.json().get("suppliers") or []
    assert suppliers, "Expected at least one supplier relationship"
    return suppliers


@pytest.fixture()
def created_resources(admin_auth: Dict[str, Any]):
    created: Dict[str, Optional[str]] = {"document_id": None, "training_id": None, "questionnaire_id": None}
    yield created

    if created.get("document_id"):
        requests.delete(
            f"{_base_url()}/api/supplier-assessment/documents/{created['document_id']}",
            headers=admin_auth["headers"],
            timeout=30,
        )
    if created.get("training_id"):
        requests.delete(
            f"{_base_url()}/api/supplier-assessment/trainings/{created['training_id']}",
            headers=admin_auth["headers"],
            timeout=30,
        )
    if created.get("questionnaire_id"):
        requests.delete(
            f"{_base_url()}/api/supplier-assessment/questionnaires/{created['questionnaire_id']}",
            headers=admin_auth["headers"],
            timeout=30,
        )


def _create_document(admin_auth: Dict[str, Any], supplier_ids: List[str], due_date: str) -> str:
    file_name = f"test_iter33_doc_{uuid.uuid4().hex[:8]}.pdf"
    form_data = {
        "title": f"TEST_ITER33_DOC_{uuid.uuid4().hex[:6]}",
        "response_mode": "ACCEPTANCE",
        "response_options_json": "[]",
        "supplier_relationship_ids": str(supplier_ids).replace("'", '"'),
        "due_date": due_date,
    }
    files = {"file": (file_name, io.BytesIO(_pdf_bytes("iter33-document")), "application/pdf")}
    response = requests.post(
        f"{_base_url()}/api/supplier-assessment/documents",
        headers=admin_auth["headers"],
        data=form_data,
        files=files,
        timeout=60,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    requirements = payload.get("requirements") or []
    assert requirements, payload
    requirement_id = requirements[0].get("id")
    assert isinstance(requirement_id, str) and requirement_id
    return requirement_id


def _create_training(admin_auth: Dict[str, Any], supplier_ids: List[str], due_date: str) -> str:
    file_name = f"test_iter33_training_{uuid.uuid4().hex[:8]}.pdf"
    form_data = {
        "title": f"TEST_ITER33_TRAINING_{uuid.uuid4().hex[:6]}",
        "description": "test",
        "supplier_relationship_ids": str(supplier_ids).replace("'", '"'),
        "due_date": due_date,
    }
    files = {"file": (file_name, io.BytesIO(_pdf_bytes("iter33-training")), "application/pdf")}
    response = requests.post(
        f"{_base_url()}/api/supplier-assessment/trainings",
        headers=admin_auth["headers"],
        data=form_data,
        files=files,
        timeout=90,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    training = payload.get("training") or {}
    training_id = training.get("id")
    assert isinstance(training_id, str) and training_id
    return training_id


def _create_questionnaire(admin_auth: Dict[str, Any], supplier_id: str, reporting_period: Optional[str]) -> str:
    payload = {
        "name": f"TEST_ITER33_Q_{uuid.uuid4().hex[:6]}",
        "description": "test",
        "due_date": "2026-12-20",
        "scoring_method": "question",
        "esg_section_weights": {"environment": 33.33, "social": 33.33, "governance": 33.34},
        "overall_supplier_weights": {"esg": 40.0, "ghg": 40.0, "revenue": 20.0},
        "assignment_mode": "selected",
        "supplier_relationship_ids": [supplier_id],
        "assignment_reporting_period": reporting_period,
    }
    response = requests.post(
        f"{_base_url()}/api/supplier-assessment/questionnaires",
        headers={**admin_auth["headers"], "Content-Type": "application/json"},
        json=payload,
        timeout=30,
    )
    assert response.status_code == 200, response.text
    questionnaire_id = response.json().get("id")
    assert isinstance(questionnaire_id, str) and questionnaire_id
    return questionnaire_id


# Document admin: due-date visible/edit + assignment manager API contracts.
def test_document_due_date_and_assignments_flow(admin_auth, admin_suppliers, created_resources):
    supplier_ids = [admin_suppliers[0]["id"]]
    requirement_id = _create_document(admin_auth, supplier_ids, "2026-12-15")
    created_resources["document_id"] = requirement_id

    list_response = requests.get(
        f"{_base_url()}/api/supplier-assessment/documents",
        headers=admin_auth["headers"],
        timeout=30,
    )
    assert list_response.status_code == 200, list_response.text
    documents = list_response.json() or []
    created_doc = next((item for item in documents if item.get("id") == requirement_id), None)
    assert created_doc is not None
    assert created_doc.get("due_date") == "2026-12-15"

    patch_response = requests.patch(
        f"{_base_url()}/api/supplier-assessment/documents/{requirement_id}",
        headers={**admin_auth["headers"], "Content-Type": "application/json"},
        json={"due_date": "2026-12-22"},
        timeout=30,
    )
    assert patch_response.status_code == 200, patch_response.text
    assert patch_response.json().get("due_date") == "2026-12-22"

    assignments_response = requests.get(
        f"{_base_url()}/api/supplier-assessment/documents/{requirement_id}/assignments",
        headers=admin_auth["headers"],
        timeout=30,
    )
    assert assignments_response.status_code == 200, assignments_response.text
    assignment_payload = assignments_response.json()
    assert isinstance(assignment_payload.get("assignments"), list)
    assert "_id" not in assignments_response.text
    for row in assignment_payload["assignments"]:
        assert "_id" not in row


def test_document_assign_unassign_and_cross_org_rejection(admin_auth, admin_suppliers, created_resources):
    supplier_ids = [admin_suppliers[0]["id"]]
    requirement_id = _create_document(admin_auth, supplier_ids, "2026-12-10")
    created_resources["document_id"] = requirement_id

    assignment_rows = requests.get(
        f"{_base_url()}/api/supplier-assessment/documents/{requirement_id}/assignments",
        headers=admin_auth["headers"],
        timeout=30,
    ).json()["assignments"]

    unassigned_row = next((row for row in assignment_rows if not row.get("is_assigned")), None)
    if unassigned_row:
        assign_response = requests.post(
            f"{_base_url()}/api/supplier-assessment/documents/{requirement_id}/assignments/{unassigned_row['supplier_relationship_id']}",
            headers=admin_auth["headers"],
            timeout=30,
        )
        assert assign_response.status_code == 200, assign_response.text

    assigned_row = next((row for row in assignment_rows if row.get("is_assigned") and row.get("can_unassign")), None)
    assert assigned_row is not None
    unassign_response = requests.delete(
        f"{_base_url()}/api/supplier-assessment/documents/{requirement_id}/assignments/{assigned_row['supplier_relationship_id']}",
        headers=admin_auth["headers"],
        timeout=30,
    )
    assert unassign_response.status_code == 200, unassign_response.text

    invalid_supplier_id = str(uuid.uuid4())
    invalid_assign = requests.post(
        f"{_base_url()}/api/supplier-assessment/documents/{requirement_id}/assignments/{invalid_supplier_id}",
        headers=admin_auth["headers"],
        timeout=30,
    )
    assert invalid_assign.status_code == 400, invalid_assign.text


def test_document_submitted_unassign_is_blocked_backend(admin_auth):
    docs_response = requests.get(
        f"{_base_url()}/api/supplier-assessment/documents",
        headers=admin_auth["headers"],
        timeout=30,
    )
    assert docs_response.status_code == 200, docs_response.text
    documents = docs_response.json() or []

    target: Optional[tuple[str, str]] = None
    for document in documents:
        assignments_response = requests.get(
            f"{_base_url()}/api/supplier-assessment/documents/{document['id']}/assignments",
            headers=admin_auth["headers"],
            timeout=30,
        )
        if assignments_response.status_code != 200:
            continue
        for row in assignments_response.json().get("assignments") or []:
            if row.get("is_assigned") and row.get("status") == "submitted" and not row.get("can_unassign"):
                target = (document["id"], row["supplier_relationship_id"])
                break
        if target:
            break

    if not target:
        pytest.skip("No submitted document assignment found to validate lock behavior")

    requirement_id, supplier_relationship_id = target
    unassign_response = requests.delete(
        f"{_base_url()}/api/supplier-assessment/documents/{requirement_id}/assignments/{supplier_relationship_id}",
        headers=admin_auth["headers"],
        timeout=30,
    )
    assert unassign_response.status_code == 400, unassign_response.text
    detail = str(unassign_response.json().get("detail", "")).lower()
    assert "cannot be unassigned" in detail


# Training admin: dedicated due-date save + assignment manager blocking completed unassign.
def test_training_due_date_and_assignment_listing_json_safe(admin_auth, admin_suppliers, created_resources):
    supplier_ids = [admin_suppliers[0]["id"]]
    training_id = _create_training(admin_auth, supplier_ids, "2026-12-12")
    created_resources["training_id"] = training_id

    patch_response = requests.patch(
        f"{_base_url()}/api/supplier-assessment/trainings/{training_id}",
        headers={**admin_auth["headers"], "Content-Type": "application/json"},
        json={"due_date": "2026-12-24"},
        timeout=30,
    )
    assert patch_response.status_code == 200, patch_response.text
    assert patch_response.json().get("due_date") == "2026-12-24"

    assignments_response = requests.get(
        f"{_base_url()}/api/supplier-assessment/trainings/{training_id}/assignments",
        headers=admin_auth["headers"],
        timeout=30,
    )
    assert assignments_response.status_code == 200, assignments_response.text
    payload = assignments_response.json()
    assert isinstance(payload.get("assignments"), list)
    assert "_id" not in assignments_response.text
    for row in payload["assignments"]:
        assert "_id" not in row


def test_training_assign_unassign_and_cross_org_rejection(admin_auth, admin_suppliers, created_resources):
    training_id = _create_training(admin_auth, [admin_suppliers[0]["id"]], "2026-12-14")
    created_resources["training_id"] = training_id

    assignment_rows = requests.get(
        f"{_base_url()}/api/supplier-assessment/trainings/{training_id}/assignments",
        headers=admin_auth["headers"],
        timeout=30,
    ).json()["assignments"]

    unassigned_row = next((row for row in assignment_rows if not row.get("is_assigned")), None)
    if unassigned_row:
        assign_response = requests.post(
            f"{_base_url()}/api/supplier-assessment/trainings/{training_id}/assignments/{unassigned_row['supplier_relationship_id']}",
            headers=admin_auth["headers"],
            timeout=30,
        )
        assert assign_response.status_code == 200, assign_response.text

    assigned_row = next((row for row in assignment_rows if row.get("is_assigned") and row.get("can_unassign")), None)
    assert assigned_row is not None
    unassign_response = requests.delete(
        f"{_base_url()}/api/supplier-assessment/trainings/{training_id}/assignments/{assigned_row['supplier_relationship_id']}",
        headers=admin_auth["headers"],
        timeout=30,
    )
    assert unassign_response.status_code == 200, unassign_response.text

    invalid_assign = requests.post(
        f"{_base_url()}/api/supplier-assessment/trainings/{training_id}/assignments/{str(uuid.uuid4())}",
        headers=admin_auth["headers"],
        timeout=30,
    )
    assert invalid_assign.status_code == 400, invalid_assign.text


def test_training_completed_unassign_is_blocked_backend(admin_auth):
    trainings_response = requests.get(
        f"{_base_url()}/api/supplier-assessment/trainings",
        headers=admin_auth["headers"],
        timeout=30,
    )
    assert trainings_response.status_code == 200, trainings_response.text
    trainings = trainings_response.json() or []

    target: Optional[tuple[str, str]] = None
    for training in trainings:
        assignments_response = requests.get(
            f"{_base_url()}/api/supplier-assessment/trainings/{training['id']}/assignments",
            headers=admin_auth["headers"],
            timeout=30,
        )
        if assignments_response.status_code != 200:
            continue
        for row in assignments_response.json().get("assignments") or []:
            if row.get("is_assigned") and row.get("status") == "completed" and not row.get("can_unassign"):
                target = (training["id"], row["supplier_relationship_id"])
                break
        if target:
            break

    if not target:
        pytest.skip("No completed training assignment found to validate lock behavior")

    training_id, supplier_relationship_id = target
    unassign_response = requests.delete(
        f"{_base_url()}/api/supplier-assessment/trainings/{training_id}/assignments/{supplier_relationship_id}",
        headers=admin_auth["headers"],
        timeout=30,
    )
    assert unassign_response.status_code == 400, unassign_response.text
    detail = str(unassign_response.json().get("detail", "")).lower()
    assert "completed training cannot be unassigned" in detail


# Questionnaire builder manage suppliers + submitted lock contracts.
def test_questionnaire_assignment_manager_flow_and_json_safe(admin_auth, admin_suppliers, created_resources):
    supplier = admin_suppliers[0]
    questionnaire_id = _create_questionnaire(admin_auth, supplier["id"], supplier.get("reporting_period"))
    created_resources["questionnaire_id"] = questionnaire_id

    assignments_response = requests.get(
        f"{_base_url()}/api/supplier-assessment/questionnaires/{questionnaire_id}/assignments",
        headers=admin_auth["headers"],
        timeout=30,
    )
    assert assignments_response.status_code == 200, assignments_response.text
    payload = assignments_response.json()
    rows = payload.get("assignments") or []
    assert rows
    assert "_id" not in assignments_response.text
    for row in rows:
        assert "_id" not in row

    unassigned_row = next((row for row in rows if not row.get("is_assigned")), None)
    if unassigned_row:
        assign_response = requests.post(
            f"{_base_url()}/api/supplier-assessment/questionnaires/{questionnaire_id}/assignments/{unassigned_row['supplier_relationship_id']}",
            headers=admin_auth["headers"],
            timeout=30,
        )
        assert assign_response.status_code == 200, assign_response.text

    assigned_row = next((row for row in rows if row.get("is_assigned") and row.get("can_unassign")), None)
    assert assigned_row is not None
    unassign_response = requests.delete(
        f"{_base_url()}/api/supplier-assessment/questionnaires/{questionnaire_id}/assignments/{assigned_row['supplier_relationship_id']}",
        headers=admin_auth["headers"],
        timeout=30,
    )
    assert unassign_response.status_code == 200, unassign_response.text

    invalid_assign = requests.post(
        f"{_base_url()}/api/supplier-assessment/questionnaires/{questionnaire_id}/assignments/{str(uuid.uuid4())}",
        headers=admin_auth["headers"],
        timeout=30,
    )
    assert invalid_assign.status_code == 400, invalid_assign.text


def test_questionnaire_submitted_unassign_is_blocked_backend(admin_auth):
    questionnaires_response = requests.get(
        f"{_base_url()}/api/supplier-assessment/questionnaires",
        headers=admin_auth["headers"],
        timeout=30,
    )
    assert questionnaires_response.status_code == 200, questionnaires_response.text
    questionnaires = questionnaires_response.json() or []

    target: Optional[tuple[str, str]] = None
    for questionnaire in questionnaires:
        assignments_response = requests.get(
            f"{_base_url()}/api/supplier-assessment/questionnaires/{questionnaire['id']}/assignments",
            headers=admin_auth["headers"],
            timeout=30,
        )
        if assignments_response.status_code != 200:
            continue
        for row in assignments_response.json().get("assignments") or []:
            if row.get("is_assigned") and row.get("status") == "submitted" and not row.get("can_unassign"):
                target = (questionnaire["id"], row["supplier_relationship_id"])
                break
        if target:
            break

    if not target:
        pytest.skip("No submitted questionnaire assignment found to validate lock behavior")

    questionnaire_id, supplier_relationship_id = target
    unassign_response = requests.delete(
        f"{_base_url()}/api/supplier-assessment/questionnaires/{questionnaire_id}/assignments/{supplier_relationship_id}",
        headers=admin_auth["headers"],
        timeout=30,
    )
    assert unassign_response.status_code == 400, unassign_response.text
    detail = str(unassign_response.json().get("detail", "")).lower()
    assert "submitted questionnaire cannot be unassigned" in detail


# Existing list + supplier task routes should still remain functional.
def test_core_routes_still_functional(admin_auth, supplier_auth):
    admin_endpoints = [
        "/api/supplier-assessment/documents",
        "/api/supplier-assessment/trainings",
        "/api/supplier-assessment/questionnaires",
    ]
    supplier_endpoints = [
        "/api/supplier-assessment/my-assessment/documents",
        "/api/supplier-assessment/my-assessment/trainings",
        "/api/supplier-assessment/my-assessment/questionnaires",
    ]

    for endpoint in admin_endpoints:
        response = requests.get(f"{_base_url()}{endpoint}", headers=admin_auth["headers"], timeout=30)
        assert response.status_code == 200, f"{endpoint}: {response.text}"
        assert isinstance(response.json(), list)

    for endpoint in supplier_endpoints:
        response = requests.get(f"{_base_url()}{endpoint}", headers=supplier_auth["headers"], timeout=30)
        assert response.status_code == 200, f"{endpoint}: {response.text}"
        assert isinstance(response.json(), list)
