"""
Bulk Upload Module for GHG Emissions Data - Scope 3 Only
Supports Excel-based bulk upload with validation, error handling, and audit trail.
Aligned with Greenhouse Gas Protocol and ISO 14064.
"""

import io
import uuid
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, Query
from fastapi.responses import StreamingResponse
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from rapidfuzz import fuzz, process


def normalize_string(s: str) -> str:
    """Normalize string for case-insensitive matching."""
    if not s:
        return ""
    normalized = s.lower().strip()
    normalized = re.sub(r'\s+', ' ', normalized)
    return normalized


def find_best_match(value: str, candidates: List[str], threshold: int = 80, use_token_set: bool = False) -> Tuple[Optional[str], int]:
    """Find the best fuzzy match for a value in candidates.
    
    Args:
        value: The value to match
        candidates: List of valid candidates
        threshold: Minimum score (0-100) to accept a match
        use_token_set: If True, use token_set_ratio for better partial matching
                      (e.g., "Purchased Goods" matches "Purchased Goods and Services")
    """
    if not value or not candidates:
        return None, 0
    
    normalized_value = normalize_string(value)
    normalized_candidates = {normalize_string(c): c for c in candidates}
    
    # Exact match after normalization
    if normalized_value in normalized_candidates:
        return normalized_candidates[normalized_value], 100
    
    # Use token_set_ratio for categories (handles subset matching better)
    scorer = fuzz.token_set_ratio if use_token_set else fuzz.ratio
    
    result = process.extractOne(
        normalized_value, 
        list(normalized_candidates.keys()),
        scorer=scorer
    )
    
    if result and result[1] >= threshold:
        return normalized_candidates[result[0]], result[1]
    
    return None, 0


def get_suggestions(value: str, candidates: List[str], limit: int = 3) -> List[str]:
    """Get top suggestions for a misspelled value."""
    if not value or not candidates:
        return []
    
    normalized_value = normalize_string(value)
    normalized_candidates = {normalize_string(c): c for c in candidates}
    
    results = process.extract(
        normalized_value,
        list(normalized_candidates.keys()),
        scorer=fuzz.ratio,
        limit=limit
    )
    
    return [normalized_candidates[r[0]] for r in results if r[1] >= 50]


