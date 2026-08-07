"""Shared aggregation, export, history, and delivery helpers for MIS Reports."""
import io
import uuid
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
        "$or": [
            {"reporting_period": {"$gte": filters["reporting_period_start"], "$lte": filters["reporting_period_end"]}},
            {"reporting_period": {"$in": fiscal_periods}},
        ],
    }
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


async def build_executive_mis_report(filters: Dict[str, Any], current_user: dict) -> Dict[str, Any]:
    """Build a factual ESG MIS data pack; no generative metrics are invented."""
    current = await aggregate_emissions(filters, current_user)
    previous = await aggregate_emissions(previous_period_filters(filters), current_user)
    previous_scopes = {row["scope"]: row["emissions"] for row in previous["scope_breakdown"]}
    current_scopes = {row["scope"]: row["emissions"] for row in current["scope_breakdown"]}
    kpis = [{"label": "Total Emissions", "value": current["total_emissions"], "previous": previous["total_emissions"], "unit": current["unit"], "change_pct": percentage_change(current["total_emissions"], previous["total_emissions"])}]
    for scope in ALL_SCOPES:
        kpis.append({"label": scope.replace("scope", "Scope ").title(), "value": current_scopes.get(scope, 0), "previous": previous_scopes.get(scope, 0), "unit": current["unit"], "change_pct": percentage_change(current_scopes.get(scope, 0), previous_scopes.get(scope, 0))})

    organization_id = current_user.get("organization_id")
    facility_ids = filters.get("facility_ids") or await organization_facility_ids(current_user)
    # Use the selected reporting period with the dashboard metric services.
    all_facilities = await organization_facility_ids(current_user)
    is_all_facilities = set(facility_ids) == set(all_facilities)
    esg_facility_filter = None if is_all_facilities else facility_ids
    dashboard = await get_dashboard_metrics_service(db).get_dashboard_metrics(
        organization_id, esg_facility_filter, start_date=filters["reporting_period_start"], end_date=filters["reporting_period_end"]
    )
    environment_detail = await get_environment_detail(db, organization_id, filters["reporting_period_start"], filters["reporting_period_end"], esg_facility_filter)
    evidence_count = await db.environment_records.count_documents({"org_id": organization_id, "evidence_files.0": {"$exists": True}, "is_current": {"$ne": False}})
    pending = await db.environment_records.count_documents({"org_id": organization_id, "approval_status": "pending_approval", "is_current": {"$ne": False}})
    rejected = await db.environment_records.count_documents({"org_id": organization_id, "approval_status": "rejected", "is_current": {"$ne": False}})
    total_esg_records = dashboard.get("total_records", 0)
    relationships = await db.supplier_relationships.find({"customer_org_id": organization_id, "is_active": True, "is_deleted": {"$ne": True}}, {"_id": 0, "supplier_name": 1, "supplier_org_name": 1, "overall_score": 1, "invitation_status": 1}).to_list(1000)
    targets_raw = await db.esg_targets.find(
        {"organization_id": organization_id, "is_deleted": {"$ne": True}, "status": "active"},
        {"_id": 0, "target_name": 1, "target_value": 1, "unit": 1, "baseline": 1, "category": 1, "kpi_name": 1, "reporting_period": 1},
    ).to_list(100)
    targets = [{
        "name": t.get("target_name", "Unnamed"),
        "target_value": t.get("target_value"),
        "baseline_value": (t.get("baseline") or {}).get("value"),
        "baseline_period": (t.get("baseline") or {}).get("period"),
        "unit": t.get("unit", ""),
        "category": t.get("category", ""),
        "kpi_name": t.get("kpi_name", ""),
        "reporting_period": t.get("reporting_period", ""),
    } for t in targets_raw]
    frameworks = await db.organization_esg_responses.find({"organization_id": organization_id}, {"_id": 0, "framework": 1, "approval_status": 1}).to_list(10000)
    compliance: Dict[str, Dict[str, int]] = {}
    for item in frameworks:
        framework = item.get("framework") or "Unclassified"
        compliance.setdefault(framework, {"total": 0, "complete": 0})["total"] += 1
        if item.get("approval_status") in {"approved", "not_required"}: compliance[framework]["complete"] += 1
    compliance_rows = [{"framework": name, "completion_pct": round((values["complete"] / values["total"] * 100) if values["total"] else 0, 1)} for name, values in compliance.items()]

    insights, actions = [], []
    for kpi in kpis[1:]:
        if kpi["change_pct"] is not None and abs(kpi["change_pct"]) >= 5:
            direction = "increased" if kpi["change_pct"] > 0 else "decreased"
            insights.append(f"{kpi['label']} {direction} by {abs(kpi['change_pct']):.1f}% versus the previous period.")
    if current["facility_breakdown"]:
        top = current["facility_breakdown"][0]
        insights.append(f"{top['facility']} is the highest-emitting facility at {top['emissions']:.2f} {current['unit']}.")
    energy = dashboard.get("energy", {})
    energy_total = energy.get("total", 0) or 0
    renewable_total = energy.get("renewable_total", 0) or 0
    energy["renewable_pct"] = round((renewable_total / energy_total * 100) if energy_total else 0, 2)
    water = dashboard.get("water", {})
    # Dashboard detail reads the granular Water source fields rather than only quantity.
    water["withdrawal"] = round(sum(row["value"] for row in environment_detail.get("water_sources", [])), 2)
    water["discharge"] = round(sum(row["value"] for row in environment_detail.get("water_discharge_sources", [])), 2)
    water["consumption"] = round(sum(row["value"] for row in environment_detail.get("water_consumption_sources", [])), 2)
    water["recycled"] = await dashboard_recycled_water(organization_id, esg_facility_filter)
    water["totalinput"] = water["withdrawal"] + water["consumption"]
    water_input = water.get("totalinput", 0) or 0
    water["recycle_pct"] = round((water.get("recycled", 0) / water_input * 100) if water_input else 0, 2)
    hazardous_waste = environment_detail.get("hazardous_waste", {})
    non_hazardous_waste = environment_detail.get("non_hazardous_waste", {})
    waste = {
        "generated": round(hazardous_waste.get("generated", 0) + non_hazardous_waste.get("generated", 0), 2),
        "disposal": round(hazardous_waste.get("disposed", 0) + non_hazardous_waste.get("disposed", 0), 2),
        "recovered": round(hazardous_waste.get("recovered", 0) + non_hazardous_waste.get("recovered", 0), 2),
    }
    waste["recovery_pct"] = round((waste["recovered"] / waste["generated"] * 100) if waste["generated"] else 0, 2)
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
    return {"filters": filters, "current": current, "previous": previous, "kpis": kpis, "energy": energy, "water": water, "waste": waste, "operational_kpis": operational, "compliance": compliance_rows, "supplier_assessment": {"suppliers_assessed": len(relationships), "high_risk_suppliers": sum(1 for row in relationships if row.get("overall_score") is not None and row["overall_score"] < 50), "pending_assessments": sum(1 for row in relationships if row.get("invitation_status") not in {"completed", "accepted"})}, "supplier_scores": relationships, "targets": targets, "insights": insights, "monthly_trend": current["period_breakdown"]}


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


