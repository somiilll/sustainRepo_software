"""Shared aggregation, export, history, and delivery helpers for MIS Reports."""
import io
import uuid
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from dateutil.relativedelta import relativedelta

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from shared.database.mongo import db
from shared.helpers.email import send_email_with_attachments
from modules.esg_records.services.dashboard.dashboard_metrics_service import get_dashboard_metrics_service
from modules.dashboards.environment_detail_service import get_environment_detail
from modules.esg_records.services.dashboard.unit_utils import to_kilolitres
from modules.mis_reports.reporting_period_service import ReportingPeriodService


ALL_SCOPES = ["scope1", "scope2", "scope3", "biogenic"]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def numeric_emissions(record: Dict[str, Any]) -> float:
    for field in ("total_emissions", "calculated_co2e", "co2e_emissions"):
        try:
            return float(record.get(field) or 0)
        except (TypeError, ValueError):
            continue
    return 0.0


async def organization_facility_ids(current_user: dict) -> List[str]:
    if current_user.get("role") == "super_admin":
        facilities = await db.facilities.find({}, {"_id": 0, "id": 1}).to_list(5000)
    else:
        facilities = await db.facilities.find(
            {"organization_id": current_user.get("organization_id")},
            {"_id": 0, "id": 1},
        ).to_list(5000)
    return [facility["id"] for facility in facilities]


