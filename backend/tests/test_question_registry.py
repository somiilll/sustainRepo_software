"""Tests for the ESG Question Registry and framework-precedence routing."""
import pytest
from modules.internal_data_ai.question_registry import (
    resolve_esg_query,
    RESPONSE_FOUND,
    RESPONSE_CONFIGURED_NO_RESPONSE,
    RESPONSE_NOT_CONFIGURED,
    RESPONSE_EMPTY,
)
from modules.internal_data_ai.query_understanding import build_query_plan
from modules.internal_data_ai.query_contracts import QueryType


# ── Question Registry Resolution Tests ───────────────────────────────

class TestCINRouting:
    """CIN should always resolve to brsr_a_cin via organization_esg_responses."""

    def test_full_phrase(self):
        r = resolve_esg_query("What is our Corporate Identity Number?")
        assert r is not None
        assert r.question_key == "brsr_a_cin"
        assert r.framework == "BRSR"
        assert r.source_collection == "organization_esg_responses"
        assert r.confidence >= 0.9

    def test_abbreviation(self):
        r = resolve_esg_query("What is our CIN?")
        assert r is not None
        assert r.question_key == "brsr_a_cin"

    def test_company_cin(self):
        r = resolve_esg_query("company CIN")
        assert r is not None
        assert r.question_key == "brsr_a_cin"

    def test_corporate_identification_number(self):
        r = resolve_esg_query("corporate identification number")
        assert r is not None
        assert r.question_key == "brsr_a_cin"


class TestCSRRouting:
    """CSR applicability should resolve to brsr_a_csr_applicability."""

    def test_full_phrase(self):
        r = resolve_esg_query("CSR applicability under Section 135")
        assert r is not None
        assert r.question_key == "brsr_a_csr_applicability"
        assert r.framework == "BRSR"
        assert r.confidence >= 0.9

    def test_is_csr_applicable(self):
        r = resolve_esg_query("Is CSR applicable to our company?")
        assert r is not None
        assert r.question_key == "brsr_a_csr_applicability"

    def test_section_135_csr(self):
        r = resolve_esg_query("section 135 CSR applicability")
        assert r is not None
        assert r.question_key == "brsr_a_csr_applicability"

    def test_corporate_social_responsibility(self):
        r = resolve_esg_query("corporate social responsibility applicability")
        assert r is not None
        assert r.question_key == "brsr_a_csr_applicability"


class TestAntiCorruptionRouting:
    """Anti-corruption should distinguish POLICY (BRSR) from INCIDENTS (Governance)."""

    def test_policy_question(self):
        r = resolve_esg_query("Do we have an anti-corruption policy?")
        assert r is not None
        assert r.question_key == "p1_anticorruption_policy"
        assert r.framework == "BRSR"
        assert r.section == "section_c"
        assert r.principle == "P1"

    def test_anti_bribery_policy(self):
        r = resolve_esg_query("Do we have an anti-bribery policy?")
        assert r is not None
        assert r.question_key == "p1_anticorruption_policy"

    def test_bribery_policy(self):
        r = resolve_esg_query("What is our bribery policy?")
        assert r is not None
        assert r.question_key == "p1_anticorruption_policy"

    def test_incidents_not_policy(self):
        """Incident questions should NOT match the policy registry entry."""
        r = resolve_esg_query("How many anti-corruption incidents were reported?")
        assert r is None

    def test_confirmed_corruption_cases(self):
        """Explicit incident/case wording should NOT route to BRSR policy."""
        r = resolve_esg_query("How many confirmed corruption cases were there?")
        assert r is None

    def test_anti_corruption_no_context(self):
        """Bare 'anti-corruption' without policy/incident context should match policy."""
        r = resolve_esg_query("anti-corruption policy")
        assert r is not None
        assert r.question_key == "p1_anticorruption_policy"


