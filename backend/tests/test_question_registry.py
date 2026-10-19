"""Tests for the Dynamic ESG Question Registry and framework-precedence routing."""
import pytest
from modules.internal_data_ai.question_registry import (
    build_test_registry,
    set_test_registry,
    RESPONSE_FOUND,
    RESPONSE_CONFIGURED_NO_RESPONSE,
    RESPONSE_NOT_CONFIGURED,
    RESPONSE_EMPTY,
    RESPONSE_MAPPING_NOT_FOUND,
    DataState,
)
from modules.internal_data_ai.query_understanding import build_query_plan
from modules.internal_data_ai.query_contracts import QueryType


# ── Setup: Inject test registry (no DB required) ────────────────────

@pytest.fixture(autouse=True)
def _inject_test_registry():
    """Pre-load the registry from synonym boosts so tests don't need MongoDB."""
    registry = build_test_registry()
    set_test_registry(registry)


# ── Question Registry Resolution Tests ───────────────────────────────

class TestCINRouting:
    """CIN should always resolve to brsr_a_cin via organization_esg_responses."""

    def test_full_phrase(self):
        registry = build_test_registry()
        r = registry.resolve("What is our Corporate Identity Number?")
        assert r is not None
        assert r.question_key == "brsr_a_cin"
        assert r.framework == "BRSR"
        assert r.source_collection == "organization_esg_responses"
        assert r.confidence >= 0.9

    def test_abbreviation(self):
        r = build_test_registry().resolve("What is our CIN?")
        assert r is not None
        assert r.question_key == "brsr_a_cin"

    def test_company_cin(self):
        r = build_test_registry().resolve("company CIN")
        assert r is not None
        assert r.question_key == "brsr_a_cin"

    def test_corporate_identification_number(self):
        r = build_test_registry().resolve("corporate identification number")
        assert r is not None
        assert r.question_key == "brsr_a_cin"


class TestCSRRouting:
    """CSR applicability should resolve to brsr_a_csr_applicability."""

    def test_full_phrase(self):
        r = build_test_registry().resolve("CSR applicability under Section 135")
        assert r is not None
        assert r.question_key == "brsr_a_csr_applicability"
        assert r.framework == "BRSR"
        assert r.confidence >= 0.9

    def test_is_csr_applicable(self):
        r = build_test_registry().resolve("Is CSR applicable to our company?")
        assert r is not None
        assert r.question_key == "brsr_a_csr_applicability"

    def test_section_135_csr(self):
        r = build_test_registry().resolve("section 135 CSR applicability")
        assert r is not None
        assert r.question_key == "brsr_a_csr_applicability"

    def test_corporate_social_responsibility(self):
        r = build_test_registry().resolve("corporate social responsibility applicability")
        assert r is not None
        assert r.question_key == "brsr_a_csr_applicability"


class TestNGRBCPolicyRouting:
    """NGRBC Policy Coverage must resolve to ngrbc_policy_matrix."""

    def test_policy_coverage_across_ngrbc(self):
        r = build_test_registry().resolve("What is our policy coverage across NGRBC principles?")
        assert r is not None
        assert r.question_key == "ngrbc_policy_matrix"
        assert r.framework == "BRSR"
        assert r.confidence >= 0.9

    def test_ngrbc_principles_covered(self):
        r = build_test_registry().resolve("Which NGRBC principles are covered by our policies?")
        assert r is not None
        assert r.question_key == "ngrbc_policy_matrix"

    def test_how_many_principles(self):
        r = build_test_registry().resolve("How many NGRBC principles are covered?")
        assert r is not None
        assert r.question_key == "ngrbc_policy_matrix"

    def test_do_our_policies_cover(self):
        r = build_test_registry().resolve("Do our policies cover the NGRBC principles?")
        assert r is not None
        assert r.question_key == "ngrbc_policy_matrix"


class TestAntiCorruptionRouting:
    """Anti-corruption should distinguish POLICY (BRSR) from INCIDENTS (Governance)."""

    def test_policy_question(self):
        r = build_test_registry().resolve("Do we have an anti-corruption policy?")
        assert r is not None
        assert r.question_key == "p1_anticorruption_policy"
        assert r.framework == "BRSR"
        assert r.section == "section_c"
        assert r.principle == "P1"

    def test_anti_bribery_policy(self):
        r = build_test_registry().resolve("Do we have an anti-bribery policy?")
        assert r is not None
        assert r.question_key == "p1_anticorruption_policy"

    def test_bribery_policy(self):
        r = build_test_registry().resolve("What is our bribery policy?")
        assert r is not None
        assert r.question_key == "p1_anticorruption_policy"

    def test_incidents_not_policy(self):
        """Incident questions should NOT match the policy registry entry."""
        r = build_test_registry().resolve("How many anti-corruption incidents were reported?")
        assert r is None

    def test_confirmed_corruption_cases(self):
        """Explicit incident/case wording should NOT route to BRSR policy."""
        r = build_test_registry().resolve("How many confirmed corruption cases were there?")
        assert r is None

    def test_anti_corruption_no_context(self):
        """Bare 'anti-corruption' without policy/incident context should match policy."""
        r = build_test_registry().resolve("anti-corruption policy")
        assert r is not None
        assert r.question_key == "p1_anticorruption_policy"


