from modules.internal_data_ai.conversation_context import apply_follow_up_context, context_from_plan
from modules.internal_data_ai.query_contracts import QueryEntity, QueryPeriod, QueryType, StructuredQueryPlan


def _diesel_july_plan():
    return StructuredQueryPlan(
        query_type=QueryType.CONSUMPTION_LOOKUP,
        entity=QueryEntity(type="fuel", raw_value="Diesel", canonical_value="Diesel", resolution="RESOLVED"),
        period=QueryPeriod(type="calendar_month", start_month="2026-07", end_month="2026-07", label="July 2026", fiscal_start_month=4),
        requested_metric="consumption",
    )


def test_context_persists_only_normalized_query_dimensions():
    context = context_from_plan(_diesel_july_plan())
    assert context["last_entity"]["canonical_value"] == "Diesel"
    assert context["last_period"]["start_month"] == "2026-07"
    assert "organization_id" not in context
    assert "facility_ids" not in context


def test_follow_up_inherits_diesel_and_july_deterministically():
    initial_context = context_from_plan(_diesel_july_plan())
    follow_up = StructuredQueryPlan(query_type=QueryType.EMISSION_LOOKUP, requested_metric="co2e")

    result = apply_follow_up_context(follow_up, "Give me Scope 1 emissions for it.", initial_context)

    assert result.entity.canonical_value == "Diesel"
    assert result.period.start_month == "2026-07"
    assert "Fuel entity inherited from the current session." in result.resolution_notes


def test_fresh_query_does_not_borrow_previous_entity():
    initial_context = context_from_plan(_diesel_july_plan())
    fresh = StructuredQueryPlan(query_type=QueryType.ANALYTICS_LOOKUP, requested_metric="co2e")

    result = apply_follow_up_context(fresh, "Show my organization emissions dashboard", initial_context)

    assert result.entity is None
    assert result.period.start_month is None