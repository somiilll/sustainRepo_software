"""
Backend tests for GHG Emissions Scope 2 Facility E approval workflow (V2 junction table).

Tests fix in /app/backend/modules/emissions/router.py::_find_emission_assignment
which now checks the esg_assignment_assignees junction table (V2) in addition
to V1 legacy assigned_to_user_id.

Bug: Approval workflow was not triggered when saving emission records for
Facility E Scope 2, even though the assignment had requires_approval=True.
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone

import pytest
import requests

# Allow imports from /app/backend
sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback for internal test invocation
    BASE_URL = "http://localhost:8001"

ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASSWORD = "TestUser123!"

FACILITY_E_ID = "39ecd9be-9417-4df6-93c4-e583abf49260"
ORG_ID = "9067d872-8a3a-4ed9-8494-e3ef04952f7c"
USER_ID = "e3e7ec7e-5b3d-4011-a752-40cd67be84c0"
EXPECTED_ASSIGNMENT_ID = "6df2ba47-4340-453b-a2c6-fe7f929d5c0d"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("token") or r.json().get("access_token")
    assert token, f"No token in response: {r.text}"
    return token


@pytest.fixture(scope="module")
def api(auth_token):
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json",
    })
    return s


# ---------------------------------------------------------------------------
# Unit test - _find_emission_assignment directly
# ---------------------------------------------------------------------------
class TestFindEmissionAssignmentV2:
    """Direct unit test of _find_emission_assignment against real DB."""

    def test_finds_scope2_facility_e_via_v2_junction(self):
        from modules.emissions.router import _find_emission_assignment

        async def run():
            return await _find_emission_assignment(
                org_id=ORG_ID,
                user_id=USER_ID,
                scope="Scope 2",
                facility_id=FACILITY_E_ID,
            )

        assignment = asyncio.run(run())
        assert assignment is not None, (
            "Expected _find_emission_assignment to find the Facility E Scope 2 "
            "assignment via esg_assignment_assignees junction table"
        )
        assert assignment.get("id") == EXPECTED_ASSIGNMENT_ID, (
            f"Wrong assignment returned: {assignment.get('id')} "
            f"(expected {EXPECTED_ASSIGNMENT_ID})"
        )
        assert assignment.get("requires_approval") is True
        assert assignment.get("approver_id"), "approver_id must be set"
        assert assignment.get("subcategory") == "GHG Emissions - Scope 2"
        assert assignment.get("facility_id") == FACILITY_E_ID

    def test_scope2_lowercase_normalization(self):
        """scope='scope2' (no space) should also resolve."""
        from modules.emissions.router import _find_emission_assignment

        async def run():
            return await _find_emission_assignment(
                org_id=ORG_ID, user_id=USER_ID,
                scope="scope2", facility_id=FACILITY_E_ID,
            )
        a = asyncio.run(run())
        assert a is not None
        assert a.get("id") == EXPECTED_ASSIGNMENT_ID

    def test_no_match_for_unrelated_facility(self):
        """Facility-specific Scope 2 assignment must not match a random facility."""
        from modules.emissions.router import _find_emission_assignment

        async def run():
            return await _find_emission_assignment(
                org_id=ORG_ID, user_id=USER_ID,
                scope="Scope 2",
                facility_id="00000000-0000-0000-0000-000000000000",
            )
        a = asyncio.run(run())
        # The Scope 2 assignment is facility-scoped to Facility E only.
        # If any org-level scope2 assignment exists it could still match;
        # here we just assert it is NOT the Facility E-specific one.
        if a is not None:
            assert a.get("id") != EXPECTED_ASSIGNMENT_ID or \
                a.get("assignment_level") == "organization"


# ---------------------------------------------------------------------------
# Integration test - create emission record and verify approval request
# ---------------------------------------------------------------------------
class TestScope2ApprovalWorkflowIntegration:
    """End-to-end: POST /api/emissions for Scope 2 Facility E creates
    an approval_requests document."""

    created_record_id = None

    def test_create_scope2_facility_e_triggers_approval(self, api):
        # Unique reporting period to avoid collision
        period = "2025-11"

        payload = {
            "facility_id": FACILITY_E_ID,
            "organization_id": ORG_ID,
            "scope": "Scope 2",
            "category": "Purchased Electricity",
            "sub_category": "Grid Electricity",
            "reporting_period": period,
            "frequency_type": "monthly",
            "inputs": {
                "electricity_consumed": {"value": 100, "unit": "kWh"}
            },
            "outputs": {
                "co2":  {"value": 0.05, "unit": "tCO2"},
                "ch4":  {"value": 0.0,  "unit": "tCH4"},
                "n2o":  {"value": 0.0,  "unit": "tN2O"},
                "co2e": {"value": 0.05, "unit": "tCO2e"},
            },
        }

        r = api.post(f"{BASE_URL}/api/emissions", json=payload, timeout=30)
        assert r.status_code in (200, 201), f"Create failed: {r.status_code} {r.text}"
        body = r.json()
        record_id = body.get("id")
        assert record_id, f"No id in response: {body}"
        TestScope2ApprovalWorkflowIntegration.created_record_id = record_id

        # Give a moment for any async writes (defensive)
        import time
        time.sleep(0.5)

        # Now query MongoDB directly to verify approval_requests entry
        from shared.database.mongo import db

        async def find_approval():
            return await db.approval_requests.find_one(
                {"entity_id": record_id, "entity_type": "emission_record"},
                {"_id": 0},
            )

        approval = asyncio.run(find_approval())
        assert approval is not None, (
            f"No approval_requests document created for emission record "
            f"{record_id}. Expected approval workflow to be triggered because "
            f"Facility E Scope 2 assignment has requires_approval=True."
        )
        assert approval.get("status") == "pending"
        assert approval.get("submitted_by") == USER_ID
        assert approval.get("entity_subtype") == "Scope 2"
        assert approval.get("workflow_id") == f"assignment_{EXPECTED_ASSIGNMENT_ID}"
        assert USER_ID in (approval.get("current_approvers") or [])

    def test_cleanup_created_record(self, api):
        """Clean up TEST record + approval to keep DB tidy."""
        rid = TestScope2ApprovalWorkflowIntegration.created_record_id
        if not rid:
            pytest.skip("Nothing to clean up")

        from shared.database.mongo import db

        async def cleanup():
            await db.emission_records.delete_many({"id": rid})
            await db.pending_records.delete_many({"id": rid})
            await db.pending_records.delete_many({"original_record_id": rid})
            await db.emission_history.delete_many({"emission_id": rid})
            await db.approval_requests.delete_many({"entity_id": rid})

        asyncio.run(cleanup())
