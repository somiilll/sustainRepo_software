import pytest

from modules.internal_data_ai import executor
from modules.internal_data_ai.executor import execute_plan
from modules.internal_data_ai.planner import plan_service_calls
from modules.internal_data_ai.query_contracts import QueryPeriod, QueryType, StructuredQueryPlan
from modules.internal_data_ai.query_understanding import build_query_plan
from modules.internal_data_ai.reporting_periods import extract_comparison_periods
from modules.internal_data_ai.response_builder import build_response
from modules.internal_data_ai.data_normalization import resolve_emission_unit
from modules.internal_data_ai.services.emissions import _deduplicate_records


def test_extracts_two_months_and_inherits_single_explicit_year():
    periods = extract_comparison_periods("Scope 1 in July vs June 2026", {"financial_year_start_month": 4})

    assert [(period.start_month, period.label) for period in periods] == [
        ("2026-07", "July 2026"),
        ("2026-06", "June 2026"),
    ]


def test_extracts_any_number_of_months_and_inherits_a_trailing_year():
    periods = extract_comparison_periods("Scope 1 in July vs June vs May 2026", {"financial_year_start_month": 4})

    assert [(period.start_month, period.label) for period in periods] == [
        ("2026-07", "July 2026"),
        ("2026-06", "June 2026"),
        ("2026-05", "May 2026"),
    ]


def test_extracts_any_number_of_explicit_cross_year_months():
    periods = extract_comparison_periods("Scope 1 in July 2026 vs June 2025 vs May 2024", None)

    assert [period.start_month for period in periods] == ["2026-07", "2025-06", "2024-05"]


def test_expands_all_fiscal_months_for_an_implicit_comparison_request():
    periods = extract_comparison_periods(
        "Compare Scope 1 emissions of all months of FY 2026-2027",
        {"financial_year_start_month": 4},
    )

    assert [period.start_month for period in periods] == [
        "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09",
        "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03",
    ]
    assert [period.label for period in periods] == [
        "April 2026", "May 2026", "June 2026", "July 2026", "August 2026", "September 2026",
        "October 2026", "November 2026", "December 2026", "January 2027", "February 2027", "March 2027",
    ]
    assert all(period.source == "implicit_fy_month_comparison" for period in periods)


def test_all_fiscal_months_without_comparison_wording_does_not_change_single_period_behavior():
    assert extract_comparison_periods(
        "Show Scope 1 emissions for all months of FY 2026-2027",
        {"financial_year_start_month": 4},
    ) == []


def test_comparison_requires_an_explicit_year_for_ambiguous_months():
    assert extract_comparison_periods("Scope 1 in July vs June", {"financial_year_start_month": 4}) == []


@pytest.mark.asyncio
async def test_scope_comparison_becomes_emissions_plan_even_without_emissions_wording(monkeypatch):
    async def no_registry_match(*_args, **_kwargs):
        return None

    monkeypatch.setattr("modules.internal_data_ai.query_understanding.resolve_esg_query", no_registry_match)
    periods = extract_comparison_periods("Scope 1 in July vs June 2026", {"financial_year_start_month": 4})
    plan = await build_query_plan(
        "Scope 1 in July vs June 2026",
        {"intent": "analytics", "entities": {"scope": "scope1"}},
        periods[0],
        comparison_periods=periods,
    )

    assert plan.query_type == QueryType.EMISSION_LOOKUP
    assert plan.scope == "scope1"
    assert [period.label for period in plan.comparison_periods] == ["July 2026", "June 2026"]
    calls = plan_service_calls({}, plan)
    assert [call["service"] for call in calls] == ["emissions"]
    assert len(calls[0]["params"]["comparison_periods"]) == 2


@pytest.mark.asyncio
async def test_implicit_fy_month_comparison_becomes_a_strict_emissions_plan(monkeypatch):
    async def no_registry_match(*_args, **_kwargs):
        return None

    monkeypatch.setattr("modules.internal_data_ai.query_understanding.resolve_esg_query", no_registry_match)
    periods = extract_comparison_periods(
        "Compare Scope 1 emissions of all months of FY 2026-2027",
        {"financial_year_start_month": 4},
    )
    plan = await build_query_plan(
        "Compare Scope 1 emissions of all months of FY 2026-2027",
        {"intent": "analytics", "entities": {"scope": "scope1"}},
        periods[0],
        comparison_periods=periods,
    )

    assert plan.query_type == QueryType.EMISSION_LOOKUP
    assert plan.scope == "scope1"
    assert len(plan.comparison_periods) == 12
    assert plan.comparison_periods[0].label == "April 2026"
    assert plan.comparison_periods[-1].label == "March 2027"
    calls = plan_service_calls({}, plan)
    assert [call["service"] for call in calls] == ["emissions"]
    assert len(calls[0]["params"]["comparison_periods"]) == 12


@pytest.mark.asyncio
async def test_executor_runs_each_comparison_period_as_an_exact_independent_query(monkeypatch):
    calls = []

    async def fake_emissions(org_id, facility_ids=None, **kwargs):
        calls.append(kwargs)
        return {"period": kwargs["period"]["label"], "records": []}

    monkeypatch.setitem(executor.SERVICE_MAP["emissions"], "search_records", fake_emissions)
    periods = [
        QueryPeriod(start_month="2026-07", end_month="2026-07", label="July 2026").model_dump(),
        QueryPeriod(start_month="2026-06", end_month="2026-06", label="June 2026").model_dump(),
    ]
    result = await execute_plan([
        {"service": "emissions", "method": "search_records", "params": {"comparison_periods": periods}}
    ], "org-a")

    assert [call["period"]["label"] for call in calls] == ["July 2026", "June 2026"]
    assert all(call["strict_period"] is True for call in calls)
    assert [item["data"]["period"] for item in result["emissions"]["comparison"]["periods"]] == ["July 2026", "June 2026"]


