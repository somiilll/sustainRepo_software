"""
# Module: Internal Data AI security/correctness refactor
# Features: org/facility scoping, deterministic periods, methodology linkage, evidence/history scoping, router period authority
"""

import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List

import pytest
import requests


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from modules.internal_data_ai import query_scope
from modules.internal_data_ai import reporting_periods
from modules.internal_data_ai import router as internal_router
from modules.internal_data_ai import planner
from modules.internal_data_ai import executor
from modules.internal_data_ai.services import emissions, analytics, formulas, evidence, history


def _deep_get(doc: dict, dotted_key: str):
    current = doc
    for part in dotted_key.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def _matches_query(doc: dict, query: dict) -> bool:
    if not query:
        return True

    if "$and" in query:
        return all(_matches_query(doc, q) for q in query["$and"])
    if "$or" in query:
        return any(_matches_query(doc, q) for q in query["$or"])

    for key, expected in query.items():
        if key.startswith("$"):
            continue
        value = _deep_get(doc, key)

        if isinstance(expected, dict):
            regex_pattern = expected.get("$regex")
            if regex_pattern is not None:
                flags = re.IGNORECASE if "i" in str(expected.get("$options", "")) else 0
                if not re.search(regex_pattern, str(value or ""), flags):
                    return False

            if "$in" in expected and value not in expected["$in"]:
                return False
            if "$nin" in expected and value in expected["$nin"]:
                return False
            if "$gte" in expected and (value is None or value < expected["$gte"]):
                return False
            if "$lte" in expected and (value is None or value > expected["$lte"]):
                return False
            if "$ne" in expected and value == expected["$ne"]:
                return False
            if "$exists" in expected:
                exists = _deep_get(doc, key) is not None
                if bool(expected["$exists"]) != exists:
                    return False

            for op_key, op_val in expected.items():
                if op_key.startswith("$"):
                    continue
                nested = _deep_get(value or {}, op_key)
                if nested != op_val:
                    return False
        else:
            if value != expected:
                return False

    return True


def _apply_projection(doc: dict, projection: Dict[str, int] | None) -> dict:
    if not projection:
        return dict(doc)
    include_keys = [k for k, v in projection.items() if v == 1]
    exclude_id = projection.get("_id") == 0
    if include_keys:
        out = {k: _deep_get(doc, k) for k in include_keys if _deep_get(doc, k) is not None}
        if not exclude_id and "_id" in doc:
            out["_id"] = doc["_id"]
        return out
    out = dict(doc)
    if exclude_id:
        out.pop("_id", None)
    return out


class FakeCursor:
    def __init__(self, docs: List[dict]):
        self.docs = list(docs)

    def sort(self, field: str, direction: int):
        reverse = direction == -1
        self.docs = sorted(self.docs, key=lambda d: _deep_get(d, field) or "", reverse=reverse)
        return self

    async def to_list(self, length: int):
        return self.docs[:length]


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = list(docs or [])
        self.find_calls = []
        self.find_one_calls = []
        self.aggregate_calls = []
        self.insert_one_calls = []

    def find(self, query=None, projection=None):
        query = query or {}
        self.find_calls.append({"query": query, "projection": projection})
        filtered = [_apply_projection(d, projection) for d in self.docs if _matches_query(d, query)]
        return FakeCursor(filtered)

    async def find_one(self, query=None, projection=None, sort=None):
        query = query or {}
        self.find_one_calls.append({"query": query, "projection": projection, "sort": sort})
        matched = [d for d in self.docs if _matches_query(d, query)]
        if sort and matched:
            key, direction = sort[0]
            matched = sorted(matched, key=lambda d: _deep_get(d, key) or "", reverse=(direction == -1))
        if not matched:
            return None
        return _apply_projection(matched[0], projection)

    async def count_documents(self, query=None):
        query = query or {}
        return len([d for d in self.docs if _matches_query(d, query)])

    async def insert_one(self, doc):
        self.insert_one_calls.append(doc)
        self.docs.append(dict(doc))
        return {"inserted_id": doc.get("id", "fake")}

    def aggregate(self, pipeline):
        self.aggregate_calls.append(pipeline)
        rows = list(self.docs)
        for stage in pipeline:
            if "$match" in stage:
                rows = [r for r in rows if _matches_query(r, stage["$match"])]
            elif "$group" in stage:
                spec = stage["$group"]
                id_field = str(spec.get("_id", "")).replace("$", "")
                grouped = {}
                for row in rows:
                    gid = row.get(id_field)
                    item = grouped.setdefault(gid, {"_id": gid, "total_emissions": 0.0, "record_count": 0})
                    value = row.get("co2e_emissions")
                    if value is None:
                        value = row.get("total_emissions")
                    item["total_emissions"] += float(value or 0)
                    item["record_count"] += 1
                rows = list(grouped.values())
            elif "$sort" in stage:
                sort_fields = list(stage["$sort"].items())
                for key, direction in reversed(sort_fields):
                    rows = sorted(rows, key=lambda d: d.get(key) or "", reverse=(direction == -1))
            elif "$limit" in stage:
                rows = rows[: int(stage["$limit"])]
        return FakeCursor(rows)


