"""
Response Builder — Uses GPT-5.6-sol to format structured data into natural language.
The LLM only formats; it never generates data.
"""
import os
import json
import logging
from openai import OpenAI

from modules.internal_data_ai.query_contracts import QueryType, StructuredQueryPlan

logger = logging.getLogger(__name__)

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
MODEL = "gpt-5.6-sol"

SYSTEM_PROMPT = """You are SustainRepo Internal Data AI response formatter.
You receive structured data retrieved from the database and must format it into a clear, concise answer.

Rules:
- ONLY use the provided data. Never invent or guess information.
- Use the supplied evidence state exactly: NOT_FOUND means no authorized data; AMBIGUOUS means request clarification; NOT_SUPPORTED means the underlying capability is unavailable; RELATIONSHIP_MISSING and FOUND_PARTIAL must identify the missing or partial evidence.
- Prefer bullet points, short sentences over long paragraphs.
- When showing numbers, include units.
- For emission factors, always include source, unit, and database version.
- For calculations, show the formula and steps.
- Never display internal record IDs, formula IDs, or formula-version identifiers/timelines. Never infer a formula, variable, factor, conversion, or calculation step. Clearly state when a linked formula or audit input is unavailable.
- Mention evidence file names and upload dates only when evidence-file data is actually provided.
- Keep responses under 300 words unless the data requires more.
- Always mention the time period if the data is period-specific.
- For consumption answers, treat `consumption_totals` and `facility_consumption` as authoritative. Record quantities may be allocated for the requested period; explain any annual allocation explicitly.
- For emissions answers, only display an emissions unit supplied in the evidence. Never infer `tCO2e` from a metric name or numeric value. Each record's `emissions_value` is already allocated for the requested period when needed; never apply an allocation factor to it again.
- If period evidence is `ANNUAL_VALUE_ALLOCATED_TO_MONTH`, state that the displayed figure is derived from a stored annual record and give the allocation factor; never describe it as a directly stored monthly record.
- For methodology, formula, record-history, and audit questions, use only the stored relationship evidence. Never mention formula-version history, version timelines, or internal formula versions in the final response. Never invent formula inputs, audit substitutions, factors, effective dates, or output units.
- For record history, use `changed_by_name` when it is present. Never expose an internal user ID and never claim the updater name is unavailable when a stored display name is provided.
- For BRSR, approval-status, calculation-property, and attachment questions, use their supplied service evidence directly. Never describe supplied data as pending merely because it is from a non-emissions service.

Return a JSON object:
{
  "answer": "<formatted natural language answer>",
  "highlights": [{"label": "key", "value": "val", "unit": "optional"}],
  "suggestion": "<optional follow-up question suggestion or null>",
  "chart": null or {
    "type": "bar|line|pie|area",
    "title": "<chart title>",
    "data": [{"name": "<label>", "value": <number>}],
    "xKey": "name",
    "yKey": "value",
    "color": "#3b82f6"
  }
}

IMPORTANT for chart:
- Include a "chart" object when the data naturally lends itself to visualization (rankings, breakdowns, trends, comparisons).
- Use "pie" for composition/breakdown (<=7 items), "bar" for rankings/comparisons, "line" for trends over time, "area" for cumulative trends.
- Each data item must have "name" (string label) and "value" (number).
- Omit chart if data has fewer than 2 items or is not numeric."""


def _format_record_values(values: dict) -> str:
    if not values:
        return "Value unavailable"
    parts = []
    for key, value in values.items():
        if key == "unit" or key.endswith("_unit") or value in (None, "", [], {}):
            continue
        label = key.replace("_", " ").title()
        unit = values.get(f"{key}_unit") or (values.get("unit") if key != "unit" else None)
        rendered = json.dumps(value, ensure_ascii=False, default=str) if isinstance(value, (dict, list)) else str(value)
        parts.append(f"{label}: {rendered}{f' {unit}' if unit and key != 'unit' else ''}")
    return "; ".join(parts[:4]) or "Value unavailable"


