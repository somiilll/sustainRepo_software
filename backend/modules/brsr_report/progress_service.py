"""Per-section BRSR question status and progress counts."""
from typing import Any, Dict

from shared.database.mongo import db
from modules.esg_questionnaire.service import esg_questionnaire_service
from .live_kpi_autofill import _has_reportable_value

SECTIONS = ("section_a", "section_b", "section_c")
STATUSES = ("pending", "saved", "approved", "rejected")


def question_status(doc: Dict[str, Any]) -> str:
    if not doc:
        return "pending"
    approval = doc.get("approval_status")
    if approval in ("approved", "rejected"):
        return approval
    saved = doc.get("status") == "saved" or approval == "pending_approval"
    return "saved" if saved and _has_reportable_value(doc.get("value")) else "pending"


async def brsr_progress(org_id: str, reporting_period: str) -> Dict[str, Any]:
    configs = await db.esg_question_configs.find(
        {"frameworks": {"$in": ["BRSR", "brsr"]}, "section": {"$in": list(SECTIONS)}, "hidden": {"$ne": True}},
        {"_id": 0, "question_key": 1, "section": 1},
    ).to_list(1000)
    docs = await db.organization_esg_responses.find(
        {"org_id": org_id, "reporting_year": reporting_period, "framework": {"$in": ["BRSR", "brsr"]}},
        {"_id": 0, "question_key": 1, "status": 1, "approval_status": 1, "value": 1},
    ).to_list(2000)
    by_key = {doc["question_key"]: doc for doc in docs if doc.get("question_key")}

    sections: Dict[str, Any] = {s: {"questions": {}, "counts": {k: 0 for k in STATUSES}} for s in SECTIONS}
    for config in configs:
        status = question_status(by_key.get(config["question_key"]))
        section = sections[config["section"]]
        section["questions"][config["question_key"]] = status
        section["counts"][status] += 1
    for section in sections.values():
        counts = section["counts"]
        total = len(section["questions"])
        answered = counts["saved"] + counts["approved"]
        section.update({
            "total": total, "answered": answered,
            "percent": round(answered / total * 100) if total else 0,
        })
    has_approval_states = any(
        doc.get("approval_status") in ("approved", "rejected", "pending_approval") for doc in by_key.values()
    )
    approval_enabled = has_approval_states or await esg_questionnaire_service._has_approval_workflow_enabled(org_id)
    return {"reporting_period": reporting_period, "approval_enabled": approval_enabled, "sections": sections}
