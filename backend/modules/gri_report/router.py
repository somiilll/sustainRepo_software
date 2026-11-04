"""GRI report generation (PDF + Word) with immutable versions, mirroring the BRSR report."""
import io
import traceback

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from modules.auth.dependencies import get_current_user
from modules.brsr_report import version_service
from modules.brsr_report.docx_builder import html_to_docx
from modules.brsr_report.service import BRSRReportService
from modules.brsr_report.version_service import CONTENT_TYPES
from modules.esg_questionnaire.gri_live_emissions import sync_gri_live_values
from modules.esg_questionnaire.service import esg_questionnaire_service
from modules.framework_links.service import sync_linked_values
from shared.database.mongo import db
from .templates import build_gri_html

router = APIRouter(prefix="/gri-report", tags=["GRI Report"])
SECTIONS = ("general", "environment", "social", "governance")
FORMAT = Query("pdf", pattern="^(pdf|docx)$")


def _org_id(current_user: dict) -> str:
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="User not associated with an organization")
    return org_id


def _require_admin(current_user: dict) -> str:
    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only admins can view GRI report versions")
    return _org_id(current_user)


@router.post("/generate/{reporting_period}")
async def generate_gri_report(reporting_period: str, format: str = FORMAT, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only admins can generate GRI reports")
    org_id = _org_id(current_user)
    try:
        await sync_gri_live_values(org_id, reporting_period, triggered_by=current_user.get("id"))
        await sync_linked_values(org_id, reporting_period, triggered_by=current_user.get("id"))
        organization = await db.organizations.find_one({"id": org_id}, {"_id": 0}) or {}
        questions = []
        for section in SECTIONS:
            result = await esg_questionnaire_service.get_gri_disclosures(
                org_id=org_id, section=section, reporting_period=reporting_period, filter_by_assignment=False, filter_by_materiality=True)
            questions += result["questions"]
        html_content = build_gri_html(organization, reporting_period, questions)
        pdf_bytes = await BRSRReportService.generate_pdf(html_content)
        docx_bytes = html_to_docx(html_content)
        answers = {q["question_key"]: q.get("response_value") if not q.get("sub_questions")
                   else {s["sub_key"]: s.get("response_value") for s in q["sub_questions"]} for q in questions}
        org_name = (organization.get("name") or "Organization").replace(" ", "_").replace("/", "-")
        period_safe = reporting_period.replace(" ", "_").replace("/", "-")
        saved = await version_service.create_version(
            org_id, reporting_period, current_user, organization, {"gri": answers},
            {"pdf": pdf_bytes, "docx": docx_bytes}, f"GRI_Report_{org_name}_{period_safe}", framework="GRI")
        return StreamingResponse(
            io.BytesIO(pdf_bytes if format == "pdf" else docx_bytes), media_type=CONTENT_TYPES[format],
            headers={"Content-Disposition": f'attachment; filename="{saved["filenames"][format]}"'})
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to generate GRI report: {exc}")


@router.get("/versions/{reporting_period}")
async def list_gri_report_versions(reporting_period: str, current_user: dict = Depends(get_current_user)):
    org_id = _require_admin(current_user)
    return {"reporting_period": reporting_period, "versions": await version_service.list_versions(org_id, reporting_period, "GRI")}


@router.get("/versions/{reporting_period}/{version}/download")
async def download_gri_report_version(reporting_period: str, version: int, format: str = FORMAT, current_user: dict = Depends(get_current_user)):
    org_id = _require_admin(current_user)
    try:
        stored = await version_service.load_version_file(org_id, reporting_period, version, format, "GRI")
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    if not stored:
        raise HTTPException(status_code=404, detail="Report version not found")
    content, filename = stored
    return StreamingResponse(io.BytesIO(content), media_type=CONTENT_TYPES[format], headers={"Content-Disposition": f'attachment; filename="{filename}"'})
