import pytest
from modules.supplier_assessment.scoring.calculator import ScoreCalculator
from modules.supplier_assessment.scoring.models import ESGSectionWeights, OverallSupplierWeights

def test_calculator_applies_reviewed_scores():
    calc = ScoreCalculator()
    questions = [
        {
            "id": "q1",
            "question_text": "Do you have environmental policy?",
            "section": "environment",
            "question_category": "energy",
            "response_type": "yes_no",
            "assessment_type": "type_b",
            "max_points": 10.0,
            "point_scores": {"yes_score": 10.0, "no_score": 0.0},
            "scoring": {"rule": "boolean", "true_score": 100, "false_score": 0},
        },
        {
            "id": "q2",
            "question_text": "Renewable energy share",
            "section": "environment",
            "question_category": "energy",
            "response_type": "number",
            "max_points": 20.0,
            "scoring": {"rule": "higher_is_better", "target": 100, "min": 0, "max": 100, "max_score": 100},
        }
    ]
    answers = {"q1": True, "q2": 50}
    esg_weights = ESGSectionWeights(environment=100.0, social=0.0, governance=0.0)
    overall_weights = OverallSupplierWeights(esg=100.0, ghg=0.0)

    # 1. Unreviewed calculation:
    # q1 = 10 pts, q2 = 50% of 20 = 10 pts. Total = 20/30 pts = 66.67%
    res1 = calc.calculate_full_score(
        supplier_id="s1",
        questionnaire_id="qn1",
        questionnaire_title="ESG Questionnaire",
        supplier_name="Acme Inc",
        questions=questions,
        answers=answers,
        esg_weights=esg_weights,
        overall_weights=overall_weights,
        subcategory_weights={"environment": {"energy": 100.0}},
        question_reviews={},
    )
    assert round(res1.esg_score.overall_score, 1) == 66.7

    # 2. q1 Rejected with 0 score without resubmission:
    reviews = {
        "q1": {
            "status": "rejected",
            "needs_resubmission": False,
            "reviewer_score": 0.0,
            "reviewer_note": "Policy missing key commitments",
        }
    }
    res2 = calc.calculate_full_score(
        supplier_id="s1",
        questionnaire_id="qn1",
        questionnaire_title="ESG Questionnaire",
        supplier_name="Acme Inc",
        questions=questions,
        answers=answers,
        esg_weights=esg_weights,
        overall_weights=overall_weights,
        subcategory_weights={"environment": {"energy": 100.0}},
        question_reviews=reviews,
    )
    # q1 is 0 pts, q2 is 10 pts. Total = 10/30 pts = 33.33%
    assert round(res2.esg_score.overall_score, 1) == 33.3

    # 3. q1 Accepted keeps earned score (10 pts):
    reviews_accepted = {
        "q1": {
            "status": "accepted",
            "needs_resubmission": False,
        }
    }
    res3 = calc.calculate_full_score(
        supplier_id="s1",
        questionnaire_id="qn1",
        questionnaire_title="ESG Questionnaire",
        supplier_name="Acme Inc",
        questions=questions,
        answers=answers,
        esg_weights=esg_weights,
        overall_weights=overall_weights,
        subcategory_weights={"environment": {"energy": 100.0}},
        question_reviews=reviews_accepted,
    )
    assert round(res3.esg_score.overall_score, 1) == 66.7
