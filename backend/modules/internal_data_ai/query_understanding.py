"""Transform model-proposed semantics into deterministic, typed Internal AI query plans."""
import re
from typing import Optional

from modules.internal_data_ai.entity_resolution import resolve_fuel_entity, resolve_fuel_from_question
from modules.internal_data_ai.query_contracts import (
    EvidenceState,
    QueryEntity,
    QueryPeriod,
    QueryType,
    StructuredQueryPlan,
)
from modules.internal_data_ai.reporting_periods import ResolvedPeriod


_SOURCES = {
    QueryType.CONSUMPTION_LOOKUP: ["emission_records"],
    QueryType.EMISSION_LOOKUP: ["emission_records"],
    QueryType.METHODOLOGY_LOOKUP: ["emission_records", "ce_formulas", "ce_formula_versions", "ce_calculation_audit_logs"],
    QueryType.FORMULA_LOOKUP: ["emission_records", "ce_formulas"],
    QueryType.FORMULA_VERSION_HISTORY: ["emission_records", "ce_formulas", "ce_formula_versions", "ce_calculation_audit_logs"],
    QueryType.RECORD_VERSION_HISTORY: ["emission_records", "emission_history"],
    QueryType.CALCULATION_AUDIT_LOOKUP: ["emission_records", "ce_formulas", "ce_formula_versions", "ce_calculation_audit_logs"],
    QueryType.EMISSION_FACTOR_LOOKUP: ["emission_records", "fuel_database", "emission_factors"],
    QueryType.CALCULATION_PROPERTY_LOOKUP: ["emission_records", "calculation_inputs"],
    QueryType.BRSR_LOOKUP: ["esg_responses", "esg_response_submissions", "esg_question_configs"],
    QueryType.APPROVAL_STATUS_LOOKUP: ["environment_records", "approval_requests"],
    QueryType.EVIDENCE_LOOKUP: ["emission_records", "uploaded_files"],
    QueryType.RECORD_LOOKUP: ["emission_records"],
    QueryType.ANALYTICS_LOOKUP: ["emission_records"],
    QueryType.TARGET_LOOKUP: ["esg_targets"],
    QueryType.APPROVAL_HISTORY: ["approval_requests", "approval_history"],
    QueryType.ASSIGNMENT_HISTORY: ["esg_assignments", "esg_reporting_tasks"],
    QueryType.UNKNOWN: [],
}


def _period_contract(period: Optional[ResolvedPeriod]) -> QueryPeriod:
    if period is None:
        return QueryPeriod()
    label = period.label.lower()
    period_type = "calendar_month"
    if label.startswith("fy"):
        period_type = "financial_year"
    elif label.startswith("cy"):
        period_type = "calendar_year"
    elif label.startswith("q"):
        period_type = "quarter"
    return QueryPeriod(
        type=period_type,
        start_month=period.start_month,
        end_month=period.end_month,
        label=period.label,
        source=period.source,
        fiscal_start_month=period.fiscal_start_month,
    )


def _metric_from_question(question: str) -> str:
    text = question.lower()
    if re.search(r"\b(calorific value|calorific|\bcv\b)\b", text):
        return "calorific_value"
    if re.search(r"\b(consumption|consumed|consume|usage|used|quantity)\b", text):
        return "consumption"
    if re.search(r"\b(co2e|co₂e|emission|emissions|ghg|carbon)\b", text):
        return "co2e"
    if re.search(r"\b(methodology|how (?:was|is).*(?:calculated|computed)|calculation method)\b", text):
        return "methodology"
    if re.search(r"\b(emission factor|factor used|which factor)\b", text):
        return "emission_factor"
    return ""


