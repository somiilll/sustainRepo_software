"""GRI framework service for Internal Data AI."""
from shared.database.mongo import db


async def get_responses(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    """Fetch GRI disclosure responses, submissions, and section progress."""
    section = kwargs.get("record_type") or kwargs.get("category") or ""
    question_key = kwargs.get("metric") or kwargs.get("entity_name") or ""

    sub_query = {"organization_id": org_id, "framework": "GRI"}
    if section:
        sub_query["section"] = {"$regex": section, "$options": "i"}
    if question_key:
        sub_query["$or"] = [
            {"question_key": {"$regex": question_key, "$options": "i"}},
        ]

    submissions = await db.esg_response_submissions.find(
        sub_query, {"_id": 0}
    ).sort("submitted_at", -1).to_list(30)

    records = []
    for s in submissions:
        records.append({
            "question_key": s.get("question_key"),
            "section": s.get("section"),
            "reporting_period": s.get("reporting_period"),
            "value": s.get("final_value") or s.get("value"),
            "status": s.get("status"),
            "submitted_by": s.get("submitted_by_user_name"),
            "submitted_at": s.get("submitted_at"),
            "approved_by": s.get("approved_by_user_name"),
            "approved_at": s.get("approved_at"),
        })

    section_pipeline = [
        {"$match": {"organization_id": org_id, "framework": "GRI"}},
        {"$group": {
            "_id": "$section",
            "total": {"$sum": 1},
            "approved": {"$sum": {"$cond": [{"$eq": ["$status", "approved"]}, 1, 0]}},
            "pending": {"$sum": {"$cond": [{"$eq": ["$status", "pending"]}, 1, 0]}},
            "rejected": {"$sum": {"$cond": [{"$eq": ["$status", "rejected"]}, 1, 0]}},
        }},
        {"$sort": {"_id": 1}},
    ]
    section_stats = await db.esg_response_submissions.aggregate(section_pipeline).to_list(20)

    draft_count = await db.esg_response_drafts.count_documents(
        {"organization_id": org_id, "framework": "gri"}
    )

    gri_questions = await db.esg_question_configs.count_documents({"framework": "gri"})

    return {
        "framework": "GRI",
        "total_questions_configured": gri_questions,
        "total_submissions": len(submissions),
        "drafts_pending": draft_count,
        "section_progress": [
            {
                "section": s["_id"],
                "total_submitted": s["total"],
                "approved": s["approved"],
                "pending_approval": s["pending"],
                "rejected": s["rejected"],
            }
            for s in section_stats
        ],
        "responses": records[:20],
    }


async def get_version_history(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    """GRI response version history."""
    question_key = kwargs.get("metric") or kwargs.get("entity_name") or ""

    query = {"framework": "gri"}
    if question_key:
        query["question_key"] = {"$regex": question_key, "$options": "i"}

    versions = await db.esg_responses_versions.find(
        query, {"_id": 0}
    ).sort("created_at", -1).to_list(30)

    return {
        "total": len(versions),
        "history": [
            {
                "question_key": v.get("question_key"),
                "version": v.get("version"),
                "change_type": v.get("change_type"),
                "changed_fields": v.get("changed_fields"),
                "change_reason": v.get("change_reason"),
                "changed_by": v.get("created_by"),
                "changed_at": v.get("created_at"),
            }
            for v in versions
        ],
    }
