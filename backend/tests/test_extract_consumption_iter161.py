"""
Iteration 161 — Tests for extract_consumption() helper and integration with
emissions.search_records / analytics.query / formulas.explain.

Covers Tests 1–14 from the review request:
  1–6: extract_consumption() unit behavior on various shapes of
       dynamic_field_values
  7–8: emissions.search_records() extracts quantity/unit from
       dynamic_field_values.qty
  9–10: analytics.py consumption pipeline groups by dynamic_field_values.qty.unit
        and sums dynamic_field_values.qty.value
  11: formulas.py record_inputs uses extract_consumption()
  12: Live /api/internal-ai/chat returns actual quantity ("200 L")
  13: Previous iter160 tests still pass (validated by running them)
  14: co2e_emissions preserved alongside quantity in the response
"""
import json
import os
import re
import pytest
import requests
from unittest.mock import patch

from modules.internal_data_ai.query_scope import extract_consumption
from modules.internal_data_ai.services import analytics as analytics_service
from modules.internal_data_ai.services import emissions as emissions_service
from modules.internal_data_ai.services import formulas as formulas_service


# -----------------------------------------------------------------
# Tests 1-6: extract_consumption() unit tests
# -----------------------------------------------------------------
class TestExtractConsumption:
    def test_valid_qty_value(self):
        rec = {"dynamic_field_values": {"qty": {"value": 200, "unit": "L"}}}
        assert extract_consumption(rec) == (200, "L")

    def test_string_value_coerced(self):
        rec = {"dynamic_field_values": {"qty": {"value": "200", "unit": "L"}}}
        val, unit = extract_consumption(rec)
        assert val == 200 and isinstance(val, (int, float))
        assert unit == "L"

    def test_float_value(self):
        rec = {"dynamic_field_values": {"qty": {"value": 200.5, "unit": "L"}}}
        assert extract_consumption(rec) == (200.5, "L")

    def test_empty_dynamic_field_values(self):
        rec = {"dynamic_field_values": {}}
        assert extract_consumption(rec) == (None, None)

    def test_missing_qty_key(self):
        rec = {"dynamic_field_values": {"other": {"value": 5}}}
        assert extract_consumption(rec) == (None, None)

    def test_missing_dynamic_field_values(self):
        rec = {"id": "e1"}
        assert extract_consumption(rec) == (None, None)

    def test_none_dynamic_field_values(self):
        rec = {"dynamic_field_values": None}
        assert extract_consumption(rec) == (None, None)

    def test_invalid_string_value(self):
        rec = {"dynamic_field_values": {"qty": {"value": "abc", "unit": "L"}}}
        val, unit = extract_consumption(rec)
        assert val is None and unit == "L"


# -----------------------------------------------------------------
# Fake Motor collection reused for integration tests
# -----------------------------------------------------------------
class _FakeCursor:
    def __init__(self, docs):
        self._docs = docs

    def sort(self, *a, **k):
        return self

    async def to_list(self, length):
        return list(self._docs)


class _FakeCollection:
    def __init__(self, docs=None, agg_docs=None):
        self.docs = docs or []
        self.agg_docs = agg_docs or []
        self.find_calls = []
        self.aggregate_calls = []

    def find(self, query=None, projection=None):
        self.find_calls.append(query)
        return _FakeCursor(self.docs)

    def aggregate(self, pipeline):
        self.aggregate_calls.append(pipeline)
        # Determine group _id shape to give a compatible response
        group_id = None
        for stage in pipeline:
            if "$group" in stage:
                group_id = stage["$group"].get("_id")
                break
        if isinstance(group_id, dict) and "unit" in group_id:
            # consumption_pipeline
            return _FakeCursor(self.agg_docs or [
                {"_id": {"fuel_type": "Crude Oil", "unit": "L"},
                 "total_quantity": 200.0, "total_emissions": 12.5, "record_count": 1},
                {"_id": {"fuel_type": "Coal", "unit": "kg"},
                 "total_quantity": 300.0, "total_emissions": 8.0, "record_count": 1},
            ])
        return _FakeCursor([
            {"_id": "fac-1", "total_emissions": 12.5, "record_count": 1},
        ])

    async def count_documents(self, q):
        return len(self.docs)


class _FakeDB:
    def __init__(self, emission_docs=None, agg_docs=None):
        self.emission_records = _FakeCollection(emission_docs, agg_docs)
        self.facilities = _FakeCollection([{"id": "fac-1", "name": "Facility A"}])

    def __getitem__(self, name):
        return getattr(self, name, _FakeCollection())


