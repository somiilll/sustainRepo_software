# ESG Platform — Product Requirements Document

## Original Problem Statement
Simplify the Add/Edit GHG Emission form to a single-page experience without altering the backend, calculation engine, or core shared GHG configuration architecture. Make sure the UI is simple, clean, modern, and aligned correctly.

## Core Requirements
- Refine monthly data UX to a compact ledger format.
- Optional and override fields aligned inline with correct default values.
- Tighter header-to-content spacing in create emission dialogs.
- "Done" badge / filled months counter only when ALL mandatory fields for a month are populated.
- Remove redundant helper text/labels from Edit Emission form.
- Zero behavioral drift on the backend (golden regression suites must stay green).

## Architecture
- `/app/backend/modules/ghg/` — Core GHG calculations engine (FROZEN).
- `/app/backend/calc_engine/` — Decision-tree calc engine, audit log persistence.
- `/app/backend/tests/golden/` — Golden-record regression fixtures.
- `/app/frontend/src/modules/ghg/config/` — Centralized field-derivation, capabilities, UI state, override schemas.
- `/app/frontend/src/modules/ghg/emissions/shared/hooks/useEmissionSubmit.js` — Create flow submission orchestration.
- `/app/frontend/src/modules/ghg/emissions/shared/domain/` — Shared Phase 6 `EmissionDraft` model and pure record adapters.
- `/app/frontend/src/pages/Emissions.js` — Edit flow state management.
- `/app/frontend/src/components/EmissionEditForm.jsx` — Edit form rendering.

## What Has Been Implemented

### Session 1 (Aug 2026)
- Phase 0–5 GHG refactor: safety net, shared config, edit flow unification, capabilities closeout, org config boundary.
- Internal Data AI: retrieval hardening, formatting, comparison, history, auxiliary queries, refactoring.
- BRSR Internal AI repair.

### Session 2 (Current)
- **C6 create-form calculation method containment** — DONE (2026-08-19)
  - Replaced the Scope 3 calculation-method native dropdown with a collision-aware select menu and contained the create dialog horizontally without changing form data or calculation behavior.
  - Restored the desktop dialog to its standard 1152px maximum width while ensuring the form root can shrink on narrow screens; facility/scope selection now stacks responsively before controls can be clipped.
  - Verified: lint clean; live authenticated C6 Create checks passed at 1920px and 320px, including method-menu viewport containment and standard desktop dialog width.
- **Create-form selector row alignment** — DONE (2026-08-19)
  - Scope 3 places Category beside Calculation Method, then Activity Type beside Activity; Scope 2 places Category beside Fuel Type; indirect Biogenic places Category, Calculation Method, and Biogenic Activity on one desktop row.
  - The layouts stack responsively on smaller screens and retain all existing field visibility, options, and selection behavior.
  - Verified: lint clean; authenticated live browser checks confirmed all requested source selectors are aligned and selectable.
- **Version-history actor display names** — DONE (2026-08-19)
  - Record history now resolves creator, updater, approver, and rejector actors from user IDs or legacy stored emails to `full_name`/name before returning history data.
  - Questionnaire history uses the same name-first behavior and action-specific labels for create, update, approval, and rejection events.
  - Verified: backend lint and compilation passed; live Water record API returned `Somil`, and the authenticated Water Version History dialog displayed the name without the email.
- **Emission Edit Form presentation redesign** — DONE (2026-08-19)
  - Rebuilt the edit surface with white, bordered sections; widened the reporting period; added semantic leading icons and emerald scope radio states.
  - Added tinted, icon-led Scope 1/2/Biogenic emission cards and an expanded CO₂e-only treatment for Scope 3. Calculation details now start collapsed with clean audit rows, source badges, and inline final outputs.
  - Scope 3 Activity Type now sits beside Calculation Method with a filter icon; Activity has a location icon.
  - Verified: authenticated read-only Scope 1 and Scope 3 browser checks passed; Scope 3 Final Outputs are inline; live console showed no DOM-nesting errors. Focused Scope 1 methodology UI tests passed (2/2) and custom-fuel contract regression passed (6/6).
- **Scope 1 methodology persistence + optional process details on edit** — DONE (2026-08-19)
  - New Scope 1 create and edit records persist `calculation_methodology` both as a top-level record field and in `dynamic_field_values`; legacy records are intentionally not migrated.
  - Edit hydration reads the explicit saved methodology before using legacy field inference.
  - Removed obsolete Name of Process and Process Description requirements from Scope 1, flat Scope 3, and C7 edit submissions; supplied process metadata continues to be saved.
  - Verified: focused frontend regression tests 7 passed; Scope 1 payload tests and backend API contract tests passed; JavaScript/Python lint clean.
- **Fixed edit-form methodology hydration for nullable quantity fields** — DONE
  - Records storing `ef_quantity: { value: null }` no longer infer Quantity Basis merely from key presence.
  - Heat Basis records now retain their saved methodology and render the corresponding dynamic inputs.
  - Verification intentionally not run at the user's request.
