"""
Planner — Maps detected intent to service calls.
No LLM involved — pure logic routing.
"""
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


def plan_service_calls(intent_result: dict) -> List[Dict[str, Any]]:
    """Convert intent + entities into ordered service call plan."""
    intent = intent_result.get("intent", "summary")
    entities = intent_result.get("entities", {})

    plan = []

    if intent == "record_lookup":
        record_type = entities.get("record_type") or "emission"
        if record_type == "emission":
            plan.append({"service": "emissions", "method": "search_records", "params": entities})
        else:
            plan.append({"service": "esg_records", "method": "search_records", "params": {**entities, "section": record_type}})

    elif intent == "emission_factor":
        plan.append({"service": "emission_factors", "method": "lookup", "params": entities})

    elif intent == "formula_calculation":
        plan.append({"service": "formulas", "method": "explain", "params": entities})

    elif intent == "approval_history":
        plan.append({"service": "approvals", "method": "get_history", "params": entities})

    elif intent == "assignment_history":
        plan.append({"service": "assignments", "method": "get_history", "params": entities})

    elif intent == "version_history":
        plan.append({"service": "history", "method": "get_changes", "params": entities})

    elif intent == "audit_trail":
        plan.append({"service": "audit", "method": "get_logs", "params": entities})

    elif intent == "evidence_retrieval":
        plan.append({"service": "evidence", "method": "find_files", "params": entities})

    elif intent == "analytics":
        plan.append({"service": "analytics", "method": "query", "params": entities})

    elif intent == "target_progress":
        plan.append({"service": "targets", "method": "get_progress", "params": entities})

    elif intent == "organization_info":
        plan.append({"service": "organization", "method": "get_info", "params": entities})

    elif intent == "kpi_lookup":
        plan.append({"service": "esg_records", "method": "get_kpis", "params": entities})

    elif intent == "summary":
        plan.append({"service": "analytics", "method": "summary", "params": entities})

    elif intent == "list_query":
        plan.append({"service": "analytics", "method": "list_items", "params": entities})

    elif intent == "count_query":
        plan.append({"service": "analytics", "method": "count_items", "params": entities})

    else:
        plan.append({"service": "analytics", "method": "summary", "params": entities})

    return plan
