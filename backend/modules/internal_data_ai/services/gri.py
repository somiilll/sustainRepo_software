"""GRI framework service for Internal Data AI."""
import re

from modules.internal_data_ai.question_registry import (
    RESPONSE_CONFIGURED_NO_RESPONSE,
    RESPONSE_EMPTY,
    RESPONSE_FOUND,
    RESPONSE_MAPPING_NOT_FOUND,
    RESPONSE_NOT_CONFIGURED,
)
from shared.database.mongo import db

_FW_VARIANTS = ["gri", "GRI"]


def _framework_filter() -> dict:
    return {"$or": [{"framework": {"$in": _FW_VARIANTS}}, {"frameworks": {"$in": _FW_VARIANTS}}]}


def _period_values(period: object) -> list[str]:
    if not isinstance(period, dict) or period.get("type") != "financial_year":
        return []
    start = str(period.get("start_month", ""))[:4]
    end = str(period.get("end_month", ""))[:4]
    if not (start.isdigit() and end.isdigit()):
        return []
    return list({f"FY {start}-{end}", f"FY {start}-{end[-2:]}", f"FY {start}–{end[-2:]}", f"{start}-{end}", f"{start}-{end[-2:]}"})


def _question_key_filter(keyword: str) -> dict | None:
    normalized = (keyword or "").strip().lower()
    if not normalized:
        return None
    if re.fullmatch(r"gri_[a-z0-9_]+", normalized):
        return {"question_key": {"$regex": f"^{re.escape(normalized)}$", "$options": "i"}}
    words = [word for word in re.split(r"\s+", normalized) if len(word) > 2]
    if words:
        return {"question_key": {"$regex": ".*".join(re.escape(word) for word in words), "$options": "i"}}
    return None


def _response_state(target_key: str, configured_count: int, records: list[dict]) -> str:
    if not target_key:
        return RESPONSE_FOUND if records else RESPONSE_CONFIGURED_NO_RESPONSE if configured_count else RESPONSE_NOT_CONFIGURED
    matching = [record for record in records if record.get("question_key", "").lower() == target_key.lower()]
    if matching:
        return RESPONSE_FOUND if any(record.get("value") not in (None, "", [], {}) for record in matching) else RESPONSE_EMPTY
    return RESPONSE_CONFIGURED_NO_RESPONSE if configured_count else RESPONSE_NOT_CONFIGURED


async def get_responses(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    """Fetch GRI answers with exact-key support for registered disclosures."""
    section = kwargs.get("category") or ""
    target_key = kwargs.get("framework_question_key") or kwargs.get("metric") or kwargs.get("entity_name") or ""
    period_values = _period_values(kwargs.get("period"))
    question_filter = _question_key_filter(target_key)
    common_filters = [_framework_filter()]
    if section:
        common_filters.append({"section": {"$regex": f"^{re.escape(section)}$", "$options": "i"}})
    if period_values:
        common_filters.append({"$or": [{"reporting_year": {"$in": period_values}}, {"reporting_period": {"$in": period_values}}]})
    if question_filter:
        common_filters.append(question_filter)

    response_query = {"$and": [{"organization_id": org_id}, *common_filters]}
    filled = await db.esg_responses.find(response_query, {"_id": 0}).sort("updated_at", -1).to_list(1000)
    submission_query = {"$and": [{"organization_id": org_id}, *common_filters]}
    submissions = await db.esg_response_submissions.find(
        submission_query,
        {"_id": 0, "question_key": 1, "reporting_year": 1, "reporting_period": 1, "status": 1},
    ).to_list(1000)
    submission_map = {
        (item.get("question_key"), item.get("reporting_year") or item.get("reporting_period")): item
        for item in submissions if item.get("question_key")
    }

    unified_query = {"$and": [{"$or": [{"org_id": org_id}, {"organization_id": org_id}]}, *common_filters]}
    unified = await db.organization_esg_responses.find(unified_query, {"_id": 0}).sort("updated_at", -1).to_list(1000)

    records = []
    seen = set()
    for record in filled + unified:
        key = record.get("question_key")
        period = record.get("reporting_year") or record.get("reporting_period")
        if not key or record.get("value") in (None, "", [], {}):
            continue
        identity = (key, period)
        if identity in seen:
            continue
        seen.add(identity)
        submission = submission_map.get(identity, {})
        records.append({
            "question_key": key,
            "section": record.get("section"),
            "reporting_period": period,
            "value": record.get("value"),
            "approval_status": record.get("approval_status") or submission.get("status"),
        })

    config_question_filter = question_filter
    if re.fullmatch(r"gri_[a-z0-9_]+", target_key.lower()):
        parent_key = target_key.rsplit("_", 1)[0]
        config_question_filter = {"question_key": {"$in": [target_key, parent_key]}}
    config_filters = [_framework_filter()]
    if section:
        config_filters.append({"section": {"$regex": f"^{re.escape(section)}$", "$options": "i"}})
    if config_question_filter:
        config_filters.append(config_question_filter)
    configured_count = await db.esg_question_configs.count_documents({"$and": config_filters})

    return {
        "framework": "GRI",
        "total_questions_configured": configured_count,
        "total_filled": len(records),
        "drafts_pending": 0,
        "section_progress": [],
        "responses": records[:30],
        "period": (kwargs.get("period") or {}).get("label") if isinstance(kwargs.get("period"), dict) else None,
        "response_state": _response_state(target_key, configured_count, records),
        "framework_question_key": kwargs.get("framework_question_key"),
        "framework_source_path": kwargs.get("framework_source_path"),
        "framework_display_label": kwargs.get("framework_display_label"),
    }


async def get_version_history(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    """GRI response version history."""
    question_key = kwargs.get("metric") or kwargs.get("entity_name") or ""
    source_query = {"organization_id": org_id, "framework": {"$in": _FW_VARIANTS}}
    if question_key:
        source_query["question_key"] = {"$regex": question_key, "$options": "i"}

    responses = await db.esg_responses.find(source_query, {"_id": 0, "id": 1, "question_key": 1}).to_list(1000)
    record_ids = [response["id"] for response in responses if response.get("id")]
    question_keys = [response["question_key"] for response in responses if response.get("question_key")]
    query = {"organization_id": org_id, "$or": [{"record_id": {"$in": record_ids}}, {"question_key": {"$in": question_keys}}]}

    versions = await db.esg_responses_versions.find(query, {"_id": 0}).sort("created_at", -1).to_list(30)
    return {
        "total": len(versions),
        "history": [
            {
                "question_key": version.get("question_key"),
                "version": version.get("version"),
                "change_type": version.get("change_type"),
                "changed_fields": version.get("changed_fields"),
                "change_reason": version.get("change_reason"),
                "changed_by": version.get("created_by"),
                "changed_at": version.get("created_at"),
            }
            for version in versions
        ],
    }