"""
Script to seed ESG KPI Definitions
Based on user requirements - all KPIs with same settings as Carbon Credits
"""
import asyncio
import uuid
from datetime import datetime, timezone

# KPI Definitions organized by Section -> Category -> Subcategory -> Metrics
KPI_DATA = {
    "environment": {
        "Emissions": {
            "GHG Emissions - Removal": [
                "Total Removals (tCO2e) - Scope 1",
                "Total Removals (tCO2e) - Scope 2",
                "Total Removals (tCO2e) - Scope 3",
                "Emissions reduced due to Reduction Initiatives (tCO2e) - Scope 1",
                "Emissions reduced due to Reduction Initiatives (tCO2e) - Scope 2",
                "Emissions reduced due to Reduction Initiatives (tCO2e) - Scope 3",
            ]
        },
        "Water": {
            "Withdrawal": [
                "Quantity (Litres) withdrawn",
                "Quantity (Litres) from Ground Water withdrawn",
                "Quantity (Litres) from Surface Water withdrawn",
                "Quantity (Litres) from Third Party Water withdrawn",
                "Quantity (Litres) from Seawater / Desalinated water withdrawn",
                "Quantity (Litres) from Produced Water withdrawn",
                "Quantity from water stress area",
                "Freshwater Withdrawal (≤1,000 mg/L Total Dissolved Solids)",
                "Other Water Withdrawal (>1,000 mg/L Total Dissolved Solids)",
            ],
            "Discharge": [
                "Quantity (Litres) discharged",
                "Quantity (Litres) discharged to Surface Water",
                "Quantity (Litres) discharged to Ground Water",
                "Quantity (Litres) discharged to Third Party",
                "Quantity (Litres) discharged to Seawater",
                "Quantity in water stress area",
                "Freshwater Discharge (≤1,000 mg/L Total Dissolved Solids)",
                "Other Water Discharge (>1,000 mg/L Total Dissolved Solids)",
            ]
        },
        "Waste": {
            "Disposal": [
                "Waste Disposed (in metric tonnes)",
                "Quantity of Hazardous Waste",
                "Quantity of Non-Hazardous Waste",
                "Quantity based on Disposal Method",
                "Quantity of Hazardous Waste disposed onsite (in metric tonnes)",
                "Quantity of Hazardous Waste disposed offsite (in metric tonnes)",
                "Quantity of Non-Hazardous Waste disposed onsite (in metric tonnes)",
                "Quantity of Non-Hazardous Waste disposed offsite (in metric tonnes)",
            ],
            "Recovered / Diverted from disposal": [
                "Waste Recovered (in metric tonnes)",
                "Quantity of Hazardous Waste Recovered",
                "Quantity of Non-Hazardous Waste Recovered",
                "Quantity based on Recovery Method",
                "Quantity of Hazardous Waste Recovered onsite (in metric tonnes)",
                "Quantity of Hazardous Waste Recovered offsite (in metric tonnes)",
                "Quantity of Non-Hazardous Waste Recovered onsite (in metric tonnes)",
                "Quantity of Non-Hazardous Waste Recovered offsite (in metric tonnes)",
            ],
            "Generated": [
                "Waste Generated (in metric tonnes)",
                "Quantity of Hazardous Waste Generated",
                "Quantity of Non-Hazardous Waste Generated",
            ]
        },
        "Biodiversity": {
            "Restoration / Rehabilitation": [
                "No. of Site/Facility with most significant impacts on biodiversity",
                "Area under restoration or rehabilitation (in hectares)",
                "Area restored or rehabilitated (in hectares)",
            ],
            "Ecological Sensitivity": [
                "No. of sites in or near ecologically sensitive area with significant biodiversity impacts",
                "No. of sites in or near areas of biodiversity importance with significant impacts",
                "No. of sites in or near areas of high ecosystem integrity with significant impacts",
                "No. of sites in or near areas of rapid decline in ecosystem integrity with significant impacts",
                "No. of sites in or near areas of high physical water risks with significant impacts",
                "No. of sites in or near areas important for ecosystem service benefits to Indigenous Peoples/local communities",
            ],
            "Biodiversity Impacts": [
                "Total Quantity of pollutant",
                "Water withdrawal (in megalitres) in sites with significant biodiversity impacts",
                "Water Consumption (in megalitres) in sites with significant biodiversity impacts",
            ]
        },
        "Material": {
            "Material Consumption": [
                "Weight of Renewable Materials",
                "Weight of Non-renewable Materials",
                "Volume of Renewable Materials",
                "Volume of Non-renewable Materials",
            ],
            "Recycled Input Materials": [
                "% of recycled input materials (basis total weight used)",
                "% of recycled input materials (basis total volume used)",
            ],
            "Reclaimed Products & Packaging": [
                "% of reclaimed products",
            ]
        },
        "Climate Change": {
            "Transition Plan for climate change mitigation": [
                "Transition Plan Expenditure (Monetary Value)",
                "Transition Plan Expenditure (% of Total Expenditure)",
            ],
            "Climate Change Adaptation Plan & Implementation": [
                "Adaptation Plan Expenditure (Monetary Value)",
                "Adaptation Plan Expenditure (% of Total Expenditure)",
            ]
        },
        "Energy": {
            "Fuel Within Organization": [
                "Total Energy Consumption - Fuel",
                "Renewable Energy Consumption - Fuel",
                "Non-Renewable Energy Consumption - Fuel",
            ],
            "Electricity Within Organization": [
                "Total Energy Consumption - Electricity",
                "Renewable Energy Consumption - Electricity",
                "Non-Renewable Energy Consumption - Electricity",
                "Energy Consumption through purchased electricity",
                "Energy Consumption through self-generated electricity",
                "Self-generated electricity sold",
            ],
            "Heating Within Organization": [
                "Total Energy Consumption - Heating",
                "Renewable Energy Consumption - Heating",
                "Non-Renewable Energy Consumption - Heating",
                "Energy Consumption through purchased Heating",
                "Energy Consumption through self-generated Heating",
                "Self-generated Heating sold",
            ],
            "Cooling Within Organization": [
                "Total Energy Consumption - Cooling",
                "Renewable Energy Consumption - Cooling",
                "Non-Renewable Energy Consumption - Cooling",
                "Energy Consumption through purchased Cooling",
                "Energy Consumption through self-generated Cooling",
                "Self-generated Cooling sold",
            ],
            "Steam Within Organization": [
                "Total Energy Consumption - Steam",
                "Renewable Energy Consumption - Steam",
                "Non-Renewable Energy Consumption - Steam",
                "Energy Consumption through purchased Steam",
                "Energy Consumption through self-generated Steam",
                "Self-generated Steam sold",
            ],
            "Energy Outside the Organization": [
                "Total Energy Consumption - Upstream activities",
                "Total Energy Consumption - Downstream activities",
            ],
            "Reduction": [
                "Total Energy Reduction",
                "Total Reduction in energy requirements of sold products and services",
            ]
        }
    },
    "social": {
        "Training": {
            "General Training": [
                "No. of trainings done",
                "No. of trainings done on Health",
                "No. of trainings done on Safety",
                "No. of trainings done on Environment",
                "No. of trainings done on Human Right Issues",
                "No. of trainings done on Organization Policy(ies)",
                "No. of trainings done on Skill Upgrade/Up-skilling",
                "No. of trainings done on Re-skilling",
                "No. of trainings done on Anti-corruption",
                "No. of trainings done on Ethical Principles",
                "No. of employees who received the training",
                "No. of workers who received the training",
                "No. of Board of Directors who received the training",
                "No. of Key Management Personnel who received the training",
                "No. of Vendors who received the training",
                "No. of contractors who received the training",
                "Training hours based on training type",
            ],
            "Security Training": [
                "No. of security trainings done",
                "No. of Human rights policies trainings done",
                "No. of Specific procedures & their application to security trainings done",
                "% of security personnel who received training",
            ]
        },
        "Complaints": {
            "Internal Complaints": [
                "No. of complaints",
                "No. of complaints on Bribery",
                "No. of complaints on Corruption",
                "No. of complaints on Working Conditions",
                "No. of complaints on Health",
                "No. of complaints on Safety",
                "No. of complaints on Sexual Harassment",
                "No. of complaints on Discrimination at workplace",
                "No. of complaints on Child Labour",
                "No. of complaints on Forced Labour/Involuntary Labour",
                "No. of complaints on Wages",
                "No. of complaints on Conflict of Interest",
                "No. of complaints on Other human rights related issues",
                "No. of Pending complaints",
                "No. of complaints resolved",
                "No. of complaints in which law enforcement agency was involved",
                "No. of complaints where law enforcement agency took disciplinary action",
                "No. of POSH complaints",
                "No. of complaints against Board of Directors",
                "No. of complaints against Key Management Personnel",
                "No. of complaints against Contractors",
                "No. of complaints against Communities",
                "No. of complaints against Investors",
                "No. of complaints against Value Chain Partners",
                "No. of complaints against Shareholders",
                "No. of complaints against Employees",
                "No. of complaints against Workers",
            ],
            "Consumer Complaints": [
                "No. of complaints from customers",
                "No. of complaints from customers where sensitive data was involved",
                "No. of Data Privacy complaints",
                "No. of Advertising complaints",
                "No. of Cyber-security complaints",
                "No. of Delivery of essential services complaints",
                "No. of Restrictive/unfair trade practices complaints",
            ]
        },
        "Employees/Worker": {
            "New Employees/Worker": [
                "No. of female hired",
                "No. of male hired",
                "No. of employees hired",
                "No. of workers hired",
                "No. of female employees hired",
                "No. of male employees hired",
                "No. of female workers hired",
                "No. of male workers hired",
                "No. of people hired that are Under 30",
                "No. of people hired that are 30-50",
                "No. of people hired that are Over 50",
            ],
            "Terminated Employees/Worker": [
                "No. of female terminated",
                "No. of male terminated",
                "No. of employees terminated",
                "No. of workers terminated",
                "No. of female employees terminated",
                "No. of male employees terminated",
                "No. of female workers terminated",
                "No. of male workers terminated",
            ],
            "Redeployed Employees": [
                "No. of employees redeployed",
                "No. of Permanent employees redeployed",
                "No. of Temporary employees redeployed",
                "No. of Contract employees redeployed",
                "No. of Part-Time employees redeployed",
                "No. of Intern/Trainee employees redeployed",
                "No. of female Permanent employees redeployed",
                "No. of male Permanent employees redeployed",
                "No. of female Temporary employees redeployed",
                "No. of male Temporary employees redeployed",
                "No. of female Contract employees redeployed",
                "No. of male Contract employees redeployed",
                "No. of female Part-Time employees redeployed",
                "No. of male Part-Time employees redeployed",
                "No. of female Intern/Trainee employees redeployed",
                "No. of male Intern/Trainee employees redeployed",
            ],
            "Employee Turnover": [
                "No. of Employees turnover",
                "No. of female turnover",
                "No. of male turnover",
                "Employees turnover rate",
                "Female turnover rate",
                "Male turnover rate",
                "No. of Employees turnover who were under 30",
                "No. of Employees turnover who were 30-50",
                "No. of Employees turnover who were over 50",
            ],
            "Parental Leave": [
                "No. of female employees entitled to parental leave",
                "No. of male employees entitled to parental leave",
                "No. of female employees who took parental leave",
                "No. of male employees who took parental leave",
                "Female Employees who returned to work",
                "Male Employees who returned to work",
                "Female Employees Retained After 12 Months",
                "Male Employees Retained After 12 Months",
            ],
            "Salary of Employees": [
                "New Permanent Employees at or Above Cost of Living",
                "New Temporary Employees at or Above Cost of Living",
                "New Contract Employees at or Above Cost of Living",
                "New Part-Time Employees at or Above Cost of Living",
                "New Intern/Trainee Employees at or Above Cost of Living",
            ],
            "Governance Bodies Diversity": [
                "No. of Employees in governance bodies",
                "No. of Female in governance bodies",
                "No. of Male in governance bodies",
                "No. of Employees under 30 in governance bodies",
                "No. of Employees 30-50 in governance bodies",
                "No. of Employees over 50 in governance bodies",
                "No. of Employees belonging to minority",
                "No. of Employees belonging to vulnerable groups",
            ],
            "Employee Diversity": [
                "No. of employees",
                "No. of female employees",
                "No. of male employees",
                "No. of female permanent employees",
                "No. of male permanent employees",
                "No. of female Temporary employees",
                "No. of male Temporary employees",
                "No. of female Contract employees",
                "No. of male Contract employees",
                "No. of female Part-Time employees",
                "No. of male Part-Time employees",
                "No. of female Intern/Trainee employees",
                "No. of male Intern/Trainee employees",
                "No. of Employees Under 30",
                "No. of Employees 30-50",
                "No. of Employees Over 50",
                "No. of Employees belonging to minority",
                "No. of Employees belonging to vulnerable groups",
            ],
            "Performance and career development review": [
                "No. of employees who received review",
                "No. of female employees who received review",
                "No. of male employees who received review",
                "No. of female permanent employees who received review",
                "No. of male permanent employees who received review",
                "No. of female Temporary employees who received review",
                "No. of male Temporary employees who received review",
                "No. of female Contract employees who received review",
                "No. of male Contract employees who received review",
                "No. of female Part-Time employees who received review",
                "No. of male Part-Time employees who received review",
                "No. of female Intern/Trainee employees who received review",
                "No. of male Intern/Trainee employees who received review",
            ],
            "Senior Management": [
                "% of senior management from local community",
            ]
        },
        "Health & Safety": {
            "Occupational Health & Safety Management System": [
                "Number of employees covered",
                "Number of workers covered",
                "Number of employees covered that has been internally audited",
                "Number of workers covered that has been internally audited",
                "Number of employees covered that has been externally audited or certified",
                "Number of workers covered that has been externally audited or certified",
            ],
            "Product & Service Health and Safety Assessment": [
                "% of significant product and service categories assessed",
            ]
        }
    },
    "governance": {
        "Incidents": {
            "Safety Incidents": [
                "No. of safety incidents",
                "No. of injury incidents",
                "No. of ill-health incidents",
                "No. of fatality causing incidents",
                "No. of work-related incidents",
                "No. of incidents that affected Board of Directors",
                "No. of incidents that affected Key Management Personnel",
                "No. of incidents that affected Employees",
                "No. of incidents that affected Workers",
                "No. of incidents that affected Contractors",
                "No. of Rehabilitation Done",
                "No. of Family members placed in suitable employment",
            ],
            "Incidents of Violations": [
                "No. of violations incidents",
                "No. of violations regarding Indigenous Peoples Rights",
                "No. of Incidents reviewed by the organization",
                "No. of incidents for which Remediation plans being implemented",
            ],
            "Data Breach": [
                "No. of data breach incidents",
                "No. of data breach incidents with personally identifiable information",
                "No. of data breach incidents with Complaint from outside parties",
                "No. of data breach incidents substantiated by the organization",
                "No. of data breach incidents received from regulatory bodies",
                "No. of data breach incidents with leaks, thefts, or losses of customer data",
            ],
            "Non-compliance": [
                "No. of non-compliance incidents",
                "No. of non-compliance incidents related to Marketing Communications",
                "No. of non-compliance incidents related to Product and Service information and Labeling",
                "No. of non-compliance incidents related to Health & safety impacts of products and services",
                "No. of non-compliance that resulted in a fine or penalty",
                "No. of non-compliance that resulted in a warning",
                "No. of non-compliance with voluntary code",
                "No. of non-compliance related to Marketing Communications that resulted in fine/penalty",
                "No. of non-compliance related to Marketing Communications that resulted in warning",
                "No. of non-compliance related to Marketing Communications with voluntary code",
                "No. of non-compliance related to Product/Service Labeling that resulted in fine/penalty",
                "No. of non-compliance related to Product/Service Labeling that resulted in warning",
                "No. of non-compliance related to Product/Service Labeling with voluntary code",
                "No. of non-compliance related to Health & safety impacts that resulted in fine/penalty",
                "No. of non-compliance related to Health & safety impacts that resulted in warning",
                "No. of non-compliance related to Health & safety impacts with voluntary code",
            ]
        },
        "Competitive Behaviour": {
            "Anti-Competitive Behaviour & Anti-Trust Cases": [
                "No. of Public legal cases regarding anti-competitive and anti-trust violations",
            ]
        },
        "Anti-corruption": {
            "Corruption Risk Assessment": [
                "No. of operations assessed for risk of corruption",
                "% of operations assessed for risk of corruption",
            ],
            "Anti-Corruption Policy Communication": [
                "No. of Governance Body Members communicated about anti-corruption policy",
                "No. of Employees communicated about anti-corruption policy",
                "No. of Business Partners communicated about anti-corruption policy",
                "No. of People communicated about anti-corruption policy",
            ],
            "Confirmed Corruption Incidents": [
                "No. of Confirmed Corruption Incidents",
                "No. of Employees Dismissed regarding corruption",
                "No. of Employees Disciplined regarding corruption",
                "No. of Business Partner Contracts Terminated regarding corruption",
                "No. of Business Partner Contracts Not Renewed regarding corruption",
                "No. of Public legal cases regarding corruption against org/employee",
            ]
        },
        "Economic Performance": {
            "Government Financial Assistance": [
                "No. of Tax Relief & Credits",
                "No. of Subsidies",
                "No. of Investment / R&D Grants",
                "No. of Awards",
                "No. of Royalty Holidays",
                "No. of Export Credit Assistance",
                "No. of Financial Incentives",
            ],
            "Wage Competitiveness": [
                "Female entry level wage: minimum wage",
                "Male entry level wage: minimum wage",
            ],
            "Political Contributions": [
                "Monetary Contributions",
                "In-kind Contributions",
            ],
            "Local Procurement": [
                "% of procurement budget spent on local suppliers",
            ],
            "Retirement Benefits": [
                "Employee Contribution (%)",
                "Employer Contribution (%)",
            ]
        }
    }
}

