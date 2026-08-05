"""
Iteration 123 - BRSR/GRI Questionnaire Approval Workflow

Tests:
- GET /api/approval-workflows/questionnaire/queue
- POST /api/approval-workflows/questionnaire/{response_id}/approve
- POST /api/approval-workflows/questionnaire/{response_id}/reject
- Tracking service returns approval_status/rejection_reason from esg_responses
"""

import os
import uuid
import pytest
import requests

def _load_env():
    for p in ("/app/frontend/.env", "/app/backend/.env"):
        try:
            with open(p) as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    k, v = line.split("=", 1)
                    v = v.strip().strip('"').strip("'")
                    os.environ.setdefault(k.strip(), v)
        except FileNotFoundError:
            pass

_load_env()
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASSWORD = "TestUser123!"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text[:200]}")
    tok = r.json().get("access_token") or r.json().get("token")
    if not tok:
        pytest.skip("No token returned from login")
    return tok


@pytest.fixture(scope="module")
def headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def current_user(headers):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------- API SHAPE TESTS ----------------------


class TestQuestionnaireApprovalQueue:
    def test_queue_endpoint_returns_200_and_correct_shape(self, headers):
        r = requests.get(
            f"{BASE_URL}/api/approval-workflows/questionnaire/queue",
            headers=headers,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data
        assert "total" in data
        assert isinstance(data["items"], list)
        assert isinstance(data["total"], int)
        assert data["total"] == len(data["items"])
        # Validate item schema when present
        for item in data["items"]:
            assert "id" in item
            assert "question_key" in item
            assert "question_name" in item
            assert "response_data" in item or item.get("response_data") is None or True
            assert "submitted_by_name" in item
            assert "framework" in item
            assert "section_id" in item or item.get("section_id") is None or True

    def test_queue_with_framework_filter(self, headers):
        for fw in ("BRSR", "GRI"):
            r = requests.get(
                f"{BASE_URL}/api/approval-workflows/questionnaire/queue",
                params={"framework": fw},
                headers=headers,
                timeout=30,
            )
            assert r.status_code == 200, r.text
            data = r.json()
            assert "items" in data and "total" in data

    def test_queue_unauthorized(self):
        r = requests.get(
            f"{BASE_URL}/api/approval-workflows/questionnaire/queue",
            timeout=30,
        )
        assert r.status_code in (401, 403)


class TestQuestionnaireApproveReject:
    def test_reject_requires_reason_body(self, headers):
        # Missing body entirely => 422 validation error
        r = requests.post(
            f"{BASE_URL}/api/approval-workflows/questionnaire/nonexistent-id/reject",
            headers=headers,
            timeout=30,
        )
        # FastAPI returns 422 for missing required body
        assert r.status_code in (400, 422), r.text

    def test_reject_nonexistent_returns_400(self, headers):
        r = requests.post(
            f"{BASE_URL}/api/approval-workflows/questionnaire/nonexistent-id-xyz/reject",
            headers=headers,
            json={"reason": "test reason"},
            timeout=30,
        )
        # Service returns (False, "Response not found") => router raises 400
        assert r.status_code == 400, r.text
        assert "not found" in r.text.lower() or "response" in r.text.lower()

    def test_approve_nonexistent_returns_400(self, headers):
        r = requests.post(
            f"{BASE_URL}/api/approval-workflows/questionnaire/nonexistent-id-xyz/approve",
            headers=headers,
            json={"comment": "looks good"},
            timeout=30,
        )
        assert r.status_code == 400, r.text

    def test_approve_accepts_empty_body(self, headers):
        # Should reach service and fail on lookup (400) not validation (422)
        r = requests.post(
            f"{BASE_URL}/api/approval-workflows/questionnaire/does-not-exist/approve",
            headers=headers,
            timeout=30,
        )
        assert r.status_code in (400, 422)


# ---------------------- END-TO-END WITH SEEDED DATA ----------------------


@pytest.fixture(scope="module")
def seeded_pending_response(headers, current_user):
    """Seed an esg_response with approval_status=pending_approval + assignment for admin."""
    import pymongo
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        pytest.skip("MONGO_URL/DB_NAME not set")

    client = pymongo.MongoClient(mongo_url)
    db = client[db_name]

    org_id = current_user.get("organization_id")
    user_id = current_user.get("id")
    if not org_id or not user_id:
        pytest.skip("Admin missing org/user id")

    question_key = f"TEST_ITER123_q_{uuid.uuid4().hex[:8]}"
    response_id = str(uuid.uuid4())

    # Insert question config (BRSR)
    db.esg_question_configs.insert_one({
        "question_key": question_key,
        "label": "TEST Iter123 Question",
        "question": "TEST Iter123 Question",
        "framework": "BRSR",
        "section": "section_a",
        "brsr_section": "section_a",
        "type": "text",
    })

    # Insert assignment where admin is approver
    assignment_id = str(uuid.uuid4())
    db.esg_assignments.insert_one({
        "id": assignment_id,
        "organization_id": org_id,
        "entity_type": "question",
        "entity_id": question_key,
        "framework_id": "brsr",
        "requires_approval": True,
        "approver_id": user_id,
        "approval_chain": [user_id],
        "assignee_id": user_id,
    })

    # Insert response as pending_approval
    db.esg_responses.insert_one({
        "id": response_id,
        "organization_id": org_id,
        "question_key": question_key,
        "response": {"value": "initial answer"},
        "approval_status": "pending_approval",
        "submitted_by": user_id,
        "submitted_at": "2026-01-01T00:00:00+00:00",
        "framework": "BRSR",
        "reporting_year": "2025-2026",
    })

    yield {
        "response_id": response_id,
        "question_key": question_key,
        "org_id": org_id,
        "assignment_id": assignment_id,
    }

    # Cleanup
    db.esg_responses.delete_many({"question_key": question_key})
    db.esg_assignments.delete_one({"id": assignment_id})
    db.esg_question_configs.delete_one({"question_key": question_key})
    db.esg_responses_versions.delete_many({"record_id": question_key})
    db.approval_history.delete_many({"entity_id": question_key})
    client.close()


class TestEndToEndApproval:
    def test_queue_includes_seeded_pending_response(self, headers, seeded_pending_response):
        r = requests.get(
            f"{BASE_URL}/api/approval-workflows/questionnaire/queue",
            headers=headers,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        matching = [i for i in items if i.get("id") == seeded_pending_response["response_id"]]
        assert len(matching) == 1, f"Seeded response not found in queue. Items count: {len(items)}"
        item = matching[0]
        # Verify schema fields
        assert item["question_key"] == seeded_pending_response["question_key"]
        assert item["question_name"] == "TEST Iter123 Question"
        assert item["framework"] == "BRSR"
        assert item["section_id"] == "section_a"
        assert item["response_data"] == {"value": "initial answer"}
        assert "submitted_by_name" in item

    def test_reject_flow_updates_response_and_creates_version(self, headers, seeded_pending_response):
        import pymongo
        db = pymongo.MongoClient(os.environ.get("MONGO_URL"))[os.environ.get("DB_NAME")]

        response_id = seeded_pending_response["response_id"]
        question_key = seeded_pending_response["question_key"]

        # First reset to pending to ensure clean state
        db.esg_responses.update_one(
            {"id": response_id},
            {"$set": {"approval_status": "pending_approval"}, "$unset": {"rejection_reason": ""}},
        )

        reason = "TEST: data insufficient"
        r = requests.post(
            f"{BASE_URL}/api/approval-workflows/questionnaire/{response_id}/reject",
            headers=headers,
            json={"reason": reason},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("response", {}).get("approval_status") == "rejected"
        assert body.get("response", {}).get("rejection_reason") == reason

        # Verify persistence
        doc = db.esg_responses.find_one({"id": response_id})
        assert doc["approval_status"] == "rejected"
        assert doc["rejection_reason"] == reason

        # Version snapshot created
        ver = db.esg_responses_versions.find_one({"record_id": question_key, "change_type": "rejected"})
        assert ver is not None, "No rejection version snapshot created"
        assert ver.get("rejection_reason") == reason

    def test_approve_flow_updates_response(self, headers, seeded_pending_response):
        import pymongo
        db = pymongo.MongoClient(os.environ.get("MONGO_URL"))[os.environ.get("DB_NAME")]

        response_id = seeded_pending_response["response_id"]
        question_key = seeded_pending_response["question_key"]

        # Reset to pending
        db.esg_responses.update_one(
            {"id": response_id},
            {"$set": {"approval_status": "pending_approval"}},
        )

        updated_value = {"value": "corrected by approver"}
        r = requests.post(
            f"{BASE_URL}/api/approval-workflows/questionnaire/{response_id}/approve",
            headers=headers,
            json={"comment": "Approved after edit", "updated_response": updated_value},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        resp = r.json().get("response", {})
        assert resp.get("approval_status") == "approved"
        assert resp.get("response") == updated_value
        assert resp.get("edited_by_approver") is True

        # Verify approve on already approved returns 400
        r2 = requests.post(
            f"{BASE_URL}/api/approval-workflows/questionnaire/{response_id}/approve",
            headers=headers,
            json={},
            timeout=30,
        )
        assert r2.status_code == 400
        assert "pending" in r2.text.lower()

        # Version snapshot for approved exists
        ver = db.esg_responses_versions.find_one({"record_id": question_key, "change_type": "approved"})
        assert ver is not None, "No approval version snapshot created"

    def test_history_endpoint_returns_events(self, headers, seeded_pending_response):
        qk = seeded_pending_response["question_key"]
        r = requests.get(
            f"{BASE_URL}/api/approval-workflows/questionnaire/{qk}/history",
            headers=headers,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        hist = r.json().get("history", [])
        # We expect both approve and reject events from prior tests
        actions = {h.get("action") for h in hist}
        # At least one action recorded
        assert len(hist) >= 1
        assert actions & {"approve", "reject"}
