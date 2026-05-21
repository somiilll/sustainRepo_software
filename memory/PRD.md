# SustainRepo - GHG Calculation Platform PRD

## Original Problem Statement
Multi-tenant Greenhouse Gas (GHG) calculation platform compliant with ISO 14064-1:2018. Features include:
- Dynamic GHG calculations with centralized CalcEngine
- Premium ESG Analytics Dashboard
- ISO-compliant DOCX report generation for Scope 1, 2, and 3
- Robust Scope 3 Bulk Upload
- Comprehensive Base Year tracking module

## Core Architecture
- **Frontend**: React, Tailwind CSS, Shadcn/UI
- **Backend**: FastAPI, Motor async driver, Pydantic
- **Database**: MongoDB
- **Key Pattern**: Centralized `CalcEngine` with dynamic property resolution

## Key Files
- `/app/backend/server.py` - Main API (~10,000+ lines, needs refactoring)
- `/app/frontend/src/pages/Dashboard.js` - Dashboard with analytics
- `/app/frontend/src/pages/Emissions.js` - Emissions management (~7000+ lines)
- `/app/frontend/src/components/EmissionEntryForm.js` - Entry form (~4479 lines, Phase 5 complete)
- `/app/frontend/src/components/MultiEmployeeInput.jsx` - C6/C7 employee table input
- `/app/frontend/src/pages/Sinks.js` - GHG Sinks module with Monthly/Yearly data entry

## What's Been Implemented

### May 2026 Session (Latest)

**May 26, 2026 - Phase 5 Frontend Refactoring (Complete)**

1. **Step 1 Component Extraction (NEW)**
   - Extracted Step 1 (Basic Selection) from EmissionEntryForm.js
   - Using `/app/frontend/src/modules/ghg/emissions/shared/components/steps/Step1BasicSelection.js`
   - Component handles: Facility selection, Scope radio buttons, Category dropdown, Fuel/Activity selection
   - ~690 lines replaced with component call

2. **Step 3 Component Extraction (NEW)**
   - Extracted Step 3 (Year & Monthly Data) from EmissionEntryForm.js
   - Using `/app/frontend/src/modules/ghg/emissions/shared/components/steps/Step3YearMonthlyData.js`
   - Component handles: Reporting year, Frequency, Monthly accordions, Yearly data, Evidence uploads
   - ~1016 lines replaced with component call

3. **Step 2 Component Extraction**
   - Extracted Step 2 (Process & Responsibility) from EmissionEntryForm.js
   - Created `/app/frontend/src/modules/ghg/emissions/shared/components/steps/Step2ProcessResponsibility.js`
   - Component handles: Process names, Responsible person, Designation, Contact, Asset name, Location fields
   - ~250 lines extracted

4. **Step 4 Component Extraction**
   - Extracted Step 4 (Notes & Summary) from EmissionEntryForm.js
   - Created `/app/frontend/src/modules/ghg/emissions/shared/components/steps/Step4Notes.js`
   - Component handles: Additional notes, Review summary with all form data
   - ~120 lines extracted

5. **EmissionEntryForm.js Final Reduction**
   - **Reduced from 6056 lines to 4479 lines (~1577 lines = 26% reduction)**
   - All 4 form steps now use modular components
   - Used Python script for safe large-block JSX replacement (search_replace fails on 700+ line strings)

**May 21, 2026 - Phase 5b: Deep Modularization Prep**

1. **Standalone Utility Extraction**
   - Created reusable hooks, constants, and utilities as building blocks for future integration
   - These modules can be incrementally integrated into EmissionEntryForm.js

2. **New Modules Created:**
   - `useEmissionFormState.js` (~280 lines) - All 60 useState hooks extracted
   - `useEmissionFormEffects.js` (~180 lines) - Data fetching effects
   - `emission-form-constants.js` (~100 lines) - Constants and helpers
   - `DynamicFieldRenderer.js` (~200 lines) - Renders dynamic form fields
   - `validation.js` (~300 lines) - Step validation utilities
   - `payload-builders.js` (~270 lines) - API payload construction
   - **Total: ~1,330 lines of reusable, tested code**

