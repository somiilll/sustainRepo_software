"""
API Router for Scope 3 Bulk Upload
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from typing import Optional
import io

from .template_generator import generate_scope3_template
from .processors import UploadProcessor
from .report_generator import ReportGenerator
from .models import UploadSummary, UploadStatus

router = APIRouter(prefix="/bulk-upload/scope3", tags=["Bulk Upload - Scope 3"])


def get_db():
    """Dependency to get database connection - will be overridden in main app"""
    raise NotImplementedError("Database dependency must be provided")


def get_current_user():
    """Dependency to get current user - will be overridden in main app"""
    raise NotImplementedError("Auth dependency must be provided")


@router.get("/template/download")
async def download_template(
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Download Scope 3 bulk upload template
    
    Generates an Excel template with:
    - 15 category sheets (C1-C15)
    - Dropdown validations for facilities, methods, activities
    - Color-coded mandatory/optional fields
    - Instructions sheet
    """
    try:
        organization_id = current_user.get("organization_id")
        if not organization_id:
            raise HTTPException(status_code=400, detail="User must belong to an organization")
        
        template_bytes = await generate_scope3_template(db, organization_id)
        
        return StreamingResponse(
            template_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": "attachment; filename=scope3_bulk_upload_template.xlsx"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate template: {str(e)}")


@router.post("/upload", response_model=UploadSummary)
async def upload_file(
    file: UploadFile = File(...),
    allow_partial_success: bool = Query(True, description="Save valid rows even if some fail"),
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload and process Scope 3 bulk upload file
    
    Validates all rows and calculates emissions.
    Returns detailed validation errors and warnings.
    
    Args:
        file: Excel file with Scope 3 data
        allow_partial_success: If True, save valid rows even if some fail
        
    Returns:
        UploadSummary with processing results
    """
    # Validate file type
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="File must be an Excel file (.xlsx or .xls)")
    
    # Check file size (max 10MB)
    file_content = await file.read()
    if len(file_content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 10MB limit")
    
    organization_id = current_user.get("organization_id")
    if not organization_id:
        raise HTTPException(status_code=400, detail="User must belong to an organization")
    
    user_id = current_user.get("id") or current_user.get("user_id")
    
    try:
        processor = UploadProcessor(db, organization_id, user_id)
        summary = await processor.process_upload(
            file_content, 
            file.filename,
            allow_partial_success
        )
        
        return summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload processing failed: {str(e)}")


@router.get("/jobs/{job_id}")
async def get_job_status(
    job_id: str,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get status of a bulk upload job
    """
    organization_id = current_user.get("organization_id")
    
    job = await db.bulk_upload_jobs.find_one(
        {"id": job_id, "organization_id": organization_id},
        {"_id": 0}
    )
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return job


@router.get("/jobs/{job_id}/errors/download")
async def download_error_report(
    job_id: str,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Download error report for a bulk upload job
    """
    organization_id = current_user.get("organization_id")
    
    # Get job
    job = await db.bulk_upload_jobs.find_one(
        {"id": job_id, "organization_id": organization_id},
        {"_id": 0}
    )
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Get errors
    errors = await db.bulk_upload_errors.find(
        {"job_id": job_id},
        {"_id": 0}
    ).to_list(10000)
    
    # Build summary
    from .models import ValidationError, ErrorSeverity
    
    error_objects = [
        ValidationError(
            sheet=e.get("sheet", ""),
            row=e.get("row", 0),
            column=e.get("column"),
            error_type=e.get("error_type", ""),
            message=e.get("message", ""),
            suggestion=e.get("suggestion"),
            severity=ErrorSeverity(e.get("severity", "error"))
        )
        for e in errors
    ]
    
    summary = UploadSummary(
        job_id=job_id,
        status=UploadStatus(job.get("status", "completed")),
        total_rows=job.get("total_rows", 0),
        success_count=job.get("success_count", 0),
        error_count=job.get("error_count", 0),
        warning_count=job.get("warning_count", 0),
        categories_processed=job.get("categories_processed", []),
        total_emissions_tco2e=job.get("total_emissions_tco2e", 0),
        errors=error_objects,
        warnings=[]
    )
    
    report_bytes = ReportGenerator.generate_error_report(summary)
    
    return StreamingResponse(
        report_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename=bulk_upload_errors_{job_id[:8]}.xlsx"
        }
    )


@router.get("/jobs/{job_id}/results/download")
async def download_results_report(
    job_id: str,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Download results report for a bulk upload job
    """
    organization_id = current_user.get("organization_id")
    
    # Get job
    job = await db.bulk_upload_jobs.find_one(
        {"id": job_id, "organization_id": organization_id},
        {"_id": 0}
    )
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Get created emissions
    emission_ids = job.get("created_emission_ids", [])
    emissions = []
    
    if emission_ids:
        emissions = await db.emissions.find(
            {"id": {"$in": emission_ids}},
            {"_id": 0, "id": 1, "category": 1, "facility_name": 1, 
             "reporting_period": 1, "calculation_method_scope3": 1,
             "scope3_activity": 1, "co2e_emissions": 1}
        ).to_list(10000)
    
    summary = UploadSummary(
        job_id=job_id,
        status=UploadStatus(job.get("status", "completed")),
        total_rows=job.get("total_rows", 0),
        success_count=job.get("success_count", 0),
        error_count=job.get("error_count", 0),
        categories_processed=job.get("categories_processed", []),
        total_emissions_tco2e=job.get("total_emissions_tco2e", 0)
    )
    
    report_bytes = ReportGenerator.generate_results_report(summary, emissions)
    
    return StreamingResponse(
        report_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename=bulk_upload_results_{job_id[:8]}.xlsx"
        }
    )


@router.get("/jobs")
async def list_jobs(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    List bulk upload jobs for the organization
    """
    organization_id = current_user.get("organization_id")
    
    jobs = await db.bulk_upload_jobs.find(
        {"organization_id": organization_id},
        {"_id": 0}
    ).sort("uploaded_at", -1).skip(offset).limit(limit).to_list(limit)
    
    total = await db.bulk_upload_jobs.count_documents({"organization_id": organization_id})
    
    return {
        "jobs": jobs,
        "total": total,
        "limit": limit,
        "offset": offset
    }


@router.delete("/jobs/{job_id}")
async def delete_job(
    job_id: str,
    delete_emissions: bool = Query(False, description="Also delete created emissions"),
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Delete a bulk upload job and optionally its created emissions
    """
    organization_id = current_user.get("organization_id")
    
    # Get job
    job = await db.bulk_upload_jobs.find_one(
        {"id": job_id, "organization_id": organization_id},
        {"_id": 0}
    )
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Delete emissions if requested
    if delete_emissions:
        emission_ids = job.get("created_emission_ids", [])
        if emission_ids:
            await db.emissions.delete_many({"id": {"$in": emission_ids}})
    
    # Delete errors
    await db.bulk_upload_errors.delete_many({"job_id": job_id})
    
    # Delete job
    await db.bulk_upload_jobs.delete_one({"id": job_id})
    
    return {"message": "Job deleted successfully", "emissions_deleted": delete_emissions}