def _query_type(question: str, legacy_intent: str, metric: str) -> QueryType:
    text = question.lower()
    if legacy_intent == "evidence_retrieval" or re.search(r"\b(attachment|attachments|evidence file|invoice)\b", text):
        return QueryType.EVIDENCE_LOOKUP
    if legacy_intent == "brsr_lookup" or re.search(r"\bbrsr\b", text):
        return QueryType.BRSR_LOOKUP
    if re.search(r"\b(awaiting approval|awaiting review|pending approval|pending review)\b", text):
        return QueryType.APPROVAL_STATUS_LOOKUP
    if re.search(r"\bformula version\b", text):
        return QueryType.FORMULA_VERSION_HISTORY
    if re.search(r"\b(version history|record version|record history|previous version|what changed)\b", text):
        return QueryType.RECORD_VERSION_HISTORY
    if re.search(r"\b(calculation audit|audit detail|show.*calculation)\b", text):
        return QueryType.CALCULATION_AUDIT_LOOKUP
    if re.search(r"\b(formula used|what formula)\b", text):
        return QueryType.FORMULA_LOOKUP
    if metric == "methodology" or legacy_intent == "formula_calculation":
        return QueryType.METHODOLOGY_LOOKUP
    if metric == "emission_factor" or legacy_intent == "emission_factor":
        return QueryType.EMISSION_FACTOR_LOOKUP
    if metric == "calorific_value":
        return QueryType.CALCULATION_PROPERTY_LOOKUP
    if metric == "consumption":
        return QueryType.CONSUMPTION_LOOKUP
    if metric == "co2e":
        return QueryType.EMISSION_LOOKUP
    if legacy_intent == "record_lookup":
        return QueryType.RECORD_LOOKUP
    if legacy_intent in {"analytics", "summary", "list_query", "count_query"}:
        return QueryType.ANALYTICS_LOOKUP
    if legacy_intent == "target_progress":
        return QueryType.TARGET_LOOKUP
    if legacy_intent == "approval_history":
        return QueryType.APPROVAL_HISTORY
    if legacy_intent == "assignment_history":
        return QueryType.ASSIGNMENT_HISTORY
    return QueryType.UNKNOWN


def build_query_plan(
    question: str,
    intent_result: dict,
    period: Optional[ResolvedPeriod],
    fuel_resolution: Optional[dict] = None,
) -> StructuredQueryPlan:
    """Build a closed plan from model semantics plus deterministic normalization results."""
    entities = intent_result.get("entities") or {}
    legacy_intent = intent_result.get("intent", "")
    metric = _metric_from_question(question) or entities.get("metric") or ""
    query_type = _query_type(question, legacy_intent, metric)
    raw_fuel = entities.get("fuel_type") or (fuel_resolution or {}).get("raw_value")
    entity = None
    evidence_state = EvidenceState.PENDING
    notes = []
    if raw_fuel:
        fuel_resolution = fuel_resolution or {"status": "UNRESOLVED", "canonical_value": None}
        status = fuel_resolution.get("status", "UNRESOLVED")
        entity = QueryEntity(
            type="fuel",
            raw_value=raw_fuel,
            canonical_value=fuel_resolution.get("canonical_value"),
            resolution=status,
        )
        if status == "AMBIGUOUS":
            evidence_state = EvidenceState.AMBIGUOUS
            notes.append("Fuel entity requires clarification.")
        elif status == "NOT_FOUND":
            notes.append("Fuel is not present in the canonical fuel database.")

    return StructuredQueryPlan(
        query_type=query_type,
        entity=entity,
        period=_period_contract(period),
        facility=entities.get("facility"),
        scope=entities.get("scope"),
        category=entities.get("category") or (metric if entities.get("record_type") in {"environment", "social", "governance"} else None),
        record_type=entities.get("record_type"),
        requested_metric=metric or None,
        sources_required=_SOURCES[query_type],
        evidence_state=evidence_state,
        legacy_intent=legacy_intent or None,
        resolution_notes=notes,
    )


async def understand_query(question: str, intent_result: dict, period: Optional[ResolvedPeriod], db) -> StructuredQueryPlan:
    """Resolve a model-extracted fuel name against server-owned canonical data."""
    raw_fuel = (intent_result.get("entities") or {}).get("fuel_type")
    fuel_resolution = await resolve_fuel_entity(db, raw_fuel) if raw_fuel else await resolve_fuel_from_question(db, question)
    return build_query_plan(question, intent_result, period, fuel_resolution)