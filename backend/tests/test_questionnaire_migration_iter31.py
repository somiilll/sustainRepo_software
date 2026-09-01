"""
# Module: Questionnaire migration regression checks (iteration 31)
# Features: canonical-only queue source, legacy approve/reject parity, org boundary guards,
#           and legacy collection absence after migration.
"""

import os
import uuid
from typing import Dict

import pytest
import requests
from pymongo import MongoClient


def _load_env() -> None:
    for path in ("/app/frontend/.env", "/app/backend/.env"):
        if not os.path.exists(path):
            continue
        with open(path, "r", encoding="utf-8") as handle:
            for raw in handle:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env()

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")

ADMIN_EMAIL = "goyalsomil2001@gmail.com"
SUPPLIER_ADMIN_EMAIL = "goyalsomil+919@hotmail.com"
COMMON_PASSWORD = "TestUser123!"


@pytest.fixture(scope="module")
def assert_required_env():
    assert BASE_URL, "REACT_APP_BACKEND_URL is required"
    assert MONGO_URL, "MONGO_URL is required"
    assert DB_NAME, "DB_NAME is required"


@pytest.fixture(scope="module")
def db(assert_required_env):
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


def _login(email: str) -> str:
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": COMMON_PASSWORD},
        timeout=30,
    )
    assert response.status_code == 200, f"Login failed for {email}: {response.status_code} {response.text}"
    body = response.json()
    token = body.get("access_token") or body.get("token")
    assert token, f"No token returned for {email}: {body}"
    return token


@pytest.fixture(scope="module")
def admin_headers(assert_required_env) -> Dict[str, str]:
    token = _login(ADMIN_EMAIL)
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def supplier_headers(assert_required_env) -> Dict[str, str]:
    token = _login(SUPPLIER_ADMIN_EMAIL)
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_user(admin_headers):
    response = requests.get(f"{BASE_URL}/api/auth/me", headers=admin_headers, timeout=30)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture(scope="module")