class FakeDB:
    def __init__(self, collections=None):
        self._collections = collections or {}

    def __getattr__(self, item):
        if item not in self._collections:
            self._collections[item] = FakeCollection([])
        return self._collections[item]

    def __getitem__(self, item):
        return self.__getattr__(item)


def _aug_2026_period_payload():
    return {"start_month": "2026-08", "end_month": "2026-08", "label": "August 2026", "source": "explicit"}


class TestQueryScopeAndFacilityResolution:
    def test_organization_scope_is_mandatory_and_fail_closed_for_empty_facilities(self):
        assert query_scope.organization_scope("org-a", None) == {"organization_id": "org-a"}
        assert query_scope.organization_scope("org-a", []) == {"organization_id": "org-a", "facility_id": {"$in": []}}

    @pytest.mark.asyncio
    async def test_resolve_authorized_facilities_filters_named_facility_to_allowed_ids_only(self):
        db = FakeDB({
            "facilities": FakeCollection([
                {"id": "fa", "organization_id": "org-a", "name": "Facility A"},
                {"id": "fb", "organization_id": "org-a", "name": "Facility B"},
            ])
        })
        resolved = await query_scope.resolve_authorized_facilities(db, "org-a", ["fa"], "Facility B")
        assert resolved == []


class TestEmissionsAnalyticsScopedFiltering:
    @pytest.mark.asyncio
    async def test_emissions_query_contains_org_facility_scope_category_and_period_and_excludes_outside_data(self, monkeypatch):
        fake_db = FakeDB({
            "facilities": FakeCollection([
                {"id": "fa", "organization_id": "org-a", "name": "Facility A"},
                {"id": "fb", "organization_id": "org-a", "name": "Facility B"},
            ]),
            "emission_records": FakeCollection([
                {"id": "r-1", "organization_id": "org-a", "facility_id": "fa", "scope": "1", "category": "Stationary", "sub_category": "Diesel", "reporting_period": "2026-08", "co2e_emissions": 10, "created_at": "2026-08-15"},
                {"id": "r-2", "organization_id": "org-a", "facility_id": "fa", "scope": "1", "category": "Stationary", "sub_category": "Diesel", "reporting_period": "2026-07", "co2e_emissions": 99, "created_at": "2026-07-15"},
                {"id": "r-3", "organization_id": "org-b", "facility_id": "fa", "scope": "1", "category": "Stationary", "sub_category": "Diesel", "reporting_period": "2026-08", "co2e_emissions": 88, "created_at": "2026-08-12"},
                {"id": "r-4", "organization_id": "org-a", "facility_id": "fb", "scope": "1", "category": "Stationary", "sub_category": "Diesel", "reporting_period": "2026-08", "co2e_emissions": 77, "created_at": "2026-08-13"},
            ]),
        })
        monkeypatch.setattr(emissions, "db", fake_db)

        result = await emissions.search_records(
            org_id="org-a",
            facility_ids=["fa"],
            scope="Scope 1",
            category="Stationary",
            period=_aug_2026_period_payload(),
        )

        assert [r["id"] for r in result["records"]] == ["r-1"]
        assert result["period"] == "August 2026"

        query = fake_db.emission_records.find_calls[0]["query"]
        query_s = str(query)
        assert "organization_id" in query_s and "org-a" in query_s
        assert "facility_id" in query_s and "fa" in query_s
        assert "scope" in query_s
        assert "category" in query_s and "sub_category" in query_s
        assert "reporting_period" in query_s and "2026-08" in query_s
        assert "Facility" not in query_s  # no facility-name final filter

    @pytest.mark.asyncio
    async def test_named_unauthorized_facility_is_fail_closed_to_no_data(self, monkeypatch):
        fake_db = FakeDB({
            "facilities": FakeCollection([
                {"id": "fa", "organization_id": "org-a", "name": "Facility A"},
                {"id": "fb", "organization_id": "org-a", "name": "Facility B"},
            ]),
            "emission_records": FakeCollection([
                {"id": "r-1", "organization_id": "org-a", "facility_id": "fb", "scope": "1", "category": "Stationary", "reporting_period": "2026-08", "co2e_emissions": 10, "created_at": "2026-08-15"},
            ]),
        })
        monkeypatch.setattr(emissions, "db", fake_db)

        result = await emissions.search_records(
            org_id="org-a",
            facility_ids=["fa"],
            facility="Facility B",
            period=_aug_2026_period_payload(),
        )

        assert result["total_found"] == 0
        query = fake_db.emission_records.find_calls[0]["query"]
        assert "facility_id" in str(query)
        assert "'$in': []" in str(query) or '"$in": []' in str(query)

    @pytest.mark.asyncio
    async def test_analytics_applies_scope_category_and_period_before_aggregation(self, monkeypatch):
        fake_db = FakeDB({
            "facilities": FakeCollection([
                {"id": "fa", "organization_id": "org-a", "name": "Facility A"},
            ]),
            "emission_records": FakeCollection([
                {"id": "r-1", "organization_id": "org-a", "facility_id": "fa", "scope": "1", "category": "Stationary", "sub_category": "Diesel", "reporting_period": "2026-08", "co2e_emissions": 10},
                {"id": "r-2", "organization_id": "org-b", "facility_id": "fa", "scope": "1", "category": "Stationary", "sub_category": "Diesel", "reporting_period": "2026-08", "co2e_emissions": 88},
                {"id": "r-3", "organization_id": "org-a", "facility_id": "fa", "scope": "1", "category": "Stationary", "sub_category": "Diesel", "reporting_period": "2026-07", "co2e_emissions": 77},
            ]),
        })
        monkeypatch.setattr(analytics, "db", fake_db)

        result = await analytics.query(
            org_id="org-a",
            facility_ids=["fa"],
            scope="Scope 1",
            category="Stationary",
            period=_aug_2026_period_payload(),
        )

        assert result["total_records"] == 1
        assert result["period"] == "August 2026"
        assert len(result["facility_rankings"]) == 1
        assert result["facility_rankings"][0]["total_emissions"] == 10.0

        pipeline = fake_db.emission_records.aggregate_calls[0]
        match_stage = next(stage["$match"] for stage in pipeline if "$match" in stage)
        match_s = str(match_stage)
        assert "organization_id" in match_s and "org-a" in match_s
        assert "facility_id" in match_s and "fa" in match_s
        assert "scope" in match_s
        assert "category" in match_s and "sub_category" in match_s
        assert "reporting_period" in match_s and "2026-08" in match_s


