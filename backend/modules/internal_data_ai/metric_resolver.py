"""Deterministic ESG metric routing and configuration-aware field resolution."""
from dataclasses import dataclass
import re
from typing import Optional


@dataclass(frozen=True)
class MetricResolution:
    section: str
    category: Optional[str]
    subcategory: Optional[str] = None
    field_key: Optional[str] = None
    field_label: Optional[str] = None
    field_aliases: tuple[str, ...] = ()
    derived_metric: Optional[str] = None
    data_source: str = "esg_records"
    semantic_terms: tuple[str, ...] = ()
    ghg_scope: Optional[str] = None
    value_kind: Optional[str] = None
    field_value_filter: Optional[dict] = None
    field_terms: tuple[str, ...] = ()


_WATER_TERMS = (
    "water", "groundwater", "ground water", "surface water", "seawater",
    "desalinated", "water stress", "water-stressed", "water stressed",
)

_WATER_FIELDS = {
    "Consumption": {
        "default": ("quantity", "Total Water Consumed", ("quantity", "total water consumed", "water consumption", "water consumed")),
        "stress": ("quantity_consumed_in_water_stress_area", "Quantity consumed in water stress area", ("quantity consumed in water stress area", "water stress area", "water-stressed", "water stressed")),
        "ground": ("water_consumed_through_ground_water", "Water consumed through Ground Water", ("water consumed through ground water", "groundwater", "ground water")),
        "surface": ("water_consumed_through_surface_water", "Water consumed through Surface Water", ("water consumed through surface water", "surface water")),
        "third_party": ("water_consumed_through_third_party_water", "Water consumed through Third party Water", ("water consumed through third party water", "third party water")),
        "seawater": ("water_consumed_through_seawater_desalinated_water", "Water consumed through Seawater / Desalinated water", ("seawater", "desalinated")),
        "storage": ("change_in_water_storage", "Change in water storage", ("change in water storage", "water storage")),
    },
    "Withdrawal": {
        "default": ("quantity", "Total Water withdrawal", ("quantity", "total water withdrawal", "water withdrawal", "water withdrawn")),
        "stress": ("water_withdrawal_in_water_stress_area", "Water withdrawal in water stress area", ("water withdrawal in water stress area", "water stress area", "water-stressed", "water stressed")),
        "ground": ("water_withdrawal_through_ground_water", "Water withdrawal through Ground Water", ("water withdrawal through ground water", "groundwater", "ground water")),
        "surface": ("water_withdrawal_through_surface_water", "Water withdrawal through Surface Water", ("water withdrawal through surface water", "surface water")),
        "third_party": ("water_withdrawal_through_third_party_water", "Water withdrawal through Third party Water", ("water withdrawal through third party water", "third party water")),
        "seawater": ("water_withdrawal_through_seawater_desalinated_water", "Water withdrawal through Seawater / Desalinated water", ("seawater", "desalinated")),
        "freshwater": ("freshwater_withdrawal", "Freshwater Withdrawal (≤1,000 mg/L Total Dissolved Solids)", ("freshwater withdrawal", "freshwater")),
        "other": ("other_water_withdrawal", "Other Water Withdrawal (>1,000 mg/L Total Dissolved Solids)", ("other water withdrawal", "other withdrawal")),
    },
    "Discharge": {
        "default": ("quantity", "Quantity", ("quantity", "water discharged", "water discharge", "outflow", "release")),
        "stress": ("quantity_discharged_to_water_stress_area", "Quantity discharged to water stress area", ("quantity discharged to water stress area", "water stress area", "water-stressed", "water stressed")),
        "ground": ("water_discharged_to_ground_water", "Water discharged to Ground Water", ("water discharged to ground water", "groundwater", "ground water")),
        "surface": ("water_discharged_to_surface_water", "Water discharged to Surface Water", ("water discharged to surface water", "surface water")),
        "third_party": ("water_discharged_to_third_party_water", "Water discharged to Third party Water", ("water discharged to third party water", "third party water")),
        "seawater": ("water_discharged_to_seawater_desalinated_water", "Water discharged to Seawater / Desalinated water", ("seawater", "desalinated")),
        "other_org": ("water_sent_for_use_to_other_organization", "Water sent for use to other organization", ("other organization", "sent for use")),
        "freshwater": ("freshwater_discharge", "Freshwater Discharge (≤1,000 mg/L Total Dissolved Solids)", ("freshwater discharge", "freshwater")),
        "other": ("other_water_discharge", "Other Water Discharge (>1,000 mg/L Total Dissolved Solids)", ("other water discharge", "other discharge")),
        "untreated": ("water_discharged_with_no_treatment_done", "Water discharged with no treatment done", ("without treatment", "no treatment", "untreated")),
        "treated": ("quantity_discharged_with_treatment_done", "Quantity discharged with treatment done", ("treatment done", "treated")),
        "primary": ("water_discharged_with_primary_level_treatment_done", "Water discharged with Primary Level Treatment Done", ("primary level treatment", "primary treatment")),
        "secondary": ("water_discharged_with_secondary_level_treatment_done", "Water discharged with Secondary Level Treatment Done", ("secondary level treatment", "secondary treatment")),
        "tertiary": ("water_discharged_with_tertiary_level_treatment_done", "Water discharged with Tertiary Level Treatment Done", ("tertiary level treatment", "tertiary treatment")),
    },
    "Recycle": {
        "default": ("total_quantity_of_water_recycled", "Total Quantity of water recycled", ("total quantity of water recycled", "water recycled", "water reuse", "recycled water")),
    },
}