def _format_metric_value(metric_value: dict) -> str:
    if not metric_value or metric_value.get("state") != "AVAILABLE":
        return "Value: Missing"
    unit = metric_value.get("unit")
    value = metric_value.get("value")
    return f"{metric_value.get('field_label') or 'Value'}: {value}{f' {unit}' if unit else ' (unit not stored)'}"


def _display_status(record: dict) -> str:
    approval = record.get("approval_status")
    if approval == "not_required":
        return "Not applicable"
    if approval:
        return str(approval).replace("_", " ").title()
    operational = record.get("operational_status")
    return f"Approval status unavailable; record status: {operational}"


def _build_water_recycling_response(data: dict) -> str:
    results = data.get("derived_results") or []
    if not results:
        return "Water Recycling % could not be calculated because matching current Recycle and Withdrawal values were not found."
    lines = ["Water Recycling %"]
    for result in results[:12]:
        lines.append(f"Period: {result.get('period')}")
        if result.get("state") == "FOUND":
            unit = result.get("unit") or "stored unit"
            lines.extend([
                f"Recycled water: {result.get('recycled_value')} {unit}",
                f"Water withdrawal: {result.get('withdrawal_value')} {unit}",
                f"Formula: ({result.get('recycled_value')} / {result.get('withdrawal_value')}) × 100",
                f"Result: {result.get('percentage')}%",
            ])
        elif result.get("state") == "ZERO_DENOMINATOR":
            lines.append("Cannot calculate: Water withdrawal is zero.")
        else:
            lines.append("Cannot calculate: recycled water or water withdrawal value is missing or has no compatible stored unit.")
    return "\n".join(lines)


def _build_ghg_response(query_plan: StructuredQueryPlan, data: dict, response_type: str) -> dict:
    """Render activity data separately from calculated GHG emissions."""
    value_kind = data.get("value_kind") or query_plan.value_kind or "emissions"
    category = data.get("category") or "all matching categories"
    scope = data.get("scope") or query_plan.scope or "all scopes"
    period = data.get("period") or "All reporting periods"
    found = data.get("total_found", 0)
    subject = "GHG emissions" if value_kind == "emissions" else "GHG activity data"
    if not found:
        answer = f"No authorized {subject} records were found for {scope} → {category} in {period}."
    else:
        answer = f"{found} {subject} record(s) found for {scope} → {category} in {period}."
        if value_kind == "emissions":
            totals, period_totals = data.get("emissions_totals") or [], data.get("period_emissions") or []
            if period == "All reporting periods" and period_totals:
                answer += "\nPeriod comparison:" + "".join(f"\n• {item['period']}: {item['value']} {item['unit']}" for item in period_totals[:12])
            elif totals:
                answer += "\nTotal emissions: " + ", ".join(f"{item['value']} {item['unit']}" for item in totals)
        else:
            totals, period_totals = data.get("consumption_totals") or [], data.get("period_consumption") or []
            if period == "All reporting periods" and period_totals:
                answer += "\nPeriod comparison:" + "".join(f"\n• {item['period']}: {item['quantity']} {item['unit']}" for item in period_totals[:12])
            elif totals:
                answer += "\nTotal activity: " + ", ".join(f"{item['quantity']} {item['unit']}" for item in totals)
        details = []
        for record in data.get("records", [])[:12]:
            value = record.get("emissions_value") if value_kind == "emissions" else record.get("quantity")
            unit = record.get("emissions_unit") if value_kind == "emissions" else record.get("unit")
            details.append(
                f"• {record.get('category') or 'Category'} — {record.get('facility') or 'Organization level'}; "
                f"{record.get('reporting_period')}; {value if value is not None else 'Value missing'}"
                f"{f' {unit}' if unit else ''}; Status: {record.get('status') or 'unavailable'}"
            )
        if details:
            answer += "\nUnderlying records:\n" + "\n".join(details)
    return {
        "answer": answer,
        "highlights": [
            {"label": "Source", "value": f"GHG Emissions → {scope} → {category}"},
            {"label": "Records found", "value": str(found)},
            {"label": "Data type", "value": "Calculated emissions" if value_kind == "emissions" else "Activity data"},
        ],
        "suggestion": None,
        "response_type": response_type,
        "chart": None,
        "raw_data": data,
    }


