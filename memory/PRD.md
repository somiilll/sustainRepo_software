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
- `/app/memory/GHG_POST_PHASE4_ARCHITECTURE_AUDIT.md` — read-only post-Phase-4 capability completeness and organization-readiness audit
- `/app/memory/GHG_PHASE4_1_CAPABILITY_CLOSEOUT_REPORT.md` — minimum capability closeout, parity tests, final exceptions, and stop-gate evidence

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

### Phase 3 — C7 Employee Commuting safety net (Jun 2026) — COMPLETE

- Added test-only C7 safety net: 7 sanitized production-shaped fixtures and 9 backend tests (50 assertions) under `backend/tests/golden/`. **No production files changed.**
- Protects C7 identity, monthly/yearly contracts, employee shapes/counts, saved monthly/yearly/record aggregates, legacy full-year and zero-activity shapes, plus three authoritative calculator replays using `dry_run=true`.
- Regression: dedicated C7 **9 passed**; backend golden **506 passed / 9 skipped**; frontend **1,134 passed / 63 unchanged snapshots**; Phase 1 equivalence stays **785 assertions / 0 differences**. Database counts before/after unchanged: `840 / 1339 / 1763`.
- Deliberately untouched: all C7 production behavior, calculator, employees, totals, validation, API, persistence, UI, schema, C7 router, frontend C7 logic, inflation, and unrelated refactors. See `GHG_PHASE3_C7_SAFETY_NET_REPORT.md`.

### Phase 4 — Capability configuration (Aug 2026) — APPROVED SCOPE COMPLETE; AUDIT FOLLOW-UP REQUIRED

- Centralized C11 product type, C9 customer labels, C6 flight details, asset/location, activity type, multi-employee, subcategory, and compatibility exports through `resolveGhgCapabilities`.
- Post-phase read-only audit found remaining active Process/custom-fuel/fugitive/C7/static-option decisions outside the capability layer, a missing yearly C6 capability prop, duplicated registry capabilities, and an Edit call-site scope-property mismatch.
- Organization overrides are not yet end-to-end: Create does not receive overrides from the active parent, Edit passes `null`, and registry capabilities have a separate authority.
- Verification remained exact: backend golden **506 passed / 9 skipped**; frontend **1,159 passed / 63 snapshots**; capability/equivalence **810 passed**; DB counts unchanged at `840 / 1339 / 1763`. Production files changed: **0** during the audit.
- Inflation implementation remains gated pending explicit review of `GHG_POST_PHASE4_ARCHITECTURE_AUDIT.md`.

### Phase 4.1 — Capability closeout (Aug 2026) — COMPLETE; REVIEW GATE

- Fixed the Edit `effectiveScopeCode` mismatch by routing both forms through `resolveGhgFormArchitecture`, which consumes canonical `formContext.effectiveScope`.
- Active Process/fuel/custom-fuel/Fugitive/C7 UI and validation decisions now consume centralized capabilities; C6 monthly/yearly flight propagation and Edit flight fields are wired through the same path.
- Active subcategory and custom-fuel options are centralized and support the existing `fieldOptions` organization override key; one optional override input now reaches Create and Edit.
- Scope 3 registry capability flags and capability names derive from `resolveGhgCapabilities`; calculation methods, labels/options, schemas, and payload metadata intentionally remain domain metadata.
- Verification: backend **506 passed / 9 skipped**; frontend **1,189 passed / 63 unchanged snapshots**; capability/equivalence/live path **840 passed**; Phase 1 **785 passed**; C7 **9 passed**; production build compiled. Independent QA found and the agent fixed one capability TDZ issue; live Scope 1 → Scope 3 transition passed after the fix.
- DB read check: records/audit unchanged at `840 / 1339`; history `1763 → 1764` from a concurrent external C7 edit at `2026-08-17T16:10:19Z`, not from the read-only test flows. No cleanup write was performed.
- STOP: inflation, evaluator/dead-code cleanup, C7 production refactor, backend/API/schema, and unrelated GHG work remain untouched.

### Phase 5 — Organization-ready GHG configuration (Aug 2026) — COMPLETE; REVIEW GATE

