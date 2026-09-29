export const ESG_SECTIONS = [
  { value: 'environment', label: 'Environment' },
  { value: 'social', label: 'Social' },
  { value: 'governance', label: 'Governance' },
];

export const DEFAULT_SUPPLIER_ESG_TAXONOMY = {
  environment: [
    ['ghg_emissions_climate_transition', 'GHG Emissions & Climate Transition'], ['energy_efficiency_renewable_energy', 'Energy Efficiency & Renewable Energy'], ['water_effluent_stewardship', 'Water & Effluent Stewardship'], ['waste_management_circular_economy', 'Waste Management & Circular Economy'], ['air_emissions_pollution_prevention', 'Air Emissions & Pollution Prevention'], ['sustainable_procurement_materials', 'Sustainable Procurement & Materials'], ['biodiversity_ecological_protection', 'Biodiversity & Ecological Protection'], ['environmental_compliance_management_systems', 'Environmental Compliance & Management Systems'],
  ].map(([code, name]) => ({ code, name, enabled: true, weight: 12.5 })),
  social: [
    ['occupational_health_safety', 'Occupational Health & Safety (OHS)'], ['working_conditions_fair_compensation', 'Working Conditions & Fair Compensation'], ['human_rights_child_forced_labor', 'Human Rights & Child/Forced Labor'], ['freedom_association_cba', 'Freedom of Association & CBA'], ['diversity_equity_inclusion', 'Diversity, Equity & Inclusion (DEI)'], ['training_career_development', 'Training & Career Development'], ['supply_chain_social_due_diligence', 'Supply Chain Social Due Diligence'], ['community_relations_csr', 'Community Relations & CSR'],
  ].map(([code, name]) => ({ code, name, enabled: true, weight: 12.5 })),
  governance: [
    ['board_oversight_esg_leadership', 'Board Oversight & ESG Leadership'], ['business_ethics_anti_corruption', 'Business Ethics & Anti-Corruption'], ['fair_competition_ethical_trade', 'Fair Competition & Ethical Trade'], ['whistleblower_grievance_mechanism', 'Whistleblower & Grievance Mechanism'], ['data_privacy_cybersecurity', 'Data Privacy & Cybersecurity'], ['statutory_compliance_risk_management', 'Statutory Compliance & Risk Management'], ['supply_chain_governance_code', 'Supply Chain Governance & Code'],
  ].map(([code, name], index) => ({ code, name, enabled: true, weight: index === 6 ? 14.2858 : 14.2857 })),
};

export const cloneSupplierEsgTaxonomy = (taxonomy) => {
  const source = taxonomy && typeof taxonomy === 'object' ? taxonomy : DEFAULT_SUPPLIER_ESG_TAXONOMY;
  return Object.fromEntries(
    ESG_SECTIONS.map(({ value }) => [value, (source[value] || DEFAULT_SUPPLIER_ESG_TAXONOMY[value]).map((item) => ({ ...item }))]),
  );
};