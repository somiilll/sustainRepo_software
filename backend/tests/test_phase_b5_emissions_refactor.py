"""
Phase B5 regression tests for backend emissions/C7 router extraction.

Verifies that after moving POST/PUT /emissions and the 7 C7 routes into
/app/backend/modules/emissions/*, the API behavior remains byte-identical:
- Regression smokes (health/contracts, /emissions, /dashboard/stats)
- Create-Update-Delete on emissions with history + audit verification
- C7 GET endpoints not broken
"""

import os
import requests
import pytest

def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if url:
        return url.rstrip("/")
    # fall back to frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "goyalsomil@hotmail.com"
ADMIN_PASS = "Test123!"


# ---------- fixtures ----------

@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"no token in response: {data}"
    return token


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def facility_a_id(admin_headers):
    r = requests.get(f"{API}/facilities", headers=admin_headers, timeout=30)
    assert r.status_code == 200
    facilities = r.json()
    for f in facilities:
        if f.get("name", "").strip().lower().startswith("facility a"):
            return f["id"]
    # fallback to first
    assert facilities, "no facilities for admin"
    return facilities[0]["id"]


# ---------- Regression smokes ----------

class TestRegressionSmoke:
    def test_health_contracts(self, admin_headers):
        r = requests.get(f"{API}/health/contracts", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("status") == "passed", f"contracts not passed: {body}"
        assert body.get("modules_checked") == 20, f"expected 20 modules, got {body.get('modules_checked')}"
        assert body.get("failed") == [], f"failed modules: {body.get('failed')}"

    def test_emissions_list_baseline(self, admin_headers):
        r = requests.get(f"{API}/emissions", headers=admin_headers, timeout=60)
        assert r.status_code == 200, r.text
        recs = r.json()
        assert isinstance(recs, list)
        assert len(recs) == 40, f"expected 40 baseline records, got {len(recs)}"
        first = recs[0]
        for k in ("id", "scope", "category", "total_emissions"):
            assert k in first, f"missing key {k} in first record: {list(first.keys())}"

    def test_dashboard_stats_baseline(self, admin_headers):
        r = requests.get(f"{API}/dashboard/stats", headers=admin_headers, timeout=60)
        assert r.status_code == 200, r.text
        s = r.json()
        # use approximate compare on floats
        assert abs(s.get("total_emissions", 0) - 4194.63) < 0.05, f"total_emissions={s.get('total_emissions')}"
        assert abs(s.get("scope1_emissions", 0) - 251.86) < 0.05, f"scope1_emissions={s.get('scope1_emissions')}"
        scope3_by_cat = s.get("scope3_by_category") or s.get("scope3_by_categories") or []
        assert len(scope3_by_cat) == 7, f"expected 7 scope3 categories, got {len(scope3_by_cat)}: {scope3_by_cat}"


# ---------- Write flow: CREATE -> history -> UPDATE -> history -> DELETE ----------

class TestEmissionCRUDFlow:
    """End-to-end CRUD with history + audit verification on a Scope 1 Diesel record."""

    created_id = None

    def _payload(self, facility_id, quantity=1000.0):
        return {
            "facility_id": facility_id,
            "reporting_period": "2025-03",
            "frequency_type": "monthly",
            "scope": "scope1",
            "category": "Stationary Combustion",
            "sub_category": "Diesel",
            "fuel_type": "Diesel",
            "dynamic_field_values": {
                "quantity": {"value": quantity, "unit": "litre"}
            },
            "outputs": {
                "co2": {"value": 2.65, "unit": "tCO2"},
                "ch4": {"value": 0.0001, "unit": "tCH4"},
                "n2o": {"value": 0.00005, "unit": "tN2O"},
                "co2e": {"value": 2.68, "unit": "tCO2e"},
            },
            "source_of_information": "TEST_B5_refactor_smoke",
            "process_names": ["TEST_B5_Process_1"],
            "process_descriptions": [{"name": "TEST_B5_Process_1", "description": "phase B5 refactor smoke"}],
            "notes": "TEST_B5_refactor",
        }

    def test_01_create_emission(self, admin_headers, facility_a_id):
        body = self._payload(facility_a_id, 1000.0)
        r = requests.post(f"{API}/emissions", headers=admin_headers, json=body, timeout=60)
        assert r.status_code == 200, f"create failed {r.status_code}: {r.text}"
        rec = r.json()
        assert rec.get("id"), "missing id in response"
        assert rec["scope"] == "scope1"
        assert rec["category"] == "Stationary Combustion"
        # emission fields populated from outputs
        assert rec.get("co2_emissions") == 2.65, f"co2={rec.get('co2_emissions')}"
        assert rec.get("co2e_emissions") == 2.68
        assert abs(rec.get("total_emissions", 0) - 2.68) < 1e-6
        # dynamic_field_values preserved
        assert rec.get("dynamic_field_values", {}).get("quantity", {}).get("value") == 1000.0
        # process & source persisted
        assert rec.get("source_of_information") == "TEST_B5_refactor_smoke"
        assert "TEST_B5_Process_1" in (rec.get("process_names") or [])
        TestEmissionCRUDFlow.created_id = rec["id"]

    def test_02_list_includes_new_record(self, admin_headers):
        assert TestEmissionCRUDFlow.created_id, "create step did not run"
        r = requests.get(f"{API}/emissions", headers=admin_headers, timeout=60)
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert TestEmissionCRUDFlow.created_id in ids, "new record not visible in /emissions"
        assert len(ids) == 41, f"expected 41 after insert, got {len(ids)}"

    def test_03_history_after_create(self, admin_headers):
        rid = TestEmissionCRUDFlow.created_id
        assert rid
        r = requests.get(f"{API}/emissions/{rid}/history", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        hist = r.json()
        assert len(hist) == 1, f"expected 1 history entry, got {len(hist)}"
        entry = hist[0]
        assert entry["changes"]["action"] == "created"
        assert entry["changes"]["old_values"] is None
        assert entry["changes"]["new_values"]["co2e_emissions"] == 2.68

    def test_04_update_emission(self, admin_headers, facility_a_id):
        rid = TestEmissionCRUDFlow.created_id
        assert rid
        body = self._payload(facility_a_id, 1100.0)
        # bump outputs slightly to simulate recalc
        body["outputs"]["co2"]["value"] = 2.915
        body["outputs"]["co2e"]["value"] = 2.948
        r = requests.put(f"{API}/emissions/{rid}", headers=admin_headers, json=body, timeout=60)
        assert r.status_code == 200, f"update failed: {r.status_code} {r.text}"
        rec = r.json()
        assert rec["id"] == rid
        assert rec.get("co2e_emissions") == 2.948
        assert rec.get("dynamic_field_values", {}).get("quantity", {}).get("value") == 1100.0
        assert rec.get("updated_at") is not None
        assert rec.get("updated_by") is not None

    def test_05_history_after_update(self, admin_headers):
        rid = TestEmissionCRUDFlow.created_id
        r = requests.get(f"{API}/emissions/{rid}/history", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        hist = r.json()
        assert len(hist) == 2, f"expected 2 history entries after update, got {len(hist)}"
        # newest first per sort -1
        latest = hist[0]
        assert latest["changes"]["action"] == "updated"
        assert latest.get("field_changes") is not None, "field_changes missing on update history"
        assert isinstance(latest["field_changes"], list)
        assert len(latest["field_changes"]) > 0, "expected at least one field change"
        assert latest.get("changes_summary"), "changes_summary missing"
        assert "field(s) changed" in latest["changes_summary"]

    def test_06_audit_log_created(self, admin_headers):
        """AUDIT REGRESSION: confirm an audit row exists for the create action."""
        rid = TestEmissionCRUDFlow.created_id
        r = requests.get(f"{API}/audit-logs?module=ghg_emission&action=create&limit=20", headers=admin_headers, timeout=20)
        assert r.status_code == 200, f"audit-logs endpoint failed: {r.status_code} {r.text}"
        data = r.json()
        items = data if isinstance(data, list) else (data.get("logs") or data.get("items") or [])
        assert items, f"no audit-log entries for create action: {data}"
        # Find the entry whose resource.id == our rid
        match = None
        for x in items:
            res = x.get("resource") or {}
            if res.get("id") == rid:
                match = x
                break
        assert match, f"no CREATE audit entry for resource_id={rid}; first ids={[((x.get('resource') or {}).get('id')) for x in items[:5]]}"
        assert (match.get("action") or "").lower() == "create"
        assert (match.get("module") or "").lower() in ("emission", "emissions", "ghg_emission"), f"module={match.get('module')}"
        assert match.get("user", {}).get("id"), "user.id missing on audit log"
        assert match.get("organization_id"), "organization_id missing on audit log"

    def test_07_delete_emission(self, admin_headers):
        rid = TestEmissionCRUDFlow.created_id
        assert rid
        r = requests.delete(f"{API}/emissions/{rid}", headers=admin_headers, timeout=30)
        assert r.status_code == 200, f"delete failed: {r.status_code} {r.text}"
        body = r.json()
        assert "delete" in (body.get("message", "")).lower()

    def test_08_list_back_to_baseline(self, admin_headers):
        r = requests.get(f"{API}/emissions", headers=admin_headers, timeout=60)
        assert r.status_code == 200
        recs = r.json()
        assert len(recs) == 40, f"expected 40 after delete, got {len(recs)}"
        assert TestEmissionCRUDFlow.created_id not in [x["id"] for x in recs]


# ---------- C7 GET smokes ----------

class TestC7Endpoints:
    def test_c7_yearly_summary_by_year(self, admin_headers, facility_a_id):
        # Pick a recent year; route must not 500 even with no records.
        for year in (2025, 2024):
            r = requests.get(f"{API}/emissions/c7/{facility_a_id}/{year}", headers=admin_headers, timeout=30)
            assert r.status_code in (200,), f"c7 yearly summary failed for {year}: {r.status_code} {r.text}"
            body = r.json()
            assert isinstance(body, dict), f"expected dict, got {type(body)}"

    def test_c7_yearly_endpoint(self, admin_headers, facility_a_id):
        for rp in ("FY 2025-2026", "CY2025", "2025"):
            r = requests.get(f"{API}/emissions/c7/yearly/{facility_a_id}/{rp}", headers=admin_headers, timeout=30)
            assert r.status_code in (200, 404), f"c7 yearly {rp}: {r.status_code} {r.text}"
            if r.status_code == 200:
                assert isinstance(r.json(), dict)
                return
        # if all 404, fine as long as not 500
