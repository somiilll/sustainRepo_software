"""
Dynamic ESG Question Registry — Auto-syncs from esg_question_configs.

Architecture:
  esg_question_configs (DB source of truth)
      ↓
  DynamicQuestionRegistry (in-memory index with TTL refresh)
      ↓
  resolve() → FrameworkResolution

The registry:
  1. Loads all configured framework questions from the database
  2. Builds a searchable index with auto-generated + manually curated synonyms
  3. Resolves user questions to canonical question_keys
  4. Respects organization-specific overrides
  5. Logs diagnostic information for every resolution attempt
"""

import logging
import re
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)

# ── Data States ──────────────────────────────────────────────────────
class DataState(str, Enum):
    FOUND = "FOUND"
    CONFIGURED_NO_RESPONSE = "CONFIGURED_NO_RESPONSE"
    NOT_CONFIGURED = "NOT_CONFIGURED"
    MAPPING_NOT_FOUND = "MAPPING_NOT_FOUND"
    RESPONSE_EMPTY = "RESPONSE_EMPTY"
    NOT_AUTHORIZED = "NOT_AUTHORIZED"


# Legacy aliases used by brsr.py / gri.py / response_builder.py
RESPONSE_FOUND = DataState.FOUND.value
RESPONSE_CONFIGURED_NO_RESPONSE = DataState.CONFIGURED_NO_RESPONSE.value
RESPONSE_NOT_CONFIGURED = DataState.NOT_CONFIGURED.value
RESPONSE_EMPTY = DataState.RESPONSE_EMPTY.value
RESPONSE_MAPPING_NOT_FOUND = DataState.MAPPING_NOT_FOUND.value


# ── Concept Type Indicators ──────────────────────────────────────────
_POLICY_INDICATORS = (
    "policy", "policies", "commitment", "describe", "what is",
    "do we have", "does the company have", "is there a",
    "disclosure", "practice", "practices", "mechanism",
    "approach", "framework", "guidelines", "code of conduct",
    "brief", "web link", "exists", "cover", "coverage",
)
_INCIDENT_INDICATORS = (
    "incident", "incidents", "case", "cases", "how many",
    "reported", "count", "number of", "confirmed", "occurred",
    "complaints", "breaches", "violations", "no of",
)


# ── Data Classes ─────────────────────────────────────────────────────
@dataclass(frozen=True)
class FrameworkQuestionConfig:
    """A framework question loaded from esg_question_configs."""
    question_key: str
    framework: str
    section: str
    principle: Optional[str]
    question_text: str
    question_type: str
    source_collection: str = "organization_esg_responses"
    auto_synonyms: tuple[str, ...] = ()
    concept_type: str = "disclosure"


@dataclass
class ResolutionDiagnostic:
    """Diagnostic info for a single resolution attempt."""
    detected_intent: str = ""
    framework: str = ""
    candidate_question: str = ""
    question_key: str = ""
    source_collection: str = ""
    reporting_period: str = ""
    organization_id: str = ""
    resolution_confidence: float = 0.0
    data_state: str = ""
    matched_via: str = ""


@dataclass(frozen=True)
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
    diagnostic: Optional[ResolutionDiagnostic] = None


# ── Synonym Boosts (manually curated for high-value questions) ───────
# These supplement auto-generated synonyms from question text.
# Format: question_key → (synonyms, key_terms, display_label, concept_type_override)
@dataclass(frozen=True)
class SynonymBoost:
    synonyms: tuple[str, ...]
    key_terms: tuple[str, ...] = ()
    display_label: Optional[str] = None
    concept_type: Optional[str] = None