def _contains_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(re.search(rf"\b{re.escape(term)}\b", text) for term in terms)


def _field_definition(subcategory: str, selector: str) -> MetricResolution:
    field_key, field_label, aliases = _WATER_FIELDS[subcategory][selector]
    return MetricResolution(
        section="environment",
        category="Water",
        subcategory=subcategory,
        field_key=field_key,
        field_label=field_label,
        field_aliases=aliases,
    )


def water_primary_metric(subcategory: str) -> MetricResolution:
    """Return a Water subcategory's configured primary field for derived calculations."""
    return _field_definition(subcategory, "default")


def resolve_water_metric(question: str) -> Optional[MetricResolution]:
    """Resolve Water wording to a fixed category, subcategory, and field contract."""
    text = (question or "").lower()
    if not _contains_any(text, _WATER_TERMS):
        return None

    if (_contains_any(text, ("recycling percentage", "recycle percentage", "water recycle %", "water recycling %"))
            or ("percentage" in text and _contains_any(text, ("recycle", "recycled", "recycling", "reuse", "reused")))):
        recycle = _field_definition("Recycle", "default")
        return MetricResolution(**{**recycle.__dict__, "derived_metric": "water_recycling_percentage"})

    if _contains_any(text, ("recycle", "recycled", "recycling", "reuse", "reused")):
        return _field_definition("Recycle", "default")
    if _contains_any(text, ("discharge", "discharged", "outflow", "release", "released", "wastewater")):
        subcategory = "Discharge"
    elif _contains_any(text, ("withdrawal", "withdraw", "withdrawn", "intake", "water taken", "abstraction")):
        subcategory = "Withdrawal"
    elif _contains_any(text, ("consumption", "consumed", "consume", "usage", "use", "used", "water use", "water usage")):
        subcategory = "Consumption"
    else:
        return MetricResolution(section="environment", category="Water")

    selectors = _WATER_FIELDS[subcategory]
    for selector in ("primary", "secondary", "tertiary", "untreated", "treated", "other_org", "stress", "ground", "surface", "third_party", "seawater", "freshwater", "other", "storage"):
        if selector in selectors and _contains_any(text, selectors[selector][2]):
            return _field_definition(subcategory, selector)
    return _field_definition(subcategory, "default")


def _semantic_terms(text: str, terms: tuple[str, ...]) -> tuple[str, ...]:
    """Keep only explicit domain terms for configuration-based field matching."""
    return tuple(term for term in terms if term in text)


