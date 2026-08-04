"""
BRSR Report Key Mappings

Maps the question_key values from esg_question_configs to the template placeholders.
This ensures portal answers are correctly displayed in the PDF report.
"""

# Section A mappings (brsr_a_* keys)
SECTION_A_MAPPINGS = {
    # I. Details of listed entity
    'cin': 'brsr_a_cin',
    'listed_entity_name': 'brsr_a_entity_name',
    'year_of_incorporation': 'brsr_a_year_of_incorporation',
    'registered_address': 'brsr_a_registered_address',  # Object with address, city, state, country, pincode
    'corporate_address': 'brsr_a_corporate_address',  # Object
    'email': 'brsr_a_email',
    'telephone': 'brsr_a_telephone',
    'website': 'brsr_a_website',
    'financial_year': 'brsr_a_financial_year',
    'stock_exchange': 'brsr_a_stock_exchange',
    'paid_up_capital': 'brsr_a_paid_up_capital',
    'reporting_boundary': 'brsr_a_reporting_boundary',
    
    # II. Products/Services
    'business_activities': 'brsr_a_business_activities',  # Array
    'products_services': 'brsr_a_products_services',  # Array
    
    # III. Operations
    'plants_offices': 'brsr_a_plants_offices',  # Array with location_type, num_plants, num_offices
    'markets_served': 'brsr_a_markets_served',  # Object with locations array
    
    # IV. Employees
    'employees_workers': 'brsr_a_employees_workers',  # Complex nested object
    'differently_abled': 'brsr_a_differently_abled',  # Complex nested object
    'women_representation': 'brsr_a_women_representation',  # Array
    'turnover_rate': 'brsr_a_turnover_rate',  # Complex nested object
    
    # V. Holding/Subsidiary
    'holding_subsidiary': 'brsr_a_holding_subsidiary',  # Array
    
    # VI. CSR
    'csr_applicability': 'brsr_a_csr_applicability',  # Object
    
    # VII. Transparency
    'complaints_grievances': 'brsr_a_complaints_grievances',  # Array
    'material_issues': 'brsr_a_material_issues',  # Array
}

# Section B mappings
SECTION_B_MAPPINGS = {
    'policy_translated_to_procedures': 'policy_translated_to_procedures',
    'policy_extend_to_value_chain': 'policy_extend_to_value_chain',
    'codes_certifications_standards': 'codes_certifications_standards',
    'commitments_goals_targets': 'commitments_goals_targets',
    'performance_against_targets': 'performance_against_targets',
    'director_statement': 'director_statement',
    'highest_authority_details': 'highest_authority_details',
    'sustainability_committee_details': 'sustainability_committee_details',
    'performance_against_policies': 'performance_against_policies',
    'independent_policy_assessment': 'independent_policy_assessment',
}

# Section C - Principle 1 mappings
P1_MAPPINGS = {
    'training_awareness_coverage': 'p1_training_awareness_coverage',
    'fines_penalties': 'p1_fines_penalties',
    'appeals_revisions': 'p1_appeals_revisions',
    'anticorruption_policy': 'p1_anticorruption_policy',
    'disciplinary_action_bribery': 'p1_disciplinary_action_bribery',
    'conflict_of_interest_complaints': 'p1_conflict_of_interest_complaints',
    'corrective_actions': 'p1_corrective_actions',
    'accounts_payables': 'p1_accounts_payables',
    'openness_of_business': 'p1_openness_of_business',
    'value_chain_awareness': 'p1_value_chain_awareness',
    'conflict_management_process': 'p1_conflict_management_process',
}

# Section C - Principle 2 mappings
P2_MAPPINGS = {
    'sustainable_rd_capex': 'env_sustainable_rd_capex',
    'sustainable_sourcing': 'env_sustainable_sourcing',
    'end_of_life_reclamation': 'env_end_of_life_reclamation',
    'epr_applicable': 'env_epr_applicable',
    'life_cycle_assessment': 'env_life_cycle_assessment',
    'lca_concerns_actions': 'env_lca_concerns_actions',
    'recycled_input_material': 'env_recycled_input_material',
    'reclaimed_products_packaging': 'env_reclaimed_products_packaging',
    'reclaimed_products_pct': 'p2_reclaimed_products_pct',
}

