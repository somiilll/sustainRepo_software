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
    is_renewable_electricity = (
        "electricity" in category_text
        and "renewable" in category_text
        and "non-renewable" not in category_text
        and "nonrenewable" not in category_text
    )
    if is_renewable_electricity:
        return []
    if "electricity" in category_text:
        coal_subcategory = "Coal (electricity generation)"
        td_subcategory = "Electricity - T&D losses and Generation"
        return [
            {
                **base,
                "subcategory": coal_subcategory,
                "fuel_name": coal_subcategory,
                "ef_database": "DEFRA",
                "ef_lookup_key": coal_subcategory,
                "accounting_rationale": "Upstream fuel-cycle emissions for electricity generation from coal. Financial spend booked on parent transaction to prevent double counting.",
            },
            {
                **base,
                "subcategory": td_subcategory,
                "fuel_name": td_subcategory,
                "ef_database": "ICED - Niti Aayog",
                "ef_lookup_key": td_subcategory,
                "accounting_rationale": "Grid Transmission & Distribution (T&D) losses and generation for purchased electricity. Financial spend booked on parent transaction to prevent double counting.",
            },
        ]
    return [{
        **base,
        "subcategory": subcategory,
        "fuel_name": subcategory,
        "ef_database": "DEFRA",
        "ef_lookup_key": subcategory,
        "accounting_rationale": f"Upstream fuel-cycle extraction, refining, and supply chain emissions for consumed {subcategory}. Financial spend booked on parent transaction to prevent double counting.",
    }]