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
