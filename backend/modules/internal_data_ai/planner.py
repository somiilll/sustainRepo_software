"""
Planner — Maps detected intent to service calls.
No LLM involved — pure logic routing.
"""
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


def _has_operational_data_dimension(entities: dict) -> bool:
    """Return True when extracted entities contain operational/emissions data dimensions.

    This is entity-driven and requires no hardcoded fuel/activity names — any
    non-empty value in a recognised data-dimension field is sufficient.
    """
    return any([
        entities.get("fuel_type"),
        entities.get("scope"),
        entities.get("category"),
        entities.get("facility"),
    ])


def plan_service_calls(intent_result: dict) -> List[Dict[str, Any]]:
    """Convert intent + entities into ordered service call plan."""
    intent = intent_result.get("intent", "summary")
    entities = intent_result.get("entities", {})

    plan = []
    logger.info(
        "plan_service_calls — intent=%s entities=%s",
        intent, {k: v for k, v in entities.items() if v is not None},
    )

    if intent == "record_lookup":
        record_type = entities.get("record_type") or "emission"
        if record_type == "emission":
            plan.append({"service": "emissions", "method": "search_records", "params": entities})
        else:
            plan.append({"service": "esg_records", "method": "search_records", "params": {**entities, "section": record_type}})

    elif intent == "emission_factor":
        plan.append({"service": "emission_factors", "method": "lookup", "params": entities})

    elif intent == "formula_calculation":
        plan.append({"service": "emissions", "method": "search_records", "params": entities})
        plan.append({"service": "formulas", "method": "explain", "params": entities})

    elif intent == "approval_history":
        plan.append({"service": "approvals", "method": "get_history", "params": entities})

    elif intent == "assignment_history":
        plan.append({"service": "assignments", "method": "get_history", "params": entities})

    elif intent == "version_history":
        plan.append({"service": "history", "method": "get_changes", "params": entities})
        plan.append({"service": "history", "method": "get_framework_versions", "params": entities})

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
        record_type = (entities.get("record_type") or "").lower()
        metric = (entities.get("metric") or entities.get("entity_name") or "").lower()
        has_data_dim = _has_operational_data_dimension(entities)
        is_emission_metric = (
            record_type == "emission"
            or has_data_dim
            or "emission" in metric
            or "ghg" in metric
            or "consumed" in metric
            or "consumption" in metric
        )
        logger.info(
            "kpi_lookup routing — record_type=%s metric=%s has_data_dim=%s "
            "is_emission_metric=%s entities=%s",
            record_type, metric, has_data_dim, is_emission_metric, entities,
        )
        if is_emission_metric:
            if entities.get("fuel_type"):
                plan.append({"service": "emissions", "method": "search_records", "params": entities})
            else:
                plan.append({"service": "analytics", "method": "query", "params": entities})
        else:
            plan.append({"service": "esg_records", "method": "get_kpis", "params": entities})

    elif intent == "summary":
        plan.append({"service": "analytics", "method": "summary", "params": entities})

    elif intent == "list_query":
        plan.append({"service": "analytics", "method": "list_items", "params": entities})

    elif intent == "count_query":
        plan.append({"service": "analytics", "method": "count_items", "params": entities})

    elif intent == "brsr_lookup":
        plan.append({"service": "brsr", "method": "get_responses", "params": entities})

    elif intent == "gri_lookup":
        plan.append({"service": "gri", "method": "get_responses", "params": entities})

    elif intent == "supplier_assessment":
        plan.append({"service": "supplier_assessment", "method": "get_data", "params": entities})

    elif intent == "data_status":
        plan.append({"service": "data_status", "method": "get_status", "params": entities})

    else:
        plan.append({"service": "analytics", "method": "summary", "params": entities})

    logger.info("plan_service_calls — selected_pipeline=%s", plan)
    return plan
