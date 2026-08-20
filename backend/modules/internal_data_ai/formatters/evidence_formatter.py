"""Prepare the restricted evidence payload sent to the LLM formatter."""
from modules.internal_data_ai.query_contracts import QueryType, StructuredQueryPlan


def build_evidence_formatter_data(query_plan: StructuredQueryPlan, service_data: dict) -> dict:
    emissions = service_data.get("emissions", {})
    evidence = service_data.get("evidence_state", {})
    relationships = service_data.get("relationships", {})
    relationship_by_record = {item.get("record_id"): item for item in relationships.get("relationships", [])}
    period_by_record = {item.get("record_id"): item for item in evidence.get("record_evidence", [])}
    records = []
    for record in emissions.get("records", []):
        relationship = relationship_by_record.get(record.get("id"), {})
        unit_evidence = relationship.get("emission_unit") or {}
        records.append({"facility": record.get("facility"), "fuel_type": record.get("fuel_type"), "scope": record.get("scope"), "reporting_period": record.get("reporting_period"), "quantity": record.get("quantity"), "quantity_unit": record.get("unit"), "quantity_source": record.get("quantity_source"), "emissions_value": record.get("emissions_value"), "emissions_unit": unit_evidence.get("unit"), "emissions_unit_source": unit_evidence.get("source"), "period_evidence": period_by_record.get(record.get("id"))})
    payload = {"query": query_plan.model_dump(), "evidence": evidence, "records": records, "consumption_totals": emissions.get("consumption_totals", []), "facility_consumption": emissions.get("facility_consumption", []), "relationships": [{"formula": {"name": (item.get("formula") or {}).get("name"), "description": (item.get("formula") or {}).get("description"), "definition": (item.get("formula") or {}).get("definition")} if item.get("formula") else None, "calculation_audit_available": bool(item.get("calculation_audits")), "emission_unit": item.get("emission_unit"), "evidence_state": item.get("evidence_state"), "missing": item.get("missing", [])} for item in relationships.get("relationships", [])], "record_history": service_data.get("record_history", {}).get("history", []), "emission_factors": service_data.get("emission_factors", {}).get("emission_factors", []), "calculation_properties": service_data.get("calculation_properties", {}), "brsr": service_data.get("brsr", {}), "gri": service_data.get("gri", {}), "approval_status": service_data.get("approvals", {}), "evidence_files": service_data.get("evidence", {})}
    if query_plan.query_type == QueryType.ANALYTICS_LOOKUP:
        payload["analytics"] = service_data.get("analytics", {})
    return payload