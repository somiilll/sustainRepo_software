"""
Iteration 115 - Category-level Assignment Expansion tests

Verifies:
1. Creating an assignment with category='Water' (no subcategory) expands to
   independent subcategory assignments (Withdrawal, Discharge, Consumption, Recycle).
2. No parent assignment (with subcategory=None) is stored.
3. Each expanded assignment has assignment_source='category' and
   expanded_from_category='Water'.
4. GET /api/esg-assignments/progress/category/{category} aggregates progress
   across the subcategory assignments.
5. Direct subcategory assignment gets assignment_source='subcategory'.
6. Bulk update by category updates all subcategory assignments.
"""

import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://executive-export-pro.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASSWORD = "TestUser123!"

REPORTING_PERIOD = "TEST_2024_ITER115"
CATEGORY = "Water"
EXPECTED_SUBCATEGORIES = {"Withdrawal", "Discharge", "Consumption", "Recycle"}


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"No token in response: {data}"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_user_id(headers):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    return r.json().get("id")


def _cleanup(headers):
    """Delete assignments created during test."""
    # List all assignments for this org matching our reporting period
    r = requests.get(
        f"{BASE_URL}/api/esg-assignments/assignments",
        headers=headers,
        params={"reporting_period": REPORTING_PERIOD, "page_size": 100},
        timeout=30,
    )
    if r.status_code == 200:
        items = r.json().get("items", []) or r.json().get("assignments", [])
        for a in items:
            aid = a.get("id")
            if aid and a.get("category") == CATEGORY:
                requests.delete(f"{BASE_URL}/api/esg-assignments/assignments/{aid}", headers=headers, timeout=30)


@pytest.fixture(scope="module", autouse=True)
def setup_and_teardown(headers):
    _cleanup(headers)
    yield
    _cleanup(headers)