def resolve_environment_metric(question: str) -> Optional[MetricResolution]:
    """Route non-Water Environment topics while leaving evolving field schemas configuration-driven."""
    text = (question or "").lower()
    if _contains_any(text, ("carbon offsets", "ghg offsets", "offset credits", "emissions offsets", "offset")):
        return MetricResolution("environment", "Other Emissions", "GHG Emissions - Offsets", semantic_terms=("offset",))
    if _contains_any(text, ("carbon credits", "carbon credit")):
        return MetricResolution("environment", "Other Emissions", "GHG Emissions - Carbon Credits", semantic_terms=("carbon", "credit"))
    if _contains_any(text, ("ozone-depleting", "ozone depletion", "ods", "refrigerant")):
        return MetricResolution("environment", "Other Emissions", "Ozone-depleting substances (ODS)", semantic_terms=("ozone", "ods", "refrigerant"))
    if _contains_any(text, ("air emissions", "nox", "sox", "particulate", "voc", "hap", "pap", "air pollutants", "pollutants")):
        parameter = next((term for term in ("nox", "sox", "pm", "particulate", "voc", "hap", "pap") if term in text), None)
        return MetricResolution(
            "environment", "Other Emissions", "Air Emissions", "quantity", "Emissions", ("quantity", "emissions"),
            semantic_terms=_semantic_terms(text, ("nox", "sox", "pm", "particulate", "voc", "hap", "pap", "pollutant")),
            field_value_filter={"parameter": parameter} if parameter else None,
        )
    if _contains_any(text, ("waste", "waste generated", "waste disposed", "waste recycled", "waste recovered", "waste treatment", "waste diversion", "waste reuse", "spill", "spillage")):
        subcategory = None
        if _contains_any(text, ("disposed", "disposal", "landfill", "incineration")):
            subcategory = "Disposal"
        elif _contains_any(text, ("recycled", "recovered", "diverted", "reuse", "re-used")):
            subcategory = "Recovered / Diverted from disposal"
        elif _contains_any(text, ("generated", "generation")):
            subcategory = "Generated"
        elif _contains_any(text, ("spill", "spills", "spillage")):
            subcategory = "Spills"
        routing_terms = _semantic_terms(text, (
            "waste", "generated", "disposed", "disposal", "recycled", "recovered", "diverted", "hazardous",
            "non-hazardous", "plastic", "e-waste", "incineration", "landfill", "spill", "spillage",
        ))
        field_terms = _semantic_terms(text, (
            "hazardous", "non-hazardous", "plastic", "e-waste", "battery", "radioactive", "bio-medical",
            "onsite", "offsite", "construction", "demolition",
        ))
        if subcategory == "Spills" and _contains_any(text, ("how", "amount", "quantity", "volume")):
            field_terms = (*field_terms, "volume")
        return MetricResolution("environment", "Waste", subcategory, semantic_terms=routing_terms, field_terms=field_terms)
    if _contains_any(text, ("biodiversity", "habitat", "ecosystem", "protected areas", "restoration", "species")):
        return MetricResolution("environment", "Biodiversity", semantic_terms=_semantic_terms(text, (
            "biodiversity", "habitat", "ecosystem", "protected", "restoration", "rehabilitation", "species", "site",
        )))
    if _contains_any(text, ("climate change", "climate risk", "climate impact", "climate-related", "climate opportunities", "climate strategy")):
        return MetricResolution("environment", "Climate Change", semantic_terms=_semantic_terms(text, (
            "climate", "risk", "impact", "opportunity", "strategy", "transition", "adaptation", "mitigation",
        )))
    if _contains_any(text, ("material", "materials used", "raw materials", "recycled material", "material consumption", "material sourcing")):
        return MetricResolution("environment", "Material", semantic_terms=_semantic_terms(text, (
            "material", "recycled", "raw", "consumption", "sourcing", "weight", "volume",
        )))
    if _contains_any(text, ("energy", "electricity", "renewable energy", "renewable electricity", "energy intensity", "power", "grid electricity", "purchased electricity")):
        if "renewable energy %" in text or _contains_any(text, ("renewable energy percentage", "percentage renewable energy")):
            return MetricResolution("environment", "Energy", derived_metric="renewable_energy_percentage")
        subcategory = "Fuel Within Organization" if _contains_any(text, ("fuel energy", "energy from fuel")) else "Electricity Within Organization" if _contains_any(text, ("electricity", "grid electricity", "purchased electricity")) else None
        if subcategory == "Fuel Within Organization":
            return MetricResolution("environment", "Energy", subcategory, data_source="fuel_energy")
        return MetricResolution("environment", "Energy", subcategory, semantic_terms=_semantic_terms(text, (
            "energy", "electricity", "purchased", "grid", "renewable", "non-renewable", "intensity", "consumption",
        )))
    water = resolve_water_metric(question)
    if water:
        return water
    return None


def resolve_ghg_metric(question: str) -> Optional[MetricResolution]:
    """Route explicit GHG activity and emissions requests without confusing them with Environment activity data."""
    text = (question or "").lower()
    explicit_emissions = _contains_any(text, ("co2e", "co₂e", "scope 1", "scope 2", "ghg emissions", "carbon emissions", "emissions caused"))
    combustion = _contains_any(text, ("diesel", "petrol", "gasoline", "natural gas", "stationary combustion", "mobile combustion"))
    electricity_emissions = explicit_emissions and _contains_any(text, ("electricity", "power", "grid"))
    if not (explicit_emissions or combustion):
        return None
    scope = "scope2" if electricity_emissions or "scope 2" in text else "scope1" if combustion or "scope 1" in text else None
    category = "Purchased Electricity" if electricity_emissions else "Stationary Combustion" if "stationary" in text else "Mobile Combustion" if "mobile" in text else None
    value_kind = "emissions" if explicit_emissions else "activity"
    return MetricResolution(
        section="ghg",
        category=category,
        data_source="ghg_emissions",
        semantic_terms=_semantic_terms(text, ("diesel", "petrol", "gasoline", "natural gas", "electricity", "fuel")),
        ghg_scope=scope,
        value_kind=value_kind,
    )