def seeded_context(db, admin_user):
    """Seed migration-specific records; clean all seeded data at teardown."""
    suffix = uuid.uuid4().hex[:8]
    org_id = admin_user["organization_id"]

    keys = {
        "queue_q": f"TEST_ITER31_QUEUE_{suffix}",
        "approve_q": f"TEST_ITER31_APPROVE_{suffix}",
        "reject_restore_q": f"TEST_ITER31_REJECT_RESTORE_{suffix}",
        "reject_mark_q": f"TEST_ITER31_REJECT_MARK_{suffix}",
        "cross_org_q": f"TEST_ITER31_CROSS_ORG_{suffix}",
    }

    response_ids = {
        "queue": str(uuid.uuid4()),
        "approve": str(uuid.uuid4()),
        "reject_restore": str(uuid.uuid4()),
        "reject_mark": str(uuid.uuid4()),
        "cross_org": str(uuid.uuid4()),
    }

    emission_request_id = str(uuid.uuid4())
    reporting_year = "FY 2026-2027"

    # Question configs for display/framework resolution.
    config_docs = [
        {
            "question_key": keys["queue_q"],
            "label": "Queue test question",
            "question": "Queue test question",
            "framework": "GRI",
            "section": "environment",
        },
        {
            "question_key": keys["approve_q"],
            "label": "Approve test question",
            "question": "Approve test question",
            "framework": "BRSR",
            "section": "section_a",
        },
        {
            "question_key": keys["reject_restore_q"],
            "label": "Reject restore test question",
            "question": "Reject restore test question",
            "framework": "GRI",
            "section": "social",
        },
        {
            "question_key": keys["reject_mark_q"],
            "label": "Reject mark test question",
            "question": "Reject mark test question",
            "framework": "BRSR",
            "section": "section_b",
        },
        {
            "question_key": keys["cross_org_q"],
            "label": "Cross org test question",
            "question": "Cross org test question",
            "framework": "GRI",
            "section": "governance",
        },
    ]
    db.esg_question_configs.insert_many(config_docs)

    response_docs = [
        {
            "id": response_ids["queue"],
            "org_id": org_id,
            "organization_id": org_id,
            "question_key": keys["queue_q"],
            "framework": "GRI",
            "section": "environment",
            "reporting_year": reporting_year,
            "value": {"value": "queue pending"},
            "status": "pending_approval",
            "approval_status": "pending_approval",
            "submitted_by": admin_user["id"],
            "submitted_at": "2026-01-01T00:00:00+00:00",
        },
        {
            "id": response_ids["approve"],
            "org_id": org_id,
            "organization_id": org_id,
            "question_key": keys["approve_q"],
            "framework": "BRSR",
            "section": "section_a",
            "reporting_year": reporting_year,
            "value": {"value": "before approver edit"},
            "status": "pending_approval",
            "approval_status": "pending_approval",
            "submitted_by": admin_user["id"],
            "submitted_at": "2026-01-02T00:00:00+00:00",
        },
        {
            "id": response_ids["reject_restore"],
            "org_id": org_id,
            "organization_id": org_id,
            "question_key": keys["reject_restore_q"],
            "framework": "GRI",
            "section": "social",
            "reporting_year": reporting_year,
            "value": {"value": "pending change"},
            "last_approved_value": {"value": "previous approved"},
            "status": "pending_approval",
            "approval_status": "pending_approval",
            "submitted_by": admin_user["id"],
            "submitted_at": "2026-01-03T00:00:00+00:00",
        },
        {
            "id": response_ids["reject_mark"],
            "org_id": org_id,
            "organization_id": org_id,
            "question_key": keys["reject_mark_q"],
            "framework": "BRSR",
            "section": "section_b",
            "reporting_year": reporting_year,
            "value": {"value": "first submission"},
            "status": "pending_approval",
            "approval_status": "pending_approval",
            "submitted_by": admin_user["id"],
            "submitted_at": "2026-01-04T00:00:00+00:00",
        },
        {
            "id": response_ids["cross_org"],
            "org_id": org_id,
            "organization_id": org_id,
            "question_key": keys["cross_org_q"],
            "framework": "GRI",
            "section": "governance",
            "reporting_year": reporting_year,
            "value": {"value": "cross org pending"},
            "status": "pending_approval",
            "approval_status": "pending_approval",
            "submitted_by": admin_user["id"],
            "submitted_at": "2026-01-05T00:00:00+00:00",
        },
    ]
    db.organization_esg_responses.insert_many(response_docs)

    # Seed a non-questionnaire pending item to validate questionnaire queue isolation.
    db.approval_requests.insert_one(
        {
            "id": emission_request_id,
            "organization_id": org_id,
            "entity_type": "emission_record",
            "entity_id": f"TEST_EMISSION_{suffix}",
            "entity_snapshot": {
                "scope": "scope1",
                "category": "Stationary",
                "reporting_period": reporting_year,
            },
            "status": "pending",
            "current_approvers": [admin_user["id"]],
            "submitted_by": admin_user["id"],
            "submitted_by_name": admin_user.get("full_name") or admin_user.get("email"),
            "submitted_at": "2026-01-06T00:00:00+00:00",
        }
    )

    yield {
        "org_id": org_id,
        "keys": keys,
        "response_ids": response_ids,
        "reporting_year": reporting_year,
        "emission_request_id": emission_request_id,
    }

    db.approval_requests.delete_many({
        "$or": [
            {"id": emission_request_id},
            {"entity_id": {"$regex": f"^TEST_EMISSION_{suffix}$"}},
        ]
    })
    db.organization_esg_responses.delete_many({"question_key": {"$in": list(keys.values())}})
    db.esg_question_configs.delete_many({"question_key": {"$in": list(keys.values())}})
    db.esg_responses_versions.delete_many({"record_id": {"$in": list(keys.values())}})
    db.approval_history.delete_many({"entity_id": {"$in": list(keys.values())}})