_SYNONYM_BOOSTS: dict[str, SynonymBoost] = {
    "brsr_a_cin": SynonymBoost(
        synonyms=("corporate identity number", "cin", "company cin", "cin number", "what is our cin"),
        key_terms=("cin", "corporate identity"),
        concept_type="identity",
    ),
    "brsr_a_entity_name": SynonymBoost(
        synonyms=("listed entity name", "entity name", "name of listed entity", "company name"),
        key_terms=("entity name", "listed entity"),
        concept_type="identity",
    ),
    "brsr_a_year_of_incorporation": SynonymBoost(
        synonyms=("year of incorporation", "incorporation year", "when was the company incorporated"),
        key_terms=("incorporation", "year incorporated"),
        concept_type="identity",
    ),
    "brsr_a_registered_address": SynonymBoost(
        synonyms=("registered office address", "registered address"),
        key_terms=("registered office", "registered address"),
        concept_type="identity",
    ),
    "brsr_a_corporate_address": SynonymBoost(
        synonyms=("corporate address", "corporate office address", "head office address"),
        key_terms=("corporate address", "head office"),
        concept_type="identity",
    ),
    "brsr_a_email": SynonymBoost(
        synonyms=("company email", "corporate email", "email address of entity"),
        key_terms=("email",),
        concept_type="identity",
    ),
    "brsr_a_telephone": SynonymBoost(
        synonyms=("company telephone", "corporate telephone", "contact number"),
        key_terms=("telephone", "phone number"),
        concept_type="identity",
    ),
    "brsr_a_website": SynonymBoost(
        synonyms=("company website", "corporate website", "website url"),
        key_terms=("website",),
        concept_type="identity",
    ),
    "brsr_a_stock_exchange": SynonymBoost(
        synonyms=("stock exchange", "which stock exchange", "listed on which exchange"),
        key_terms=("stock exchange", "listed exchange"),
        concept_type="identity",
    ),
    "brsr_a_paid_up_capital": SynonymBoost(
        synonyms=("paid up capital", "paid-up capital", "share capital"),
        key_terms=("paid up capital", "share capital"),
        concept_type="metric",
    ),
    "brsr_a_csr_applicability": SynonymBoost(
        synonyms=(
            "csr applicability", "csr applicable", "section 135 csr",
            "corporate social responsibility applicability", "is csr applicable",
            "csr section 135", "section 135 applicability",
        ),
        key_terms=("csr", "applicability", "section 135"),
        concept_type="applicability",
    ),
    "brsr_a_reporting_boundary": SynonymBoost(
        synonyms=("reporting boundary", "brsr reporting boundary", "organizational boundary"),
        key_terms=("reporting boundary",),
        concept_type="disclosure",
    ),
    "brsr_a_assurance_provider": SynonymBoost(
        synonyms=("assurance provider", "name of assurance provider", "external assurance"),
        key_terms=("assurance provider",),
        concept_type="identity",
    ),
    "brsr_a_assurance_type": SynonymBoost(
        synonyms=("assurance type", "type of assurance", "assurance obtained"),
        key_terms=("assurance type",),
        concept_type="disclosure",
    ),
    "brsr_a_business_activities": SynonymBoost(
        synonyms=("business activities", "main business activities", "principal business activities"),
        key_terms=("business activities",),
        concept_type="disclosure",
    ),
    "brsr_a_products_services": SynonymBoost(
        synonyms=("products and services", "key products", "main products and services"),
        key_terms=("products", "services"),
        concept_type="disclosure",
    ),
    "ngrbc_policy_matrix": SynonymBoost(
        synonyms=(
            "policy coverage across ngrbc principles", "ngrbc policy coverage",
            "policy cover principles", "policies covering ngrbc principles",
            "which ngrbc principles are covered", "policy coverage",
            "do our policies cover the ngrbc principles",
            "how many ngrbc principles are covered",
            "ngrbc principles covered by policies",
        ),
        key_terms=("ngrbc", "policy coverage", "principles covered", "policy cover"),
        display_label="NGRBC Policy Coverage Matrix",
        concept_type="policy",
    ),
    "p1_anticorruption_policy": SynonymBoost(
        synonyms=(
            "anti corruption policy", "anti-corruption policy",
            "anti bribery policy", "anti-bribery policy",
            "bribery policy", "anticorruption policy",
            "do we have an anti-corruption policy",
            "bribery and corruption policy",
        ),
        key_terms=("anti-corruption", "anti corruption", "bribery", "anti-bribery"),
        concept_type="policy",
    ),
    "p1_training_awareness_coverage": SynonymBoost(
        synonyms=(
            "training and awareness programme", "training awareness coverage",
            "awareness programme coverage", "training coverage for ethics",
            "p1 training coverage", "training and awareness program",
        ),
        key_terms=("training", "awareness", "programme", "coverage"),
        concept_type="metric",
    ),
    "gri_101_5_a_i": SynonymBoost(
        synonyms=(
            "areas of biodiversity importance", "sites in areas of biodiversity importance",
            "locations with biodiversity impacts",
        ),
        key_terms=("biodiversity importance", "ecologically sensitive area"),
        display_label="Areas of Biodiversity Importance",
        concept_type="disclosure",
    ),
}