- Added a small, pure frontend configuration boundary for organization-safe scope/category/subcategory visibility and field presentation. Both Create and Edit now consume the same resolved configuration architecture.
- Supported: hidden/required fields, labels, safe non-unit options, guarded display metadata, text/select presentation-only custom fields, and disabled scopes/categories/subcategories. No organization ID conditional was introduced.
- Explicitly rejected: formula, calculation-input, decision-tree, emission-factor, and unit overrides. `conditionalFields` and top-level `validationRules` remain schema-only; calculation behavior remains entirely outside overrides.
- Standard behavior is identity-stable with null overrides. Presentation custom fields never enter calculation inputs or persisted dynamic calculation values; C7 custom fields remain suppressed to preserve its dedicated contract.
- Verified read-only: frontend **1,194 passed / 63 snapshots**; backend golden **506 passed / 9 skipped**; independent UI/config verification green; DB counts unchanged at `840 / 1339 / 1764`.
- Report: `/app/memory/GHG_PHASE5_ORG_CONFIG_ARCHITECTURE_REPORT.md`. STOP: do not begin inflation, engine/backend/C7 work, evaluator/dead-code cleanup, evidence/approval refactors, or SuperAdmin UI without a new approval.

### Final GHG Refactor Completion (Aug 2026) — COMPLETE; FINAL REVIEW GATE

- Centralized active Scope 3 Create/Edit method, activity-type, and subcategory option resolution in `resolveGhgScope3Options`; standardized activity/process/C11 product display options and product-type visibility state.
- Both Create and Edit retain the shared configuration → capabilities → context → field derivation chain, now also consuming the shared presentation option resolver. No calculation, EF, unit, formula, decision-tree, C7, API, schema, evidence, approval, or inflation change was made.
- Removed only three conclusively unreachable prototype files (`EmissionEntryFormRefactored.js`, obsolete `useEmissionForm.js`, and its barrel). `evaluateFormula` remains active in process-template submission paths and is intentionally retained.
- Verified read-only: frontend **1,207 passed / 63 unchanged snapshots**; backend golden **506 passed / 9 skipped**; C7 safety **9/9**; authenticated Scope 3 smoke passed; DB counts unchanged at **840 / 1,339 / 1,764**.
- Final report: `/app/memory/GHG_FINAL_REFACTOR_REPORT.md`. STOP: await final review; do not begin inflation or unrelated work.

### Post-Refactor GHG Hardening (Aug 2026) — COMPLETE; PRODUCTION-READINESS GATE

- Performed a read-only enforcement audit of the canonical Create/Edit configuration, capability, context, field derivation, Scope 3 option, UI-state, and organization override paths. No safe production refactor candidate was found.
- Added permanent `postRefactorArchitectureContract.test.js` covering Scope 1/2/3/Biogenic parity (including C11), shared validation/UI metadata, Scope 3 options, representative organization overrides, and rejected calculation-domain override attempts.
- Confirmed `evaluateFormula` remains active in process-template submission paths and retained it; legacy EF filtering, hydration, payload adapter, and module compatibility code were intentionally untouched.
- Verified: frontend **1,223 passed / 63 unchanged snapshots** (the +16 tests are the new contract guard); backend **506 passed / 9 skipped**; DB counts unchanged at **840 / 1,339 / 1,764** with no writes.
- Report: `/app/memory/GHG_POST_REFACTOR_HARDENING_REPORT.md`. STOP: do not begin another GHG, inflation, backend, C7, evidence/approval, or unrelated ESG phase without a new instruction.

### Phase status

