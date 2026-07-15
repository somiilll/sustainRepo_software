"""Live ESG analytics aggregation for the executive dashboard."""
from datetime import date
from typing import Dict, Iterable, List, Optional


MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


def month_keys(start_date: str, end_date: str) -> List[str]:
    start_year, start_month = int(start_date[:4]), int(start_date[5:7])
    end_year, end_month = int(end_date[:4]), int(end_date[5:7])
    result = []
    year, month = start_year, start_month
    while (year, month) <= (end_year, end_month):
        result.append(f"{year}-{month:02d}")
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return result


def record_month(record: dict) -> Optional[str]:
    period = record.get("reporting_period")
    if isinstance(period, str) and len(period) >= 7 and period[:4].isdigit() and period[4] == "-":
        return period[:7]
    if not isinstance(period, dict):
        return None
    year = period.get("year")
    month = period.get("month")
    if year and isinstance(month, str) and month in MONTH_NAMES:
        return f"{year}-{MONTH_NAMES.index(month) + 1:02d}"
    if period.get("date"):
        return str(period["date"])[:7]
    return None


def number(value) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def energy_mwh(value: float, unit: str) -> float:
    normalized = (unit or "mwh").lower()
    if "kwh" in normalized:
        return value / 1000
    if "gwh" in normalized:
        return value * 1000
    if "tj" in normalized:
        return value * 277.778
    return value


def water_kl(value: float, unit: str) -> float:
    normalized = (unit or "litres").lower()
    if "mega" in normalized:
        return value * 1000
    if "kilo" in normalized or normalized == "kl":
        return value
    return value / 1000


def blank_months(keys: Iterable[str], fields: Iterable[str]) -> Dict[str, dict]:
    return {key: {"period": key, **{field: 0.0 for field in fields}} for key in keys}