# Section C - Principle 3 mappings
P3_MAPPINGS = {
    'wellbeing_employees': 'p3_wellbeing_employees',
    'wellbeing_workers': 'p3_wellbeing_workers',
    'wellbeing_spending': 'p3_wellbeing_spending',
    'retirement_benefits': 'p3_retirement_benefits',
    'accessibility_differently_abled': 'p3_accessibility_differently_abled',
    'equal_opportunity_policy': 'p3_equal_opportunity_policy',
    'parental_leave_return': 'p3_parental_leave_return',
    'grievance_mechanism': 'grievance_mechanism_employees_workers',
    'union_membership': 'p3_union_membership',
    'training_details': 'p3_training_details',
    'performance_career_reviews': 'performance_career_reviews',
    'ohs_management_system': 'p3_ohs_management_system',
    'hazard_identification': 'p3_hazard_identification',
    'worker_hazard_reporting': 'p3_worker_hazard_reporting',
    'non_occupational_healthcare': 'p3_non_occupational_healthcare',
    'safety_incidents': 'p3_safety_incidents',
    'ltifr': 'ltifr_employees_workers',
    'safe_workplace_measures': 'p3_safe_workplace_measures',
    'complaints_employees_workers': 'p3_complaints_employees_workers',
    'assessments_year': 'p3_assessments_year',
    'safety_corrective_actions': 'p3_safety_corrective_actions',
    'life_insurance_package': 'p3_life_insurance_package',
    'value_chain_statutory_dues': 'p3_value_chain_statutory_dues',
    'rehabilitation_injured': 'p3_rehabilitation_injured',
    'transition_assistance': 'transition_assistance_programs',
    'value_chain_assessment': 'p3_value_chain_assessment',
    'value_chain_corrective': 'p3_value_chain_corrective',
}

# Section C - Principle 4 mappings
P4_MAPPINGS = {
    'se_1': 'p4_se_1',
    'se_2': 'p4_se_2',
    'se_3': 'p4_se_3',
    'se_4': 'p4_se_4',
    'se_5': 'p4_se_5',
}

# Section C - Principle 5 mappings
P5_MAPPINGS = {
    'hr_training': 'p5_hr_training',
    'minimum_wages': 'p5_minimum_wages',
    'remuneration_details': 'p5_remuneration_details',
    'gross_wages_females': 'p5_gross_wages_females',
    'hr_focal_point': 'p5_hr_focal_point',
    'hr_grievance_mechanism': 'p5_hr_grievance_mechanism',
    'hr_complaints': 'p5_hr_complaints',
    'sexual_harassment_complaints': 'p5_sexual_harassment_complaints',
    'prevent_adverse_consequences': 'p5_prevent_adverse_consequences',
    'hr_business_agreements': 'p5_hr_business_agreements',
    'hr_assessments': 'p5_hr_assessments',
    'hr_corrective_actions': 'p5_hr_corrective_actions',
    'business_process_changes': 'p5_business_process_changes',
    'hr_due_diligence': 'p5_hr_due_diligence',
    'accessibility_differently_abled': 'p5_accessibility_differently_abled',
    'value_chain_hr_assessment': 'p5_value_chain_hr_assessment',
    'value_chain_corrective': 'p5_value_chain_corrective',
}

