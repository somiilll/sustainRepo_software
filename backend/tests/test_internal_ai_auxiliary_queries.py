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
    standalone_evidence_plan = build_query_plan(
        "show evidence for water consumption",
        _intent("kpi_lookup", record_type="environment", metric="water consumption"),
        None,
    )
    assert property_plan.query_type == QueryType.CALCULATION_PROPERTY_LOOKUP
    assert [step["service"] for step in plan_service_calls({}, property_plan)] == ["emissions", "calculation_properties", "evidence_state"]
    assert brsr_plan.query_type == QueryType.BRSR_LOOKUP
    assert [step["service"] for step in plan_service_calls({}, brsr_plan)] == ["brsr"]
    assert approval_plan.query_type == QueryType.APPROVAL_STATUS_LOOKUP
    assert approval_plan.category == "Water"
    assert [step["service"] for step in plan_service_calls({}, approval_plan)] == ["esg_records"]
    assert evidence_plan.query_type == QueryType.EVIDENCE_LOOKUP
    assert [step["service"] for step in plan_service_calls({}, evidence_plan)] == ["evidence"]
    assert standalone_evidence_plan.query_type == QueryType.EVIDENCE_LOOKUP
    assert [step["service"] for step in plan_service_calls({}, standalone_evidence_plan)] == ["evidence"]


def test_brsr_specific_questions_preserve_framework_routing_and_scope():
    period = extract_explicit_period("financial year 2026-2027", {"financial_year_start_month": 4})
    p1_count_plan = build_query_plan(
        "how many brsr questions in P1 are filled",
        _intent("brsr_lookup", metric="questions"),
        None,
    )
    training_plan = build_query_plan(
        "percentage coverage by training and awareness programmes in brsr for financial year 2026-2027",
        _intent("brsr_lookup", metric="training and awareness programmes"),
        period,
    )
    water_evidence_plan = build_query_plan(
        "show evidence for water consumption",
        _intent("evidence_retrieval", record_type="environment", metric="water consumption"),
        None,
    )

    assert (period.start_month, period.end_month, period.label) == ("2026-04", "2027-03", "FY 2026–27")
    assert p1_count_plan.query_type == QueryType.BRSR_LOOKUP
    assert (p1_count_plan.category, p1_count_plan.requested_metric) == ("section_c", "p1")
    assert training_plan.query_type == QueryType.BRSR_LOOKUP
    assert (training_plan.category, training_plan.requested_metric) == ("section_c", "p1_training_awareness_coverage")
    assert water_evidence_plan.query_type == QueryType.EVIDENCE_LOOKUP
    assert (water_evidence_plan.record_type, water_evidence_plan.category) == ("environment", "Water")


def test_water_status_and_consumption_queries_use_authorized_environment_records():
    pending_plan = build_query_plan(
        "Which water metrics are pending approval?",
        _intent("kpi_lookup", record_type="environment", metric="water"),
        None,
    )
    approved_plan = build_query_plan(
        "Which water metrics are approved?",
        _intent("kpi_lookup", record_type="environment", metric="water"),
        None,
    )
    consumption_plan = build_query_plan(
        "What is water consumption for July 2026?",
        _intent("kpi_lookup", record_type="environment", metric="water"),
        extract_explicit_period("July 2026", None),
    )

    assert pending_plan.record_type == "environment"
    assert pending_plan.category == "Water"
    assert pending_plan.approval_status_filter == "pending_approval"
    assert [step["service"] for step in plan_service_calls({}, pending_plan)] == ["esg_records"]
    assert approved_plan.approval_status_filter == "approved"
    assert [step["service"] for step in plan_service_calls({}, approved_plan)] == ["esg_records"]
    assert consumption_plan.query_type == QueryType.ESG_METRIC_LOOKUP
    assert consumption_plan.subcategory == "Consumption"
    assert consumption_plan.metric_field_key == "quantity"
    assert consumption_plan.metric_field_label == "Total Water Consumed"
    assert consumption_plan.requested_metric == "consumption"
    assert [step["service"] for step in plan_service_calls({}, consumption_plan)] == ["esg_records"]


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