"""
Response Builder — Uses GPT-5.6-sol to format structured data into natural language.
The LLM only formats; it never generates data.
"""
import os
import json
import logging
from openai import OpenAI

logger = logging.getLogger(__name__)

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
MODEL = "gpt-5.6-sol"

SYSTEM_PROMPT = """You are SustainRepo Internal Data AI response formatter.
You receive structured data retrieved from the database and must format it into a clear, concise answer.

Rules:
- ONLY use the provided data. Never invent or guess information.
- If data is empty or null, say "No data found for this query."
- Prefer bullet points, short sentences over long paragraphs.
- When showing numbers, include units.
- For emission factors, always include source, unit, and database version.
- For calculations, show the formula and steps.
- For methodology questions, show only the exact retrieved formula_id and stored definition. Never infer a formula, variable, factor, conversion, or calculation step. Clearly state when a linked formula or audit input is unavailable.
- For evidence, mention file name, upload date, and linked record.
- Keep responses under 300 words unless the data requires more.
- Always mention the time period if the data is period-specific.
- For emission-record consumption answers, treat `consumption_totals` as the authoritative total. Record `quantity` values are already allocated for the requested period; explain any `allocation_notes` clearly and never recalculate from `stored_quantity`.
- For emissions totals or facility comparisons, use the supplied `emissions_totals` or `facility_emissions` values and their stated unit. Never say an emissions unit is missing when the data provides `tCO2e`.
- For methodology questions without an explicit request for audit inputs, record-level detail, or calculation substitutions: use only `methodology_summaries`. Show the methodology name and plain-language formula steps. Do not show formula IDs, linked records, raw variable keys, input/property lists, technical units, output schemas, or audit-availability messages.

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


async def build_response(
    question: str,
    intent: dict,
    service_data: dict,
    response_type: str = "text",
) -> dict:
    """Format structured service data into a natural language response."""
    try:
        formatter_data = service_data
        detailed_terms = ("audit", "record-level", "record level", "input value", "substitution", "calculation input")
        is_detailed_request = any(term in question.lower() for term in detailed_terms)
        if intent.get("intent") == "formula_calculation" and not is_detailed_request:
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