| Phase | Description | Status |
|---|---|---|
| 0 | Golden records + regression safety net | **DONE (Jun 2026)** |
| 0b | Category identity impact analysis | **DONE (Jun 2026)** — not duplicates; canonical identity is `(code, scope_code)`; **no migration required** |
| 0c | Inflation/PPP reconciliation analysis | **DONE (Jun 2026)** — proposal awaiting approval; implementation deliberately deferred to after Phase 2 |
| 0d | Coverage dashboard | **DONE (Jun 2026)** |
| 1 | Create-flow field-derivation extraction | **DONE (Jun 2026)** — `modules/ghg/config/`; 785 equivalence assertions; 1 production file changed (−262/+62) |
| 2 | Edit-flow field-derivation extraction | **DONE (Jun 2026)** — one shared Create/Edit derivation pipeline; hydration retained separately; golden parity verified |
| 3 | C7 safety-net phase | **DONE (Jun 2026)** — test-only; production C7 untouched |
| 4 | Capability config replaces category string sniffing | **DONE (Aug 2026)** — Phase 4.1 closeout complete; review required before inflation |
| 5 | Organization-ready frontend configuration boundary | **DONE (Aug 2026)** — review gate; SuperAdmin UI deferred |
| Final | Shared GHG presentation/options completion + proven dead-code cleanup | **DONE (Aug 2026)** — final review gate |
| Hardening | Post-refactor architecture contract and production-readiness audit | **DONE (Aug 2026)** — final review gate |
| 6 | Unified form state + record adapters | NOT STARTED |
| 7 | Field registry + one shared `<GhgForm mode>` | NOT STARTED |
| 8 | Declarative validation engine | NOT STARTED |
| 9 | Dead-code audit + safe cleanup + evaluator verification | COMPLETE (2026-08-18) |
| 10 | Organization override SuperAdmin persistence/UI | NOT STARTED — explicit future phase |

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

## GHG Add Form — Single-Page Experience (2026-08-18) — COMPLETE

- Replaced the four-step **Create Emission** wizard with a clean continuous form: Primary Information → Reporting Frequency → Monthly expandable entry / Yearly entry → collapsed Optional Fields.
- Preserved the existing Create calculation, validation, payload, capability/configuration, evidence, custom fuel, C6 flight, C7 employee, and process-rendering paths. `EmissionEditForm.jsx`, backend engines, APIs, and schemas remain untouched.
- Added focused layout modules: `EmissionFormSection.js` and `ReportingPeriodControls.js`; `Step3YearMonthlyData` now reuses its data renderer without duplicating period controls.
- Restored equivalent wizard validation by evaluating the original Step 1 → Step 2 → Step 3 validation gates in order on the single Save action.
- Resolved the preview DOM nesting warning from dynamic option instrumentation and a dashboard chart key-prop spread warning. Authenticated browser smoke: clean relevant console output; **MOCKED APIs: NONE**.
- Regression: frontend **1,223 passed / 63 snapshots**; backend golden **506 passed / 9 skipped**. Report: `/app/memory/GHG_ADD_FORM_UX_CHANGE_REPORT.md`.

## GHG Add Form — Monthly Refinements (2026-08-18) — COMPLETE

- Monthly data now prioritizes required inputs; optional fields and default overrides are collapsed under **Additional details**. Calorific Value and Density override controls now sit beside their related entries.
- Modernized the reporting note, evidence upload zone, numeric/unit field groups, and vertical rhythm. Removed Reporting Year Type from the Create UI while retaining its underlying reporting-period logic.
- Process names/descriptions and Person Responsible are optional. Supplier/Customer reference is inside Optional Fields; redundant C7 employee name/ID fields were removed while the C7 multi-employee calculation flow stays intact.
- Resolved Create-form console issues: safe escaped option output for dynamic selects, dynamic list keys, and dialog description. Authenticated Scope 1/3 browser flow is clean. **MOCKED APIs: NONE.**
- Regression: frontend **1,223 passed / 63 snapshots**; backend golden **506 passed / 9 skipped**. Updated report: `/app/memory/GHG_ADD_FORM_UX_CHANGE_REPORT.md`.

## GHG Add Form — Monthly Ledger Layout (2026-08-18) — COMPLETE

- Replaced the monthly accordion with a responsive ledger: **Month | Quantity | Evidence**. Each month is now immediately scannable, with its required data fields and evidence upload in one row.
- Retained the existing dynamic inputs, custom-fuel fields, C6 flight fields, evidence upload flow, future-month handling, validation, and per-month **Additional details** disclosures. No calculation, unit-resolution, backend, API, or persistence behavior changed.
- Added a small `MonthlyLedger` presentation boundary inside `Step3YearMonthlyData` to keep ledger framing separate from the existing field-rendering logic.
- Verified: frontend **1,223 passed / 63 snapshots**; backend golden **506 passed / 9 skipped**. **MOCKED APIs: NONE.**

## GHG Add Form — Inline Override Defaults & Alignment (2026-08-18) — COMPLETE

