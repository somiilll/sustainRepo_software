"""
Iteration-64 backend tests for:
1. /api/calc-engine/units returns BOTH simple (kg, L, kWh, ...) and compound (kgCO2/kg, MJ/kg, ...) units
2. /api/units module accepts custom unit_type (e.g., 'currency') and returns it on subsequent GET
3. /api/super-admin/calc-engine/property-source-mappings supports `conditions[]`, `sort_by`, `sort_order`,
   `fallback_behavior` and validates operator vocabulary.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
SUPER_ADMIN = {"email": "superadmin@ecotrack.com", "password": "SuperAdmin123!"}


@pytest.fixture(scope="module")
def super_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login", json=SUPER_ADMIN, timeout=30
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def hdr(super_token):
    return {"Authorization": f"Bearer {super_token}", "Content-Type": "application/json"}


# ------------------------------- Feature 1 -------------------------------
class TestCalcEngineUnitsCombined:
    """Scope3EF unit dropdown source: /api/calc-engine/units must return simple AND compound."""

    def test_returns_simple_and_compound(self, hdr):
        r = requests.get(f"{BASE_URL}/api/calc-engine/units", headers=hdr, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, dict), "Expected dict with 'simple' and 'compound'"
        assert "simple" in data and "compound" in data
        assert isinstance(data["simple"], list)
        assert isinstance(data["compound"], list)
        # Reasonable sanity: at least 1 simple unit available
        assert len(data["simple"]) >= 1, "No simple units seeded in calc engine"
        # Compound list may be empty but field must exist; if seeded, basic shape check
        for c in data["compound"][:3]:
            assert "key" in c


# ------------------------------- Feature 2 -------------------------------
class TestUnitsModuleCustomType:
    """/api/units allows storing arbitrary unit_type strings so frontend custom types persist."""

    created_id = None
    test_symbol = f"TEST_CUR_{uuid.uuid4().hex[:6]}"
    test_type = f"TEST_currency_{uuid.uuid4().hex[:4]}"

    def test_create_unit_with_custom_type(self, hdr):
        payload = {
            "name": "Test Currency Unit",
            "symbol": self.__class__.test_symbol,
            "unit_type": self.__class__.test_type,
            "aliases": ["test_cur"],
            "is_base_unit": True,
            "description": "TEST_ unit for iter-64 custom type test",
            "is_active": True,
        }
        r = requests.post(f"{BASE_URL}/api/units", headers=hdr, json=payload, timeout=30)
        assert r.status_code == 200, f"Create failed: {r.status_code} {r.text}"
        body = r.json()
        assert body["symbol"] == self.__class__.test_symbol
        assert body["unit_type"] == self.__class__.test_type
        assert "id" in body
        self.__class__.created_id = body["id"]

    def test_custom_type_appears_in_list(self, hdr):
        r = requests.get(f"{BASE_URL}/api/units", headers=hdr, timeout=30)
        assert r.status_code == 200
        all_units = r.json()
        types = {u.get("unit_type") for u in all_units}
        assert self.__class__.test_type in types, (
            f"Custom unit_type '{self.__class__.test_type}' not returned by GET /api/units"
        )

    def test_get_units_by_custom_type(self, hdr):
        r = requests.get(
            f"{BASE_URL}/api/units/by-type/{self.__class__.test_type}",
            headers=hdr,
            timeout=30,
        )
        assert r.status_code == 200
        items = r.json()
        symbols = [u["symbol"] for u in items]
        assert self.__class__.test_symbol in symbols

    def test_cleanup_custom_unit(self, hdr):
        if not self.__class__.created_id:
            pytest.skip("No id captured")
        r = requests.delete(
            f"{BASE_URL}/api/units/{self.__class__.created_id}", headers=hdr, timeout=30
        )
        assert r.status_code == 200


# ------------------------------- Feature 3 -------------------------------
class TestPropertySourceMappingConditions:
    """SuperAdmin mapping endpoint accepts conditions[], sort_by, sort_order, fallback_behavior."""

    created_id = None
    property_key = f"TEST_iter64_prop_{uuid.uuid4().hex[:6]}"

    def test_create_mapping_with_conditions(self, hdr):
        payload = {
            "property_key": self.__class__.property_key,
            "description": "TEST_ iter-64 property source mapping with conditions",
            "source_table": "scope3_ef",
            "source_field": "emission_factor",
            "source_unit_field": "emission_factor_unit",
            "lookup_context_key": "activity_code",
            "lookup_table_field": "activity_code",
            "conditions": [
                {"field": "region", "operator": "equals", "value": "IN"},
                {"field": "year_applicable", "operator": "greater_than_or_equals", "value": 2020},
                {"field": "category", "operator": "in", "value": ["transport", "energy"]},
                {"field": "deprecated", "operator": "not_equals", "value": True},
            ],
            "sort_by": "year_applicable",
            "sort_order": "desc",
            "fallback_behavior": "use_default",
            "default_value": 0.0,
            "default_unit": "kgCO2/kg",
        }
        r = requests.post(
            f"{BASE_URL}/api/super-admin/calc-engine/property-source-mappings",
            headers=hdr,
            json=payload,
            timeout=30,
        )
        assert r.status_code == 200, f"Create mapping failed: {r.status_code} {r.text}"
        body = r.json()
        assert body["property_key"] == self.__class__.property_key
        assert body["sort_by"] == "year_applicable"
        assert body["sort_order"] == "desc"
        assert body["fallback_behavior"] == "use_default"
        assert isinstance(body["conditions"], list)
        assert len(body["conditions"]) == 4
        # spot check first condition
        c0 = body["conditions"][0]
        assert c0["field"] == "region"
        assert c0["operator"] == "equals"
        assert c0["value"] == "IN"
        self.__class__.created_id = body["id"]

    def test_conditions_persist_in_list(self, hdr):
        r = requests.get(
            f"{BASE_URL}/api/calc-engine/property-source-mappings",
            headers=hdr,
            timeout=30,
        )
        assert r.status_code == 200
        items = r.json()
        match = next((x for x in items if x.get("property_key") == self.__class__.property_key), None)
        assert match is not None, "Mapping not returned in list"
        assert len(match.get("conditions", [])) == 4
        assert match.get("sort_by") == "year_applicable"

    def test_invalid_operator_rejected(self, hdr):
        payload = {
            "property_key": f"TEST_invalid_op_{uuid.uuid4().hex[:6]}",
            "source_table": "scope3_ef",
            "source_field": "emission_factor",
            "conditions": [{"field": "region", "operator": "regex_match", "value": "IN"}],
        }
        r = requests.post(
            f"{BASE_URL}/api/super-admin/calc-engine/property-source-mappings",
            headers=hdr,
            json=payload,
            timeout=30,
        )
        assert r.status_code == 400, f"Expected 400 for invalid operator, got {r.status_code}: {r.text}"
        assert "operator" in r.text.lower()

    def test_missing_field_rejected(self, hdr):
        payload = {
            "property_key": f"TEST_missing_field_{uuid.uuid4().hex[:6]}",
            "source_table": "scope3_ef",
            "source_field": "emission_factor",
            "conditions": [{"operator": "equals", "value": "IN"}],
        }
        r = requests.post(
            f"{BASE_URL}/api/super-admin/calc-engine/property-source-mappings",
            headers=hdr,
            json=payload,
            timeout=30,
        )
        assert r.status_code == 400
        assert "field" in r.text.lower()

    def test_update_mapping_conditions(self, hdr):
        if not self.__class__.created_id:
            pytest.skip("create test failed")
        update = {
            "conditions": [
                {"field": "region", "operator": "equals", "value": "EU"},
            ],
            "sort_order": "asc",
        }
        r = requests.put(
            f"{BASE_URL}/api/super-admin/calc-engine/property-source-mappings/{self.__class__.created_id}",
            headers=hdr,
            json=update,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert len(body["conditions"]) == 1
        assert body["conditions"][0]["value"] == "EU"
        assert body["sort_order"] == "asc"

    def test_cleanup_mapping(self, hdr):
        if not self.__class__.created_id:
            pytest.skip("no id")
        r = requests.delete(
            f"{BASE_URL}/api/super-admin/calc-engine/property-source-mappings/{self.__class__.created_id}",
            headers=hdr,
            timeout=30,
        )
        assert r.status_code == 200
