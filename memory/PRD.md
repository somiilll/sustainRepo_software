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

### Internal Data AI — Formatter Refactor & Live API Contracts (Aug 2026)
- Split the 908-line `response_builder.py` into focused formatter modules for Markdown tables, GHG/fuel responses, comparisons, ESG records, framework responses, evidence payloads, and response safety.
- Kept `build_response` as the orchestration boundary and preserved legacy private formatter exports for current regression tests and extensions.
- Added authenticated `/api/internal-ai/chat` contracts for single-metric, year-over-year, and scope-breakdown questions.
- Added recursive response-data sanitization so database identifiers are not returned in client-facing `raw_data`.
- Verified with 33 focused backend tests, including live endpoint contracts; **MOCKED APIs: NONE**.

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

## GHG Add/Edit Modularization Programme (started Jun 2026)

Goal: one shared, configuration-driven GHG form for Create and Edit, with clean
separation of UI / state / validation / calculation / EF lookup / unit
conversion / evidence / approval / persistence, so that future
**organization-specific** GHG customization is delivered through configuration
overrides instead of duplicated React components or hardcoded organization IDs.

Hard rule for the whole programme: **same input → same output.** Architecture
changes; calculation results do not. Existing inconsistencies are reported
separately, never silently "fixed" during a refactor.

Reference documents:
- `/app/memory/GHG_REFACTOR_AUDIT.md` — full A–S audit, target architecture, folder plan
- `/app/memory/GHG_PHASE0_REPORT.md` — Phase 0 results, coverage, inconsistencies
- `/app/memory/GHG_FRONTEND_EVALUATOR_INVESTIGATION.md` — frontend evaluator trace

### Phase status

| Phase | Description | Status |
|---|---|---|
| 0 | Golden records + regression safety net | **DONE (Jun 2026) — awaiting user review** |
| 1 | Create-flow field-derivation extraction | NOT STARTED (gated on Phase 0 review) |
| 2 | Edit-flow field-derivation extraction | NOT STARTED |
| 3 | Capability config replaces category string sniffing | NOT STARTED |
| 4 | Service extraction (units, EF, calc, evidence, API client) | NOT STARTED |
| 5 | Unified form state + record adapters | NOT STARTED |
| 6 | Field registry + one shared `<GhgForm mode>` | NOT STARTED |
| 7 | Declarative validation engine | NOT STARTED |
| 8 | Dead-code removal + frontend evaluator cleanup | NOT STARTED (deferred by user) |
| 9 | Organization override layer (seed/JSON first, Super Admin UI later) | NOT STARTED |

### Phase 0 — Golden Safety Net (Jun 2026) — COMPLETE

- `backend/tests/golden/` — read-only capture script + 6 baselines + 6 pytest suites
- Frontend Jest golden suites for the already-extracted pure modules
- **642 tests passing** (497 backend, 145 frontend incl. 63 snapshots)
- Coverage: 89 calculation replay fixtures / 55 buckets / 26 scope-category
  combinations / 18 formulas; 72 live-endpoint fixtures; 22 decision trees and
  134 leaves; 83 formula-selection fixtures; form config for all 24 categories;
  record contract for all 114 buckets
- Verified read-only: `emission_records` 840, `ce_calculation_audit_logs` 1339,
  `emission_history` 1754 — unchanged before and after
- 11 pre-existing inconsistencies documented (see report §6). Highest priority:
  duplicate active `Stationary Combustion` / `Mobile Combustion` category ids,
  and two independent `inflation_rate` resolution paths for spend basis
- Nothing else changed: no dead code deleted, no schema/API/formula/EF/unit change

## Pending Issues
1. **P1**: BRSR Section A stale form data on year switch
2. **P2**: Playwright E2E locator timeouts on Shadcn Select elements

## Upcoming Tasks (P1)
- Custom Dashboard: Wire ExecutiveAnalyticsDashboard to consume custom kpi_cards
- Target Settings UI: Explicit target_direction configuration
- Hash-based Integrity Verification for Evidence Files (SHA-256)
- Supplier and Customer Org Onboarding Wizards
- BRSR Word (.docx) download + Previous Year Columns
- MIS Schedule Preview & Report Bookmarks

## Future/Backlog Tasks
- **P1 (data decision, blocks Phase 1)**: Resolve duplicate active category ids for `Stationary Combustion` and `Mobile Combustion`
- **P1**: Reconcile the two `inflation_rate` / `ppp` resolution paths for spend-basis Scope 3
- **P2**: Decouple Add/Edit Emissions into unified EmissionDraft workflow (superseded by the GHG Modularization Programme above)
- **P2**: Copy Month Values for Custom Fuel EF/CV values
- **P3**: Dashboard Scope 1 & 3 Emissions Deduplication
- **P3**: Admin Disable UI for ESG subcategories per organization

## Refactoring Needs
- `repo_pilot/router.py`: Standardize R2 bucket paths (org_id vs org_name)
- `BRSRYearlySections.js`: Oversized, needs splitting

## Key DB Collections
- `organization_esg_responses`: Framework responses (BRSR, GRI)
- `organizations`: Org metadata
- `airports`: Airport reference data (IATA, name, city, country, lat/lon)

## Test Credentials
See `/app/memory/test_credentials.md`
