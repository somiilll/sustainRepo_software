import pytest
import uuid
from shared.database.mongo import get_db
from modules.supplier_assessment.service import supplier_service

@pytest.mark.asyncio
async def test_review_supplier_question_with_approved_score_and_rationale():
    db = get_db()
    cust_id = f"cust-{uuid.uuid4().hex[:6]}"
    supp_id = f"supp-{uuid.uuid4().hex[:6]}"
    rel_id = f"rel-{uuid.uuid4().hex[:6]}"
    qn_id = f"qn-{uuid.uuid4().hex[:6]}"
    q_id = f"q-{uuid.uuid4().hex[:6]}"
    period = "FY 2026-2027"

    await db.organizations.insert_one({"id": cust_id, "name": "Test Cust", "organization_name": "Test Cust"})
    await db.supplier_relationships.insert_one({
        "id": rel_id,
        "customer_org_id": cust_id,
        "supplier_org_id": supp_id,
        "reporting_period": period,
        "questionnaire_ids": [qn_id],
        "contact_email": "test@supplier.com",
        "company_name": "Test Supplier",
        "is_active": True,
    })
    await db.supplier_questionnaires.insert_one({
        "id": qn_id,
        "name": "ESG Comprehensive",
        "organization_id": cust_id,
        "reporting_periods": [period],
        "is_active": True,
        "esg_weights": {"environment": 100.0, "social": 0.0, "governance": 0.0},
        "overall_weights": {"esg": 100.0, "ghg": 0.0, "revenue": 0.0},
        "esg_subcategories": {
            "environment": [{"code": "env_policy", "name": "Policy", "weight": 100.0, "enabled": True}],
            "social": [],
            "governance": [],
        },
    })
    await db.supplier_questions.insert_one({
        "id": q_id,
        "questionnaire_id": qn_id,
        "question_text": "Do you hold ISO 14001 certification?",
        "section": "environment",
        "question_category": "env_policy",
        "category": "environment",
        "response_type": "yes_no",
        "assessment_type": "type_b",
        "max_points": 20.0,
        "point_scores": {"yes_score": 20.0, "no_score": 0.0},
        "scoring": {"rule": "boolean", "true_score": 100, "false_score": 0},
        "is_active": True,
    })

    try:
        # Supplier submits True
        await supplier_service.submit_supplier_answers(
            questionnaire_id=qn_id,
            supplier_relationship_id=rel_id,
            supplier_org_id=supp_id,
            answers=[{"question_id": q_id, "answer": True}],
            is_draft=False,
            data_verified=True,
            verified_by="supp-user",
        )

        # 1. Reviewer rejects without resubmission, awards 5.0 points with rationale
        res1 = await supplier_service.review_supplier_question_response(
            supplier_relationship_id=rel_id,
            questionnaire_id=qn_id,
            question_id=q_id,
            decision={
                "status": "rejected",
                "needs_resubmission": False,
                "reviewer_score": 5.0,
                "reviewer_note": "Certification expired last month, awarded 5 partial points.",
            },
            reviewer_id="rev-user",
        )
        assert res1["review"]["status"] == "rejected"
        assert res1["review"]["needs_resubmission"] is False
        assert res1["review"]["reviewer_score"] == 5.0
        assert res1["calculated_score"] == 25.0  # 5 / 20 = 25%
        assert res1["overall_score"] == 25.0

        # Check comment visible in fetched supplier questionnaire
        supp_view = await supplier_service.get_questionnaire_for_supplier(qn_id, rel_id)
        q_item = next(q for q in supp_view["questions"] if q["id"] == q_id)
        assert q_item["review"]["reviewer_note"] == "Certification expired last month, awarded 5 partial points."
        # Supplier cannot edit since needs_resubmission is False
        assert q_item["is_unlocked_for_edit"] is False

        # 2. Reviewer subsequently requests clarification (needs_resubmission = True)
        res2 = await supplier_service.review_supplier_question_response(
            supplier_relationship_id=rel_id,
            questionnaire_id=qn_id,
            question_id=q_id,
            decision={
                "status": "rejected",
                "needs_resubmission": True,
                "reviewer_note": "Please upload renewal application receipt to restore full score.",
            },
            reviewer_id="rev-user",
        )
        assert res2["review"]["needs_resubmission"] is True
        assert res2["review"]["unlocked_for_supplier"] is True

        supp_view2 = await supplier_service.get_questionnaire_for_supplier(qn_id, rel_id)
        q_item2 = next(q for q in supp_view2["questions"] if q["id"] == q_id)
        assert q_item2["is_unlocked_for_edit"] is True
        assert q_item2["review"]["reviewer_note"] == "Please upload renewal application receipt to restore full score."

    finally:
        await db.organizations.delete_one({"id": cust_id})
        await db.supplier_relationships.delete_one({"id": rel_id})
        await db.supplier_questionnaires.delete_one({"id": qn_id})
        await db.supplier_questions.delete_many({"questionnaire_id": qn_id})
        await db.supplier_questionnaire_responses.delete_many({"supplier_relationship_id": rel_id})
