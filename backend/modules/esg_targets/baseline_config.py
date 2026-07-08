"""
ESG Targets - Baseline Mapping Configuration

Maps ESG metric keys to GHG module scope/category for baseline value lookup.
This config is the single source of truth for baseline auto-fetch.

Structure:
- metric_key: The field_key from ESG Config field_definitions
- scope: GHG scope (scope1, scope2, scope3, biogenic)
- category: GHG category name (partial match supported)
- subcategory: Optional subcategory filter
- aggregation: "sum" (default) or "average"
"""

# Scope 1 Metrics
SCOPE1_METRICS = {
    # Total Scope 1
    "total_emissions": {
        "scope": "scope1",
        "category": None,  # All categories
        "aggregation": "sum",
        "description": "Total Scope 1 Emissions"
    },
    "gross_scope1_emissions": {
        "scope": "scope1",
        "category": None,
        "aggregation": "sum",
        "description": "Gross Scope 1 Emissions"
    },
    "total_scope1_emissions": {
        "scope": "scope1",
        "category": None,
        "aggregation": "sum",
        "description": "Total Scope 1 Emissions"
    },
    
    # Stationary Combustion
    "stationary_combustion": {
        "scope": "scope1",
        "category": "Stationary Combustion",
        "aggregation": "sum",
        "description": "Stationary Combustion Emissions"
    },
    "stationary_combustion_emissions": {
        "scope": "scope1",
        "category": "Stationary Combustion",
        "aggregation": "sum",
        "description": "Stationary Combustion Emissions"
    },
    
    # Mobile Combustion
    "mobile_combustion": {
        "scope": "scope1",
        "category": "Mobile Combustion",
        "aggregation": "sum",
        "description": "Mobile Combustion Emissions"
    },
    "mobile_combustion_emissions": {
        "scope": "scope1",
        "category": "Mobile Combustion",
        "aggregation": "sum",
        "description": "Mobile Combustion Emissions"
    },
    
    # Fugitive Emissions
    "fugitive_emissions": {
        "scope": "scope1",
        "category": "Fugitive Emissions",
        "aggregation": "sum",
        "description": "Fugitive Emissions"
    },
    
    # Process Emissions
    "process_emissions": {
        "scope": "scope1",
        "category": "Process Emissions",
        "aggregation": "sum",
        "description": "Process Emissions"
    },
}

# Scope 2 Metrics
SCOPE2_METRICS = {
    # Total Scope 2
    "total_scope2_emissions": {
        "scope": "scope2",
        "category": None,
        "aggregation": "sum",
        "description": "Total Scope 2 Emissions"
    },
    "gross_scope2_emissions": {
        "scope": "scope2",
        "category": None,
        "aggregation": "sum",
        "description": "Gross Scope 2 Emissions"
    },
    
    # Location-based
    "scope2_location_based": {
        "scope": "scope2",
        "category": None,
        "method": "location",
        "aggregation": "sum",
        "description": "Scope 2 Location-Based Emissions"
    },
    
    # Market-based
    "scope2_market_based": {
        "scope": "scope2",
        "category": None,
        "method": "market",
        "aggregation": "sum",
        "description": "Scope 2 Market-Based Emissions"
    },
    
    # Purchased Electricity
    "purchased_electricity": {
        "scope": "scope2",
        "category": "Purchased Electricity",
        "aggregation": "sum",
        "description": "Purchased Electricity Emissions"
    },
    "purchased_electricity_emissions": {
        "scope": "scope2",
        "category": "Purchased Electricity",
        "aggregation": "sum",
        "description": "Purchased Electricity Emissions"
    },
    
    # Purchased Heat/Steam
    "purchased_heat": {
        "scope": "scope2",
        "category": "Purchased Heat",
        "aggregation": "sum",
        "description": "Purchased Heat Emissions"
    },
    "purchased_steam": {
        "scope": "scope2",
        "category": "Purchased Steam",
        "aggregation": "sum",
        "description": "Purchased Steam Emissions"
    },
}

