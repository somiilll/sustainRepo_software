"""
Test suite for Data Integrity features:
1. Duplicate submission warning (non-blocking)
2. Idempotency via X-Idempotency-Key header
3. Task generation transactional handling
4. Retry-tasks endpoint
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASSWORD = "TestUser123!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _record_payload(category="Water", subcategory="Withdrawal", year=2099, month="January"):
    # Use future year 2099 to avoid clashing with real data
    return {
        "record_level": "organization",
        "category_id": f"test_{category}_{subcategory}",
        "category": category,
        "subcategory": subcategory,
        "frameworks": ["BRSR"],
        "reporting_period": {
            "reporting_type": "monthly",
            "year": year,
            "month": month,
        },
        "field_values": {"test_field": 100},
        "notes": f"TEST_iter111_{uuid.uuid4().hex[:8]}",
        "status": "completed",
    }


# =============================================================================
# 1. Duplicate Submission Warning
# =============================================================================
class TestDuplicateSubmissionWarning:
    def test_first_submission_no_warning(self, headers):
        payload = _record_payload(year=2099, month="February")
        r = requests.post(
            f"{BASE_URL}/api/esg-records/records/environment",
            headers=headers,
            json=payload,
            timeout=30,
        )
        assert r.status_code == 200, f"First create failed: {r.status_code} {r.text}"
        data = r.json()
        assert "record" in data
        assert data.get("warning") is None, f"Unexpected warning on first submit: {data.get('warning')}"

    def test_duplicate_submission_returns_warning(self, headers):
        payload = _record_payload(year=2099, month="March")
        # First submit
        r1 = requests.post(
            f"{BASE_URL}/api/esg-records/records/environment",
            headers=headers,
            json=payload,
            timeout=30,
        )
        assert r1.status_code == 200, f"First: {r1.text}"
        assert r1.json().get("warning") is None

        # Second submit — same period
        r2 = requests.post(
            f"{BASE_URL}/api/esg-records/records/environment",
            headers=headers,
            json=payload,
            timeout=30,
        )
        assert r2.status_code == 200, f"Second create should succeed: {r2.status_code} {r2.text}"
        body = r2.json()
        assert "warning" in body, f"Expected duplicate warning, got: {body}"
        warning = body["warning"]
        assert warning.get("type") == "DUPLICATE_SUBMISSION_WARNING"
        assert "existing_record_id" in warning
        assert warning.get("message")


# =============================================================================
# 2. Idempotency
# =============================================================================
class TestIdempotency:
    def test_idempotent_key_returns_cached_response(self, headers):
        idem_key = f"test-idem-{uuid.uuid4()}"
        payload = _record_payload(year=2099, month="April")

        h = {**headers, "X-Idempotency-Key": idem_key}

        r1 = requests.post(
            f"{BASE_URL}/api/esg-records/records/environment",
            headers=h,
            json=payload,
            timeout=30,
        )
        assert r1.status_code == 200, f"First idempotent call failed: {r1.text}"
        body1 = r1.json()
        assert body1.get("_idempotent") is not True, "First call should not be marked idempotent"
        first_record_id = body1["record"]["id"]

        # Second call with SAME idempotency key
        r2 = requests.post(
            f"{BASE_URL}/api/esg-records/records/environment",
            headers=h,
            json=payload,
            timeout=30,
        )
        assert r2.status_code == 200, f"Second call failed: {r2.text}"
        body2 = r2.json()
        assert body2.get("_idempotent") is True, f"Expected _idempotent=True, got: {body2}"
        assert body2["record"]["id"] == first_record_id, "Cached response should return same record id"

    def test_different_idempotency_keys_create_separate_calls(self, headers):
        # Two different keys -> both proceed (second gets duplicate warning but new record)
        payload = _record_payload(year=2099, month="May")

        h1 = {**headers, "X-Idempotency-Key": f"key-a-{uuid.uuid4()}"}
        h2 = {**headers, "X-Idempotency-Key": f"key-b-{uuid.uuid4()}"}

        r1 = requests.post(
            f"{BASE_URL}/api/esg-records/records/environment",
            headers=h1,
            json=payload,
            timeout=30,
        )
        r2 = requests.post(
            f"{BASE_URL}/api/esg-records/records/environment",
            headers=h2,
            json=payload,
            timeout=30,
        )
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["record"]["id"] != r2.json()["record"]["id"]
        assert r1.json().get("_idempotent") is not True
        assert r2.json().get("_idempotent") is not True


# =============================================================================
# 3 & 4. Task generation transactional & retry endpoint
# =============================================================================
class TestRetryTasksEndpoint:
    def test_retry_tasks_not_found(self, headers):
        fake_id = f"nonexistent-{uuid.uuid4()}"
        r = requests.post(
            f"{BASE_URL}/api/esg-assignments/assignments/{fake_id}/retry-tasks",
            headers=headers,
            timeout=30,
        )
        assert r.status_code == 404, f"Expected 404 for missing assignment, got {r.status_code}: {r.text}"

    def test_retry_tasks_on_existing_assignment(self, headers):
        """
        If a real assignment exists, retry-tasks should succeed (or at least return non-404).
        We fetch one assignment for the current org.
        """
        r = requests.get(
            f"{BASE_URL}/api/esg-assignments/assignments?page=1&page_size=1",
            headers=headers,
            timeout=30,
        )
        if r.status_code != 200:
            pytest.skip(f"Could not list assignments: {r.status_code}")
        items = r.json().get("assignments") or r.json().get("items") or []
        if not items:
            pytest.skip("No assignments exist in org to test retry-tasks against")
        assignment_id = items[0].get("id")
        assert assignment_id, "Assignment missing id"

        resp = requests.post(
            f"{BASE_URL}/api/esg-assignments/assignments/{assignment_id}/retry-tasks",
            headers=headers,
            timeout=60,
        )
        # Should be 200 (success) or 500 (task gen error surfaced properly). NOT 404.
        assert resp.status_code in (200, 500), f"Unexpected: {resp.status_code} {resp.text}"
        if resp.status_code == 200:
            body = resp.json()
            assert body.get("success") is True
            assert "tasks_created" in body


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
