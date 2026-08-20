"""BRSR framework service for Internal Data AI."""
import re

from modules.internal_data_ai.question_registry import (
    RESPONSE_CONFIGURED_NO_RESPONSE,
    RESPONSE_EMPTY,
    RESPONSE_FOUND,
    RESPONSE_MAPPING_NOT_FOUND,
    RESPONSE_NOT_CONFIGURED,
)
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


def _framework_filter() -> dict:
    return {"$or": [{"framework": {"$in": _FW_VARIANTS}}, {"frameworks": {"$in": _FW_VARIANTS}}]}


def _period_filter(period_values: list[str]) -> dict:
    return {"$or": [{"reporting_year": {"$in": period_values}}, {"reporting_period": {"$in": period_values}}]}


def _section_filter(section: str) -> dict:
    return {"section": {"$regex": f"^{re.escape(section)}$", "$options": "i"}}


def _question_key_filter(keyword: str) -> dict | None:
    normalized = (keyword or "").strip().lower()
    if not normalized:
        return None
    if re.fullmatch(r"p[1-9]", normalized):
        return {"question_key": {"$regex": f"^{re.escape(normalized)}_", "$options": "i"}}
    if re.fullmatch(r"p[1-9](?:_[a-z0-9]+)+", normalized):
        return {"question_key": {"$regex": f"^{re.escape(normalized)}$", "$options": "i"}}
    words = [word for word in re.split(r"\s+", normalized) if len(word) > 2]
    if words:
        return {"question_key": {"$regex": ".*".join(re.escape(word) for word in words), "$options": "i"}}
    return None


def _is_filled(record: dict) -> bool:
    return record.get("value") not in (None, "", [], {})


def _determine_response_state(
    question_key: str,
    configured_count: int,
    filled_records: list,
    framework_question_key: str = None,
) -> str:
    """Determine the standardized response state for a BRSR question lookup.

    States:
      FOUND — response exists and is non-empty
      RESPONSE_EMPTY — response exists but value is empty/null
      CONFIGURED_NO_RESPONSE — question is configured but no response submitted
      NOT_CONFIGURED — question does not exist in configuration
      MAPPING_NOT_FOUND — question likely exists but resolver couldn't map
    """
    target_key = framework_question_key or question_key
    if not target_key:
        # Broad query (no specific key) — use aggregate state
        if filled_records:
            return RESPONSE_FOUND
        if configured_count:
            return RESPONSE_CONFIGURED_NO_RESPONSE
        return RESPONSE_NOT_CONFIGURED

    # Specific question key requested
    matching = [r for r in filled_records if r.get("question_key") == target_key]
    if matching:
        has_value = any(r.get("value") not in (None, "", [], {}) for r in matching)
        return RESPONSE_FOUND if has_value else RESPONSE_EMPTY
    if configured_count > 0:
        return RESPONSE_CONFIGURED_NO_RESPONSE
    return RESPONSE_NOT_CONFIGURED