class TestGRIBiodiversityRouting:
    """Configured biodiversity wording must take GRI precedence over generic ESG modules."""

    def test_areas_of_biodiversity_importance(self):
        r = build_test_registry().resolve("Which sites are in areas of biodiversity importance?")
        assert r is not None
        assert r.question_key == "gri_101_5_a_i"
        assert r.framework == "GRI"
        assert r.display_label == "Areas of Biodiversity Importance"

    @pytest.mark.asyncio
    async def test_biodiversity_plan_uses_gri_lookup(self):
        plan = await build_query_plan(
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
        assert build_test_registry().resolve("What is our total water consumption?") is None

    def test_scope1_emissions(self):
        assert build_test_registry().resolve("What are our Scope 1 emissions?") is None

    def test_employee_diversity(self):
        assert build_test_registry().resolve("How many female employees do we have?") is None

    def test_random_question(self):
        assert build_test_registry().resolve("When is the next board meeting?") is None


# ── Query Plan Building Tests ────────────────────────────────────────

class TestQueryPlanFrameworkPrecedence:
    """Framework-resolved questions should override LLM intents."""

    @pytest.mark.asyncio
    async def test_cin_overrides_organization_info(self):
        plan = await build_query_plan(
            "What is our Corporate Identity Number?",
            {"intent": "organization_info", "entities": {}},
            None,
        )
        assert plan.query_type == QueryType.BRSR_LOOKUP
        assert plan.framework_question_key == "brsr_a_cin"
        assert plan.requested_metric == "brsr_a_cin"

    @pytest.mark.asyncio
    async def test_csr_overrides_kpi_lookup(self):
        plan = await build_query_plan(
            "CSR applicability under Section 135",
            {"intent": "kpi_lookup", "entities": {"metric": "CSR applicability"}},
            None,
        )
        assert plan.query_type == QueryType.BRSR_LOOKUP
        assert plan.framework_question_key == "brsr_a_csr_applicability"

    @pytest.mark.asyncio
    async def test_ngrbc_policy_uses_brsr(self):
        plan = await build_query_plan(
            "What is our policy coverage across NGRBC principles?",
            {"intent": "kpi_lookup", "entities": {}},
            None,
        )
        assert plan.query_type == QueryType.BRSR_LOOKUP
        assert plan.framework_question_key == "ngrbc_policy_matrix"

    @pytest.mark.asyncio
    async def test_anticorruption_policy_overrides_governance(self):
        plan = await build_query_plan(
            "Do we have an anti-corruption policy?",
            {"intent": "kpi_lookup", "entities": {"record_type": "governance", "category": "Anti-corruption"}},
            None,
        )
        assert plan.query_type == QueryType.BRSR_LOOKUP
        assert plan.framework_question_key == "p1_anticorruption_policy"

    @pytest.mark.asyncio
    async def test_anticorruption_incidents_use_esg_module(self):
        plan = await build_query_plan(
            "How many anti-corruption incidents were reported?",
            {"intent": "kpi_lookup", "entities": {"record_type": "governance", "category": "Anti-corruption"}},
            None,
        )
        assert plan.query_type != QueryType.BRSR_LOOKUP
        assert plan.framework_question_key is None

    @pytest.mark.asyncio
    async def test_water_uses_esg_module(self):
        plan = await build_query_plan(
            "What is our total water consumption?",
            {"intent": "kpi_lookup", "entities": {"record_type": "environment"}},
            None,
        )
        assert plan.framework_question_key is None
        assert plan.record_type == "environment"

    @pytest.mark.asyncio
    async def test_explicit_brsr_still_works(self):
        plan = await build_query_plan(
            "How many BRSR questions are filled?",
            {"intent": "brsr_lookup", "entities": {}},
            None,
        )
        assert plan.query_type == QueryType.BRSR_LOOKUP


# ── Response State Tests ─────────────────────────────────────────────

class TestResponseStates:
    """Verify the response state constants and enum values."""

    def test_found(self):
        assert RESPONSE_FOUND == "FOUND"
        assert DataState.FOUND.value == "FOUND"

    def test_configured_no_response(self):
        assert RESPONSE_CONFIGURED_NO_RESPONSE == "CONFIGURED_NO_RESPONSE"
        assert DataState.CONFIGURED_NO_RESPONSE.value == "CONFIGURED_NO_RESPONSE"

    def test_not_configured(self):
        assert RESPONSE_NOT_CONFIGURED == "NOT_CONFIGURED"
        assert DataState.NOT_CONFIGURED.value == "NOT_CONFIGURED"

    def test_empty(self):
        assert RESPONSE_EMPTY == "RESPONSE_EMPTY"
        assert DataState.RESPONSE_EMPTY.value == "RESPONSE_EMPTY"

    def test_mapping_not_found(self):
        assert RESPONSE_MAPPING_NOT_FOUND == "MAPPING_NOT_FOUND"
        assert DataState.MAPPING_NOT_FOUND.value == "MAPPING_NOT_FOUND"


# ── Diagnostic Tests ─────────────────────────────────────────────────

class TestDiagnostics:
    """Resolution should return diagnostic information."""

    def test_diagnostic_present(self):
        r = build_test_registry().resolve("What is our CIN?")
        assert r is not None
        assert r.diagnostic is not None
        assert r.diagnostic.question_key == "brsr_a_cin"
        assert r.diagnostic.resolution_confidence >= 0.9
        assert r.diagnostic.detected_intent == "FRAMEWORK_QUESTION_LOOKUP"
        assert r.diagnostic.framework == "BRSR"

    def test_diagnostic_confidence(self):
        r = build_test_registry().resolve("What is our policy coverage across NGRBC principles?")
        assert r is not None
        assert r.diagnostic.resolution_confidence >= 0.85


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