def next_run_at(frequency: str) -> str:
    days = {"weekly": 7, "monthly": 30, "quarterly": 90}[frequency]
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


def build_summary_email(schedule_name: str, summary: Dict[str, Any], filters: Dict[str, Any]) -> str:
    scopes = {row["scope"]: row["emissions"] for row in summary["scope_breakdown"]}
    return f"<div style='font-family:Arial,sans-serif;color:#17211d;max-width:640px'><p>Hello,</p><p>Your ESG MIS Report for <strong>{filters['reporting_period_start']} to {filters['reporting_period_end']}</strong> has been generated successfully.</p><h3>Quick Summary</h3><table style='border-collapse:collapse;width:100%'><tr><td>Total Emissions</td><td style='text-align:right'>{summary['total_emissions']:,.2f} {summary['unit']}</td></tr><tr><td>Scope 1</td><td style='text-align:right'>{scopes.get('scope1', 0):,.2f} {summary['unit']}</td></tr><tr><td>Scope 2</td><td style='text-align:right'>{scopes.get('scope2', 0):,.2f} {summary['unit']}</td></tr><tr><td>Scope 3</td><td style='text-align:right'>{scopes.get('scope3', 0):,.2f} {summary['unit']}</td></tr><tr><td>Biogenic</td><td style='text-align:right'>{scopes.get('biogenic', 0):,.2f} {summary['unit']}</td></tr></table><p>Please find the detailed PDF and Excel reports attached.</p><p>Regards,<br/>SustainRepo</p></div>"


