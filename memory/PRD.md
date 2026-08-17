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
- `/app/memory/GHG_CATEGORY_IDENTITY_ANALYSIS.md` — same-name categories: not duplicates, no migration needed
- `/app/memory/GHG_INFLATION_RECONCILIATION.md` — three inflation paths, proposed single source of truth
- `/app/memory/GHG_COVERAGE_DASHBOARD.md` — per-category regression coverage matrix
- `/app/memory/GHG_PHASE1_REPORT.md` — Phase 1 Create-flow refactor result and remaining coupling

### Phase 1 — Create-flow field derivation (Jun 2026) — COMPLETE

- New pure config layer `frontend/src/modules/ghg/config/`: `deriveGhgFields`, `resolveGhgFormContext`, `resolveGhgConfig`, `categoryRules`, `overrideSchema`
- Org override extension point in place: whitelisted keys, returns the standard config **by reference** when no overrides exist (no UI, no endpoint, no org conditionals)
- Canonical category identity `(code, scope_code)` preferred, display name kept as fallback
- Equivalence proven against a frozen copy of the pre-refactor logic: 24 categories × 158 decision paths × 4 fuel variants = **785 assertions**
- Tests: backend 497 passed / 9 skipped (unchanged), frontend 950 passed / 63 snapshots (was 145), 0 failures, 0 snapshot changes, 0 calculation changes
- Read-only verified: `emission_records` 840, `ce_calculation_audit_logs` 1339, `emission_history` 1754 unchanged
- Untouched as instructed: Edit flow, C7, inflation, evidence, approval, frontend evaluator, dead code

### Phase 2 — Edit-flow field derivation (Jun 2026) — COMPLETE

- Removed the duplicated Edit-only field derivation in `pages/Emissions.js`; Edit now uses the same `resolveGhgFormContext → resolveGhgConfig → deriveGhgFields` pipeline as Create.
- Existing record hydration is retained separately in `hydrateEmissionForm`, `editEmissionDispatch`, and the dynamic-value/audit hydration effect. Saved formula fallback is explicit context and only applies while compatible with the current selection.
- Regression: backend golden **497 passed / 9 skipped**; frontend golden **145 passed / 63 snapshots**; full frontend **1,134 passed / 63 snapshots**; Phase 1 equivalence remains **785 assertions, 0 differences**; new Edit shared-derivation checks **185 passed**.
- Read-only UI QA verified Scope 1/2/3/Biogenic hydration, Scope 3 method changes, Biogenic selection, and custom fuel. Added a narrow guard preventing an unnecessary legacy calculation request during hydration; no calculator API payload or calculation behavior was changed.
- No snapshots, golden calculations, database schema, API contracts, C7, inflation, emission factors, formulas, units, evidence, approval, evaluator, or dead code were changed. See `GHG_PHASE2_REPORT.md` and `GHG_PHASE2_EDIT_BASELINE.md`.

### Phase status

| Phase | Description | Status |
|---|---|---|
| 0 | Golden records + regression safety net | **DONE (Jun 2026)** |
| 0b | Category identity impact analysis | **DONE (Jun 2026)** — not duplicates; canonical identity is `(code, scope_code)`; **no migration required** |
| 0c | Inflation/PPP reconciliation analysis | **DONE (Jun 2026)** — proposal awaiting approval; implementation deliberately deferred to after Phase 2 |
| 0d | Coverage dashboard | **DONE (Jun 2026)** |
| 1 | Create-flow field-derivation extraction | **DONE (Jun 2026)** — `modules/ghg/config/`; 785 equivalence assertions; 1 production file changed (−262/+62) |
| 2 | Edit-flow field-derivation extraction | **DONE (Jun 2026)** — one shared Create/Edit derivation pipeline; hydration retained separately; golden parity verified |
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
- **P1 (approval pending)**: Inflation/PPP single source of truth — fix the 2 `ce_property_source_mappings` rows, always populate `context.reporting_period`, retire the router injection path, replace the silent 1.0 default. Will require an approved re-capture of 4 spend-basis baselines. Scheduled AFTER Phase 2.
- **P1**: Resolve categories by `(code, scope_code)` instead of `(name, scope_code)` — folded into Phase 1
- **P2**: C7 Employee Commuting has zero calculation coverage (94 records, no audit log by design) — needs its own E2E test before any C7 restructuring
- **P2**: C6 airport / flight-distance fields not calculation-protected
- **P2**: Evidence upload and approval workflow are structurally protected only (write paths)
- **P3**: Pre-existing unrelated backend test failures — `test_calc_engine_phase3.py` (8 errors, empty `BASE_URL`) and `test_phase_b5_emissions_refactor.py` (8 failures, stale hardcoded counts: 20 vs 35 modules, 40 vs 337 records)
- **P3**: Radix Select hydration warning on the Add Emission modal (`<span> cannot be a child of <option>`) — pre-existing, pollutes console during automation
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