class TestGRIBiodiversityRouting:
    """Configured biodiversity wording must take GRI precedence over generic ESG modules."""

    def test_areas_of_biodiversity_importance(self):
        resolution = resolve_esg_query("Which sites are in areas of biodiversity importance?")
        assert resolution is not None
        assert resolution.question_key == "gri_101_5_a_i"
        assert resolution.framework == "GRI"
        assert resolution.section == "environment"
        assert resolution.display_label == "Areas of Biodiversity Importance"

    def test_biodiversity_plan_uses_gri_lookup(self):
        plan = build_query_plan(
            "Which sites are in areas of biodiversity importance?",
            {"intent": "kpi_lookup", "entities": {"record_type": "environment"}},
            None,
        )
        assert plan.query_type == QueryType.GRI_LOOKUP
        assert plan.framework_question_key == "gri_101_5_a_i"
        assert plan.framework_display_label == "Areas of Biodiversity Importance"


class TestNonFrameworkFallthrough:
    """Questions that don't match the registry should return None (fall through to ESG modules)."""

    def test_water_consumption(self):
        assert resolve_esg_query("What is our total water consumption?") is None

    def test_scope1_emissions(self):
        assert resolve_esg_query("What are our Scope 1 emissions?") is None

    def test_employee_diversity(self):
        assert resolve_esg_query("How many female employees do we have?") is None

    def test_random_question(self):
        assert resolve_esg_query("When is the next board meeting?") is None


# ── Query Plan Building Tests ────────────────────────────────────────

class TestQueryPlanFrameworkPrecedence:
    """Framework-resolved questions should override LLM intents."""

    def test_cin_overrides_organization_info(self):
        """CIN should route to BRSR, not organization_info."""
        plan = build_query_plan(
            "What is our Corporate Identity Number?",
            {"intent": "organization_info", "entities": {}},
            None,
        )
        assert plan.query_type == QueryType.BRSR_LOOKUP
        assert plan.framework_question_key == "brsr_a_cin"
        assert plan.requested_metric == "brsr_a_cin"

    def test_csr_overrides_kpi_lookup(self):
        """CSR should route to BRSR, not kpi_lookup."""
        plan = build_query_plan(
            "CSR applicability under Section 135",
            {"intent": "kpi_lookup", "entities": {"metric": "CSR applicability"}},
            None,
        )
        assert plan.query_type == QueryType.BRSR_LOOKUP
        assert plan.framework_question_key == "brsr_a_csr_applicability"

    def test_anticorruption_policy_overrides_governance(self):
        """Anti-corruption policy should route to BRSR P1, not Governance incidents."""
        plan = build_query_plan(
            "Do we have an anti-corruption policy?",
            {"intent": "kpi_lookup", "entities": {"record_type": "governance", "category": "Anti-corruption"}},
            None,
        )
        assert plan.query_type == QueryType.BRSR_LOOKUP
        assert plan.framework_question_key == "p1_anticorruption_policy"

    def test_anticorruption_incidents_use_esg_module(self):
        """Anti-corruption incidents should use ESG module routing, not BRSR."""
        plan = build_query_plan(
            "How many anti-corruption incidents were reported?",
            {"intent": "kpi_lookup", "entities": {"record_type": "governance", "category": "Anti-corruption"}},
            None,
        )
        assert plan.query_type != QueryType.BRSR_LOOKUP
        assert plan.framework_question_key is None

    def test_water_uses_esg_module(self):
        """Water questions should use the existing ESG metric resolver."""
        plan = build_query_plan(
            "What is our total water consumption?",
            {"intent": "kpi_lookup", "entities": {"record_type": "environment"}},
            None,
        )
        assert plan.framework_question_key is None
        assert plan.record_type == "environment"

    def test_explicit_brsr_still_works(self):
        """Explicit 'BRSR' mention should still route to BRSR."""
        plan = build_query_plan(
            "How many BRSR questions are filled?",
            {"intent": "brsr_lookup", "entities": {}},
            None,
        )
        assert plan.query_type == QueryType.BRSR_LOOKUP


# ── Response State Tests ─────────────────────────────────────────────

class TestResponseStates:
    """Verify the response state constants are correctly defined."""

    def test_found(self):
        assert RESPONSE_FOUND == "FOUND"

    def test_configured_no_response(self):
        assert RESPONSE_CONFIGURED_NO_RESPONSE == "CONFIGURED — RESPONSE NOT FOUND"

    def test_not_configured(self):
        assert RESPONSE_NOT_CONFIGURED == "NOT CONFIGURED"

    def test_empty(self):
        assert RESPONSE_EMPTY == "RESPONSE EMPTY"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
