"""Reorder all BRSR Section C questions to match exact PDF order per principle."""
import asyncio
from shared.database.mongo import db

# Exact order per principle matching PDF sequence
ORDER = {
    "P1": [
        "p1_training_awareness_coverage",        # E1
        "p1_fines_penalties",                     # E2
        "p1_appeals_revisions",                   # E3
        "p1_anticorruption_policy",               # E4
        "p1_disciplinary_action_bribery",         # E5
        "p1_conflict_of_interest_complaints",     # E6
        "p1_corrective_actions",                  # E7
        "p1_accounts_payables",                   # E8
        "p1_openness_of_business",                # E9
        "p1_value_chain_awareness",               # L1
        "p1_conflict_management_process",         # L2
        "performance_against_targets",            # (extra - keep at end)
    ],
    "P2": [
        "env_sustainable_rd_capex",               # E1
        "env_sustainable_sourcing",               # E2
        "env_end_of_life_reclamation",            # E3
        "env_epr_applicable",                     # E4
        "env_life_cycle_assessment",              # L1
        "env_lca_concerns_actions",               # L2
        "env_recycled_input_material",            # L3
        "env_reclaimed_products_packaging",       # L4
        "p2_reclaimed_products_pct",              # L5
    ],
    "P3": [
        "p3_wellbeing_employees",                 # E1a
        "p3_wellbeing_workers",                   # E1b
        "p3_wellbeing_spending",                  # E1c
        "p3_retirement_benefits",                 # E2
        "p3_accessibility_differently_abled",     # E3
        "p3_equal_opportunity_policy",            # E4
        "p3_parental_leave_return",               # E5
        "grievance_mechanism_employees_workers",  # E6
        "p3_union_membership",                    # E7
        "p3_training_details",                    # E8
        "performance_career_reviews",             # E9
        "p3_ohs_management_system",               # E10
        "p3_hazard_identification",               # E10 sub
        "p3_worker_hazard_reporting",             # E10 sub
        "p3_non_occupational_healthcare",         # E10 sub
        "p3_safety_incidents",                    # E11
        "ltifr_employees_workers",                # E11 sub
        "p3_safe_workplace_measures",             # E12
        "p3_complaints_employees_workers",        # E13
        "p3_assessments_year",                    # E14
        "p3_safety_corrective_actions",           # E14 sub
        "p3_life_insurance_package",              # L1
        "p3_value_chain_statutory_dues",          # L2
        "p3_rehabilitation_injured",              # L3
        "transition_assistance_programs",         # L4
        "p3_value_chain_assessment",              # L5
        "p3_value_chain_corrective",              # L6
    ],
    "P4": [
        "p4_se_1",                                # E1
        "p4_se_2",                                # E2
        "p4_se_3",                                # L1
        "p4_se_4",                                # L2
        "p4_se_5",                                # L3
    ],
    "P5": [
        "p5_hr_training",                         # E1
        "p5_minimum_wages",                       # E2
        "p5_remuneration_details",                # E3
        "p5_gross_wages_females",                 # E3 sub
        "p5_hr_focal_point",                      # E4
        "p5_hr_grievance_mechanism",              # E5
        "p5_hr_complaints",                       # E6
        "p5_sexual_harassment_complaints",        # E7
        "p5_prevent_adverse_consequences",        # E8
        "p5_hr_business_agreements",              # E9
        "p5_hr_assessments",                      # E10
        "p5_hr_corrective_actions",               # E11
        "p5_business_process_changes",            # L1
        "p5_hr_due_diligence",                    # L2
        "p5_accessibility_differently_abled",     # L3
        "p5_value_chain_hr_assessment",           # L4
        "p5_value_chain_corrective",              # L5
    ],
    "P6": [
        "p6_energy_consumption",                  # E1
        "env_assurance_energy",                   # E1 assurance
        "env_pat_scheme_compliance",              # E2
        "p6_water_disclosures",                   # E3
        "env_assurance_water_withdrawal",         # E3 assurance
        "p6_water_discharged",                    # E4
        "env_assurance_water_discharged",         # E4 assurance
        "env_zero_liquid_discharge",              # E5
        "p6_air_emissions",                       # E6
        "env_assurance_air_emissions",            # E6 assurance
        "p6_ghg_scope12",                         # E7
        "env_assurance_ghg_scope12",              # E7 assurance
        "env_ghg_reduction_initiatives",          # E8
        "p6_waste_management_details",            # E9
        "env_assurance_waste",                    # E9 assurance
        "env_waste_management_practices_desc",    # E10
        "env_ecologically_sensitive_areas",       # E11
        "env_eia_details",                        # E12
        "env_environmental_compliance",           # E13
        "p6_water_stress_areas",                  # L1
        "env_assurance_water_stress",             # L1 assurance
        "p6_scope3_emissions",                    # L2
        "env_assurance_ghg_scope3",               # L2 assurance
        "env_biodiversity_impact",                # L3
        "env_resource_efficiency_initiatives",    # L4
        "env_business_continuity_disaster",       # L5
        "env_value_chain_impacts",                # L6
        "env_value_chain_assessment",             # L7
    ],
    "P7": [
        "trade_association_affiliations_count",   # E1a
        "top_trade_associations",                 # E1b
        "anticompetitive_corrective_actions",     # E2
        "public_policy_positions",                # L1
    ],
    "P8": [
        "p8_social_impact_assessments",           # E1
        "p8_rehabilitation_resettlement",         # E2
        "p8_community_grievance",                 # E3
        "p8_msme_domestic_sourcing",              # E4
        "p8_wage_distribution_location",          # E5
        "p8_sia_corrective_actions",              # L1
        "p8_csr_aspirational_districts",          # L2
        "p8_preferential_procurement",            # L3
        "p8_intellectual_property_traditional",   # L4
        "p8_ip_corrective_actions",               # L5
        "p8_csr_beneficiaries",                   # L6
    ],
    "P9": [
        "p9_consumer_complaints_mechanism",       # E1
        "p9_product_info_disclosure",             # E2
        "p9_consumer_complaints",                 # E3
        "p9_product_recall",                      # E4
        "cyber_security_policy",                  # E5
        "corrective_actions_advertising_cyber",   # E6
        "p9_data_breaches_count",                 # E7a
        "p9_data_breaches_pii_pct",               # E7b
        "p9_data_breaches_impact",                # E7c
        "p9_product_info_channels",               # L1
        "p9_consumer_education",                  # L2
        "p9_service_disruption_mechanism",        # L3
        "p9_product_info_beyond_legal",           # L4
        "p9_consumer_satisfaction_survey",        # L5
    ],
}

async def reorder():
    total = 0
    for principle, keys in ORDER.items():
        for idx, key in enumerate(keys, 1):
            r = await db.esg_question_configs.update_one(
                {"question_key": key, "frameworks": "BRSR"},
                {"$set": {"order": idx}}
            )
            if r.modified_count:
                total += 1
        print(f"  {principle}: ordered {len(keys)} questions")
    print(f"\nTotal updated: {total}")

asyncio.run(reorder())
