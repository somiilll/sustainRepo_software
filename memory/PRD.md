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
- **Database**: MongoDB
- **Key Patterns**: Nested Decision Trees for dynamic form rendering

## Key Technical Concepts
- **CalcEngine**: Dynamic calculation engine handling unit conversions, nested decision trees, and formulas
- **Nested Decision Trees**: Frontend dynamically builds input fields based on `/api/calc-engine/form-config/{category_id}`
- **Unit Fallback Logic**: For Scope 3: `scope3_ef.allowed_units` → `input_field_mappings.allowed_units` → `formula.expected_unit`

## Database Schema
- `emission_records`: {..., scope, scope3_ef_id, category, calculation_method_scope3, scope3_activity_type, dynamic_field_values}
- `scope3_ef`: {activity, activity_type, category, method, allowed_units, default_unit, emission_factor}
- `ce_input_field_mappings`: {field_key, maps_to_variable, unit_source, allowed_units, applies_to_categories, applies_to_scopes}
- `bulk_upload_sessions`: {id, organization_id, filename, status, total_rows, valid_rows, created_at}

## Completed Features

### May 2026
- ✅ **Scope 3 Bulk Upload System - COMPLETE**
  - 17-sheet Excel template (Instructions + C1-C15 categories)
  - Dynamic dropdowns for facilities, methods, activities, units
  - Fuzzy matching for activities using `rapidfuzz` (80%+ confidence)
  - **Custom activity support for supplier_basis** - Allows custom activities with user-provided emission factors
  - C7 Employee Commuting with additional Employee Name/ID columns
  - Validation results with category breakdown
  - Save valid rows to database with `source: "bulk_upload"` tracking
  - Error report download functionality
  - Frontend UI at `/bulk-upload` with full flow working
  - Key file: `/app/backend/bulk_upload_enhanced.py`

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

## Upcoming Tasks
1. **P1**: Expand Bulk Upload to Scope 1 & Scope 2
   - Create similar templates and validation for Scope 1 (stationary/mobile combustion) and Scope 2 (electricity)

2. **P1**: Implement 'Copy as test case' button in Calculation Sandbox

## Future/Backlog
- P2: Implement CBAM module and report template
- P2: Implement Auto-save for GHG Emissions
- P2: Geographic heatmap for Supplier Hotspots (requires supplier location data)
- P2: Refactor `backend/server.py` into structured package (7800+ lines)
- P2: Refactor `Emissions.js` into smaller sub-components (4600+ lines)
- P2: Refactor `EmissionEntryForm.js` (3200+ lines)

## Key API Endpoints - Bulk Upload
- `GET /api/bulk-upload/template` - Download Excel template with 17 sheets
- `POST /api/bulk-upload/validate` - Validate uploaded Excel file
- `POST /api/bulk-upload/{upload_id}/save` - Save valid rows to database
- `GET /api/bulk-upload/{upload_id}/errors` - Download error report
- `GET /api/bulk-upload/sessions` - List upload history

## Key Files
- `/app/backend/bulk_upload_enhanced.py` - Complete Bulk Upload System
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
- Admin (Test Org): goyalsomil2@hotmail.com / Test123!
- Test Facilities: test-fac-1, test-fac-2
