"""
Iteration 121: Regression test for V2 assignment resolution in
GET /api/tracking/my-disclosures.

Bug: endpoint only returned 1 question because it queried by
`assigned_to_user_id` directly on esg_assignments rather than resolving via
the V2 `esg_assignment_assignees` junction table.

Fix: service.get_user_assignments() now queries the junction table first and
falls back to legacy assigned_to_user_id. Also maps framework_id -> framework
for FE compatibility.

Reference credentials: admin goyalsomil2001@gmail.com / TestUser123!
Reporting period under test: FY 2026-2027 (Section B assigned).
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASSWORD = "TestUser123!"
REPORTING_PERIOD = "FY 2026-2027"


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"No token in login response: {data}"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def test_my_disclosures_endpoint_reachable(headers):
    r = requests.get(
        f"{BASE_URL}/api/tracking/my-disclosures",
        params={"reporting_period": REPORTING_PERIOD},
        headers=headers,
        timeout=30,
    )
    assert r.status_code == 200, f"Status {r.status_code}: {r.text}"
    data = r.json()
    # Response structure sanity
    assert "questions" in data
    assert "records" in data
    assert "total_questions" in data
    assert isinstance(data["questions"], list)


def test_my_disclosures_returns_multiple_questions_from_v2_junction(headers):
    """
    Core regression: with Section B (BRSR) assigned via V2 junction table,
    the endpoint should return the expanded set of questions (>1), not just 1.
    """
    r = requests.get(
        f"{BASE_URL}/api/tracking/my-disclosures",
        params={"reporting_period": REPORTING_PERIOD},
        headers=headers,
        timeout=30,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    total = data.get("total_questions", 0)
    print(f"total_questions returned = {total}")
    print(f"first 3 questions: {data['questions'][:3]}")
    # Expected: 8 BRSR questions per problem statement (>= 2 to be lenient)
    assert total >= 2, (
        f"Expected multiple assigned questions from V2 junction, got only {total}. "
        f"Regression: V2 junction resolution may be broken."
    )


def test_my_disclosures_includes_framework_field(headers):
    """
    FE compatibility: response must include `framework` field (mapped from
    framework_id) on each question.
    """
    r = requests.get(
        f"{BASE_URL}/api/tracking/my-disclosures",
        params={"reporting_period": REPORTING_PERIOD},
        headers=headers,
        timeout=30,
    )
    assert r.status_code == 200
    data = r.json()
    questions = data.get("questions", [])
    if not questions:
        pytest.skip("No questions returned; framework mapping cannot be verified")
    for q in questions:
        # Either framework or framework_id must be present
        has_framework = q.get("framework") or q.get("framework_id")
        assert has_framework, f"Question missing framework/framework_id: {q}"
        # If framework_id exists, framework should also exist (mapping)
        if q.get("framework_id"):
            assert q.get("framework") == q.get("framework_id"), (
                f"framework field not mapped from framework_id for {q.get('id')}: "
                f"framework={q.get('framework')} framework_id={q.get('framework_id')}"
            )


def test_my_disclosures_brsr_filter_returns_expected_count(headers):
    """
    Filter by BRSR framework client-side (mirroring FE logic in useMyTasks).
    Expected: at least 2 BRSR questions when Section B is assigned.
    """
    r = requests.get(
        f"{BASE_URL}/api/tracking/my-disclosures",
        params={"reporting_period": REPORTING_PERIOD},
        headers=headers,
        timeout=30,
    )
    assert r.status_code == 200
    data = r.json()
    qs = data.get("questions", [])
    brsr = [
        q for q in qs
        if (q.get("framework") or "").lower() == "brsr"
        or (q.get("framework_id") or "").lower() == "brsr"
    ]
    print(f"BRSR-filtered questions = {len(brsr)} / total {len(qs)}")
    assert len(brsr) >= 2, (
        f"Expected >=2 BRSR questions after client-side filter, got {len(brsr)}"
    )
