"""
Upload Processor for Scope 3 Bulk Upload
Main orchestrator for processing uploaded Excel files
"""
import io
import uuid
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime, timezone
from openpyxl import load_workbook

from ..models import (
    ValidationError, ErrorSeverity, RowResult, UploadSummary, UploadStatus,
    BulkUploadJob, CATEGORY_COLUMNS
)
from .row_processor import RowProcessor


class UploadProcessor:
    """Main processor for bulk upload files"""
    
    def __init__(self, db, organization_id: str, user_id: str):
        self.db = db
        self.organization_id = organization_id
        self.user_id = user_id
        self.row_processor = RowProcessor(db, organization_id, user_id)
    
    async def process_upload(self, file_content: bytes, filename: str,
                              allow_partial_success: bool = True) -> UploadSummary:
        """
        Process an uploaded Excel file
        
        Args:
            file_content: Raw bytes of the Excel file
            filename: Original filename
            allow_partial_success: If True, save valid rows even if some fail
            
        Returns:
            UploadSummary with results
        """
        job_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        # Create job record
        job = BulkUploadJob(
            id=job_id,
            organization_id=self.organization_id,
            uploaded_by=self.user_id,
            uploaded_at=now,
            filename=filename,
            status=UploadStatus.PROCESSING,
            allow_partial_success=allow_partial_success
        )
        
        await self.db.bulk_upload_jobs.insert_one(job.dict())
        
        try:
            # Load workbook
            workbook = load_workbook(io.BytesIO(file_content), read_only=True, data_only=True)
            
            all_results: List[RowResult] = []
            all_errors: List[ValidationError] = []
            all_warnings: List[ValidationError] = []
            all_emission_records: List[Dict] = []
            categories_processed = set()
            total_co2e = 0.0
            
            # Process each sheet
            for sheet_name in workbook.sheetnames:
                # Skip helper and instruction sheets
                if sheet_name.startswith("_") or sheet_name.lower() == "instructions":
                    continue
                
                # Detect category from sheet name
                category_code = self._detect_category(sheet_name)
                if not category_code:
                    all_warnings.append(ValidationError(
                        sheet=sheet_name,
                        row=0,
                        column=None,
                        error_type="UNKNOWN_SHEET",
                        message=f"Sheet '{sheet_name}' does not match any Scope 3 category",
                        suggestion="Use sheet names like 'C1 - Purchased Goods...'",
                        severity=ErrorSeverity.WARNING
                    ))
                    continue
                
                categories_processed.add(category_code)
                
                # Process sheet
                sheet = workbook[sheet_name]
                sheet_results, sheet_records = await self._process_sheet(
                    sheet, category_code, sheet_name, job_id
                )
                
                all_results.extend(sheet_results)
                all_emission_records.extend(sheet_records)
                
                for result in sheet_results:
                    all_errors.extend(result.errors)
                    all_warnings.extend(result.warnings)
                    if result.co2e:
                        total_co2e += result.co2e
            
            workbook.close()
            
            # Determine final status
            success_count = sum(1 for r in all_results if r.success)
            error_count = sum(1 for r in all_results if not r.success)
            
            if error_count == 0:
                status = UploadStatus.COMPLETED
            elif success_count == 0:
                status = UploadStatus.FAILED
            elif allow_partial_success:
                status = UploadStatus.PARTIAL_SUCCESS
            else:
                status = UploadStatus.FAILED
            
            # Save emission records if allowed
            created_ids = []
            if status in [UploadStatus.COMPLETED, UploadStatus.PARTIAL_SUCCESS] and all_emission_records:
                if allow_partial_success or error_count == 0:
                    # Insert records
                    if all_emission_records:
                        result = await self.db.emissions.insert_many(all_emission_records)
                        created_ids = [r["id"] for r in all_emission_records]
            
            # Update job record
            await self.db.bulk_upload_jobs.update_one(
                {"id": job_id},
                {"$set": {
                    "status": status.value,
                    "total_rows": len(all_results),
                    "success_count": success_count,
                    "error_count": error_count,
                    "warning_count": len(all_warnings),
                    "categories_processed": list(categories_processed),
                    "total_emissions_tco2e": total_co2e,
                    "created_emission_ids": created_ids
                }}
            )
            
            # Store errors for later retrieval
            if all_errors:
                error_docs = [
                    {
                        "job_id": job_id,
                        "sheet": e.sheet,
                        "row": e.row,
                        "column": e.column,
                        "error_type": e.error_type,
                        "message": e.message,
                        "suggestion": e.suggestion,
                        "severity": e.severity.value
                    }
                    for e in all_errors
                ]
                await self.db.bulk_upload_errors.insert_many(error_docs)
            
            return UploadSummary(
                job_id=job_id,
                status=status,
                total_rows=len(all_results),
                success_count=success_count,
                error_count=error_count,
                warning_count=len(all_warnings),
                categories_processed=list(categories_processed),
                total_emissions_tco2e=total_co2e,
                errors=all_errors[:100],  # Limit errors in response
                warnings=all_warnings[:50],
                results=all_results[:200],
                created_emission_ids=created_ids
            )
            
        except Exception as e:
            # Update job as failed
            await self.db.bulk_upload_jobs.update_one(
                {"id": job_id},
                {"$set": {
                    "status": UploadStatus.FAILED.value,
                    "error_message": str(e)
                }}
            )
            
            return UploadSummary(
                job_id=job_id,
                status=UploadStatus.FAILED,
                errors=[ValidationError(
                    sheet="System",
                    row=0,
                    error_type="SYSTEM_ERROR",
                    message=f"Failed to process file: {str(e)}",
                    severity=ErrorSeverity.ERROR
                )]
            )
    
    def _detect_category(self, sheet_name: str) -> Optional[str]:
        """Detect category code from sheet name"""
        sheet_lower = sheet_name.lower().strip()
        
        # Direct match with config sheet names
        for code, config in CATEGORY_COLUMNS.items():
            if config["sheet_name"].lower() == sheet_lower:
                return code
        
        # Pattern matching (C1, C2, etc.)
        for code in CATEGORY_COLUMNS.keys():
            if sheet_lower.startswith(code.lower()):
                return code
        
        return None
    
    async def _process_sheet(self, sheet, category_code: str, 
                              sheet_name: str, job_id: str) -> Tuple[List[RowResult], List[Dict]]:
        """
        Process a single sheet
        
        Returns:
            Tuple of (row_results, emission_records)
        """
        config = CATEGORY_COLUMNS.get(category_code, {})
        columns = config.get("columns", [])
        
        # Build column mapping from header row
        header_row = list(sheet.iter_rows(min_row=1, max_row=1, values_only=True))[0]
        col_mapping = {}
        
        for col_idx, header_value in enumerate(header_row):
            if header_value:
                header_clean = str(header_value).strip()
                # Find matching column config
                for col_config in columns:
                    if col_config["name"].lower() == header_clean.lower():
                        col_mapping[col_idx] = col_config["key"]
                        break
        
        # Process data rows
        results: List[RowResult] = []
        emission_records: List[Dict] = []
        existing_keys = set()
        
        # For C7, collect all rows first for aggregation
        if category_code == "C7":
            c7_rows = []
            for row_idx, row in enumerate(sheet.iter_rows(min_row=2, values_only=True), start=2):
                row_data = self._row_to_dict(row, col_mapping)
                if any(v for v in row_data.values() if v):  # Skip empty rows
                    c7_rows.append((row_idx, row_data))
            
            if c7_rows:
                results, emission_records = await self.row_processor.process_c7_rows(
                    c7_rows, category_code, job_id
                )
            
            return results, emission_records
        
        # Regular processing for other categories
        for row_idx, row in enumerate(sheet.iter_rows(min_row=2, values_only=True), start=2):
            row_data = self._row_to_dict(row, col_mapping)
            
            # Skip empty rows
            if not any(v for v in row_data.values() if v):
                continue
            
            result = await self.row_processor.process_row(
                row_data, category_code, row_idx, existing_keys, job_id
            )
            
            if isinstance(result, tuple):
                row_result, emission_record = result
                results.append(row_result)
                if row_result.success:
                    emission_records.append(emission_record)
            else:
                results.append(result)
        
        return results, emission_records
    
    def _row_to_dict(self, row: tuple, col_mapping: Dict[int, str]) -> Dict[str, Any]:
        """Convert a row tuple to a dictionary using column mapping"""
        result = {}
        for col_idx, key in col_mapping.items():
            if col_idx < len(row):
                value = row[col_idx]
                # Clean string values
                if isinstance(value, str):
                    value = value.strip()
                result[key] = value
        return result