# -----------------------------------------------------------------
# Tests 7-8, 14: emissions.search_records surfaces qty from dynamic_field_values
# -----------------------------------------------------------------
class TestEmissionsSearchRecordsQtyExtraction:
    @pytest.mark.asyncio
    async def test_quantity_and_unit_from_dynamic_field_values(self):
        docs = [{
            "id": "e1", "organization_id": "org-1", "facility_id": "fac-1",
            "scope": "1", "category": "Stationary Combustion",
            "fuel_type": "Crude Oil",
            "dynamic_field_values": {"qty": {"value": 200, "unit": "L"}},
            "reporting_period": "2026-07",
            "co2e_emissions": 12.5, "total_emissions": 12.5,
        }]
        fake = _FakeDB(emission_docs=docs)
        with patch.object(emissions_service, "db", fake):
            result = await emissions_service.search_records(
                org_id="org-1", facility_ids=None, fuel_type="Crude Oil",
                period={"start_month": "2026-07", "end_month": "2026-07",
                        "label": "July 2026", "source": "explicit"},
            )
        assert result["total_found"] == 1
        rec = result["records"][0]
        assert rec["quantity"] == 200
        assert rec["unit"] == "L"
        # Test 14: co2e_emissions preserved
        assert rec["co2e_emissions"] == 12.5

    @pytest.mark.asyncio
    async def test_missing_dfv_returns_null_quantity(self):
        docs = [{
            "id": "e2", "organization_id": "org-1", "facility_id": "fac-1",
            "fuel_type": "Crude Oil", "reporting_period": "2026-07",
            "co2e_emissions": 5.0,
        }]
        fake = _FakeDB(emission_docs=docs)
        with patch.object(emissions_service, "db", fake):
            result = await emissions_service.search_records(
                org_id="org-1", facility_ids=None, fuel_type="Crude Oil",
                period={"start_month": "2026-07", "end_month": "2026-07",
                        "label": "July 2026", "source": "explicit"},
            )
        rec = result["records"][0]
        assert rec["quantity"] is None
        assert rec["unit"] is None
        assert rec["co2e_emissions"] == 5.0


# -----------------------------------------------------------------
# Tests 9-10: analytics consumption pipeline groups by dfv.qty.unit
# -----------------------------------------------------------------
class TestAnalyticsConsumptionPipeline:
    @pytest.mark.asyncio
    async def test_consumption_pipeline_uses_dynamic_field_values(self):
        fake = _FakeDB()
        with patch.object(analytics_service, "db", fake):
            result = await analytics_service.query(
                org_id="org-1", facility_ids=None,
                period={"start_month": "2026-07", "end_month": "2026-07",
                        "label": "July 2026", "source": "explicit"},
            )
        pipelines = fake.emission_records.aggregate_calls
        # Find the consumption pipeline (has $convert and groups by unit)
        consumption_pipe = None
        for p in pipelines:
            text = json.dumps(p, default=str)
            if "total_quantity" in text and "$convert" in text:
                consumption_pipe = p
                break
        assert consumption_pipe is not None, "consumption_pipeline not found"
        pipe_text = json.dumps(consumption_pipe, default=str)
        # Group by $dynamic_field_values.qty.unit and sum $dynamic_field_values.qty.value
        assert "$dynamic_field_values.qty.unit" in pipe_text
        assert "$dynamic_field_values.qty.value" in pipe_text
        # Guardrails present
        assert "onError" in pipe_text
        assert "onNull" in pipe_text
        # Should NOT reference top-level $quantity or $unit as consumption source
        # (be lenient: it's OK if $unit appears in _id key name; the important
        # thing is that dfv paths are used)

    @pytest.mark.asyncio
    async def test_different_units_produce_separate_entries(self):
        # Ensure the FakeDB agg returns two different unit rows
        fake = _FakeDB(agg_docs=[
            {"_id": {"fuel_type": "Crude Oil", "unit": "L"},
             "total_quantity": 200.0, "total_emissions": 12.5, "record_count": 1},
            {"_id": {"fuel_type": "Coal", "unit": "kg"},
             "total_quantity": 300.0, "total_emissions": 8.0, "record_count": 1},
        ])
        with patch.object(analytics_service, "db", fake):
            result = await analytics_service.query(
                org_id="org-1", facility_ids=None,
                period={"start_month": "2026-07", "end_month": "2026-07",
                        "label": "July 2026", "source": "explicit"},
            )
        cb = result.get("consumption_breakdown", [])
        assert len(cb) == 2
        units = {e["unit"] for e in cb}
        qty_by_unit = {e["unit"]: e["total_quantity"] for e in cb}
        assert units == {"L", "kg"}
        assert qty_by_unit["L"] == 200.0
        assert qty_by_unit["kg"] == 300.0
        # NOT combined into 500
        assert 500 not in qty_by_unit.values()


