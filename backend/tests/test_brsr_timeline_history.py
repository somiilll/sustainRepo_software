"""Tests for BRSR/GRI version history timeline endpoint (created/updated event handling)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://questionnaire-ai-hub.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASSWORD = "TestUser123!"
REPORTING_YEAR = "FY 2026-2027"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"No token in login response: {data}"
    return token


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def _get_timeline(auth_headers, framework, question_key, reporting_year=REPORTING_YEAR):
    url = f"{BASE_URL}/api/esg-questionnaire/timeline/{framework}/{question_key}/{reporting_year}"
    r = requests.get(url, headers=auth_headers, timeout=30)
    return r


class TestBRSRTimelineCreatedUpdated:
    """BRSR direct-save should produce CREATED/UPDATED events in version history."""

    def test_brsr_p1_appeals_revisions_has_created_or_updated_event(self, auth_headers):
        r = _get_timeline(auth_headers, "BRSR", "p1_appeals_revisions")
        assert r.status_code == 200, f"Status {r.status_code}: {r.text}"
        data = r.json()
        assert data["framework"] == "BRSR"
        assert data["question_key"] == "p1_appeals_revisions"
        assert data["reporting_year"] == REPORTING_YEAR
        assert "events" in data
        events = data["events"]
        print(f"BRSR p1_appeals_revisions events: count={len(events)}")
        for e in events:
            print(f"  - {e.get('event_type')} @ {e.get('timestamp')} src={e.get('source')}")

        # Must not be empty
        assert len(events) > 0, "Expected at least 1 event (CREATED/UPDATED)"

        # At least one CREATED or UPDATED event present
        event_types = {e.get("event_type") for e in events}
        assert event_types & {"CREATED", "UPDATED"}, (
            f"Expected CREATED or UPDATED event, got types: {event_types}"
        )

        # Evidence state should be FOUND (not NOT_FOUND)
        assert data["evidence_state"] in ("FOUND", "FOUND_PARTIAL"), (
            f"Unexpected evidence_state: {data['evidence_state']}"
        )

    def test_brsr_created_event_has_expected_fields(self, auth_headers):
        r = _get_timeline(auth_headers, "BRSR", "p1_appeals_revisions")
        assert r.status_code == 200
        events = r.json()["events"]
        cu_events = [e for e in events if e.get("event_type") in ("CREATED", "UPDATED")]
        assert cu_events, "No CREATED/UPDATED events present"
        ev = cu_events[0]
        # Timestamp must be present and source correct
        assert ev.get("timestamp"), "CREATED/UPDATED event missing timestamp"
        assert ev.get("source") == "question_audit_log", (
            f"Unexpected source: {ev.get('source')}"
        )


class TestGRITimelineApprovals:
    """GRI approved/rejected events should still work."""

    def test_gri_approval_events_still_present(self, auth_headers):
        r = _get_timeline(auth_headers, "GRI", "gri_101_5_a_i")
        assert r.status_code == 200, f"Status {r.status_code}: {r.text}"
        data = r.json()
        events = data.get("events", [])
        print(f"GRI gri_101_5_a_i events: count={len(events)}")
        for e in events:
            print(f"  - {e.get('event_type')} @ {e.get('timestamp')}")
        # Expect at least one event and includes APPROVED/REJECTED/SUBMITTED
        assert len(events) > 0, "Expected approval history events for GRI question"
        types = {e.get("event_type") for e in events}
        assert types & {"APPROVED", "REJECTED", "SUBMITTED"}, (
            f"Expected APPROVED/REJECTED/SUBMITTED, got: {types}"
        )


class TestTimelineEmptyState:
    """Question with no data should return NOT_FOUND with 0 events."""

    def test_nonexistent_question_returns_empty(self, auth_headers):
        r = _get_timeline(auth_headers, "BRSR", "p1_some_nonexistent")
        assert r.status_code == 200, f"Status {r.status_code}: {r.text}"
        data = r.json()
        assert data["events"] == [], f"Expected empty events, got: {data['events']}"
        assert data["evidence_state"] == "NOT_FOUND", (
            f"Expected NOT_FOUND, got: {data['evidence_state']}"
        )


class TestTimelineInvalidFramework:
    def test_invalid_framework_rejected(self, auth_headers):
        r = _get_timeline(auth_headers, "XYZ", "some_q")
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
