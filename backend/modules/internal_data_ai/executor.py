"""
Service Executor — Executes planned service calls and returns structured data.
Maps service names to actual service functions.
"""
import logging
from typing import Dict, Any, List
from modules.internal_data_ai.services import (
    organization, emissions, emission_factors, targets,
    evidence, analytics, history, esg_records, formulas,
)

logger = logging.getLogger(__name__)

SERVICE_MAP = {
    "organization": {
        "get_info": organization.get_info,
    },
    "emissions": {
        "search_records": emissions.search_records,
    },
    "emission_factors": {
        "lookup": emission_factors.lookup,
    },
    "targets": {
        "get_progress": targets.get_progress,
    },
    "evidence": {
        "find_files": evidence.find_files,
    },
    "analytics": {
        "query": analytics.query,
        "summary": analytics.summary,
        "list_items": analytics.list_items,
        "count_items": analytics.count_items,
    },
    "history": {
        "get_changes": history.get_changes,
    },
    "audit": {
        "get_logs": history.get_logs,
    },
    "approvals": {
        "get_history": history.get_approval_history,
    },
    "assignments": {
        "get_history": history.get_assignment_history,
    },
    "esg_records": {
        "search_records": esg_records.search_records,
        "get_kpis": esg_records.get_kpis,
    },
    "formulas": {
        "explain": formulas.explain,
    },
}


async def execute_plan(plan: List[Dict[str, Any]], org_id: str, facility_ids: list = None) -> dict:
    """Execute all service calls in the plan and merge results."""
    merged = {}
    for step in plan:
        service_name = step.get("service")
        method_name = step.get("method")
        params = step.get("params", {})

        service = SERVICE_MAP.get(service_name)
        if not service:
            logger.warning(f"Unknown service: {service_name}")
            merged[service_name] = {"error": f"Service '{service_name}' not available"}
            continue

        func = service.get(method_name)
        if not func:
            logger.warning(f"Unknown method: {service_name}.{method_name}")
            merged[service_name] = {"error": f"Method '{method_name}' not available"}
            continue

        try:
            result = await func(org_id=org_id, facility_ids=facility_ids, **params)
            merged[service_name] = result
        except Exception as e:
            logger.error(f"Service call failed: {service_name}.{method_name}: {e}")
            merged[service_name] = {"error": str(e)}

    return merged