async def get_esg_analytics(db, org_id: str, start_date: str, end_date: str, facility_ids: Optional[List[str]] = None) -> dict:
    """Return actual monthly operational, social, and governance series for one organization."""
    months = month_keys(start_date, end_date)
    previous_months = month_keys(f"{int(start_date[:4]) - 1}-{start_date[5:7]}", f"{int(end_date[:4]) - 1}-{end_date[5:7]}")
    all_months = set(months + previous_months)
    org_query = {"$or": [{"org_id": org_id}, {"organization_id": org_id}]}
    if facility_ids:
        org_query["facility_id"] = {"$in": facility_ids}

    environment = await db.environment_records.find(org_query, {"_id": 0, "category": 1, "subcategory": 1, "field_values": 1, "reporting_period": 1}).to_list(10000)
    social = await db.social_records.find(org_query, {"_id": 0, "field_values": 1, "reporting_period": 1, "created_at": 1}).to_list(10000)
    governance = await db.governance_records.find(org_query, {"_id": 0, "category": 1, "subcategory": 1, "field_values": 1, "reporting_period": 1, "created_at": 1}).to_list(10000)
    emissions_query = {"reporting_period": {"$gte": min(all_months), "$lte": max(all_months)}}
    if facility_ids:
        emissions_query["facility_id"] = {"$in": facility_ids}
    else:
        facilities = await db.facilities.find({"organization_id": org_id}, {"_id": 0, "id": 1}).to_list(1000)
        emissions_query["facility_id"] = {"$in": [facility["id"] for facility in facilities]}
    emissions = await db.emission_records.find(emissions_query, {"_id": 0, "scope": 1, "total_emissions": 1, "co2e_emissions": 1, "reporting_period": 1}).to_list(10000)

    emission_rows = blank_months(months + previous_months, ["scope1", "scope2", "scope3"])
    energy_rows = blank_months(months, ["renewable", "nonRenewable"])
    water_rows = blank_months(months, ["withdrawn", "consumed", "discharged", "recycled"])
    waste_rows = blank_months(months, ["generated", "recovered", "disposed"])
    workforce_rows = blank_months(months, ["employees", "turnover", "ltifr", "lostTimeInjuries"])
    safety_rows = blank_months(months, ["fatalities", "lostTimeInjuries", "nearMisses"])
    finance_rows = blank_months(months, ["apDays", "aging0to30", "aging31to60", "aging61to90", "agingOver90", "cashConversion"])
    breach_rows = blank_months(months, ["breaches", "confidentiality", "integrity", "availability", "privacy"])
    governance_totals = {"dataBreaches": 0.0, "openRisks": 0.0, "compliancePct": None}

    for record in emissions:
        period = record_month(record)
        if period not in emission_rows:
            continue
        scope = (record.get("scope") or "").lower()
        if scope in emission_rows[period]:
            emission_rows[period][scope] += number(record.get("total_emissions") or record.get("co2e_emissions"))

    for record in environment:
        period = record_month(record)
        if period not in months:
            continue
        values = record.get("field_values") or {}
        category = (record.get("category") or "").lower()
        subcategory = (record.get("subcategory") or "").lower()
        quantity = number(values.get("quantity"))
        if category == "energy":
            value = energy_mwh(quantity, values.get("unit"))
            renewable = "renewable" in str(values.get("is_renewable") or "").lower() or "renewable" in str(values.get("source_type") or "").lower()
            energy_rows[period]["renewable" if renewable else "nonRenewable"] += value
        elif category == "water":
            if subcategory == "recycle":
                quantity = number(values.get("total_quantity_of_water_recycled", quantity))
            value = water_kl(quantity, values.get("unit"))
            key = {"withdrawal": "withdrawn", "consumption": "consumed", "discharge": "discharged", "recycle": "recycled"}.get(subcategory)
            if key:
                water_rows[period][key] += value
        elif category == "waste":
            key = {"generated": "generated", "recovered": "recovered", "disposal": "disposed"}.get(subcategory)
            if key:
                waste_rows[period][key] += quantity

    for record in social:
        period = record_month(record)
        if period not in months:
            continue
        values = record.get("field_values") or {}
        employees = number(values.get("no_of_employees") or values.get("count"))
        if employees:
            workforce_rows[period]["employees"] += employees
        start, end, left = number(values.get("employees_at_the_start_of_the_year")), number(values.get("employees_at_the_end_of_the_year")), number(values.get("employees_who_left_during_the_reporting_period"))
        average = (start + end) / 2 if start and end else 0
        if left and average:
            workforce_rows[period]["turnover"] = (left / average) * 100
        injuries, hours = number(values.get("no_of_loss_time_injuries")), number(values.get("total_hours_worked"))
        workforce_rows[period]["lostTimeInjuries"] += injuries
        if injuries and hours:
            workforce_rows[period]["ltifr"] = (injuries * 1000000) / hours

    for record in governance:
        period = record_month(record)
        values = record.get("field_values") or {}
        if period in months:
            fatalities = number(values.get("fatalities") or values.get("no_of_fatalities"))
            injuries = number(values.get("lost_time_injuries") or values.get("no_of_loss_time_injuries"))
            near_misses = number(values.get("near_misses") or values.get("no_of_near_misses"))
            safety_rows[period]["fatalities"] += fatalities
            safety_rows[period]["lostTimeInjuries"] += injuries
            safety_rows[period]["nearMisses"] += near_misses
            payable, cogs = number(values.get("accounts_payable")), number(values.get("cost_of_goods_services_procured"))
            if payable and cogs:
                finance_rows[period]["apDays"] = (payable * 365) / cogs
            finance_rows[period]["aging0to30"] += number(values.get("payment_aging_0_30") or values.get("aging_0_30"))
            finance_rows[period]["aging31to60"] += number(values.get("payment_aging_31_60") or values.get("aging_31_60"))
            finance_rows[period]["aging61to90"] += number(values.get("payment_aging_61_90") or values.get("aging_61_90"))
            finance_rows[period]["agingOver90"] += number(values.get("payment_aging_over_90") or values.get("aging_over_90"))
            finance_rows[period]["cashConversion"] += number(values.get("cash_conversion_cycle"))
            breaches = number(values.get("no_of_incidents_of_data_breach") or values.get("data_breaches"))
            breach_rows[period]["breaches"] += breaches
            category = str(values.get("incident_category") or values.get("breach_category") or "").lower()
            if category in breach_rows[period]:
                breach_rows[period][category] += breaches or 1
        governance_totals["dataBreaches"] += number(values.get("no_of_incidents_of_data_breach") or values.get("data_breaches"))
        governance_totals["openRisks"] += number(values.get("open_risks"))
        compliance = values.get("compliance_pct")
        if compliance is not None:
            governance_totals["compliancePct"] = number(compliance)

    emissions_current = []
    for key in months:
        previous_key = f"{int(key[:4]) - 1}-{key[5:7]}"
        row = emission_rows[key]
        previous = emission_rows.get(previous_key, {})
        emissions_current.append({**row, "previousTotal": sum(previous.get(scope, 0) for scope in ("scope1", "scope2", "scope3"))})

    for rows in (energy_rows, water_rows, waste_rows, workforce_rows, safety_rows, finance_rows, breach_rows):
        for row in rows.values():
            for key, value in row.items():
                if key != "period":
                    row[key] = round(value, 2)

    return {
        "emissions": emissions_current,
        "energy": list(energy_rows.values()),
        "water": list(water_rows.values()),
        "waste": list(waste_rows.values()),
        "workforce": list(workforce_rows.values()),
        "safety": list(safety_rows.values()),
        "finance": list(finance_rows.values()),
        "breaches": list(breach_rows.values()),
        "governance": governance_totals,
    }