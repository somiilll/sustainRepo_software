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
- For evidence, mention file name, upload date, and linked record.
- Keep responses under 300 words unless the data requires more.
- If showing a list of records, format as a compact table description.
- Always mention the time period if the data is period-specific.

Return a JSON object:
{
  "answer": "<formatted natural language answer>",
  "highlights": [{"label": "key", "value": "val", "unit": "optional"}],
  "suggestion": "<optional follow-up question suggestion or null>"
}"""


async def build_response(
    question: str,
    intent: dict,
    service_data: dict,
    response_type: str = "text",
) -> dict:
    """Format structured service data into a natural language response."""
    try:
        data_str = json.dumps(service_data, default=str)
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