async def aggregate_emissions(filters: Dict[str, Any], current_user: dict) -> Dict[str, Any]:
    from shared.utils.period_utils import period_variants

    allowed_facilities = await organization_facility_ids(current_user)
    requested_facilities = filters.get("facility_ids") or allowed_facilities
    facility_ids = [facility_id for facility_id in requested_facilities if facility_id in allowed_facilities]
    scopes = filters.get("scopes") or ALL_SCOPES
    categories = filters.get("categories") or []
    report_year = int(filters["reporting_period_start"][:4])
    fiscal_periods = period_variants(report_year, "FY")
    query: Dict[str, Any] = {
        "facility_id": {"$in": facility_ids},
        "scope": {"$in": scopes},
    }
    if filters.get("strict_period"):
        if filters.get("period_frequency") in {"daily", "weekly"}:
            # Daily/weekly reporting is exact only for records stored as ISO dates; monthly records are intentionally not stretched across shorter periods.
            query["reporting_period"] = {"$gte": filters["period_start_date"], "$lte": filters["period_end_date"]}
        else:
            query["reporting_period"] = {"$gte": filters["reporting_period_start"], "$lte": filters["reporting_period_end"]}
    else:
        query["$or"] = [
            {"reporting_period": {"$gte": filters["reporting_period_start"], "$lte": filters["reporting_period_end"]}},
            {"reporting_period": {"$in": fiscal_periods}},
        ]
    if categories:
        query["category"] = {"$in": categories}
    records = await db.emission_records.find(query, {"_id": 0}).to_list(10000)

    facility_names = {
        facility["id"]: facility.get("name", facility["id"])
        for facility in await db.facilities.find({"id": {"$in": facility_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(5000)
    }
    grouped = {"scope": {}, "category": {}, "facility": {}, "period": {}}
    total = 0.0
    for record in records:
        value = numeric_emissions(record)
        total += value
        values = {
            "scope": record.get("scope", "unknown"),
            "category": record.get("category", "Uncategorized"),
            "facility": facility_names.get(record.get("facility_id"), "Unknown facility"),
            "period": record.get("reporting_period", "Unknown period"),
        }
        for key, name in values.items():
            grouped[key][name] = grouped[key].get(name, 0) + value

    def breakdown(items: Dict[str, float], field: str) -> List[Dict[str, Any]]:
        return [{field: name, "emissions": round(value, 4)} for name, value in sorted(items.items(), key=lambda item: item[1], reverse=True)]

    return {
        "total_emissions": round(total, 4),
        "unit": "tCO2e",
        "record_count": len(records),
        "scope_breakdown": breakdown(grouped["scope"], "scope"),
        "category_breakdown": breakdown(grouped["category"], "category"),
        "facility_breakdown": breakdown(grouped["facility"], "facility"),
        "period_breakdown": breakdown(grouped["period"], "period"),
    }


def previous_period_filters(filters: Dict[str, Any]) -> Dict[str, Any]:
    start = datetime.strptime(filters["reporting_period_start"], "%Y-%m")
    end = datetime.strptime(filters["reporting_period_end"], "%Y-%m")
    month_count = (end.year - start.year) * 12 + end.month - start.month + 1
    previous_start = start - relativedelta(months=month_count)
    previous_end = end - relativedelta(months=month_count)
    return {**filters, "reporting_period_start": previous_start.strftime("%Y-%m"), "reporting_period_end": previous_end.strftime("%Y-%m")}


def percentage_change(current: float, previous: float) -> float | None:
    if not previous:
        return None
    return round(((current - previous) / previous) * 100, 2)


def target_direction_and_status(actual: Optional[float], target: Optional[float], direction: Optional[str]) -> tuple[str, str]:
    """Classify targets using their stored goal direction—never a one-size-fits-all ratio."""
    if direction not in {"decrease", "increase", "maintain"}:
        return "Not configured", "Direction required"
    if actual is None or target is None:
        return direction, "No Data"
    if direction == "decrease":
        return direction, "On Track" if actual <= target else ("At Risk" if actual <= target * 1.1 else "Behind")
    if direction == "increase":
        return direction, "Achieved" if actual >= target else ("At Risk" if actual >= target * 0.9 else "Behind")
    return direction, "Achieved" if actual == target else "At Risk"


def inferred_legacy_target_direction(name: str) -> str:
    """Temporary fallback for legacy targets until their explicit direction is configured."""
    value = (name or "").lower()
    if any(term in value for term in ("renewable", "recycle", "recovery", "recycling")):
        return "increase"
    if any(term in value for term in ("ghg", "emission", "water consumption", "energy", "waste generation", "waste generated")):
        return "decrease"
    return "maintain"


def comparison_status(current: float, previous: float, direction: str) -> tuple[Optional[float], str]:
    """Return meaningful management status without dividing by zero or treating every decrease as good."""
    if previous == 0:
        return None, "New activity / No comparable baseline" if current else "No activity in either period"
    if current == 0:
        return -100.0, "No current-period activity"
    change = percentage_change(current, previous)
    if change is None or abs(change) < 0.05:
        return change, "No material change"
    if direction == "lower":
        if change > 100:
            return change, "Large period-over-period change — review recommended"
        return change, "Improving" if change < 0 else "Needs attention"
    if direction == "higher":
        return change, "Improving" if change > 0 else "Needs attention"
    return change, "Informational"



async def _enrich_targets_with_progress(targets_raw: List[Dict], organization_id: str) -> List[Dict]:
    """Compute actual progress for each target using kpi_calculator — mirrors /targets/with-progress."""
    from modules.kpi_engine import kpi_calculator
    from modules.esg_targets.router import (
        _calculate_progress,
        _get_denominator_for_intensity,
        _get_period_for_target,
        _resolve_target_value,
    )

    enriched = []
    for t in targets_raw:
        entry: Dict[str, Any] = {
            "name": t.get("target_name", "Unnamed"),
            "target_value": t.get("target_value"),
            "baseline_value": (t.get("baseline") or {}).get("value"),
            "baseline_period": (t.get("baseline") or {}).get("period"),
            "unit": t.get("unit", ""),
            "category": t.get("category", ""),
            "kpi_name": t.get("kpi_name", ""),
            "reporting_period": t.get("reporting_period", ""),
            "actual_value": None,
            "progress_pct": None,
            "target_type": t.get("target_type", "absolute"),
            "goal_type": t.get("goal_type", "upper_limit"),
            "target_direction": t.get("target_direction") or t.get("percentage_direction") or inferred_legacy_target_direction(t.get("name") or t.get("target_name", "")),
            "status": "No Data",
        }
        kpi_id = t.get("kpi_id")
        if kpi_id:
            try:
                period = _get_period_for_target(t)
                facility_ids = t.get("facility_ids") if t.get("scope_type") == "facility" else None
                calculation = await kpi_calculator.calculate(
                    kpi_id=kpi_id,
                    org_id=organization_id,
                    scope_type=t.get("scope_type", "organization"),
                    facility_ids=facility_ids,
                    period=period,
                )
                actual_value = calculation.get("value")
                target_value = _resolve_target_value(t, period)
                goal_type = t.get("goal_type", "upper_limit")

                # Intensity targets: divide actual by revenue/production denominator
                if t.get("target_type") in ("intensity_revenue", "intensity_production"):
                    denom = await _get_denominator_for_intensity(t, organization_id, period)
                    if denom.get("error") or not denom.get("value"):
                        actual_value = None
                    elif actual_value is not None:
                        actual_value = round(actual_value / denom["value"], 6)

                # Percentage targets: recalculate absolute target from baseline × percentage
                if t.get("target_type") == "percentage" and t.get("percentage_amount"):
                    baseline = t.get("baseline") or {}
                    bv = float(baseline.get("value", 0)) if baseline else 0
                    pct = float(t.get("percentage_amount", 0))
                    if bv and pct:
                        direction = t.get("percentage_direction", "decrease")
                        new_tv = bv * (1 + pct / 100) if direction == "increase" else bv * (1 - pct / 100)
                        if target_value is None or abs((target_value or 0) - new_tv) > 0.01:
                            target_value = new_tv

                progress = _calculate_progress(actual_value, target_value, goal_type, t)
                entry["actual_value"] = actual_value
                entry["progress_pct"] = round(progress["percentage"], 1) if progress["percentage"] is not None else None
                if target_value is not None:
                    entry["target_value"] = target_value
                direction, status = target_direction_and_status(actual_value, target_value, entry["target_direction"])
                entry["target_direction"] = direction
                entry["status"] = status
            except Exception:
                pass
        enriched.append(entry)
    return enriched


async def build_executive_mis_report(filters: Dict[str, Any], current_user: dict, reporting_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Build a factual ESG MIS data pack; no generative metrics are invented."""
    current = await aggregate_emissions(filters, current_user)
    if reporting_context:
        frequency = reporting_context["frequency"]
        previous_filters = ReportingPeriodService.filters_for(filters, reporting_context["comparison_period"], frequency)
        ytd_filters = ReportingPeriodService.filters_for(filters, reporting_context["ytd_period"], frequency)
        previous_ytd_filters = ReportingPeriodService.filters_for(filters, reporting_context["previous_ytd_period"], frequency)
    else:
        previous_filters = previous_period_filters(filters)
        ytd_filters = filters
        previous_ytd_filters = previous_period_filters(filters)
    previous = await aggregate_emissions(previous_filters, current_user)
    ytd = await aggregate_emissions(ytd_filters, current_user)
    previous_ytd = await aggregate_emissions(previous_ytd_filters, current_user)
    previous_scopes = {row["scope"]: row["emissions"] for row in previous["scope_breakdown"]}
    current_scopes = {row["scope"]: row["emissions"] for row in current["scope_breakdown"]}
    previous_ytd_scopes = {row["scope"]: row["emissions"] for row in previous_ytd["scope_breakdown"]}
    ytd_scopes = {row["scope"]: row["emissions"] for row in ytd["scope_breakdown"]}
    kpis = [{"label": "Total Emissions", "value": current["total_emissions"], "previous": previous["total_emissions"], "ytd": ytd["total_emissions"], "previous_ytd": previous_ytd["total_emissions"], "unit": current["unit"], "change_pct": percentage_change(current["total_emissions"], previous["total_emissions"]), "ytd_change_pct": percentage_change(ytd["total_emissions"], previous_ytd["total_emissions"])}]
    for scope in ALL_SCOPES:
        kpis.append({"label": scope.replace("scope", "Scope ").title(), "value": current_scopes.get(scope, 0), "previous": previous_scopes.get(scope, 0), "ytd": ytd_scopes.get(scope, 0), "previous_ytd": previous_ytd_scopes.get(scope, 0), "unit": current["unit"], "change_pct": percentage_change(current_scopes.get(scope, 0), previous_scopes.get(scope, 0)), "ytd_change_pct": percentage_change(ytd_scopes.get(scope, 0), previous_ytd_scopes.get(scope, 0))})

    organization_id = current_user.get("organization_id")
    facility_ids = filters.get("facility_ids") or await organization_facility_ids(current_user)
    # Use the selected reporting period with the dashboard metric services.
    all_facilities = await organization_facility_ids(current_user)
    is_all_facilities = set(facility_ids) == set(all_facilities)
    esg_facility_filter = None if is_all_facilities else facility_ids
    current_resources = await build_resource_snapshot(organization_id, esg_facility_filter, filters)
    previous_resources = await build_resource_snapshot(organization_id, esg_facility_filter, previous_filters)
    relationships = await db.supplier_relationships.find({"customer_org_id": organization_id, "is_active": True, "is_deleted": {"$ne": True}}, {"_id": 0, "supplier_name": 1, "supplier_org_name": 1, "overall_score": 1, "invitation_status": 1}).to_list(1000)
    targets_raw = await db.esg_targets.find(
        {"organization_id": organization_id, "is_deleted": {"$ne": True}, "status": "active"},
        {"_id": 0},
    ).to_list(100)
    targets = await _enrich_targets_with_progress(targets_raw, organization_id)
    frameworks = await db.organization_esg_responses.find({"organization_id": organization_id}, {"_id": 0, "framework": 1, "approval_status": 1}).to_list(10000)
    compliance: Dict[str, Dict[str, int]] = {}
    for item in frameworks:
        framework = item.get("framework") or "Unclassified"
        compliance.setdefault(framework, {"total": 0, "complete": 0})["total"] += 1
        if item.get("approval_status") in {"approved", "not_required"}: compliance[framework]["complete"] += 1
    compliance_rows = [{"framework": name, "completion_pct": round((values["complete"] / values["total"] * 100) if values["total"] else 0, 1)} for name, values in compliance.items()]

    insights, actions = [], []
    energy, water, waste = current_resources["energy"], current_resources["water"], current_resources["waste"]
    energy_total = energy.get("total", 0) or 0
    incidents = await db.governance_records.count_documents({
        "org_id": organization_id,
        "approval_status": {"$in": ["approved", "not_required", None]},
        "$or": [
            {"subcategory": "Health & Safety Incidents"},
            {"category": {"$regex": "data breach", "$options": "i"}},
            {"subcategory": {"$regex": "data breach", "$options": "i"}},
            {"category": {"$regex": "violation", "$options": "i"}},
            {"subcategory": {"$regex": "violation", "$options": "i"}},
        ],
    })
    operational = await get_operational_kpis(organization_id, current_scopes.get("scope1", 0) + current_scopes.get("scope2", 0), energy_total, incidents, filters)
    total_change = kpis[0]["change_pct"]
    if total_change is not None:
        insights.append(f"Emissions {'decreased' if total_change < 0 else 'increased'} {abs(total_change):.1f}% versus the comparable previous period.")
    previous_facilities = {row["facility"]: row["emissions"] for row in previous["facility_breakdown"]}
    facility_comparisons = []
    for row in current["facility_breakdown"]:
        prior_value = previous_facilities.get(row["facility"], 0)
        change_pct, status = comparison_status(row["emissions"], prior_value, "lower")
        facility_comparisons.append({"facility": row["facility"], "current": row["emissions"], "previous": prior_value, "change_pct": change_pct, "status": status})
    if current["facility_breakdown"] and current["total_emissions"]:
        top = current["facility_breakdown"][0]
        concentration = round(top["emissions"] / current["total_emissions"] * 100, 1)
        insights.append(f"{top['facility']} contributed {concentration:.1f}% of current-period emissions.")
    energy_change, energy_status = comparison_status(energy_total, previous_resources["energy"].get("total", 0) or 0, "lower")
    water_change, water_status = comparison_status(water.get("consumption", 0) or 0, previous_resources["water"].get("consumption", 0) or 0, "lower")
    renewable_change, renewable_status = comparison_status(energy.get("renewable_pct", 0) or 0, previous_resources["energy"].get("renewable_pct", 0) or 0, "higher")
    if energy_change is not None and energy_change > 20:
        insights.append(f"Energy consumption increased {energy_change:.1f}% and requires investigation.")
    if energy_total and not energy.get("renewable_pct"):
        insights.append("Renewable energy contribution remains at 0%, creating a clear improvement opportunity.")
    if water_change is not None and water_change > 5:
        insights.append(f"Water consumption increased {water_change:.1f}% versus the comparable previous period and requires review.")
    if relationships:
        insights.append(f"{len(relationships)} suppliers have been assessed, with {sum(1 for row in relationships if row.get('overall_score') is not None and row['overall_score'] < 50)} currently high-risk.")
    target_counts = {status: sum(1 for target in targets if target.get("status") == status) for status in ("On Track", "At Risk", "Behind", "Achieved")}
    active_targets = len(targets)
    if active_targets:
        insights.append(f"{active_targets} active targets: {target_counts['On Track'] + target_counts['Achieved']} on track or achieved, {target_counts['At Risk']} at risk, and {target_counts['Behind']} behind.")
    if target_counts["Behind"]:
        actions.append({"priority": "High", "area": "Targets", "action": f"Review {target_counts['Behind']} target{'s' if target_counts['Behind'] != 1 else ''} currently behind plan"})
    if energy_status == "Large period-over-period change — review recommended":
        actions.append({"priority": "High", "area": "Energy", "action": f"Investigate {energy_change:.1f}% increase in consumption"})
    if energy_total and not energy.get("renewable_pct"):
        actions.append({"priority": "Medium", "area": "Renewable Energy", "action": "Develop a renewable-energy improvement plan"})
    if water_status in {"Needs attention", "Large period-over-period change — review recommended"}:
        actions.append({"priority": "Medium", "area": "Water", "action": "Review current consumption against target and prior period"})
    availability = {"current": "available" if current["record_count"] else "No data available for this reporting period.", "comparison": "available" if previous["record_count"] else "Previous-period comparison unavailable.", "previous_ytd": "available" if previous_ytd["record_count"] else "Previous FY/CY YTD comparison unavailable."}
    resource_status = {"energy": energy_status, "water": water_status, "renewable": renewable_status, "waste_recovery": comparison_status(waste.get("recovery_pct", 0) or 0, previous_resources["waste"].get("recovery_pct", 0) or 0, "higher")[1]}
    high_priority = sum(1 for action in actions if action["priority"] == "High")
    overall_management_status = "Attention Required" if high_priority or target_counts["Behind"] else ("Monitor" if actions or target_counts["At Risk"] else "On Track")
    fy_emissions_trend = await build_fy_emissions_trend(filters, current_user, reporting_context)
    return {"filters": filters, "reporting_context": reporting_context, "current": current, "previous": previous, "ytd": ytd, "previous_ytd": previous_ytd, "kpis": kpis, "energy": energy, "water": water, "waste": waste, "previous_resources": previous_resources, "resource_status": resource_status, "operational_kpis": operational, "compliance": compliance_rows, "supplier_assessment": {"suppliers_assessed": len(relationships), "high_risk_suppliers": sum(1 for row in relationships if row.get("overall_score") is not None and row["overall_score"] < 50), "pending_assessments": sum(1 for row in relationships if row.get("invitation_status") not in {"completed", "accepted"})}, "supplier_scores": relationships, "targets": targets, "target_summary": {"active": active_targets, **target_counts}, "insights": insights[:7], "actions": actions, "overall_management_status": {"status": overall_management_status, "high_priority_count": high_priority}, "facility_comparisons": facility_comparisons, "monthly_trend": current["period_breakdown"], "fy_emissions_trend": fy_emissions_trend, "availability": availability}


async def dashboard_recycled_water(organization_id: str, facility_ids: Optional[List[str]]) -> float:
    """Apply the Environment dashboard's approved-record scope to Water Recycle."""
    query: Dict[str, Any] = {"org_id": organization_id, "category": "Water", "subcategory": "Recycle", "approval_status": {"$in": ["approved", "not_required", None]}}
    if facility_ids:
        query["facility_id"] = {"$in": facility_ids}
    records = await db.environment_records.find(query, {"_id": 0, "field_values": 1}).to_list(10000)
    total = 0.0
    for record in records:
        values = record.get("field_values") or {}
        try:
            total += to_kilolitres(float(values.get("total_quantity_of_water_recycled") or 0), values.get("unit"))
        except (TypeError, ValueError):
            continue
    return round(total, 2)


async def build_resource_snapshot(organization_id: str, facility_ids: Optional[List[str]], filters: Dict[str, Any]) -> Dict[str, Dict[str, float]]:
    """Build one period's energy, water, and waste metrics for like-for-like report comparisons."""
    dashboard = await get_dashboard_metrics_service(db).get_dashboard_metrics(
        organization_id, facility_ids, start_date=filters["reporting_period_start"], end_date=filters["reporting_period_end"]
    )
    detail = await get_environment_detail(db, organization_id, filters["reporting_period_start"], filters["reporting_period_end"], facility_ids)
    energy = dashboard.get("energy", {})
    energy_total = energy.get("total", 0) or 0
    energy["renewable_pct"] = round(((energy.get("renewable_total", 0) or 0) / energy_total * 100) if energy_total else 0, 2)
    water = dashboard.get("water", {})
    water["withdrawal"] = round(sum(row["value"] for row in detail.get("water_sources", [])), 2)
    water["discharge"] = round(sum(row["value"] for row in detail.get("water_discharge_sources", [])), 2)
    water["consumption"] = round(sum(row["value"] for row in detail.get("water_consumption_sources", [])), 2)
    water["recycled"] = await dashboard_recycled_water(organization_id, facility_ids)
    water["totalinput"] = water["withdrawal"] + water["consumption"]
    water["recycle_pct"] = round((water.get("recycled", 0) / water["totalinput"] * 100) if water["totalinput"] else 0, 2)
    hazardous, non_hazardous = detail.get("hazardous_waste", {}), detail.get("non_hazardous_waste", {})
    waste = {"generated": round(hazardous.get("generated", 0) + non_hazardous.get("generated", 0), 2), "disposal": round(hazardous.get("disposed", 0) + non_hazardous.get("disposed", 0), 2), "recovered": round(hazardous.get("recovered", 0) + non_hazardous.get("recovered", 0), 2)}
    waste["recovery_pct"] = round((waste["recovered"] / waste["generated"] * 100) if waste["generated"] else 0, 2)
    return {"energy": energy, "water": water, "waste": waste}


async def build_fy_emissions_trend(filters: Dict[str, Any], current_user: dict, context: Optional[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """Map each month of current and prior FY/CY YTD for the management trend chart."""
    if not context:
        return {"current": [], "previous": []}
    start = datetime.fromisoformat(context["ytd_period"]["start_date"]).date().replace(day=1)
    previous_start = datetime.fromisoformat(context["previous_ytd_period"]["start_date"]).date().replace(day=1)
    end = datetime.fromisoformat(context["ytd_period"]["end_date"]).date().replace(day=1)
    months = []
    cursor = start
    while cursor <= end:
        months.append(cursor.strftime("%Y-%m")); cursor = (cursor + relativedelta(months=1)).replace(day=1)
    prior_months = [(previous_start + relativedelta(months=index)).strftime("%Y-%m") for index in range(len(months))]
    facility_ids = filters.get("facility_ids") or await organization_facility_ids(current_user)
    records = await db.emission_records.find({"facility_id": {"$in": facility_ids}, "scope": {"$in": filters.get("scopes") or ALL_SCOPES}, "reporting_period": {"$in": months + prior_months}}, {"_id": 0, "reporting_period": 1, "co2e_emissions": 1}).to_list(100000)
    totals = {key: 0.0 for key in months + prior_months}
    for row in records:
        try: totals[row.get("reporting_period", "")] += float(row.get("co2e_emissions") or 0)
        except (TypeError, ValueError): continue
    return {"current": [{"period": key, "emissions": round(totals[key], 2)} for key in months], "previous": [{"period": key, "emissions": round(totals[key], 2)} for key in prior_months]}


async def get_operational_kpis(organization_id: str, scope12_emissions: float, energy_total: float, incidents: int, filters: Dict[str, Any]) -> Dict[str, Any]:
    """Mirror the dashboard KPI formulas and approved-record filters exactly."""
    from modules.esg_records.services.dashboard.date_utils import build_date_filter
    from shared.utils.period_utils import period_variants

    period_conditions = build_date_filter(filters["reporting_period_start"], filters["reporting_period_end"])

    async def latest_value(collection, field_key):
        base = {"org_id": organization_id, "is_current": {"$ne": False}, "status": {"$ne": "draft"}, "approval_status": {"$in": ["approved", "not_required", None]}, f"field_values.{field_key}": {"$exists": True, "$ne": None}}
        query = {"$and": [base, {"$or": period_conditions}]} if period_conditions else base
        record = await collection.find_one(query, {"_id": 0, "field_values": 1}, sort=[("created_at", -1)])
        try:
            return float(record["field_values"][field_key]) if record else None
        except (KeyError, TypeError, ValueError):
            return None

    lost_time_injuries = await latest_value(db.social_records, "no_of_loss_time_injuries")
    total_hours_worked = await latest_value(db.social_records, "total_hours_worked")
    accounts_payable = await latest_value(db.governance_records, "accounts_payable")
    cogs = await latest_value(db.governance_records, "cost_of_goods_services_procured")
    report_year = int(filters["reporting_period_start"][:4])
    production = None
    for variant in period_variants(report_year, "FY"):
        record = await db.production_quantities.find_one({"organization_id": organization_id, "facility_id": None, "reporting_period": variant, "is_deleted": {"$ne": True}}, {"_id": 0, "quantity": 1})
        if record:
            production = record.get("quantity")
            break
    return {"ltifr": round((lost_time_injuries * 1000000) / total_hours_worked, 2) if lost_time_injuries and total_hours_worked else None, "account_payable_days": round((accounts_payable * 365) / cogs, 1) if accounts_payable and cogs else None, "incident_count": incidents, "ghg_intensity": round(scope12_emissions / production, 4) if production else None, "energy_intensity": round(energy_total / production, 4) if production else None}


async def save_report_run(filters: Dict[str, Any], summary: Dict[str, Any], current_user: dict, status: str = "generated") -> Dict[str, Any]:
    run = {
        "id": str(uuid.uuid4()), "template_id": "emissions_summary", "template_name": "Emissions Summary",
        "organization_id": current_user.get("organization_id"), "generated_by_email": current_user.get("email"),
        "generated_at": now_iso(), "status": status, "filters": filters, "summary": summary,
    }
    await db.mis_report_history.insert_one(run.copy())
    return run


def next_run_at(frequency: str, run_time: str = "09:00", run_day: Optional[int] = None) -> str:
    """Return a predictable UTC next run without changing existing schedules' defaults."""
    days = {"daily": 1, "weekly": 7, "monthly": 30, "quarterly": 90, "yearly": 365}
    hour, minute = (int(value) for value in (run_time or "09:00").split(":", 1))
    candidate = datetime.now(timezone.utc).replace(hour=hour, minute=minute, second=0, microsecond=0)
    if candidate <= datetime.now(timezone.utc):
        candidate += timedelta(days=days[frequency])
    elif frequency != "daily":
        candidate += timedelta(days=days[frequency] - 1)
    return candidate.isoformat()


def schedule_recipients(schedule: Dict[str, Any]) -> List[Dict[str, str]]:
    recipients = schedule.get("recipients") or []
    if recipients:
        return [{"id": str(item.get("id") or uuid.uuid4()), "name": item.get("name") or item.get("email", ""), "email": item.get("email", "")} for item in recipients]
    return [{"id": str(uuid.uuid4()), "name": email.split("@", 1)[0], "email": email} for email in schedule.get("recipient_emails", [])]


def safe_report_filename(name: str, extension: str) -> str:
    base = re.sub(r"[^A-Za-z0-9_-]+", "_", name).strip("_") or "ESG_MIS_Report"
    return f"{base}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M')}.{extension}"


async def facility_names_for_filters(filters: Dict[str, Any], current_user: dict) -> List[str]:
    facility_ids = filters.get("facility_ids") or await organization_facility_ids(current_user)
    facilities = await db.facilities.find({"id": {"$in": facility_ids}}, {"_id": 0, "name": 1}).to_list(1000)
    return [facility.get("name", "Facility") for facility in facilities]


async def store_delivery_artifact(content: bytes, filename: str, content_type: str, organization_id: str, delivery_id: str) -> Dict[str, Any]:
    """Persist a generated artifact once so historical downloads never regenerate a report."""
    from r2_storage import get_r2_storage

    result = await get_r2_storage().upload_file(
        content,
        filename,
        "esg_metrics",
        content_type,
        folder=f"mis_reports/{organization_id}/{delivery_id}",
        metadata={"delivery_id": delivery_id, "organization_id": organization_id},
    )
    if not result.get("success"):
        raise RuntimeError(result.get("error", "Unable to store report artifact"))
    return {"format": filename.rsplit(".", 1)[-1], "filename": filename, "content_type": content_type, "file_size": result["file_size"], "storage_key": result["key"], "bucket_type": "esg_metrics"}


def build_summary_email(schedule_name: str, summary: Dict[str, Any], filters: Dict[str, Any]) -> str:
    scopes = {row["scope"]: row["emissions"] for row in summary["scope_breakdown"]}
    return f"<div style='font-family:Arial,sans-serif;color:#17211d;max-width:640px'><p>Hello,</p><p>Your ESG MIS Report for <strong>{filters['reporting_period_start']} to {filters['reporting_period_end']}</strong> has been generated successfully.</p><h3>Quick Summary</h3><table style='border-collapse:collapse;width:100%'><tr><td>Total Emissions</td><td style='text-align:right'>{summary['total_emissions']:,.2f} {summary['unit']}</td></tr><tr><td>Scope 1</td><td style='text-align:right'>{scopes.get('scope1', 0):,.2f} {summary['unit']}</td></tr><tr><td>Scope 2</td><td style='text-align:right'>{scopes.get('scope2', 0):,.2f} {summary['unit']}</td></tr><tr><td>Scope 3</td><td style='text-align:right'>{scopes.get('scope3', 0):,.2f} {summary['unit']}</td></tr><tr><td>Biogenic</td><td style='text-align:right'>{scopes.get('biogenic', 0):,.2f} {summary['unit']}</td></tr></table><p>Please find the detailed PDF and Excel reports attached.</p><p>Regards,<br/>SustainRepo</p></div>"


async def send_schedule(schedule: Dict[str, Any], current_user: dict) -> Dict[str, Any]:
    sent_at = now_iso()
    delivery_id = str(uuid.uuid4())
    recipients = schedule_recipients(schedule)
    organization = await db.organizations.find_one({"id": schedule.get("organization_id")}, {"_id": 0, "name": 1, "reporting_year_type": 1, "financial_year_start_month": 1})
    reporting_context = ReportingPeriodService(organization, datetime.now(timezone.utc)).resolve(schedule["frequency"])
    resolved_filters = ReportingPeriodService.filters_for(schedule["filters"], reporting_context["reporting_period"], schedule["frequency"])
    summary = await aggregate_emissions(resolved_filters, current_user)
    facility_names = await facility_names_for_filters(resolved_filters, current_user)
    executive = await build_executive_mis_report(resolved_filters, current_user, reporting_context)
    pdf_name = safe_report_filename(schedule["name"], "pdf")
    xlsx_name = safe_report_filename(schedule["name"], "xlsx")
    try:
        pdf_content = build_executive_pdf(executive, (organization or {}).get("name", "SustainRepo Organization"), current_user.get("email"))
        xlsx_content = build_executive_excel(executive)
        artifacts = [
            await store_delivery_artifact(pdf_content, pdf_name, "application/pdf", schedule.get("organization_id", "global"), delivery_id),
            await store_delivery_artifact(xlsx_content, xlsx_name, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", schedule.get("organization_id", "global"), delivery_id),
        ]
    except Exception as error:
        failure = str(error)
        delivery_run = {"id": delivery_id, "schedule_id": schedule.get("id"), "schedule_name": schedule["name"], "organization_id": schedule.get("organization_id"), "status": "failed", "generated_at": sent_at, "reporting_period_label": reporting_context["reporting_period"]["label"], "filters": resolved_filters, "reporting_context": reporting_context, "recipients": recipients, "content": schedule.get("content") or {}, "facility_mode": schedule.get("facility_mode", "all"), "facility_names": facility_names, "artifacts": [], "failure_reason": failure, "schedule_snapshot": schedule}
        await db.mis_report_delivery_runs.insert_one(delivery_run.copy())
        return delivery_run

    attachments = [(xlsx_name, xlsx_content), (pdf_name, pdf_content)]
    failures = []
    for recipient in recipients:
        success = await send_email_with_attachments(recipient["email"], f"ESG MIS Report – {reporting_context['reporting_period']['label']}", build_summary_email(schedule["name"], summary, resolved_filters), attachments)
        error = None if success else "Resend delivery failed"
        if error:
            failures.append(recipient["email"])
        delivery = {"id": str(uuid.uuid4()), "delivery_run_id": delivery_id, "schedule_id": schedule["id"], "organization_id": schedule.get("organization_id"), "recipient_email": recipient["email"], "recipient_name": recipient["name"], "status": "sent" if success else "failed", "sent_at": sent_at, "error": error}
        await db.mis_report_deliveries.insert_one(delivery.copy())
    status = "sent" if not failures else ("failed" if len(failures) == len(recipients) else "partial")
    delivery_run = {"id": delivery_id, "schedule_id": schedule.get("id"), "schedule_name": schedule["name"], "organization_id": schedule.get("organization_id"), "status": status, "generated_at": sent_at, "reporting_period_label": reporting_context["reporting_period"]["label"], "filters": resolved_filters, "reporting_context": reporting_context, "recipients": recipients, "content": schedule.get("content") or {}, "facility_mode": schedule.get("facility_mode", "all"), "facility_names": facility_names, "artifacts": artifacts, "failure_reason": "Resend delivery failed for: " + ", ".join(failures) if failures else None, "schedule_snapshot": schedule}
    await db.mis_report_delivery_runs.insert_one(delivery_run.copy())
    return delivery_run


async def process_due_schedules() -> int:
    """Send due MIS schedules; invoked hourly by the application worker."""
    schedules = await db.mis_report_schedules.find(
        {"is_enabled": True, "next_run_at": {"$lte": now_iso()}},
        {"_id": 0},
    ).to_list(500)
    processed = 0
    for schedule in schedules:
        try:
            user_context = {"role": "admin", "organization_id": schedule.get("organization_id"), "email": schedule.get("created_by_email")}
            await send_schedule(schedule, user_context)
            await db.mis_report_schedules.update_one(
                {"id": schedule["id"]},
                {"$set": {"last_run_at": now_iso(), "next_run_at": next_run_at(schedule["frequency"], schedule.get("run_time", "09:00"), schedule.get("run_day"))}},
            )
            processed += 1
        except Exception:
            await db.mis_report_schedules.update_one(
                {"id": schedule["id"]},
                {"$set": {"next_run_at": next_run_at(schedule["frequency"], schedule.get("run_time", "09:00"), schedule.get("run_day"))}},
            )
    return processed


def build_excel(summary: Dict[str, Any]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Emissions Summary"
    sheet.append(["Emissions Summary", summary["unit"]])
    sheet.append(["Total emissions", summary["total_emissions"]])
    sheet.append(["Source records", summary["record_count"]])
    sheet.append([])
    sheet.append(["Scope", "Emissions"])
    for row in summary["scope_breakdown"]:
        sheet.append([row["scope"], row["emissions"]])
    for cell in sheet[1]: cell.font = Font(bold=True, color="FFFFFF"); cell.fill = PatternFill("solid", fgColor="166534")
    sheet.column_dimensions["A"].width = 30
    sheet.column_dimensions["B"].width = 20
    buffer = io.BytesIO(); workbook.save(buffer); return buffer.getvalue()


def build_pdf(summary: Dict[str, Any]) -> bytes:
    buffer = io.BytesIO(); pdf = canvas.Canvas(buffer, pagesize=A4); width, height = A4
    pdf.setFont("Helvetica-Bold", 18); pdf.drawString(48, height - 60, "Emissions Summary")
    pdf.setFont("Helvetica", 11); pdf.drawString(48, height - 88, f"Total emissions: {summary['total_emissions']:,.2f} {summary['unit']}")
    pdf.drawString(48, height - 106, f"Source records: {summary['record_count']}")
    y = height - 145; pdf.setFont("Helvetica-Bold", 11); pdf.drawString(48, y, "Scope"); pdf.drawRightString(width - 48, y, "Emissions")
    pdf.setFont("Helvetica", 10)
    for row in summary["scope_breakdown"]:
        y -= 20; pdf.drawString(48, y, row["scope"]); pdf.drawRightString(width - 48, y, f"{row['emissions']:,.2f}")
    pdf.save(); return buffer.getvalue()


def build_executive_excel(report: Dict[str, Any]) -> bytes:
    workbook = Workbook(); workbook.remove(workbook.active)
    context = report.get("reporting_context") or {}
    context_rows = []
    if context:
        context_rows = [
            ["Reporting Period", context["reporting_period"]["label"]], ["Comparison Period", context["comparison_period"]["label"]],
            ["Current FY/CY YTD", f"{context['ytd_period']['start_date']} to {context['ytd_period']['end_date']}"], ["Previous FY/CY YTD", f"{context['previous_ytd_period']['start_date']} to {context['previous_ytd_period']['end_date']}"],
            ["Reporting Calendar", context["reporting_calendar"]["label"]], [],
        ]
    def sheet(name, rows):
        ws = workbook.create_sheet(name); ws.append(["SustainRepo ESG MIS Report"]); ws.append([])
        for row in context_rows: ws.append(row)
        for row in rows: ws.append(row)
        for cell in ws[1]: cell.font = Font(bold=True, color="FFFFFF"); cell.fill = PatternFill("solid", fgColor="166534")
        ws.column_dimensions["A"].width = 34; ws.column_dimensions["B"].width = 22; ws.column_dimensions["C"].width = 22
    sheet("Executive Summary", [["KPI", "Current", "Previous", "Change %", "FY/CY YTD", "Previous FY/CY YTD", "YTD Change %"]] + [[k["label"], k["value"], k["previous"], k["change_pct"], k.get("ytd"), k.get("previous_ytd"), k.get("ytd_change_pct")] for k in report["kpis"]])
    sheet("Emissions Overview", [["Scope", "tCO2e"]] + [[r["scope"], r["emissions"]] for r in report["current"]["scope_breakdown"]] + [[]] + [["Category", "tCO2e"]] + [[r["category"], r["emissions"]] for r in report["current"]["category_breakdown"]])
    sheet("Facility Performance", [["Facility", "Current", "Previous", "Change %"]] + [[r["facility"], r["current"], r["previous"], r["change_pct"]] for r in report.get("facility_comparisons", [])])
    sheet("Operations", [["Energy", report["energy"].get("total"), "MWh"], ["Renewable share", report["energy"].get("renewable_pct"), "%"], ["Water recycled", report["water"].get("recycled"), "KL"], ["Waste recovered", report["waste"].get("recovered"), ""], ["LTIFR", report["operational_kpis"].get("ltifr"), ""], ["Account payable days", report["operational_kpis"].get("account_payable_days"), "days"]])
    sheet("Suppliers & Targets", [["Supplier", "ESG Score"]] + [[r.get("supplier_name") or r.get("supplier_org_name") or "Supplier", r.get("overall_score")] for r in report.get("supplier_scores", [])] + [[]] + [["Target", "Target", "Actual", "Direction", "Status"]] + [[r.get("name"), r.get("target_value"), r.get("actual_value"), r.get("target_direction"), r.get("status")] for r in report.get("targets", [])])
    buffer = io.BytesIO(); workbook.save(buffer); return buffer.getvalue()


def build_executive_pdf(report: Dict[str, Any], organization_name: str, generated_by: str) -> bytes:
    from modules.mis_reports.pdf_builder import build_beautiful_executive_pdf
    return build_beautiful_executive_pdf(report, organization_name, generated_by)