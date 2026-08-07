"""MIS Reports V1 foundation endpoints."""
from typing import Any, Dict, List, Optional

import io
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from modules.auth.dependencies import get_current_user
from modules.mis_reports.contracts import (
    MISReportCatalogResponse,
    MISDeliveryResponse,
    MISScheduleCreate,
    MISScheduleResponse,
    MISScheduleUpdate,
    EmissionsSummaryRequest,
    EmissionsSummaryResponse,
    MISReportFilterSchemaResponse,
    MISReportHistoryResponse,
)
from shared.database.mongo import db
from modules.mis_reports.service import aggregate_emissions, build_excel, build_pdf, next_run_at, now_iso, save_report_run, send_schedule


router = APIRouter()


def build_mis_report_templates(has_ghg: bool, has_esg: bool) -> List[Dict[str, Any]]:
    """Return the fixed V1 catalog while later phases add report builders."""
    return [
        {"id": "emissions_summary", "name": "Emissions Summary", "description": "Scope, category, facility, and reporting-period roll-up.", "category": "GHG", "status": "ready" if has_ghg else "unavailable", "available": has_ghg, "action_label": "Open report" if has_ghg else None, "required_modules": ["GHG"]},
        {"id": "kpi_progress", "name": "KPI Progress", "description": "ESG metric completion and target progress across reporting periods.", "category": "ESG", "status": "planned" if has_esg else "unavailable", "available": False, "action_label": None, "required_modules": ["ESG"]},
        {"id": "workflow_status", "name": "Workflow Status", "description": "Submission, review, and approval status by owner and framework.", "category": "ESG", "status": "planned" if has_esg else "unavailable", "available": False, "action_label": None, "required_modules": ["ESG"]},
        {"id": "evidence_readiness", "name": "Evidence Readiness", "description": "Evidence coverage and data-readiness view for internal reviews.", "category": "Data quality", "status": "planned", "available": False, "action_label": None, "required_modules": ["ESG"]},
    ]


async def get_mis_reporting_context(current_user: dict) -> tuple[Optional[dict], bool]:
    """Resolve organization report access without exposing another organization's data."""
    if current_user.get("role") == "super_admin":
        return None, True

    organization_id = current_user.get("organization_id")
    if not organization_id:
        return None, False

    organization = await db.organizations.find_one(
        {"id": organization_id},
        {"_id": 0, "name": 1, "has_ghg": 1, "has_esg": 1, "module_access": 1},
    )
    if not organization:
        return None, False

    module_access = organization.get("module_access") or {}
    mis_reports_enabled = module_access.get("mis_reports", module_access.get("reports", True))
    return organization, current_user.get("role") == "admin" and mis_reports_enabled


@router.get("/mis-reports/catalog", response_model=MISReportCatalogResponse)
async def get_mis_report_catalog(current_user: dict = Depends(get_current_user)):
    """Expose the V1 MIS report catalog with permission-aware availability."""
    organization, can_generate_reports = await get_mis_reporting_context(current_user)
    has_ghg = True if organization is None else organization.get("has_ghg", True)
    has_esg = True if organization is None else organization.get("has_esg", True)
    templates = build_mis_report_templates(has_ghg, has_esg)

    if not can_generate_reports:
        for template in templates:
            template["available"] = False
            template["action_label"] = None

    return {"can_generate_reports": can_generate_reports, "organization_name": organization.get("name") if organization else None, "templates": templates}


@router.get("/mis-reports/filter-schema", response_model=MISReportFilterSchemaResponse)
async def get_mis_report_filter_schema(current_user: dict = Depends(get_current_user)):
    """Provide common report filters so new V1 reports share the same inputs."""
    organization, can_generate_reports = await get_mis_reporting_context(current_user)
    if not can_generate_reports:
        raise HTTPException(status_code=403, detail="MIS Reports are only accessible to admins")

    facility_query = {"is_active": {"$ne": False}}
    if organization:
        facility_query["organization_id"] = current_user.get("organization_id")

    facilities = await db.facilities.find(facility_query, {"_id": 0, "id": 1, "name": 1}).sort("name", 1).to_list(1000)
    categories = await db.emission_records.distinct("category", {"facility_id": {"$in": [facility["id"] for facility in facilities]}})
    return {"reporting_period_format": "YYYY-MM", "supports_financial_year": True, "supports_calendar_year": True, "facilities": facilities, "available_scopes": ["scope1", "scope2", "scope3", "biogenic"], "categories": sorted(category for category in categories if category)}


@router.get("/mis-reports/history", response_model=MISReportHistoryResponse)
async def get_mis_report_history(current_user: dict = Depends(get_current_user)):
    """Return persisted MIS report runs for the current organization."""
    organization, can_generate_reports = await get_mis_reporting_context(current_user)
    if not can_generate_reports:
        raise HTTPException(status_code=403, detail="MIS Reports are only accessible to admins")

    query = {} if organization is None else {"organization_id": current_user.get("organization_id")}
    history = await db.mis_report_history.find(query, {"_id": 0}).sort("generated_at", -1).to_list(20)
    return {"items": history}


async def require_mis_admin(current_user: dict) -> None:
    _, can_generate_reports = await get_mis_reporting_context(current_user)
    if not can_generate_reports:
        raise HTTPException(status_code=403, detail="MIS Reports are only accessible to admins")


