"""Deterministic ESG metric routing and configuration-aware field resolution."""
from dataclasses import dataclass
import re
from typing import Optional


@dataclass(frozen=True)
class MetricResolution:
    section: str
    category: str
    subcategory: Optional[str] = None
    field_key: Optional[str] = None
    field_label: Optional[str] = None
    field_aliases: tuple[str, ...] = ()
    derived_metric: Optional[str] = None


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


def resolve_esg_metric(question: str) -> Optional[MetricResolution]:
    """Entry point for deterministic core metric routing; new modules extend here."""
    return resolve_water_metric(question)


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
            module_values = (module.get("module_name"), module.get("module_code"))
            module_matches = any(re.sub(r"[^a-z0-9]+", "", str(value or "").lower()) == category_key for value in module_values)
            if not module_matches:
                continue
            for subcategory in module.get("subcategories", []):
                sub_values = (subcategory.get("subcategory_name"), subcategory.get("original_subcategory"), subcategory.get("subcategory_code"))
                if subcategory_key and not any(re.sub(r"[^a-z0-9]+", "", str(value or "").lower()) == subcategory_key for value in sub_values):
                    continue
                for field in subcategory.get("fields", []):
                    key = field.get("field_key") or field.get("field_code")
                    label = field.get("label") or key
                    normalized = {re.sub(r"[^a-z0-9]+", "", str(value or "").lower()) for value in (key, label)}
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