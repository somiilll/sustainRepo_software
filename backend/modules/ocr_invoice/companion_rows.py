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
    category_text = f"{row.get('category') or ''} {subcategory}".lower()
    if "electricity" in category_text:
        canonical_subcategory = "Electricity - T&D losses and Generation"
        return [{
            **base,
            "subcategory": canonical_subcategory,
            "fuel_name": canonical_subcategory,
            "ef_database": "DEFRA",
            "ef_lookup_key": canonical_subcategory,
            "accounting_rationale": "Grid Transmission & Distribution (T&D) losses and generation for purchased electricity. Financial spend booked on parent transaction to prevent double counting.",
        }]
    return [{
        **base,
        "subcategory": subcategory,
        "fuel_name": subcategory,
        "ef_database": "DEFRA",
        "ef_lookup_key": subcategory,
        "accounting_rationale": f"Upstream fuel-cycle extraction, refining, and supply chain emissions for consumed {subcategory}. Financial spend booked on parent transaction to prevent double counting.",
    }]