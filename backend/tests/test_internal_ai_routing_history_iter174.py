import pytest

from modules.internal_data_ai.planner import plan_service_calls
from modules.internal_data_ai.query_contracts import QueryPeriod, QueryType
from modules.internal_data_ai.query_understanding import build_query_plan
from modules.internal_data_ai.reporting_periods import ResolvedPeriod
from modules.esg_records.router import _dashboard_facility_scope


def _period(start_month, end_month, label):
    return ResolvedPeriod(start_month, end_month, label, "explicit", fiscal_start_month=4)


@pytest.mark.parametrize(
    ("question", "period", "section", "category", "subcategory", "field_key"),
    [
        ("total employees in fy 2026-2027", _period("2026-04", "2027-03", "FY 2026-2027"), "social", "Employees/Worker", "Employee Diversity", "no_of_employees"),
        ("No. of health & safety incidents in Nov 2026", _period("2026-11", "2026-11", "November 2026"), "social", "Health & Safety", "Health & Safety Incidents", "total_no_of_incidents"),
        ("how many cases of anti coruption cases there for July 2026", _period("2026-07", "2026-07", "July 2026"), "governance", "Anti-corruption", "Confirmed Corruption Incidents", "no_of_confirmed_corruption_incidents"),
    ],
)
def test_social_and_governance_metric_phrasing_resolves_to_stored_fields(question, period, section, category, subcategory, field_key):
    plan = build_query_plan(question, {"intent": "kpi_lookup", "entities": {}}, period)

    assert plan.query_type == QueryType.ESG_METRIC_LOOKUP
    assert (plan.record_type, plan.category, plan.subcategory, plan.metric_field_key) == (section, category, subcategory, field_key)
    calls = plan_service_calls({}, plan)
    assert calls[0]["service"] == "esg_records"
    assert calls[0]["params"]["subcategory"] == subcategory


def test_water_recycle_typo_keeps_history_intent_and_routes_to_environment_versions():
    plan = build_query_plan(
        "tell me who and what was changed for water recyle record for Nov 2026",
        {"intent": "version_history", "entities": {}},
        _period("2026-11", "2026-11", "November 2026"),
    )

    assert plan.query_type == QueryType.RECORD_VERSION_HISTORY
    assert (plan.record_type, plan.category, plan.subcategory) == ("environment", "Water", "Recycle")
    assert plan.sources_required == ["environment_records", "environment_record_versions"]
    calls = plan_service_calls({}, plan)
    assert [(call["service"], call["method"]) for call in calls] == [
        ("esg_records", "search_records"),
        ("record_history", "get_esg_record_history"),
    ]


def test_dashboard_metrics_use_server_owned_facility_scope_for_standard_users():
    user = {"role": "user", "assigned_facilities": ["facility-a"]}
    assert _dashboard_facility_scope(user, None) == ["facility-a"]
    assert _dashboard_facility_scope(user, ["facility-a", "facility-b"]) == ["facility-a"]
    assert _dashboard_facility_scope({"role": "user"}, None) == []
    assert _dashboard_facility_scope({"role": "admin"}, ["facility-b"]) == ["facility-b"]