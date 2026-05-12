# SustainRepo - GHG Calculation Platform PRD

## Latest Update: May 12, 2026

### C8/C10/C11/C13/C14 Subcategory Edit Bug Fix (COMPLETED)
- **Issue**: When editing C8, C10, C11, C13, C14 emissions, the subcategory dropdown was deselected/empty
- **Root Causes**:
  1. In `Emissions.js` (line 3425-3432), the `else` block for non-C7 categories incorrectly reset all scope3 fields
  2. In `EmissionEntryForm.js` (yearly save flow), scope3 metadata fields were NOT saved to `dynamic_field_values`
- **Fixes**:
  1. `Emissions.js`: Removed scope3 field resets from non-C7 else block
  2. `EmissionEntryForm.js`: Added scope3 metadata fields to `dynamicFieldValuesToSave` in yearly save flow

### C6/C7 Bulk Upload Formula Resolution Fix (COMPLETED)
- **Issue**: C6/C7 bulk upload for activity types like Taxi Travel, Bus Travel, Car Travel saved 0 emissions
- **Root Cause**: Decision tree expected lowercase activity types (`taxi_travel`) but bulk upload passed display format (`Taxi Travel`)
  - Decision tree couldn't match → returned fallback formula (WFH for C7, Hotel Stays for C6)
  - Wrong formula selected → wrong inputs built → 0 emissions
- **Fix** in `/app/backend/bulk_upload_scope3/processors/emission_calculator.py`:
  - Normalize `activity_type` in `decision_inputs` to lowercase with underscores before formula resolution
  - Maps "Work From Home" → "wfh", "Taxi Travel" → "taxi_travel", etc.

### C7 Bulk Upload Data Structure Fix (COMPLETED)
- **Issue**: C7 yearly bulk upload stored data in wrong structure (`monthly_data["fy "]`) instead of flat `inputs`/`emissions` at employee level
- **Root Causes**:
  1. Yearly data stored under `monthly_data["fy "]` with trailing space instead of flat at employee level
  2. Activity type stored as `"Wfh"` instead of `"wfh"` (capitalization mismatch)
  3. Frontend dropdown showed `Wfh` but edit showed `Work From Home` (display inconsistency)
- **Fixes**:
  1. Backend (`/app/backend/bulk_upload_scope3/processors/emission_calculator.py`):
     - Yearly mode now stores `inputs`/`emissions` flat at employee level (matching manual entry)
     - Activity type normalized to lowercase internal values (`wfh`, `car_travel`, etc.)
     - `monthly_totals` set to `null` for yearly mode
  2. Frontend (`/app/frontend/src/components/EmissionEntryForm.js`):
     - Activity type dropdown now uses consistent display labels (`Work From Home` not `Wfh`)

### C7 Employee Commuting Edit Bug Fix (COMPLETED)
- **Issue**: Editing saved C7 WFH emissions and clicking calculate showed "Please enter inputs value first"
- **Root Causes**:
  1. `handleCalculateEditEmployeeMonth` in `Emissions.js` only looked at `monthly_data[monthKey].inputs`, not `yearly_data.inputs` for yearly frequency records
  2. Activity type mismatch: DB stored display values (`'Water Travel'`, `'Work From Home'`) but matching expected internal values (`'water_travel'`, `'wfh'`)
- **Fixes** in `/app/frontend/src/pages/Emissions.js`:
  1. Updated `handleCalculateEditEmployeeMonth` to detect yearly mode (`monthKey === 'yearly'`) and read from `yearly_data` accordingly
  2. Added activity type normalization when loading emissions for edit (maps display names back to internal values)
  3. Added flexible activity type matching with normalization fallback
  4. Updated result storage to handle both yearly and monthly modes correctly

### Bulk Upload Unit Conversion Fix (COMPLETED)
- Fixed critical bug where C4 Transport and Spend-based bulk uploads returned `formula_id: null` and `0` emissions
- **Root Cause**: `_convert_unit` attempted to convert compound units (`tonne.km` → `t_km`) and currencies (`INR` → `USD`), causing exceptions that aborted calculation
- **Fix**: Updated `/app/backend/bulk_upload_scope3/processors/emission_calculator.py`:
  1. Bypass conversion for currencies (INR, USD, EUR, etc.) - handled natively by formula's `ppp` and `inflation_rate`
  2. Bypass conversion for compound transport units (tonne.km, t_km, etc.) - used as-is
  3. Only convert simple mass units (kg, g → t) when needed
  4. Graceful fallback for unrecognized units (returns original value with success=True)
