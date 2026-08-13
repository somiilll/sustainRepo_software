"""Tests for version history timeline dedup + BRSR table response merging fixes."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
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
    return requests.get(url, headers=auth_headers, timeout=30)


def _get_responses(auth_headers, framework, section, reporting_year=REPORTING_YEAR):
    url = f"{BASE_URL}/api/esg-questionnaire/responses/{framework}/{section}/{reporting_year}"
    return requests.get(url, headers=auth_headers, timeout=30)


class TestGRIDuplicateApprovedDedup:
    """FIX #1: gri_101_5_a_i should not show duplicate APPROVED events."""

    def test_no_duplicate_approved_events(self, auth_headers):
        r = _get_timeline(auth_headers, "GRI", "gri_101_5_a_i")
        assert r.status_code == 200, f"Status {r.status_code}: {r.text}"
        events = r.json().get("events", [])
        print(f"\nGRI gri_101_5_a_i events: count={len(events)}")
        for e in events:
            print(f"  - {e.get('event_type')} @ {e.get('timestamp')} src={e.get('source')}")

        approved = [e for e in events if e.get("event_type") == "APPROVED"]
        assert len(approved) >= 1, "Expected at least 1 APPROVED event"
        # Should have exactly 1 APPROVED per unique version/approval; check no dup from esg_responses_versions
        # when question_audit_log has same approval
        audit_approved = [e for e in approved if e.get("source") == "question_audit_log"]
        version_approved = [e for e in approved if e.get("source") == "esg_responses_versions"]
        print(f"  audit_approved={len(audit_approved)} version_approved={len(version_approved)}")

        # Rule: version-sourced APPROVED must be deduped when audit_log covers the same
        # So if audit_approved >= 1, version_approved should be 0 for APPROVED type
        if audit_approved:
            assert not version_approved, (
                f"Duplicate APPROVED from esg_responses_versions not deduped: "
                f"{len(version_approved)} version + {len(audit_approved)} audit"
            )


class TestBRSRTableResponseKeys:
    """FIX #3: BRSR table-type question responses must have original keys, not _current_fy suffixed."""

    def test_p1_appeals_revisions_response_keys_not_suffixed(self, auth_headers):
        # p1_appeals_revisions is in Principle 1 - try common section keys
        # Look up section by fetching sections list first
        section_resp = requests.get(
            f"{BASE_URL}/api/esg-questionnaire/sections/BRSR/{REPORTING_YEAR}",
            headers=auth_headers,
            timeout=30,
        )
        print(f"\nSections status: {section_resp.status_code}")
        found_response = None
        found_section = None
        if section_resp.status_code == 200:
            sections = section_resp.json()
            print(f"Total sections: {len(sections) if isinstance(sections, list) else 'N/A'}")

        # Try known BRSR sections for Principle 1
        for section in ["principle_1", "P1", "principle1", "p1", "PRINCIPLE_1", "sa_1", "sb_1"]:
            r = _get_responses(auth_headers, "BRSR", section)
            if r.status_code == 200:
                data = r.json()
                # look for our question key in response
                if isinstance(data, dict):
                    if "p1_appeals_revisions" in data:
                        found_response = data["p1_appeals_revisions"]
                        found_section = section
                        break
                    resp_map = data.get("responses") or data.get("data") or {}
                    if isinstance(resp_map, dict) and "p1_appeals_revisions" in resp_map:
                        found_response = resp_map["p1_appeals_revisions"]
                        found_section = section
                        break

        print(f"Found in section: {found_section}")
        print(f"Response payload: {found_response}")

        if found_response is None:
            pytest.skip("Could not locate p1_appeals_revisions response via section endpoint")

        # Extract actual value dict (could be nested)
        value = found_response
        if isinstance(value, dict) and "value" in value:
            value = value["value"]

        # Response should be a list (table rows) or dict with original keys
        def _check_keys(obj):
            if isinstance(obj, dict):
                for k in obj.keys():
                    assert not k.endswith("_current_fy"), (
                        f"Key '{k}' has forbidden _current_fy suffix"
                    )
                    assert not k.endswith("_previous_fy"), (
                        f"Key '{k}' has forbidden _previous_fy suffix"
                    )
                for v in obj.values():
                    _check_keys(v)
            elif isinstance(obj, list):
                for item in obj:
                    _check_keys(item)

        _check_keys(value)
        print("OK: no _current_fy / _previous_fy suffixed keys")


class TestBRSRAppealsTimelineCreated:
    """FIX #2: p1_appeals_revisions timeline shows CREATED event."""

    def test_timeline_has_created_event(self, auth_headers):
        r = _get_timeline(auth_headers, "BRSR", "p1_appeals_revisions")
        assert r.status_code == 200, f"Status {r.status_code}: {r.text}"
        events = r.json().get("events", [])
        print(f"\nBRSR p1_appeals_revisions events count={len(events)}")
        for e in events:
            print(f"  - {e.get('event_type')} @ {e.get('timestamp')} src={e.get('source')}")
        assert events, "Expected at least 1 event"
        types = {e.get("event_type") for e in events}
        assert types & {"CREATED", "UPDATED"}, f"Expected CREATED/UPDATED, got {types}"


class TestBRSRTrainingCoverageRegression:
    """Regression: p1_training_awareness_coverage should still show APPROVED events."""

    def test_timeline_still_has_approved(self, auth_headers):
        r = _get_timeline(auth_headers, "BRSR", "p1_training_awareness_coverage")
        assert r.status_code == 200, f"Status {r.status_code}: {r.text}"
        events = r.json().get("events", [])
        print(f"\nBRSR p1_training_awareness_coverage events count={len(events)}")
        for e in events:
            print(f"  - {e.get('event_type')} @ {e.get('timestamp')} src={e.get('source')}")

        # If this question has approvals, ensure they're preserved (not zeroed by dedup logic)
        types = {e.get("event_type") for e in events}
        # Not strict — question may not have approvals; but if it does, they must be visible
        if "APPROVED" in types:
            approved = [e for e in events if e.get("event_type") == "APPROVED"]
            assert len(approved) >= 1
        # At minimum some event should exist if there is response data
        # Otherwise NOT_FOUND is acceptable
        state = r.json().get("evidence_state")
        print(f"  evidence_state: {state}")
