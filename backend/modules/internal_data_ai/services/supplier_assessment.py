"""Supplier Assessment service for Internal Data AI."""
from shared.database.mongo import db


async def get_data(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    """Fetch supplier assessment questionnaires, scores, and rankings."""
    entity_name = kwargs.get("entity_name") or ""

    # 1. Active questionnaires created by this org
    q_query = {"organization_id": org_id}
    questionnaires = await db.supplier_questionnaires.find(q_query, {"_id": 0}).to_list(10)

    q_summaries = []
    for q in questionnaires:
        q_summaries.append({
            "id": q.get("id"),
            "name": q.get("name"),
            "description": q.get("description"),
            "question_count": q.get("question_count"),
            "is_active": q.get("is_active"),
            "esg_section_weights": q.get("esg_section_weights"),
            "overall_supplier_weights": q.get("overall_supplier_weights"),
        })

    # 2. Supplier relationships & scores
    rel_query = {"customer_org_id": org_id}
    if entity_name:
        rel_query["company_name"] = {"$regex": entity_name, "$options": "i"}
    relationships = await db.supplier_relationships.find(rel_query, {"_id": 0}).to_list(50)

    suppliers = []
    for r in relationships:
        suppliers.append({
            "company_name": r.get("company_name"),
            "contact_person": r.get("contact_person"),
            "contact_email": r.get("contact_email"),
            "invitation_status": r.get("invitation_status"),
            "esg_score": r.get("esg_score"),
            "ghg_score": r.get("ghg_score"),
            "overall_score": r.get("overall_score"),
            "esg_completion_percent": r.get("esg_completion_percent"),
            "ghg_completion_percent": r.get("ghg_completion_percent"),
        })

    # 3. Assessment responses with scores
    questionnaire_ids = [q.get("id") for q in questionnaires if q.get("id")]
    responses = await db.supplier_questionnaire_responses.find(
        {"questionnaire_id": {"$in": questionnaire_ids}},
        {"_id": 0, "answers": 0},
    ).to_list(50)

    scored_responses = []
    for resp in responses:
        # Map supplier org to name
        rel = next((r for r in relationships if r.get("supplier_org_id") == resp.get("supplier_org_id")), None)
        scored_responses.append({
            "supplier": rel.get("company_name") if rel else resp.get("supplier_org_id"),
            "status": resp.get("status"),
            "calculated_score": resp.get("calculated_score"),
            "score_breakdown": resp.get("score_breakdown"),
            "submitted_at": resp.get("submitted_at"),
        })

    # 4. Questions overview
    q_ids = questionnaire_ids
    questions = await db.supplier_questions.find(
        {"questionnaire_id": {"$in": q_ids}},
        {"_id": 0, "id": 1, "question_text": 1, "esg_section": 1, "scoring": 1},
    ).to_list(100)

    return {
        "questionnaires": q_summaries,
        "total_suppliers": len(suppliers),
        "suppliers": suppliers,
        "assessment_responses": scored_responses,
        "questions_overview": [
            {
                "question": q.get("question_text"),
                "esg_section": q.get("esg_section"),
                "scoring_rule": q.get("scoring", {}).get("rule"),
                "max_score": q.get("scoring", {}).get("max_score"),
            }
            for q in questions
        ],
    }
