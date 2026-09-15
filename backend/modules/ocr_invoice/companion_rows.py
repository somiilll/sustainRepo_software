"""Scope 3 Category 3 companion-row generation from the uploaded processor."""
from __future__ import annotations


def build_companion_rows(row: dict) -> list[dict]:
    if not row.get("auto_generate_cat3"):
        return []
    subcategory = row.get("subcategory") or "Energy"
    base = {
        **row,
        "scope": "scope3",
        "category": "C3 - Fuel and energy-related activities",
        "category_key": "cat_3_fuel_energy_upstream",
        "category_code": "c3",
        "ef_method": "activity",
        "naics_code": None,
        "naics_label": None,
        "cost": 0.0,
        "is_auto_generated": True,
        "auto_generate_cat3": False,
    }
    wtt_subcategory = f"WTT - {subcategory}"
    rows = [{
        **base,
        "subcategory": wtt_subcategory,
        "fuel_name": wtt_subcategory,
        "ef_database": "DEFRA",
        "ef_lookup_key": wtt_subcategory,
        "accounting_rationale": f"Upstream Well-to-Tank (WTT) extraction, refining, and supply chain emissions for consumed {subcategory}. Financial spend booked on parent transaction to prevent double counting.",
    }]
    category_text = f"{row.get('category') or ''} {subcategory}".lower()
    if "electricity" in category_text:
        td_subcategory = f"T&D Losses - {subcategory}"
        rows.append({
            **base,
            "subcategory": td_subcategory,
            "fuel_name": td_subcategory,
            "ef_database": "NITI Aayog",
            "ef_lookup_key": td_subcategory,
            "accounting_rationale": "Grid Transmission & Distribution (T&D) network losses for purchased electricity. Financial spend booked on parent transaction to prevent double counting.",
        })
    return rows