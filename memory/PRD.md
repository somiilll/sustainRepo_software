# SustainRepo - GHG Calculation Platform PRD

## Original Problem Statement
Multi-tenant Greenhouse Gas (GHG) calculation platform with dynamic, configuration-driven emissions calculation engine managed by SuperAdmin.

## Core Architecture
- **Frontend:** React + Tailwind CSS + Shadcn UI
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **3rd Party:** Anthropic (AI summaries), Resend (emails), ReportLab (PDF), Matplotlib (charts)

## What's Been Implemented
- Dashboard with emission data visualization
- Emissions, GHG Sinks, Facilities, Organization modules
- PDF report generation (AI Executive Summary + GHG Inventory Report)
- SuperAdmin panel for managing organizations, formulas, GWP config
- Role-based access control
- User invitation and password reset via Resend
- Multi-step emission entry form (EmissionEntryForm.js) and inline edit form (Emissions.js)
- Equity Share Approach
- Process Template module
- MonthYearPicker component
- Dismissible subscription warning banner

## Completed Fixes (2026-03-17)
- **P0 FIX:** "Failed to save emissions" ReferenceError in EmissionEntryForm.js - `co2Formula`, `ch4Formula`, `n2oFormula` were scoped inside `else` block but referenced outside. Fixed by hoisting to `let` declarations before if/else.
- **P0 FIX:** GWP property name mismatch in Emissions.js `computeFreshEmissions` - used `gwp_co2` instead of correct `co2_gwp`, `gwp_ch4_fossil` instead of `ch4_fossil_gwp`, `gwp_n2o` instead of `n2o_gwp`.
- **P1 FIX:** Mobile Combustion CH4/N2O now correctly stored as 0 when no formula defined. Cards always show all 4 gas columns (CO₂, CH₄, N₂O, CO₂e) with 0 values when no formula exists.
- **UI FIX:** Emission cards always display consistent 4-column gas breakdown layout.

## Completed Fixes (2026-03-19)
- **UI FIX:** Renamed "No N2O formula defined", "No formula defined", "No CO₂e formula defined" to "Not Applicable" in Edit Emission dialog
- **UI FIX:** Updated default output units from 'kg CO₂' to 'tCO₂' and 'kg CO₂e' to 'tCO₂e' for cleaner display in Scope 1 calculations
- **UI FIX:** Added more bottom margin (mb-8) below "Fuel Type *" in Create GHG emissions form to fix overlapping issue

## Completed Fixes (2026-03-20)
- **UI FIX (Issue 1):** Aligned Quantity and Person Responsible fields on same row with `items-end` in Edit GHG dialog (both Process Emissions and regular sections)
- **UI FIX (Issue 2):** Fixed Scope 2 unit display - normalized "tco2/mW" to "tCO₂" for CO₂ and "tCO₂e" for CO₂e in Calculated Emissions section
- **UI FIX (Issue 3):** Added bottom padding and border separator below Fuel Type dropdown in Create Emission form (Step 1)
- **UI FIX (Issue 4):** Changed override options spacing from `space-y-4` to `space-y-3` for consistent vertical gaps between Calorific Value, Density Value, and Custom CO2 Emission Factor
- **UI FIX (Issue 5):** Changed all number inputs from restrictive `step` values to `step="any"` to fix browser validation messages
- **UI FIX:** Dashboard Emissions Trend chart Y-axis now starts from 0 (using `domain={[0, 'auto']}`)
- **UI FIX:** Scope 2 Custom Emission Factor justification text updated to "Justification/Comments"
- **UI FIX:** Added "(Values rounded to 2 decimal places)" note in Calculated Emissions section header
- **VALIDATION FIX:** Generate Report - Production Quantity and Unit must both be filled or both empty
- **REPORT FIX:** Internal Performance Tracking and GHG Reduction Initiatives sections now show "NA" if admin hasn't provided data
- **UX FIX:** Added calculation loading state - Save button is disabled and shows "Calculating..." spinner while emissions recalculate after changing override values (Calorific Value, Density, Custom CO₂ EF). Prevents race condition errors.

## Pending Issues
- **P2:** GHG Inventory report may show extraneous text when no charts generated
- **P3:** CH₄ GWP doesn't differentiate fossil vs non-fossil fuel types
- **P3:** Frontend dropdowns have hardcoded values (scopes, categories, units)

## Upcoming Tasks
- **P1:** Public-facing landing page
- **P1:** Scope 3 emissions module
- **P2:** Formula breakdown in emissions UI
- **P2:** CBAM module and report template

## Future/Backlog
- Refactor backend/server.py into proper package structure
- Consolidate duplicated emission form logic (EmissionEntryForm.js + Emissions.js)
- Hardcoded frontend dropdowns → dynamic from backend

## Credentials
- SuperAdmin: superadmin@ecotrack.com / SuperAdmin123!
- Admin: testadmin@test.com / Test123!