@pytest.mark.asyncio
async def test_executor_runs_every_requested_comparison_period(monkeypatch):
    calls = []

    async def fake_emissions(org_id, facility_ids=None, **kwargs):
        calls.append(kwargs)
        return {"period": kwargs["period"]["label"], "records": []}

    monkeypatch.setitem(executor.SERVICE_MAP["emissions"], "search_records", fake_emissions)
    periods = [
        QueryPeriod(start_month="2026-07", end_month="2026-07", label="July 2026").model_dump(),
        QueryPeriod(start_month="2026-06", end_month="2026-06", label="June 2026").model_dump(),
        QueryPeriod(start_month="2026-05", end_month="2026-05", label="May 2026").model_dump(),
    ]
    result = await execute_plan([
        {"service": "emissions", "method": "search_records", "params": {"comparison_periods": periods}}
    ], "org-a")

    assert [call["period"]["label"] for call in calls] == ["July 2026", "June 2026", "May 2026"]
    assert all(call["strict_period"] is True for call in calls)
    assert len(result["emissions"]["comparison"]["periods"]) == 3


def test_deduplicates_repeated_current_record_before_aggregation():
    records = [
        {"id": "record-1", "facility_id": "facility-a", "reporting_period": "2026-07", "dynamic_field_values": {"qty": {"value": 10}}},
        {"id": "record-duplicate", "facility_id": "facility-a", "reporting_period": "2026-07", "dynamic_field_values": {"qty": {"value": 10}}},
        {"id": "record-2", "facility_id": "facility-a", "reporting_period": "2026-07", "dynamic_field_values": {"qty": {"value": 11}}},
    ]

    assert [record["id"] for record in _deduplicate_records(records)] == ["record-1", "record-2"]


def test_calculated_emissions_default_to_the_platform_tco2e_standard():
    assert resolve_emission_unit({}) == {"unit": "tCO2e", "source": "calculated_emissions_standard"}
    assert resolve_emission_unit({"unit": "L"}) == {"unit": "tCO2e", "source": "calculated_emissions_standard"}


@pytest.mark.asyncio
async def test_comparison_response_includes_totals_categories_and_variance_table():
    query_plan = StructuredQueryPlan(
        query_type=QueryType.EMISSION_LOOKUP,
        scope="scope1",
        comparison_periods=[
            QueryPeriod(start_month="2026-07", end_month="2026-07", label="July 2026"),
            QueryPeriod(start_month="2026-06", end_month="2026-06", label="June 2026"),
        ],
    )
    service_data = {"emissions": {"comparison": {"periods": [
        {"period": {"label": "July 2026"}, "data": {"records": [
            {"category": "Stationary Combustion", "emissions_value": 12.0, "emissions_unit": "tCO2e"},
            {"category": "Mobile Combustion", "emissions_value": 3.0, "emissions_unit": None},
        ]}},
        {"period": {"label": "June 2026"}, "data": {"records": [
            {"category": "Stationary Combustion", "emissions_value": 10.0, "emissions_unit": "tCO2e"},
            {"category": "Mobile Combustion", "emissions_value": 5.0, "emissions_unit": "tCO2e"},
        ]}},
    ]}}}

    response = await build_response("Scope 1 in July vs June 2026", {}, service_data, query_plan=query_plan)

    assert "| Category | Unit | July 2026 | June 2026 | Variance (July 2026 − June 2026) | Variance % |" in response["answer"]
    assert "| Total | tCO2e | 15 | 15 | 0 | 0.00% |" in response["answer"]
    assert "| Stationary Combustion | tCO2e | 12 | 10 | 2 | 20.00% |" in response["answer"]
    assert "Unit not stored" not in response["answer"]
    assert response["chart"]["type"] == "bar"


@pytest.mark.asyncio
async def test_comparison_response_renders_every_period_with_reference_variances():
    query_plan = StructuredQueryPlan(
        query_type=QueryType.EMISSION_LOOKUP,
        scope="scope1",
        comparison_periods=[
            QueryPeriod(start_month="2026-07", end_month="2026-07", label="July 2026"),
            QueryPeriod(start_month="2026-06", end_month="2026-06", label="June 2026"),
            QueryPeriod(start_month="2026-05", end_month="2026-05", label="May 2026"),
        ],
    )
    service_data = {"emissions": {"comparison": {"periods": [
        {"period": {"label": "July 2026"}, "data": {"records": [
            {"category": "Stationary Combustion", "emissions_value": 12.0, "emissions_unit": "tCO2e"},
        ]}},
        {"period": {"label": "June 2026"}, "data": {"records": [
            {"category": "Stationary Combustion", "emissions_value": 10.0, "emissions_unit": "tCO2e"},
        ]}},
        {"period": {"label": "May 2026"}, "data": {"records": [
            {"category": "Stationary Combustion", "emissions_value": 8.0, "emissions_unit": "tCO2e"},
        ]}},
    ]}}}

    response = await build_response("Scope 1 in July vs June vs May 2026", {}, service_data, query_plan=query_plan)

    assert "| Category | Unit | July 2026 | June 2026 | May 2026 |" in response["answer"]
    assert "Variance (July 2026 − June 2026)" in response["answer"]
    assert "variance % (july 2026 vs june 2026)" in response["answer"].lower()
    assert "Variance (July 2026 − May 2026)" in response["answer"]
    assert "variance % (july 2026 vs may 2026)" in response["answer"].lower()
    assert "| Total | tCO2e | 12 | 10 | 8 | 2 | 20.00% | 4 | 50.00% |" in response["answer"]
    assert [item["name"] for item in response["chart"]["data"]] == ["July 2026", "June 2026", "May 2026"]