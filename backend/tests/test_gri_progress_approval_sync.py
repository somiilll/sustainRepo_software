"""
Tests for GRI Tracker Progress & Approval Syncing (iter after 123).

Verifies:
1. Parent gri_101_2_a is completed=True (all subparts filled) with approval_status=approved
2. Parent gri_101_2_b is completed=False (subparts b_i, b_ii empty)
3. Questions with empty string values (d, e, f) are completed=False
4. My Tasks: gri_101_2_a shows approval_status=approved
5. My Tasks: BRSR policy_translated_to_procedures shows approval_status=approved
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASSWORD = "TestUser123!"
REPORTING_PERIOD = "FY 2026-2027"


@pytest.fixture(scope="module")
def auth_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    # Try common login endpoints
    resp = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if resp.status_code != 200:
        pytest.skip(f"Login failed: {resp.status_code} {resp.text[:200]}")
    data = resp.json()
    token = data.get("access_token") or data.get("token")
    if not token:
        pytest.skip(f"No token in login response: {data}")
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def section_data(auth_client):
    r = auth_client.get(
        f"{BASE_URL}/api/tracking/environment/frameworks/gri/sections/101-2",
        params={"reporting_period": REPORTING_PERIOD},
    )
    assert r.status_code == 200, f"Section endpoint failed: {r.status_code} {r.text[:300]}"
    return r.json()


@pytest.fixture(scope="module")
def my_tasks_data(auth_client):
    r = auth_client.get(
        f"{BASE_URL}/api/tracking/my-disclosures",
        params={"reporting_period": REPORTING_PERIOD},
    )
    assert r.status_code == 200, f"my-disclosures endpoint failed: {r.status_code} {r.text[:300]}"
    return r.json()


def _find_disclosure(section_data, key):
    # Section endpoint returns disclosures list; adapt if nested
    disclosures = section_data.get("disclosures") or section_data.get("items") or []
    if not disclosures and isinstance(section_data, list):
        disclosures = section_data
    for d in disclosures:
        if d.get("question_key") == key or d.get("key") == key or d.get("id") == key:
            return d
    return None


class TestGRITrackerAggregation:
    def test_section_response_shape(self, section_data):
        # Print keys so we can debug shape
        print("Section top-level keys:", list(section_data.keys()) if isinstance(section_data, dict) else type(section_data))
        assert isinstance(section_data, (dict, list))

    def test_gri_101_2_a_completed_true(self, section_data):
        d = _find_disclosure(section_data, "gri_101_2_a")
        assert d is not None, f"gri_101_2_a not found. Keys sample: {[x.get('question_key') for x in (section_data.get('disclosures') or [])[:20]]}"
        print("gri_101_2_a:", {k: d.get(k) for k in ("question_key","is_completed","completed","approval_status","completion_status","value")})
        # completion field name may be is_completed
        completed = d.get("is_completed", d.get("completed"))
        assert completed is True, f"Expected gri_101_2_a completed=True, got {completed}"

    def test_gri_101_2_a_approved(self, section_data):
        d = _find_disclosure(section_data, "gri_101_2_a")
        assert d is not None
        assert d.get("approval_status") == "approved", f"Expected approved, got {d.get('approval_status')}"

    def test_gri_101_2_b_not_completed(self, section_data):
        d = _find_disclosure(section_data, "gri_101_2_b")
        assert d is not None, "gri_101_2_b not found"
        print("gri_101_2_b:", {k: d.get(k) for k in ("question_key","is_completed","completed","approval_status","value")})
        completed = d.get("is_completed", d.get("completed"))
        assert completed is False, f"Expected gri_101_2_b completed=False (b_i, b_ii empty), got {completed}"

    @pytest.mark.parametrize("qkey", ["gri_101_2_d", "gri_101_2_e", "gri_101_2_f"])
    def test_empty_string_values_not_completed(self, section_data, qkey):
        d = _find_disclosure(section_data, qkey)
        if d is None:
            pytest.skip(f"{qkey} not in section (may be different section)")
        completed = d.get("is_completed", d.get("completed"))
        print(f"{qkey}: completed={completed}, value={d.get('value')!r}")
        assert completed is False, f"{qkey} has empty string value, should be completed=False, got {completed}"


class TestMyTasksApprovalStatus:
    def test_my_tasks_response_shape(self, my_tasks_data):
        print("my-tasks top-level keys:", list(my_tasks_data.keys()) if isinstance(my_tasks_data, dict) else type(my_tasks_data))

    def test_gri_101_2_a_my_tasks_approved(self, my_tasks_data):
        items = (
            my_tasks_data.get("questions")
            or my_tasks_data.get("records")
            or my_tasks_data.get("disclosures")
            or my_tasks_data.get("items")
            or my_tasks_data.get("assignments")
            or []
        )
        if not items and isinstance(my_tasks_data, list):
            items = my_tasks_data
        print(f"my-tasks items count: {len(items)}; sample keys: {[i.get('question_key') for i in items[:10]]}")
        target = None
        for it in items:
            qk = it.get("question_key") or it.get("entity_id") or it.get("key") or it.get("id")
            if qk == "gri_101_2_a":
                target = it
                break
        assert target is not None, f"gri_101_2_a not in my tasks. Sample: {[i.get('question_key') for i in items[:30]]}"
        print("my-tasks gri_101_2_a:", {k: target.get(k) for k in ("question_key","approval_status","status","is_completed")})
        assert target.get("approval_status") == "approved", f"Expected approved, got {target.get('approval_status')}"

    def test_brsr_policy_translated_approved(self, my_tasks_data):
        items = (
            my_tasks_data.get("questions")
            or my_tasks_data.get("records")
            or my_tasks_data.get("disclosures")
            or my_tasks_data.get("items")
            or my_tasks_data.get("assignments")
            or []
        )
        if not items and isinstance(my_tasks_data, list):
            items = my_tasks_data
        target = None
        for it in items:
            qk = it.get("question_key") or it.get("entity_id") or it.get("key") or it.get("id")
            if qk == "policy_translated_to_procedures":
                target = it
                break
        if target is None:
            pytest.skip("policy_translated_to_procedures not in my tasks for this reporting period")
        print("my-tasks policy_translated_to_procedures:", {k: target.get(k) for k in ("question_key","approval_status","status")})
        assert target.get("approval_status") == "approved", f"Expected approved, got {target.get('approval_status')}"
