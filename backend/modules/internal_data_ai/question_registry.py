"""
Deterministic ESG Question Registry — Maps natural language to configured framework questions.

Architecture:
  USER QUESTION → Intent Detection → ESG Query Resolver → Framework/Module/Org Resolver → Query → Response

The registry provides:
  1. Direct synonym matching for known BRSR/GRI question keys
  2. Framework precedence (BRSR/GRI configured questions before generic ESG modules)
  3. Source authority (each concept has a canonical data source)
  4. Concept type distinction (policy/disclosure vs incident/event)
  5. Confidence scoring for match quality
"""

import re
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class RegisteredQuestion:
    """A known BRSR/GRI question with its canonical mapping."""
    question_key: str
    framework: str
    section: str
    principle: Optional[str]
    category: str
    source_collection: str
    synonyms: tuple[str, ...]
    concept_type: str
    key_terms: tuple[str, ...] = ()
    display_label: Optional[str] = None


# ── Response States ──────────────────────────────────────────────────
RESPONSE_FOUND = "FOUND"
RESPONSE_CONFIGURED_NO_RESPONSE = "CONFIGURED — RESPONSE NOT FOUND"
RESPONSE_NOT_CONFIGURED = "NOT CONFIGURED"
RESPONSE_QUERY_NOT_MAPPED = "QUERY NOT MAPPED"
RESPONSE_EMPTY = "RESPONSE EMPTY"


# ── Concept Type Indicators ──────────────────────────────────────────
_POLICY_INDICATORS = (
    "policy", "policies", "commitment", "describe", "what is",
    "do we have", "does the company have", "is there a",
    "disclosure", "practice", "practices", "mechanism",
    "approach", "framework", "guidelines", "code of conduct",
    "brief", "web link", "exists",
)
_INCIDENT_INDICATORS = (
    "incident", "incidents", "case", "cases", "how many",
    "reported", "count", "number of", "confirmed", "occurred",
    "complaints", "breaches", "violations", "no of",
)