- **Verified**: Backend logs confirm successful calculations for both C4 Transport and Spend Basis

## Previous Updates: December 2025
- **Bulk Upload Bug Fixes (3 issues)**:
  1. Empty row handling - Parser skips blank spacing rows in Excel files
  2. NoneType error fix - Proper null handling for empty Excel cells using `(get("key") or "")` pattern
  3. CalculationMethod enum fix - Maps Excel values (Average_data_based) to proper enum (activity_basis)

## Original Problem Statement
Building a multi-tenant Greenhouse Gas (GHG) calculation platform named 'SustainRepo' with:
- Dynamic GHG calculations compliant with ISO 14064-1:2018
- Excel-Based GHG Bulk Upload System with 3-layer validation engine
- Advanced frontend validation for emission entries
- Role-based UI access control for Scope 3 emissions
- Context-driven calculation parameters
- Supplier hotspot visualizations on the dashboard
- Enterprise-grade Base Year Management with audit trails and Scope separation
- **Monthly vs Yearly Data Entry Support** (NEW)

## Architecture
- **Frontend**: React, Tailwind CSS, Shadcn/UI
- **Backend**: FastAPI, Motor async driver, Pydantic
- **Database**: MongoDB (`test_database`)
- **Key Patterns**: Nested Decision Trees for dynamic form rendering

## Completed Features

### May 11, 2026 - Report Generator Bug Fix

#### Bug Fix: Missing `_create_scope123_comparison_chart` Function (COMPLETED)
- **Issue**: Scope 1,2,3 reports failed to render the base year comparison chart
- **Root Cause**: Function `_create_scope123_comparison_chart` was called at line 1667 in `_add_base_year_emissions_section` but was never defined
- **Error**: Chart silently failed with `'GHGReportGenerator' object has no attribute '_create_scope123_comparison_chart'`
- **Fix**: Added the missing `_create_scope123_comparison_chart` method at line 1745
  - Creates a grouped bar chart comparing Base Year vs Current Period for both Scope 1&2 and Scope 3
  - Uses matplotlib with styling consistent with other chart functions
- **Files**: `/app/backend/report_generator.py`
- **Testing**: Both `scope_1_2` and `scope_1_2_3` report generation verified working (HTTP 200)

### May 10, 2026 - Premium ESG Dashboard Enhancements (Phases 1-4) + Bug Fixes

#### Bug Fix: Scope 2 Yearly Data Not Showing (COMPLETED)
- **Issue**: Scope 2 data with "FY 2025-26" period format showed 0.00t on dashboard
- **Root Cause**: MongoDB string comparison excluded yearly periods (alphabetically "FY" < "2025")
- **Fix**: Modified backend `/api/dashboard/stats` to:
  1. Use `$or` query to include both monthly (YYYY-MM) AND yearly (FY/CY) records
  2. Added `is_yearly_period_in_range()` function to properly filter yearly periods
- **Files**: `/app/backend/server.py` (lines ~5420-5490)

#### Premium ESG Dashboard Redesign (COMPLETED)

**1. Scope 3 Methodology Analysis - Executive Design**
- Compact donut chart with **Central KPI** (Total tCO₂e + Category count)
- **Interactive KPI Cards** replacing basic legend:
  - Shows methodology name, percentage, tCO₂e value
  - **Confidence badges**: High (Green), Medium-High (Blue), Medium (Amber)
- **Executive Insight Summary** below chart

**2. Scope 3 Emission Hotspots - Severity-Based Visualization**
- **Severity-based colors**: Red (>70%), Orange (40-70%), Amber (20-40%), Green (<20%)
- **Ranking Panel**: Shows top 4 categories with #1, #2, #3, #4 badges
- **Executive Insight**: Dynamic text about concentration risk
- Rich hover tooltips with emissions + percentage

**3. Semantic ESG Color System**
- `METHODOLOGY_COLORS` updated: Activity-Based=Emerald, Supplier-Specific=Blue, Spend-Based=Amber
- `METHODOLOGY_CONFIDENCE` added: Maps methodology to confidence level + description

**4. UI/UX Improvements**
- Glassmorphism cards with `backdrop-blur-xl`
- Hover animations on KPI cards
- Consistent spacing and visual hierarchy