def generate_metric_code(section, metric_name):
    """Generate a unique metric code from section and name."""
    prefix = {"environment": "ENV", "social": "SOC", "governance": "GOV"}.get(section, "ESG")
    sanitized = metric_name.upper()
    # Remove special chars, replace spaces with underscores
    import re
    sanitized = re.sub(r'[^A-Z0-9\s]', '', sanitized)
    sanitized = re.sub(r'\s+', '_', sanitized.strip())
    if len(sanitized) > 40:
        sanitized = sanitized[:40]
    return f"{prefix}_{sanitized}"

def create_kpi_document(section, category, subcategory, metric_name, user_id, user_name):
    """Create a KPI definition document."""
    now = datetime.now(timezone.utc).isoformat()
    metric_code = generate_metric_code(section, metric_name)
    
    return {
        "id": str(uuid.uuid4()),
        "metric_name": metric_name,
        "short_name": metric_name[:50] if len(metric_name) > 50 else metric_name,
        "metric_code": metric_code,
        "description": "",
        "section": section,
        "category_name": category,
        "subcategory": subcategory,
        "sub_subcategory": "",
        "source_type": "records",
        "source_config": {"records": {"value_field": ""}},
        "aggregation_type": "sum",
        "value_field": "",
        "filters": [],
        "dimensions": ["organization", "facility"],
        "supported_scopes": ["organization", "facility"],
        "output_type": "number",
        "unit_config": {
            "default_unit": "",
            "supported_units": [],
            "allow_unit_conversion": False
        },
        "formula_config": None,
        "validation_rules": [],
        "display_config": {
            "display_name": None,
            "short_name": None,
            "display_order": 0,
            "category_order": 0,
            "icon": None,
            "color": None,
            "decimal_places": 2
        },
        "visibility": {
            "dashboard_enabled": False,
            "reports_enabled": False,
            "tracking_enabled": False,
            "target_enabled": True,
            "analytics_enabled": False
        },
        "status": "active",
        "tags": [],
        "metadata": None,
        "version": 1,
        "created_by": user_id,
        "created_by_name": user_name,
        "created_at": now,
        "updated_by": None,
        "updated_by_name": None,
        "updated_at": None,
    }

