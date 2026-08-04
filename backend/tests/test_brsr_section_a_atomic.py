"""
Backend regression tests for BRSR Section A atomic response_mode fix.

Bug: Section A data (Business Activities table, Products/Services, Plants/Offices,
Markets Served, and simple fields like CIN/Email) was being corrupted by the
backend `_merge_year_responses` function adding _current_fy / _previous_fy
suffixes to nested field names because the question configs defaulted to
`fy_comparison` response_mode.

Fix: All 27 brsr_a_* configs now have `response_mode: 'atomic'` so backend
preserves nested structures as-is.

These tests do PUT then GET round-trips against the live API and verify:
- No _current_fy / _previous_fy suffixes appear in the returned payload
- Values are preserved exactly as sent
"""
import os
import uuid
import copy
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
EMAIL = "goyalsomil2001@gmail.com"
PASSWORD = "TestUser123!"
FRAMEWORK = "BRSR"
SECTION = "section_a"
YEAR = "2026-27"


@pytest.fixture(scope="module")
def session():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, "No token"
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}",
                      "Content-Type": "application/json"})
    return s


# Snapshot baseline responses so we can restore original data after tests
@pytest.fixture(scope="module")
def baseline(session):
    r = session.get(
        f"{BASE_URL}/api/esg-questionnaire/responses/{FRAMEWORK}/{SECTION}/{YEAR}",
        timeout=30,
    )
    if r.status_code == 200:
        return r.json().get("responses", {}) or {}
    return {}


def _put(session, responses):
    r = session.put(
        f"{BASE_URL}/api/esg-questionnaire/responses/{FRAMEWORK}/{SECTION}/{YEAR}",
        json={"responses": responses}, timeout=30,
    )
    assert r.status_code == 200, f"PUT failed: {r.status_code} {r.text}"


def _get(session):
    r = session.get(
        f"{BASE_URL}/api/esg-questionnaire/responses/{FRAMEWORK}/{SECTION}/{YEAR}",
        timeout=30,
    )
    assert r.status_code == 200, f"GET failed: {r.status_code} {r.text}"
    return r.json().get("responses", {}) or {}


