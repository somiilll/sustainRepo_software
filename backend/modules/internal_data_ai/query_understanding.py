"""Transform model-proposed semantics into deterministic, typed Internal AI query plans."""
import re
from typing import Optional

from modules.internal_data_ai.entity_resolution import resolve_fuel_entity, resolve_fuel_from_question
from modules.internal_data_ai.metric_resolver import resolve_esg_metric
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
    QueryType.GRI_LOOKUP: ["esg_responses", "esg_response_submissions", "esg_question_configs"],
    QueryType.BRSR_VERSION_HISTORY: ["esg_responses", "esg_responses_versions"],
    QueryType.GRI_VERSION_HISTORY: ["esg_responses", "esg_responses_versions"],
    QueryType.APPROVAL_STATUS_LOOKUP: ["environment_records", "approval_requests"],
    QueryType.EVIDENCE_LOOKUP: ["emission_records", "uploaded_files"],
    QueryType.RECORD_LOOKUP: ["emission_records"],
    QueryType.ANALYTICS_LOOKUP: ["emission_records"],
    QueryType.TARGET_LOOKUP: ["esg_targets"],
    QueryType.APPROVAL_HISTORY: ["approval_requests", "approval_history"],
    QueryType.ASSIGNMENT_HISTORY: ["esg_assignments", "esg_reporting_tasks"],
    QueryType.ESG_METRIC_LOOKUP: ["environment_records"],
    QueryType.FUEL_ENERGY_LOOKUP: ["environment_records", "emission_records", "fuel_database"],
    QueryType.UNKNOWN: [],
}

_ESG_SECTIONS = {"environment", "social", "governance"}


def _approval_status_filter(question: str) -> Optional[str]:
    """Map only explicit approval-status wording to a stored status filter."""
    text = (question or "").lower()
    if re.search(r"\b(awaiting|pending)(?:\s+(?:for\s+)?approval|\s+review)?\b", text):
        return "pending_approval"
    if re.search(r"\bapproved\b", text):
        return "approved"
    return None


def _resolve_esg_context(question: str, entities: dict) -> tuple[Optional[str], Optional[str]]:
    """Derive ESG section/category from explicit user wording before using model hints."""
    text = (question or "").lower()
    record_type = (entities.get("record_type") or "").lower()
    category = entities.get("category")

    if re.search(r"\bwater\b", text):
        return "environment", "Water"
    if re.search(r"\benvironment(?:al)?\b", text):
        return "environment", category
    if re.search(r"\bsocial\b", text):
        return "social", category
    if re.search(r"\bgovernance\b", text):
        return "governance", category
    if record_type in _ESG_SECTIONS:
        return record_type, category
    return None, category


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
    framework_history = re.search(r"\b(previous answer|changed answer|what was reported before|version|history|who changed|when it changed|compare versions)\b", text)
    if legacy_intent == "brsr_lookup" or re.search(r"\bbrsr\b", text):
        return QueryType.BRSR_VERSION_HISTORY if framework_history else QueryType.BRSR_LOOKUP
    if legacy_intent == "gri_lookup" or re.search(r"\bgri\b", text):
        return QueryType.GRI_VERSION_HISTORY if framework_history else QueryType.GRI_LOOKUP
    if _approval_status_filter(question):
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
    metric_resolution = resolve_esg_metric(question)
    record_type, category = _resolve_esg_context(question, entities)
    if metric_resolution:
        record_type, category = metric_resolution.section, metric_resolution.category
        if metric_resolution.data_source == "fuel_energy":
            query_type = QueryType.FUEL_ENERGY_LOOKUP
        elif metric_resolution.data_source == "ghg_emissions":
            query_type = QueryType.EMISSION_LOOKUP if metric_resolution.value_kind == "emissions" else QueryType.CONSUMPTION_LOOKUP
        elif query_type != QueryType.APPROVAL_STATUS_LOOKUP:
            query_type = QueryType.ESG_METRIC_LOOKUP
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

    sources_required = _SOURCES[query_type]
    if record_type in _ESG_SECTIONS and query_type in {
        QueryType.CONSUMPTION_LOOKUP,
        QueryType.RECORD_LOOKUP,
        QueryType.APPROVAL_STATUS_LOOKUP,
        QueryType.ESG_METRIC_LOOKUP,
    }:
        sources_required = [f"{record_type}_records"]
    elif metric_resolution and metric_resolution.data_source == "ghg_emissions":
        sources_required = ["emission_records"]
    elif metric_resolution and metric_resolution.data_source == "fuel_energy":
        sources_required = ["environment_records", "emission_records", "fuel_database"]

    return StructuredQueryPlan(
        query_type=query_type,
        entity=entity,
        period=_period_contract(period),
        facility=entities.get("facility"),
        scope=metric_resolution.ghg_scope if metric_resolution and metric_resolution.ghg_scope else entities.get("scope"),
        category=category or (metric if record_type in _ESG_SECTIONS else None),
        record_type=record_type,
        requested_metric=metric or None,
        subcategory=metric_resolution.subcategory if metric_resolution else None,
        metric_field_key=metric_resolution.field_key if metric_resolution else None,
        metric_field_label=metric_resolution.field_label if metric_resolution else None,
        metric_field_aliases=list(metric_resolution.field_aliases) if metric_resolution else [],
        derived_metric=metric_resolution.derived_metric if metric_resolution else None,
        data_source=metric_resolution.data_source if metric_resolution else None,
        metric_terms=list(metric_resolution.semantic_terms) if metric_resolution else [],
        value_kind=metric_resolution.value_kind if metric_resolution else None,
        field_value_filter=metric_resolution.field_value_filter if metric_resolution else None,
        field_terms=list(metric_resolution.field_terms) if metric_resolution else [],
        question_text=question,
        approval_status_filter=_approval_status_filter(question),
        sources_required=sources_required,
        evidence_state=evidence_state,
        legacy_intent=legacy_intent or None,
        resolution_notes=notes,
    )


async def understand_query(question: str, intent_result: dict, period: Optional[ResolvedPeriod], db) -> StructuredQueryPlan:
    """Resolve a model-extracted fuel name against server-owned canonical data."""
    raw_fuel = (intent_result.get("entities") or {}).get("fuel_type")
    fuel_resolution = await resolve_fuel_entity(db, raw_fuel) if raw_fuel else await resolve_fuel_from_question(db, question)
    return build_query_plan(question, intent_result, period, fuel_resolution)