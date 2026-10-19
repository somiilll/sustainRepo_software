import pytest

from modules.internal_data_ai.query_contracts import EvidenceState, QueryType
from modules.internal_data_ai.query_understanding import build_query_plan
from modules.internal_data_ai.reporting_periods import ResolvedPeriod


def _month():
    return ResolvedPeriod("2026-07", "2026-07", "July 2026", "explicit", fiscal_start_month=4)


def _intent(intent="kpi_lookup", fuel="Diesel"):
    return {"intent": intent, "entities": {"fuel_type": fuel, "scope": None, "facility": None}}


def _resolved_fuel(name="Diesel"):
    return {"status": "RESOLVED", "canonical_value": name}


@pytest.mark.asyncio
async def test_consumption_contract_is_explicit_and_uses_emission_records():
    plan = await build_query_plan("Diesel consumption in July 2026", _intent(), _month(), _resolved_fuel())
    assert plan.query_type == QueryType.CONSUMPTION_LOOKUP
    assert plan.entity.canonical_value == "Diesel"
    assert plan.period.start_month == "2026-07"
    assert plan.requested_metric == "consumption"
    assert plan.sources_required == ["emission_records"]


@pytest.mark.asyncio
async def test_scope_emission_contract_is_not_kpi_metadata_lookup():
    plan = await build_query_plan(
        "Give Scope 1 emissions for diesel for July 2026",
        {"intent": "kpi_lookup", "entities": {"fuel_type": "Diesel", "scope": "scope 1"}},
        _month(),
        _resolved_fuel(),
    )
    assert plan.query_type == QueryType.EMISSION_LOOKUP
    assert plan.scope == "scope 1"
    assert "esg_kpi_definitions" not in plan.sources_required


@pytest.mark.asyncio
async def test_methodology_contract_requires_relationship_sources():
    plan = await build_query_plan(
        "What is the calculation methodology for diesel in July 2026?",
        _intent("formula_calculation"),
        _month(),
        _resolved_fuel(),
    )
    assert plan.query_type == QueryType.METHODOLOGY_LOOKUP
    assert plan.sources_required == [
        "emission_records", "ce_formulas", "ce_formula_versions", "ce_calculation_audit_logs"
    ]


@pytest.mark.asyncio
async def test_version_and_audit_queries_are_distinct():
    version = await build_query_plan("Tell me version history for diesel in July 2026", _intent("version_history"), _month(), _resolved_fuel())
    audit = await build_query_plan("Show calculation audit for diesel in July 2026", _intent("formula_calculation"), _month(), _resolved_fuel())
    assert version.query_type == QueryType.RECORD_VERSION_HISTORY
    assert audit.query_type == QueryType.CALCULATION_AUDIT_LOOKUP


@pytest.mark.asyncio
async def test_generic_scope_question_never_gains_an_unrelated_fuel_entity():
    plan = await build_query_plan(
        "Give Scope 1 emissions",
        {"intent": "kpi_lookup", "entities": {"fuel_type": None, "scope": "scope 1"}},
        None,
    )
    assert plan.query_type == QueryType.EMISSION_LOOKUP
    assert plan.entity is None
    assert plan.scope == "scope 1"


@pytest.mark.asyncio
async def test_ambiguous_fuel_is_never_planned_as_found_data():
    plan = await build_query_plan("Fuel use in July 2026", _intent(fuel="Unknown blend"), _month(), {"status": "AMBIGUOUS", "canonical_value": None})
    assert plan.evidence_state == EvidenceState.AMBIGUOUS
    assert plan.entity.resolution == "AMBIGUOUS"