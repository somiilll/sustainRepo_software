"""Target setting catalog: (section, category) -> subcategory -> labels shown in the Targets form."""
CATALOG = {
    ("environment", "Water"): {
        "Consumption": ["Total Water Consumption", "Total Water Consumed in water stress area"],
        "Withdrawal": ["Total Water Withdrawal", "Total Water Withdrawal in water stress area"],
        "Discharge": ["Total Water Discharge", "Water Discharge in water stress area", "Water discharged with no treatment done", "Water discharged with treatment done"],
    },
    ("environment", "Waste"): {
        "Disposal": ["Total Waste Disposed", "Hazardous Waste disposed", "Non-Hazardous waste disposed"],
        "Recovered": ["Total Waste Recovered", "Hazardous Waste Recovered", "Non-Hazardous waste Recovered"],
        "Generated": ["Total Waste Generated", "Hazardous Waste Generated", "Non-Hazardous waste Generated"],
    },
    ("social", "Employees/Worker"): {
        "Employee Diversity": ["Total Employees", "Male Employees", "Female Employees", "Employees belonging to Minority Group", "Employees belonging to Vulnerable Group"],
        "Workers Diversity": ["Total Workers", "Male Workers", "Female Workers", "Workers belonging to Minority Group", "Workers belonging to Vulnerable Group"],
        "BoD Diversity": ["Total BoD", "Male BoD", "Female BoD", "BoD belonging to Minority Group", "BoD belonging to Vulnerable Group"],
        "Key Management Personnel Diversity": ["Total KMP", "Male KMP", "Female KMP", "KMP belonging to Minority Group", "KMP belonging to Vulnerable Group"],
        "Employee Turnover": ["Male Turnover", "Female Turnover"],
        "Workers Turnover": ["Male Turnover", "Female Turnover"],
        "Employee Parental Leave": ["Total Return to work rate", "Male Return to work rate", "Female Return to work rate", "Total Retention Rate", "Male Retention Rate", "Female Retention Rate"],
    },
    ("social", "Training"): {
        "General Training": ["Total No. of Training given", "Total No. of Trainings on Health and Safety", "Total No. of Trainings on Environment", "Total No. of Trainings on Human Rights Issues", "Total No. of Trainings on Organization Policy(ies)", "Total No. of Trainings on Up-skilling", "Total No. of Trainings on Re-skilling", "Total No. of Trainings on Anti-corruption", "Total No. of Trainings on Ethical Principles"],
    },
    ("social", "Complaints"): {
        "Internal Complaints": ["Total Complaints Filled", "Conflict of Interest Complaints Filled", "Complaints filled regarding Working Conditions", "Complaints filled regarding Health & Safety", "Complaints filled regarding Sexual Harassment", "Complaints filled regarding POSH", "Complaints filled regarding Discrimination", "Complaints filled regarding Child Labour", "Complaints filled regarding Wages"],
        "Consumer Complaints": ["Total Complaints filled by consumer", "Total complaints received regarding Data Privacy", "Total complaints received regarding Advertising", "Total complaints received regarding Cyber security", "Total complaints received Delivery of essential services", "Total complaints received regarding Restrictive Trade Practices", "Total complaints received regarding Unfair Trade Practices"],
    },
    ("social", "Health & Safety"): {
        "Health & Safety Incidents": [f"{m} of {w}" for w in ("Employees", "Workers") for m in ("LTIFR", "Total Recordable work-related injuries", "No. of fatalities", "High consequence work-related injury or ill-health (excl. fatalities)")],
    },
    ("governance", "Financial & Procurement Metrics"): {"Accounts Payable Days": ["Number of days of accounts payables"]},
    ("governance", "Anti-corruption"): {"Confirmed Corruption Incidents": ["Total corruption incidents"]},
    ("governance", "Incidents"): {
        "Data Breach": ["Total Data Breach incidents", "Total Data Breach involving customer PII", "% of Data Breach involving customer PII"],
        "Non-compliance": ["Total Non-Compliance cases"],
    },
}