# ── Text Utilities ───────────────────────────────────────────────────
def _normalize(text: str) -> str:
    text = (text or "").lower().strip()
    text = re.sub(r"[\u2018\u2019\u201c\u201d`\"']", "", text)
    text = re.sub(r"\s+", " ", text)
    return text


def _contains_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(re.search(rf"\b{re.escape(term)}\b", text) for term in terms)


def _is_policy_question(text: str) -> bool:
    return _contains_any(text, _POLICY_INDICATORS)


def _is_incident_question(text: str) -> bool:
    return _contains_any(text, _INCIDENT_INDICATORS)


def _extract_synonyms_from_question(question_text: str, question_key: str) -> list[str]:
    """Auto-generate search synonyms from the question's own text."""
    text = _normalize(question_text)
    synonyms = []
    if text and len(text) > 10:
        synonyms.append(text)
        # Remove common BRSR preamble patterns
        cleaned = re.sub(r"^(provide |details of |whether |what is the |describe |indicate )", "", text)
        if cleaned != text and len(cleaned) > 10:
            synonyms.append(cleaned)
        # Remove trailing format instructions
        cleaned2 = re.sub(r",?\s*in the following format[:\s]*$", "", cleaned)
        if cleaned2 != cleaned and len(cleaned2) > 10:
            synonyms.append(cleaned2)
    # Also add the question_key as a searchable term (underscores → spaces)
    key_as_text = question_key.replace("_", " ")
    if len(key_as_text) > 3:
        synonyms.append(key_as_text)
    return synonyms


def _infer_concept_type(question_text: str, question_type: str) -> str:
    """Infer concept type from question metadata."""
    text = _normalize(question_text)
    if _is_incident_question(text):
        return "incident"
    if question_type in ("conditional_yes_no_text", "yes_no_with_text", "yes_no_with_description"):
        return "policy"
    if _is_policy_question(text):
        return "policy"
    if question_type in ("number", "currency", "percentage_with_description"):
        return "metric"
    if question_type in ("dynamic_table", "table", "fy_comparison_table", "fixed_row_table"):
        return "metric"
    return "disclosure"


def _build_source_path(framework: str, section: str, principle: Optional[str], category: str) -> str:
    parts = [framework]
    if principle and principle not in ("SECTION_A", "SECTION_B"):
        parts.append(principle)
    if category:
        parts.append(category)
    elif section:
        parts.append(section.replace("_", " ").title())
    return " → ".join(parts)


# ── Dynamic Question Registry ────────────────────────────────────────
_CACHE_TTL_SECONDS = 300  # 5 minutes
_registry_cache: Optional["DynamicQuestionRegistry"] = None
_cache_timestamp: float = 0


