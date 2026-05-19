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
- `/app/frontend/src/components/EmissionEntryForm.js` - Entry form (~6000 lines)
- `/app/frontend/src/components/MultiEmployeeInput.jsx` - C6/C7 employee table input

## What's Been Implemented

### May 2026 Session

**Latest Updates (May 19, 2026)**
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

3. **Dashboard KPI Layout Update**
   - Removed "Total Facilities" KPI card
   - Removed "Scope 3 Categories" card row
   - Added three vertically-stacked KPI cards on left side of "Emissions by Scope" graph:
     - Total Emissions (with secondary gradient styling)
     - Total Sinks (green gradient styling)
     - Net Emissions (blue gradient styling)

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
- P0: Scope Change Recalculation Bug in EmissionEntryForm (recurring issue - `setFuelId('')` wipes fuel state)
- P0: Dashboard "No Data" after toggling organization Scope access

## Upcoming Tasks (P1)
- "Apply to all months" autofill for S3C7 Employee Commuting
- Expand Bulk Upload to Scope 1 & 2

## Future/Backlog (P2)
- Add Monthly/Yearly frequency indicators
- CBAM module and report template
- Refactor server.py (>10,000 lines)
- Refactor Emissions.js (>7000 lines)
- Refactor EmissionEntryForm.js (>6000 lines)

## Technical Notes
- Reporting periods: Monthly (YYYY-MM), Financial Year (FY YYYY-YYYY), Calendar Year (CYYYYY or CY YYYY)
- Dashboard applies proration for CY/FY entries based on date filter overlap
- Base year data separated by scope group (direct vs indirect)
- Unitless count fields: qty_passenger, qty_passengers, qty_nights, qty_room, qty_rooms, qty_days_travelled, working_days

## 3rd Party Integrations
- Cloudflare R2 (Storage) - requires User API Key
- Resend (Emails) - requires User API Key