# ── Question Registry ────────────────────────────────────────────────
QUESTION_REGISTRY: dict[str, RegisteredQuestion] = {
    # Section A: General Disclosures
    "brsr_a_cin": RegisteredQuestion(
        question_key="brsr_a_cin",
        framework="BRSR",
        section="section_a",
        principle=None,
        category="Company Information",
        source_collection="organization_esg_responses",
        synonyms=(
            "corporate identity number", "cin", "company cin",
            "corporate identification number", "cin number",
            "what is our cin", "company identification number",
        ),
        concept_type="identity",
        key_terms=("cin", "corporate identity", "identification number"),
    ),
    "brsr_a_entity_name": RegisteredQuestion(
        question_key="brsr_a_entity_name",
        framework="BRSR",
        section="section_a",
        principle=None,
        category="Company Information",
        source_collection="organization_esg_responses",
        synonyms=(
            "listed entity name", "entity name", "name of listed entity",
            "name of the listed entity",
        ),
        concept_type="identity",
        key_terms=("entity name", "listed entity"),
    ),
    "brsr_a_year_of_incorporation": RegisteredQuestion(
        question_key="brsr_a_year_of_incorporation",
        framework="BRSR",
        section="section_a",
        principle=None,
        category="Company Information",
        source_collection="organization_esg_responses",
        synonyms=(
            "year of incorporation", "incorporation year",
            "when was the company incorporated", "date of incorporation",
        ),
        concept_type="identity",
        key_terms=("incorporation", "year incorporated"),
    ),
    "brsr_a_registered_office": RegisteredQuestion(
        question_key="brsr_a_registered_office",
        framework="BRSR",
        section="section_a",
        principle=None,
        category="Company Information",
        source_collection="organization_esg_responses",
        synonyms=("registered office address", "registered address"),
        concept_type="identity",
        key_terms=("registered office", "registered address"),
    ),
    "brsr_a_corporate_address": RegisteredQuestion(
        question_key="brsr_a_corporate_address",
        framework="BRSR",
        section="section_a",
        principle=None,
        category="Company Information",
        source_collection="organization_esg_responses",
        synonyms=("corporate address", "corporate office address", "head office address"),
        concept_type="identity",
        key_terms=("corporate address", "head office"),
    ),
    "brsr_a_email": RegisteredQuestion(
        question_key="brsr_a_email",
        framework="BRSR",
        section="section_a",
        principle=None,
        category="Company Information",
        source_collection="organization_esg_responses",
        synonyms=("company email", "corporate email", "email address of entity"),
        concept_type="identity",
        key_terms=("email",),
    ),
    "brsr_a_telephone": RegisteredQuestion(
        question_key="brsr_a_telephone",
        framework="BRSR",
        section="section_a",
        principle=None,
        category="Company Information",
        source_collection="organization_esg_responses",
        synonyms=("company telephone", "corporate telephone", "contact number"),
        concept_type="identity",
        key_terms=("telephone", "phone number"),
    ),
    "brsr_a_website": RegisteredQuestion(
        question_key="brsr_a_website",
        framework="BRSR",
        section="section_a",
        principle=None,
        category="Company Information",
        source_collection="organization_esg_responses",
        synonyms=("company website", "corporate website", "website url"),
        concept_type="identity",
        key_terms=("website",),
    ),
    "brsr_a_stock_exchange": RegisteredQuestion(
        question_key="brsr_a_stock_exchange",
        framework="BRSR",
        section="section_a",
        principle=None,
        category="Company Information",
        source_collection="organization_esg_responses",
        synonyms=(
            "stock exchange", "which stock exchange",
            "listed on which exchange", "name of stock exchange",
        ),
        concept_type="identity",
        key_terms=("stock exchange", "listed exchange"),
    ),
    "brsr_a_paid_up_capital": RegisteredQuestion(
        question_key="brsr_a_paid_up_capital",
        framework="BRSR",
        section="section_a",
        principle=None,
        category="Company Information",
        source_collection="organization_esg_responses",
        synonyms=("paid up capital", "paid-up capital", "share capital"),
        concept_type="metric",
        key_terms=("paid up capital", "share capital"),
    ),
    "brsr_a_csr_applicability": RegisteredQuestion(
        question_key="brsr_a_csr_applicability",
        framework="BRSR",
        section="section_a",
        principle=None,
        category="CSR",
        source_collection="organization_esg_responses",
        synonyms=(
            "csr applicability", "csr applicable",
            "section 135 csr", "applicability under section 135",
            "corporate social responsibility applicability",
            "is csr applicable", "csr section 135",
            "section 135 applicability", "csr requirement",
        ),
        concept_type="applicability",
        key_terms=("csr", "applicability", "section 135", "corporate social responsibility"),
    ),
    "brsr_a_reporting_boundary": RegisteredQuestion(
        question_key="brsr_a_reporting_boundary",
        framework="BRSR",
        section="section_a",
        principle=None,
        category="Reporting",
        source_collection="organization_esg_responses",
        synonyms=("reporting boundary", "brsr reporting boundary", "organizational boundary for brsr"),
        concept_type="disclosure",
        key_terms=("reporting boundary",),
    ),
    "brsr_a_assurance_provider": RegisteredQuestion(
        question_key="brsr_a_assurance_provider",
        framework="BRSR",
        section="section_a",
        principle=None,
        category="Assurance",
        source_collection="organization_esg_responses",
        synonyms=("assurance provider", "name of assurance provider", "external assurance provider"),
        concept_type="identity",
        key_terms=("assurance provider",),
    ),
    "brsr_a_assurance_type": RegisteredQuestion(
        question_key="brsr_a_assurance_type",
        framework="BRSR",
        section="section_a",
        principle=None,
        category="Assurance",
        source_collection="organization_esg_responses",
        synonyms=("assurance type", "type of assurance", "assurance obtained"),
        concept_type="disclosure",
        key_terms=("assurance type",),
    ),
    "brsr_a_business_activities": RegisteredQuestion(
        question_key="brsr_a_business_activities",
        framework="BRSR",
        section="section_a",
        principle=None,
        category="Products & Services",
        source_collection="organization_esg_responses",
        synonyms=(
            "business activities", "main business activities",
            "principal business activities", "description of business activities",
        ),
        concept_type="disclosure",
        key_terms=("business activities",),
    ),
    "brsr_a_products_services": RegisteredQuestion(
        question_key="brsr_a_products_services",
        framework="BRSR",
        section="section_a",
        principle=None,
        category="Products & Services",
        source_collection="organization_esg_responses",
        synonyms=(
            "products and services", "products services",
            "key products", "main products and services",
        ),
        concept_type="disclosure",
        key_terms=("products", "services"),
    ),
    "brsr_a_plants_offices": RegisteredQuestion(
        question_key="brsr_a_plants_offices",
        framework="BRSR",
        section="section_a",
        principle=None,
        category="Operations",
        source_collection="organization_esg_responses",
        synonyms=("plants and offices", "number of plants", "office locations"),
        concept_type="disclosure",
        key_terms=("plants", "offices", "locations"),
    ),
    "brsr_a_markets_served": RegisteredQuestion(
        question_key="brsr_a_markets_served",
        framework="BRSR",
        section="section_a",
        principle=None,
        category="Operations",
        source_collection="organization_esg_responses",
        synonyms=("markets served", "locations of markets", "where are markets served"),
        concept_type="disclosure",
        key_terms=("markets served", "market locations"),
    ),
    "brsr_a_export_contribution": RegisteredQuestion(
        question_key="brsr_a_export_contribution",
        framework="BRSR",
        section="section_a",
        principle=None,
        category="Operations",
        source_collection="organization_esg_responses",
        synonyms=(
            "export contribution", "export contribution percentage",
            "contribution of exports", "percentage of exports",
        ),
        concept_type="metric",
        key_terms=("export", "contribution"),
    ),
    "brsr_a_customer_types": RegisteredQuestion(
        question_key="brsr_a_customer_types",
        framework="BRSR",
        section="section_a",
        principle=None,
        category="Operations",
        source_collection="organization_esg_responses",
        synonyms=("customer types", "types of customers", "customer brief"),
        concept_type="disclosure",
        key_terms=("customer types",),
    ),

    # Section C: Principle 1
    "p1_anticorruption_policy": RegisteredQuestion(
        question_key="p1_anticorruption_policy",
        framework="BRSR",
        section="section_c",
        principle="P1",
        category="Anti-corruption",
        source_collection="organization_esg_responses",
        synonyms=(
            "anti corruption policy", "anti-corruption policy",
            "anti bribery policy", "anti-bribery policy",
            "bribery policy", "anticorruption policy",
            "anti corruption and anti bribery policy",
            "do we have an anti-corruption policy",
            "do we have an anti-bribery policy",
            "bribery and corruption policy",
        ),
        concept_type="policy",
        key_terms=("anti-corruption", "anti corruption", "anticorruption", "bribery", "anti-bribery"),
    ),
    "p1_training_awareness_coverage": RegisteredQuestion(
        question_key="p1_training_awareness_coverage",
        framework="BRSR",
        section="section_c",
        principle="P1",
        category="Training & Awareness",
        source_collection="organization_esg_responses",
        synonyms=(
            "training and awareness programme", "training awareness coverage",
            "awareness programme coverage", "training coverage for ethics",
            "p1 training coverage",
        ),
        concept_type="metric",
        key_terms=("training", "awareness", "programme", "coverage"),
    ),
    "gri_101_5_a_i": RegisteredQuestion(
        question_key="gri_101_5_a_i",
        framework="GRI",
        section="environment",
        principle=None,
        category="Locations with biodiversity impacts",
        source_collection="organization_esg_responses",
        synonyms=(
            "areas of biodiversity importance",
            "area of biodiversity importance",
            "sites in areas of biodiversity importance",
            "sites near areas of biodiversity importance",
            "locations with biodiversity impacts",
        ),
        concept_type="disclosure",
        key_terms=("biodiversity importance", "ecologically sensitive area"),
        display_label="Areas of Biodiversity Importance",
    ),
}


