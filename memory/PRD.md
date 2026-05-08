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

#### Phase 1 Fixes ✅
1. ✅ **#1 - Step 3 Spacing**: Improved with section headers (Required Inputs, Override Properties, Optional Inputs) with proper visual hierarchy
2. ✅ **#2 - Supplier Basis Free Text Units**: Unit fields for supplier_basis are now free text inputs
3. ✅ **#11 - Exclude Biogenic from Dropdowns**: Regular Scope 3 now excludes biogenic data
4. ✅ **#12 - Green Status Dot**: Fixed `getMonthStatus` for Scope 3 dynamic fields
5. ✅ **#13 - Optional Inputs Validation**: Validation only checks REQUIRED fields
6. ✅ **#14 - Fuel Used in Notes**: Summary shows Scope 3 specific details

#### Phase 2 Fixes (C7) ✅
7. ✅ **#4 - Monthly Totals with Year/FY/CY**: Shows "FY 2025-26" or "CY 2025" in aggregated totals
8. ✅ **#5 - New Employee Validation**: Must select activity type before adding employees
9. ✅ **#6 - C7 Calculation Fixes**: Now prioritizes scope3ActivityId over activity_type for correct EF
10. ✅ **#7 - Show EF + Formula Live**: Blue info card shows emission factor, source, and formula
11. ✅ **#8 - Missing Supplier Units in C7**: Added free-text unit fields for supplier_basis
12. ✅ **#9 - Activity Type Labels**: Shows "Car Travel" instead of "car_travel" in edit dialog

### Bulk Upload System ✅
- Complete 21-sheet Excel template
- Fuzzy activity matching with rapidfuzz
- Subcategories for C8, C10, C11, C13, C14
- Error UI with clear options

## Pending Items

### Phase 3: Major Refactors
- 🔵 **#3 - Version History**: Field-level change tracking (all fields)
- 🔵 **#10 - C7 Data Model Restructure**: Design document at `/app/memory/C7_RESTRUCTURE_DESIGN.md`

### Other Pending
- P1: Missing Database Mappings for C15 Supplier Method
- P2: React Hydration Warnings in EmissionEntryForm.js

## Key Files Modified This Session
- `/app/frontend/src/components/EmissionEntryForm.js` - Phase 1 & 2 fixes
- `/app/frontend/src/components/MultiEmployeeInput.jsx` - C7 enhancements
- `/app/frontend/src/pages/Emissions.js` - Edit dialog activity type labels, calculation fix
- `/app/memory/C7_RESTRUCTURE_DESIGN.md` - C7 restructure design document

## Test Credentials
- SuperAdmin: superadmin@ecotrack.com / SuperAdmin123!
- OILES INDIA Admin: goyalsomil@hotmail.com / Test123!
- Test Org 2 Admin: goyalsomil2@hotmail.com / Test123!