def resolve_people_governance_metric(question: str) -> Optional[MetricResolution]:
    """Route Social/Governance by category only; configured field labels resolve the metric."""
    text = (question or "").lower()
    social_routes = (
        (("employee", "employees", "worker", "workforce", "diversity", "gender", "turnover", "benefit", "parental leave"), "Employees/Worker"),
        (("training", "upskilling", "re-skilling"), "Training"),
        (("health and safety", "health & safety", "occupational", "ltifr", "injury", "fatality"), "Health & Safety"),
        (("grievance", "social complaint", "employee complaint", "human rights"), "Complaints"),
        (("community", "social impact"), "Community"),
    )
    governance_routes = (
        (("anti-corruption", "corruption", "bribery", "ethics"), "Anti-corruption"),
        (("data privacy", "cybersecurity", "cyber security", "data breach"), "Incidents"),
        (("non-compliance", "compliance", "whistleblower", "governance complaint"), "Incidents"),
        (("procurement", "local suppliers"), "Financial & Procurement Metrics"),
        (("board", "directors", "risk management", "risk register", "policy", "policies"), None),
    )
    for terms, category in social_routes:
        if _contains_any(text, terms):
            return MetricResolution("social", category, semantic_terms=_semantic_terms(text, terms))
    for terms, category in governance_routes:
        if _contains_any(text, terms):
            return MetricResolution("governance", category, semantic_terms=_semantic_terms(text, terms))
    return None


def resolve_esg_metric(question: str) -> Optional[MetricResolution]:
    """Entry point for deterministic routing; more sectors can extend this registry."""
    environment = resolve_environment_metric(question)
    if environment and environment.category != "Energy":
        return environment
    ghg = resolve_ghg_metric(question)
    if ghg:
        return ghg
    return environment or resolve_people_governance_metric(question)


async def configured_field_candidates(
    organization_id: str,
    resolution: MetricResolution,
) -> list[dict]:
    """Resolve active organization/global definitions before falling back to a core mapping."""
    if not resolution.field_key:
        return []

    from modules.sustainability_config.service import resolve_config

    organization_candidates, standard_candidates = [], []
    try:
        config = await resolve_config(organization_id)
        section_modules = config.get({
            "environment": "modules",
            "social": "social_modules",
            "governance": "governance_modules",
        }[resolution.section], [])
        category_key = re.sub(r"[^a-z0-9]+", "", resolution.category.lower())
        subcategory_key = re.sub(r"[^a-z0-9]+", "", (resolution.subcategory or "").lower())
        aliases = {re.sub(r"[^a-z0-9]+", "", value.lower()) for value in resolution.field_aliases}
        aliases.add(re.sub(r"[^a-z0-9]+", "", resolution.field_key.lower()))

        for module in section_modules:
            module_values = (module.get("module_name"), module.get("module_code"), *(module.get("aliases") or []))
            module_matches = any(re.sub(r"[^a-z0-9]+", "", str(value or "").lower()) == category_key for value in module_values)
            if not module_matches:
                continue
            for subcategory in module.get("subcategories", []):
                sub_values = (subcategory.get("subcategory_name"), subcategory.get("original_subcategory"), subcategory.get("subcategory_code"), *(subcategory.get("aliases") or []))
                if subcategory_key and not any(re.sub(r"[^a-z0-9]+", "", str(value or "").lower()) == subcategory_key for value in sub_values):
                    continue
                for field in subcategory.get("fields", []):
                    key = field.get("field_key") or field.get("field_code")
                    label = field.get("label") or key
                    normalized = {re.sub(r"[^a-z0-9]+", "", str(value or "").lower()) for value in (key, label, *(field.get("aliases") or []))}
                    if key and normalized.intersection(aliases):
                        target = organization_candidates if subcategory.get("is_custom") or subcategory.get("has_override") else standard_candidates
                        target.append({"key": key, "label": label})
    except Exception:
        organization_candidates, standard_candidates = [], []

    fallback = {"key": resolution.field_key, "label": resolution.field_label or resolution.field_key}
    ordered = [*organization_candidates, *standard_candidates, fallback]
    unique = {}
    for item in ordered:
        unique.setdefault((item["key"], item["label"]), item)
    return list(unique.values())


