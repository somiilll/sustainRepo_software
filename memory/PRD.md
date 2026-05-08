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

## Completed Features

### May 2026

#### Phase 1 Fixes (Current Session)
- ✅ **#1 - Step 3 Spacing**: Improved spacing with section headers (Required Inputs, Override Properties, Optional Inputs)
- ✅ **#2 - Supplier Basis Free Text Units**: Unit fields for supplier_basis are now free text inputs instead of dropdowns
- ✅ **#11 - Exclude Biogenic from Dropdowns**: Regular Scope 3 now excludes biogenic data from activity dropdowns
- ✅ **#12 - Green Status Dot**: Fixed `getMonthStatus` to properly detect filled months for Scope 3 dynamic fields
- ✅ **#13 - Optional Inputs Validation**: Validation now only checks REQUIRED fields, not optional ones
- ✅ **#14 - Fuel Used in Notes**: Summary section now shows Scope 3 specific details including Fuel Used for subcategory categories

#### Bulk Upload System
- ✅ **Scope 3 Bulk Upload System** - Complete with 21-sheet template
- ✅ **Template fixes**: Calculation Method labels, Activity Type labels, Notes column, correct category names
- ✅ **Subcategories**: Added "Stationary Combustion", "Mobile Combustion" for C8, C10, C11, C13, C14
- ✅ **Error UI**: Shows clear options (Download Error Report, Upload New File) when errors occur

### Previous Sessions
- ✅ Dynamic GHG calculations with nested decision trees
- ✅ "Use Custom Activity" toggle for Biogenic Scope 3
- ✅ UI/UX cleanups (hidden warnings, sanitized errors, CO2e display)
- ✅ Multi-Employee Input for C7 Employee Commuting

## In Progress

### Phase 2: C7 Fixes (Pending)
- 🟡 **#4** - Monthly Totals with Year/FY/CY labels
- 🟡 **#5** - New Employee validation (mandatory activity selection)
- 🟡 **#6** - C7 Calculation fixes (EF per activity type)
- 🟡 **#7** - Show EF + Formula live preview
- 🟡 **#8** - Missing supplier units in C7
- 🟡 **#9** - Dynamic Edit Dialog refresh on method/activity change

### Phase 3: Major Refactors (Pending)
- 🔵 **#3 - Version History**: Field-level change tracking (all fields including optional)
- 🔵 **#10 - C7 Data Model Restructure**: Design document created at `/app/memory/C7_RESTRUCTURE_DESIGN.md`

## Pending Issues
1. **P1**: Missing Database Mappings for C15 Supplier Method
2. **P2**: React Hydration Warnings in `EmissionEntryForm.js`

## Key Files Modified This Session
- `/app/frontend/src/components/EmissionEntryForm.js` - Phase 1 fixes
- `/app/frontend/src/pages/BulkUpload.js` - Error UI improvements
- `/app/backend/bulk_upload_scope3/models.py` - Notes column added
- `/app/memory/C7_RESTRUCTURE_DESIGN.md` - C7 restructure design document

## Key API Endpoints
- `GET /api/bulk-upload/scope3/template/download` - Download Excel template
- `POST /api/bulk-upload/scope3/upload` - Process uploaded Excel file
- `GET /api/bulk-upload/scope3/jobs` - List upload jobs
- `GET /api/bulk-upload/scope3/jobs/{job_id}/errors/download` - Download error report

## Test Credentials
- SuperAdmin: superadmin@ecotrack.com / SuperAdmin123!
- OILES INDIA Admin: goyalsomil@hotmail.com / Test123!
- Test Org 2 Admin: goyalsomil2@hotmail.com / Test123!
