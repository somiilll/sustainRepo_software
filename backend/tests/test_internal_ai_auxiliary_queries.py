import pytest

from modules.internal_data_ai.planner import plan_service_calls
from modules.internal_data_ai.query_contracts import QueryEntity, QueryPeriod, QueryType, StructuredQueryPlan
from modules.internal_data_ai.query_understanding import build_query_plan
from modules.internal_data_ai.reporting_periods import extract_explicit_period
from modules.internal_data_ai.services.calculation_properties import lookup


def _intent(intent, **entities):
    return {"intent": intent, "entities": entities}


def _fuel():
    return {"status": "RESOLVED", "canonical_value": "Diesel"}


def test_aug_and_sept_are_explicit_calendar_months():
    august = extract_explicit_period("diesel record for aug 2026", None)
    september = extract_explicit_period("attachment for sept 2025", None)
    assert (august.start_month, august.label) == ("2026-08", "August 2026")
    assert (september.start_month, september.label) == ("2025-09", "September 2025")


def test_property_brsr_approval_and_attachment_queries_use_explicit_routes():
    property_plan = build_query_plan(
        "what is the calorific value for diesel for aug 2026",
        _intent("record_lookup", fuel_type="Diesel", record_type="emission"),
        extract_explicit_period("aug 2026", None), _fuel(),
    )
    brsr_plan = build_query_plan(
        "how many questions of brsr are filled for FY 2026-2027",
        _intent("brsr_lookup", metric="filled questions"),
        extract_explicit_period("FY 2026-2027", None),
    )
    approval_plan = build_query_plan(
        "how many entry for water is still awaiting approval",
        _intent("count_query", record_type="environment", metric="water"), None,
    )
    evidence_plan = build_query_plan(
        "is there any attachment for diesel for sept 2025",
        _intent("evidence_retrieval", fuel_type="Diesel", record_type="emission"),
        extract_explicit_period("sept 2025", None), _fuel(),
    )
    assert property_plan.query_type == QueryType.CALCULATION_PROPERTY_LOOKUP
    assert [step["service"] for step in plan_service_calls({}, property_plan)] == ["emissions", "calculation_properties", "evidence_state"]
    assert brsr_plan.query_type == QueryType.BRSR_LOOKUP
    assert [step["service"] for step in plan_service_calls({}, brsr_plan)] == ["brsr"]
    assert approval_plan.query_type == QueryType.APPROVAL_STATUS_LOOKUP
    assert approval_plan.category == "water"
    assert [step["service"] for step in plan_service_calls({}, approval_plan)] == ["approvals"]
    assert evidence_plan.query_type == QueryType.EVIDENCE_LOOKUP
    assert [step["service"] for step in plan_service_calls({}, evidence_plan)] == ["evidence"]


@pytest.mark.asyncio
async def test_calorific_value_is_read_from_authorized_dynamic_inputs():
    result = await lookup(
        "org-a",
        requested_metric="calorific_value",
        emission_records=[{
            "facility": "Facility E",
            "reporting_period": "2026-08",
            "calculation_inputs": {"cv": {"value": 0.1, "unit": "TJ/kg"}},
        }],
    )
    assert result == {
        "property": "calorific_value",
        "total_found": 1,
        "values": [{
            "property": "calorific_value",
            "value": 0.1,
            "unit": "TJ/kg",
            "facility": "Facility E",
            "reporting_period": "2026-08",
            "source": "dynamic_field_values.cv",
        }],
    }