def _normalize(text: str) -> str:
    text = (text or "").lower().strip()
    text = re.sub(r"[''`]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text


def _contains_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(re.search(rf"\b{re.escape(term)}\b", text) for term in terms)


def _is_policy_question(text: str) -> bool:
    return _contains_any(text, _POLICY_INDICATORS)


def _is_incident_question(text: str) -> bool:
    return _contains_any(text, _INCIDENT_INDICATORS)


@dataclass
class FrameworkResolution:
    """Result of the ESG query resolver."""
    question_key: str
    framework: str
    section: str
    principle: Optional[str]
    category: str
    source_collection: str
    concept_type: str
    confidence: float
    matched_synonym: Optional[str] = None
    source_path: Optional[str] = None
    display_label: Optional[str] = None


def _score_question(text: str, question: RegisteredQuestion) -> tuple[float, Optional[str]]:
    """Score how well a user question matches a registered question."""
    best_score = 0.0
    best_match = None

    # 1. Question key verbatim in text (user typed the key itself)
    if question.question_key.lower() in text:
        return 0.98, question.question_key

    # 2. Exact synonym match
    for synonym in question.synonyms:
        ns = _normalize(synonym)
        if ns in text:
            score = 1.0 if text == ns else 0.95
            if score > best_score:
                best_score = score
                best_match = synonym

    # 3. Key-term matching
    if best_score < 0.8 and question.key_terms:
        matched = sum(1 for term in question.key_terms if term in text)
        if matched:
            term_score = 0.5 + 0.35 * (matched / len(question.key_terms))
            if term_score > best_score:
                best_score = term_score
                best_match = f"terms:{matched}/{len(question.key_terms)}"

    return best_score, best_match


def resolve_esg_query(question: str) -> Optional[FrameworkResolution]:
    """
    Unified ESG Query Resolver.

    Resolution order:
      1. Check Question Registry for direct synonym / key-term matches
      2. Apply concept-type disambiguation (policy vs incident)
      3. Return highest-confidence match with source authority

    Returns None if no framework question matches (falls through to ESG module routing).
    """
    text = _normalize(question)
    if not text:
        return None

    candidates: list[tuple[float, RegisteredQuestion, Optional[str]]] = []
    for registered in QUESTION_REGISTRY.values():
        score, matched = _score_question(text, registered)
        if score > 0.0:
            candidates.append((score, registered, matched))

    if not candidates:
        return None

    candidates.sort(key=lambda c: c[0], reverse=True)
    top_score, top_q, top_match = candidates[0]

    # Concept-type disambiguation for close/ambiguous matches
    if top_score < 0.7 and len(candidates) > 1:
        if _is_policy_question(text):
            policy = [(s, q, m) for s, q, m in candidates if q.concept_type in ("policy", "disclosure", "practice", "applicability")]
            if policy:
                top_score, top_q, top_match = policy[0]
        elif _is_incident_question(text):
            metrics = [(s, q, m) for s, q, m in candidates if q.concept_type == "metric"]
            if metrics:
                top_score, top_q, top_match = metrics[0]
            else:
                return None  # Generic ESG incident — let module routing handle it

    # Anti-corruption special case: incident question should NOT match the policy entry
    if top_q.question_key == "p1_anticorruption_policy" and _is_incident_question(text) and not _is_policy_question(text):
        return None

    if top_score < 0.4:
        return None

    source_path = f"{top_q.framework} → {top_q.category}"
    if top_q.principle:
        source_path = f"{top_q.framework} → {top_q.principle} → {top_q.category}"

    return FrameworkResolution(
        question_key=top_q.question_key,
        framework=top_q.framework,
        section=top_q.section,
        principle=top_q.principle,
        category=top_q.category,
        source_collection=top_q.source_collection,
        concept_type=top_q.concept_type,
        confidence=top_score,
        matched_synonym=top_match,
        source_path=source_path,
        display_label=top_q.display_label,
    )