### May 10, 2026 (Earlier) - Premium ESG Dashboard Enhancements (Phases 1-4)

#### Phase 1: Scope 3 KPIs & Charts (COMPLETED)
1. **New KPI Cards**:
   - Scope 3 Total Emissions card with VALUE CHAIN badge
   - Categories Reported card (of 15 GHG Protocol categories)
   - Methodology Split card (Activity/Spend/Supplier breakdown)
   - All cards conditionally render based on `hasScope3Access` and data availability

2. **New Visualizations**:
   - Scope 1, 2, 3 Emissions Comparison Area Chart with gradient fills
   - Scope 3 Category Breakdown horizontal bar chart with category-specific colors (C1-C15)

#### Phase 2: Base Year Trend & Facility Comparison (COMPLETED)
1. **Base Year Comparison Card**:
   - Fetches base year data from `/api/base-year-emissions`
   - Displays current vs base year totals with percentage change badge
   - Scope-wise comparison bars showing base vs current values
   - Horizontal bar chart visualization for scope comparison

2. **Facility Emissions Breakdown Chart**:
   - Stacked bar chart showing Scope 1, 2, 3 distribution per facility
   - Top 6 facilities displayed by total emissions
   - Custom tooltips with full facility names

#### Phase 3: Methodology Split Analysis (COMPLETED)
1. **Methodology Donut Chart**:
   - Visualizes Scope 3 data collection approach (Activity, Spend, Supplier-specific)
   - Gradient fills for premium appearance
   - Legend with percentage labels in pill-style badges

#### Phase 4: Premium UI Styling (COMPLETED)
1. **Glassmorphism Effects**:
   - All cards use `backdrop-blur-xl bg-white/70` for glass effect
   - Soft borders with `border-white/20`
   - Premium shadow effects with `shadow-xl`

2. **Animations & Hover Effects**:
   - Icon scale animation on card hover (`group-hover:scale-110`)
   - Smooth transitions on all interactive elements (`transition-all duration-300`)
   - Hover state backgrounds on list items

3. **Color Coding**:
   - Consistent scope colors: Scope 1 (Emerald), Scope 2 (Blue), Scope 3 (Purple), Biogenic (Amber)
   - Methodology colors: Activity (Blue), Spend (Emerald), Supplier (Purple)
   - 15 distinct colors for Scope 3 categories (C1-C15)

4. **Enhanced Tooltips**:
   - All chart tooltips use glassmorphism styling
   - `backdrop-blur(8px)` with semi-transparent backgrounds
   - Rounded corners (12px) and modern shadows

### May 9, 2026 - Monthly vs Yearly Data Entry Support

#### Phase 3: Edit Dialog Support (COMPLETED)
1. **Edit Mode Frequency Detection**:
   - `editFrequencyType` state loads from `emission.frequency_type` (defaults to 'monthly' for legacy)
   - Frequency is locked and cannot be changed when editing
   - Warning message explains deletion is required to change frequency

2. **Yearly Edit UI**:
   - "Annual Entry" badge (purple) with lock icon
   - Read-only "Reporting Year" display showing CY/FY format
   - Helper text: "Annual entry - reporting period cannot be changed"
   - "Annual Totals" badge next to input fields section
   - Field labels show "(Annual Total)" suffix

3. **Monthly Edit UI**:
   - "Monthly Entry" badge (blue) with lock icon
   - Standard MonthYearPicker for reporting month selection
   - Consistent with existing edit behavior

4. **Emissions List Enhancement**:
   - "Y" badge displayed next to reporting period for yearly records
   - Compact purple indicator with tooltip "Annual Entry"

5. **Reset on Close**:
   - `editFrequencyType` resets to 'monthly' when dialog closes

#### Phase 1: Backend Foundation (COMPLETED)
1. **Database Model Changes**:
   - Added `frequency_type` field to EmissionRecordCreate model ("monthly" | "yearly", default: "monthly")
   - Reporting period format: Monthly="YYYY-MM", Yearly="CY2025" or "FY 2025-2026"
   - Frequency type is locked once saved (cannot be changed on update)

2. **Backend Validation**:
   - Validates reporting_period format based on frequency_type
   - Prevents duplicate yearly records for same scope/category/subcategory/year
   - PUT endpoint blocks frequency_type changes