class TestDeterministicPeriodParsing:
    def test_extract_explicit_period_formats(self):
        org = {"reporting_year_type": "financial_year", "financial_year_start_month": 4}

        aug = reporting_periods.extract_explicit_period("Show August 2026 scope 1 emissions", org)
        assert aug and aug.start_month == "2026-08" and aug.end_month == "2026-08"

        iso = reporting_periods.extract_explicit_period("Show 2026-08 emissions", org)
        assert iso and iso.start_month == "2026-08"

        fy = reporting_periods.extract_explicit_period("Give FY 2026-27 totals", org)
        assert fy and fy.start_month == "2026-04" and fy.end_month == "2027-03"

        cy = reporting_periods.extract_explicit_period("Give CY 2026 totals", org)
        assert cy and cy.start_month == "2026-01" and cy.end_month == "2026-12"

        q1_fy = reporting_periods.extract_explicit_period("Give Q1 FY 2026-27 totals", org)
        assert q1_fy and q1_fy.start_month == "2026-04" and q1_fy.end_month == "2026-06"

        current_fy = reporting_periods.extract_explicit_period("show current FY emissions", org)
        assert current_fy and current_fy.label

    def test_unspecified_question_does_not_produce_period(self):
        org = {"reporting_year_type": "financial_year", "financial_year_start_month": 4}
        assert reporting_periods.extract_explicit_period("How are emissions doing lately?", org) is None

    @pytest.mark.asyncio
    async def test_latest_available_period_uses_stored_valid_period_only(self):
        fake_db = FakeDB({
            "emission_records": FakeCollection([
                {"organization_id": "org-a", "reporting_period": "bad-value"},
                {"organization_id": "org-a", "reporting_period": {"date": "2026-08-15"}},
                {"organization_id": "org-a", "reporting_period": {"year": "2024", "month": "Sep"}},
                {"organization_id": "org-a", "reporting_period": "2026-07"},
            ])
        })
        latest = await reporting_periods.latest_available_period(fake_db, "emission_records", {"organization_id": "org-a"})
        assert latest is not None
        assert latest.start_month == "2026-08"
        assert latest.label == "August 2026"