async def configured_semantic_field_candidates(
    organization_id: str,
    section: str,
    category: str,
    subcategory: Optional[str],
    terms: list[str],
    question_text: str = "",
) -> dict[str, list[dict]]:
    """Use the resolved organization catalog to select only explicitly matching configured fields."""
    from modules.sustainability_config.service import resolve_config

    section_key = {"environment": "modules", "social": "social_modules", "governance": "governance_modules"}.get(section)
    if not section_key:
        return {}
    normalize = lambda value: re.sub(r"[^a-z0-9]+", "", str(value or "").lower())
    category_key, subcategory_key = normalize(category), normalize(subcategory)
    normalized_terms = [normalize(term) for term in terms if normalize(term)]
    normalized_question = normalize(question_text)
    grouped: dict[str, list[tuple[int, bool, dict]]] = {}
    try:
        config = await resolve_config(organization_id)
        for module in config.get(section_key, []):
            if not any(normalize(value) == category_key for value in (module.get("module_name"), module.get("module_code"), *(module.get("aliases") or []))):
                continue
            for configured_subcategory in module.get("subcategories", []):
                values = (
                    configured_subcategory.get("subcategory_name"),
                    configured_subcategory.get("original_subcategory"),
                    configured_subcategory.get("subcategory_code"),
                    *(configured_subcategory.get("aliases") or []),
                )
                if subcategory_key and not any(normalize(value) == subcategory_key for value in values):
                    continue
                subcategory_name = configured_subcategory.get("original_subcategory") or configured_subcategory.get("subcategory_name")
                if not subcategory_name:
                    continue
                for field in configured_subcategory.get("fields", []):
                    if field.get("enabled") is False:
                        continue
                    key = field.get("field_key") or field.get("field_code")
                    label = field.get("label") or key
                    if not key:
                        continue
                    searchable = normalize(f"{key} {label} {' '.join(field.get('aliases') or [])}")
                    alias_hits = [normalize(alias) for alias in (field.get("aliases") or []) if normalize(alias) and normalize(alias) in normalized_question]
                    if normalized_terms:
                        score = sum(1 for term in normalized_terms if term in searchable)
                        score += 3 * len(alias_hits)
                    else:
                        field_type = str(field.get("type") or field.get("response_type") or "").lower()
                        numeric = field_type in {"number", "integer", "decimal", "currency", "percentage"}
                        score = 10 if alias_hits else 3 if field.get("is_primary") else 2 if field.get("required") and numeric else 1 if key == "quantity" else 0
                    if score:
                        grouped.setdefault(subcategory_name, []).append((score, bool(configured_subcategory.get("is_custom") or configured_subcategory.get("has_override")), {"key": key, "label": label}))
    except Exception:
        return {}

    resolved = {}
    for subcategory_name, candidates in grouped.items():
        best_score = max(item[0] for item in candidates)
        best = [item for item in candidates if item[0] == best_score]
        best.sort(key=lambda item: not item[1])
        unique = {}
        for _, _, candidate in best:
            unique.setdefault((candidate["key"], candidate["label"]), candidate)
        resolved[subcategory_name] = list(unique.values())
    return resolved


async def configured_category_alias_match(organization_id: str, section: str, terms: list[str], question_text: str = "") -> Optional[str]:
    """Resolve a Social/Governance category from organization-managed category aliases before querying records."""
    from modules.sustainability_config.service import resolve_config

    section_key = {"social": "social_modules", "governance": "governance_modules"}.get(section)
    if not section_key:
        return None
    normalize = lambda value: re.sub(r"[^a-z0-9]+", "", str(value or "").lower())
    normalized_terms = {normalize(term) for term in terms if normalize(term)}
    normalized_question = normalize(question_text)
    try:
        config = await resolve_config(organization_id)
        candidates = []
        for module in config.get(section_key, []):
            aliases = {normalize(value) for value in (module.get("aliases") or [])}
            score = len(aliases.intersection(normalized_terms))
            score += sum(3 for alias in aliases if alias and alias in normalized_question)
            if score:
                candidates.append((score, module.get("module_name")))
        return max(candidates, default=(0, None), key=lambda item: item[0])[1]
    except Exception:
        return None