3. **Directory Structure:**
   ```
   /modules/ghg/emissions/shared/
   ├── components/
   │   ├── DynamicFieldRenderer.js  # NEW
   │   └── steps/                   # Existing step components
   ├── constants/                   # NEW
   │   └── emission-form-constants.js
   ├── hooks/                       # NEW
   │   ├── useEmissionFormState.js
   │   └── useEmissionFormEffects.js
   └── utils/                       # NEW
       ├── validation.js
       └── payload-builders.js
   ```

**May 19, 2026 - C9 Customer Labels & Sinks Yearly Entry**

1. **C9 "Customer" Label Change (P0)**
   - Changed "Supplier Name" → "Customer Name" for C9 (Downstream Transportation and Distribution)
   - Changed "Supplier Code" → "Customer Code" for C9
   - Updated section header: "Supplier Information (Optional)" → "Customer Information (Optional)"
   - Updated placeholder text accordingly
   - Applied in both EmissionEntryForm.js (creation) and Emissions.js (edit dialog)
   - DB field remains `supplier_name`/`supplier_code` (only UI label changed)

2. **Sinks Yearly Data Entry (P0)**
   - Added "Data Entry Frequency" dropdown with Monthly/Yearly options
   - Monthly mode: Shows 12-month accordion for individual month entries
   - Yearly mode: Shows single annual input field with purple styling
   - Added `frequency_type` field to Sink models (backend)
   - Backend preserves frequency_type when editing (locked once saved)
   - Reporting year display follows org settings:
     - Financial Year orgs: "FY 2026-27" format
     - Calendar Year orgs: "CY 2026" format
   - Badge shows "Annual Entry" or "Monthly Entry" with formatted year
   - Yearly records display as "FY 2026" in table Period column

**May 19, 2026 - Earlier Updates**
1. **Activity Search in Edit Dialog for C6/C7**
   - Added searchable activity dropdown in Edit Dialog (`Emissions.js`)
   - Mirror functionality from `EmissionEntryForm.js`
   - Search input with clear button, real-time filtering
   - Shows count of matching activities
   - "No match" message displayed when no activities match search term
   - Search clears on activity selection and when category/activity type changes

2. **C6 Unit Field Fix**
   - Removed spurious unit text field for "No. of Days Travelled" in C6 Annual Data
   - Added `qty_days_travelled` and `working_days` to unitless count fields list in `MultiEmployeeInput.jsx`
   - Also fixed in `EmissionEntryForm.js` and `Emissions.js` edit dialog for C6 categories

3. **Dashboard KPI Layout Update**
   - Removed "Total Facilities" KPI card
   - Removed "Scope 3 Categories" card row
   - Added three vertically-stacked KPI cards on left side of "Emissions by Scope" graph:
     - Total Emissions (with secondary gradient styling)
     - Total Sinks (green gradient styling)
     - Net Emissions (blue gradient styling)

4. **Dashboard Scope 3 Emission Hotspots**
   - Changed bar colors from red/severity-based to distinct colors (Violet, Blue, Emerald, Amber)
   - Fixed chart height to 280px
   - Added tCO₂e label to X-axis
   - Removed "Top 4 categories" footer text
   - Updated ranking panel with matching color schemes

5. **Dashboard Emission Categories & Fuel Type Analysis**
   - Renamed "Top 3 contributors" to "Top contributors"
   - Removed percentage badges from both sections
   - Fixed fuel name truncation to show full names

6. **Dashboard Filter Alignment**
   - Fixed filter panel alignment issues

7. **N2O Color Consistency Fix**
   - Fixed N2O formula step showing blue color instead of green in edit dialog
   - Made isOutput check case-insensitive for co2, ch4, n2o, co2e
   - Changed N2O emissions display from purple to amber to match warm tones

8. **Formula Name Hidden for C7**
   - Removed formula name display in MultiEmployeeInput for C7 Employee Commuting