class TestRouterPeriodAuthority:
    @pytest.mark.asyncio
    async def test_explicit_period_from_question_overrides_llm_period(self, monkeypatch):
        fake_db = FakeDB({
            "internal_ai_embeddings": FakeCollection([{"organization_id": "org-a"}]),
            "organizations": FakeCollection([{"id": "org-a", "reporting_year_type": "financial_year", "financial_year_start_month": 4}]),
            "internal_ai_conversations": FakeCollection([]),
        })

        captured = {}

        async def fake_detect_intent(message, org_context):
            return {
                "intent": "analytics",
                "response_type": "text",
                "entities": {"period": {"start_month": "2025-01", "end_month": "2025-12", "label": "CY 2025"}},
            }

        async def fake_find_similar_entities(message, org_id, db, top_k=3):
            return {"matches": []}

        def fake_plan_service_calls(intent_result, query_plan=None):
            captured["entities"] = intent_result.get("entities", {})
            return []

        async def fake_execute_plan(plan, org_id, facility_ids=None):
            return {}

        async def fake_build_response(question, intent, service_data, response_type, query_plan=None):
            return {"answer": "ok", "response_type": "text"}

        monkeypatch.setattr(internal_router, "db", fake_db)
        monkeypatch.setattr(internal_router, "detect_intent", fake_detect_intent)
        monkeypatch.setattr(internal_router, "find_similar_entities", fake_find_similar_entities)
        monkeypatch.setattr(internal_router, "plan_service_calls", fake_plan_service_calls)
        monkeypatch.setattr(internal_router, "execute_plan", fake_execute_plan)
        monkeypatch.setattr(internal_router, "build_response", fake_build_response)

        request = internal_router.ChatRequest(message="What were scope 1 emissions in August 2026?")
        response = await internal_router.internal_ai_chat(request, current_user={"id": "u1", "organization_id": "org-a"})

        assert response.answer == "ok"
        assert captured["entities"]["period"]["start_month"] == "2026-08"
        assert captured["entities"]["period"]["end_month"] == "2026-08"

    @pytest.mark.asyncio
    async def test_absent_explicit_period_clears_model_invented_period(self, monkeypatch):
        fake_db = FakeDB({
            "internal_ai_embeddings": FakeCollection([{"organization_id": "org-a"}]),
            "organizations": FakeCollection([{"id": "org-a", "reporting_year_type": "financial_year", "financial_year_start_month": 4}]),
            "internal_ai_conversations": FakeCollection([]),
        })

        captured = {}

        async def fake_detect_intent(message, org_context):
            return {
                "intent": "analytics",
                "response_type": "text",
                "entities": {"period": {"start_month": "2028-01", "end_month": "2028-12", "label": "CY 2028"}},
            }

        async def fake_find_similar_entities(message, org_id, db, top_k=3):
            return {"matches": []}

        def fake_plan_service_calls(intent_result, query_plan=None):
            captured["entities"] = intent_result.get("entities", {})
            return []

        async def fake_execute_plan(plan, org_id, facility_ids=None):
            return {}

        async def fake_build_response(question, intent, service_data, response_type, query_plan=None):
            return {"answer": "ok", "response_type": "text"}

        monkeypatch.setattr(internal_router, "db", fake_db)
        monkeypatch.setattr(internal_router, "detect_intent", fake_detect_intent)
        monkeypatch.setattr(internal_router, "find_similar_entities", fake_find_similar_entities)
        monkeypatch.setattr(internal_router, "plan_service_calls", fake_plan_service_calls)
        monkeypatch.setattr(internal_router, "execute_plan", fake_execute_plan)
        monkeypatch.setattr(internal_router, "build_response", fake_build_response)

        request = internal_router.ChatRequest(message="Show my scope 1 emissions")
        response = await internal_router.internal_ai_chat(request, current_user={"id": "u1", "organization_id": "org-a"})

        assert response.answer == "ok"
        assert captured["entities"]["period"] is None


