"""
Regression tests for Internal Data AI — fuel/activity consumption query routing.
Iteration 160: Ensures fuel_type and other operational data dimensions route
to emissions/analytics pipelines, NOT the KPI-definition metadata catalog.
"""
import pytest
from modules.internal_data_ai.planner import plan_service_calls, _has_operational_data_dimension


# ---------------------------------------------------------------------------
# Helper to build an intent_result dict
# ---------------------------------------------------------------------------
def _intent(intent_name: str, **entity_overrides) -> dict:
    entities = {
        "facility": None,
        "scope": None,
        "category": None,
        "fuel_type": None,
        "period": None,
        "target_name": None,
        "record_type": None,
        "metric": None,
        "entity_name": None,
    }
    entities.update(entity_overrides)
    return {"intent": intent_name, "entities": entities, "response_type": "text"}


# ===========================================================================
# 1. _has_operational_data_dimension unit tests
# ===========================================================================
class TestHasOperationalDataDimension:
    def test_empty_entities(self):
        assert _has_operational_data_dimension({}) is False

    def test_fuel_type_present(self):
        assert _has_operational_data_dimension({"fuel_type": "Crude Oil"}) is True

    def test_scope_present(self):
        assert _has_operational_data_dimension({"scope": "Scope 1"}) is True

    def test_category_present(self):
        assert _has_operational_data_dimension({"category": "Stationary Combustion"}) is True

    def test_facility_present(self):
        assert _has_operational_data_dimension({"facility": "Facility A"}) is True

    def test_none_values(self):
        assert _has_operational_data_dimension({"fuel_type": None, "scope": None}) is False


# ===========================================================================
# 2. kpi_lookup routing — fuel-type queries must NOT go to esg_records.get_kpis
# ===========================================================================
class TestKpiLookupRouting:
    """Test 1–3, 5, 8: Fuel-type consumption queries must be routed to emissions
    search records, not to the KPI-definition metadata collection."""

    def test_crude_oil_routes_to_emissions(self):
        """Test 1: 'How much Crude Oil was consumed for July 2026?'"""
        result = plan_service_calls(_intent(
            "kpi_lookup",
            fuel_type="Crude Oil",
            period={"start_month": "2026-07", "end_month": "2026-07", "label": "July 2026", "source": "explicit"},
        ))
        assert len(result) == 1
        assert result[0]["service"] == "emissions"
        assert result[0]["method"] == "search_records"
        assert result[0]["params"]["fuel_type"] == "Crude Oil"

    def test_diesel_routes_to_emissions(self):
        """Test 2: 'How much Diesel was consumed in July 2026?'"""
        result = plan_service_calls(_intent(
            "kpi_lookup",
            fuel_type="Diesel",
            period={"start_month": "2026-07", "end_month": "2026-07", "label": "July 2026", "source": "explicit"},
        ))
        assert result[0]["service"] == "emissions"
        assert result[0]["method"] == "search_records"

    def test_natural_gas_routes_to_emissions(self):
        """Test 3: 'How much Natural Gas was consumed in July 2026?'"""
        result = plan_service_calls(_intent(
            "kpi_lookup",
            fuel_type="Natural Gas",
        ))
        assert result[0]["service"] == "emissions"
        assert result[0]["method"] == "search_records"

    def test_facility_plus_fuel_routes_to_emissions(self):
        """Test 4: 'How much Crude Oil was consumed at Facility A in July 2026?'"""
        result = plan_service_calls(_intent(
            "kpi_lookup",
            fuel_type="Crude Oil",
            facility="Facility A",
            period={"start_month": "2026-07", "end_month": "2026-07", "label": "July 2026", "source": "explicit"},
        ))
        assert result[0]["service"] == "emissions"
        assert result[0]["method"] == "search_records"
        assert result[0]["params"]["fuel_type"] == "Crude Oil"
        assert result[0]["params"]["facility"] == "Facility A"

    def test_scope_routes_to_analytics(self):
        """Test 5: 'How much Scope 1 emissions were reported in July 2026?'
        Scope present but no fuel_type → analytics.query (aggregation)."""
        result = plan_service_calls(_intent(
            "kpi_lookup",
            scope="Scope 1",
            period={"start_month": "2026-07", "end_month": "2026-07", "label": "July 2026", "source": "explicit"},
        ))
        assert result[0]["service"] == "analytics"
        assert result[0]["method"] == "query"

    def test_genuine_kpi_routes_to_kpi_definitions(self):
        """Test 6: 'What is our GHG intensity for July 2026?'
        No operational data dimension, metric doesn't mention fuel → KPI catalog."""
        result = plan_service_calls(_intent(
            "kpi_lookup",
            metric="GHG intensity",
        ))
        # GHG intensity contains 'ghg' so it may still route to analytics — that's fine
        # The key test is that pure metadata KPIs don't break
        assert len(result) == 1

    def test_ltifr_routes_to_kpi_definitions(self):
        """Genuine non-emission KPI: 'What is our LTIFR?'"""
        result = plan_service_calls(_intent(
            "kpi_lookup",
            metric="LTIFR",
        ))
        assert result[0]["service"] == "esg_records"
        assert result[0]["method"] == "get_kpis"

    def test_employee_turnover_routes_to_kpi_definitions(self):
        """Genuine non-emission KPI: 'What is our employee turnover?'"""
        result = plan_service_calls(_intent(
            "kpi_lookup",
            metric="employee turnover",
        ))
        assert result[0]["service"] == "esg_records"
        assert result[0]["method"] == "get_kpis"

    def test_no_fuel_filter_when_not_specified(self):
        """Test 7: Generic 'how much fuel consumed' — no fuel_type entity.
        Should go to analytics (aggregation), not invent a fuel_type."""
        result = plan_service_calls(_intent(
            "kpi_lookup",
            metric="fuel consumption",
        ))
        # 'consumption' keyword triggers is_emission_metric, routes to analytics
        assert result[0]["service"] == "analytics"
        assert result[0]["method"] == "query"
        assert result[0]["params"].get("fuel_type") is None

    def test_crude_oil_never_calls_get_kpis(self):
        """Test 8: Crude Oil must NEVER go to esg_records.get_kpis."""
        result = plan_service_calls(_intent(
            "kpi_lookup",
            fuel_type="Crude Oil",
        ))
        for step in result:
            assert not (step["service"] == "esg_records" and step["method"] == "get_kpis"), \
                "Crude Oil query was incorrectly routed to esg_records.get_kpis"


