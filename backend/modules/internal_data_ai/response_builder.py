"""Orchestrate deterministic and LLM-assisted Internal Data AI responses."""
import json
import logging
import os

from openai import OpenAI

from modules.internal_data_ai.formatters.comparison_formatter import build_period_comparison_response
from modules.internal_data_ai.formatters.evidence_formatter import build_evidence_formatter_data
from modules.internal_data_ai.formatters.esg_formatter import (
    build_combined_renewable_energy_response,
    build_esg_record_history_response,
    build_esg_record_response,
)
from modules.internal_data_ai.formatters.framework_formatter import build_framework_question_response
from modules.internal_data_ai.formatters.ghg_formatter import build_fuel_energy_response, build_ghg_response
from modules.internal_data_ai.formatters.response_safety import sanitize_response
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

# Backwards-compatible private imports used by focused regression tests and extension modules.
_build_period_comparison_response = build_period_comparison_response
_build_fuel_energy_response = build_fuel_energy_response
_build_ghg_response = build_ghg_response
_build_esg_record_response = build_esg_record_response
_build_esg_record_history_response = build_esg_record_history_response
_build_combined_renewable_energy_response = build_combined_renewable_energy_response
_build_framework_question_response = build_framework_question_response
_evidence_formatter_data = build_evidence_formatter_data


def _public_response(response: dict) -> dict:
    """Ensure no formatter can return internal database identifiers to clients."""
    return sanitize_response(response)


async def build_response(
    question: str,
    intent: dict,
    service_data: dict,
    response_type: str = "text",
    query_plan: StructuredQueryPlan = None,
) -> dict:
    """Route structured service output through its deterministic or LLM formatter."""
    try:
        if query_plan and query_plan.comparison_periods and service_data.get("emissions", {}).get("comparison"):
            return _public_response(build_period_comparison_response(query_plan, service_data["emissions"], response_type))
        if query_plan and query_plan.query_type == QueryType.FUEL_ENERGY_LOOKUP:
            return _public_response(build_fuel_energy_response(service_data.get("esg_records", {}), service_data.get("emissions", {}), response_type))
        if query_plan and query_plan.framework_question_key:
            framework_data = service_data.get("brsr") or service_data.get("gri")
            if framework_data:
                return _public_response(build_framework_question_response(query_plan, framework_data, response_type))
        if query_plan and query_plan.data_source == "ghg_emissions" and service_data.get("emissions"):
            return _public_response(build_ghg_response(query_plan, service_data["emissions"], response_type))
        if query_plan and query_plan.query_type == QueryType.RECORD_VERSION_HISTORY and query_plan.record_type in {"environment", "social", "governance"}:
            return _public_response(build_esg_record_history_response(query_plan, service_data.get("record_history") or {}, response_type))
        if query_plan and query_plan.record_type in {"environment", "social", "governance"} and service_data.get("esg_records"):
            if query_plan.derived_metric == "renewable_energy_percentage":
                response = build_esg_record_response(query_plan, service_data["esg_records"], response_type)
                response["answer"] = build_combined_renewable_energy_response(service_data["esg_records"], service_data.get("emissions") or {})
                response["raw_data"] = {"environment_energy": service_data["esg_records"], "ghg_energy": service_data.get("emissions") or {}}
                return _public_response(response)
            return _public_response(build_esg_record_response(query_plan, service_data["esg_records"], response_type))

        formatter_data = build_evidence_formatter_data(query_plan, service_data) if query_plan else service_data
        detailed_terms = ("audit", "record-level", "record level", "input value", "substitution", "calculation input")
        is_detailed_request = any(term in question.lower() for term in detailed_terms)
        if not query_plan and intent.get("intent") == "formula_calculation" and not is_detailed_request:
            formula_data = service_data.get("formulas", {})
            formatter_data = {"formulas": {"reporting_period": formula_data.get("reporting_period"), "methodology_summaries": formula_data.get("methodology_summaries", [])}}
        data_str = json.dumps(formatter_data, default=str)
        if len(data_str) > 15000:
            data_str = data_str[:15000] + "... [truncated]"
        user_msg = f"User question: {question}\nIntent: {intent.get('intent')}\nResponse type requested: {response_type}\nRetrieved data:\n{data_str}"
        response = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user_msg}],
            max_completion_tokens=1500,
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)
        return _public_response({"answer": result.get("answer", ""), "highlights": result.get("highlights", []), "suggestion": result.get("suggestion"), "response_type": response_type, "chart": result.get("chart"), "raw_data": service_data if response_type in ("table", "chart", "evidence") else None})
    except Exception as error:
        logger.error("Response building failed: %s", error)
        return _public_response({"answer": "I found matching data but had trouble formatting it safely.", "highlights": [], "suggestion": None, "response_type": "text", "raw_data": service_data})