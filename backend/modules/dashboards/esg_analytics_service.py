"""Live ESG analytics aggregation for the executive dashboard."""
from datetime import date
from typing import Dict, Iterable, List, Optional


MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


# ---------------------------------------------------------------------------
# Metric behaviour: snapshot (carry-forward), flow (single month), ratio
# ---------------------------------------------------------------------------
BEHAVIOR_SNAPSHOT = "snapshot"
BEHAVIOR_FLOW = "flow"
BEHAVIOR_RATIO = "ratio"


def get_spread_months(record: dict, available: set) -> List[str]:
    """Return every month a record's period covers that exists in *available*.

    Monthly/daily → single month.
    Quarterly Q3 2026 → Jul, Aug, Sep 2026.
    Yearly FY 2025-2026 → Apr 2025 … Mar 2026.
    Yearly CY / plain → Jan … Dec.
    """
    period = record.get("reporting_period")
    if not isinstance(period, dict):
        m = record_month(record)
        return [m] if m and m in available else []

    rp_type = (period.get("reporting_type") or "monthly").lower()

    if rp_type in ("daily", "weekly", "monthly"):
        m = record_month(record)
        return [m] if m and m in available else []

    year = period.get("year")

    if rp_type == "quarterly":
        quarter = period.get("quarter")
        q_months = {"Q1": (1, 2, 3), "Q2": (4, 5, 6), "Q3": (7, 8, 9), "Q4": (10, 11, 12)}
        if year and quarter in q_months:
            return [f"{year}-{m:02d}" for m in q_months[quarter] if f"{year}-{m:02d}" in available]

    if rp_type == "yearly":
        fy = period.get("financial_year")
        if fy and isinstance(fy, str):
            try:
                fy_start = int(fy.split()[1].split("-")[0])
                keys = [f"{fy_start}-{m:02d}" for m in range(4, 13)]
                keys += [f"{fy_start + 1}-{m:02d}" for m in range(1, 4)]
                return [k for k in keys if k in available]
            except (IndexError, ValueError):
                pass
        if year:
            return [f"{year}-{m:02d}" for m in range(1, 13) if f"{year}-{m:02d}" in available]

    m = record_month(record)
    return [m] if m and m in available else []


def get_flow_month(record: dict, available: set) -> Optional[str]:
    """Return the single month a flow metric should land on.

    Monthly/daily → its month.  Quarterly → last month of quarter.
    Yearly FY → March (end of FY).  Yearly CY → December.
    """
    period = record.get("reporting_period")
    if not isinstance(period, dict):
        m = record_month(record)
        return m if m and m in available else None

    rp_type = (period.get("reporting_type") or "monthly").lower()
    year = period.get("year")

    if rp_type in ("daily", "weekly", "monthly"):
        m = record_month(record)
        return m if m and m in available else None

    if rp_type == "quarterly":
        q_last = {"Q1": 3, "Q2": 6, "Q3": 9, "Q4": 12}
        mi = q_last.get(period.get("quarter"))
        if year and mi:
            k = f"{year}-{mi:02d}"
            return k if k in available else None

    if rp_type == "yearly":
        fy = period.get("financial_year")
        if fy and isinstance(fy, str):
            try:
                fy_start = int(fy.split()[1].split("-")[0])
                k = f"{fy_start + 1}-03"
                return k if k in available else None
            except (IndexError, ValueError):
                pass
        if year:
            k = f"{year}-12"
            return k if k in available else None

    m = record_month(record)
    return m if m and m in available else None


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
    rp_type = period.get("reporting_type", "")

    # Monthly — name ("July") or numeric string ("7")
    if year and month:
        if isinstance(month, str) and month in MONTH_NAMES:
            return f"{year}-{MONTH_NAMES.index(month) + 1:02d}"
        try:
            mi = int(month)
            if 1 <= mi <= 12:
                return f"{year}-{mi:02d}"
        except (TypeError, ValueError):
            pass

    # Daily / Weekly — date string "2026-07-15"
    if period.get("date"):
        return str(period["date"])[:7]

    # Quarterly — map to first month of the quarter
    quarter = period.get("quarter")  # "Q1" .. "Q4"
    if year and quarter:
        q_map = {"Q1": 1, "Q2": 4, "Q3": 7, "Q4": 10}
        mi = q_map.get(quarter)
        if mi:
            return f"{year}-{mi:02d}"

    # Yearly FY — map to April of the start year ("FY 2025-2026" → "2025-04")
    fy = period.get("financial_year")
    if fy and isinstance(fy, str):
        try:
            fy_start = int(fy.split()[1].split("-")[0])
            return f"{fy_start}-04"
        except (IndexError, ValueError):
            pass

    # Yearly CY — map to January
    cy = period.get("calendar_year")
    if cy and isinstance(cy, str):
        try:
            cy_year = int(cy.replace("CY", "").strip())
            return f"{cy_year}-01"
        except (ValueError):
            pass

    # Yearly with just year — map to January
    if year and rp_type == "yearly":
        return f"{year}-01"

    return None