@router.post("/mis-reports/emissions-summary", response_model=EmissionsSummaryResponse)
async def generate_emissions_summary(request: EmissionsSummaryRequest, current_user: dict = Depends(get_current_user)):
    await require_mis_admin(current_user)
    filters = request.model_dump()
    summary = await aggregate_emissions(filters, current_user)
    run = await save_report_run(filters, summary, current_user)
    return {"run_id": run["id"], "generated_at": run["generated_at"], "filters": filters, **summary}


@router.post("/mis-reports/emissions-summary/export/{output_format}")
async def export_emissions_summary(output_format: str, request: EmissionsSummaryRequest, current_user: dict = Depends(get_current_user)):
    await require_mis_admin(current_user)
    if output_format not in {"xlsx", "pdf"}:
        raise HTTPException(status_code=400, detail="Export format must be xlsx or pdf")
    summary = await aggregate_emissions(request.model_dump(), current_user)
    report_bytes = build_excel(summary) if output_format == "xlsx" else build_pdf(summary)
    media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" if output_format == "xlsx" else "application/pdf"
    filename = f"MIS_Emissions_Summary_{request.reporting_period_start}_{request.reporting_period_end}.{output_format}"
    return StreamingResponse(io.BytesIO(report_bytes), media_type=media_type, headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.get("/mis-reports/schedules", response_model=List[MISScheduleResponse])
async def list_mis_schedules(current_user: dict = Depends(get_current_user)):
    await require_mis_admin(current_user)
    query = {} if current_user.get("role") == "super_admin" else {"organization_id": current_user.get("organization_id")}
    return await db.mis_report_schedules.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)


@router.post("/mis-reports/schedules", response_model=MISScheduleResponse)
async def create_mis_schedule(request: MISScheduleCreate, current_user: dict = Depends(get_current_user)):
    await require_mis_admin(current_user)
    schedule = {"id": str(uuid.uuid4()), "organization_id": current_user.get("organization_id"), "created_by_email": current_user.get("email"), "name": request.name, "frequency": request.frequency, "recipient_emails": [str(email) for email in request.recipient_emails], "filters": request.filters.model_dump(), "is_enabled": request.is_enabled, "next_run_at": next_run_at(request.frequency) if request.is_enabled else None, "last_run_at": None, "created_at": now_iso()}
    await db.mis_report_schedules.insert_one(schedule.copy())
    return schedule


@router.patch("/mis-reports/schedules/{schedule_id}", response_model=MISScheduleResponse)
async def update_mis_schedule(schedule_id: str, request: MISScheduleUpdate, current_user: dict = Depends(get_current_user)):
    await require_mis_admin(current_user)
    query = {"id": schedule_id} if current_user.get("role") == "super_admin" else {"id": schedule_id, "organization_id": current_user.get("organization_id")}
    schedule = await db.mis_report_schedules.find_one(query, {"_id": 0})
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    updates = request.model_dump(exclude_none=True)
    if "recipient_emails" in updates: updates["recipient_emails"] = [str(email) for email in updates["recipient_emails"]]
    if "filters" in updates: updates["filters"] = request.filters.model_dump() if request.filters else schedule["filters"]
    frequency = updates.get("frequency", schedule["frequency"])
    if updates.get("is_enabled") is True and not schedule.get("is_enabled"):
        updates["next_run_at"] = next_run_at(frequency)
    if updates.get("is_enabled") is False: updates["next_run_at"] = None
    await db.mis_report_schedules.update_one(query, {"$set": updates})
    return await db.mis_report_schedules.find_one(query, {"_id": 0})


@router.delete("/mis-reports/schedules/{schedule_id}")
async def delete_mis_schedule(schedule_id: str, current_user: dict = Depends(get_current_user)):
    await require_mis_admin(current_user)
    query = {"id": schedule_id} if current_user.get("role") == "super_admin" else {"id": schedule_id, "organization_id": current_user.get("organization_id")}
    result = await db.mis_report_schedules.delete_one(query)
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return {"success": True}


@router.post("/mis-reports/schedules/{schedule_id}/send-now")
async def send_mis_schedule_now(schedule_id: str, current_user: dict = Depends(get_current_user)):
    await require_mis_admin(current_user)
    query = {"id": schedule_id} if current_user.get("role") == "super_admin" else {"id": schedule_id, "organization_id": current_user.get("organization_id")}
    schedule = await db.mis_report_schedules.find_one(query, {"_id": 0})
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    run = await send_schedule(schedule, current_user)
    await db.mis_report_schedules.update_one(query, {"$set": {"last_run_at": now_iso(), "next_run_at": next_run_at(schedule["frequency"])}})
    return {"success": True, "run_id": run["id"]}


@router.get("/mis-reports/deliveries", response_model=List[MISDeliveryResponse])
async def list_mis_deliveries(current_user: dict = Depends(get_current_user)):
    await require_mis_admin(current_user)
    query = {} if current_user.get("role") == "super_admin" else {"organization_id": current_user.get("organization_id")}
    return await db.mis_report_deliveries.find(query, {"_id": 0}).sort("sent_at", -1).to_list(100)