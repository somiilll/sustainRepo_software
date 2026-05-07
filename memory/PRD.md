# SustainRepo - GHG Calculation Platform PRD

## Original Problem Statement
Building a multi-tenant Greenhouse Gas (GHG) calculation platform named 'SustainRepo' with:
- Dynamic GHG calculations compliant with ISO 14064-1:2018
- Excel-Based GHG Bulk Upload System with 3-layer validation engine
- Advanced frontend validation for emission entries
- Role-based UI access control for Scope 3 emissions
- Context-driven calculation parameters
- Supplier hotspot visualizations on the dashboard

## Architecture
- **Frontend**: React, Tailwind CSS, Shadcn/UI
- **Backend**: FastAPI, Motor async driver, Pydantic
- **Database**: MongoDB (`test_database`)
- **Key Patterns**: Nested Decision Trees for dynamic form rendering

## Key Technical Concepts
- **CalcEngine**: Dynamic calculation engine handling unit conversions, nested decision trees, and formulas
- **Nested Decision Trees**: Frontend dynamically builds input fields based on `/api/calc-engine/form-config/{category_id}`
- **Unit Fallback Logic**: For Scope 3: `scope3_ef.allowed_units` → `input_field_mappings.allowed_units` → `formula.expected_unit`

## Database Schema
- `emissions`: {..., scope, scope3_ef_id, category, calculation_method_scope3, scope3_activity_type, dynamic_field_values, upload_source}
- `scope3_ef`: {activity, activity_type, category, method, allowed_units, default_unit, emission_factor}
- `ce_input_field_mappings`: {field_key, maps_to_variable, unit_source, allowed_units, applies_to_categories, applies_to_scopes}
- `bulk_upload_jobs`: {id, organization_id, status, total_rows, success_count, error_count, created_emission_ids}
- `bulk_upload_errors`: {job_id, sheet, row, column, error_type, message, suggestion, severity}

## Completed Features

### May 2026
- ✅ **Scope 3 Bulk Upload System - FULLY WORKING**
  - 21-sheet Excel template (Instructions + _hidden + C1-C15 categories)
  - **Fixed template issues:**
    - Calculation Method dropdown shows labels: "Activity Based", "Spend Based", "Supplier Based"
    - Activity Type dropdown shows labels: "Air Travel", "Hotel Stay", etc. (not raw keys)
    - Notes column added to all categories
    - Category names in saved emissions: "C1 - Purchased Goods and Services" (not "C1 - Unknown")
  - Fuzzy activity matching using `rapidfuzz` (85%+ confidence auto-match)
  - C7 Employee Commuting: Multi-employee aggregation
  - C15 Investments: Supplier-basis only restriction
  - Supplier-based custom activities support
  - Key files: `/app/backend/bulk_upload_scope3/`

- ✅ **Removed old bulk_upload_enhanced.py** - Cleaned up redundant code
- ✅ **Updated frontend** to use `/api/bulk-upload/scope3/` endpoints

### January 2026
- ✅ Added "Use Custom Activity" toggle for Biogenic Scope 3 with `supplier_basis` method
- ✅ Fixed Biogenic Scope 3 validation to allow custom activity without dropdown selection
- ✅ Made `supplier_basis` method always available for all Scope 3 categories
- ✅ UI/UX Cleanup: hid warnings, stripped debug logs, sanitized errors, fixed CO2e display

### December 2025
- ✅ Fixed Scope 3 Unit Dropdown issue for C5 and all categories
- ✅ Ingested category.csv for C12 into scope3_ef table
- ✅ Fixed C6 and C7 with new activity_type column
- ✅ Upgraded CalcEngine router for recursive nested decision tree traversal
- ✅ Multi-Employee Input for C7 Employee Commuting

## Pending Issues
1. **P1**: Missing Database Mappings for C15 Supplier Method
   - `ce_input_field_mappings`, `ce_categories`, `ce_formulas`, `scope3_ef` lack data for C15 supplier fields
   - Blocked: Requires database seeding script

2. **P2**: React Hydration Warnings in `EmissionEntryForm.js` (console warnings about invalid HTML nesting)

3. **P2**: Subcategory dropdowns for C8, C10, C11, C13, C14 are empty
   - scope3_ef collection doesn't have sub_category field populated for these categories

## Upcoming Tasks
1. **P1**: Seed subcategories for C8, C10, C11, C13, C14 in scope3_ef
2. **P1**: Expand Bulk Upload to Scope 1 & Scope 2
3. **P1**: Implement 'Copy as test case' button in Calculation Sandbox

## Future/Backlog
- P2: Implement CBAM module and report template
- P2: Implement Auto-save for GHG Emissions
- P2: Geographic heatmap for Supplier Hotspots (requires supplier location data)
- P2: Refactor `backend/server.py` into structured package (7800+ lines)
- P2: Refactor `Emissions.js` into smaller sub-components (4600+ lines)

## Key API Endpoints - Bulk Upload
- `GET /api/bulk-upload/scope3/template/download` - Download Excel template with 21 sheets
- `POST /api/bulk-upload/scope3/upload` - Process uploaded Excel file (auto-saves valid rows)
- `GET /api/bulk-upload/scope3/jobs` - List all upload jobs for organization
- `GET /api/bulk-upload/scope3/jobs/{job_id}` - Get job status
- `GET /api/bulk-upload/scope3/jobs/{job_id}/errors/download` - Download error report
- `DELETE /api/bulk-upload/scope3/jobs/{job_id}` - Delete job (optionally with emissions)

## Key Files
- `/app/backend/bulk_upload_scope3/` - Complete Bulk Upload System
- `/app/backend/calc_engine/router.py` - Form config and tree traversal
- `/app/frontend/src/pages/BulkUpload.js` - Bulk Upload UI
- `/app/frontend/src/components/EmissionEntryForm.js` - GHG Creation Form
- `/app/frontend/src/pages/Emissions.js` - GHG page with Edit Dialog

## 3rd Party Integrations
- Cloudflare R2 (Storage) - requires User API Key
- Resend (Emails) - requires User API Key
- rapidfuzz (Python) - Fuzzy string matching for activity names

## Test Credentials
- SuperAdmin: superadmin@ecotrack.com / SuperAdmin123!
- OILES INDIA Admin: goyalsomil@hotmail.com / Test123!
- Test Org 2 Admin: goyalsomil2@hotmail.com / Test123!