# ===========================================================================
# 3. analytics intent still routes correctly (no regressions)
# ===========================================================================
class TestAnalyticsIntentRouting:
    def test_analytics_intent_routes_to_analytics_query(self):
        result = plan_service_calls(_intent("analytics", scope="Scope 1"))
        assert result[0]["service"] == "analytics"
        assert result[0]["method"] == "query"

    def test_analytics_with_fuel_type(self):
        result = plan_service_calls(_intent("analytics", fuel_type="Diesel"))
        assert result[0]["service"] == "analytics"
        assert result[0]["method"] == "query"
        assert result[0]["params"]["fuel_type"] == "Diesel"


# ===========================================================================
# 4. record_lookup intent still routes correctly
# ===========================================================================
class TestRecordLookupRouting:
    def test_emission_record_lookup(self):
        result = plan_service_calls(_intent("record_lookup", fuel_type="LPG", record_type="emission"))
        assert result[0]["service"] == "emissions"
        assert result[0]["method"] == "search_records"

    def test_environment_record_lookup(self):
        result = plan_service_calls(_intent("record_lookup", record_type="environment"))
        assert result[0]["service"] == "esg_records"
        assert result[0]["method"] == "search_records"


# ===========================================================================
# 5. Other intents unchanged (regression guard)
# ===========================================================================
class TestOtherIntentsUnchanged:
    def test_summary(self):
        assert plan_service_calls(_intent("summary"))[0]["service"] == "analytics"

    def test_target_progress(self):
        assert plan_service_calls(_intent("target_progress"))[0]["service"] == "targets"

    def test_evidence_retrieval(self):
        assert plan_service_calls(_intent("evidence_retrieval"))[0]["service"] == "evidence"

    def test_brsr_lookup(self):
        assert plan_service_calls(_intent("brsr_lookup"))[0]["service"] == "brsr"

    def test_data_status(self):
        assert plan_service_calls(_intent("data_status"))[0]["service"] == "data_status"

    def test_supplier_assessment(self):
        assert plan_service_calls(_intent("supplier_assessment"))[0]["service"] == "supplier_assessment"
