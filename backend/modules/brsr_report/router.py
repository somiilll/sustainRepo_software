"""
BRSR Report Router

API endpoints for generating BRSR reports in PDF format.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, HTMLResponse
from typing import Optional
from datetime import datetime
import io

from modules.auth.dependencies import get_current_user
from modules.esg_questionnaire.service import esg_questionnaire_service
from shared.database.mongo import db
from .templates import BRSRHTMLTemplate
from .service import BRSRReportService

router = APIRouter(prefix="/brsr-report", tags=["BRSR Report"])


async def get_organization(org_id: str) -> dict:
    """Helper to get organization from database."""
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    return org or {}


@router.get("/generate/{reporting_period}")
async def generate_brsr_report(
    reporting_period: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Generates a BRSR report PDF for the specified reporting period.
    
    Uses Playwright/Chromium to render HTML to PDF for pixel-perfect
    replication of the SEBI Annexure II format.
    """
    org_id = current_user.get('organization_id')
    if not org_id:
        raise HTTPException(status_code=400, detail="User not associated with an organization")
    
    try:
        # Get organization details
        organization = await get_organization(org_id)
        
        # Get Section A data
        section_a_result = await esg_questionnaire_service.get_responses(
            org_id=org_id,
            framework='BRSR',
            section='section_a',
            reporting_year=reporting_period
        )
        section_a_data = section_a_result.get('responses', {}) if section_a_result else {}
        
        # Get Section B configs and data
        section_b_configs = await esg_questionnaire_service.list_question_configs(
            framework='BRSR',
            section='section_b'
        )
        section_b_result = await esg_questionnaire_service.get_responses(
            org_id=org_id,
            framework='BRSR',
            section='section_b',
            reporting_year=reporting_period
        )
        section_b_data = section_b_result.get('responses', {}) if section_b_result else {}
        
        # Get Section C configs and data
        section_c_configs = await esg_questionnaire_service.list_question_configs(
            framework='BRSR',
            section='section_c'
        )
        section_c_result = await esg_questionnaire_service.get_responses(
            org_id=org_id,
            framework='BRSR',
            section='section_c',
            reporting_year=reporting_period
        )
        section_c_data = section_c_result.get('responses', {}) if section_c_result else {}
        
        # Create HTML template
        template = BRSRHTMLTemplate(
            organization=organization,
            reporting_period=reporting_period,
            section_a_data=section_a_data,
            section_b_data=section_b_data,
            section_b_configs=section_b_configs if isinstance(section_b_configs, list) else [],
            section_c_data=section_c_data,
            section_c_configs=section_c_configs if isinstance(section_c_configs, list) else [],
        )
        
        # Render HTML
        html_content = template.render()
        
        # Generate PDF using Playwright
        pdf_bytes = await BRSRReportService.generate_pdf(html_content)
        
        # Create filename
        org_name = organization.get('name', 'Organization').replace(' ', '_').replace('/', '-')
        period_safe = reporting_period.replace(' ', '_').replace('/', '-')
        filename = f"BRSR_Report_{org_name}_{period_safe}.pdf"
        
        # Return as streaming response
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            }
        )
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to generate BRSR report: {str(e)}")


@router.get("/preview/{reporting_period}")
async def preview_brsr_html(
    reporting_period: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Returns the HTML preview of the BRSR report (for debugging/development).
    """
    org_id = current_user.get('organization_id')
    if not org_id:
        raise HTTPException(status_code=400, detail="User not associated with an organization")
    
    try:
        # Get organization details
        organization = await get_organization(org_id)
        
        # Get Section A data
        section_a_result = await esg_questionnaire_service.get_responses(
            org_id=org_id,
            framework='BRSR',
            section='section_a',
            reporting_year=reporting_period
        )
        section_a_data = section_a_result.get('responses', {}) if section_a_result else {}
        
        # Get Section B configs and data
        section_b_configs = await esg_questionnaire_service.list_question_configs(
            framework='BRSR',
            section='section_b'
        )
        section_b_result = await esg_questionnaire_service.get_responses(
            org_id=org_id,
            framework='BRSR',
            section='section_b',
            reporting_year=reporting_period
        )
        section_b_data = section_b_result.get('responses', {}) if section_b_result else {}
        
        # Get Section C configs and data
        section_c_configs = await esg_questionnaire_service.list_question_configs(
            framework='BRSR',
            section='section_c'
        )
        section_c_result = await esg_questionnaire_service.get_responses(
            org_id=org_id,
            framework='BRSR',
            section='section_c',
            reporting_year=reporting_period
        )
        section_c_data = section_c_result.get('responses', {}) if section_c_result else {}
        
        # Create HTML template
        template = BRSRHTMLTemplate(
            organization=organization,
            reporting_period=reporting_period,
            section_a_data=section_a_data,
            section_b_data=section_b_data,
            section_b_configs=section_b_configs if isinstance(section_b_configs, list) else [],
            section_c_data=section_c_data,
            section_c_configs=section_c_configs if isinstance(section_c_configs, list) else [],
        )
        
        # Return HTML
        return HTMLResponse(content=template.render())
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to generate preview: {str(e)}")
