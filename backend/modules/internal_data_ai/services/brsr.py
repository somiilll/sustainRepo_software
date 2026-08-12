"""BRSR framework service for Internal Data AI."""
from shared.database.mongo import db

_FW_VARIANTS = ["brsr", "BRSR"]


def _period_values(period: object) -> list[str]:
    if not isinstance(period, dict) or period.get("type") != "financial_year":
        return []
    start = str(period.get("start_month", ""))[:4]
    end = str(period.get("end_month", ""))[:4]
    if not (start.isdigit() and end.isdigit()):
        return []
    return list({f"FY {start}-{end}", f"FY {start}-{end[-2:]}", f"FY {start}–{end[-2:]}", f"{start}-{end}", f"{start}-{end[-2:]}"})


async def get_responses(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    """Fetch BRSR filled values, submission statuses, and section progress."""
    section = kwargs.get("category") or ""
    keyword = kwargs.get("metric") or kwargs.get("entity_name") or ""

    # 1. Primary data — esg_responses (actual filled values, incl. Section A)
    resp_query = {"organization_id": org_id, "framework": {"$in": _FW_VARIANTS}}
    period_values = _period_values(kwargs.get("period"))
    if period_values:
        resp_query["$or"] = [{"reporting_year": {"$in": period_values}}, {"reporting_period": {"$in": period_values}}]
    if section:
        resp_query["section"] = {"$regex": section, "$options": "i"}
    if keyword:
        # Split keyword into words, match any in question_key (handles underscores vs spaces)
        words = [w for w in keyword.split() if len(w) > 2]
        if words:
            resp_query["question_key"] = {"$regex": ".*".join(words), "$options": "i"}

    filled = await db.esg_responses.find(resp_query, {"_id": 0}).sort("updated_at", -1).to_list(50)

    # 2. Submission statuses (Section B/C approval flow)
    sub_query = {"organization_id": org_id, "framework": {"$in": _FW_VARIANTS}}
    submissions = await db.esg_response_submissions.find(
        sub_query, {"_id": 0, "question_key": 1, "status": 1, "submitted_by_user_name": 1, "submitted_at": 1, "approved_by_user_name": 1, "approved_at": 1}
    ).to_list(100)
    sub_map = {s["question_key"]: s for s in submissions}

    # 3. Unified collection data (organization_esg_responses)
    unified = await db.organization_esg_responses.find(
        {"org_id": org_id, "framework": {"$in": _FW_VARIANTS}}, {"_id": 0}
    ).to_list(50)
    unified_map = {u["question_key"]: u for u in unified if u.get("question_key")}

    # Merge: filled values + submission status + unified data
    seen_keys = set()
    records = []
    for r in filled:
        key = r.get("question_key")
        seen_keys.add(key)
        sub = sub_map.get(key, {})
        records.append({
            "question_key": key,
            "section": r.get("section"),
            "reporting_period": r.get("reporting_year"),
            "value": r.get("value"),
            "approval_status": r.get("approval_status") or sub.get("status"),
            "submitted_by": sub.get("submitted_by_user_name"),
            "submitted_at": sub.get("submitted_at"),
        })

    # Add unified-only records not already seen
    for key, u in unified_map.items():
        if key not in seen_keys:
            sub = sub_map.get(key, {})
            records.append({
                "question_key": key,
                "section": u.get("section"),
                "value": u.get("value"),
                "approval_status": sub.get("status"),
            })

    # 4. Section-level progress
    section_pipeline = [
        {"$match": {"organization_id": org_id, "framework": {"$in": _FW_VARIANTS}}},
        {"$group": {
            "_id": "$section",
            "total": {"$sum": 1},
            "approved": {"$sum": {"$cond": [{"$eq": ["$approval_status", "approved"]}, 1, 0]}},
        }},
        {"$sort": {"_id": 1}},
    ]
    section_stats = await db.esg_responses.aggregate(section_pipeline).to_list(10)

    draft_count = await db.esg_response_drafts.count_documents(
        {"organization_id": org_id, "framework": {"$in": _FW_VARIANTS}}
    )
    brsr_questions = await db.esg_question_configs.count_documents({"framework": "brsr"})

    return {
        "framework": "BRSR",
        "total_questions_configured": brsr_questions,
        "total_filled": len(records),
        "drafts_pending": draft_count,
        "section_progress": [
            {"section": s["_id"], "filled": s["total"], "approved": s["approved"]}
            for s in section_stats
        ],
        "responses": records[:30],
        "period": (kwargs.get("period") or {}).get("label") if isinstance(kwargs.get("period"), dict) else None,
    }


async def get_version_history(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    """BRSR response version history."""
    question_key = kwargs.get("metric") or kwargs.get("entity_name") or ""

    source_query = {"organization_id": org_id, "framework": {"$in": _FW_VARIANTS}}
    if question_key:
        source_query["question_key"] = {"$regex": question_key, "$options": "i"}

    responses = await db.esg_responses.find(source_query, {"_id": 0, "id": 1, "question_key": 1}).to_list(1000)
    record_ids = [response["id"] for response in responses if response.get("id")]
    question_keys = [response["question_key"] for response in responses if response.get("question_key")]
    query = {"organization_id": org_id, "$or": [{"record_id": {"$in": record_ids}}, {"question_key": {"$in": question_keys}}]}

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