class TestCategoryExpansion:
    def test_1_category_expansion_creates_subcategory_assignments(self, headers, admin_user_id):
        """Creating with category=Water & no subcategory expands to all subcategories."""
        payload = {
            "category": CATEGORY,
            # no subcategory - triggers expansion
            "reporting_period": REPORTING_PERIOD,
            "assignment_level": "organization",
            "user_ids": [admin_user_id],
        }
        r = requests.post(f"{BASE_URL}/api/esg-records/assignments", headers=headers, json=payload, timeout=60)
        assert r.status_code == 200, f"Create failed: {r.status_code} {r.text}"
        body = r.json()
        # In expansion case, service returns a summary dict in place of assignment
        assignment = body.get("assignment", {})
        # Summary shape
        assert assignment.get("expansion_type") == "category_to_subcategories", (
            f"Expected expansion summary, got: {assignment}"
        )
        assert assignment.get("category") == CATEGORY
        assert assignment.get("assignment_source") == "category"
        created = assignment.get("created") or []
        # Should equal len(EXPECTED_SUBCATEGORIES)
        assert len(created) == len(EXPECTED_SUBCATEGORIES), (
            f"Expected {len(EXPECTED_SUBCATEGORIES)} created, got {len(created)}: {created}"
        )
        subs_created = {c.get("subcategory") for c in created}
        assert subs_created == EXPECTED_SUBCATEGORIES, f"Subcats mismatch: {subs_created}"

    def test_2_no_parent_assignment_stored(self, headers):
        """No assignment with subcategory=None should exist for this category+period."""
        r = requests.get(
            f"{BASE_URL}/api/esg-assignments/assignments",
            headers=headers,
            params={"reporting_period": REPORTING_PERIOD, "page_size": 100},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        items = r.json().get("items", []) or r.json().get("assignments", [])
        water_items = [a for a in items if a.get("category") == CATEGORY]
        # There should be leaf assignments only
        assert len(water_items) >= len(EXPECTED_SUBCATEGORIES), (
            f"Expected at least {len(EXPECTED_SUBCATEGORIES)} leaf assignments, got {len(water_items)}"
        )
        # None with subcategory=None
        parents = [a for a in water_items if not a.get("subcategory")]
        assert len(parents) == 0, f"Parent assignment(s) found (subcategory=None): {parents}"

    def test_3_each_expanded_assignment_metadata(self, headers):
        r = requests.get(
            f"{BASE_URL}/api/esg-assignments/assignments",
            headers=headers,
            params={"reporting_period": REPORTING_PERIOD, "page_size": 100},
            timeout=30,
        )
        assert r.status_code == 200
        items = r.json().get("items", []) or r.json().get("assignments", [])
        water_items = [a for a in items if a.get("category") == CATEGORY and a.get("subcategory")]
        assert water_items, "No expanded subcategory assignments found"
        for a in water_items:
            assert a.get("assignment_source") == "category", (
                f"assignment_source mismatch for {a.get('subcategory')}: {a.get('assignment_source')}"
            )
            assert a.get("expanded_from_category") == CATEGORY, (
                f"expanded_from_category mismatch: {a.get('expanded_from_category')}"
            )

    def test_4_category_progress_endpoint_aggregates(self, headers):
        r = requests.get(
            f"{BASE_URL}/api/esg-assignments/progress/category/{CATEGORY}",
            headers=headers,
            timeout=30,
        )
        assert r.status_code == 200, f"progress failed: {r.status_code} {r.text}"
        data = r.json()
        # Should have aggregated keys
        for k in ("total", "completed", "pending", "percentage"):
            assert k in data, f"missing key {k} in progress response: {data}"
        # Total >= 0 (aggregated across subcategories); with no tasks may be 0
        assert isinstance(data.get("total"), int)

    def test_5_direct_subcategory_assignment_source(self, headers, admin_user_id):
        """Direct subcategory assignment should have assignment_source='subcategory'."""
        # Use a fresh reporting period to avoid collision with expansion
        period = f"TEST_direct_{uuid.uuid4().hex[:8]}"
        payload = {
            "category": CATEGORY,
            "subcategory": "Withdrawal",
            "reporting_period": period,
            "assignment_level": "organization",
            "user_ids": [admin_user_id],
        }
        try:
            r = requests.post(f"{BASE_URL}/api/esg-records/assignments", headers=headers, json=payload, timeout=60)
            assert r.status_code == 200, f"Direct create failed: {r.status_code} {r.text}"
            body = r.json()
            assignment = body.get("assignment", {})
            # Not an expansion summary
            assert assignment.get("expansion_type") is None, f"Should not be expansion: {assignment}"
            assert assignment.get("assignment_source") == "subcategory", (
                f"assignment_source should be 'subcategory', got: {assignment.get('assignment_source')}"
            )
            assert assignment.get("subcategory") == "Withdrawal"
            assignment_id = assignment.get("id")
            assert assignment_id, "No assignment id returned"
        finally:
            # cleanup
            r2 = requests.get(
                f"{BASE_URL}/api/esg-assignments/assignments",
                headers=headers,
                params={"reporting_period": period, "page_size": 100},
                timeout=30,
            )
            if r2.status_code == 200:
                items = r2.json().get("items", []) or r2.json().get("assignments", [])
                for a in items:
                    if a.get("id"):
                        requests.delete(
                            f"{BASE_URL}/api/esg-assignments/assignments/{a['id']}",
                            headers=headers,
                            timeout=30,
                        )

    def test_6_bulk_update_by_category_updates_all_subcategories(self, headers, admin_user_id):
        """
        Re-submitting the category-level assignment should touch all subcategory
        assignments (update path). We change a schedule-related property and
        verify subcategory rows get the update.
        """
        payload = {
            "category": CATEGORY,
            "reporting_period": REPORTING_PERIOD,
            "assignment_level": "organization",
            "user_ids": [admin_user_id],
            "timezone": "UTC",  # differs from default Asia/Kolkata
            "filling_frequency": "monthly",
            "start_date": "2024-01-01",
            "end_date": "2024-12-31",
        }
        r = requests.post(f"{BASE_URL}/api/esg-records/assignments", headers=headers, json=payload, timeout=60)
        assert r.status_code == 200, f"Re-submit failed: {r.status_code} {r.text}"
        body = r.json()
        summary = body.get("assignment", {})
        assert summary.get("expansion_type") == "category_to_subcategories"
        # There should be 'updated' entries covering the subcategories
        updated = summary.get("updated") or []
        created = summary.get("created") or []
        touched = {x.get("subcategory") for x in updated} | {x.get("subcategory") for x in created}
        assert EXPECTED_SUBCATEGORIES.issubset(touched), (
            f"Not all subcategories touched. Touched={touched}"
        )

        # Now verify each stored assignment has timezone=UTC
        r = requests.get(
            f"{BASE_URL}/api/esg-assignments/assignments",
            headers=headers,
            params={"reporting_period": REPORTING_PERIOD, "page_size": 100},
            timeout=30,
        )
        assert r.status_code == 200
        items = r.json().get("items", []) or r.json().get("assignments", [])
        water_items = [a for a in items if a.get("category") == CATEGORY and a.get("subcategory")]
        assert water_items
        for a in water_items:
            assert a.get("timezone") == "UTC", (
                f"Subcategory {a.get('subcategory')} timezone not updated: {a.get('timezone')}"
            )
