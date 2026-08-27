"""Focused contracts for simple/exact question weights and intensity-based GHG scoring."""
import pytest

from modules.supplier_assessment.scoring.calculator import ScoreCalculator
from modules.supplier_assessment.scoring.engine import ScoringEngine
from modules.supplier_assessment.scoring.models import ESGSectionWeights, OverallSupplierWeights


def _score_question(question):
    return ScoreCalculator().calculate_full_score(
        supplier_id="supplier-1",
        questionnaire_id="questionnaire-1",
        questionnaire_title="Test questionnaire",
        supplier_name="Test supplier",
        questions=[question],
        answers={"question-1": True},
        esg_weights=ESGSectionWeights(),
        overall_weights=OverallSupplierWeights(),
    ).question_scores[0]


def test_simple_importance_maps_to_internal_weight():
    score = _score_question({
        "id": "question-1", "question_text": "Has a policy?", "category": "environment",
        "response_type": "yes_no", "importance": "critical",
        "scoring": {"rule": "boolean", "true_score": 100, "false_score": 0},
    })
    assert score.weight == 4
    assert score.weight_source == "importance"
    assert score.weighted_score == 400


def test_exact_weight_overrides_importance_without_combining_values():
    score = _score_question({
        "id": "question-1", "question_text": "Has a policy?", "category": "environment",
        "response_type": "yes_no", "importance": "critical", "exact_numerical_weight": 3.5,
        "scoring": {"rule": "boolean", "true_score": 100, "false_score": 0},
    })
    assert score.weight == 3.5
    assert score.weight_source == "exact"
    assert score.weighted_score == 350


def test_parent_manual_question_score_overrides_only_manual_question_score():
    breakdown = ScoreCalculator().calculate_full_score(
        supplier_id="supplier-1",
        questionnaire_id="questionnaire-1",
        questionnaire_title="Test questionnaire",
        supplier_name="Test supplier",
        questions=[{
            "id": "question-1", "question_text": "Describe your governance policy.",
            "category": "governance", "response_type": "text", "importance": "high",
            "scoring": {"rule": "manual", "requires_manual_review": True},
        }],
        answers={"question-1": "The policy is independently audited."},
        manual_scores={"question-1": {"score": 72, "scored_by": "admin-1"}},
        esg_weights=ESGSectionWeights(),
        overall_weights=OverallSupplierWeights(),
    )

    question_score = breakdown.question_scores[0]
    assert question_score.raw_response == "The policy is independently audited."
    assert question_score.raw_score == 72
    assert question_score.calculation_details["manual_score"] == 72
    assert question_score.calculation_details["score_source"] == "parent_manual_review"


class _Cursor:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, _limit):
        return self.rows


class _EmissionCollection:
    def __init__(self, rows):
        self.rows = rows

    def find(self, _query, _projection):
        return _Cursor(self.rows)


class _Database:
    def __init__(self, rows):
        self.emission_records = _EmissionCollection(rows)


@pytest.mark.asyncio
async def test_ghg_score_uses_emissions_intensity_not_absolute_total():
    engine = ScoringEngine(_Database([
        {"scope": "scope1", "total_emissions": 50},
        {"scope": "scope2", "total_emissions": 50},
    ]))
    component = await engine.get_ghg_component("supplier-1", "FY 2026-27", 2_000_000)
    assert component["total_emissions"] == 100
    assert component["intensity"] == 50
    assert component["score"] == 50