# Section C - Principle 6 mappings
P6_MAPPINGS = {
    'energy_consumption': 'p6_energy_consumption',
    'assurance_energy': 'env_assurance_energy',
    'pat_scheme': 'env_pat_scheme_compliance',
    'water_disclosures': 'p6_water_disclosures',
    'assurance_water_withdrawal': 'env_assurance_water_withdrawal',
    'water_discharged': 'p6_water_discharged',
    'assurance_water_discharged': 'env_assurance_water_discharged',
    'zero_liquid_discharge': 'env_zero_liquid_discharge',
    'air_emissions': 'p6_air_emissions',
    'assurance_air_emissions': 'env_assurance_air_emissions',
    'ghg_scope12': 'p6_ghg_scope12',
    'assurance_ghg_scope12': 'env_assurance_ghg_scope12',
    'ghg_reduction_initiatives': 'env_ghg_reduction_initiatives',
    'waste_management_details': 'p6_waste_management_details',
    'assurance_waste': 'env_assurance_waste',
    'waste_management_practices': 'env_waste_management_practices_desc',
    'ecologically_sensitive_areas': 'env_ecologically_sensitive_areas',
    'eia_details': 'env_eia_details',
    'environmental_compliance': 'env_environmental_compliance',
    'water_stress_areas': 'p6_water_stress_areas',
    'assurance_water_stress': 'env_assurance_water_stress',
    'scope3_emissions': 'p6_scope3_emissions',
    'assurance_ghg_scope3': 'env_assurance_ghg_scope3',
    'biodiversity_impact': 'env_biodiversity_impact',
    'resource_efficiency_initiatives': 'env_resource_efficiency_initiatives',
    'business_continuity_disaster': 'env_business_continuity_disaster',
    'value_chain_impacts': 'env_value_chain_impacts',
    'value_chain_assessment': 'env_value_chain_assessment',
}

# Section C - Principle 7 mappings
P7_MAPPINGS = {
    'affiliations_count': 'trade_association_affiliations_count',
    'top_trade_associations': 'top_trade_associations',
    'anticompetitive_corrective_actions': 'anticompetitive_corrective_actions',
    'public_policy_positions': 'public_policy_positions',
}

# Section C - Principle 8 mappings
P8_MAPPINGS = {
    'social_impact_assessments': 'p8_social_impact_assessments',
    'rehabilitation_resettlement': 'p8_rehabilitation_resettlement',
    'community_grievance': 'p8_community_grievance',
    'msme_domestic_sourcing': 'p8_msme_domestic_sourcing',
    'wage_distribution_location': 'p8_wage_distribution_location',
    'sia_corrective_actions': 'p8_sia_corrective_actions',
    'csr_aspirational_districts': 'p8_csr_aspirational_districts',
    'preferential_procurement': 'p8_preferential_procurement',
    'intellectual_property_traditional': 'p8_intellectual_property_traditional',
    'ip_corrective_actions': 'p8_ip_corrective_actions',
    'csr_beneficiaries': 'p8_csr_beneficiaries',
}

# Section C - Principle 9 mappings
P9_MAPPINGS = {
    'consumer_complaints_mechanism': 'p9_consumer_complaints_mechanism',
    'product_info_disclosure': 'p9_product_info_disclosure',
    'consumer_complaints': 'p9_consumer_complaints',
    'product_recall': 'p9_product_recall',
    'cyber_security_policy': 'cyber_security_policy',
    'corrective_actions_advertising_cyber': 'corrective_actions_advertising_cyber',
    'data_breaches_count': 'p9_data_breaches_count',
    'data_breaches_pii_pct': 'p9_data_breaches_pii_pct',
    'data_breaches_impact': 'p9_data_breaches_impact',
    'product_info_channels': 'p9_product_info_channels',
    'consumer_education': 'p9_consumer_education',
    'service_disruption_mechanism': 'p9_service_disruption_mechanism',
    'product_info_beyond_legal': 'p9_product_info_beyond_legal',
    'consumer_satisfaction_survey': 'p9_consumer_satisfaction_survey',
}

# Combined Section C mappings
SECTION_C_MAPPINGS = {
    **{f'p1_{k}': v for k, v in P1_MAPPINGS.items()},
    **{f'p2_{k}': v for k, v in P2_MAPPINGS.items()},
    **{f'p3_{k}': v for k, v in P3_MAPPINGS.items()},
    **{f'p4_{k}': v for k, v in P4_MAPPINGS.items()},
    **{f'p5_{k}': v for k, v in P5_MAPPINGS.items()},
    **{f'p6_{k}': v for k, v in P6_MAPPINGS.items()},
    **{f'p7_{k}': v for k, v in P7_MAPPINGS.items()},
    **{f'p8_{k}': v for k, v in P8_MAPPINGS.items()},
    **{f'p9_{k}': v for k, v in P9_MAPPINGS.items()},
}
