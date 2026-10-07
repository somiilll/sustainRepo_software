import pytest
import asyncio
from datetime import datetime, timezone
from shared.database.mongo import db
from modules.supplier_assessment.contracts import QuestionReviewDecision

def test_question_review_decision_validation():
    # Accepted valid
    d = QuestionReviewDecision(status="accepted")
    assert d.status == "accepted"
    assert d.needs_resubmission is False

    # Rejected with resubmission needs reviewer_note
    with pytest.raises(ValueError, match="comment/note"):
        QuestionReviewDecision(status="rejected", needs_resubmission=True, reviewer_note="")

    d2 = QuestionReviewDecision(status="rejected", needs_resubmission=True, reviewer_note="Please provide ISO 14001 certificate.")
    assert d2.needs_resubmission is True
    assert d2.reviewer_note == "Please provide ISO 14001 certificate."

    # Rejected without resubmission needs reviewer_score and reviewer_note
    with pytest.raises(ValueError, match="approved score"):
        QuestionReviewDecision(status="rejected", needs_resubmission=False, reviewer_note="Rationale note")

    with pytest.raises(ValueError, match="rationale/note"):
        QuestionReviewDecision(status="rejected", needs_resubmission=False, reviewer_score=0.0, reviewer_note="")

    d3 = QuestionReviewDecision(status="rejected", needs_resubmission=False, reviewer_score=5.0, reviewer_note="Partial score awarded.")
    assert d3.reviewer_score == 5.0
