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

#### Phase 3 GHG Fixes (Completed)
1. **#10 - C7 Data Model Restructure**: Monthly endpoints for C7 Employee Commuting
2. **#3 - Version History Field-Level Tracking**: Backend tracks field_changes array
3. **#7 - EF + Formula Live Preview in C7**: Blue info card with emission factor details
4. **#9 - Dynamic Inputs Not Updating**: Fixed clearing dynamicFieldValues on method/activity change

#### UI/UX Improvements (Completed - This Session)
5. **#16 - Enterprise Data Grid Layout**:
   - Fixed header row with column labels (Facility, Year, Category, Activity, Method, tCO₂e, Actions)
   - Value-only rows below (no repeated labels)
   - Scope-specific columns for Scope 1/2, Scope 3, and Biogenic
   - Light green hover highlight on rows
   - SAP/Workiva-style enterprise density

6. **#17 - Property Override Justification**:
   - Mandatory textarea when any override is enabled in Scope 1/2
   - Minimum 20 character validation
   - Tracked in version history
   - Amber background with AlertTriangle icon

7. **#18 - Scope 3 Edit Dialog tCO₂e Layout**:
   - Full-width tCO₂e summary banner
   - 3XL typography for emission value
   - Metadata: Method, Activity, Last Updated timestamp

8. **#19 - Modal Protection Against Accidental Close**:
   - Prevent close on outside click (onInteractOutside)
   - ESC key triggers confirmation dialog
   - "Unsaved Changes" dialog with Continue Editing / Discard options
   - Custom X close button in header
   - Form dirty state tracking

9. **Dialog Spacing Improvements**:
   - Increased vertical spacing between sections (space-y-8)
   - Better section hierarchy with pb-6 borders
   - Override Properties section with amber background
   - Improved Step 4 Notes summary layout

### Bulk Upload System (Completed)
- Complete 21-sheet Excel template
- Fuzzy activity matching with rapidfuzz
- Subcategories for C8, C10, C11, C13, C14
- Error UI with clear options

## Pending Items

### P1 (High Priority)
- Missing Database Mappings for C15 Supplier Method
- Expand Bulk Upload to Scope 1 & Scope 2
- 'Copy as test case' button in Calculation Sandbox

### P2 (Medium Priority)
- React Hydration Warnings in EmissionEntryForm.js
- CBAM module and report template
- Auto-save for GHG Emissions

### P2 (Technical Debt)
- Refactor `/app/backend/server.py` (~8300 lines) into structured package
- Refactor `/app/frontend/src/pages/Emissions.js` (~6000 lines)
- Refactor `/app/frontend/src/components/EmissionEntryForm.js` (~4650 lines)

## Key Files Modified This Session
- `/app/frontend/src/pages/Emissions.js` - Enterprise data grid, modal protection, override justification
- `/app/frontend/src/components/EmissionEntryForm.js` - Form dirty tracking, improved spacing
- `/app/frontend/src/components/ui/dialog.jsx` - onInteractOutside, onEscapeKeyDown, hideCloseButton props
- `/app/backend/server.py` - override_justification in version history tracking

## API Endpoints (C7)
- `POST /api/emissions/c7/month` - Create/update monthly C7 entry
- `GET /api/emissions/c7/{facility_id}/{year}` - Get yearly summary
- `GET /api/emissions/c7/{facility_id}/{year}/{month}` - Get specific month
- `DELETE /api/emissions/c7/{entry_id}` - Delete monthly entry
- `POST /api/emissions/c7/migrate/{facility_id}/{year}` - Migrate old to new model

## Test Credentials
- SuperAdmin: superadmin@ecotrack.com / SuperAdmin123!
- OILES INDIA Admin: goyalsomil@hotmail.com / Test123!
- Test Org 2 Admin: goyalsomil2@hotmail.com / Test123!

## Test Reports
- `/app/test_reports/iteration_66.json` - Phase 3 testing (7/7 backend tests passed)
- `/app/test_reports/iteration_67.json` - UI/UX partial verification
