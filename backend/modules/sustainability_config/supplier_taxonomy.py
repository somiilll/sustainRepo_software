"""Canonical Supplier Assessment ESG subcategory defaults and normalization."""
from copy import deepcopy
from typing import Any, Dict, List


DEFAULT_SUPPLIER_ESG_SUBCATEGORIES: Dict[str, List[Dict[str, Any]]] = {
    "environment": [
        {"code": "ghg_emissions_climate_transition", "name": "GHG Emissions & Climate Transition", "enabled": True, "weight": 12.5},
        {"code": "energy_efficiency_renewable_energy", "name": "Energy Efficiency & Renewable Energy", "enabled": True, "weight": 12.5},
        {"code": "water_effluent_stewardship", "name": "Water & Effluent Stewardship", "enabled": True, "weight": 12.5},
        {"code": "waste_management_circular_economy", "name": "Waste Management & Circular Economy", "enabled": True, "weight": 12.5},
        {"code": "air_emissions_pollution_prevention", "name": "Air Emissions & Pollution Prevention", "enabled": True, "weight": 12.5},
        {"code": "sustainable_procurement_materials", "name": "Sustainable Procurement & Materials", "enabled": True, "weight": 12.5},
        {"code": "biodiversity_ecological_protection", "name": "Biodiversity & Ecological Protection", "enabled": True, "weight": 12.5},
        {"code": "environmental_compliance_management_systems", "name": "Environmental Compliance & Management Systems", "enabled": True, "weight": 12.5},
    ],
    "social": [
        {"code": "occupational_health_safety", "name": "Occupational Health & Safety (OHS)", "enabled": True, "weight": 12.5},
        {"code": "working_conditions_fair_compensation", "name": "Working Conditions & Fair Compensation", "enabled": True, "weight": 12.5},
        {"code": "human_rights_child_forced_labor", "name": "Human Rights & Child/Forced Labor", "enabled": True, "weight": 12.5},
        {"code": "freedom_association_cba", "name": "Freedom of Association & CBA", "enabled": True, "weight": 12.5},
        {"code": "diversity_equity_inclusion", "name": "Diversity, Equity & Inclusion (DEI)", "enabled": True, "weight": 12.5},
        {"code": "training_career_development", "name": "Training & Career Development", "enabled": True, "weight": 12.5},
        {"code": "supply_chain_social_due_diligence", "name": "Supply Chain Social Due Diligence", "enabled": True, "weight": 12.5},
        {"code": "community_relations_csr", "name": "Community Relations & CSR", "enabled": True, "weight": 12.5},
    ],
    "governance": [
        {"code": "board_oversight_esg_leadership", "name": "Board Oversight & ESG Leadership", "enabled": True, "weight": 14.2857},
        {"code": "business_ethics_anti_corruption", "name": "Business Ethics & Anti-Corruption", "enabled": True, "weight": 14.2857},
        {"code": "fair_competition_ethical_trade", "name": "Fair Competition & Ethical Trade", "enabled": True, "weight": 14.2857},
        {"code": "whistleblower_grievance_mechanism", "name": "Whistleblower & Grievance Mechanism", "enabled": True, "weight": 14.2857},
        {"code": "data_privacy_cybersecurity", "name": "Data Privacy & Cybersecurity", "enabled": True, "weight": 14.2857},
        {"code": "statutory_compliance_risk_management", "name": "Statutory Compliance & Risk Management", "enabled": True, "weight": 14.2857},
        {"code": "supply_chain_governance_code", "name": "Supply Chain Governance & Code", "enabled": True, "weight": 14.2858},
    ],
}


def supplier_esg_subcategory_defaults() -> Dict[str, List[Dict[str, Any]]]:
    return deepcopy(DEFAULT_SUPPLIER_ESG_SUBCATEGORIES)


def normalize_supplier_esg_subcategories(value: Any) -> Dict[str, List[Dict[str, Any]]]:
    """Use defaults for legacy configs while retaining an explicitly saved taxonomy."""
    if not isinstance(value, dict):
        return supplier_esg_subcategory_defaults()
    normalized = {}
    for section in ("environment", "social", "governance"):
        items = value.get(section)
        normalized[section] = deepcopy(items) if isinstance(items, list) else supplier_esg_subcategory_defaults()[section]
    return normalized