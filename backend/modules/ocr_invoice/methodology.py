"""Deterministic activity/spend routing aligned with the uploaded OCR processor."""
from __future__ import annotations

import re
from typing import Any


DEFRA_APPROVED_PATTERNS = (
    r"\baluminium cans?\b", r"\baluminum cans?\b", r"\bsteel cans?\b", r"\btin cans?\b",
    r"\bscrap metal\b", r"\bmixed cans?\b", r"\bhdpe\b", r"\bldpe\b", r"\bpet\b",
    r"\bpolypropylene\b", r"\bpp\b", r"\bpolystyrene\b", r"\bps\b", r"\bpvc\b",
    r"\bcardboard\b", r"\bpaper\b", r"\bboard\b", r"\bconcrete\b", r"\baggregates?\b",
    r"\bbricks?\b", r"\binsulation\b", r"\bwood\b", r"\btimber\b", r"\bglass\b",
    r"\bconstruction metals?\b", r"\bstructural steel\b",
)


def _positive(value: Any) -> bool:
    try:
        return value is not None and float(value) > 0
    except (TypeError, ValueError):
        return False


def _category_number(category_key: str) -> int | None:
    match = re.search(r"cat_(\d+)", str(category_key or ""))
    return int(match.group(1)) if match else None


def _base_result(subcategory: str) -> dict:
    return {
        "subcategory": subcategory,
        "ef_lookup_key": subcategory,
        "auto_generate_cat3": False,
        "requires_useeio": False,
    }


