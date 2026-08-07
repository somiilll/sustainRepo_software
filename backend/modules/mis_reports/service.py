"""Shared aggregation, export, history, and delivery helpers for MIS Reports."""
import io
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from dateutil.relativedelta import relativedelta

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from shared.database.mongo import db
from shared.helpers.email import send_email
from modules.esg_records.services.dashboard.dashboard_metrics_service import get_dashboard_metrics_service


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
        facilities = await db.facilities.find({"is_active": {"$ne": False}}, {"_id": 0, "id": 1}).to_list(5000)
    else:
        facilities = await db.facilities.find(
            {"organization_id": current_user.get("organization_id"), "is_active": {"$ne": False}},
            {"_id": 0, "id": 1},
        ).to_list(5000)
    return [facility["id"] for facility in facilities]


async def aggregate_emissions(filters: Dict[str, Any], current_user: dict) -> Dict[str, Any]:
    allowed_facilities = await organization_facility_ids(current_user)
    requested_facilities = filters.get("facility_ids") or allowed_facilities
    facility_ids = [facility_id for facility_id in requested_facilities if facility_id in allowed_facilities]
    scopes = filters.get("scopes") or ALL_SCOPES
    categories = filters.get("categories") or []
    query: Dict[str, Any] = {
        "facility_id": {"$in": facility_ids},
        "scope": {"$in": scopes},
        "reporting_period": {"$gte": filters["reporting_period_start"], "$lte": filters["reporting_period_end"]},
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
        "unit": "kg CO2e",
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
    dashboard = await get_dashboard_metrics_service(db).get_dashboard_metrics(organization_id, facility_ids, start_date=filters["reporting_period_start"], end_date=filters["reporting_period_end"])
    evidence_count = await db.environment_records.count_documents({"org_id": organization_id, "evidence_files.0": {"$exists": True}, "is_current": {"$ne": False}})
    pending = await db.environment_records.count_documents({"org_id": organization_id, "approval_status": "pending_approval", "is_current": {"$ne": False}})
    rejected = await db.environment_records.count_documents({"org_id": organization_id, "approval_status": "rejected", "is_current": {"$ne": False}})
    total_esg_records = dashboard.get("total_records", 0)
    relationships = await db.supplier_relationships.find({"customer_org_id": organization_id}, {"_id": 0, "overall_score": 1, "invitation_status": 1}).to_list(1000)
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
    if pending: actions.append({"type": "Pending approvals", "count": pending, "priority": "medium"})
    if rejected: actions.append({"type": "Rejected entries requiring correction", "count": rejected, "priority": "high"})
    if total_esg_records and evidence_count < total_esg_records: actions.append({"type": "Records without attached evidence", "count": total_esg_records - evidence_count, "priority": "medium"})
    return {"filters": filters, "current": current, "previous": previous, "kpis": kpis, "energy": dashboard.get("energy", {}), "water": dashboard.get("water", {}), "waste": dashboard.get("waste", {}), "data_collection": {"total_records": total_esg_records, "pending_approval": pending, "rejected": rejected}, "actions": actions, "compliance": compliance_rows, "supplier_assessment": {"suppliers_assessed": len(relationships), "high_risk_suppliers": sum(1 for row in relationships if row.get("overall_score") is not None and row["overall_score"] < 50), "pending_assessments": sum(1 for row in relationships if row.get("invitation_status") not in {"completed", "accepted"})}, "data_quality": {"source_records": current["record_count"], "facilities_reporting": len(current["facility_breakdown"]), "evidence_attached": evidence_count}, "insights": insights, "monthly_trend": current["period_breakdown"]}


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
    rows = "".join(f"<tr><td style='padding:8px;border-bottom:1px solid #e5e7eb'>{row['scope']}</td><td style='padding:8px;border-bottom:1px solid #e5e7eb;text-align:right'>{row['emissions']:,.2f}</td></tr>" for row in summary["scope_breakdown"])
    return f"<div style='font-family:Arial,sans-serif;color:#17211d;max-width:640px'><h2 style='margin:0 0 8px'>SustainRepo MIS Report</h2><p style='margin:0 0 18px'>{schedule_name}</p><div style='background:#edf7ef;padding:16px'><strong>Total emissions</strong><div style='font-size:28px;margin-top:4px'>{summary['total_emissions']:,.2f} {summary['unit']}</div><div style='margin-top:6px'>{summary['record_count']} source records · {filters['reporting_period_start']} to {filters['reporting_period_end']}</div></div><h3>Breakdown by scope</h3><table style='width:100%;border-collapse:collapse'><tbody>{rows}</tbody></table></div>"


async def send_schedule(schedule: Dict[str, Any], current_user: dict) -> Dict[str, Any]:
    summary = await aggregate_emissions(schedule["filters"], current_user)
    report_run = await save_report_run(schedule["filters"], summary, current_user, status="emailed")
    sent_at = now_iso()
    for recipient_email in schedule["recipient_emails"]:
        success = await send_email(recipient_email, f"MIS Report: {schedule['name']}", build_summary_email(schedule["name"], summary, schedule["filters"]))
        delivery = {"id": str(uuid.uuid4()), "schedule_id": schedule["id"], "organization_id": schedule.get("organization_id"), "recipient_email": recipient_email, "status": "sent" if success else "failed", "sent_at": sent_at, "error": None if success else "Resend delivery failed"}
        await db.mis_report_deliveries.insert_one(delivery.copy())
    return report_run


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