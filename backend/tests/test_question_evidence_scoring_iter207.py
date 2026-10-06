"""Regression coverage for evidence-aware supplier questionnaire scores."""
from modules.supplier_assessment.scoring.calculator import ScoreCalculator
from modules.supplier_assessment.scoring.models import ESGSectionWeights, OverallSupplierWeights


def _breakdown(question, answer, evidence):
    questions = [{**question, "id": "environment-question", "category": "environment", "question_category": "policy"}]
    for section in ("social", "governance"):
        questions.append({
            "id": f"{section}-question", "question_text": section, "category": section,
            "question_category": "policy", "response_type": "yes_no", "assessment_type": "type_b",
            "max_points": 1, "point_scores": {"yes_score": 1, "no_score": 0},
            "scoring": {"rule": "boolean", "true_score": 100, "false_score": 0},
        })
    answers = {"environment-question": answer, "social-question": True, "governance-question": True}
    return ScoreCalculator().calculate_full_score(
        supplier_id="supplier-1", questionnaire_id="questionnaire-1", questionnaire_title=None, supplier_name=None,
        questions=questions, answers=answers, esg_weights=ESGSectionWeights(), overall_weights=OverallSupplierWeights(),
        subcategory_weights={section: {"policy": 100} for section in ("environment", "social", "governance")},
        evidence_by_question={"environment-question": ["evidence-1"]} if evidence else {},
    )


def test_yes_no_required_evidence_awards_full_score_when_evidence_is_supplied():
    question = {
        "question_text": "Evidence required", "response_type": "yes_no", "assessment_type": "type_a",
        "max_points": 10, "point_scores": {"yes_with_evidence_score": 10, "yes_without_evidence_score": 5, "no_score": 0},
        "scoring": {"rule": "boolean", "true_score": 100, "false_score": 0},
    }
    score = _breakdown(question, True, evidence=True).question_scores[0]
    assert score.points_earned == 10
    assert score.calculation_details["has_evidence"] is True


def test_multiple_choice_evidence_scoring_uses_selected_option_points():
    question = {
        "question_text": "Choose one", "response_type": "dropdown", "assessment_type": "type_c",
        "max_points": 20, "missing_evidence_percent": 20,
        "point_scores": {"yes_score": 1, "yes_with_evidence_score": 1, "yes_without_evidence_score": 0.2, "no_score": 0},
        "scoring": {"rule": "choice_mapping", "choices": {"option-1": 20, "option-2": 10}},
    }
    with_evidence = _breakdown(question, "option-1", evidence=True).question_scores[0]
    without_evidence = _breakdown(question, "option-1", evidence=False).question_scores[0]
    assert with_evidence.points_earned == 20
    assert with_evidence.raw_score == 100
    assert without_evidence.points_earned == 4
    assert without_evidence.raw_score == 20


def test_multiple_choice_standard_scoring_uses_configured_option_points():
    question = {
        "question_text": "Choose one", "response_type": "dropdown", "assessment_type": "standard",
        "max_points": 15, "scoring": {"rule": "choice_mapping", "choices": {"op23": 15, "op12": 2}},
    }
    score = _breakdown(question, "op12", evidence=False).question_scores[0]
    assert score.points_earned == 2
    assert round(score.raw_score, 2) == 13.33


def test_standard_multiple_choice_treats_option_scores_as_points():
    question = {
        "question_text": "Choose one", "response_type": "dropdown", "assessment_type": "standard",
        "max_points": 15, "scoring": {"rule": "choice_mapping", "choices": {"option-1": 15, "option-2": 2}},
    }
    score = _breakdown(question, "option-2", evidence=False).question_scores[0]
    assert score.points_earned == 2
    assert round(score.raw_score, 2) == 13.33