- **Edit Emission form alignment restored** — DONE (2026-08-19)
  - Kept every Scope option on one horizontal row by allocating the Scope column sufficient width and narrowing the Reporting Month/Year control.
  - Vertically aligned Step 2 with Step 1 and the downstream input step; no calculation, validation, API, or backend behavior changed.
  - Verified with frontend linting and an authenticated, read-only edit-dialog browser smoke test.
- Aligned optional/override field boxes with correct configured/fuel default values in ledger — DONE
- Reduced vertical spacing (header-to-content transitions) in create emission dialogs — DONE
- Fixed monthly "Done" validation to require ALL mandatory fields — DONE
- Removed redundant helper text from Edit Emission form — DONE
- **Fixed Edit form live calculation display for all scopes** — DONE
  - Removed `emissionAuditLog.length > 0` gate so persisted values show on first Edit open
  - Added `audit_log_id` return from calc engine + link endpoint
  - Create flow now links audit logs to emission records after POST
- **GHG Phase 6 — Unified Form State & Record Adapters** — DONE (2026-08-18)
  - Added a JSDoc `EmissionDraft` model for genuine edit values only.
  - Added pure stored-record ↔ draft adapters; existing category payload builders remain unchanged.
  - Migrated `Emissions.js`, edit dispatch, and `EmissionEditForm.jsx` to a shared draft source of truth.
  - Full regression preserved: frontend 1228 passed / 63 snapshots; backend golden 506 passed / 9 skipped.
- **GHG Phase 6.2 — Edit Boundary Cleanup & Orchestration Isolation** — DONE (2026-08-19)
  - Removed the conclusively unused `EmissionEditForm` legacy value/setter contract, inert draft mirrors, and one unreachable branch; `editDraft` remains the sole mutable Edit-form value source.
  - Proved and minimally fixed the stale asynchronous evidence-filename merge with an active-record guard and focused regression coverage.
  - Retained the async historical hydration effect and page-owned calculation preview after dependency analysis; neither had a safe small extraction boundary.
  - Verified: frontend 1229 passed / 63 snapshots, backend golden 506 passed / 9 skipped, C7 9/9, Phase 1 equivalence 785/785, architecture contract 16/16, and authenticated no-save Edit smoke test.

### Regression Status
- Backend golden: 506 passed / 9 skipped
- Frontend: 1229 passed / 63 snapshots

## Known Issues

### P0: Edit Form Methodology Inference Bug
- **RESOLVED**: Nullable `ef_quantity` values are excluded from Quantity Basis methodology inference in `Emissions.js`.
- Verification was intentionally skipped at the user's request.

### P0: Missing Units in GHG Ledger Views
- Units for required inputs are missing in monthly/yearly views.
- **BLOCKED**: Awaiting explicit user permission to fix.
- Root cause: fallback unit logic removed in a prior commit.

### Resolved: C6 Create Form Layout/Dropdown Overflow
- Scope 3 C6 calculation-method menu is now constrained to the visible viewport and the create dialog preserves its normal desktop max width.

### P1: BRSR Section A Stale Form Data on Year Switch
- Stale data bleeds into new year view when reporting year is changed.
- Fix: Reset `formData` to `INITIAL_FORM_DATA` in `BRSRDetailsSection.js` on year change.

### P2: Playwright Locator Timeouts on Shadcn Select
- E2E tests frequently time out on Shadcn Select elements.
- Fix: Adjust timeouts, simplify locators, add `data-testid`.

### P2: Inflation Rate Path for Spend-basis
- 3 conflicting resolution paths identified.
- Fix: Correct `currency_conversion` lookup, ensure `reporting_period` populated.

### Pre-existing: Legacy Backend Test Failures (non-golden)
- Stale expected record counts in `test_calc_engine_phase3.py` and `test_phase_b5_emissions_refactor.py`.

## Prioritized Backlog

### P1 — Upcoming
- Custom Dashboard (consume `kpi_cards`)
- Target Settings UI (`target_direction` config)
- SHA-256 Evidence Integrity on upload
- Supplier/Customer Org Onboarding Wizards
- BRSR Word download (.docx) + "Previous Year Columns"
- MIS Schedule Preview & Report Bookmarks
- Keep Edit calculation-preview orchestration page-owned unless a future dedicated dependency analysis identifies a clean boundary; Phase 7 remains explicitly blocked pending instruction.

### P2
- Copy Month Values for Custom Fuel EF/CV
- BRSR year-switch form reset

### P3
- Dashboard Scope 1 & 3 Emissions Deduplication
- Admin Disable UI (enable/disable ESG subcategories)

## 3rd Party Integrations
- Resend (Emails) — requires user API key
- OpenAI GPT 5.6 Sol / text-embedding-3-large (Repo Pilot & Internal AI) — Emergent LLM Key