def create_bulk_upload_router(db, get_current_user, get_admin_user):
    """Create the bulk upload router with database access."""
    
    router = APIRouter(tags=["Bulk Upload"])
    
    # Style definitions
    HEADER_FILL = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
    HEADER_FONT = Font(bold=True, color="FFFFFF", size=11)
    ERROR_FILL = PatternFill(start_color="FFCCCC", end_color="FFCCCC", fill_type="solid")
    VALID_FILL = PatternFill(start_color="CCFFCC", end_color="CCFFCC", fill_type="solid")
    EXAMPLE_FILL = PatternFill(start_color="E8F4FD", end_color="E8F4FD", fill_type="solid")
    THIN_BORDER = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )
    
    async def get_reference_data(org_id: str) -> Dict[str, Any]:
        """Fetch all reference data needed for validation."""
        
        facilities = await db.facilities.find(
            {"organization_id": org_id, "is_active": {"$ne": False}},
            {"_id": 0, "id": 1, "name": 1}
        ).to_list(1000)
        
        scopes = await db.scopes.find(
            {"is_active": {"$ne": False}},
            {"_id": 0, "id": 1, "name": 1, "code": 1}
        ).to_list(100)
        
        categories = await db.emission_categories.find(
            {"is_active": {"$ne": False}},
            {"_id": 0, "id": 1, "name": 1, "scope_id": 1}
        ).to_list(500)
        
        units = await db.units.find(
            {"is_active": {"$ne": False}},
            {"_id": 0, "symbol": 1, "name": 1, "unit_type": 1}
        ).to_list(500)
        
        scope3_ef = await db.scope3_ef.find(
            {},
            {"_id": 0, "id": 1, "activity": 1, "method": 1, "category": 1, "scope": 1, 
             "emission_factor": 1, "unit": 1, "allowed_units": 1}
        ).to_list(1000)
        
        # Get Scope 3 ID
        scope3_id = next((s["id"] for s in scopes if "3" in s["name"]), None)
        
        # Filter out composite/EF units (containing CO2, /, per) - these are output units, not input units
        # Valid input units are: mass (kg, t, g), volume (L, kL, m³), energy (kWh, MJ), distance (km), etc.
        excluded_patterns = ['co2', 'ch4', 'n2o', '/', 'per']
        physical_unit_symbols = [
            u["symbol"] for u in units 
            if not any(p in u["symbol"].lower() for p in excluded_patterns)
        ]
        
        return {
            "facilities": facilities,
            "scopes": scopes,
            "categories": categories,
            "units": units,
            "scope3_ef": scope3_ef,
            "facility_names": [f["name"] for f in facilities],
            "scope_names": [s["name"] for s in scopes],
            "unit_symbols": [u["symbol"] for u in units],
            "physical_unit_symbols": physical_unit_symbols,  # Filtered list for activity_basis matching
            "scope3_id": scope3_id,
        }
    
    @router.get("/bulk-upload/template")
    async def download_scope3_template(current_user: dict = Depends(get_admin_user)):
        """Generate Excel template for Scope 3 emissions."""
        
        org_id = current_user.get("organization_id")
        ref_data = await get_reference_data(org_id)
        
        wb = Workbook()
        ws = wb.active
        ws.title = "Scope 3 Emissions"
        
        # Columns for Scope 3
        columns = [
            ("facility", "Facility Name *"),
            ("reporting_month", "Reporting Month (YYYY-MM) *"),
            ("category", "Category *"),
            ("activity", "Activity *"),
            ("method", "Method *"),
            ("quantity", "Quantity/Spend *"),
            ("quantity_unit", "Unit *"),
            ("emission_factor", "Emission Factor (optional)"),
            ("ef_unit", "EF Unit (if EF provided)"),
            ("evidence_reference", "Evidence Reference"),
            ("notes", "Notes"),
        ]
        
        # Write headers
        for col_idx, (key, label) in enumerate(columns, 1):
            cell = ws.cell(row=1, column=col_idx, value=label)
            cell.fill = HEADER_FILL
            cell.font = HEADER_FONT
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = THIN_BORDER
            ws.column_dimensions[cell.column_letter].width = 18
        
        ws.row_dimensions[1].height = 30
        
        # Facility dropdown
        if ref_data["facility_names"]:
            fac_list = ",".join(ref_data["facility_names"][:100])
            facility_dv = DataValidation(type="list", formula1=f'"{fac_list}"', allow_blank=False)
            ws.add_data_validation(facility_dv)
            facility_dv.add("A2:A1000")
        
        # Method dropdown
        method_dv = DataValidation(type="list", formula1='"spend_basis,activity_basis"', allow_blank=False)
        ws.add_data_validation(method_dv)
        method_dv.add("E2:E1000")
        
        # Scope 3 categories dropdown
        scope3_cats = [c["name"] for c in ref_data["categories"] if c["scope_id"] == ref_data["scope3_id"]]
        if scope3_cats:
            cat_list = ",".join(scope3_cats[:50])
            cat_dv = DataValidation(type="list", formula1=f'"{cat_list}"', allow_blank=False)
            ws.add_data_validation(cat_dv)
            cat_dv.add("C2:C1000")
        
        # Activities from Scope 3 EF
        activities = list(set([ef["activity"] for ef in ref_data["scope3_ef"] if ef.get("activity")]))
        if activities:
            act_list = ",".join(sorted(activities)[:100])
            activity_dv = DataValidation(type="list", formula1=f'"{act_list}"', allow_blank=False)
            ws.add_data_validation(activity_dv)
            activity_dv.add("D2:D1000")
        
        # Example rows - Note: These are examples, users should update with their actual facility names
        # Categories should match seeded Scope 3 categories (e.g., "Purchased Goods and Services")
        examples = [
            ["[Your Facility]", "2024-01", "Purchased Goods and Services", "Steel", "spend_basis", 50000, "INR", "", "", "PO #789", "Q1 supplies"],
            ["[Your Facility]", "2024-02", "Purchased Goods and Services", "Steel", "activity_basis", 100, "t", "", "", "Delivery Note", "Steel delivery"],
        ]
        
        for row_idx, row_data in enumerate(examples, 2):
            for col_idx, value in enumerate(row_data, 1):
                cell = ws.cell(row=row_idx, column=col_idx, value=value)
                cell.border = THIN_BORDER
                cell.fill = EXAMPLE_FILL
        
        # ========== REFERENCE SHEET ==========
        ref_ws = wb.create_sheet("Reference Data")
        
        ref_ws.cell(row=1, column=1, value="Facilities").font = Font(bold=True)
        for idx, f in enumerate(ref_data["facility_names"], 2):
            ref_ws.cell(row=idx, column=1, value=f)
        
        ref_ws.cell(row=1, column=3, value="Scope 3 Categories").font = Font(bold=True)
        for idx, cat in enumerate(scope3_cats, 2):
            ref_ws.cell(row=idx, column=3, value=cat)
        
        ref_ws.cell(row=1, column=5, value="Activities").font = Font(bold=True)
        for idx, act in enumerate(sorted(activities), 2):
            ref_ws.cell(row=idx, column=5, value=act)
        
        ref_ws.cell(row=1, column=7, value="Methods").font = Font(bold=True)
        ref_ws.cell(row=2, column=7, value="spend_basis")
        ref_ws.cell(row=3, column=7, value="activity_basis")
        
        ref_ws.cell(row=1, column=9, value="Currency Units (spend_basis)").font = Font(bold=True)
        currencies = ["INR", "USD", "EUR", "GBP", "JPY", "AUD", "CAD"]
        for idx, curr in enumerate(currencies, 2):
            ref_ws.cell(row=idx, column=9, value=curr)
        
        ref_ws.cell(row=1, column=11, value="Physical Units (activity_basis)").font = Font(bold=True)
        for idx, u in enumerate(ref_data["unit_symbols"][:30], 2):
            ref_ws.cell(row=idx, column=11, value=u)
        
        for col in ['A', 'C', 'E', 'G', 'I', 'K']:
            ref_ws.column_dimensions[col].width = 28
        
        # ========== INSTRUCTIONS SHEET ==========
        instr_ws = wb.create_sheet("Instructions")
        instructions = [
            ("Scope 3 Emissions - Bulk Upload Instructions", True),
            ("", False),
            ("This template is for ACTIVITY-BASED Scope 3 emissions", False),
            ("", False),
            ("Required Columns:", True),
            ("• facility - Must match your organization's facilities", False),
            ("• reporting_month - Format: YYYY-MM (e.g., 2024-01)", False),
            ("• category - Scope 3 category (e.g., Purchased Goods, Business Travel)", False),
            ("• activity - Activity type from Scope 3 EF table", False),
            ("• method - 'spend_basis' or 'activity_basis'", False),
            ("• quantity - Amount spent (for spend_basis) or quantity (for activity_basis)", False),
            ("• quantity_unit - Currency (INR/USD) for spend, physical unit (kg/km) for activity", False),
            ("", False),
            ("Optional Columns:", True),
            ("• emission_factor - Override system EF", False),
            ("• ef_unit - Required if emission_factor is provided", False),
            ("• evidence_reference - Document reference", False),
            ("• notes - Additional notes", False),
            ("", False),
            ("Method Guide:", True),
            ("• spend_basis: Use when you have monetary spend data (e.g., ₹50,000 on office supplies)", False),
            ("• activity_basis: Use when you have activity data (e.g., 5000 km air travel)", False),
            ("", False),
            ("Tips:", True),
            ("• Check 'Reference Data' sheet for valid values", False),
            ("• Emission factors are auto-fetched from Scope 3 EF table based on activity + method", False),
            ("• Delete the example rows (highlighted in blue) before uploading", False),
            ("• Values are matched case-insensitively (e.g., 'business travel' = 'Business Travel')", False),
        ]
        
        for idx, (text, is_bold) in enumerate(instructions, 1):
            cell = instr_ws.cell(row=idx, column=1, value=text)
            if is_bold:
                cell.font = Font(bold=True, size=12)
        instr_ws.column_dimensions['A'].width = 80
        
        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        
        filename = f"GHG_Scope3_Template_{datetime.now().strftime('%Y%m%d')}.xlsx"
        return StreamingResponse(
            buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    
    @router.post("/bulk-upload/validate")
    async def validate_upload(
        file: UploadFile = File(...),
        current_user: dict = Depends(get_admin_user)
    ):
        """Parse and validate uploaded Scope 3 Excel file."""
        
        if not file.filename.endswith('.xlsx'):
            raise HTTPException(status_code=400, detail="Only .xlsx files are supported")
        
        org_id = current_user.get("organization_id")
        upload_id = str(uuid.uuid4())
        
        contents = await file.read()
        
        try:
            wb = load_workbook(io.BytesIO(contents))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid Excel file: {str(e)}")
        
        ws = wb.active
        ref_data = await get_reference_data(org_id)
        
        # Build lookup maps
        facility_map = {normalize_string(f["name"]): f for f in ref_data["facilities"]}
        
        scope3_activities = list(set([ef["activity"] for ef in ref_data["scope3_ef"] if ef.get("activity")]))
        scope3_cats = [c["name"] for c in ref_data["categories"] if c["scope_id"] == ref_data["scope3_id"]]
        
        rows_result = []
        valid_count = 0
        invalid_count = 0
        
        # Column indices for Scope 3 template
        col_indices = {
            "facility": 0, "reporting_month": 1, "category": 2, "activity": 3,
            "method": 4, "quantity": 5, "quantity_unit": 6, "emission_factor": 7,
            "ef_unit": 8, "evidence_reference": 9, "notes": 10
        }
        
        for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), 2):
            if not any(row):
                continue
            
            # Skip example rows
            if row_idx <= 3:
                first_val = str(row[0]).lower() if row[0] else ""
                if "main office" in first_val:
                    continue
            
            errors = []
            matched_data = {"scope": "Scope 3", "scope_id": ref_data["scope3_id"]}
            
            # Extract row data
            row_data = {}
            for key, idx in col_indices.items():
                row_data[key] = row[idx] if idx < len(row) else None
            
            # ========== REQUIRED FIELDS ==========
            required = ["facility", "reporting_month", "category", "activity", "method", "quantity", "quantity_unit"]
            for field in required:
                if not row_data.get(field):
                    errors.append({
                        "column": field,
                        "message": f"Required field '{field}' is missing",
                        "suggestion": "Please provide a value"
                    })
            
            # ========== QUANTITY VALIDATION ==========
            if row_data.get("quantity"):
                try:
                    matched_data["quantity"] = float(row_data["quantity"])
                except (ValueError, TypeError):
                    errors.append({
                        "column": "quantity",
                        "message": "Quantity must be a number",
                        "suggestion": f"Got '{row_data['quantity']}'"
                    })
            
            # ========== REPORTING MONTH FORMAT ==========
            if row_data.get("reporting_month"):
                month_str = str(row_data["reporting_month"])
                if not re.match(r'^\d{4}-\d{2}$', month_str):
                    errors.append({
                        "column": "reporting_month",
                        "message": "Invalid date format",
                        "suggestion": "Use YYYY-MM format (e.g., 2024-01)"
                    })
                else:
                    matched_data["reporting_month"] = month_str
            
            # ========== FACILITY VALIDATION ==========
            if row_data.get("facility"):
                facility_match, _ = find_best_match(str(row_data["facility"]), ref_data["facility_names"])
                if facility_match:
                    matched_data["facility"] = facility_match
                    matched_data["facility_id"] = facility_map[normalize_string(facility_match)]["id"]
                else:
                    suggestions = get_suggestions(str(row_data["facility"]), ref_data["facility_names"])
                    errors.append({
                        "column": "facility",
                        "message": f"Facility '{row_data['facility']}' not found",
                        "suggestion": f"Did you mean: {', '.join(suggestions)}" if suggestions else "Check Reference Data"
                    })
            
            # ========== CATEGORY VALIDATION ==========
            if row_data.get("category"):
                # Use token_set_ratio for categories to handle partial matches like
                # "Purchased Goods" → "Purchased Goods and Services"
                cat_match, _ = find_best_match(str(row_data["category"]), scope3_cats, threshold=75, use_token_set=True)
                if cat_match:
                    matched_data["category"] = cat_match
                else:
                    suggestions = get_suggestions(str(row_data["category"]), scope3_cats)
                    errors.append({
                        "column": "category",
                        "message": f"Category '{row_data['category']}' not found in Scope 3",
                        "suggestion": f"Valid: {', '.join(scope3_cats[:5])}" if scope3_cats else "Add categories in admin"
                    })
            
            # ========== ACTIVITY VALIDATION ==========
            if row_data.get("activity"):
                activity_match, _ = find_best_match(str(row_data["activity"]), scope3_activities)
                if activity_match:
                    matched_data["activity"] = activity_match
                else:
                    suggestions = get_suggestions(str(row_data["activity"]), scope3_activities)
                    errors.append({
                        "column": "activity",
                        "message": f"Activity '{row_data['activity']}' not found in Scope 3 EF table",
                        "suggestion": f"Did you mean: {', '.join(suggestions)}" if suggestions else "Add activities in Scope 3 EF module"
                    })
            
            # ========== METHOD VALIDATION ==========
            if row_data.get("method"):
                method_str = normalize_string(str(row_data["method"]))
                if method_str in ["spend_basis", "spend", "spend-basis", "spendbasis"]:
                    matched_data["method"] = "spend_basis"
                elif method_str in ["activity_basis", "activity", "activity-basis", "activitybasis"]:
                    matched_data["method"] = "activity_basis"
                else:
                    errors.append({
                        "column": "method",
                        "message": f"Invalid method '{row_data['method']}'",
                        "suggestion": "Use 'spend_basis' or 'activity_basis'"
                    })
            
            # ========== UNIT VALIDATION (based on method) ==========
            if row_data.get("quantity_unit") and matched_data.get("method"):
                unit_str = str(row_data["quantity_unit"]).strip()
                currency_units = ["INR", "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CNY", "CHF", "SGD"]
                
                if matched_data["method"] == "spend_basis":
                    # For spend_basis, must be a currency
                    if unit_str.upper() not in currency_units:
                        errors.append({
                            "column": "quantity_unit",
                            "message": f"Unit '{unit_str}' invalid for spend_basis",
                            "suggestion": f"Use currency: {', '.join(currency_units[:7])}"
                        })
                    else:
                        matched_data["quantity_unit"] = unit_str.upper()
                else:  # activity_basis
                    # For activity_basis, check FIRST if it's a currency (not allowed)
                    if unit_str.upper() in currency_units:
                        errors.append({
                            "column": "quantity_unit",
                            "message": f"Currency '{unit_str}' invalid for activity_basis method",
                            "suggestion": "Use physical unit (kg, t, km, kWh, L, etc.)"
                        })
                    else:
                        # Use physical_unit_symbols (excludes CO2e, composite units)
                        physical_units = ref_data.get("physical_unit_symbols", ref_data["unit_symbols"])
                        # Also exclude currencies from physical units
                        physical_units = [u for u in physical_units if u.upper() not in currency_units]
                        unit_match, _ = find_best_match(unit_str, physical_units)
                        if unit_match:
                            matched_data["quantity_unit"] = unit_match
                        else:
                            suggestions = get_suggestions(unit_str, physical_units)
                            errors.append({
                                "column": "quantity_unit",
                                "message": f"Unit '{unit_str}' not found",
                                "suggestion": f"Did you mean: {', '.join(suggestions[:5])}" if suggestions else "Use physical units like kg, t, L, kWh"
                            })
            
            # ========== EMISSION FACTOR (optional) ==========
            if row_data.get("emission_factor"):
                try:
                    matched_data["emission_factor"] = float(row_data["emission_factor"])
                    if not row_data.get("ef_unit"):
                        errors.append({
                            "column": "ef_unit",
                            "message": "EF unit required when emission factor is provided",
                            "suggestion": "Specify unit (e.g., kgCO2e/INR)"
                        })
                    else:
                        matched_data["ef_unit"] = str(row_data["ef_unit"]).strip()
                except (ValueError, TypeError):
                    errors.append({
                        "column": "emission_factor",
                        "message": "Emission factor must be a number",
                        "suggestion": f"Got '{row_data['emission_factor']}'"
                    })
            
            # Copy optional fields
            if row_data.get("evidence_reference"):
                matched_data["evidence_reference"] = str(row_data["evidence_reference"])
            if row_data.get("notes"):
                matched_data["notes"] = str(row_data["notes"])
            
            status = "valid" if not errors else "invalid"
            if status == "valid":
                valid_count += 1
            else:
                invalid_count += 1
            
            rows_result.append({
                "row_number": row_idx,
                "status": status,
                "original_data": {k: str(v) if v is not None else "" for k, v in row_data.items()},
                "matched_data": matched_data,
                "errors": errors
            })
        
        # Store upload session
        upload_session = {
            "id": upload_id,
            "organization_id": org_id,
            "uploaded_by": current_user.get("id"),
            "uploaded_by_email": current_user.get("email"),
            "filename": file.filename,
            "template_type": "scope3",
            "total_rows": len(rows_result),
            "valid_rows": valid_count,
            "invalid_rows": invalid_count,
            "rows": rows_result,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        
        await db.bulk_upload_sessions.insert_one(upload_session)
        
        return {
            "upload_id": upload_id,
            "template_type": "scope3",
            "summary": {
                "total_rows": len(rows_result),
                "valid_rows": valid_count,
                "invalid_rows": invalid_count
            },
            "rows": rows_result
        }
    
    @router.post("/bulk-upload/{upload_id}/save")
    async def save_valid_rows(
        upload_id: str,
        save_mode: str = Query("valid_only", description="valid_only or all_or_nothing"),
        current_user: dict = Depends(get_admin_user)
    ):
        """Save valid rows from upload session."""
        
        org_id = current_user.get("organization_id")
        
        session = await db.bulk_upload_sessions.find_one(
            {"id": upload_id, "organization_id": org_id},
            {"_id": 0}
        )
        
        if not session:
            raise HTTPException(status_code=404, detail="Upload session not found")
        
        if session["status"] == "completed":
            raise HTTPException(status_code=400, detail="Upload already processed")
        
        valid_rows = [r for r in session["rows"] if r["status"] == "valid"]
        
        if save_mode == "all_or_nothing" and session["invalid_rows"] > 0:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot save: {session['invalid_rows']} rows have errors"
            )
        
        if not valid_rows:
            raise HTTPException(status_code=400, detail="No valid rows to save")
        
        saved_count = 0
        saved_ids = []
        
        for row in valid_rows:
            data = row["matched_data"]
            
            emission_entry = {
                "id": str(uuid.uuid4()),
                "organization_id": org_id,
                "facility_id": data.get("facility_id"),
                "facility_name": data.get("facility"),
                "reporting_month": data.get("reporting_month"),
                "scope": data.get("scope"),
                "scope_id": data.get("scope_id"),
                "category": data.get("category"),
                "activity": data.get("activity"),
                "method": data.get("method"),
                "quantity": data.get("quantity"),
                "quantity_unit": data.get("quantity_unit"),
                "emission_factor": data.get("emission_factor"),
                "ef_unit": data.get("ef_unit"),
                "evidence_reference": data.get("evidence_reference"),
                "notes": data.get("notes"),
                "source": "bulk_upload",
                "upload_id": upload_id,
                "created_by": current_user.get("id"),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "status": "draft",
            }
            
            await db.emissions.insert_one(emission_entry)
            saved_ids.append(emission_entry["id"])
            saved_count += 1
        
        await db.bulk_upload_sessions.update_one(
            {"id": upload_id},
            {
                "$set": {
                    "status": "completed",
                    "saved_count": saved_count,
                    "saved_ids": saved_ids,
                    "completed_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )
        
        return {
            "message": f"Successfully saved {saved_count} emission entries",
            "saved_count": saved_count,
            "skipped_count": session["invalid_rows"],
            "saved_ids": saved_ids
        }
    
    @router.get("/bulk-upload/{upload_id}/error-report")
    async def download_error_report(
        upload_id: str,
        current_user: dict = Depends(get_admin_user)
    ):
        """Generate and download error report Excel."""
        
        org_id = current_user.get("organization_id")
        
        session = await db.bulk_upload_sessions.find_one(
            {"id": upload_id, "organization_id": org_id},
            {"_id": 0}
        )
        
        if not session:
            raise HTTPException(status_code=404, detail="Upload session not found")
        
        wb = Workbook()
        ws = wb.active
        ws.title = "Error Report"
        
        headers = ["Row #", "Status", "Facility", "Month", "Category", "Activity", 
                   "Method", "Quantity", "Unit", "Error Message", "Suggestion"]
        
        for col_idx, header in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col_idx, value=header)
            cell.fill = HEADER_FILL
            cell.font = HEADER_FONT
            cell.border = THIN_BORDER
        
        for row_idx, row in enumerate(session["rows"], 2):
            orig = row["original_data"]
            
            ws.cell(row=row_idx, column=1, value=row["row_number"])
            ws.cell(row=row_idx, column=2, value=row["status"].upper())
            ws.cell(row=row_idx, column=3, value=orig.get("facility", ""))
            ws.cell(row=row_idx, column=4, value=orig.get("reporting_month", ""))
            ws.cell(row=row_idx, column=5, value=orig.get("category", ""))
            ws.cell(row=row_idx, column=6, value=orig.get("activity", ""))
            ws.cell(row=row_idx, column=7, value=orig.get("method", ""))
            ws.cell(row=row_idx, column=8, value=orig.get("quantity", ""))
            ws.cell(row=row_idx, column=9, value=orig.get("quantity_unit", ""))
            
            if row["errors"]:
                error_msgs = "; ".join([e["message"] for e in row["errors"]])
                suggestions = "; ".join([e["suggestion"] for e in row["errors"] if e.get("suggestion")])
                ws.cell(row=row_idx, column=10, value=error_msgs)
                ws.cell(row=row_idx, column=11, value=suggestions)
            
            fill = ERROR_FILL if row["status"] == "invalid" else VALID_FILL
            for col_idx in range(1, 12):
                ws.cell(row=row_idx, column=col_idx).fill = fill
                ws.cell(row=row_idx, column=col_idx).border = THIN_BORDER
        
        for col in ws.columns:
            max_length = max(len(str(cell.value or "")) for cell in col)
            ws.column_dimensions[col[0].column_letter].width = min(max_length + 2, 50)
        
        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        
        filename = f"Error_Report_{upload_id[:8]}.xlsx"
        
        return StreamingResponse(
            buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    
    @router.get("/bulk-upload/sessions")
    async def list_upload_sessions(current_user: dict = Depends(get_admin_user)):
        """List recent upload sessions."""
        
        org_id = current_user.get("organization_id")
        
        sessions = await db.bulk_upload_sessions.find(
            {"organization_id": org_id},
            {"_id": 0, "rows": 0}
        ).sort("created_at", -1).limit(20).to_list(20)
        
        return sessions
    
    return router
