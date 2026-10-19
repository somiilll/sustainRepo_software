"""Dormant parity helpers retained from the uploaded processor without activation."""
from __future__ import annotations

import re


def parse_shielding_gas_blend(description: str):
    text = str(description or "").lower()
    gas_context = any(token in text for token in ("gas", "welding", "shielding", "gmaw", "mig", "mag", "acm", "mix", "blend"))
    has_co2 = any(token in text for token in ("co2", "carbon dioxide", "c25", "c10", "c5", "c20", "c15", "c8", "c18", "c12"))
    has_inert = any(token in text for token in ("argon", "ar ", "ar/", "ar-", "ar&", "nitrogen", "n2", "helium", "he"))
    if "acm" in text and any(token in text for token in ("argon", "co2", "mix", "gas")):
        gas_context = has_co2 = has_inert = True
    if not (gas_context and has_co2 and has_inert):
        return False, None, 0.0, None, 0.0
    ratio_match = re.search(r"(\d{1,2})\s*[:/]\s*(\d{1,2})", text)
    if ratio_match:
        first, second = float(ratio_match.group(1)), float(ratio_match.group(2))
        if 80 <= first + second <= 120:
            smaller, larger = min(first, second), max(first, second)
            total = smaller + larger
            return True, "CO2", smaller / total, "Argon", larger / total
    code_match = re.search(r"\bc(\d{1,2})\b", text)
    if code_match and 1 <= (percentage := float(code_match.group(1))) <= 50:
        return True, "CO2", percentage / 100.0, "Argon", (100.0 - percentage) / 100.0
    co2_match = re.search(r"(\d{1,2})\s*%\s*(?:co2|carbon dioxide)", text)
    if co2_match and 1 <= (percentage := float(co2_match.group(1))) <= 50:
        return True, "CO2", percentage / 100.0, "Argon", (100.0 - percentage) / 100.0
    argon_match = re.search(r"(\d{1,2})\s*%\s*(?:argon|ar\b)", text)
    if argon_match and 50 <= (percentage := float(argon_match.group(1))) <= 99:
        return True, "CO2", (100.0 - percentage) / 100.0, "Argon", percentage / 100.0
    if has_co2 and has_inert:
        return True, "CO2", 0.20, "Argon", 0.80
    return False, None, 0.0, None, 0.0


def forced_scope_result(item: dict) -> dict | None:
    if not item.get("forced_scope"):
        return None
    return {
        "ghg_scope": item["forced_scope"],
        "ghg_category": item["forced_category"],
        "ghg_subcategory": item["forced_subcategory"],
        "ef_method": item["forced_ef_method"],
        "ef_database": item["forced_ef_database"],
        "ef_lookup_key": item["forced_ef_lookup_key"],
        "needs_review": False,
        "auto_generate_cat3": False,
        "accounting_rationale": item["forced_rationale"],
    }


def split_metadata(item: dict) -> dict:
    metadata = item.get("_split_meta") or {}
    return {
        "is_split_child": metadata.get("is_split_child", False),
        "split_group_id": metadata.get("split_group_id", ""),
        "split_parent_desc": metadata.get("split_parent_desc", ""),
        "split_component_name": metadata.get("split_component_name", ""),
        "split_ratio_pct": metadata.get("split_ratio_pct", ""),
        "parent_total_qty": metadata.get("parent_total_qty"),
        "parent_total_cost": metadata.get("parent_total_cost"),
        "parent_unit": metadata.get("parent_unit", ""),
    }