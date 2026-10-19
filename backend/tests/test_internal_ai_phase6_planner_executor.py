import pytest

from modules.internal_data_ai.executor import execute_plan
from modules.internal_data_ai.planner import plan_service_calls
from modules.internal_data_ai.query_contracts import QueryEntity, QueryPeriod, QueryType, StructuredQueryPlan
from modules.internal_data_ai import router as internal_router


def _plan(query_type):
    return StructuredQueryPlan(
        query_type=query_type,
        entity=QueryEntity(type="fuel", raw_value="Diesel", canonical_value="Diesel", resolution="RESOLVED"),
        period=QueryPeriod(type="calendar_month", start_month="2026-07", end_month="2026-07", label="July 2026", fiscal_start_month=4),
    )


def test_structured_planner_routes_consumption_and_version_history_deterministically():
    consumption = plan_service_calls({}, _plan(QueryType.CONSUMPTION_LOOKUP))
    emissions = plan_service_calls({}, _plan(QueryType.EMISSION_LOOKUP))
    versions = plan_service_calls({}, _plan(QueryType.RECORD_VERSION_HISTORY))

    assert [step["service"] for step in consumption] == ["emissions", "evidence_state"]
    assert [step["service"] for step in emissions] == ["emissions", "relationships", "evidence_state"]
    assert [step["service"] for step in versions] == ["emissions", "record_history", "evidence_state"]
    assert consumption[0]["params"]["fuel_type"] == "Diesel"
    assert "organization_id" not in consumption[0]["params"]


def test_unresolved_fuel_fails_closed_instead_of_broadening_the_query():
    plan = StructuredQueryPlan(
        query_type=QueryType.CONSUMPTION_LOOKUP,
        entity=QueryEntity(type="fuel", raw_value="Unknown blend", canonical_value=None, resolution="AMBIGUOUS"),
    )
    calls = plan_service_calls({}, plan)
    assert calls == [{
        "service": "evidence_state",
        "method": "validate",
        "params": {"period": plan.period.model_dump(), "entity_resolution": {"status": "AMBIGUOUS"}},
    }]


def test_admin_scope_remains_organization_wide_while_explicit_empty_scope_stays_restricted():
    admin = {"role": "admin", "assigned_facilities": []}
    restricted_user = {"role": "user", "assigned_facilities": []}
    assert internal_router.authorized_facility_scope(admin) is None
    assert internal_router.authorized_facility_scope(restricted_user) == []


@pytest.mark.asyncio
async def test_executor_passes_only_prior_authorized_records_to_relationship_and_evidence(monkeypatch):
    received = {}

    async def fake_emissions(org_id, facility_ids=None, **_kwargs):
        assert org_id == "org-a"
        assert facility_ids == ["facility-a"]
        return {"records": [{"id": "record-a", "formula_id": "formula-a"}]}

    async def fake_relationships(org_id, facility_ids=None, **kwargs):
        received["relationship_records"] = kwargs["emission_records"]
        return {"evidence_state": "FOUND", "relationships": []}

    async def fake_evidence(org_id, facility_ids=None, **kwargs):
        received["evidence_records"] = kwargs["emission_records"]
        received["relationships"] = kwargs["relationships"]
        return {"evidence_state": "FOUND"}

    from modules.internal_data_ai import executor
    monkeypatch.setitem(executor.SERVICE_MAP["emissions"], "search_records", fake_emissions)
    monkeypatch.setitem(executor.SERVICE_MAP["relationships"], "resolve", fake_relationships)
    monkeypatch.setitem(executor.SERVICE_MAP["evidence_state"], "validate", fake_evidence)

    result = await execute_plan([
        {"service": "emissions", "method": "search_records", "params": {}},
        {"service": "relationships", "method": "resolve", "params": {}},
        {"service": "evidence_state", "method": "validate", "params": {}},
    ], "org-a", ["facility-a"])

    assert received["relationship_records"] == [{"id": "record-a", "formula_id": "formula-a"}]
    assert received["evidence_records"] == [{"id": "record-a", "formula_id": "formula-a"}]
    assert received["relationships"] == {"evidence_state": "FOUND", "relationships": []}
    assert result["evidence_state"]["evidence_state"] == "FOUND"