class TestQuestionnaireMigrationIter31:
    """Migration regression coverage for legacy questionnaire approval endpoints."""

    def test_00_legacy_collection_absent_before_flows(self, db):
        assert "esg_responses" not in db.list_collection_names()

    def test_01_questionnaire_queue_excludes_non_questionnaire_pending_items(
        self,
        admin_headers,
        seeded_context,
    ):
        response = requests.get(
            f"{BASE_URL}/api/approval-workflows/questionnaire/queue",
            headers=admin_headers,
            timeout=30,
        )
        assert response.status_code == 200, response.text
        items = response.json().get("items", [])

        # Canonical pending questionnaire response must appear.
        assert any(item.get("id") == seeded_context["response_ids"]["queue"] for item in items)

        # Queue must not include pending approval_requests for non-questionnaire entities.
        assert not any(item.get("id") == seeded_context["emission_request_id"] for item in items)

    def test_02_approve_endpoint_updates_canonical_and_writes_version(
        self,
        db,
        admin_headers,
        seeded_context,
    ):
        response_id = seeded_context["response_ids"]["approve"]
        question_key = seeded_context["keys"]["approve_q"]
        edited_value = {"value": "edited by approver"}

        response = requests.post(
            f"{BASE_URL}/api/approval-workflows/questionnaire/{response_id}/approve",
            headers=admin_headers,
            json={"comment": "approved with edits", "updated_response": edited_value},
            timeout=30,
        )
        assert response.status_code == 200, response.text
        payload = response.json().get("response", {})
        assert payload.get("approval_status") == "approved"
        assert payload.get("value") == edited_value
        assert payload.get("edited_by_approver") is True

        canonical = db.organization_esg_responses.find_one({"id": response_id})
        assert canonical is not None
        assert canonical.get("approval_status") == "approved"
        assert canonical.get("value") == edited_value

        version = db.esg_responses_versions.find_one(
            {"record_id": question_key, "change_type": "approved"},
            sort=[("created_at", -1)],
        )
        assert version is not None
        assert version.get("approver_edited") is True
        assert version.get("final_value") == edited_value

    def test_03_approve_endpoint_cannot_cross_organization_boundary(
        self,
        supplier_headers,
        seeded_context,
    ):
        response_id = seeded_context["response_ids"]["cross_org"]
        response = requests.post(
            f"{BASE_URL}/api/approval-workflows/questionnaire/{response_id}/approve",
            headers=supplier_headers,
            json={"comment": "cross-org attempt"},
            timeout=30,
        )
        assert response.status_code == 400, response.text
        assert "not found" in response.text.lower()

    def test_04_reject_endpoint_restores_last_approved_value_when_present(
        self,
        db,
        admin_headers,
        seeded_context,
    ):
        response_id = seeded_context["response_ids"]["reject_restore"]
        question_key = seeded_context["keys"]["reject_restore_q"]
        reason = "Insufficient evidence"

        response = requests.post(
            f"{BASE_URL}/api/approval-workflows/questionnaire/{response_id}/reject",
            headers=admin_headers,
            json={"reason": reason},
            timeout=30,
        )
        assert response.status_code == 200, response.text

        canonical = db.organization_esg_responses.find_one({"id": response_id})
        assert canonical is not None
        assert canonical.get("approval_status") == "approved"
        assert canonical.get("value") == {"value": "previous approved"}
        assert canonical.get("last_approved_value") is None

        version = db.esg_responses_versions.find_one(
            {"record_id": question_key, "change_type": "rejected"},
            sort=[("created_at", -1)],
        )
        assert version is not None
        assert version.get("rejection_reason") == reason

    def test_05_reject_endpoint_marks_rejected_when_no_previous_approved_value(
        self,
        db,
        admin_headers,
        seeded_context,
    ):
        response_id = seeded_context["response_ids"]["reject_mark"]
        question_key = seeded_context["keys"]["reject_mark_q"]
        reason = "Answer incomplete"

        response = requests.post(
            f"{BASE_URL}/api/approval-workflows/questionnaire/{response_id}/reject",
            headers=admin_headers,
            json={"reason": reason},
            timeout=30,
        )
        assert response.status_code == 200, response.text
        payload = response.json().get("response", {})
        assert payload.get("approval_status") == "rejected"
        assert payload.get("rejection_reason") == reason

        canonical = db.organization_esg_responses.find_one({"id": response_id})
        assert canonical is not None
        assert canonical.get("approval_status") == "rejected"
        assert canonical.get("rejection_reason") == reason

        version = db.esg_responses_versions.find_one(
            {"record_id": question_key, "change_type": "rejected"},
            sort=[("created_at", -1)],
        )
        assert version is not None
        assert version.get("rejection_reason") == reason

    def test_99_legacy_collection_absent_after_flows(self, db):
        assert "esg_responses" not in db.list_collection_names()
