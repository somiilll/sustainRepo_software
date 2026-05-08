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

### May 2026 - Current Session

#### Phase 1 Fixes (Completed)
1. **#1 - Step 3 Spacing**: Improved with section headers (Required Inputs, Override Properties, Optional Inputs) with proper visual hierarchy
2. **#2 - Supplier Basis Free Text Units**: Unit fields for supplier_basis are now free text inputs
3. **#11 - Exclude Biogenic from Dropdowns**: Regular Scope 3 now excludes biogenic data
4. **#12 - Green Status Dot**: Fixed `getMonthStatus` for Scope 3 dynamic fields
5. **#13 - Optional Inputs Validation**: Validation only checks REQUIRED fields
6. **#14 - Fuel Used in Notes**: Summary shows Scope 3 specific details

#### Phase 2 Fixes (C7 - Completed)
7. **#4 - Monthly Totals with Year/FY/CY**: Shows "FY 2025-26" or "CY 2025" in aggregated totals
8. **#5 - New Employee Validation**: Must select activity type before adding employees
9. **#6 - C7 Calculation Fixes**: Now prioritizes scope3ActivityId over activity_type for correct EF
10. **#8 - Missing Supplier Units in C7**: Added free-text unit fields for supplier_basis

#### Phase 3 Fixes (Completed in this session)
11. **#3 - Version History Field-Level Tracking**: 
    - Backend `compute_field_changes()` function tracks all emission field changes
    - Frontend Version History dialog now uses `field_changes` array from backend
    - Shows old -> new values for each changed field with friendly labels
    - Fallback to legacy format for backward compatibility
    
12. **#7 - Show EF + Formula Live Preview in C7**: 
    - Blue info card shows emission factor, source, and dynamic formula
    - Activity type badge displayed in the card
    - Formula adapts based on calculation method and input fields
    
13. **#9 - Dynamic Inputs Not Updating in Edit Dialog**: 
    - Fixed: Changing calculation method now clears `dynamicFieldValues`
    - Fixed: Changing activity type now clears `dynamicFieldValues`
    - Prevents stale data from previous selections showing in form
    
14. **#10 - C7 Data Model Restructure**: 
    - New backend endpoints: `POST/GET /api/emissions/c7/month`, `GET /api/emissions/c7/{facility}/{year}`, etc.
    - Each month saved as separate entry with `c7_data_model_version: 2`
    - Frontend `EmissionEntryForm.js` updated to submit month-by-month
    - Migration endpoint for old yearly-aggregated entries
    - Design document: `/app/memory/C7_RESTRUCTURE_DESIGN.md`

### Bulk Upload System (Completed)
- Complete 21-sheet Excel template
- Fuzzy activity matching with rapidfuzz
- Subcategories for C8, C10, C11, C13, C14
- Error UI with clear options

## Pending Items

### P1 (High Priority)
- Missing Database Mappings for C15 Supplier Method (blocked on seeding)
- Expand Bulk Upload to Scope 1 & Scope 2
- 'Copy as test case' button in Calculation Sandbox

### P2 (Medium Priority)
- React Hydration Warnings in EmissionEntryForm.js (span inside option/select)
- CBAM module and report template
- Auto-save for GHG Emissions

### P2 (Technical Debt)
- Refactor `/app/backend/server.py` (~8300 lines) into structured package
- Refactor `/app/frontend/src/pages/Emissions.js` (~5800 lines)
- Refactor `/app/frontend/src/components/EmissionEntryForm.js` (~4600 lines)
- Extract EmissionEntryDialog, VersionHistoryDialog, EditDialog into separate components

## Key Files Modified This Session
- `/app/backend/server.py` - C7 monthly endpoints, field_changes tracking, exact category matching
- `/app/frontend/src/components/EmissionEntryForm.js` - C7 monthly submission, EF info enhancement
- `/app/frontend/src/components/MultiEmployeeInput.jsx` - EF + Formula info card with activity type badge
- `/app/frontend/src/pages/Emissions.js` - Version History UI with field_changes, dynamic input clearing on edit
- `/app/memory/C7_RESTRUCTURE_DESIGN.md` - C7 restructure design document

## API Endpoints (C7)
- `POST /api/emissions/c7/month` - Create/update monthly C7 entry
- `GET /api/emissions/c7/{facility_id}/{year}` - Get yearly summary with all monthly entries
- `GET /api/emissions/c7/{facility_id}/{year}/{month}` - Get specific month entry
- `DELETE /api/emissions/c7/{entry_id}` - Delete monthly entry
- `POST /api/emissions/c7/migrate/{facility_id}/{year}` - Migrate old model to new model

## Test Credentials
- SuperAdmin: superadmin@ecotrack.com / SuperAdmin123!
- OILES INDIA Admin: goyalsomil@hotmail.com / Test123!
- Test Org 2 Admin: goyalsomil2@hotmail.com / Test123!

## Test Reports
- `/app/test_reports/iteration_66.json` - Phase 3 testing (7/7 backend tests passed)