# Scope 3 Metrics (by category)
SCOPE3_METRICS = {
    # Total Scope 3
    "total_scope3_emissions": {
        "scope": "scope3",
        "category": None,
        "aggregation": "sum",
        "description": "Total Scope 3 Emissions"
    },
    "gross_scope3_emissions": {
        "scope": "scope3",
        "category": None,
        "aggregation": "sum",
        "description": "Gross Scope 3 Emissions"
    },
    
    # C1 - Purchased Goods and Services
    "scope3_c1": {
        "scope": "scope3",
        "category": "C1",
        "aggregation": "sum",
        "description": "Scope 3 Cat 1 - Purchased Goods and Services"
    },
    "purchased_goods_services": {
        "scope": "scope3",
        "category": "C1",
        "aggregation": "sum",
        "description": "Purchased Goods and Services"
    },
    
    # C2 - Capital Goods
    "scope3_c2": {
        "scope": "scope3",
        "category": "C2",
        "aggregation": "sum",
        "description": "Scope 3 Cat 2 - Capital Goods"
    },
    "capital_goods": {
        "scope": "scope3",
        "category": "C2",
        "aggregation": "sum",
        "description": "Capital Goods"
    },
    
    # C3 - Fuel and Energy Related Activities
    "scope3_c3": {
        "scope": "scope3",
        "category": "C3",
        "aggregation": "sum",
        "description": "Scope 3 Cat 3 - Fuel and Energy Related Activities"
    },
    
    # C4 - Upstream Transportation
    "scope3_c4": {
        "scope": "scope3",
        "category": "C4",
        "aggregation": "sum",
        "description": "Scope 3 Cat 4 - Upstream Transportation"
    },
    "upstream_transportation": {
        "scope": "scope3",
        "category": "C4",
        "aggregation": "sum",
        "description": "Upstream Transportation"
    },
    
    # C5 - Waste Generated
    "scope3_c5": {
        "scope": "scope3",
        "category": "C5",
        "aggregation": "sum",
        "description": "Scope 3 Cat 5 - Waste Generated in Operations"
    },
    "waste_generated": {
        "scope": "scope3",
        "category": "C5",
        "aggregation": "sum",
        "description": "Waste Generated in Operations"
    },
    
    # C6 - Business Travel
    "scope3_c6": {
        "scope": "scope3",
        "category": "C6",
        "aggregation": "sum",
        "description": "Scope 3 Cat 6 - Business Travel"
    },
    "business_travel": {
        "scope": "scope3",
        "category": "C6",
        "aggregation": "sum",
        "description": "Business Travel"
    },
    
    # C7 - Employee Commuting
    "scope3_c7": {
        "scope": "scope3",
        "category": "C7",
        "aggregation": "sum",
        "description": "Scope 3 Cat 7 - Employee Commuting"
    },
    "employee_commuting": {
        "scope": "scope3",
        "category": "C7",
        "aggregation": "sum",
        "description": "Employee Commuting"
    },
    
    # C8 - Upstream Leased Assets
    "scope3_c8": {
        "scope": "scope3",
        "category": "C8",
        "aggregation": "sum",
        "description": "Scope 3 Cat 8 - Upstream Leased Assets"
    },
    
    # C9 - Downstream Transportation
    "scope3_c9": {
        "scope": "scope3",
        "category": "C9",
        "aggregation": "sum",
        "description": "Scope 3 Cat 9 - Downstream Transportation"
    },
    
    # C10 - Processing of Sold Products
    "scope3_c10": {
        "scope": "scope3",
        "category": "C10",
        "aggregation": "sum",
        "description": "Scope 3 Cat 10 - Processing of Sold Products"
    },
    
    # C11 - Use of Sold Products
    "scope3_c11": {
        "scope": "scope3",
        "category": "C11",
        "aggregation": "sum",
        "description": "Scope 3 Cat 11 - Use of Sold Products"
    },
    
    # C12 - End of Life Treatment
    "scope3_c12": {
        "scope": "scope3",
        "category": "C12",
        "aggregation": "sum",
        "description": "Scope 3 Cat 12 - End of Life Treatment"
    },
    
    # C13 - Downstream Leased Assets
    "scope3_c13": {
        "scope": "scope3",
        "category": "C13",
        "aggregation": "sum",
        "description": "Scope 3 Cat 13 - Downstream Leased Assets"
    },
    
    # C14 - Franchises
    "scope3_c14": {
        "scope": "scope3",
        "category": "C14",
        "aggregation": "sum",
        "description": "Scope 3 Cat 14 - Franchises"
    },
    
    # C15 - Investments
    "scope3_c15": {
        "scope": "scope3",
        "category": "C15",
        "aggregation": "sum",
        "description": "Scope 3 Cat 15 - Investments"
    },
}

# Biogenic Metrics
BIOGENIC_METRICS = {
    "biogenic_emissions": {
        "scope": "biogenic",
        "category": None,
        "aggregation": "sum",
        "description": "Total Biogenic Emissions"
    },
    "biogenic_scope1": {
        "scope": "biogenic",
        "category": None,
        "aggregation": "sum",
        "description": "Biogenic Scope 1 Emissions"
    },
}

# Combined mapping - single source of truth
METRIC_TO_GHG_MAPPING = {
    **SCOPE1_METRICS,
    **SCOPE2_METRICS,
    **SCOPE3_METRICS,
    **BIOGENIC_METRICS,
}


def get_metric_mapping(metric_key: str) -> dict | None:
    """
    Get GHG mapping for a metric key.
    Returns None if metric is not mapped to GHG data.
    """
    # Direct match
    if metric_key in METRIC_TO_GHG_MAPPING:
        return METRIC_TO_GHG_MAPPING[metric_key]
    
    # Normalized match (lowercase, underscores)
    normalized = metric_key.lower().replace("-", "_").replace(" ", "_")
    if normalized in METRIC_TO_GHG_MAPPING:
        return METRIC_TO_GHG_MAPPING[normalized]
    
    # Partial match for common patterns
    for key, mapping in METRIC_TO_GHG_MAPPING.items():
        if key in normalized or normalized in key:
            return mapping
    
    return None


def get_all_mapped_metrics() -> list[str]:
    """Get list of all metric keys that have GHG mappings."""
    return list(METRIC_TO_GHG_MAPPING.keys())