class DynamicQuestionRegistry:
    """In-memory index of all configured framework questions, loaded from DB."""

    def __init__(self, configs: list[FrameworkQuestionConfig]):
        self._configs: dict[str, FrameworkQuestionConfig] = {c.question_key: c for c in configs}
        self._synonym_index: dict[str, list[tuple[str, float]]] = {}
        self._key_term_index: dict[str, list[tuple[str, int]]] = {}
        self._build_index()

    @property
    def question_count(self) -> int:
        return len(self._configs)

    def _build_index(self):
        """Build inverted indexes for fast synonym and key-term lookup."""
        for key, config in self._configs.items():
            # Auto-generated synonyms from question text
            for syn in config.auto_synonyms:
                ns = _normalize(syn)
                if ns:
                    self._synonym_index.setdefault(ns, []).append((key, 0.70))

            # Manually curated boosts
            boost = _SYNONYM_BOOSTS.get(key)
            if boost:
                for syn in boost.synonyms:
                    ns = _normalize(syn)
                    if ns:
                        self._synonym_index.setdefault(ns, []).append((key, 0.95))
                for term in boost.key_terms:
                    nt = _normalize(term)
                    if nt:
                        self._key_term_index.setdefault(nt, []).append((key, len(boost.key_terms)))

    def get_config(self, question_key: str) -> Optional[FrameworkQuestionConfig]:
        return self._configs.get(question_key)

    def resolve(self, question: str, org_id: str = "") -> Optional[FrameworkResolution]:
        """Resolve a user question to a canonical framework question.

        Scoring layers (highest to lowest):
          1. Exact question_key match in text (0.98)
          2. Curated synonym exact match (0.95)
          3. Auto-generated synonym match (0.70 base, boosted by coverage)
          4. Key-term overlap (0.50–0.85)
          5. Word-level overlap with question text (0.40–0.65)
        """
        text = _normalize(question)
        if not text:
            return None

        candidates: list[tuple[float, str, str]] = []  # (score, question_key, matched_via)

        # Layer 1: Exact question_key in text
        for key in self._configs:
            if key.lower() in text:
                candidates.append((0.98, key, f"key_verbatim:{key}"))

        # Layer 2+3: Synonym index lookup
        for synonym, entries in self._synonym_index.items():
            if synonym in text:
                is_exact = (text == synonym)
                for key, base_score in entries:
                    score = min(base_score + 0.05, 1.0) if is_exact else base_score
                    candidates.append((score, key, f"synonym:{synonym}"))

        # Layer 4: Key-term matching
        for term, entries in self._key_term_index.items():
            if re.search(rf"\b{re.escape(term)}\b", text):
                for key, total_terms in entries:
                    # Count how many of this key's terms match
                    boost = _SYNONYM_BOOSTS.get(key)
                    if boost and boost.key_terms:
                        matched = sum(1 for t in boost.key_terms if re.search(rf"\b{re.escape(_normalize(t))}\b", text))
                        score = 0.50 + 0.35 * (matched / len(boost.key_terms))
                        candidates.append((score, key, f"terms:{matched}/{len(boost.key_terms)}"))

        # Layer 5: Word-overlap with question text (for questions without curated synonyms)
        if not candidates or max(c[0] for c in candidates) < 0.60:
            text_words = set(re.findall(r"\b[a-z]{3,}\b", text))
            stop_words = {"the", "and", "for", "our", "what", "how", "does", "have", "are", "was", "were", "this", "that", "with", "from"}
            text_words -= stop_words
            if text_words:
                for key, config in self._configs.items():
                    q_words = set(re.findall(r"\b[a-z]{3,}\b", _normalize(config.question_text)))
                    q_words -= stop_words
                    if not q_words:
                        continue
                    overlap = text_words & q_words
                    if len(overlap) >= 2:
                        coverage = len(overlap) / max(len(text_words), len(q_words))
                        score = 0.40 + 0.25 * coverage
                        candidates.append((score, key, f"word_overlap:{','.join(sorted(overlap))}"))

        if not candidates:
            return None

        # Deduplicate: keep best score per question_key
        best_per_key: dict[str, tuple[float, str]] = {}
        for score, key, via in candidates:
            if key not in best_per_key or score > best_per_key[key][0]:
                best_per_key[key] = (score, via)

        # Sort by score descending
        ranked = sorted(best_per_key.items(), key=lambda x: x[1][0], reverse=True)
        top_key, (top_score, top_via) = ranked[0]

        # Concept-type disambiguation for close matches
        if top_score < 0.70 and len(ranked) > 1:
            if _is_policy_question(text) and not _is_incident_question(text):
                for key, (score, via) in ranked:
                    config = self._configs[key]
                    boost = _SYNONYM_BOOSTS.get(key)
                    ctype = (boost.concept_type if boost and boost.concept_type else config.concept_type)
                    if ctype in ("policy", "disclosure", "applicability"):
                        top_key, top_score, top_via = key, score, via
                        break
            elif _is_incident_question(text) and not _is_policy_question(text):
                for key, (score, via) in ranked:
                    config = self._configs[key]
                    boost = _SYNONYM_BOOSTS.get(key)
                    ctype = (boost.concept_type if boost and boost.concept_type else config.concept_type)
                    if ctype in ("incident", "metric"):
                        top_key, top_score, top_via = key, score, via
                        break

        # Anti-corruption disambiguation: incident question should not match policy
        if top_key == "p1_anticorruption_policy" and _is_incident_question(text) and not _is_policy_question(text):
            return None

        if top_score < 0.40:
            return None

        config = self._configs[top_key]
        boost = _SYNONYM_BOOSTS.get(top_key)
        concept_type = (boost.concept_type if boost and boost.concept_type else config.concept_type)
        display_label = (boost.display_label if boost and boost.display_label else None)
        category = _section_to_category(config.section, config.principle)
        source_path = _build_source_path(config.framework, config.section, config.principle, category)

        diagnostic = ResolutionDiagnostic(
            detected_intent="FRAMEWORK_QUESTION_LOOKUP",
            framework=config.framework,
            candidate_question=config.question_text[:100],
            question_key=top_key,
            source_collection=config.source_collection,
            organization_id=org_id,
            resolution_confidence=round(top_score, 3),
            matched_via=top_via,
        )

        logger.info(
            "question_registry resolved: key=%s confidence=%.3f via=%s framework=%s",
            top_key, top_score, top_via, config.framework,
        )

        return FrameworkResolution(
            question_key=top_key,
            framework=config.framework,
            section=config.section,
            principle=config.principle,
            category=category,
            source_collection=config.source_collection,
            concept_type=concept_type,
            confidence=round(top_score, 3),
            matched_synonym=top_via,
            source_path=source_path,
            display_label=display_label,
            diagnostic=diagnostic,
        )