async def seed_kpis():
    """Seed all KPI definitions."""
    from shared.database.mongo import db
    
    # Get super admin user for created_by
    user_id = "0f90c740-b807-41e1-8971-42005e1cfb3e"
    user_name = "superadmin@ecotrack.com"
    
    # Collect all KPIs to insert
    kpis_to_insert = []
    existing_codes = set()
    
    # Get existing metric codes to avoid duplicates
    existing_kpis = await db.esg_kpi_definitions.find({}, {"metric_code": 1}).to_list(10000)
    for kpi in existing_kpis:
        existing_codes.add(kpi.get("metric_code"))
    
    print(f"Found {len(existing_codes)} existing KPIs")
    
    for section, categories in KPI_DATA.items():
        for category, subcategories in categories.items():
            for subcategory, metrics in subcategories.items():
                for metric_name in metrics:
                    kpi = create_kpi_document(section, category, subcategory, metric_name, user_id, user_name)
                    
                    # Check for duplicate metric_code
                    if kpi["metric_code"] in existing_codes:
                        # Add suffix to make unique
                        base_code = kpi["metric_code"]
                        counter = 1
                        while kpi["metric_code"] in existing_codes:
                            kpi["metric_code"] = f"{base_code}_{counter}"
                            counter += 1
                    
                    existing_codes.add(kpi["metric_code"])
                    kpis_to_insert.append(kpi)
    
    print(f"Prepared {len(kpis_to_insert)} new KPIs to insert")
    
    # Insert in batches of 50
    batch_size = 50
    total_inserted = 0
    
    for i in range(0, len(kpis_to_insert), batch_size):
        batch = kpis_to_insert[i:i + batch_size]
        result = await db.esg_kpi_definitions.insert_many(batch)
        total_inserted += len(result.inserted_ids)
        print(f"Inserted batch {i//batch_size + 1}: {len(result.inserted_ids)} KPIs (Total: {total_inserted})")
    
    print(f"\n✅ Successfully inserted {total_inserted} KPI definitions!")
    
    # Print summary by section
    print("\nSummary by Section:")
    for section in ["environment", "social", "governance"]:
        count = await db.esg_kpi_definitions.count_documents({"section": section})
        print(f"  {section.capitalize()}: {count} KPIs")

if __name__ == "__main__":
    asyncio.run(seed_kpis())