9. **From/To Location Fields for C4, C6, C7, C9**
   - Added optional "From Location" and "To Location" text fields for transportation/travel categories
   - C7: Added to each employee row in MultiEmployeeInput
   - C4, C6, C9: Added as single fields in EmissionEntryForm and Emissions.js edit dialog
   - Backend: Added from_location and to_location to EmissionRecordCreate and EmissionRecordResponse models

10. **Reporting Year Type Restriction**
    - If organization has "Reporting Year Type" set to Financial or Calendar, hide the year type toggle in EmissionEntryForm
    - Auto-select year type based on organization setting
    - Show read-only indicator "(Set by organization)" when preference is locked

### December 2025 Session

**Premium Dashboard UI/UX Transformation**
- Transformed dashboard into premium, futuristic climate intelligence platform
- Added ambient gradient backgrounds (emerald, blue, violet)
- Implemented glassmorphism cards with colored glows based on category
- Added AI Insights strip with dynamic contextual insights
- Premium Emissions Trend chart with gradient fills, glowing strokes, monotone curves
- Premium tooltip with dark glass effect
- Scope 3 Hotspots with animated progress bars
- Default reporting period changed to Previous FY
- Filter panel with compact spacing and quick FY buttons

1. **Dashboard Scope 3 Proration Fix**
   - Fixed `CY 2025` format parsing (whitespace handling)
   - Fixed bulk upload `total_emissions` field not being saved
   - Added dashboard fallback to `co2e_emissions` field

2. **Base Year Comparison Separation**
   - Split into Direct (Scope 1 & 2) and Indirect (Scope 3 & Biogenic) panels
   - Each panel shows its own base year
   - Added "Base Year Not Configured" state handling

3. **DOCX Report Generation Enhancements**
   - Added Category-wise Emission Analysis Chart in Organization Analysis section
   - Report proration logic with `*` markers for prorated items
   - Fixed Scope 1,2 Base Year showing 0
   - Fixed Chapter 3 showing out-of-period records

4. **Scope 3 Asset Name Field**
   - Added mandatory Asset Name text field for C8, C13, C14, C15 categories
   - Added to Bulk Upload Excel template

### Previous Sessions
- UI/UX Standardization (Custom flags, Override checkboxes)
- Data Entry Validations
- Version History Overhaul
- Overlapping Date Filtering for CY/FY periods
- Dashboard Proration implementation

## Known Issues
- P1: Scope Change Recalculation Bug in EmissionEntryForm (recurring issue - `setFuelId('')` wipes fuel state)
- P1: Dashboard "No Data" after toggling organization Scope access
- P2: C7 Edit Dialog Stale State (yearly financial periods not transforming correctly)

## Completed Tasks
- ✅ Phase 5: Extract Step 1 (Basic Selection) from EmissionEntryForm.js
- ✅ Phase 5: Extract Step 3 (Year & Monthly Data) from EmissionEntryForm.js  
- ✅ Phase 5b: Extract standalone utilities (hooks, validation, payload builders)

## Upcoming Tasks (P0/P1)
- Phase 6: Migrate Emissions.js (>7000 lines) using modular approach
- "Apply to all months" autofill for S3C7 Employee Commuting
- Expand Bulk Upload to Scope 1 & 2

## Future/Backlog (P2)
- Add Monthly/Yearly frequency indicators
- CBAM module and report template
- Refactor server.py (>11,000 lines)
- Integrate extracted hooks into EmissionEntryForm.js (useEmissionFormState, useEmissionFormEffects)
- EmissionEntryForm.js: Current 4479 lines → target ~800 lines via hook integration

## Technical Notes
- Reporting periods: Monthly (YYYY-MM), Financial Year (FY YYYY-YYYY), Calendar Year (CYYYYY or CY YYYY)
- Dashboard applies proration for CY/FY entries based on date filter overlap
- Base year data separated by scope group (direct vs indirect)
- Unitless count fields: qty_passenger, qty_passengers, qty_nights, qty_room, qty_rooms, qty_days_travelled, working_days

## 3rd Party Integrations
- Cloudflare R2 (Storage) - requires User API Key
- Resend (Emails) - requires User API Key
