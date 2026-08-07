"""MIS Reports V1 foundation endpoints."""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException

from modules.auth.dependencies import get_current_user
from modules.mis_reports.contracts import (
    MISReportCatalogResponse,
    MISReportFilterSchemaResponse,
    MISReportHistoryResponse,
)
from shared.database.mongo import db


router = APIRouter()


def build_mis_report_templates(has_ghg: bool, has_esg: bool) -> List[Dict[str, Any]]:
    """Return the fixed V1 catalog while later phases add report builders."""
    return [
        {"id": "ghg_inventory", "name": "GHG Inventory", "description": "ISO 14064-1 inventory for selected facilities and periods.", "category": "GHG", "status": "ready" if has_ghg else "unavailable", "available": has_ghg, "action_label": "Configure report" if has_ghg else None, "required_modules": ["GHG"]},
        {"id": "ai_executive_summary", "name": "Executive Emissions Summary", "description": "Decision-ready emissions summary for leadership review.", "category": "GHG", "status": "ready" if has_ghg else "unavailable", "available": has_ghg, "action_label": "Configure report" if has_ghg else None, "required_modules": ["GHG"]},
        {"id": "emissions_summary", "name": "Emissions Summary", "description": "Scope, category, facility, and reporting-period roll-up.", "category": "GHG", "status": "planned", "available": False, "action_label": None, "required_modules": ["GHG"]},
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
    return {"reporting_period_format": "YYYY-MM", "supports_financial_year": True, "supports_calendar_year": True, "facilities": facilities, "available_scopes": ["scope1", "scope2", "scope3", "biogenic"]}


@router.get("/mis-reports/history", response_model=MISReportHistoryResponse)
async def get_mis_report_history(current_user: dict = Depends(get_current_user)):
    """Return persisted MIS report runs; population is introduced in later V1 phases."""
    organization, can_generate_reports = await get_mis_reporting_context(current_user)
    if not can_generate_reports:
        raise HTTPException(status_code=403, detail="MIS Reports are only accessible to admins")

    query = {} if organization is None else {"organization_id": current_user.get("organization_id")}
    history = await db.mis_report_history.find(query, {"_id": 0}).sort("generated_at", -1).to_list(20)
    return {"items": history}