"""Structured follow-up context stored alongside existing Internal AI conversations."""
import re
from typing import Optional

from modules.internal_data_ai.query_contracts import QueryEntity, QueryPeriod, StructuredQueryPlan


def context_from_plan(plan: StructuredQueryPlan) -> dict:
    """Persist only normalized, non-authoritative query context; never authorization data."""
    entity = plan.entity.model_dump() if plan.entity and plan.entity.canonical_value else None
    period = plan.period.model_dump() if plan.period.start_month else None
    return {
        "last_entity": entity,
        "last_period": period,
        "last_scope": plan.scope,
        "last_facility": plan.facility,
        "last_query_type": plan.query_type.value,
    }


def _is_follow_up(question: str, plan: StructuredQueryPlan) -> bool:
    text = question.lower().strip()
    contextual_phrases = ("for it", "for that", "for this", "what about", "same period", "same facility")
    if any(phrase in text for phrase in contextual_phrases):
        return True
    if re.search(r"\b(it|that|this|them)\b", text):
        return True
    return plan.entity is None and plan.period.start_month is None and plan.query_type.value in {
        "emission_lookup", "consumption_lookup", "methodology_lookup", "formula_lookup",
        "formula_version_history", "calculation_audit_lookup", "emission_factor_lookup",
    }


def apply_follow_up_context(plan: StructuredQueryPlan, question: str, context: Optional[dict]) -> StructuredQueryPlan:
    """Fill only omitted query dimensions when an explicit follow-up reference is present."""
    if not context or not _is_follow_up(question, plan):
        return plan

    updates = {}
    notes = list(plan.resolution_notes)
    if plan.entity is None and context.get("last_entity"):
        updates["entity"] = QueryEntity.model_validate(context["last_entity"])
        notes.append("Fuel entity inherited from the current session.")
    if plan.period.start_month is None and context.get("last_period"):
        updates["period"] = QueryPeriod.model_validate(context["last_period"])
        notes.append("Reporting period inherited from the current session.")
    if plan.scope is None and context.get("last_scope"):
        updates["scope"] = context["last_scope"]
    if plan.facility is None and context.get("last_facility"):
        updates["facility"] = context["last_facility"]
    if notes != plan.resolution_notes:
        updates["resolution_notes"] = notes
    return plan.model_copy(update=updates)


async def get_session_context(db, session_id: str, organization_id: str, user_id: str) -> Optional[dict]:
    """Read the latest context only from the same authenticated user's organization/session."""
    messages = await db.internal_ai_conversations.find(
        {
            "session_id": session_id,
            "organization_id": organization_id,
            "user_id": user_id,
            "context": {"$exists": True},
        },
        {"_id": 0, "context": 1},
    ).sort("created_at", -1).to_list(1)
    return messages[0].get("context") if messages else None