## Test Credentials
- See `/app/memory/test_credentials.md`

## Change Log — 2026-08-20: GHG Organization Capability Resolver Seam (Option A)

- Added a validated, presentation-only `organizationGhgOverrides` seam for `capabilityOverrides.customFuel: false` and central-registry Process Type subsets. Existing `disabledCategories` continues to hide Process Emissions.
- Create and Edit share the same effective capabilities/options; historical disabled Process Types stay visible as disabled options. No backend/API/database/calculation/C7/Phase 7 changes were made.
- Added permanent architecture contracts and verified 86 focused frontend tests plus a non-saving authenticated browser smoke. Database counts stayed unchanged: `emission_records` 830, `ce_calculation_audit_logs` 1348, `emission_history` 1773.
- Repaired invalid table nesting caused by instrumentation wrappers in the Add Emission monthly ledger; strict table structure now verifies in-browser.

### Current prioritized backlog

- **P1:** Persist and deliver `organizationGhgOverrides` only when separately approved; missing monthly/yearly required-input units remains blocked on approval; BRSR Section A stale form data on year switch.
- **P2:** Stabilize Shadcn Select Playwright locators; correct spend-basis inflation resolution.
- **P3:** Custom Fuel month-value copy, Scope 1/3 dashboard deduplication, admin disable UI. Phase 7 remains explicitly blocked.

## Change Log — 2026-08-20: Process Emissions Density Rendering Repair

- Fixed the Create-form prop boundary: `EmissionEntryForm` now passes the resolved Process Emissions state and existing selected-template state to `Step3YearMonthlyData`.
- The monthly density resolver now falls back to configuration-derived fields when a Process Emissions template is not selected, preserving template fields where they are available.
- Verified: frontend lint passed; 7 focused density/Process-field tests passed; authenticated live Venting Heat Basis entry with Quantity `L` and CV `TJ/kg` rendered the required `Density (kg/L)` field and `Conversion required: L → kg` hint. No backend or calculation-engine logic changed.

## Change Log — 2026-08-20: Superadmin GHG Organization Configuration

- Added persisted `ghg_overrides` to existing Org Config with strict server-side allowlists and resolved delivery to Emissions.
- Superadmins can set Process Emissions and Flaring (Stationary Combustion) visibility, supported Process Types, Custom Fuel visibility, and Scope 3 C1–C15 category visibility. All controls resolve through the existing `disabledCategories` and GHG resolver path.
- Scope 3 controls were added at the user’s request with **NO TEST RUN** requested; no calculations, factors, formulas, records, or Phase 7 architecture were changed.

## Change Log — 2026-08-20: Process Emissions Selector Alignment

- Moved Create-form Process Type into the shared Category/Process Type/Calculation Methodology selector row for Process Emissions, with responsive stacking and a workflow icon.
- **NO TEST RUN** requested; calculation behavior is unchanged.

## Change Log — 2026-08-20: Venting Oxidation-Factor Default State

- Fixed the monthly-ledger default mismatch: after a user starts a month, required configured defaults (including Venting Oxidation Factor `1`) are written to form state rather than only displayed. Untouched months remain unpopulated.
- Verified lint plus 813 existing field-derivation and validation regression tests. Quantity Used unit controls remain a separate configuration follow-up: use a Process Emissions-specific static/all-units mapping instead of fuel-sourced units.

## Change Log — 2026-08-20: Directional Density Requirements

- Replaced frontend hardcoded mass/volume detection with central unit-registry metadata. Heat Basis and Quantity Basis now derive density requirements/directional units from the quantity unit and CV/EF denominator: `L → kg` = `kg/L`; `kg → L` = `L/kg`; normal same-dimension conversions require no density.
- Custom Fuel Create/Edit and dynamic monthly fields consume the same resolver. Backend property conversion now accepts directionally entered density while retaining legacy physical-density compatibility; formulas and templates were unchanged.
- Verified: 1,013 frontend regression tests, 14 backend density/calc-engine tests plus 10 Phase 3 API harness tests, and a non-saving authenticated browser smoke across requested unit cases.

## Change Log — 2026-08-20: Density Conversion Hint

- Added a compact, resolved hint beside conditional Density fields in Custom Fuel and dynamic monthly entries, e.g. `Conversion required: kg → L`.
- Verified lint, 17 focused frontend tests, and a non-saving authenticated browser smoke for the inverse conversion hint.

## Change Log — 2026-08-20: Process Emissions Density Visibility

- Process Emissions Venting now creates a virtual runtime Density control directly from a mass/volume mismatch, even when its configuration has no explicit Density field mapping. Semantic quantity/CV/EF alias matching supports the current Venting mapping names.
- Verified non-saving browser flows: Heat Basis `L` with `TJ/kg` shows `kg/L`; Quantity Basis `kg` with `kgCO2/L` shows `L/kg`.
