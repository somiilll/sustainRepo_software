"""Governance detail service — financial governance, ethics, compliance, cybersecurity."""
from typing import Dict, List, Optional


async def get_governance_detail(
    db, org_id: str, start_date: str, end_date: str,
    facility_ids: Optional[List[str]] = None,
) -> dict:
    org_query = {"org_id": org_id, "is_current": {"$ne": False}, "status": {"$ne": "draft"}}
    if facility_ids:
        org_query["facility_id"] = {"$in": facility_ids}

    records = await db.governance_records.find(
        org_query,
        {"_id": 0, "category": 1, "subcategory": 1, "field_values": 1, "reporting_period": 1},
    ).to_list(10000)

    # KPI accumulators
    total_ap_days = 0.0
    ap_count = 0
    total_anti_competitive = 0
    total_data_breaches = 0
    total_violations = 0
    total_corruption = 0

    # Trends by period
    ap_trend: Dict[str, float] = {}
    breach_trend: Dict[str, int] = {}
    violation_trend: Dict[str, int] = {}
    anti_comp_trend: Dict[str, int] = {}
    corruption_trend: Dict[str, int] = {}

    def _period_key(rp):
        if isinstance(rp, dict):
            y = rp.get("year")
            m = rp.get("month")
            fy = rp.get("financial_year")
            if y and m:
                return f"{y}-{str(m).zfill(2)}"
            if fy:
                return fy
            if y:
                return str(y)
        if isinstance(rp, str):
            return rp
        return "unknown"

    for rec in records:
        sub = (rec.get("subcategory") or "").lower()
        fv = rec.get("field_values") or {}
        period = _period_key(rec.get("reporting_period"))

        # Accounts Payable Days
        if "payable" in sub or "accounts" in sub:
            ap = float(fv.get("accounts_payable") or 0)
            cogs = float(fv.get("cost_of_goods_services_procured") or fv.get("cogs") or 0)
            if cogs > 0:
                days = (ap * 365) / cogs
                total_ap_days += days
                ap_count += 1
                if period != "unknown":
                    ap_trend[period] = ap_trend.get(period, 0) + days

        # Anti-Competitive Cases
        if "anti-competitive" in sub or "Competitive" in sub:
            cases = int(fv.get("total_no_of_cases") or 0)
            total_anti_competitive += cases
            if period != "unknown":
                anti_comp_trend[period] = anti_comp_trend.get(period, 0) + cases

        # Data Breaches
        if "Breach" in sub or "Data" in sub:
            breaches = int(fv.get("no_of_incidents_of_data_breach") or 0)
            total_data_breaches += breaches
            if period != "unknown":
                breach_trend[period] = breach_trend.get(period, 0) + breaches

        # Regulatory / Compliance Violations
        if "Violations" in sub or "compliance" in sub or "regulatory" in sub:
            violations = int(fv.get("no_of_incidents_of_violations") or 0)
            total_violations += violations
            if period != "unknown":
                violation_trend[period] = violation_trend.get(period, 0) + violations

        # Corruption Cases
        if "Corruption" in sub or "bribery" in sub:
            cases = int(fv.get("no_of_confirmed_corruption_incidents") or 0)
            total_corruption += cases
            if period != "unknown":
                corruption_trend[period] = corruption_trend.get(period, 0) + cases

    avg_ap_days = round(total_ap_days / ap_count, 1) if ap_count > 0 else round(total_ap_days, 1)

    def _sorted_trend(d):
        return [{"period": k, "value": round(v, 1)} for k, v in sorted(d.items())]

    return {
        "kpis": {
            "ap_days": avg_ap_days,
            "anti_competitive_cases": total_anti_competitive,
            "data_breaches": total_data_breaches,
            "violations": total_violations,
            "corruption_cases": total_corruption,
        },
        "ap_trend": _sorted_trend(ap_trend),
        "breach_trend": _sorted_trend(breach_trend),
        "violation_trend": _sorted_trend(violation_trend),
        "anti_competitive_trend": _sorted_trend(anti_comp_trend),
        "corruption_trend": _sorted_trend(corruption_trend),
    }