def number(value) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def energy_mwh(value: float, unit: str) -> float:
    from modules.esg_records.services.dashboard.unit_utils import to_mwh
    return to_mwh(value, unit)


def water_kl(value: float, unit: str) -> float:
    from modules.esg_records.services.dashboard.unit_utils import to_kilolitres
    return to_kilolitres(value, unit)


def blank_months(keys: Iterable[str], fields: Iterable[str]) -> Dict[str, dict]:
    return {key: {"period": key, **{field: 0.0 for field in fields}} for key in keys}


async def get_esg_analytics(db, org_id: str, start_date: str, end_date: str, facility_ids: Optional[List[str]] = None) -> dict:
    """Return actual monthly operational, social, and governance series for one organization."""
    months = month_keys(start_date, end_date)
    previous_months = month_keys(f"{int(start_date[:4]) - 1}-{start_date[5:7]}", f"{int(end_date[:4]) - 1}-{end_date[5:7]}")
    all_months = set(months + previous_months)
    org_query = {"$or": [{"org_id": org_id}, {"organization_id": org_id}], "is_current": {"$ne": False}, "status": {"$ne": "draft"}}
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

    months_set = set(months)

    for record in social:
        values = record.get("field_values") or {}
        spread = get_spread_months(record, months_set)
        flow_m = get_flow_month(record, months_set)

        # snapshot: employees — carry forward across period
        employees = number(values.get("no_of_employees") or values.get("count"))
        if employees:
            for m in spread:
                workforce_rows[m]["employees"] += employees

        # ratio: turnover — carry forward
        start_v, end_v, left = number(values.get("employees_at_the_start_of_the_year")), number(values.get("employees_at_the_end_of_the_year")), number(values.get("employees_who_left_during_the_reporting_period"))
        average = (start_v + end_v) / 2 if start_v and end_v else 0
        if left and average:
            turnover = (left / average) * 100
            for m in spread:
                workforce_rows[m]["turnover"] = turnover

        # flow: injuries
        injuries = number(values.get("no_of_loss_time_injuries"))
        hours = number(values.get("total_hours_worked"))
        if injuries and flow_m:
            workforce_rows[flow_m]["lostTimeInjuries"] += injuries

        # ratio: ltifr — carry forward
        if injuries and hours:
            ltifr = (injuries * 1000000) / hours
            for m in spread:
                workforce_rows[m]["ltifr"] = ltifr

    for record in governance:
        values = record.get("field_values") or {}
        spread = get_spread_months(record, months_set)
        flow_m = get_flow_month(record, months_set)

        # flow: safety incidents
        if flow_m:
            safety_rows[flow_m]["fatalities"] += number(values.get("fatalities") or values.get("no_of_fatalities"))
            safety_rows[flow_m]["lostTimeInjuries"] += number(values.get("lost_time_injuries") or values.get("no_of_loss_time_injuries"))
            safety_rows[flow_m]["nearMisses"] += number(values.get("near_misses") or values.get("no_of_near_misses"))

        # ratio: apDays — carry forward
        payable, cogs = number(values.get("accounts_payable")), number(values.get("cost_of_goods_services_procured"))
        if payable and cogs:
            ap_days = (payable * 365) / cogs
            for m in spread:
                finance_rows[m]["apDays"] = ap_days

        # snapshot: aging buckets — carry forward
        a0 = number(values.get("payment_aging_0_30") or values.get("aging_0_30"))
        a1 = number(values.get("payment_aging_31_60") or values.get("aging_31_60"))
        a2 = number(values.get("payment_aging_61_90") or values.get("aging_61_90"))
        a3 = number(values.get("payment_aging_over_90") or values.get("aging_over_90"))
        cc = number(values.get("cash_conversion_cycle"))
        if any((a0, a1, a2, a3, cc)):
            for m in spread:
                finance_rows[m]["aging0to30"] += a0
                finance_rows[m]["aging31to60"] += a1
                finance_rows[m]["aging61to90"] += a2
                finance_rows[m]["agingOver90"] += a3
                finance_rows[m]["cashConversion"] += cc

        # flow: breaches
        breaches = number(values.get("no_of_incidents_of_data_breach") or values.get("data_breaches"))
        if breaches and flow_m:
            breach_rows[flow_m]["breaches"] += breaches
            category = str(values.get("incident_category") or values.get("breach_category") or "").lower()
            if category in breach_rows[flow_m]:
                breach_rows[flow_m][category] += breaches or 1

        # governance totals (always counted regardless of period)
        governance_totals["dataBreaches"] += number(values.get("no_of_incidents_of_data_breach") or values.get("data_breaches"))
        # snapshot: openRisks — use spread
        open_risks = number(values.get("open_risks"))
        if open_risks:
            governance_totals["openRisks"] += open_risks
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