- Standardized the monthly ledger’s optional and override cells to a shared single-row layout, so toggles, input boxes, units, and evidence controls remain aligned across every month.
- Inactive optional/override fields now visibly show their configured default or selected-fuel default value and matching unit (for example, calorific value and density) without writing an override or changing calculation behavior.
- Verified: frontend **1,223 passed / 63 snapshots**; backend golden **506 passed / 9 skipped**; authenticated browser smoke confirmed the Diesel monthly ledger renders aligned default values. **MOCKED APIs: NONE.**

## GHG Add Form — Compact Section Spacing (2026-08-18) — COMPLETE

- Reduced the Create dialog’s title-to-Primary Information gap and tightened the transition above Reporting Frequency without altering edit-dialog spacing or form behavior.
- Verified: frontend **1,223 passed / 63 snapshots**; backend golden **506 passed / 9 skipped**; authenticated browser screenshot confirmed the compact layout. **MOCKED APIs: NONE.**

## GHG Add Form — Complete-Month Status (2026-08-18) — COMPLETE

- Corrected monthly ledger status and the filled-month counter: a month is complete only after every mandatory, non-override field has an entered value; optional and override fields do not block completion.
- Added three focused completion tests, including a partial-month case and zero-value handling. Save validation now reports the missing field for a partially entered month instead of a generic no-data message.
- Verified: frontend **1,226 passed / 63 snapshots**; backend golden **506 passed / 9 skipped**; authenticated browser check confirmed a Quantity-only month remains at **0 / 12** with no Done badge. **MOCKED APIs: NONE.**

## GHG Edit Form — Copy Simplification (2026-08-18) — COMPLETE

- Removed the edit-form helper labels: Input Fields configuration text, Monthly Entry, Annual Entry, the annual reporting-period restriction note, and the single-month explanatory note.
- Preserved reporting-period, dynamic calculation-field, and all edit controls unchanged.
- Verified: frontend **1,226 passed / 63 snapshots**; backend golden **506 passed / 9 skipped**; authenticated browser check opened an existing record and confirmed all requested copy is absent. **MOCKED APIs: NONE.**

## Phase 9 — GHG Code Cleanliness (2026-08-18) — COMPLETE

- Completed the frozen Phase 9 audit without changing calculation behaviour, backend logic, schemas, configuration architecture, or database data.
- Removed only seven proven inert fragments: five stale React Hooks lint suppressions, one `&& true` guard, and one literal-false JSX branch.
- Verified `evaluateFormula` remains active exclusively in monthly/yearly process-template submission paths; retained all legacy EF filtering, hydration, payload adapters, C7 compatibility, and organization configuration boundaries.
- Regression baseline remains exact: frontend **1,223 passed / 63 snapshots**, backend golden **506 passed / 9 skipped**, C7 **9/9**, Phase 1 equivalence **785/785**; database counts unchanged at **840 / 1,339 / 1,764** with **0 writes**.
- Read-only browser smoke check rendered the application login screen successfully; no authenticated workflow or write endpoint was invoked.
- Full details: `/app/memory/GHG_CODE_CLEANLINESS_AUDIT.md`.

## Upcoming Tasks (P1)
- Custom Dashboard: Wire ExecutiveAnalyticsDashboard to consume custom kpi_cards
- Target Settings UI: Explicit target_direction configuration
- Hash-based Integrity Verification for Evidence Files (SHA-256)
- Supplier and Customer Org Onboarding Wizards
- BRSR Word (.docx) download + Previous Year Columns
- MIS Schedule Preview & Report Bookmarks

## Future/Backlog Tasks
- **P0 (final review gate)**: Review `GHG_POST_REFACTOR_HARDENING_REPORT.md`; do not start another phase until explicit approval.
- **P1 (approval pending)**: Inflation/PPP single source of truth — fix the 2 `ce_property_source_mappings` rows, always populate `context.reporting_period`, retire the router injection path, replace the silent 1.0 default. Will require an approved re-capture of 4 spend-basis baselines. Scheduled AFTER Phase 2.
- **P1**: Resolve categories by `(code, scope_code)` instead of `(name, scope_code)` — folded into Phase 1
- **P2**: C7 Employee Commuting has zero calculation coverage (94 records, no audit log by design) — needs its own E2E test before any C7 restructuring
- **P2**: C6 airport / flight-distance UI capability propagation is protected; calculation-specific coverage remains a separate workstream
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
