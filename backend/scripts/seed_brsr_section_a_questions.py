"""
Seed BRSR Section A Question Configs

Creates question configs for all Section A fields so they can be stored in
organization_esg_responses with full task/approval workflow support.

Section A covers:
- I. Details of the Listed Entity (Q1-15)
- II. Products/Services (Q16-17)
- III. Operations (Q18-19)
- IV. Employees and Workers (Q20-21)
- V. Holding, Subsidiary and Associate Companies (Q22)
- VI. CSR Details (Q23)
- VII. Transparency and Disclosures Compliances (Q24)
- VIII. Turnover Rate (Q25)
- IX. Complaints/Grievances (Q26) 
- X. Material Responsible Business Conduct Issues (Q27)
"""
import asyncio
from datetime import datetime, timezone
from shared.database.mongo import db

# Section A Question Configs
SECTION_A_QUESTIONS = [
    # ════════════════════════════════════════════════════════════════════
    # I. Details of the Listed Entity
    # ════════════════════════════════════════════════════════════════════
    {
        "question_key": "brsr_a_cin",
        "question": "Corporate Identity Number (CIN) of the Listed Entity",
        "section": "section_a",
        "brsr_principle": "SECTION_A",
        "type": "text",
        "frameworks": ["BRSR"],
        "order": 1,
        "required": True,
        "group": "I. Details of the Listed Entity",
    },
    {
        "question_key": "brsr_a_entity_name",
        "question": "Name of the Listed Entity",
        "section": "section_a",
        "brsr_principle": "SECTION_A",
        "type": "text",
        "frameworks": ["BRSR"],
        "order": 2,
        "required": True,
        "group": "I. Details of the Listed Entity",
    },
    {
        "question_key": "brsr_a_year_of_incorporation",
        "question": "Year of incorporation",
        "section": "section_a",
        "brsr_principle": "SECTION_A",
        "type": "number",
        "frameworks": ["BRSR"],
        "order": 3,
        "required": True,
        "group": "I. Details of the Listed Entity",
    },
    {
        "question_key": "brsr_a_registered_address",
        "question": "Registered office address",
        "section": "section_a",
        "brsr_principle": "SECTION_A",
        "type": "address",
        "frameworks": ["BRSR"],
        "order": 4,
        "required": True,
        "group": "I. Details of the Listed Entity",
        "config": {
            "fields": ["address", "city", "state", "country", "pincode"]
        }
    },
    {
        "question_key": "brsr_a_corporate_address",
        "question": "Corporate address",
        "section": "section_a",
        "brsr_principle": "SECTION_A",
        "type": "address",
        "frameworks": ["BRSR"],
        "order": 5,
        "required": False,
        "group": "I. Details of the Listed Entity",
        "config": {
            "fields": ["address", "city", "state", "country", "pincode"]
        }
    },
    {
        "question_key": "brsr_a_email",
        "question": "E-mail",
        "section": "section_a",
        "brsr_principle": "SECTION_A",
        "type": "email",
        "frameworks": ["BRSR"],
        "order": 6,
        "required": True,
        "group": "I. Details of the Listed Entity",
    },
    {
        "question_key": "brsr_a_telephone",
        "question": "Telephone",
        "section": "section_a",
        "brsr_principle": "SECTION_A",
        "type": "text",
        "frameworks": ["BRSR"],
        "order": 7,
        "required": True,
        "group": "I. Details of the Listed Entity",
    },
    {
        "question_key": "brsr_a_website",
        "question": "Website",
        "section": "section_a",
        "brsr_principle": "SECTION_A",
        "type": "url",
        "frameworks": ["BRSR"],
        "order": 8,
        "required": True,
        "group": "I. Details of the Listed Entity",
    },
    {
        "question_key": "brsr_a_financial_year",
        "question": "Financial year for which reporting is being done",
        "section": "section_a",
        "brsr_principle": "SECTION_A",
        "type": "text",
        "frameworks": ["BRSR"],
        "order": 9,
        "required": True,
        "group": "I. Details of the Listed Entity",
        "config": {
            "auto_filled": True,
            "source": "reporting_period"
        }
    },
    {
        "question_key": "brsr_a_stock_exchange",
        "question": "Name of the Stock Exchange(s) where shares are listed",
        "section": "section_a",
        "brsr_principle": "SECTION_A",
        "type": "radio",
        "frameworks": ["BRSR"],
        "order": 10,
        "required": True,
        "group": "I. Details of the Listed Entity",
        "config": {
            "options": ["BSE", "NSE", "Both NSE & BSE"]
        }
    },
    {
        "question_key": "brsr_a_paid_up_capital",
        "question": "Paid-up Capital",
        "section": "section_a",
        "brsr_principle": "SECTION_A",
        "type": "currency",
        "frameworks": ["BRSR"],
        "order": 11,
        "required": True,
        "group": "I. Details of the Listed Entity",
        "config": {
            "currency": "INR"
        }
    },
    {
        "question_key": "brsr_a_contact_person",
        "question": "Name and contact details (telephone, email address) of the person who may be contacted in case of any queries on the BRSR report",
        "section": "section_a",
        "brsr_principle": "SECTION_A",
        "type": "contact",
        "frameworks": ["BRSR"],
        "order": 12,
        "required": True,
        "group": "I. Details of the Listed Entity",
        "config": {
            "fields": ["name", "telephone", "email"]
        }
    },
    {
        "question_key": "brsr_a_reporting_boundary",
        "question": "Reporting boundary - Are the disclosures under this report made on a standalone basis (i.e. only for the entity) or on a consolidated basis (i.e. for the entity and all the entities which form a part of its consolidated financial statements, taken together)",
        "section": "section_a",
        "brsr_principle": "SECTION_A",
        "type": "radio",
        "frameworks": ["BRSR"],
        "order": 13,
        "required": True,
        "group": "I. Details of the Listed Entity",
        "config": {
            "options": ["Standalone", "Consolidated"]
        }
    },
    {
        "question_key": "brsr_a_assurance_provider",
        "question": "Name of assurance provider",
        "section": "section_a",
        "brsr_principle": "SECTION_A",
        "type": "text",
        "frameworks": ["BRSR"],
        "order": 14,
        "required": False,
        "group": "I. Details of the Listed Entity",
    },
    {
        "question_key": "brsr_a_assurance_type",
        "question": "Type of assurance obtained",
        "section": "section_a",
        "brsr_principle": "SECTION_A",
        "type": "text",
        "frameworks": ["BRSR"],
        "order": 15,
        "required": False,
        "group": "I. Details of the Listed Entity",
    },
    
    # ════════════════════════════════════════════════════════════════════
    # II. Products/Services
    # ════════════════════════════════════════════════════════════════════
    {
        "question_key": "brsr_a_business_activities",
        "question": "Details of business activities (accounting for 90% of the turnover)",
        "section": "section_a",
        "brsr_principle": "SECTION_A",
        "type": "dynamic_table",
        "frameworks": ["BRSR"],
        "order": 16,
        "required": True,
        "group": "II. Products/Services",
        "config": {
            "columns": [
                {"key": "description", "label": "Description of Main Activity", "type": "text"},
                {"key": "main_activity", "label": "Description of Business Activity", "type": "text"},
                {"key": "turnover_percentage", "label": "% of Turnover", "type": "number", "max": 100}
            ],
            "min_rows": 1,
            "max_rows": 10
        }
    },
    {
        "question_key": "brsr_a_products_services",
        "question": "Products/Services sold by the entity (accounting for 90% of the entity's Turnover)",
        "section": "section_a",
        "brsr_principle": "SECTION_A",
        "type": "dynamic_table",
        "frameworks": ["BRSR"],
        "order": 17,
        "required": True,
        "group": "II. Products/Services",
        "config": {
            "columns": [
                {"key": "product_service", "label": "Product/Service", "type": "text"},
                {"key": "nic_code", "label": "NIC Code", "type": "text"},
                {"key": "turnover_percentage", "label": "% of Total Turnover", "type": "number", "max": 100}
            ],
            "min_rows": 1,
            "max_rows": 10
        }
    },
    
    # ════════════════════════════════════════════════════════════════════
    # III. Operations
    # ════════════════════════════════════════════════════════════════════
    {
        "question_key": "brsr_a_plants_offices",
        "question": "Number of locations where plants and/or operations/offices of the entity are situated",
        "section": "section_a",
        "brsr_principle": "SECTION_A",
        "type": "dynamic_table",
        "frameworks": ["BRSR"],
        "order": 18,
        "required": True,
        "group": "III. Operations",
        "config": {
            "columns": [
                {"key": "location_type", "label": "Location", "type": "select", "options": ["National", "International"]},
                {"key": "num_plants", "label": "Number of Plants", "type": "number"},
                {"key": "num_offices", "label": "Number of Offices", "type": "number"}
            ],
            "fixed_rows": [
                {"location_type": "National"},
                {"location_type": "International"}
            ]
        }
    },
    {
        "question_key": "brsr_a_markets_served",
        "question": "Markets served by the entity",
        "section": "section_a",
        "brsr_principle": "SECTION_A",
        "type": "composite",
        "frameworks": ["BRSR"],
        "order": 19,
        "required": True,
        "group": "III. Operations",
        "config": {
            "sub_fields": [
                {
                    "key": "locations",
                    "label": "Number of locations",
                    "type": "dynamic_table",
                    "columns": [
                        {"key": "location_type", "label": "Location", "type": "select", "options": ["National", "International"]},
                        {"key": "number", "label": "Number (States/Countries)", "type": "number"}
                    ]
                },
                {
                    "key": "export_contribution_percentage",
                    "label": "What is the contribution of exports as a percentage of the total turnover of the entity?",
                    "type": "number",
                    "suffix": "%"
                },
                {
                    "key": "customer_types_brief",
                    "label": "A brief on types of customers",
                    "type": "textarea"
                }
            ]
        }
    },
    
    # ════════════════════════════════════════════════════════════════════
    # IV. Employees and Workers
    # ════════════════════════════════════════════════════════════════════
    {
        "question_key": "brsr_a_employees_workers",
        "question": "Details of employees and workers",
        "section": "section_a",
        "brsr_principle": "SECTION_A",
        "type": "employees_workers_matrix",
        "frameworks": ["BRSR"],
        "order": 20,
        "required": True,
        "group": "IV. Employees and Workers",
        "config": {
            "categories": [
                {"key": "employees", "label": "Employees", "sub_categories": [
                    {"key": "permanent", "label": "Permanent (D)"},
                    {"key": "other_than_permanent", "label": "Other than Permanent (E)"}
                ]},
                {"key": "workers", "label": "Workers", "sub_categories": [
                    {"key": "permanent", "label": "Permanent (F)"},
                    {"key": "other_than_permanent", "label": "Other than Permanent (G)"}
                ]}
            ],
            "columns": ["male", "female", "total"]
        }
    },
    {
        "question_key": "brsr_a_differently_abled",
        "question": "Differently abled Employees and workers",
        "section": "section_a",
        "brsr_principle": "SECTION_A",
        "type": "employees_workers_matrix",
        "frameworks": ["BRSR"],
        "order": 21,
        "required": True,
        "group": "IV. Employees and Workers",
        "config": {
            "categories": [
                {"key": "employees", "label": "Differently Abled Employees", "sub_categories": [
                    {"key": "permanent", "label": "Permanent (D)"},
                    {"key": "other_than_permanent", "label": "Other than Permanent (E)"}
                ]},
                {"key": "workers", "label": "Differently Abled Workers", "sub_categories": [
                    {"key": "permanent", "label": "Permanent (F)"},
                    {"key": "other_than_permanent", "label": "Other than Permanent (G)"}
                ]}
            ],
            "columns": ["male", "female", "total"]
        }
    },
    {
        "question_key": "brsr_a_women_representation",
        "question": "Participation/Inclusion/Representation of women",
        "section": "section_a",
        "brsr_principle": "SECTION_A",
        "type": "dynamic_table",
        "frameworks": ["BRSR"],
        "order": 22,
        "required": True,
        "group": "IV. Employees and Workers",
        "config": {
            "columns": [
                {"key": "category", "label": "Category", "type": "select", "options": ["Board of Directors", "Key Management Personnel"]},
                {"key": "total", "label": "Total (A)", "type": "number"},
                {"key": "number_of_females", "label": "No. of Females (B)", "type": "number"},
                {"key": "percentage", "label": "% (B/A)", "type": "computed", "formula": "(number_of_females / total) * 100"}
            ],
            "fixed_rows": [
                {"category": "Board of Directors"},
                {"category": "Key Management Personnel"}
            ]
        }
    },
    {
        "question_key": "brsr_a_turnover_rate",
        "question": "Turnover rate for permanent employees and workers (Disclose trends for the past 3 years)",
        "section": "section_a",
        "brsr_principle": "SECTION_A",
        "type": "turnover_rate_matrix",
        "frameworks": ["BRSR"],
        "order": 23,
        "required": True,
        "group": "IV. Employees and Workers",
        "config": {
            "rows": [
                {"key": "permanent_employees", "label": "Permanent Employees"},
                {"key": "permanent_workers", "label": "Permanent Workers"}
            ],
            "columns_per_year": ["male", "female", "total"],
            "years": 3
        }
    },
    
    # ════════════════════════════════════════════════════════════════════
    # V. Holding, Subsidiary and Associate Companies
    # ════════════════════════════════════════════════════════════════════
    {
        "question_key": "brsr_a_holding_subsidiary",
        "question": "Names of holding / subsidiary / associate companies / joint ventures",
        "section": "section_a",
        "brsr_principle": "SECTION_A",
        "type": "dynamic_table",
        "frameworks": ["BRSR"],
        "order": 24,
        "required": False,
        "group": "V. Holding, Subsidiary and Associate Companies",
        "config": {
            "columns": [
                {"key": "name_of_entity", "label": "Name of Entity", "type": "text"},
                {"key": "type_of_entity", "label": "Type", "type": "select", "options": ["Holding Company", "Subsidiary", "Associate Company", "Joint Venture"]},
                {"key": "shares_held_percentage", "label": "% of Shares Held", "type": "number", "max": 100},
                {"key": "participates_in_br_initiatives", "label": "Participates in BR Initiatives?", "type": "boolean"}
            ],
            "min_rows": 0,
            "max_rows": 50
        }
    },
    
    # ════════════════════════════════════════════════════════════════════
    # VI. CSR Details
    # ════════════════════════════════════════════════════════════════════
    {
        "question_key": "brsr_a_csr_applicability",
        "question": "CSR Details",
        "section": "section_a",
        "brsr_principle": "SECTION_A",
        "type": "csr_details",
        "frameworks": ["BRSR"],
        "order": 25,
        "required": True,
        "group": "VI. CSR Details",
        "config": {
            "fields": [
                {"key": "is_applicable", "label": "Whether CSR is applicable as per section 135 of Companies Act, 2013", "type": "boolean"},
                {"key": "turnover_inr", "label": "Turnover (in Rs.)", "type": "currency"},
                {"key": "net_worth_inr", "label": "Net worth (in Rs.)", "type": "currency"}
            ]
        }
    },
    
    # ════════════════════════════════════════════════════════════════════
    # VII. Transparency and Disclosures Compliances
    # ════════════════════════════════════════════════════════════════════
    {
        "question_key": "brsr_a_complaints_grievances",
        "question": "Complaints/Grievances on any of the principles (Principles 1 to 9) under the National Guidelines on Responsible Business Conduct",
        "section": "section_a",
        "brsr_principle": "SECTION_A",
        "type": "complaints_grievances_matrix",
        "frameworks": ["BRSR"],
        "order": 26,
        "required": True,
        "group": "VII. Transparency and Disclosures Compliances",
        "config": {
            "stakeholder_categories": [
                "Communities",
                "Investors (other than shareholders)",
                "Shareholders",
                "Employees and workers",
                "Customers",
                "Value Chain Partners",
                "Other (please specify)"
            ],
            "columns_per_fy": [
                {"key": "has_mechanism", "label": "Grievance Redressal Mechanism in Place (Yes/No)", "type": "boolean"},
                {"key": "policy_weblink", "label": "If Yes, then provide web-link", "type": "url"},
                {"key": "filed", "label": "Number of complaints filed", "type": "number"},
                {"key": "pending", "label": "Number of complaints pending resolution", "type": "number"},
                {"key": "remarks", "label": "Remarks", "type": "text"}
            ]
        }
    },
    
    # ════════════════════════════════════════════════════════════════════
    # VIII. Material Responsible Business Conduct Issues
    # ════════════════════════════════════════════════════════════════════
    {
        "question_key": "brsr_a_material_issues",
        "question": "Material responsible business conduct and sustainability issues pertaining to environmental and social matters that present a risk or an opportunity to the entity",
        "section": "section_a",
        "brsr_principle": "SECTION_A",
        "type": "dynamic_table",
        "frameworks": ["BRSR"],
        "order": 27,
        "required": True,
        "group": "VIII. Material Responsible Business Conduct Issues",
        "config": {
            "columns": [
                {"key": "issue_identified", "label": "Material Issue Identified", "type": "textarea"},
                {"key": "risk_or_opportunity", "label": "Indicate whether risk or opportunity", "type": "select", "options": ["Risk", "Opportunity"]},
                {"key": "rationale", "label": "Rationale for identifying the risk / opportunity", "type": "textarea"},
                {"key": "mitigation_approach", "label": "In case of risk, approach to adapt or mitigate", "type": "textarea"},
                {"key": "financial_implication", "label": "Financial implications of the risk or opportunity", "type": "select", "options": ["Positive", "Negative", "Neutral"]},
                {"key": "financial_details", "label": "Financial implications details", "type": "textarea"}
            ],
            "min_rows": 1,
            "max_rows": 20
        }
    },
]