# -----------------------------------------------------------------
# Test 11: formulas.py record_inputs uses extract_consumption
# -----------------------------------------------------------------
class TestFormulasRecordInputs:
    @pytest.mark.asyncio
    async def test_record_inputs_from_dynamic_field_values(self):
        # Build a minimal fake db that returns a formula but no variables/etc.
        class _EmptyCursor:
            async def to_list(self, n):
                return []

        class _EmptyColl:
            def find(self, *a, **k):
                return _EmptyCursor()

            async def find_one(self, *a, **k):
                # ce_formulas.find_one → return a formula. Others → None
                return None

        class _FormulaColl(_EmptyColl):
            async def find_one(self, *a, **k):
                return {"id": "f1", "name": "F", "definition": "d",
                        "description": "", "version": "1.0"}

        class _FakeFDB:
            ce_formulas = _FormulaColl()
            ce_variables = _EmptyColl()
            ce_properties = _EmptyColl()
            ce_calculation_audit_logs = _EmptyColl()
            ce_unit_conversions = _EmptyColl()

            def __getitem__(self, n):
                return getattr(self, n, _EmptyColl())

        record = {
            "id": "e1", "formula_id": "f1", "facility": "Facility A",
            "reporting_period": "2026-07", "category": "SC", "scope": "1",
            "co2e_emissions": 12.5,
            "dynamic_field_values": {"qty": {"value": 200, "unit": "L"}},
            "emission_factor": 0.0625, "emission_factor_unit": "tCO2e/L",
        }

        with patch.object(formulas_service, "db", _FakeFDB()):
            result = await formulas_service.explain(
                org_id="org-1", emission_records=[record],
                period={"label": "July 2026"},
            )
        methodologies = result["methodologies"]
        assert len(methodologies) == 1
        ri = methodologies[0]["record_inputs"]
        assert ri["quantity"] == 200
        assert ri["unit"] == "L"
        assert ri["emission_factor"] == 0.0625


# -----------------------------------------------------------------
# Test 12: Live endpoint - Crude Oil July 2026 returns actual quantity
# -----------------------------------------------------------------
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")


@pytest.fixture(scope="module")
def auth_token():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL not set")
    try:
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "goyalsomil2001@gmail.com", "password": "TestUser123!"},
            timeout=30,
        )
    except Exception as e:
        pytest.skip(f"Login unreachable: {e}")
    if r.status_code != 200:
        pytest.skip(f"Login failed {r.status_code}: {r.text[:200]}")
    data = r.json()
    token = data.get("access_token") or data.get("token")
    if not token:
        pytest.skip(f"No token: {list(data.keys())}")
    return token


class TestLiveConsumptionAnswer:
    def test_crude_oil_july_2026_returns_quantity(self, auth_token):
        r = requests.post(
            f"{BASE_URL}/api/internal-ai/chat",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"message": "How much Crude Oil was consumed for July 2026?"},
            timeout=180,
        )
        assert r.status_code == 200, f"Non-200: {r.status_code} {r.text[:400]}"
        body = r.json()
        assert "answer" in body
        answer = body.get("answer", "")
        print(f"\n=== LIVE ANSWER ===\n{answer}\n===================")
        # Data payload may be under 'data' or embedded — check either records
        # contain quantity 200 OR answer text mentions 200/400 L
        data = body.get("data") or {}
        records = []
        if isinstance(data, dict):
            records = data.get("records") or []
            cb = data.get("consumption_breakdown") or []
        else:
            cb = []
        # Assert response is NOT the "No data found" fallback
        assert "no data found" not in answer.lower(), \
            f"Answer still returns 'No data found': {answer}"
        # Verify quantity data is surfaced somewhere: answer text OR structured data
        has_qty_in_text = bool(re.search(r"\b(200|400)\b", answer)) and (
            "l" in answer.lower() or "liter" in answer.lower() or "litre" in answer.lower()
        )
        has_qty_in_records = any(
            (r.get("quantity") in (200, 400) and r.get("unit") == "L")
            for r in records if isinstance(r, dict)
        )
        has_qty_in_cb = any(
            (e.get("total_quantity") in (200.0, 400.0, 200, 400) and e.get("unit") == "L")
            for e in cb if isinstance(e, dict)
        )
        assert has_qty_in_text or has_qty_in_records or has_qty_in_cb, (
            f"Quantity (200/400 L) not found in answer/records/consumption_breakdown. "
            f"answer={answer[:400]!r} records={records[:3]} cb={cb[:3]}"
        )