class TestMethodologyFlowAndFormulaLookup:
    def test_planner_orders_formula_flow_as_emissions_then_formulas(self):
        plan = planner.plan_service_calls({"intent": "formula_calculation", "entities": {"scope": "1"}})
        assert [step["service"] for step in plan] == ["emissions", "formulas"]

    @pytest.mark.asyncio
    async def test_executor_passes_authorized_emission_records_to_formula_service(self, monkeypatch):
        captured = {}

        async def fake_emissions_search(org_id, facility_ids=None, **kwargs):
            return {"records": [{"id": "er-1", "formula_id": "f-1"}]}

        async def fake_formula_explain(org_id, facility_ids=None, **kwargs):
            captured["emission_records"] = kwargs.get("emission_records")
            return {"methodologies": []}

        monkeypatch.setattr(executor, "SERVICE_MAP", {
            "emissions": {"search_records": fake_emissions_search},
            "formulas": {"explain": fake_formula_explain},
        })

        await executor.execute_plan(
            [
                {"service": "emissions", "method": "search_records", "params": {}},
                {"service": "formulas", "method": "explain", "params": {}},
            ],
            org_id="org-a",
            facility_ids=["fa"],
        )

        assert captured["emission_records"] == [{"id": "er-1", "formula_id": "f-1"}]

    @pytest.mark.asyncio
    async def test_formula_service_uses_exact_formula_id_and_returns_stored_definition_audit(self, monkeypatch):
        fake_db = FakeDB({
            "ce_formulas": FakeCollection([
                {"id": "f-100", "organization_id": "org-a", "name": "Stored Formula", "definition": "co2e = qty * ef", "version": "v3", "variable_ids": ["qty"], "property_keys": ["gwp"]},
            ]),
            "ce_variables": FakeCollection([
                {"id": "v1", "key": "qty", "label": "Quantity", "description": "Fuel quantity", "default_unit": "kg"},
            ]),
            "ce_properties": FakeCollection([
                {"id": "p1", "key": "gwp", "label": "GWP", "value": 1, "unit": "", "description": "Global warming potential"},
            ]),
            "ce_calculation_audit_logs": FakeCollection([
                {"org_id": "org-a", "emission_record_id": "er-1", "formula_id": "f-100", "inputs": {"qty": 10}, "outputs": {"co2e": 20}, "audit_log": ["step"], "created_at": "2026-08-01"},
            ]),
            "ce_unit_conversions": FakeCollection([
                {"is_active": True, "from_unit": "kg", "to_unit": "t", "factor": 0.001},
            ]),
        })
        monkeypatch.setattr(formulas, "db", fake_db)

        result = await formulas.explain(
            org_id="org-a",
            period={"label": "August 2026"},
            emission_records=[
                {"id": "er-1", "facility": "Facility A", "reporting_period": "2026-08", "category": "Stationary", "scope": "1", "co2e_emissions": 20, "formula_id": "f-100", "quantity": 10, "unit": "kg", "emission_factor": 2, "emission_factor_unit": "kg/kg"}
            ],
        )

        methodology = result["methodologies"][0]
        assert methodology["formula_available"] is True
        assert methodology["formula"]["id"] == "f-100"
        assert methodology["formula"]["definition"] == "co2e = qty * ef"
        assert methodology["formula"]["version"] == "v3"
        assert methodology["calculation_audit"]["inputs"] == {"qty": 10}
        assert methodology["calculation_audit"]["outputs"] == {"co2e": 20}

        formula_lookup_query = fake_db.ce_formulas.find_one_calls[0]["query"]
        assert formula_lookup_query.get("$and") is not None
        assert "f-100" in str(formula_lookup_query)
        assert "$regex" not in str(formula_lookup_query)

    @pytest.mark.asyncio
    async def test_missing_formula_id_returns_no_formula_message_without_lookup(self, monkeypatch):
        fake_db = FakeDB({"ce_formulas": FakeCollection([])})
        monkeypatch.setattr(formulas, "db", fake_db)

        result = await formulas.explain(
            org_id="org-a",
            emission_records=[{"id": "er-2", "reporting_period": "2026-08", "formula_id": None}],
        )

        methodology = result["methodologies"][0]
        assert methodology["formula_available"] is False
        assert methodology["message"] == "Formula information is not available for this calculation record."
        assert fake_db.ce_formulas.find_one_calls == []


