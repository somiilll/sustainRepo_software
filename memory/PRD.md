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