3. **C7 Yearly Endpoints**:
   - `POST /api/emissions/c7/yearly` - Create/update yearly C7 entry (per-employee annual totals)
   - `GET /api/emissions/c7/yearly/{facility_id}/{reporting_year}` - Get yearly C7 entry

#### Phase 2: Frontend Entry Form (COMPLETED)
1. **Frequency Selection UI**:
   - Radio buttons added after year selection in Step 3
   - "Monthly" (default) or "Yearly" options
   - Locked when editing (shows warning message)
   - Step indicator updates dynamically ("Monthly Data" vs "Annual Data")

2. **Yearly Data Entry Form**:
   - Same input fields as monthly, without month selector
   - Supports: Process Emissions, Dynamic calc engine fields, Legacy simple inputs
   - Density input for volume units
   - Badge showing "Annual Entry" with year info

3. **C7 Employee Commuting Yearly Mode**:
   - MultiEmployeeInput supports `frequencyType` prop
   - Per-employee annual totals (one entry per employee instead of 12 months)
   - Yearly calculate button and calculation details display
   - Accordion shows "Annual Entry" badge and yearly emissions

4. **Submit Handler Updates**:
   - Handles yearly mode for regular emissions
   - Handles yearly mode for C7 Employee Commuting
   - Calls appropriate endpoints based on frequency type

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

### P0 (Immediate - Monthly vs Yearly Enhancement)
- **Phase 4**: Listing & Filtering - Add frequency filter/indicators to emissions list
- **Phase 5**: Dashboard Aggregations - Prevent double counting for mixed datasets
- **Phase 6**: Reports/Exports & Base Year updates for frequency support

### P1 (High Priority)
- Separate Reporting Sections for Scope 1&2 vs Scope 3 in report_generator.py
- Missing Database Mappings for C15 Supplier Method
- Expand Bulk Upload to Scope 1 & Scope 2
- 'Copy as test case' button in Calculation Sandbox

### P2 (Medium Priority)
- C10 Fugitive Emissions Live Calculation fix (user paused)
- React Hydration Warnings in EmissionEntryForm.js
- CBAM module and report template
- Auto-save for GHG Emissions

### P2 (Technical Debt)
- Refactor `/app/backend/server.py` (~8900 lines) into structured package
- Refactor `/app/frontend/src/pages/Emissions.js` (~6400 lines)
- Refactor `/app/frontend/src/components/EmissionEntryForm.js` (~5800 lines)
- Refactor `/app/frontend/src/pages/BaseYearEmissions.js` (~1870 lines)
- Refactor `/app/frontend/src/pages/Dashboard.js` (~1600 lines)

## Key Files Modified This Session (May 10, 2026)
- `/app/frontend/src/pages/Dashboard.js` - Complete Premium ESG Dashboard overhaul:
  - Added imports: `AreaChart`, `Area`, `RadialBarChart`, `RadialBar`, `ComposedChart`, `Activity`, `Layers`, `PieChartIcon`, `Target`, `Users`, `Truck`, `Zap`, `BarChart3`, `Globe`
  - New constants: `SCOPE3_CATEGORY_COLORS`, `METHODOLOGY_COLORS`, `glassCardStyle`, `glassCardHover`
  - New state: `baseYearData` for base year comparison
  - New useMemo hooks: `baseYearComparison`, `methodologyData`, `facilityComparisonData`
  - New fetch: `fetchBaseYearData()` called on mount
  - New sections: Scope 3 KPI row, Base Year Comparison card, Methodology Donut chart, Facility Scope Comparison chart
  - All chart cards updated with glassmorphism styling

## Key Files Modified Previous Session (May 9, 2026)
- `/app/backend/server.py` - BaseYear Pydantic models (justification, scope_group), PATCH endpoint with change_reason, scope_group filtering for oldest-year and emission-combinations endpoints
- `/app/frontend/src/pages/BaseYearEmissions.js` - Complete Phase 2 UI overhaul: separate scope group cards, renderScopeGroupCard component, scope badges in all dialogs, scope-aware entity click handling
- `/app/frontend/src/pages/Emissions.js` - Phase 3 Edit Dialog: editFrequencyType state, frequency badge/lock indicator, yearly read-only year display, "Y" badge in emissions list
- `/app/frontend/src/components/EmissionEntryForm.js` - Phase 2 frequency toggle, yearly data entry forms

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
