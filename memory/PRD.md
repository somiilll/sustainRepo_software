# SustainRepo — Product Requirements Document

## Original Problem Statement
A full-stack ESG/Sustainability reporting platform (SustainRepo) with a Deterministic Internal Data AI engine that routes natural language to MongoDB queries. Built with React + Shadcn UI frontend, FastAPI + MongoDB backend.

## Core Architecture
- **Backend**: FastAPI, MongoDB (Motor), Python
- **Frontend**: React, Shadcn UI, TailwindCSS
- **AI Engine**: Deterministic routing — LLMs used only for intent mapping and JSON formatting; data retrieval is purely programmatic
- **Auth**: JWT-based custom authentication
- **Integrations**: OpenAI GPT 5.6 Sol (Emergent LLM Key), Resend (emails)

## Key Modules
1. **GHG Emissions** — Scope 1/2/3/Biogenic emission tracking with multi-fuel, custom fuel, process emissions
2. **Internal Data AI** — Natural language querying of ESG data with deterministic routing
3. **BRSR/GRI Reporting** — Framework-based ESG response management
4. **Approval Workflows** — Multi-level approval for emission records
5. **Calc Engine** — Formula-based emission calculations with decision trees
6. **Repo Pilot** — Document analysis with OCR and AI
7. **KPI Engine** — Role-based KPI assignments and dashboards
8. **Targets** — Emission reduction target tracking
9. **MIS Reports** — Scheduled report generation
10. **Supplier Assessment** — Supply chain ESG evaluation

## What's Been Implemented

### Airport-Based Flight Distance (C6 Business Travel) — Aug 2026
- **Backend**: `modules/airports/` — Airport reference service + router
  - CSV import (~9,053 airports with IATA codes) into MongoDB `airports` collection on startup
  - `GET /api/airports/search?q=<query>` — Search by IATA, name, city, country (returns top 15)
  - `POST /api/airports/calculate-distance` — Haversine great-circle distance between two IATA codes with full audit trail
  - Indexes on iata_code, airport_name, city, country
- **Frontend**: 
  - `AirportSearchInput.js` — Reusable searchable autocomplete component
  - `FlightDetailsSection.js` — Per-month flight details with two modes:
    1. Airport Lookup: Select From/To airports → auto-calculate distance (overridable)
    2. Manual Distance: Direct distance entry (existing behavior)
  - Integrated into `Step3YearMonthlyData.js` for both monthly and yearly frequency
  - Only appears when category contains "c6" AND scope3ActivityType is "air_travel"
- **Payload**: `Scope3FlatCreate.js` and `Scope3FlatEdit.js` updated to include `from_airport`, `to_airport`, `flight_distance` in emission records
- **Edit Hydration**: `EmissionEntryForm.js` hydrates airport/flight data when editing existing records
- **Backward Compatible**: Previous records without airport data show empty fields

### Internal Data AI — Multi-Period Comparison (Aug 2026)
- Deterministic expansion for "compare … all months of FY [year]" into April–March strict-month comparisons
- tCO2e unit enforcement throughout

### Earlier Completed Features
- Full GHG emission CRUD with Scope 1/2/3/Biogenic
- Custom fuel support with per-month CV/density/EF overrides
- Process emissions with template-based formulas
- C7 Employee Commuting multi-employee mode
- Calc Engine with decision tree formula resolution
- BRSR yearly section management
- Approval workflows
- OCR invoice import
- KPI v2 role-based access
- Target tracking
- MIS scheduled reports
- Supplier assessment
- Peer benchmarking
- Materiality assessment

## Pending Issues
1. **P1**: BRSR Section A stale form data on year switch
2. **P2**: Playwright E2E locator timeouts on Shadcn Select elements
3. **P2**: Expand live API integration tests for Internal AI

## Upcoming Tasks (P1)
- Custom Dashboard: Wire ExecutiveAnalyticsDashboard to consume custom kpi_cards
- Target Settings UI: Explicit target_direction configuration
- Hash-based Integrity Verification for Evidence Files (SHA-256)
- Supplier and Customer Org Onboarding Wizards
- BRSR Word (.docx) download + Previous Year Columns
- MIS Schedule Preview & Report Bookmarks

## Future/Backlog Tasks
- **P2**: Decouple Add/Edit Emissions into unified EmissionDraft workflow
- **P2**: Copy Month Values for Custom Fuel EF/CV values
- **P2**: Split response_builder.py (>900 lines) into smaller modules
- **P3**: Dashboard Scope 1 & 3 Emissions Deduplication
- **P3**: Admin Disable UI for ESG subcategories per organization

## Refactoring Needs
- `repo_pilot/router.py`: Standardize R2 bucket paths (org_id vs org_name)
- `BRSRYearlySections.js`: Oversized, needs splitting
- `response_builder.py`: >900 lines, needs modularization

## Key DB Collections
- `organization_esg_responses`: Framework responses (BRSR, GRI)
- `organizations`: Org metadata
- `airports`: Airport reference data (IATA, name, city, country, lat/lon)

## Test Credentials
See `/app/memory/test_credentials.md`