def _section_to_category(section: str, principle: Optional[str]) -> str:
    """Map section/principle to a human-readable category."""
    if principle and principle.startswith("P"):
        principle_names = {
            "P1": "Ethics & Transparency",
            "P2": "Sustainable Products",
            "P3": "Employee Wellbeing",
            "P4": "Stakeholder Responsiveness",
            "P5": "Human Rights",
            "P6": "Environment Protection",
            "P7": "Policy Advocacy",
            "P8": "Inclusive Growth",
            "P9": "Consumer Value",
        }
        return principle_names.get(principle, principle)
    section_names = {
        "section_a": "General Disclosures",
        "section_b": "Management & Process",
        "section_c": "Principle-wise Performance",
        "environment": "Environment",
        "social": "Social",
        "governance": "Governance",
    }
    return section_names.get(section, section or "General")


# ── DB Loading ───────────────────────────────────────────────────────
async def _load_configs_from_db() -> list[FrameworkQuestionConfig]:
    """Load all framework question configs from esg_question_configs."""
    from shared.database.mongo import db

    cursor = db.esg_question_configs.find(
        {"frameworks": {"$exists": True, "$ne": []}},
        {
            "_id": 0, "question_key": 1, "question": 1, "section": 1,
            "frameworks": 1, "framework": 1, "brsr_principle": 1,
            "principle": 1, "type": 1, "group": 1,
        },
    )
    docs = await cursor.to_list(2000)
    configs = []
    for doc in docs:
        key = doc.get("question_key")
        if not key:
            continue
        frameworks = doc.get("frameworks") or ([doc["framework"]] if doc.get("framework") else [])
        for fw in frameworks:
            fw_upper = fw.upper()
            principle = doc.get("brsr_principle") or doc.get("principle")
            question_text = doc.get("question") or ""
            question_type = doc.get("type") or "text"
            auto_synonyms = tuple(_extract_synonyms_from_question(question_text, key))
            concept_type = _infer_concept_type(question_text, question_type)

            configs.append(FrameworkQuestionConfig(
                question_key=key,
                framework=fw_upper,
                section=doc.get("section") or "",
                principle=principle,
                question_text=question_text,
                question_type=question_type,
                source_collection="organization_esg_responses",
                auto_synonyms=auto_synonyms,
                concept_type=concept_type,
            ))

    logger.info("Loaded %d framework question configs from DB", len(configs))
    return configs


