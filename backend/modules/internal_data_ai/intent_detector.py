"""
Intent Detector — Classifies user questions into structured intents using GPT-5.6-sol.
Returns intent type + extracted entities for the planner.
"""
import os
import json
import logging
from openai import OpenAI

logger = logging.getLogger(__name__)

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
MODEL = "gpt-5.6-sol"

SYSTEM_PROMPT = """You are an intent classifier for SustainRepo, an ESG/sustainability data platform.
Given a user question, classify it into exactly ONE intent and extract relevant entities.

Available intents:
- record_lookup: Looking up specific emission/ESG records, data entries
- emission_factor: Questions about emission factors, fuel databases, EF sources
- formula_calculation: How something was calculated, methodology, formula details
- approval_history: Who approved/rejected, approval status, workflow
- assignment_history: Who is assigned, task assignments, due dates
- version_history: What changed, edit history, version diffs across any module
- audit_trail: Activity logs, who did what, when
- evidence_retrieval: Show evidence, attachments, uploaded files, invoices, bills
- analytics: Top/bottom rankings, comparisons, trends, aggregations
- target_progress: Target status, progress, achievement %, baseline vs current
- organization_info: Company details, facilities, reporting boundary
- kpi_lookup: KPI values, ESG metrics, environment/social/governance data
- summary: General overview, dashboard-style summary
- list_query: List of records, facilities, categories, users
- count_query: How many records, count of items
- brsr_lookup: BRSR framework responses, section progress, submission status, BRSR data
- gri_lookup: GRI framework disclosures, section progress, submission status, GRI data
- supplier_assessment: Supplier assessment questionnaires, scores, rankings, supplier ESG data
- data_status: Record-level approval/submission status across all modules, data completeness

Return JSON only:
{
  "intent": "<intent_name>",
  "entities": {
    "facility": "<facility name or null>",
    "scope": "<scope 1/2/3 or null>",
    "category": "<emission category or null>",
    "fuel_type": "<fuel/activity type or null>",
    "period": "<time period or null>",
    "target_name": "<target name or null>",
    "record_type": "<emission/environment/social/governance or null>",
    "metric": "<specific metric or null>",
    "entity_name": "<any named entity or null>"
  },
  "response_type": "<card|table|chart|timeline|metric|evidence|list|text>"
}"""


async def detect_intent(question: str, org_context: dict = None) -> dict:
    """Classify user question into intent + entities."""
    try:
        user_msg = f"Question: {question}"
        if org_context:
            user_msg += f"\nOrg context: {json.dumps(org_context)}"

        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            max_completion_tokens=500,
            response_format={"type": "json_object"},
        )

        result = json.loads(response.choices[0].message.content)
        return result
    except Exception as e:
        logger.error(f"Intent detection failed: {e}")
        return {
            "intent": "summary",
            "entities": {},
            "response_type": "text",
        }