def _build_esg_record_response(query_plan: StructuredQueryPlan, data: dict, response_type: str) -> dict:
    """Return deterministic ESG-record answers so record state never depends on LLM phrasing."""
    category = data.get("category") or query_plan.category or query_plan.record_type or "ESG"
    metric = data.get("subcategory") or data.get("requested_metric")
    subject = f"{category} {str(metric).title()}" if metric and str(metric).lower() != str(category).lower() else str(category)
    period = data.get("period") or "All reporting periods"
    state = data.get("state", "NOT_FOUND")
    found = data.get("records_found", 0)
    matching = data.get("matching_status_records", 0)
    status_filter = data.get("approval_status_filter")
    summary = data.get("approval_status_summary") or {}

    if state == "NOT_FOUND":
        answer = f"No {subject} metric records were found for {period}."
    elif state == "STATUS_UNAVAILABLE":
        answer = (
            f"No approval-status data was provided for the {found} matching {subject} metric record(s) for {period}; "
            "their approval state cannot be determined."
        )
    elif status_filter == "pending_approval" and matching == 0:
        answer = f"No {str(category).lower()} metric records are pending approval. Records found: {found}. Awaiting approval: 0."
    elif status_filter == "approved" and matching == 0:
        answer = f"No {category} metric records currently have Approved status. Records found: {found}. Approved: 0."
    elif data.get("derived_metric") == "water_recycling_percentage":
        answer = _build_water_recycling_response(data)
    else:
        status_label = "pending approval" if state == "PENDING" else "approved" if state == "APPROVED" else "found"
        answer = f"{matching if status_filter else found} {subject} metric record(s) {status_label} for {period}."
        aggregates = data.get("aggregates") or []
        if aggregates:
            if period == "All reporting periods":
                answer += "\nPeriod comparison:"
                for total in aggregates[:12]:
                    answer += f"\n• {total.get('period')}: {total.get('value')} {total.get('unit')} across {len(total.get('facilities') or [])} location(s)."
            else:
                total = aggregates[0]
                answer += f"\nTotal: {total.get('value')} {total.get('unit')} across {len(total.get('facilities') or [])} location(s)."
        details = []
        for record in data.get("records", [])[:12]:
            details.append(
                f"• {record.get('metric') or category} — {record.get('facility') or 'Organization level'}; "
                f"{record.get('reporting_period')}; {_format_metric_value(record.get('metric_value') or {})}; "
                f"Status: {_display_status(record)}"
            )
        if details:
            answer = f"{answer}\nUnderlying records:\n" + "\n".join(details)

    highlights = [
        {"label": "State", "value": state},
        {"label": "Records found", "value": str(found)},
        {"label": "Pending", "value": str(summary.get("PENDING", 0))},
        {"label": "Approved", "value": str(summary.get("APPROVED", 0))},
    ]
    if data.get("source_path"):
        highlights.append({"label": "Source", "value": data["source_path"]})
    if summary.get("STATUS_UNAVAILABLE"):
        highlights.append({"label": "Status unavailable", "value": str(summary["STATUS_UNAVAILABLE"])})
    return {
        "answer": answer,
        "highlights": highlights,
        "suggestion": None,
        "response_type": response_type,
        "chart": None,
        "raw_data": data,
    }


