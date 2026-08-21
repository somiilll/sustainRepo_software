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

### P0: Process Emissions and Custom Fuel Density Payload Loss
- **RESOLVED (2026-08-20)**: Runtime Process Emissions density is now forwarded to the calc engine as `user_overrides.density` and persisted in `dynamic_field_values`, even when density is a virtual field outside the configured field list.
- Custom Fuel continues to preserve the entered directional density in both calculation overrides and saved field values. The legacy Process Template path also retains supplied density in formula values and persistence payloads.
- Verified: frontend lint; focused frontend suites 16/16; backend density/venting regressions 5/5; authenticated no-save Scope 1 Add Emission smoke. No backend calculation-engine changes.

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

## Change Log — 2026-08-20: Process Emissions Quantity Save Integrity

- P0 fix: Process Emissions now resolves density requirements against the selected formula’s expected input units, not only the entered Quantity/EF pair. A formula that requires mass inputs therefore prompts for directional density even when entered `L` and `kgCO2/L` superficially match.
- P0 fix: any calculation API failure now blocks the corresponding monthly/yearly record from being saved. The API error is surfaced to the user rather than silently persisting `0` CO₂e.
- P0 fix: Scope 1 create payloads now mirror the selected Quantity and unit to the record’s top-level `quantity`, `quantity_unit`, and `unit` fields while retaining the exact `dynamic_field_values` unit. This preserves Process Emissions `kg` selections instead of falling back to a legacy `L` display value.
- P0 fix: `/api/emissions` applies the same formula-aware density check before insert, so bypassed clients cannot persist an unresolved mass↔volume conversion.
- No calculation-engine files were changed. **NO TEST RUN** was performed at the user’s explicit request.

## Change Log — 2026-08-20: Process Emissions Unit and Density Save Guard

- Fixed Create-form unit initialization priority for monthly and yearly data: saved selection → configured default unit → formula expected unit → first allowed unit. Process Emissions quantities configured with `kg` no longer default to the alphabetically first `L` option.
- Added a synchronous pre-save Process Emissions density check based on the actual quantity and CV/EF units being submitted. A mass↔volume mismatch now blocks saving until a positive density in the required directional unit is supplied.
- Added a matching `/api/emissions` server-side guard that rejects Process Emissions mass↔volume payloads missing a valid directional density, preventing silent fallback to default factors even if a client bypasses the UI.
- Hardened the frontend pre-save guard so it identifies Process Emissions from the submitted category and inspects both populated CV/EF reference fields when selector state has not synchronized. Users now receive the density error before any save request is attempted.
- No calculation-engine files were changed. **NO TEST RUN** was performed at the user's explicit request.

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

## Change Log — 2026-08-20: Process and Custom Fuel Density Submission

- Fixed the create payload boundary so numeric virtual Density values from Process Emissions are no longer dropped when `dynamicInputFields` has no Density mapping. They are delivered as `user_overrides.density` for calculation and saved in `dynamic_field_values` for edit hydration.
- Preserved directional density units such as `kg/L` and `L/kg`; Custom Fuel density remains covered in its shared adapter and persistence payload. The legacy Process Template route now retains a supplied density in formula values and record fields.
- Verified: lint passed; new Scope 1 density payload tests and Custom Fuel adapter tests passed (16/16); density-direction and Process Venting backend regressions passed (5/5); authenticated Scope 1 Add Emission smoke passed without creating records. No APIs are **MOCKED**.

## Change Log — 2026-08-20: Process Emissions Quantity-Basis Save Repair

- Repaired the active frontend submission path that had been blocked by a duplicate `isProcessEmissions` declaration in the previous bundle.
- The adapter now converts an engine-bound inverse density of `L/kg` to its equivalent `kg/L` value while preserving the exact user-entered density unit and value in saved `dynamic_field_values`.
- Process-template monthly and yearly records now send canonical `outputs`, preventing the emissions API from overwriting their calculated CO₂e with zero. Generic Process Emissions also refuse to save when their calculation configuration is unavailable or the calculation fails.
- Density is rejected before save when required but missing, non-positive, or in the wrong directional unit. No calculation-engine files were changed.
- **NO TEST RUN** was performed at the user's explicit request. No APIs are **MOCKED**.

## Change Log — 2026-08-20: Process Emissions Density in Edit

- Fixed Process Emissions Edit hydration for the virtual runtime Density field. For a mass↔volume mismatch such as Quantity `kg` with EF `kgCO2/L`, Edit now displays the persisted Density value, its directional `L/kg` unit, and the conversion hint.
- The virtual field now participates in Edit recalculation and is retained in `dynamic_field_values` on save, preventing an existing density from disappearing during a later edit.
- Verified: frontend lint clean for the three changed source files; focused density and Scope 1 Edit payload tests passed (7/7); authenticated application smoke check loaded successfully. No calculation-engine or backend changes. No APIs are **MOCKED**.

## Change Log — 2026-08-20: Process Emissions Selected-Unit Density Rule