async def get_registry() -> DynamicQuestionRegistry:
    """Get the cached registry, refreshing from DB if stale."""
    global _registry_cache, _cache_timestamp
    now = time.time()
    if _registry_cache is not None and (now - _cache_timestamp) < _CACHE_TTL_SECONDS:
        return _registry_cache
    configs = await _load_configs_from_db()
    _registry_cache = DynamicQuestionRegistry(configs)
    _cache_timestamp = now
    logger.info("Question registry refreshed: %d questions indexed", _registry_cache.question_count)
    return _registry_cache


async def refresh_registry() -> DynamicQuestionRegistry:
    """Force refresh the registry from DB."""
    global _cache_timestamp
    _cache_timestamp = 0
    return await get_registry()


async def resolve_esg_query(question: str, org_id: str = "") -> Optional[FrameworkResolution]:
    """Public API: resolve a user question to a framework question.

    This is the main entry point called by query_understanding.py.
    """
    registry = await get_registry()
    return registry.resolve(question, org_id)


def build_test_registry(extra_configs: list[FrameworkQuestionConfig] = None) -> DynamicQuestionRegistry:
    """Build a registry from synonym boosts only (no DB), for unit tests.

    Optionally accepts extra FrameworkQuestionConfig entries to simulate DB data.
    """
    configs = []
    for key, boost in _SYNONYM_BOOSTS.items():
        configs.append(FrameworkQuestionConfig(
            question_key=key,
            framework="GRI" if key.startswith("gri_") else "BRSR",
            section=_guess_section(key),
            principle=_guess_principle(key),
            question_text=" ".join(boost.synonyms[:1]) if boost.synonyms else key,
            question_type="text",
            source_collection="organization_esg_responses",
            auto_synonyms=(),
            concept_type=boost.concept_type or "disclosure",
        ))
    if extra_configs:
        configs.extend(extra_configs)
    return DynamicQuestionRegistry(configs)


def set_test_registry(registry: DynamicQuestionRegistry):
    """Inject a test registry into the module cache. For tests only."""
    global _registry_cache, _cache_timestamp
    _registry_cache = registry
    _cache_timestamp = time.time() + 99999  # Never expire during tests


def _guess_section(key: str) -> str:
    if key.startswith("brsr_a_"):
        return "section_a"
    if key.startswith("ngrbc_") or key.startswith("policy_"):
        return "section_b"
    if key.startswith("p") and "_" in key:
        return "section_c"
    if key.startswith("gri_"):
        return "environment"
    return ""


def _guess_principle(key: str) -> Optional[str]:
    import re as _re
    m = _re.match(r"^(p[1-9])_", key)
    return m.group(1).upper() if m else None
