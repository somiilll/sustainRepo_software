"""
BRSR Framework Implementation

Business Responsibility and Sustainability Reporting framework
mandated by SEBI for listed companies in India.
"""

from typing import Dict, Any, List

# BRSR Disclosure Categories
SECTION_A_DISCLOSURES = {
    "general_details": {
        "corporate_identity_number": {"required": True, "type": "string"},
        "name_of_entity": {"required": True, "type": "string"},
        "registered_office": {"required": True, "type": "string"},
        "corporate_office": {"required": True, "type": "string"},
        "email": {"required": True, "type": "email"},
        "telephone": {"required": True, "type": "string"},
        "website": {"required": True, "type": "url"},
        "financial_year": {"required": True, "type": "string"},
        "stock_exchanges": {"required": True, "type": "list"},
        "paid_up_capital": {"required": True, "type": "number"},
    },
    "products_services": {
        "business_activities": {"required": True, "type": "list"},
        "products_sold": {"required": True, "type": "list"},
        "top_10_products_revenue": {"required": True, "type": "list"},
    },
    "operations": {
        "locations_national": {"required": True, "type": "number"},
        "locations_international": {"required": False, "type": "number"},
        "markets_served": {"required": True, "type": "list"},
    },
    "employees": {
        "total_employees": {"required": True, "type": "number"},
        "permanent_employees": {"required": True, "type": "breakdown"},
        "contract_employees": {"required": True, "type": "breakdown"},
        "differently_abled": {"required": True, "type": "breakdown"},
    },
}

# Principle 6: Environment (Most relevant for GHG)
PRINCIPLE_6_ENVIRONMENTAL = {
    "essential_indicators": {
        "E1": {
            "id": "P6.E1",
            "name": "Energy Consumption",
            "description": "Total energy consumption (in Joules or multiples) and energy intensity per rupee of turnover",
            "data_source": {"module": "ghg", "field": "energy_consumption"},
            "required": True,
        },
        "E2": {
            "id": "P6.E2", 
            "name": "PAT Compliance",
            "description": "Does the entity have any sites/facilities identified as designated consumers under PAT Scheme?",
            "data_source": {"module": "compliance", "field": "pat_compliance"},
            "required": True,
        },
        "E3": {
            "id": "P6.E3",
            "name": "Renewable Energy",
            "description": "Disclose the total energy consumed from renewable and non-renewable sources",
            "data_source": {"module": "ghg", "field": "energy_by_source"},
            "required": True,
        },
        "E4": {
            "id": "P6.E4",
            "name": "Water Consumption",
            "description": "Water withdrawal, consumption and discharge",
            "data_source": {"module": "environment", "field": "water_management"},
            "required": True,
        },
        "E5": {
            "id": "P6.E5",
            "name": "Air Emissions",
            "description": "NOx, SOx and other significant air emissions",
            "data_source": {"module": "ghg", "field": "other_emissions"},
            "required": True,
        },
        "E6": {
            "id": "P6.E6",
            "name": "GHG Emissions",
            "description": "Scope 1 and Scope 2 emissions & emission intensity",
            "data_source": {"module": "ghg", "field": "scope1_2_emissions"},
            "required": True,
        },
        "E7": {
            "id": "P6.E7",
            "name": "GHG Reduction",
            "description": "Details of projects/initiatives to reduce GHG emissions",
            "data_source": {"module": "ghg", "field": "reduction_initiatives"},
            "required": True,
        },
        "E8": {
            "id": "P6.E8",
            "name": "Waste Management",
            "description": "Total waste generated and waste intensity",
            "data_source": {"module": "environment", "field": "waste_management"},
            "required": True,
        },
        "E9": {
            "id": "P6.E9",
            "name": "Waste Practices",
            "description": "Waste management practices adopted",
            "data_source": {"module": "environment", "field": "waste_practices"},
            "required": True,
        },
        "E10": {
            "id": "P6.E10",
            "name": "Ecological Impact",
            "description": "Details of operations within or adjacent to ecologically sensitive areas",
            "data_source": {"module": "environment", "field": "ecological_impact"},
            "required": True,
        },
        "E11": {
            "id": "P6.E11",
            "name": "EIA Undertakings",
            "description": "Details of Environmental Impact Assessments conducted",
            "data_source": {"module": "compliance", "field": "eia_assessments"},
            "required": True,
        },
        "E12": {
            "id": "P6.E12",
            "name": "Environmental Compliance",
            "description": "Details of non-compliance with environmental laws and regulations",
            "data_source": {"module": "compliance", "field": "env_compliance"},
            "required": True,
        },
    },
    "leadership_indicators": {
        "L1": {
            "id": "P6.L1",
            "name": "Water Efficiency",
            "description": "Break-up of total energy consumed from renewable sources",
            "data_source": {"module": "ghg", "field": "renewable_breakdown"},
            "required": False,
        },
        "L2": {
            "id": "P6.L2",
            "name": "Zero Liquid Discharge",
            "description": "Does entity have mechanism for Zero Liquid Discharge?",
            "data_source": {"module": "environment", "field": "zld_status"},
            "required": False,
        },
        "L3": {
            "id": "P6.L3",
            "name": "Scope 3 Emissions",
            "description": "Total Scope 3 emissions & its intensity",
            "data_source": {"module": "ghg", "field": "scope3_emissions"},
            "required": False,
        },
        "L4": {
            "id": "P6.L4",
            "name": "Life Cycle Assessment",
            "description": "What is the entity's strategy for achieving life cycle perspective?",
            "data_source": {"module": "environment", "field": "lca_strategy"},
            "required": False,
        },
        "L5": {
            "id": "P6.L5",
            "name": "Extended Producer Responsibility",
            "description": "EPR compliance for product end-of-life",
            "data_source": {"module": "compliance", "field": "epr_compliance"},
            "required": False,
        },
        "L6": {
            "id": "P6.L6",
            "name": "Green Projects",
            "description": "Reclaimed products and waste percentage",
            "data_source": {"module": "environment", "field": "reclaimed_products"},
            "required": False,
        },
    },
}


def validate_brsr_data(data: Dict[str, Any]) -> List[str]:
    """
    Validate data against BRSR requirements.
    
    Args:
        data: Data dictionary to validate
        
    Returns:
        List of validation error messages
    """
    errors = []
    
    # Check essential indicators for Principle 6
    for indicator_id, indicator in PRINCIPLE_6_ENVIRONMENTAL["essential_indicators"].items():
        if indicator["required"]:
            source = indicator["data_source"]
            # Check if the required data field exists
            module_data = data.get(source["module"], {})
            if source["field"] not in module_data:
                errors.append(
                    f"Missing required BRSR indicator {indicator['id']}: {indicator['name']}"
                )
    
    return errors


def get_brsr_mappings() -> Dict[str, Any]:
    """Get BRSR to ESG data mappings."""
    mappings = {}
    
    for indicator_id, indicator in PRINCIPLE_6_ENVIRONMENTAL["essential_indicators"].items():
        mappings[indicator["id"]] = indicator["data_source"]
    
    for indicator_id, indicator in PRINCIPLE_6_ENVIRONMENTAL["leadership_indicators"].items():
        mappings[indicator["id"]] = indicator["data_source"]
    
    return mappings