async def send_schedule(schedule: Dict[str, Any], current_user: dict) -> Dict[str, Any]:
    summary = await aggregate_emissions(schedule["filters"], current_user)
    sent_at = now_iso()
    executive = await build_executive_mis_report(schedule["filters"], current_user)
    attachments = [("SustainRepo_ESG_MIS_Report.xlsx", build_executive_excel(executive)), ("SustainRepo_ESG_MIS_Report.pdf", build_executive_pdf(executive, "SustainRepo Organization", current_user.get("email")))]
    for recipient_email in schedule["recipient_emails"]:
        success = await send_email_with_attachments(recipient_email, f"ESG MIS Report – {schedule['filters']['reporting_period_end']}", build_summary_email(schedule["name"], summary, schedule["filters"]), attachments)
        delivery = {"id": str(uuid.uuid4()), "schedule_id": schedule["id"], "organization_id": schedule.get("organization_id"), "recipient_email": recipient_email, "status": "sent" if success else "failed", "sent_at": sent_at, "error": None if success else "Resend delivery failed"}
        await db.mis_report_deliveries.insert_one(delivery.copy())
    return {"id": None}


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
                {"$set": {"last_run_at": now_iso(), "next_run_at": next_run_at(schedule["frequency"])}},
            )
            processed += 1
        except Exception:
            await db.mis_report_schedules.update_one(
                {"id": schedule["id"]},
                {"$set": {"next_run_at": next_run_at(schedule["frequency"])}},
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
    def sheet(name, rows):
        ws = workbook.create_sheet(name); ws.append(["SustainRepo ESG MIS Report"]); ws.append([])
        for row in rows: ws.append(row)
        for cell in ws[1]: cell.font = Font(bold=True, color="FFFFFF"); cell.fill = PatternFill("solid", fgColor="166534")
        ws.column_dimensions["A"].width = 34; ws.column_dimensions["B"].width = 22; ws.column_dimensions["C"].width = 22
    sheet("Executive Summary", [["KPI", "Current", "Previous", "Change %"]] + [[k["label"], k["value"], k["previous"], k["change_pct"]] for k in report["kpis"]])
    sheet("Emissions Overview", [["Scope", "tCO2e"]] + [[r["scope"], r["emissions"]] for r in report["current"]["scope_breakdown"]] + [[]] + [["Category", "tCO2e"]] + [[r["category"], r["emissions"]] for r in report["current"]["category_breakdown"]])
    sheet("Facility Performance", [["Facility", "tCO2e"]] + [[r["facility"], r["emissions"]] for r in report["current"]["facility_breakdown"]])
    sheet("Operations", [["Energy", report["energy"].get("total"), "MWh"], ["Renewable share", report["energy"].get("renewable_pct"), "%"], ["Water recycled", report["water"].get("recycled"), "KL"], ["Waste recovered", report["waste"].get("recovered"), ""], ["LTIFR", report["operational_kpis"].get("ltifr"), ""], ["Account payable days", report["operational_kpis"].get("account_payable_days"), "days"]])
    sheet("Suppliers & Targets", [["Supplier", "ESG Score"]] + [[r.get("supplier_name") or r.get("supplier_org_name") or "Supplier", r.get("overall_score")] for r in report.get("supplier_scores", [])] + [[]] + [["Target", "Target value", "Current value"]] + [[r.get("name"), r.get("target_value"), r.get("current_value")] for r in report.get("targets", [])])
    buffer = io.BytesIO(); workbook.save(buffer); return buffer.getvalue()


def build_executive_pdf(report: Dict[str, Any], organization_name: str, generated_by: str) -> bytes:
    from modules.mis_reports.pdf_builder import build_beautiful_executive_pdf
    return build_beautiful_executive_pdf(report, organization_name, generated_by)