class TestEvidenceAndHistoryScoping:
    @pytest.mark.asyncio
    async def test_evidence_uses_scoped_record_links_without_global_uploaded_files_fallback(self, monkeypatch):
        fake_db = FakeDB({
            "facilities": FakeCollection([{"id": "fa", "organization_id": "org-a", "name": "Facility A"}]),
            "emission_records": FakeCollection([
                {"id": "er-1", "organization_id": "org-a", "facility_id": "fa", "evidence_url": "/api/files/11111111-1111-1111-1111-111111111111", "reporting_period": "2026-08"},
                {"id": "er-2", "organization_id": "org-b", "facility_id": "fa", "evidence_url": "/api/files/22222222-2222-2222-2222-222222222222", "reporting_period": "2026-08"},
            ]),
            "environment_records": FakeCollection([]),
            "social_records": FakeCollection([]),
            "governance_records": FakeCollection([]),
            "uploaded_files": FakeCollection([
                {"id": "11111111-1111-1111-1111-111111111111", "original_filename": "invoice.pdf", "content_type": "application/pdf", "file_size": 10},
            ]),
            "users": FakeCollection([{"id": "u1", "organization_id": "org-a"}]),
        })
        monkeypatch.setattr(evidence, "db", fake_db)

        result = await evidence.find_files(org_id="org-a", facility_ids=["fa"], period=_aug_2026_period_payload())
        assert result["total_files"] == 1

        uploaded_lookup = fake_db.uploaded_files.find_one_calls[0]["query"]
        assert uploaded_lookup == {"id": "11111111-1111-1111-1111-111111111111"}
        assert fake_db.users.find_calls == []
        assert fake_db.users.find_one_calls == []

    @pytest.mark.asyncio
    async def test_history_changes_are_scoped_to_authorized_record_ids(self, monkeypatch):
        fake_db = FakeDB({
            "emission_records": FakeCollection([{"id": "em-1", "organization_id": "org-a", "facility_id": "fa"}]),
            "emission_history": FakeCollection([
                {"emission_id": "em-1", "changed_by": "x", "changed_at": "2026-08-01", "changes": []},
                {"emission_id": "em-2", "changed_by": "x", "changed_at": "2026-08-01", "changes": []},
            ]),
            "environment_records": FakeCollection([
                {"id": "env-1", "organization_id": "org-a", "org_id": "org-a", "facility_id": "fa"},
                {"id": "env-2", "organization_id": "org-a", "org_id": "org-a", "facility_id": "fb"},
            ]),
            "environment_record_versions": FakeCollection([
                {"record_id": "env-1", "version": 2, "created_by": "u", "created_at": "2026-08-01", "changed_fields": ["x"]},
                {"record_id": "env-2", "version": 2, "created_by": "u", "created_at": "2026-08-01", "changed_fields": ["x"]},
            ]),
            "social_records": FakeCollection([]),
            "social_record_versions": FakeCollection([]),
            "governance_records": FakeCollection([]),
            "governance_record_versions": FakeCollection([]),
            "esg_targets": FakeCollection([]),
            "esg_target_versions": FakeCollection([]),
        })
        monkeypatch.setattr(history, "db", fake_db)

        result = await history.get_changes(org_id="org-a", facility_ids=["fa"], record_type="environment")
        ids = [item.get("record_id") for item in result["history"] if item.get("module") == "Environment"]
        assert ids == ["env-1"]

    @pytest.mark.asyncio
    async def test_audit_and_approval_queries_include_organization_scope(self, monkeypatch):
        fake_db = FakeDB({
            "emission_records": FakeCollection([{"id": "em-1", "organization_id": "org-a", "facility_id": "fa"}]),
            "environment_records": FakeCollection([]),
            "social_records": FakeCollection([]),
            "governance_records": FakeCollection([]),
            "esg_assignments": FakeCollection([]),
            "esg_reporting_tasks": FakeCollection([]),
            "audit_logs": FakeCollection([]),
            "approval_history": FakeCollection([]),
            "approval_requests": FakeCollection([]),
        })
        monkeypatch.setattr(history, "db", fake_db)

        await history.get_logs(org_id="org-a", facility_ids=["fa"], entity_name="emission")
        await history.get_approval_history(org_id="org-a", facility_ids=["fa"], entity_name="emission")

        assert fake_db.audit_logs.find_calls
        assert fake_db.approval_history.find_calls
        assert fake_db.approval_requests.find_calls
        assert "organization_id" in str(fake_db.audit_logs.find_calls[0]["query"])
        assert "organization_id" in str(fake_db.approval_history.find_calls[0]["query"])
        assert "organization_id" in str(fake_db.approval_requests.find_calls[0]["query"])

    @pytest.mark.asyncio
    async def test_framework_version_history_should_include_org_filter_in_version_query(self, monkeypatch):
        fake_db = FakeDB({
            "organization_esg_responses": FakeCollection([
                {"id": "rec-1", "organization_id": "org-a", "question_key": "q-1", "framework": "BRSR"}
            ]),
            "esg_responses_versions": FakeCollection([]),
        })
        monkeypatch.setattr(history, "db", fake_db)

        await history.get_framework_version_history(org_id="org-a", facility_ids=["fa"], entity_name="BRSR")
        version_query = fake_db.esg_responses_versions.find_calls[0]["query"]
        assert version_query.get("organization_id") == "org-a"