async def seed_section_a_questions():
    """Seed Section A question configs into esg_question_configs collection."""
    collection = db.esg_question_configs
    now = datetime.now(timezone.utc).isoformat()
    
    inserted = 0
    updated = 0
    skipped = 0
    
    for q in SECTION_A_QUESTIONS:
        existing = await collection.find_one({"question_key": q["question_key"]})
        
        doc = {
            **q,
            "updated_at": now,
        }
        
        if existing:
            # Update existing
            await collection.update_one(
                {"question_key": q["question_key"]},
                {"$set": doc}
            )
            updated += 1
            print(f"  Updated: {q['question_key']}")
        else:
            # Insert new
            doc["created_at"] = now
            await collection.insert_one(doc)
            inserted += 1
            print(f"  Inserted: {q['question_key']}")
    
    print(f"\n=== Section A Questions Seeded ===")
    print(f"  Inserted: {inserted}")
    print(f"  Updated: {updated}")
    print(f"  Total: {len(SECTION_A_QUESTIONS)}")
    
    return {"inserted": inserted, "updated": updated, "total": len(SECTION_A_QUESTIONS)}


async def main():
    print("Seeding BRSR Section A Question Configs...")
    result = await seed_section_a_questions()
    print(f"\nDone! {result}")


if __name__ == "__main__":
    asyncio.run(main())