- Updated the Process Emissions density guard in both the Create submission flow and `/api/emissions` save validation to use only the user-selected Quantity unit and the selected CV/EF denominator.
- Formula expected units and default-unit fallbacks no longer create a density requirement. For example, Quantity `L` with EF `kgCO2/L` now passes without Density; Quantity `kg` with EF `kgCO2/L` still requires Density `L/kg`.
- No calculation-engine files were changed. **NO TEST RUN** was performed at the user's explicit request. No APIs are **MOCKED**.

## Change Log — 2026-08-20: PUT Density Guard Parity for Process Emissions and Custom Fuel

- Applied the server-side selected-unit density validation to `PUT /api/emissions/{record_id}` before both direct updates and approval-workflow proposals.
- Generalized the existing POST validation boundary to cover both Process Emissions and records marked `is_custom_fuel`, including Custom Fuel Heat Basis, Quantity Basis, and Carbon Composition. Matching selected dimensions continue without a Density requirement; only an actual mass↔volume mismatch requires the directional Density unit.
- No calculation-engine files were changed. **NO TEST RUN** was performed at the user's explicit request. No APIs are **MOCKED**.

### Current prioritized backlog

- **P0:** User validation of Process Emissions Quantity Basis EF mass/volume routing in live Create and Edit flows (implementation complete; user requested no test run).
- **P1:** Missing monthly/yearly required-input units (blocked pending approval); BRSR Section A stale form data on year switch; Custom Dashboard; Target Settings UI; SHA-256 evidence integrity; supplier/customer onboarding; BRSR Word export; MIS preview/bookmarks.
- **P2:** Stabilize Shadcn Select Playwright locators; correct spend-basis inflation resolution; Custom Fuel month-value copy; repair legacy non-golden backend failures.
- **P3:** Scope 1/3 dashboard deduplication; admin disable UI. Phase 7 remains explicitly blocked.

## Change Log — 2026-08-20: Process Emissions Quantity Basis EF Formula Routing

- Updated the active Process Emissions decision tree to version 3. Venting → `using_qty_basis_ef` now routes by the internal `ef_quantity_basis` value: `mass` uses **Process Emissions - EF Mass** and `volume` uses **Process Emissions - EF Volume**.
- Create and Edit derive that internal value from the user-selected EF denominator (`kgCO2/kg` → mass; `kgCO2/L` → volume) without adding another user-facing form selector. Initial field rendering defaults to the mass branch until an EF unit is selected.
- No files in `/app/backend/calc_engine/` were changed. **NO TEST RUN** was performed at the user's explicit request. No APIs are **MOCKED**.

## Change Log — 2026-08-20: Process Emissions Quantity Basis Conversion Completion

- Create and Edit calculation requests now derive `ef_quantity_basis` from the selected EF unit, with the configured default/expected unit used when a row has not materialized its default yet. This consistently routes `kgCO2/kg` to the mass formula and `kgCO2/L` to the volume formula.
- Enabled dimension conversion on both active Process Emissions Quantity Basis formulas: **EF Mass** was versioned to v5; **EF Volume** already had conversion enabled.
- Extended the approved calculation engine converter so property-based conversions apply to simple units as well as compound components. Directional density now supports both `L → kg` and `kg → L`, including the user-entered reciprocal unit.
- **NO TEST RUN** was performed at the user's explicit request. No APIs are **MOCKED**.

## Change Log — 2026-08-20: Venting Carbon Composition Default Completion

- Fixed monthly completion for required configured defaults. A displayed default, including Venting Carbon Composition’s Oxidation Factor `1`, now satisfies the completion rule without requiring a user edit.
- Explicit values still take precedence; missing required values and runtime Density requirements remain incomplete as before.
- Verified: focused monthly completion suite passed (5/5) and JavaScript lint passed. No APIs are **MOCKED**.

## Change Log — 2026-08-20: Custom Fuel Heat Basis Mass/Volume Routing

- Added versioned Heat Basis decision-tree branches for Custom Fuel Stationary and Mobile Combustion in Scope 1 and Biogenic Scope 1. `cv_quantity_basis` now routes mass CVs to the original formulas and volume CVs to new `TJ/L` formulas.
- Expanded the active Calorific Value mapping to all currently selectable mass and volume units, including `TJ/L` and `MJ/L`, so valid volume CV overrides are no longer rejected before formula resolution.
- Create/Edit payloads derive the internal route from the selected CV denominator, with a mass fallback while form values are initializing. No files in `/app/backend/calc_engine/` were changed.
- **NO TEST RUN** was performed at the user's explicit request. No APIs are **MOCKED**.

### Current prioritized backlog

- **P0:** User validation of Custom Fuel Heat Basis mass/volume saving plus Process Emissions Quantity Basis routing in live Create and Edit flows.
- **P1:** Missing monthly/yearly required-input units (blocked pending approval); BRSR Section A stale form data on year switch; Custom Dashboard; Target Settings UI; SHA-256 evidence integrity; supplier/customer onboarding; BRSR Word export; MIS preview/bookmarks.
- **P2:** Stabilize Shadcn Select Playwright locators; correct spend-basis inflation resolution; Custom Fuel month-value copy; repair legacy non-golden backend failures.
- **P3:** Scope 1/3 dashboard deduplication; admin disable UI. Phase 7 remains explicitly blocked.

