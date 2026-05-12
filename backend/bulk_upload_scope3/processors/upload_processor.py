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


# Sheets to ignore (instruction sheets, reference sheets, etc.)
IGNORED_SHEET_PATTERNS = [
    "instruction", "instructions", "reference", "ref", "help", "guide",
    "dropdown", "dropdowns", "lookup", "lookups", "list", "lists",
    "readme", "read me", "info", "about"
]


class UploadProcessor:
    """Main processor for bulk upload files"""
    
    def __init__(self, db, organization_id: str, user_id: str):
        self.db = db
        self.organization_id = organization_id
        self.user_id = user_id
        self.row_processor = RowProcessor(db, organization_id, user_id)
    
    def _should_skip_sheet(self, sheet_name: str) -> bool:
        """Check if a sheet should be skipped (instruction/reference sheets)"""
        sheet_lower = sheet_name.lower().strip()
        
        # Skip hidden sheets (starting with _)
        if sheet_lower.startswith("_"):
            return True
        
        # Skip sheets matching ignored patterns
        for pattern in IGNORED_SHEET_PATTERNS:
            if pattern in sheet_lower:
                return True
        
        # Skip sheets that don't start with C1-C15
        # This handles any sheets after C15 like "Instructions", etc.
        is_category_sheet = any(sheet_lower.startswith(f"c{i}") for i in range(1, 16))
        if not is_category_sheet:
            # Check if it matches the configured sheet names
            for code, config in CATEGORY_COLUMNS.items():
                if config["sheet_name"].lower() == sheet_lower:
                    return False
            # Not a recognized category sheet
            return True
        
        return False
    
    async def process_upload(self, file_content: bytes, filename: str,
                              validate_only: bool = True) -> UploadSummary:
        """
        Process an uploaded Excel file.
        
        Args:
            file_content: Raw bytes of the Excel file
            filename: Original filename
            validate_only: If True, only validate without saving (default: True)
            
        Returns:
            UploadSummary with results (records not saved when validate_only=True)
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
            allow_partial_success=not validate_only
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
            skipped_sheets = []
            
            # Process each sheet
            for sheet_name in workbook.sheetnames:
                # Skip helper and instruction sheets
                if self._should_skip_sheet(sheet_name):
                    skipped_sheets.append(sheet_name)
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
                        suggestion="Use sheet names like 'C1-PurchasedGoods' or 'C1 - Purchased Goods'",
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
            
            if error_count == 0 and success_count > 0:
                status = UploadStatus.COMPLETED
            elif success_count == 0:
                status = UploadStatus.FAILED
            else:
                status = UploadStatus.PARTIAL_SUCCESS
            
            # Handle saving based on validate_only flag
            created_ids = []
            valid_records = [r for r in all_emission_records if r is not None]
            
            if validate_only and valid_records:
                # Store pending records for later save
                for record in valid_records:
                    record["job_id"] = job_id  # Add job_id for retrieval
                await self.db.bulk_upload_pending_records.insert_many(valid_records)
            elif not validate_only and status in [UploadStatus.COMPLETED, UploadStatus.PARTIAL_SUCCESS] and valid_records:
                # Save immediately
                await self.db.emissions.insert_many(valid_records)
                created_ids = [r["id"] for r in valid_records]
            
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
                    "created_emission_ids": created_ids,
                    "validate_only": validate_only,
                    "skipped_sheets": skipped_sheets
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
    
    async def save_valid_rows(self, job_id: str) -> Dict:
        """
        Save valid rows from a previously validated upload job.
        
        Args:
            job_id: The job ID from validation
            
        Returns:
            Dict with save results
        """
        # Get job
        job = await self.db.bulk_upload_jobs.find_one(
            {"id": job_id, "organization_id": self.organization_id},
            {"_id": 0}
        )
        
        if not job:
            return {"success": False, "error": "Job not found"}
        
        if job.get("created_emission_ids"):
            return {"success": False, "error": "Records already saved for this job"}
        
        # Get valid results from the job
        # Note: We need to re-process or store pending records during validation
        # For now, return that we need to re-upload
        return {
            "success": False, 
            "error": "Please re-upload the file with save option enabled",
            "job_id": job_id
        }
    
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
