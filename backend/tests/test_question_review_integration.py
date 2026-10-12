import pytest
import uuid
from datetime import datetime, timezone
from shared.database.mongo import db
from modules.supplier_assessment.service import supplier_service
from modules.supplier_assessment.questionnaire_service import normalize_questionnaire_reporting_period

@pytest.mark.asyncio
async def test_per_question_review_lifecycle():
    customer_org_id = f"test-cust-{uuid.uuid4().hex[:8]}"
    supplier_org_id = f"test-supp-{uuid.uuid4().hex[:8]}"
    rel_id = f"rel-{uuid.uuid4().hex[:8]}"
    user_id = f"user-{uuid.uuid4().hex[:8]}"
    reviewer_id = f"rev-{uuid.uuid4().hex[:8]}"
    q_id = f"q-{uuid.uuid4().hex[:8]}"
    questionnaire_id = f"qn-{uuid.uuid4().hex[:8]}"
    reporting_period = "FY 2026-2027"

    # Setup database documents
    await db.organizations.insert_one({
        "id": customer_org_id,
        "name": "Acme Corp",
        "organization_name": "Acme Corp",
    })
    await db.supplier_relationships.insert_one({
        "id": rel_id,
        "customer_org_id": customer_org_id,
        "supplier_org_id": supplier_org_id,
        "reporting_period": reporting_period,
        "questionnaire_ids": [questionnaire_id],
        "contact_email": "supplier@test.com",
        "contact_person": "Supplier Contact",
        "company_name": "Test Supplier Co",
        "is_active": True,
    })
    await db.supplier_questionnaires.insert_one({
        "id": questionnaire_id,
        "name": "ESG Annual Test",
        "organization_id": customer_org_id,
        "reporting_periods": [reporting_period],
        "is_active": True,
        "esg_weights": {"environment": 100.0, "social": 0.0, "governance": 0.0},
        "overall_weights": {"esg": 100.0, "ghg": 0.0, "revenue": 0.0},
        "esg_subcategories": {
            "environment": [{"code": "general", "name": "General", "weight": 100.0, "enabled": True}],
            "social": [],
            "governance": [],
        },
    })
    await db.supplier_questions.insert_one({
        "id": q_id,
        "questionnaire_id": questionnaire_id,
        "question_text": "Do you track carbon emissions?",
        "section": "environment",
        "question_category": "general",
        "category": "environment",
        "response_type": "yes_no",
        "assessment_type": "type_b",
        "max_points": 10.0,
        "point_scores": {"yes_score": 10.0, "no_score": 0.0},
        "scoring": {"rule": "boolean", "true_score": 100, "false_score": 0},
        "is_active": True,
    })

    try:
        # 1. Supplier submits answer
        submit_res = await supplier_service.submit_supplier_answers(
            questionnaire_id=questionnaire_id,
            supplier_relationship_id=rel_id,
            supplier_org_id=supplier_org_id,
            answers=[{"question_id": q_id, "answer": True}],
            is_draft=False,
            data_verified=True,
            verified_by=user_id,
        )
        assert submit_res["status"] == "submitted"

        # Check per-question timestamps
        resp = await db.supplier_questionnaire_responses.find_one(
            {"questionnaire_id": questionnaire_id, "supplier_relationship_id": rel_id},
            {"_id": 0}
        )
        assert resp is not None
        assert q_id in resp.get("question_timestamps", {})
        assert resp["question_timestamps"][q_id].get("submitted_at") is not None
        assert resp["question_timestamps"][q_id].get("created_at") is not None

        # 2. Parent reviews: Rejects with resubmission (Clarification Requested)
        review_res = await supplier_service.review_supplier_question_response(
            supplier_relationship_id=rel_id,
            questionnaire_id=questionnaire_id,
            question_id=q_id,
            decision={
                "status": "rejected",
                "needs_resubmission": True,
                "reviewer_note": "Please attach certification document.",
            },
            reviewer_id=reviewer_id,
        )
        assert review_res["review"]["status"] == "rejected"
        assert review_res["review"]["needs_resubmission"] is True
        assert review_res["review"]["unlocked_for_supplier"] is True

        # Check questionnaire fetched for supplier exposes unlock
        q_for_supp = await supplier_service.get_questionnaire_for_supplier(questionnaire_id, rel_id)
        assert q_for_supp["has_unlocked_questions"] is True
        assert q_id in q_for_supp["unlocked_question_ids"]
        question_item = next(q for q in q_for_supp["questions"] if q["id"] == q_id)
        assert question_item["is_unlocked_for_edit"] is True
        assert question_item["review"]["reviewer_note"] == "Please attach certification document."

        # 3. A clarification draft must not reopen the whole questionnaire.
        draft_res = await supplier_service.submit_supplier_answers(
            questionnaire_id=questionnaire_id,
            supplier_relationship_id=rel_id,
            supplier_org_id=supplier_org_id,
            answers=[{"question_id": q_id, "answer": True, "clarification_reply": "I am preparing the certification evidence."}],
            is_draft=True,
            data_verified=False,
        )
        assert draft_res["status"] == "submitted"
        draft_response = await db.supplier_questionnaire_responses.find_one(
            {"questionnaire_id": questionnaire_id, "supplier_relationship_id": rel_id},
            {"_id": 0},
        )
        assert draft_response["status"] == "submitted"
        assert draft_response["has_unlocked_questions"] is True
        assert q_id in draft_response["unlocked_question_ids"]

        # Parent review list should continue to show this submitted response
        # while supplier is only saving clarification drafts.
        parent_submissions_after_draft = await supplier_service.get_questionnaire_submissions_for_admin(
            customer_org_id=customer_org_id,
            questionnaire_id=questionnaire_id,
            reporting_period=reporting_period,
        )
        assert parent_submissions_after_draft is not None
        assert any(
            item.get("supplier_id") == rel_id
            for item in parent_submissions_after_draft.get("submissions", [])
        )

        # 4. Supplier resubmits only unlocked question
        resubmit_res = await supplier_service.submit_supplier_answers(
            questionnaire_id=questionnaire_id,
            supplier_relationship_id=rel_id,
            supplier_org_id=supplier_org_id,
            answers=[{"question_id": q_id, "answer": True, "clarification_reply": "Certification document attached for your review."}],
            is_draft=False,
            data_verified=True,
            verified_by=user_id,
        )
        assert resubmit_res["status"] == "submitted"

        # Check that question is locked again
        resp_after = await db.supplier_questionnaire_responses.find_one(
            {"questionnaire_id": questionnaire_id, "supplier_relationship_id": rel_id},
            {"_id": 0}
        )
        assert resp_after["has_unlocked_questions"] is False
        assert q_id not in resp_after.get("unlocked_question_ids", [])
        assert resp_after["question_reviews"][q_id]["unlocked_for_supplier"] is False
        assert resp_after["question_reviews"][q_id].get("resubmitted_at") is not None

        # After explicit clarification resubmission, supplier should still
        # be discoverable in parent review submissions.
        parent_submissions_after_resubmit = await supplier_service.get_questionnaire_submissions_for_admin(
            customer_org_id=customer_org_id,
            questionnaire_id=questionnaire_id,
            reporting_period=reporting_period,
        )
        assert parent_submissions_after_resubmit is not None
        assert any(
            item.get("supplier_id") == rel_id
            for item in parent_submissions_after_resubmit.get("submissions", [])
        )

        # 5. Parent reviews again: Rejects without resubmission with approved score 3.0 and rationale
        review_final = await supplier_service.review_supplier_question_response(
            supplier_relationship_id=rel_id,
            questionnaire_id=questionnaire_id,
            question_id=q_id,
            decision={
                "status": "rejected",
                "needs_resubmission": False,
                "reviewer_score": 3.0,
                "reviewer_note": "Partial credit awarded based on self-declaration.",
            },
            reviewer_id=reviewer_id,
        )
        assert review_final["review"]["status"] == "rejected"
        assert review_final["review"]["reviewer_score"] == 3.0
        # Check calculated ESG score reflects 3.0 / 10.0 = 30.0%
        assert round(review_final["calculated_score"], 1) == 30.0
        # Check overall supplier score with esg weight 100% = 30.0%
        assert round(review_final["overall_score"], 1) == 30.0

        # Check audit trail history retains the clarification request, supplier resubmission, and final review.
        resp_final = await db.supplier_questionnaire_responses.find_one(
            {"questionnaire_id": questionnaire_id, "supplier_relationship_id": rel_id},
            {"_id": 0}
        )
        history = resp_final.get("review_history", [])
        assert len(history) == 3
        assert any(entry.get("event") == "supplier_clarification_resubmitted" for entry in history)

    finally:
        # Cleanup test records
        await db.organizations.delete_one({"id": customer_org_id})
        await db.supplier_relationships.delete_one({"id": rel_id})
        await db.supplier_questionnaires.delete_one({"id": questionnaire_id})
        await db.supplier_questions.delete_many({"questionnaire_id": questionnaire_id})
        await db.supplier_questionnaire_responses.delete_many({"supplier_relationship_id": rel_id})