## Change Log — 2026-08-20: Custom Fuel Create-Form Presentation

- Removed the Custom Fuel source-of-information input from Create. Existing payload support remains intact; new Custom Fuel records simply submit no custom source value.
- Replaced the Custom Fuel yellow panels with a slim amber flame indicator and left rule. The Fuel Name control now carries a compact **Custom fuel** badge.
- Moved Custom Fuel Quantity Unit into the Quantity Used field in both monthly ledger and yearly entry paths. The standalone Quantity Unit control is removed; the selected unit continues to persist as `custom_qty_unit` and drive the existing calculation adapter.
- Corrected the Custom Fuel density-display check to recognize the ledger’s `qty` / `quantity` values as well as the legacy key.
- Refined monthly Custom Fuel entry into a true single-row ledger: methodology fields (Emission Factor, Calorific Value, Carbon Content, Oxidation Factor) now appear as columns beside Quantity Used. Density is also a same-row conditional column, displaying `—` until a mass/volume conversion requires it.
- Verified: JavaScript lint clean for all three changed components; authenticated browser smoke confirmed Stationary Combustion → Custom Fuel shows the badge, no source field, and inline quantity/factor/calorific-value/density fields. Selecting `L` immediately exposed same-row `kg/L` Density. No APIs are **MOCKED**.

## Change Log — 2026-08-20: Custom Fuel Required-State and Error Clarity

- Custom Fuel ledger headers now mark methodology inputs as mandatory: Heat Basis marks Emission Factor and Calorific Value; Quantity Basis marks Emission Factor; Carbon Composition marks Carbon Content and Oxidation Factor.
- The Custom Fuel adapter now returns named missing inputs. Create displays actionable row-level feedback such as `April: Missing: Emission Factor, Calorific Value` instead of the generic “Failed to save some records” message. A required mass/volume density now appears in the same message when applicable.
- API save failures now preserve the server-provided error detail in the monthly toast rather than replacing it with a generic failure message.
- Edit Custom Fuel displays the same compact **Custom fuel** badge and amber flame indicator beside the fuel name; no edit data or calculation behavior changed.
- Verified: JavaScript lint clean for five changed components; Custom Fuel adapter tests passed **14/14**; authenticated browser checks confirmed Heat Basis required headers, exact missing-field validation with no record created, and the Custom Fuel edit badge. No APIs are **MOCKED**.

## Change Log — 2026-08-20: Edit Custom Fuel Caption Cleanup

- Removed the `Custom fuel factors · [methodology]` caption from Edit only. The compact Custom fuel badge and amber flame indicator remain beside the Fuel Name.
- Create retains its own ledger context unchanged. Verified with JavaScript lint and an authenticated Custom Fuel Edit browser smoke; the edit indicator count is zero. No APIs are **MOCKED**.

## Change Log — 2026-08-20: Carbon Composition Density Coverage

- Extended the Carbon Composition mass-conversion rule to Stationary and Mobile Combustion in addition to Process Emissions. A volume Quantity now exposes the directional Density input in yearly Create and Edit, matching the existing monthly behavior; mass quantities remain unchanged.
- Custom Fuel Carbon Composition continues to use its shared inline Density field for the same mass/volume conversion requirement. Create submission now rejects missing/invalid Density before saving for Stationary and Mobile Carbon Composition, and `/api/emissions` enforces the guard for Process Emissions, Custom Fuel, Stationary Combustion, and Mobile Combustion on both POST and PUT.
- No calculation-engine files were changed. **TESTING WAS NOT RUN at the user's explicit request.** No APIs are **MOCKED**.

### Current prioritized backlog

- **P0:** User validation of Carbon Composition and existing Custom Fuel/Process Emissions density handling in live Create and Edit flows (implementation complete; user requested no test run).
- **P1:** Missing monthly/yearly required-input units (blocked pending approval); BRSR Section A stale form data on year switch; Custom Dashboard; Target Settings UI; SHA-256 evidence integrity; supplier/customer onboarding; BRSR Word export; MIS preview/bookmarks.
- **P2:** Stabilize Shadcn Select Playwright locators; correct spend-basis inflation resolution; Custom Fuel month-value copy; repair legacy non-golden backend failures.
- **P3:** Scope 1/3 dashboard deduplication; admin disable UI. Phase 7 remains explicitly blocked.

## Change Log — 2026-08-20: Process Emissions Carbon Composition Quantity Save

- Fixed the Create-form submission boundary for Process Emissions Carbon Composition. Legacy row values stored as `qty` or `quantity` now populate the configured `quantity_used_process_emissions` key before validation, calculation, and persistence.
- The normalization applies only to the affected Process Emissions Carbon Composition flow; stored dynamic-field names, decision-tree routing, backend APIs, and all calculation-engine code remain unchanged.
- **TESTING WAS NOT RUN at the user’s explicit request.** No APIs are **MOCKED**.
