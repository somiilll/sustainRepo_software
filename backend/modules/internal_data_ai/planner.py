"""
Planner — Maps detected intent to service calls.
No LLM involved — pure logic routing.
"""
import logging
from typing import List, Dict, Any

from modules.internal_data_ai.query_contracts import QueryType, StructuredQueryPlan

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


def _plan_structured_query(query_plan: StructuredQueryPlan) -> List[Dict[str, Any]]:
    """Map validated query types to fixed service routes; no model-provided route is executed."""
    if query_plan.entity and query_plan.entity.type == "fuel" and not query_plan.entity.canonical_value and query_plan.query_type != QueryType.FUEL_ENERGY_LOOKUP:
        return [{
            "service": "evidence_state",
            "method": "validate",
            "params": {
                "period": query_plan.period.model_dump(),
                "entity_resolution": {"status": query_plan.entity.resolution},
            },
        }]
    params = {
        "fuel_type": query_plan.entity.canonical_value if query_plan.entity else None,
        "facility": query_plan.facility,
        "scope": query_plan.scope,
        "category": query_plan.category,
        "record_type": query_plan.record_type,
        "requested_metric": query_plan.requested_metric,
        "metric": query_plan.requested_metric,
        "subcategory": query_plan.subcategory,
        "metric_field_key": query_plan.metric_field_key,
        "metric_field_label": query_plan.metric_field_label,
        "metric_field_aliases": query_plan.metric_field_aliases,
        "derived_metric": query_plan.derived_metric,
        "data_source": query_plan.data_source,
        "metric_terms": query_plan.metric_terms,
        "value_kind": query_plan.value_kind,
        "field_value_filter": query_plan.field_value_filter,
        "field_terms": query_plan.field_terms,
        "question_text": query_plan.question_text,
        "approval_status_filter": query_plan.approval_status_filter,
        "period": query_plan.period.model_dump(),
    }
    params = {key: value for key, value in params.items() if value is not None}
    relationship_types = {
        QueryType.METHODOLOGY_LOOKUP,
        QueryType.FORMULA_LOOKUP,
        QueryType.CALCULATION_AUDIT_LOOKUP,
    }
    if query_plan.query_type == QueryType.FORMULA_VERSION_HISTORY:
        return [{
            "service": "evidence_state",
            "method": "validate",
            "params": {"period": query_plan.period.model_dump(), "supported": False},
        }]
    if query_plan.query_type == QueryType.RECORD_VERSION_HISTORY:
        if query_plan.record_type in {"environment", "social", "governance"}:
            return [
                {"service": "esg_records", "method": "search_records", "params": params},
                {"service": "record_history", "method": "get_esg_record_history", "params": params},
            ]
        return [
            {"service": "emissions", "method": "search_records", "params": params},
            {"service": "record_history", "method": "get_emission_history", "params": params},
            {"service": "evidence_state", "method": "validate", "params": params},
        ]
    is_esg_record_query = query_plan.record_type in {"environment", "social", "governance"}
    if query_plan.query_type in {QueryType.CONSUMPTION_LOOKUP, QueryType.RECORD_LOOKUP, QueryType.ESG_METRIC_LOOKUP}:
        if query_plan.derived_metric == "renewable_energy_percentage":
            return [
                {"service": "esg_records", "method": "search_records", "params": params},
                {"service": "emissions", "method": "get_renewable_energy_components", "params": {**params, "category": None}},
            ]
        if is_esg_record_query:
            return [{"service": "esg_records", "method": "search_records", "params": params}]
        return [
            {"service": "emissions", "method": "search_records", "params": params},
            {"service": "evidence_state", "method": "validate", "params": params},
        ]
    if query_plan.query_type == QueryType.FUEL_ENERGY_LOOKUP:
        energy_params = {**params, "record_type": "environment", "category": "Energy", "subcategory": "Fuel Within Organization"}
        ghg_params = {**params, "scope": "scope1", "category": None, "fuel_type": None, "data_source": "fuel_energy"}
        return [
            {"service": "esg_records", "method": "search_records", "params": energy_params},
            {"service": "emissions", "method": "get_fuel_energy", "params": ghg_params},
        ]
    if query_plan.query_type == QueryType.EMISSION_LOOKUP:
        return [
            {"service": "emissions", "method": "search_records", "params": params},
            {"service": "relationships", "method": "resolve", "params": params},
            {"service": "evidence_state", "method": "validate", "params": params},
        ]
    if query_plan.query_type in relationship_types:
        return [
            {"service": "emissions", "method": "search_records", "params": params},
            {"service": "relationships", "method": "resolve", "params": params},
            {"service": "evidence_state", "method": "validate", "params": params},
        ]
    if query_plan.query_type == QueryType.EMISSION_FACTOR_LOOKUP:
        return [
            {"service": "emissions", "method": "search_records", "params": params},
            {"service": "relationships", "method": "resolve", "params": params},
            {"service": "emission_factors", "method": "lookup", "params": params},
            {"service": "evidence_state", "method": "validate", "params": params},
        ]
    if query_plan.query_type == QueryType.CALCULATION_PROPERTY_LOOKUP:
        return [
            {"service": "emissions", "method": "search_records", "params": params},
            {"service": "calculation_properties", "method": "lookup", "params": params},
            {"service": "evidence_state", "method": "validate", "params": params},
        ]
    if query_plan.query_type in {QueryType.BRSR_LOOKUP, QueryType.GRI_LOOKUP}:
        framework_params = {**params}
        if query_plan.framework_question_key:
            framework_params["framework_question_key"] = query_plan.framework_question_key
            framework_params["framework_source_path"] = query_plan.framework_source_path
            framework_params["framework_display_label"] = query_plan.framework_display_label
        service = "brsr" if query_plan.query_type == QueryType.BRSR_LOOKUP else "gri"
        return [{"service": service, "method": "get_responses", "params": framework_params}]
    if query_plan.query_type == QueryType.BRSR_VERSION_HISTORY:
        return [{"service": "brsr", "method": "get_version_history", "params": params}]
    if query_plan.query_type == QueryType.GRI_VERSION_HISTORY:
        return [{"service": "gri", "method": "get_version_history", "params": params}]
    if query_plan.query_type == QueryType.APPROVAL_STATUS_LOOKUP:
        return [{"service": "esg_records", "method": "search_records", "params": params}]
    if query_plan.query_type == QueryType.EVIDENCE_LOOKUP:
        return [{"service": "evidence", "method": "find_files", "params": params}]
    if query_plan.query_type == QueryType.ANALYTICS_LOOKUP:
        return [{"service": "analytics", "method": "query", "params": params}]
    if query_plan.query_type == QueryType.TARGET_LOOKUP:
        return [{"service": "targets", "method": "get_progress", "params": params}]
    if query_plan.query_type == QueryType.APPROVAL_HISTORY:
        return [{"service": "approvals", "method": "get_history", "params": params}]
    if query_plan.query_type == QueryType.ASSIGNMENT_HISTORY:
        return [{"service": "assignments", "method": "get_history", "params": params}]
    return []


def plan_service_calls(intent_result: dict, query_plan: StructuredQueryPlan = None) -> List[Dict[str, Any]]:
    """Convert intent + entities into ordered service call plan."""
    if query_plan and query_plan.query_type != QueryType.UNKNOWN:
        plan = _plan_structured_query(query_plan)
        logger.info("plan_service_calls — structured query type=%s pipeline=%s", query_plan.query_type.value, plan)
        return plan
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