def resolve_methodology(
    scope: str,
    category_key: str,
    subcategory: str,
    item: dict,
    taxonomy: dict,
) -> dict:
    """Apply the uploaded processor's branch ordering and factor-eligibility gates."""
    result = _base_result(subcategory)
    description = item.get("item_description_english") or item.get("item_description") or "Unknown item"
    description_lower = description.lower()
    primary_material = str(item.get("primary_material") or "")
    material_nature = item.get("material_nature", "composite_product")
    has_quantity = item.get("quantity") is not None and item.get("unit") is not None
    travel = item.get("travel_details") or {}
    freight = item.get("freight_details") or {}
    distance = freight.get("distance_km") or travel.get("distance_km") or item.get("distance_km")
    has_distance = _positive(distance)
    number = _category_number(category_key)

    if number in {1, 2}:
        material_text = f"{primary_material} {description_lower}".lower()
        is_defra_material = any(re.search(pattern, material_text) for pattern in DEFRA_APPROVED_PATTERNS)
        category_data = taxonomy.get("scope_3", {}).get(category_key, {})
        defra_subcategories = [str(value).lower() for value in category_data.get("defra_subcategories", [])]
        subcategory_lower = subcategory.strip().lower()
        is_defra_subcategory = bool(subcategory_lower) and any(
            value == subcategory_lower or value in subcategory_lower or subcategory_lower in value
            for value in defra_subcategories
        )
        if is_defra_subcategory and has_quantity and is_defra_material:
            result.update(
                ef_method="activity",
                ef_database="DEFRA",
                accounting_rationale=f"Physical commodity procurement with verified activity data ({item.get('quantity')} {item.get('unit')}).",
            )
        else:
            if material_nature == "service":
                rationale = f"Operational contracted service for business operations ({description})."
            elif material_nature == "raw_material":
                rationale = f"Industrial raw material procurement for manufacturing and production operations ({primary_material or description}). Because specific emission factors for this commodity are outside standard DEFRA tables, spend-based USEEIO modeling is applied."
            else:
                rationale = f"Procured product embedding multi-material manufacturing lifecycle footprint ({description})."
            result.update(ef_method="spend", ef_database="USEEIO", requires_useeio=True, accounting_rationale=rationale)
        return result

    if number in {4, 9}:
        if has_distance:
            result.update(
                ef_method="activity",
                ef_database="DEFRA",
                accounting_rationale=f"Inbound freight transport with verified route distance ({distance} km).",
            )
        else:
            result.update(
                ef_method="spend",
                ef_database="USEEIO",
                requires_useeio=True,
                accounting_rationale=f"Freight and logistics expenditure for shipping and distribution ({description}).",
            )
        return result

    if number in {5, 12}:
        result.update(
            ef_method="activity",
            ef_database="US EPA",
            accounting_rationale=f"Operational waste stream manifest ({subcategory}).",
        )
        return result

    if number in {6, 7}:
        result.update(ef_method="activity", ef_database="DEFRA")
        origin = travel.get("origin") or ""
        destination = travel.get("destination") or ""
        route = f" from {origin} to {destination}" if origin or destination else ""
        passengers = travel.get("passenger_count") or 1
        subcategory_lower = subcategory.lower()
        if "flight" in subcategory_lower or "air" in subcategory_lower:
            cabin_class = travel.get("class") or "Economy Class"
            if "class" not in cabin_class.lower():
                cabin_class = f"{cabin_class} Class"
            haul = subcategory if "Flight" in subcategory or "International" in subcategory else "Domestic Flight"
            result.update(
                subcategory=haul,
                ef_lookup_key=f"{haul} ({cabin_class})",
                accounting_rationale=f"Business travel flight{route} ({cabin_class}, {passengers} passenger(s)).",
            )
        elif "train" in subcategory_lower or "rail" in subcategory_lower:
            result["accounting_rationale"] = f"Business travel railway passenger trip{route} ({passengers} passenger(s))."
        elif any(token in subcategory_lower for token in ("hotel", "stay", "accommodation")):
            result["accounting_rationale"] = "Business travel employee accommodation and hotel stay."
        elif "taxi" in subcategory_lower or "car" in subcategory_lower:
            vehicle_type = travel.get("vehicle_type")
            resolved = f"Car - {vehicle_type}" if vehicle_type and "car" in subcategory_lower else subcategory
            result.update(
                subcategory=resolved,
                ef_lookup_key=resolved,
                accounting_rationale=f"Business travel road passenger mobility{route} ({passengers} passenger(s)).",
            )
        else:
            result["accounting_rationale"] = f"Business travel / employee mobility event ({subcategory})."
        return result

    if number == 3:
        is_td_loss = (
            any(token in f"{subcategory} {description_lower}".lower() for token in ("t&d", "td loss", "grid loss", "distribution loss", "electricity transmission", "network loss"))
            and not any(token in f"{subcategory} {description_lower}".lower() for token in ("natural gas", "gas", "diesel", "petrol", "coal", "fuel", "wtt"))
        )
        result.update(
            ef_method="activity",
            ef_database="NITI Aayog" if is_td_loss else "DEFRA",
            accounting_rationale=(
                f"Grid Transmission & Distribution (T&D) network losses for purchased electricity ({subcategory})."
                if is_td_loss else
                f"Upstream Well-to-Tank (WTT) fuel and energy lifecycle emissions ({subcategory})."
            ),
        )
        return result

    if scope in {"scope1", "scope2"} or "water" in scope.lower():
        result.update(ef_method="activity")
        if scope == "scope1":
            result["ef_database"] = "IPCC"
            is_fugitive = "fugitive" in category_key.lower() or any(
                token in subcategory.lower() for token in ("refrigerant", "fugitive")
            )
            result["accounting_rationale"] = (
                f"Direct fugitive greenhouse gas emissions from equipment leaks or refrigeration systems ({subcategory})."
                if is_fugitive else
                f"Direct fuel combustion in operational assets ({subcategory}) with companion upstream lifecycle tracking."
            )
            result["auto_generate_cat3"] = not is_fugitive
        elif scope == "scope2":
            is_steam_heat = any(token in f"{category_key} {subcategory}".lower() for token in ("steam", "heat", "cooling", "district"))
            if is_steam_heat:
                result["ef_database"] = "DEFRA"
                result["accounting_rationale"] = f"Purchased heat/steam/cooling for facility operations ({subcategory}) with companion upstream lifecycle tracking."
            else:
                result["ef_database"] = "CEA"
                result["accounting_rationale"] = f"Purchased grid electricity generation under CEA Baseline Database ({subcategory}) with companion upstream lifecycle (DEFRA) and grid loss (NITI Aayog) tracking."
            result["auto_generate_cat3"] = True
        else:
            result["ef_database"] = "-"
            result["accounting_rationale"] = f"Municipal utility water consumption for facility operations ({subcategory})."
        return result

    if number in {8, 13}:
        if has_quantity:
            result.update(
                ef_method="activity",
                ef_database="DEFRA",
                accounting_rationale=f"Operating lease asset utilization ({subcategory}).",
            )
        else:
            result.update(
                ef_method="spend",
                ef_database="USEEIO",
                requires_useeio=True,
                accounting_rationale=f"Operating lease asset expenditure ({description}).",
            )
        return result

    if number in {10, 14, 15}:
        result.update(
            ef_method="spend",
            ef_database="USEEIO",
            requires_useeio=True,
            accounting_rationale=f"Value chain expenditure ({description}).",
        )
        return result

    if number == 11:
        result.update(
            ef_method="activity" if has_quantity else "spend",
            ef_database="DEFRA",
            accounting_rationale=f"Use of sold products energy consumption footprint ({subcategory}).",
        )
        return result

    result.update(
        ef_method="activity" if has_quantity else "spend",
        ef_database="Unknown",
        accounting_rationale=f"Operational expenditure ({subcategory or description}).",
    )
    return result