async def get_responses(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    """Fetch BRSR filled values, submission statuses, and section progress."""
    section = kwargs.get("category") or ""
    keyword = kwargs.get("metric") or kwargs.get("entity_name") or ""

    # 1. Primary data — esg_responses (actual filled values, incl. Section A)
    period_values = _period_values(kwargs.get("period"))
    question_filter = _question_key_filter(keyword)
    common_filters = [_framework_filter()]
    if period_values:
        common_filters.append(_period_filter(period_values))
    if section:
        common_filters.append(_section_filter(section))
    if question_filter:
        common_filters.append(question_filter)

    resp_query = {"$and": [{"organization_id": org_id}, *common_filters]}

    filled = await db.esg_responses.find(resp_query, {"_id": 0}).sort("updated_at", -1).to_list(1000)

    # 2. Submission statuses (Section B/C approval flow)
    sub_query = {"$and": [{"organization_id": org_id}, *common_filters]}
    submissions = await db.esg_response_submissions.find(
        sub_query, {"_id": 0, "question_key": 1, "reporting_year": 1, "reporting_period": 1, "status": 1, "submitted_by_user_name": 1, "submitted_at": 1, "approved_by_user_name": 1, "approved_at": 1}
    ).to_list(100)
    sub_map = {
        (s.get("question_key"), s.get("reporting_year") or s.get("reporting_period")): s
        for s in submissions if s.get("question_key")
    }

    # 3. Unified collection data (organization_esg_responses)
    unified = await db.organization_esg_responses.find(
        {"$and": [{"$or": [{"org_id": org_id}, {"organization_id": org_id}]}, *common_filters]}, {"_id": 0}
    ).to_list(1000)
    unified_map = {
        (u.get("question_key"), u.get("reporting_year") or u.get("reporting_period")): u
        for u in unified if u.get("question_key") and _is_filled(u)
    }

    # Merge: filled values + submission status + unified data
    seen_keys = set()
    records = []
    for r in filled:
        key = r.get("question_key")
        reporting_period = r.get("reporting_year") or r.get("reporting_period")
        if not key or not _is_filled(r):
            continue
        identity = (key, reporting_period)
        seen_keys.add(identity)
        sub = sub_map.get(identity, {})
        records.append({
            "question_key": key,
            "section": r.get("section"),
            "reporting_period": reporting_period,
            "value": r.get("value"),
            "approval_status": r.get("approval_status") or sub.get("status"),
            "submitted_by": sub.get("submitted_by_user_name"),
            "submitted_at": sub.get("submitted_at"),
        })

    # Add unified-only records not already seen
    for (key, reporting_period), u in unified_map.items():
        if (key, reporting_period) not in seen_keys:
            sub = sub_map.get((key, reporting_period), {})
            records.append({
                "question_key": key,
                "section": u.get("section"),
                "reporting_period": reporting_period,
                "value": u.get("value"),
                "approval_status": sub.get("status"),
            })

    # 4. Section-level progress
    section_pipeline = [
        {"$match": resp_query},
        {"$group": {
            "_id": "$section",
            "total": {"$sum": 1},
            "approved": {"$sum": {"$cond": [{"$eq": ["$approval_status", "approved"]}, 1, 0]}},
        }},
        {"$sort": {"_id": 1}},
    ]
    section_stats = await db.esg_responses.aggregate(section_pipeline).to_list(10)

    draft_count = await db.esg_response_drafts.count_documents({"$and": [{"organization_id": org_id}, *common_filters]})
    brsr_questions = await db.esg_question_configs.count_documents({"$and": [_framework_filter(), *([_section_filter(section)] if section else []), *([question_filter] if question_filter else [])]})

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
        "response_state": _determine_response_state(
            question_key=keyword,
            configured_count=brsr_questions,
            filled_records=records,
            framework_question_key=kwargs.get("framework_question_key"),
        ),
        "framework_question_key": kwargs.get("framework_question_key"),
        "framework_source_path": kwargs.get("framework_source_path"),
    }


async def get_version_history(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    """BRSR response version history."""
    question_key = kwargs.get("metric") or kwargs.get("entity_name") or ""

    source_filters = [
        {"$or": [{"org_id": org_id}, {"organization_id": org_id}]},
        _framework_filter(),
    ]
    period_values = _period_values(kwargs.get("period"))
    if period_values:
        source_filters.append(_period_filter(period_values))
    if question_key:
        source_filters.append(_question_key_filter(question_key) or {})
    source_query = {"$and": source_filters}

    responses = await db.organization_esg_responses.find(
        source_query, {"_id": 0, "id": 1, "question_key": 1}
    ).to_list(1000)
    record_ids = [response["id"] for response in responses if response.get("id")]
    question_keys = [response["question_key"] for response in responses if response.get("question_key")]
    version_record_ids = list(set(record_ids + question_keys))
    version_filters = [
        {"organization_id": org_id},
        {"$or": [{"record_id": {"$in": version_record_ids}}, {"question_key": {"$in": question_keys}}]},
    ]
    if period_values:
        version_filters.append({
            "$or": [
                {"reporting_year": {"$in": period_values}},
                {"snapshot.reporting_year": {"$in": period_values}},
            ]
        })
    query = {"$and": version_filters}

    versions = await db.esg_responses_versions.find(
        query, {"_id": 0}
    ).sort("created_at", -1).to_list(30)

    return {
        "total": len(versions),
        "history": [
            {
                "question_key": v.get("question_key") or v.get("record_id"),
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
