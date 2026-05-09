# SustainRepo - GHG Calculation Platform PRD

## Original Problem Statement
Building a multi-tenant Greenhouse Gas (GHG) calculation platform named 'SustainRepo' with:
- Dynamic GHG calculations compliant with ISO 14064-1:2018
- Excel-Based GHG Bulk Upload System with 3-layer validation engine
- Advanced frontend validation for emission entries
- Role-based UI access control for Scope 3 emissions
- Context-driven calculation parameters
- Supplier hotspot visualizations on the dashboard
- Enterprise-grade Base Year Management with audit trails and Scope separation

## Architecture
- **Frontend**: React, Tailwind CSS, Shadcn/UI
- **Backend**: FastAPI, Motor async driver, Pydantic
- **Database**: MongoDB (`test_database`)
- **Key Patterns**: Nested Decision Trees for dynamic form rendering

## Completed Features

### May 9, 2026 - Base Year Management Enhancement (Phases 1, 2 & 3)

#### Phase 3: Enhanced Totals & Reporting Integration (COMPLETED - User Verified)
- Enhanced totals display showing S1+S2 combined vs S3 separately
- Biogenic emissions tracked with/without option
- Reporting integration completed

#### Phase 2: Scope 1&2 vs Scope 3 Separation (COMPLETED)
1. **Separate UI Cards for Each Scope Group**:
   - Organization/Facility cards now show two columns: Scope 1&2 (blue badge) and Scope 3 (purple badge)
   - Each scope group can have independent base year configuration
   - Visual "Set" indicator with checkmark when configured

2. **Backend Scope Filtering**:
   - `GET /api/base-year-emissions/oldest-year/{type}/{id}?scope_group=scope12|scope3` - Filters oldest year by scope
   - `GET /api/base-year-emissions/emission-combinations/{type}/{id}?scope_group=scope12|scope3` - Filters combinations
   - Scope 1&2 includes: scope1, scope2, biogenic emissions
   - Scope 3 includes: scope3 emissions only

3. **Scope Group Badge in All Dialogs**:
   - Setup Dialog shows scope group badge in title
   - View Dialog shows scope group badge next to base year
   - Change Year Dialog shows scope group badge in title

4. **Independent Configuration Flow**:
   - Users can configure Scope 1&2 and Scope 3 base years independently
   - Each has its own justification and notes
   - Version history tracked separately per scope group

#### Phase 1: Mandatory Justifications & Audit Trail (COMPLETED)
1. **Mandatory Justification for Base Year Selection**:
   - New records require `justification` field (minimum 10 characters)
   - Amber background UI with AlertCircle icon
   - Character counter showing progress toward minimum
   - Stored in `base_year_emissions` collection and version history

2. **Mandatory Reason for Changing Base Year**:
   - `change_reason` parameter required (minimum 20 characters) for PATCH `/api/base-year-emissions/{id}/change-year`
   - Warning banner explaining impact on year-over-year comparisons
   - Reason tracked in version_history for audit purposes

3. **Scope Group Support**:
   - Backend models support `scope_group` field ("scope12" or "scope3")
   - All records properly tagged with scope group

4. **Enhanced View/Edit Dialogs**:
   - View Dialog now shows "Base Year Justification" section (amber)
   - Edit Dialog has editable justification field with validation
   - Character counters and min-length indicators throughout

### May 8, 2026 - Previous Session

#### C7 Critical Fixes
1. **Emission Factor Bug**: Backend now accepts `scope3_ef_id` and enriches context for correct EF lookup
2. **Activity Selection Bug**: Frontend now uses user-selected activity instead of first item in list
3. **Collection Migration**: C7 endpoints now save to `emission_records` (was `emissions`) so entries appear in GHG Emissions listing
4. **Process Names Saving**: Added `process_names` and `process_descriptions` to C7 model
5. **Edit Dialog Data Loading**: Transform employee data to `monthly_data` structure for MultiEmployeeInput compatibility
6. **Single Month Edit Mode**: Edit mode only shows the specific month being edited (not all 12)

#### C7 UX Improvements
7. **Employee Validation**:
   - Employee Name is now mandatory (validation with red borders)
   - Must have data for at least one month
   - Clear error messages displayed in accordion
8. **New Employee at TOP**: New employees added at beginning of list for easier access
9. **Removed Summary Stats in Edit**: No "Avg Monthly" or "Yearly Total" in edit dialog
10. **Removed Individual Month Calculate**: Only "Calculate All" button per employee

### Previous Fixes (Phase 3 GHG)
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
- C10 Fugitive Emissions Live Calculation fix (user paused)
- React Hydration Warnings in EmissionEntryForm.js
- CBAM module and report template
- Auto-save for GHG Emissions

### P2 (Technical Debt)
- Refactor `/app/backend/server.py` (~8520 lines) into structured package
- Refactor `/app/frontend/src/pages/Emissions.js` (~6000 lines)
- Refactor `/app/frontend/src/components/EmissionEntryForm.js` (~4650 lines)
- Refactor `/app/frontend/src/pages/BaseYearEmissions.js` (~1870 lines)

## Key Files Modified This Session (May 9, 2026)
- `/app/backend/server.py` - BaseYear Pydantic models (justification, scope_group), PATCH endpoint with change_reason, scope_group filtering for oldest-year and emission-combinations endpoints
- `/app/frontend/src/pages/BaseYearEmissions.js` - Complete Phase 2 UI overhaul: separate scope group cards, renderScopeGroupCard component, scope badges in all dialogs, scope-aware entity click handling

## API Endpoints (Base Year)
- `POST /api/base-year-emissions` - Create base year (requires `justification`, `scope_group`)
- `PUT /api/base-year-emissions/{id}` - Update base year emissions
- `PATCH /api/base-year-emissions/{id}/change-year` - Change base year (requires `change_reason`)
- `GET /api/base-year-emissions` - List base year records (supports `scope_group` filter)
- `GET /api/base-year-emissions/oldest-year/{entity_type}/{entity_id}?scope_group=` - Get oldest reporting year filtered by scope
- `GET /api/base-year-emissions/emission-combinations/{entity_type}/{entity_id}?scope_group=` - Get emission combinations filtered by scope

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