class TestOptionalLiveSmoke:
    def test_internal_ai_chat_august_2026_scope1_live_smoke(self):
        base_url = os.environ.get("REACT_APP_BACKEND_URL")
        if not base_url:
            pytest.skip("REACT_APP_BACKEND_URL not set")
        if not (os.environ.get("OPENAI_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")):
            pytest.skip("Configured LLM key not available in environment")

        email = "goyalsomil2001@gmail.com"
        password = "TestUser123!"

        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})

        login = session.post(
            f"{base_url.rstrip('/')}/api/auth/login",
            json={"email": email, "password": password},
            timeout=30,
        )
        if login.status_code != 200:
            pytest.skip(f"Login failed for live smoke: {login.status_code}")

        token = (login.json() or {}).get("token") or (login.json() or {}).get("access_token")
        if not token:
            pytest.skip("No auth token from login")

        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        chat = session.post(
            f"{base_url.rstrip('/')}/api/internal-ai/chat",
            json={"message": "What were our Scope 1 emissions in August 2026?"},
            headers=headers,
            timeout=120,
        )

        assert chat.status_code == 200, chat.text[:500]
        payload = chat.json()
        answer = (payload.get("answer") or "").lower()
        raw_data = payload.get("raw_data") or {}
        period_in_raw = str(raw_data).lower()
        highlights = payload.get("highlights") or []
        period_highlight_present = any(str(h.get("label", "")).lower() == "period" for h in highlights if isinstance(h, dict))
        assert (
            "aug" in answer
            or "2026" in answer
            or "period" in answer
            or "2026-08" in period_in_raw
            or period_highlight_present
        ), payload
