"""
Test GRI submission approval flow.

Regression: Fixes MongoDB WriteError:
"Updating the path 'reporting_year' would create a conflict at 'reporting_year'"
that was thrown when approving a submission, because reporting_year was in
both $set and $setOnInsert in the canonical response update.

Also verifies:
- Save with status=saved routes to approval queue when approver is assigned
- After approval, organization_esg_responses has the approved flat response
"""
import os
import uuid
import time
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

ADMIN_EMAIL = "goyalsomil2001@gmail.com"
USER_EMAIL = "goyalsomil+1@hotmail.com"
ADMIN_PASSWORD = "TestUser123!"
ORG_ID = "9067d872-8a3a-4ed9-8494-e3ef04952f7c"
REPORTING_PERIOD = "FY 2026-2027"
# Unique key for this test iteration to avoid clashing with existing data
QUESTION_KEY = f"gri_101_2_c_i_test_{uuid.uuid4().hex[:8]}"


@pytest.fixture(scope="module")
def db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


def _login(email):
    assert BASE_URL, "REACT_APP_BACKEND_URL is required"
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"No token in login response: {data}"
    return tok


@pytest.fixture(scope="module")
def user_headers():
    return {"Authorization": f"Bearer {_login(USER_EMAIL)}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login(ADMIN_EMAIL)}", "Content-Type": "application/json"}


@pytest.fixture(scope="module", autouse=True)
def setup_assignment(db):
    """Ensure an approver assignment exists for QUESTION_KEY so save with status=saved
    routes to approval queue. Cleanup after tests."""
    # For the subpart check to succeed, we set an assignment on the question itself.
    assignment_id = str(uuid.uuid4())
    assignee_id = str(uuid.uuid4())
    user = db.users.find_one({"email": USER_EMAIL}, {"id": 1})
    admin = db.users.find_one({"email": ADMIN_EMAIL}, {"id": 1})
    assert user and admin
    db.esg_assignments.insert_one({
        "id": assignment_id,
        "organization_id": ORG_ID,
        "entity_id": QUESTION_KEY,
        "entity_type": "question",
        "reporting_period": REPORTING_PERIOD,
        "requires_approval": True,
        "approver_ids": [admin["id"]],
    })
    db.esg_assignment_assignees.insert_one({
        "id": assignee_id,
        "assignment_id": assignment_id,
        "organization_id": ORG_ID,
        "user_id": user["id"],
        "removed_at": None,
    })
    yield
    # Cleanup
    db.esg_assignment_assignees.delete_one({"id": assignee_id})
    db.esg_assignments.delete_one({"id": assignment_id})
    db.esg_response_submissions.delete_many({"organization_id": ORG_ID, "question_key": QUESTION_KEY})
    db.organization_esg_responses.delete_many(
        {"org_id": ORG_ID, "question_key": QUESTION_KEY, "reporting_year": REPORTING_PERIOD}
    )
    db.approval_requests.delete_many({"organization_id": ORG_ID, "entity_id": QUESTION_KEY})
    db.esg_responses_versions.delete_many({"organization_id": ORG_ID, "record_id": QUESTION_KEY})


class TestGRIApprovalFlow:
    submission_id = None
    approved_value = "This is the approved test value for GRI 101-2 c-i."

    def test_01_save_creates_pending_submission(self, user_headers):
        """POST /response with status=saved should create a pending submission."""
        r = requests.post(
            f"{BASE_URL}/api/esg-questionnaire/response",
            headers=user_headers,
            json={
                "question_key": QUESTION_KEY,
                "value": self.approved_value,
                "reporting_period": REPORTING_PERIOD,
                "status": "saved",
            },
            timeout=30,
        )
        assert r.status_code == 200, f"save failed: {r.status_code} {r.text}"
        data = r.json()
        assert data.get("submitted_for_approval") is True, f"expected submitted_for_approval=True: {data}"
        assert data.get("status") == "pending_approval"
        sid = data.get("submission_id")
        assert sid, f"no submission_id: {data}"
        TestGRIApprovalFlow.submission_id = sid

    def test_02_approve_submission_no_error(self, admin_headers):
        """POST /submissions/approve should succeed (regression: no MongoDB WriteError)."""
        assert TestGRIApprovalFlow.submission_id, "submission_id missing from test_01"
        r = requests.post(
            f"{BASE_URL}/api/esg-questionnaire/submissions/approve",
            headers=admin_headers,
            json={"submission_id": TestGRIApprovalFlow.submission_id},
            timeout=30,
        )
        assert r.status_code == 200, f"approve failed: {r.status_code} {r.text}"
        data = r.json()
        assert data.get("success") is True, f"success not true: {data}"
        assert "Failed to approve" not in (data.get("message") or "")
        assert data.get("question_key") == QUESTION_KEY
        assert data.get("final_value") == self.approved_value

    def test_03_canonical_response_has_approved_status(self, db):
        """After approval, the canonical response has approved status and value."""
        # Small wait for propagation (not necessary since awaited, but safe)
        time.sleep(0.5)
        doc = db.organization_esg_responses.find_one(
            {"org_id": ORG_ID, "question_key": QUESTION_KEY, "reporting_year": REPORTING_PERIOD}
        )
        assert doc is not None, "canonical response missing after approval"
        assert doc.get("approval_status") == "approved", f"approval_status not approved: {doc.get('approval_status')}"
        assert doc.get("status") in ("approved", "saved")
        assert doc.get("value") == TestGRIApprovalFlow.approved_value
        assert doc.get("reporting_year") == REPORTING_PERIOD
        assert doc.get("approved_by")

    def test_04_submission_marked_approved(self, db):
        doc = db.esg_response_submissions.find_one({"id": TestGRIApprovalFlow.submission_id})
        assert doc is not None, "submission doc missing"
        assert doc.get("status") == "approved"