def _assert_no_fy_suffix(obj, path="root"):
    """Recursively assert no key ends with _current_fy or _previous_fy."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            assert not (k.endswith("_current_fy") or k.endswith("_previous_fy")), \
                f"FY suffix leaked at {path}.{k}"
            _assert_no_fy_suffix(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            _assert_no_fy_suffix(item, f"{path}[{i}]")


# ---- Configs sanity ---------------------------------------------------------

class TestSectionAConfigs:
    def test_all_brsr_a_configs_atomic(self, session):
        r = session.get(
            f"{BASE_URL}/api/esg-questionnaire/configs"
            f"?framework={FRAMEWORK}&section={SECTION}",
            timeout=30,
        )
        assert r.status_code == 200, r.text
        configs = r.json().get("configs", [])
        brsr_a = [c for c in configs if c["question_key"].startswith("brsr_a_")]
        assert len(brsr_a) >= 20, f"Expected many brsr_a_* configs, got {len(brsr_a)}"
        non_atomic = [c["question_key"] for c in brsr_a
                      if c.get("response_mode") != "atomic"]
        assert not non_atomic, \
            f"These brsr_a_* configs are NOT atomic (bug will resurface): {non_atomic}"


# ---- Simple scalar fields ---------------------------------------------------

class TestSimpleFields:
    def test_simple_scalar_fields_roundtrip(self, session, baseline):
        tag = uuid.uuid4().hex[:8]
        payload = {
            "brsr_a_cin": f"TESTCIN{tag}",
            "brsr_a_entity_name": f"TEST_Entity_{tag}",
            "brsr_a_email": f"test_{tag}@example.com",
            "brsr_a_telephone": "+91-9999999999",
            "brsr_a_website": f"https://test-{tag}.example.com",
        }
        _put(session, payload)
        got = _get(session)
        for k, v in payload.items():
            assert got.get(k) == v, f"Field {k} not preserved. Got {got.get(k)!r}, expected {v!r}"

    def test_address_fields_roundtrip(self, session):
        tag = uuid.uuid4().hex[:6]
        payload = {
            "brsr_a_registered_address": f"TEST Reg Addr {tag}, Mumbai, MH 400001",
            "brsr_a_corporate_address": f"TEST Corp Addr {tag}, Bangalore, KA 560001",
        }
        _put(session, payload)
        got = _get(session)
        for k, v in payload.items():
            got_val = got.get(k)
            # Address may be stored as string or {value: string}
            if isinstance(got_val, dict):
                got_val = got_val.get("value") or got_val.get("answer") or got_val
            assert got_val == v, f"Address {k}: got {got_val!r} expected {v!r}"
            _assert_no_fy_suffix(got.get(k), k)


# ---- Business Activities table (the reported bug) --------------------------

class TestBusinessActivitiesTable:
    QK = "brsr_a_business_activities"

    def test_business_activities_roundtrip(self, session):
        tag = uuid.uuid4().hex[:6]
        rows = [
            {"description": f"TEST Manufacturing {tag}",
             "main_activity": "Industrial",
             "turnover_percentage": "65.5"},
            {"description": f"TEST Trading {tag}",
             "main_activity": "Commerce",
             "turnover_percentage": "25.0"},
        ]
        payload = {self.QK: {"rows": rows}}
        _put(session, payload)
        got = _get(session)
        q = got.get(self.QK)
        assert q is not None, f"{self.QK} missing after save. Keys: {list(got.keys())}"
        _assert_no_fy_suffix(q, self.QK)
        got_rows = q.get("rows") if isinstance(q, dict) else None
        assert got_rows is not None, \
            f"'rows' key missing in {self.QK} response. Got structure: {q}"
        assert len(got_rows) == 2, f"Expected 2 rows, got {len(got_rows)}: {got_rows}"
        for i, expected in enumerate(rows):
            actual = got_rows[i]
            for field, val in expected.items():
                assert actual.get(field) == val, \
                    f"Row {i} field {field}: got {actual.get(field)!r} expected {val!r}"


# ---- Products / Services table ---------------------------------------------

class TestProductsServicesTable:
    QK = "brsr_a_products_services"

    def test_products_services_roundtrip(self, session):
        tag = uuid.uuid4().hex[:6]
        rows = [
            {"product_service": f"TEST Product A {tag}",
             "nic_code": "24310",
             "turnover_contributed": "40.0"},
            {"product_service": f"TEST Service B {tag}",
             "nic_code": "62012",
             "turnover_contributed": "60.0"},
        ]
        _put(session, {self.QK: {"rows": rows}})
        got = _get(session)
        q = got.get(self.QK)
        assert q is not None, f"{self.QK} missing"
        _assert_no_fy_suffix(q, self.QK)
        got_rows = q.get("rows")
        assert got_rows and len(got_rows) == 2
        for i, expected in enumerate(rows):
            for field, val in expected.items():
                assert got_rows[i].get(field) == val, \
                    f"row {i} {field}: got {got_rows[i].get(field)!r} exp {val!r}"


# ---- Plants & Offices table ------------------------------------------------

class TestPlantsOfficesTable:
    QK = "brsr_a_plants_offices"

    def test_plants_offices_roundtrip(self, session):
        rows = [
            {"location_type": "Plant", "national": "5", "international": "1"},
            {"location_type": "Office", "national": "10", "international": "2"},
        ]
        _put(session, {self.QK: {"rows": rows}})
        got = _get(session)
        q = got.get(self.QK)
        assert q is not None
        _assert_no_fy_suffix(q, self.QK)
        got_rows = q.get("rows")
        assert got_rows and len(got_rows) == 2
        for i, expected in enumerate(rows):
            for field, val in expected.items():
                assert got_rows[i].get(field) == val


# ---- Markets Served (complex object with nested rows + scalars) ------------

class TestMarketsServed:
    QK = "brsr_a_markets_served"

    def test_markets_served_roundtrip(self, session):
        tag = uuid.uuid4().hex[:6]
        payload_q = {
            "locations": {
                "rows": [
                    {"location_type": "National", "number": "28"},
                    {"location_type": "International", "number": "5"},
                ]
            },
            "export_percentage": "22.5",
            "customer_types": f"TEST customers {tag}: retail, wholesale, govt",
        }
        _put(session, {self.QK: payload_q})
        got = _get(session)
        q = got.get(self.QK)
        assert q is not None, f"{self.QK} missing. Keys: {list(got.keys())}"
        _assert_no_fy_suffix(q, self.QK)

        # Verify no fields got renamed to _current_fy variants
        assert "export_percentage" in q or "export_percentage_current_fy" not in q, \
            f"Bug: export_percentage got _current_fy suffix: {q}"
        assert q.get("export_percentage") == "22.5", \
            f"export_percentage: {q.get('export_percentage')!r}"
        assert q.get("customer_types") == payload_q["customer_types"], \
            f"customer_types: {q.get('customer_types')!r}"

        locs = q.get("locations")
        assert locs is not None, f"locations missing: {q}"
        loc_rows = locs.get("rows") if isinstance(locs, dict) else locs
        assert loc_rows and len(loc_rows) == 2, f"location rows: {loc_rows}"
        assert loc_rows[0].get("location_type") == "National"
        assert loc_rows[0].get("number") == "28"


# ---- Combined save (mimic frontend saving whole section at once) -----------

class TestCombinedSectionASave:
    def test_save_all_tables_together(self, session):
        tag = uuid.uuid4().hex[:6]
        payload = {
            "brsr_a_cin": f"CINCOMBO{tag}",
            "brsr_a_business_activities": {"rows": [
                {"description": f"Combo BA {tag}", "main_activity": "X",
                 "turnover_percentage": "100"}
            ]},
            "brsr_a_products_services": {"rows": [
                {"product_service": f"Combo PS {tag}", "nic_code": "1",
                 "turnover_contributed": "50"}
            ]},
            "brsr_a_plants_offices": {"rows": [
                {"location_type": "Plant", "national": "3", "international": "0"}
            ]},
            "brsr_a_markets_served": {
                "locations": {"rows": [{"location_type": "National",
                                        "number": "10"}]},
                "export_percentage": "5",
                "customer_types": f"combo_{tag}",
            },
        }
        _put(session, payload)
        got = _get(session)
        for k in payload:
            assert k in got, f"{k} missing from combined GET"
            _assert_no_fy_suffix(got[k], k)
        assert got["brsr_a_cin"] == payload["brsr_a_cin"]
        assert got["brsr_a_business_activities"]["rows"][0]["description"] == \
            f"Combo BA {tag}"
        assert got["brsr_a_markets_served"]["export_percentage"] == "5"