def _evidence_formatter_data(query_plan: StructuredQueryPlan, service_data: dict) -> dict:
    emissions = service_data.get("emissions", {})
    evidence = service_data.get("evidence_state", {})
    relationships = service_data.get("relationships", {})
    relationship_by_record = {item.get("record_id"): item for item in relationships.get("relationships", [])}
    period_by_record = {item.get("record_id"): item for item in evidence.get("record_evidence", [])}
    records = []
    for record in emissions.get("records", []):
        relationship = relationship_by_record.get(record.get("id"), {})
        unit_evidence = relationship.get("emission_unit") or {}
        records.append({
            "facility": record.get("facility"),
            "fuel_type": record.get("fuel_type"),
            "scope": record.get("scope"),
            "reporting_period": record.get("reporting_period"),
            "quantity": record.get("quantity"),
            "quantity_unit": record.get("unit"),
            "quantity_source": record.get("quantity_source"),
            "emissions_value": record.get("emissions_value"),
            "emissions_unit": unit_evidence.get("unit"),
            "emissions_unit_source": unit_evidence.get("source"),
            "period_evidence": period_by_record.get(record.get("id")),
        })

    payload = {
        "query": query_plan.model_dump(),
        "evidence": evidence,
        "records": records,
        "consumption_totals": emissions.get("consumption_totals", []),
        "facility_consumption": emissions.get("facility_consumption", []),
        "relationships": [
            {
                "formula": {
                    "name": (item.get("formula") or {}).get("name"),
                    "description": (item.get("formula") or {}).get("description"),
                    "definition": (item.get("formula") or {}).get("definition"),
                } if item.get("formula") else None,
                "calculation_audit_available": bool(item.get("calculation_audits")),
                "emission_unit": item.get("emission_unit"),
                "evidence_state": item.get("evidence_state"),
                "missing": item.get("missing", []),
            }
            for item in relationships.get("relationships", [])
        ],
        "record_history": service_data.get("record_history", {}).get("history", []),
        "emission_factors": service_data.get("emission_factors", {}).get("emission_factors", []),
        "calculation_properties": service_data.get("calculation_properties", {}),
        "brsr": service_data.get("brsr", {}),
        "gri": service_data.get("gri", {}),
        "approval_status": service_data.get("approvals", {}),
        "evidence_files": service_data.get("evidence", {}),
    }
    if query_plan.query_type == QueryType.ANALYTICS_LOOKUP:
        payload["analytics"] = service_data.get("analytics", {})
    return payload


async def build_response(
    question: str,
    intent: dict,
    service_data: dict,
    response_type: str = "text",
    query_plan: StructuredQueryPlan = None,
) -> dict:
    """Format structured service data into a natural language response."""
    try:
        if query_plan and query_plan.data_source == "ghg_emissions" and service_data.get("emissions"):
            return _build_ghg_response(query_plan, service_data["emissions"], response_type)
        if query_plan and query_plan.record_type in {"environment", "social", "governance"} and service_data.get("esg_records"):
            return _build_esg_record_response(query_plan, service_data["esg_records"], response_type)
        formatter_data = _evidence_formatter_data(query_plan, service_data) if query_plan else service_data
        detailed_terms = ("audit", "record-level", "record level", "input value", "substitution", "calculation input")
        is_detailed_request = any(term in question.lower() for term in detailed_terms)
        if not query_plan and intent.get("intent") == "formula_calculation" and not is_detailed_request:
            formula_data = service_data.get("formulas", {})
            formatter_data = {
                "formulas": {
                    "reporting_period": formula_data.get("reporting_period"),
                    "methodology_summaries": formula_data.get("methodology_summaries", []),
                }
            }
        data_str = json.dumps(formatter_data, default=str)
        # Truncate if too large to avoid token limits
        if len(data_str) > 15000:
            data_str = data_str[:15000] + "... [truncated]"

        user_msg = (
            f"User question: {question}\n"
            f"Intent: {intent.get('intent')}\n"
            f"Response type requested: {response_type}\n"
            f"Retrieved data:\n{data_str}"
        )

        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            max_completion_tokens=1500,
            response_format={"type": "json_object"},
        )

        result = json.loads(response.choices[0].message.content)
        return {
            "answer": result.get("answer", ""),
            "highlights": result.get("highlights", []),
            "suggestion": result.get("suggestion"),
            "response_type": response_type,
            "chart": result.get("chart"),
            "raw_data": service_data if response_type in ("table", "chart", "evidence") else None,
        }
    except Exception as e:
        logger.error(f"Response building failed: {e}")
        return {
            "answer": f"I found some data but had trouble formatting it. Raw: {str(service_data)[:500]}",
            "highlights": [],
            "suggestion": None,
            "response_type": "text",
            "raw_data": service_data,
        }
