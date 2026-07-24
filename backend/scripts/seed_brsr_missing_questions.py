"""
Seed missing BRSR Section B & Section C questions from the official BRSR PDF.
Also fixes misassigned principles (e.g., sustainable sourcing should be P2 not P3).
"""
import asyncio
import uuid
from shared.database.mongo import db

MISSING_QUESTIONS = [
    # ── SECTION B missing ──
    {
        "question_key": "ngrbc_review_details",
        "question": "Details of Review of NGRBCs by the Company: Subject for Review / Indicate whether review was undertaken by Director / Committee of the Board / Any other Committee. Frequency.",
        "section": "section_b",
        "brsr_principle": "SECTION_B",
        "type": "textarea",
        "frameworks": ["BRSR"],
        "order": 12,
        "response_mode": "fy_comparison",
    },

    # ── P1 missing ──
    {
        "question_key": "p1_training_awareness_coverage",
        "question": "Percentage coverage by training and awareness programmes on any of the Principles during the financial year:",
        "section": "governance",
        "brsr_principle": "P1",
        "type": "principle_training_table",
        "frameworks": ["BRSR"],
        "order": 1,
        "response_mode": "fy_comparison",
    },
    {
        "question_key": "p1_disciplinary_action_bribery",
        "question": "Number of Directors/KMPs/employees/workers against whom disciplinary action was taken by any law enforcement agency for the charges of bribery/ corruption:",
        "section": "governance",
        "brsr_principle": "P1",
        "type": "fy_comparison_table",
        "frameworks": ["BRSR"],
        "order": 5,
        "response_mode": "fy_comparison",
    },
    {
        "question_key": "p1_conflict_of_interest_complaints",
        "question": "Details of complaints with regard to conflict of interest:",
        "section": "governance",
        "brsr_principle": "P1",
        "type": "fy_comparison_table",
        "frameworks": ["BRSR"],
        "order": 6,
        "response_mode": "fy_comparison",
    },

    # ── P2 missing ──
    {
        "question_key": "p2_reclaimed_products_pct",
        "question": "Reclaimed products and their packaging materials (as percentage of products sold) for each product category.",
        "section": "environment",
        "brsr_principle": "P2",
        "type": "fy_comparison_table",
        "frameworks": ["BRSR"],
        "order": 10,
        "response_mode": "fy_comparison",
    },

    # ── P3 missing ──
    {
        "question_key": "p3_wellbeing_employees",
        "question": "Details of measures for the well-being of employees:",
        "section": "social",
        "brsr_principle": "P3",
        "type": "fy_comparison_table",
        "frameworks": ["BRSR"],
        "order": 1,
        "response_mode": "fy_comparison",
    },
    {
        "question_key": "p3_wellbeing_workers",
        "question": "Details of measures for the well-being of workers:",
        "section": "social",
        "brsr_principle": "P3",
        "type": "fy_comparison_table",
        "frameworks": ["BRSR"],
        "order": 2,
        "response_mode": "fy_comparison",
    },
    {
        "question_key": "p3_wellbeing_spending",
        "question": "Spending on measures towards well-being of employees and workers (including permanent and other than permanent) in the following format:",
        "section": "social",
        "brsr_principle": "P3",
        "type": "fy_comparison_table",
        "frameworks": ["BRSR"],
        "order": 3,
        "response_mode": "fy_comparison",
    },
    {
        "question_key": "p3_retirement_benefits",
        "question": "Details of retirement benefits, for Current FY and Previous Financial Year.",
        "section": "social",
        "brsr_principle": "P3",
        "type": "fy_comparison_table",
        "frameworks": ["BRSR"],
        "order": 4,
        "response_mode": "fy_comparison",
    },
    {
        "question_key": "p3_parental_leave_return",
        "question": "Return to work and Retention rates of permanent employees and workers that took parental leave.",
        "section": "social",
        "brsr_principle": "P3",
        "type": "fy_comparison_table",
        "frameworks": ["BRSR"],
        "order": 7,
        "response_mode": "fy_comparison",
    },
    {
        "question_key": "p3_union_membership",
        "question": "Membership of employees and worker in association(s) or Unions recognised by the listed entity:",
        "section": "social",
        "brsr_principle": "P3",
        "type": "fy_comparison_table",
        "frameworks": ["BRSR"],
        "order": 9,
        "response_mode": "fy_comparison",
    },
    {
        "question_key": "p3_training_details",
        "question": "Details of training given to employees and workers including on Health and Safety Measures and on Skill Upgradation:",
        "section": "social",
        "brsr_principle": "P3",
        "type": "fy_comparison_table",
        "frameworks": ["BRSR"],
        "order": 10,
        "response_mode": "fy_comparison",
    },
    {
        "question_key": "p3_safety_incidents",
        "question": "Details of safety related incidents, in the following format:",
        "section": "social",
        "brsr_principle": "P3",
        "type": "fy_comparison_table",
        "frameworks": ["BRSR"],
        "order": 13,
        "response_mode": "fy_comparison",
    },
    {
        "question_key": "p3_complaints_employees_workers",
        "question": "Number of Complaints on the following made by employees and workers: Working Conditions, Health & Safety.",
        "section": "social",
        "brsr_principle": "P3",
        "type": "fy_comparison_table",
        "frameworks": ["BRSR"],
        "order": 15,
        "response_mode": "fy_comparison",
    },
    {
        "question_key": "p3_rehabilitation_injured",
        "question": "Provide the number of employees / workers having suffered high consequence work-related injury / ill-health / fatalities, who have been rehabilitated and placed in suitable employment or whose family members have been placed in suitable employment:",
        "section": "social",
        "brsr_principle": "P3",
        "type": "fy_comparison_table",
        "frameworks": ["BRSR"],
        "order": 20,
        "response_mode": "fy_comparison",
    },

    # ── P5 missing ──
    {
        "question_key": "p5_hr_training",
        "question": "Employees and workers who have been provided training on human rights issues and policy(ies) of the entity, in the following format:",
        "section": "social",
        "brsr_principle": "P5",
        "type": "fy_comparison_table",
        "frameworks": ["BRSR"],
        "order": 1,
        "response_mode": "fy_comparison",
    },
    {
        "question_key": "p5_minimum_wages",
        "question": "Details of minimum wages paid to employees and workers, in the following format:",
        "section": "social",
        "brsr_principle": "P5",
        "type": "fy_comparison_table",
        "frameworks": ["BRSR"],
        "order": 2,
        "response_mode": "fy_comparison",
    },
    {
        "question_key": "p5_remuneration_details",
        "question": "Details of remuneration/salary/wages, in the following format:",
        "section": "social",
        "brsr_principle": "P5",
        "type": "fy_comparison_table",
        "frameworks": ["BRSR"],
        "order": 3,
        "response_mode": "fy_comparison",
    },
    {
        "question_key": "p5_hr_complaints",
        "question": "Number of Complaints on the following made by employees and workers: Sexual Harassment, Discrimination at workplace, Child Labour, Forced Labour/Involuntary Labour, Wages, Other human rights related issues.",
        "section": "social",
        "brsr_principle": "P5",
        "type": "fy_comparison_table",
        "frameworks": ["BRSR"],
        "order": 6,
        "response_mode": "fy_comparison",
    },
    {
        "question_key": "p5_sexual_harassment_complaints",
        "question": "Complaints filed under the Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013, in the following format:",
        "section": "social",
        "brsr_principle": "P5",
        "type": "fy_comparison_table",
        "frameworks": ["BRSR"],
        "order": 7,
        "response_mode": "fy_comparison",
    },

    # ── P6 missing ──
    {
        "question_key": "p6_energy_consumption",
        "question": "Details of total energy consumption (in Joules or multiples) and energy intensity, in the following format:",
        "section": "environment",
        "brsr_principle": "P6",
        "type": "fy_comparison_table",
        "frameworks": ["BRSR"],
        "order": 1,
        "response_mode": "fy_comparison",
    },
    {
        "question_key": "p6_water_disclosures",
        "question": "Provide details of the following disclosures related to water, in the following format:",
        "section": "environment",
        "brsr_principle": "P6",
        "type": "fy_comparison_table",
        "frameworks": ["BRSR"],
        "order": 3,
        "response_mode": "fy_comparison",
    },
    {
        "question_key": "p6_water_discharged",
        "question": "Provide the following details related to water discharged:",
        "section": "environment",
        "brsr_principle": "P6",
        "type": "fy_comparison_table",
        "frameworks": ["BRSR"],
        "order": 4,
        "response_mode": "fy_comparison",
    },
    {
        "question_key": "p6_air_emissions",
        "question": "Please provide details of air emissions (other than GHG emissions) by the entity, in the following format:",
        "section": "environment",
        "brsr_principle": "P6",
        "type": "fy_comparison_table",
        "frameworks": ["BRSR"],
        "order": 6,
        "response_mode": "fy_comparison",
    },
    {
        "question_key": "p6_ghg_scope12",
        "question": "Provide details of greenhouse gas emissions (Scope 1 and Scope 2 emissions) & its intensity, in the following format:",
        "section": "environment",
        "brsr_principle": "P6",
        "type": "fy_comparison_table",
        "frameworks": ["BRSR"],
        "order": 7,
        "response_mode": "fy_comparison",
    },
    {
        "question_key": "p6_waste_management_details",
        "question": "Provide details related to waste management by the entity, in the following format:",
        "section": "environment",
        "brsr_principle": "P6",
        "type": "fy_comparison_table",
        "frameworks": ["BRSR"],
        "order": 9,
        "response_mode": "fy_comparison",
    },
    {
        "question_key": "p6_water_stress_areas",
        "question": "Water withdrawal, consumption and discharge in areas of water stress (in kilolitres): For each facility / plant located in areas of water stress, provide the following information:",
        "section": "environment",
        "brsr_principle": "P6",
        "type": "fy_comparison_table",
        "frameworks": ["BRSR"],
        "order": 14,
        "response_mode": "fy_comparison",
    },
    {
        "question_key": "p6_scope3_emissions",
        "question": "Please provide details of total Scope 3 emissions & its intensity, in the following format:",
        "section": "environment",
        "brsr_principle": "P6",
        "type": "fy_comparison_table",
        "frameworks": ["BRSR"],
        "order": 15,
        "response_mode": "fy_comparison",
    },
]

# Fix principle assignments
FIXES = [
    # env_sustainable_sourcing should be P2, not P3
    {"question_key": "env_sustainable_sourcing", "brsr_principle": "P2"},
]


async def seed():
    inserted = 0
    skipped = 0
    for q in MISSING_QUESTIONS:
        exists = await db.esg_question_configs.find_one({"question_key": q["question_key"]})
        if exists:
            skipped += 1
            continue
        doc = {**q, "id": str(uuid.uuid4())}
        await db.esg_question_configs.insert_one(doc)
        inserted += 1

    print(f"Inserted {inserted} new questions, skipped {skipped} existing")

    # Apply fixes
    for fix in FIXES:
        key = fix.pop("question_key")
        result = await db.esg_question_configs.update_one(
            {"question_key": key},
            {"$set": fix}
        )
        if result.modified_count:
            print(f"Fixed {key}: {fix}")

    # Verify totals
    for p in ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9"]:
        count = await db.esg_question_configs.count_documents({"frameworks": "BRSR", "brsr_principle": p})
        print(f"  {p}: {count} questions")

    total = await db.esg_question_configs.count_documents({"frameworks": "BRSR"})
    print(f"Total BRSR questions: {total}")


if __name__ == "__main__":
    asyncio.run(seed())
