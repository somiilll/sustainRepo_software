"""
Backend tests for:
- C7 Monthly Entry endpoints (Fix #10): POST /api/emissions/c7/month,
  GET /api/emissions/c7/{facility_id}/{year}, GET /api/emissions/c7/{facility_id}/{year}/{month}
- Version History field-level tracking (Fix #3): GET /api/emissions/{record_id}/history
  must return field_changes array.

Run:
  pytest /app/backend/tests/test_c7_monthly_and_history.py -v \
    --junitxml=/app/test_reports/pytest/pytest_c7_monthly_history.xml
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://determined-leavitt-6.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "goyalsomil@hotmail.com"
ADMIN_PASSWORD = "Test123!"

# Use a unique reporting year per run to avoid colliding with existing fixtures
TEST_YEAR = 2098
TEST_MONTH = "jan"


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Login failed ({r.status_code}): {r.text[:200]}")
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def facility_id(headers):
    r = requests.get(f"{BASE_URL}/api/facilities", headers=headers, timeout=15)
    assert r.status_code == 200, f"facilities fetch failed: {r.text[:200]}"
    data = r.json()
    assert isinstance(data, list) and len(data) > 0, "no facilities for admin"
    return data[0]["id"]


@pytest.fixture(scope="module")
def created_entry(headers, facility_id):
    """Create one C7 monthly entry to be reused for downstream GETs / updates."""
    payload = {
        "facility_id": facility_id,
        "reporting_year": TEST_YEAR,
        "reporting_month": TEST_MONTH,
        "calculation_method": "activity_basis",
        "activity_type": "car_travel",
        "activity_id": None,
        "activity_name": "TEST_C7_car_travel",
        "employees": [
            {
                "id": str(uuid.uuid4()),
                "name": "TEST_Employee_1",
                "employee_id": "E001",
                "department": "Engineering",
                "activity_type": "car_travel",
                "inputs": {"distance_km": 100, "working_days": 20},
                "emissions": {"co2e": 12.5},
            },
            {
                "id": str(uuid.uuid4()),
                "name": "TEST_Employee_2",
                "employee_id": "E002",
                "department": "Sales",
                "activity_type": "car_travel",
                "inputs": {"distance_km": 50, "working_days": 22},
                "emissions": {"co2e": 7.25},
            },
        ],
        "notes": "TEST_initial_create",
        "responsible_person": "TEST_Person",
        "responsible_person_designation": "Manager",
        "responsible_person_contact": "test@example.com",
    }
    r = requests.post(f"{BASE_URL}/api/emissions/c7/month",
                      headers=headers, json=payload, timeout=20)
    assert r.status_code == 200, f"create failed: {r.status_code} {r.text[:300]}"
    body = r.json()
    return body


# ---------- C7 Monthly Endpoint tests (Fix #10) ----------

class TestC7MonthlyEndpoints:

    def test_create_c7_monthly_entry(self, created_entry, facility_id):
        """POST /api/emissions/c7/month must create an entry and aggregate monthly_total."""
        e = created_entry
        assert "id" in e and isinstance(e["id"], str) and len(e["id"]) > 0
        assert e["facility_id"] == facility_id
        assert e["reporting_year"] == TEST_YEAR
        assert e["reporting_month"] == TEST_MONTH
        assert e["calculation_method"] == "activity_basis"
        assert e["activity_type"] == "car_travel"
        # monthly_total aggregated from employees (12.5 + 7.25 = 19.75)
        mt = e.get("monthly_total") or {}
        assert abs(float(mt.get("co2e", 0)) - 19.75) < 1e-6, f"monthly_total.co2e wrong: {mt}"
        assert mt.get("employee_count") == 2
        # employees preserved
        assert isinstance(e.get("employees"), list) and len(e["employees"]) == 2
        # version starts at 1
        assert e.get("version") == 1
        # reporting_period derived correctly
        assert e.get("reporting_period") == f"{TEST_YEAR}-01"

    def test_get_yearly_summary(self, headers, facility_id, created_entry):
        """GET /api/emissions/c7/{facility_id}/{year} returns entries + yearly_total."""
        r = requests.get(
            f"{BASE_URL}/api/emissions/c7/{facility_id}/{TEST_YEAR}",
            headers=headers, timeout=15,
        )
        assert r.status_code == 200, f"yearly summary failed: {r.text[:300]}"
        data = r.json()
        assert data["facility_id"] == facility_id
        assert data["reporting_year"] == TEST_YEAR
        assert "entries" in data and isinstance(data["entries"], list)
        # Our created entry must be in the list
        ids = [x.get("id") for x in data["entries"]]
        assert created_entry["id"] in ids, f"created entry missing from yearly entries"
        # monthly_totals dict + yearly_total numeric
        assert TEST_MONTH in data.get("monthly_totals", {}), \
            f"month {TEST_MONTH} missing in monthly_totals"
        yt = data.get("yearly_total") or {}
        assert float(yt.get("co2e", 0)) >= 19.75 - 1e-6
        assert "has_old_model_data" in data and "old_entries_count" in data

    def test_get_specific_month_entry(self, headers, facility_id, created_entry):
        """GET /api/emissions/c7/{facility_id}/{year}/{month} returns the month entry."""
        r = requests.get(
            f"{BASE_URL}/api/emissions/c7/{facility_id}/{TEST_YEAR}/{TEST_MONTH}",
            headers=headers, timeout=15,
        )
        assert r.status_code == 200, f"month fetch failed: {r.text[:300]}"
        data = r.json()
        assert data["id"] == created_entry["id"]
        assert data["reporting_month"] == TEST_MONTH
        assert data["reporting_year"] == TEST_YEAR
        # employees persisted
        assert len(data.get("employees", [])) == 2

    def test_get_specific_month_404(self, headers, facility_id):
        """GET on a non-existent month must return 404."""
        r = requests.get(
            f"{BASE_URL}/api/emissions/c7/{facility_id}/{TEST_YEAR}/dec",
            headers=headers, timeout=15,
        )
        assert r.status_code == 404, f"expected 404 for missing month, got {r.status_code}"

    def test_unauthorized_facility_403(self, headers):
        """Random facility id should return 404 (not found)."""
        r = requests.get(
            f"{BASE_URL}/api/emissions/c7/{uuid.uuid4()}/{TEST_YEAR}",
            headers=headers, timeout=15,
        )
        assert r.status_code in (403, 404), \
            f"expected 403/404 for unknown facility, got {r.status_code}"


# ---------- Version History field_changes (Fix #3) ----------

class TestC7VersionHistory:

    def test_update_creates_field_changes(self, headers, facility_id, created_entry):
        """A second POST for the same facility/year/month must update and produce field_changes."""
        # Modify employees + notes + activity_type to trigger field_changes
        new_payload = {
            "facility_id": facility_id,
            "reporting_year": TEST_YEAR,
            "reporting_month": TEST_MONTH,
            "calculation_method": "activity_basis",
            "activity_type": "bus_travel",  # changed
            "activity_id": None,
            "activity_name": "TEST_C7_bus_travel",
            "employees": [
                {
                    "id": str(uuid.uuid4()),
                    "name": "TEST_Employee_1",
                    "employee_id": "E001",
                    "department": "Engineering",
                    "activity_type": "bus_travel",
                    "inputs": {"distance_km": 200, "working_days": 22},
                    "emissions": {"co2e": 30.0},
                },
            ],
            "notes": "TEST_updated_notes",
            "responsible_person": "TEST_Person",
        }
        r = requests.post(f"{BASE_URL}/api/emissions/c7/month",
                          headers=headers, json=new_payload, timeout=20)
        assert r.status_code == 200, f"update failed: {r.text[:300]}"
        updated = r.json()
        # version must be bumped
        assert updated.get("version", 0) >= 2, f"version not bumped: {updated.get('version')}"
        # monthly_total recalculated
        assert abs(float(updated["monthly_total"]["co2e"]) - 30.0) < 1e-6
        assert updated["monthly_total"]["employee_count"] == 1

    def test_history_endpoint_returns_field_changes(self, headers, created_entry):
        """GET /api/emissions/{record_id}/history must return field_changes array on update entry."""
        rec_id = created_entry["id"]
        r = requests.get(f"{BASE_URL}/api/emissions/{rec_id}/history",
                         headers=headers, timeout=15)
        assert r.status_code == 200, f"history fetch failed: {r.text[:300]}"
        history = r.json()
        assert isinstance(history, list), "history should be a list"
        assert len(history) >= 1, "expected >=1 history entry after update"

        # At least one entry must contain field_changes (the update we just performed)
        with_field_changes = [h for h in history if h.get("field_changes")]
        assert len(with_field_changes) >= 1, \
            f"no history entry contains field_changes: {history}"

        fc_entry = with_field_changes[-1]
        # field_changes must be a list of {field, old_value, new_value}
        fcs = fc_entry["field_changes"]
        assert isinstance(fcs, list) and len(fcs) > 0
        sample = fcs[0]
        assert "field" in sample
        assert "old_value" in sample or "new_value" in sample
        # changes_summary should reference the count
        assert "changes_summary" in fc_entry

        # The activity_type change should appear in field_changes somewhere
        fields_changed = [c.get("field") for c in fcs]
        assert any(f in fields_changed for f in
                   ["activity_type", "employees", "notes", "calculation_method", "monthly_total"]), \
            f"expected at least one tracked field, got: {fields_changed}"

        # changed_by_email populated by the endpoint
        assert fc_entry.get("changed_by_email"), "changed_by_email should be populated"


# ---------- Cleanup ----------

@pytest.fixture(scope="module", autouse=True)
def _cleanup(headers, facility_id):
    """Delete the test entry after the module finishes."""
    yield
    try:
        # find via yearly summary, delete each TEST_ entry
        r = requests.get(
            f"{BASE_URL}/api/emissions/c7/{facility_id}/{TEST_YEAR}",
            headers=headers, timeout=15,
        )
        if r.status_code == 200:
            for e in r.json().get("entries", []):
                if str(e.get("notes", "")).startswith("TEST_") or \
                   str(e.get("scope3_activity", "")).startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/emissions/c7/{e['id']}",
                                    headers=headers, timeout=15)
    except Exception:
        pass
