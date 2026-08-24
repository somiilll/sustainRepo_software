# ESG Platform — Product Requirements Document

## Original Problem Statement
Maintain the frozen core GHG engine while extending Supplier Assessment through configurable, module-driven requirements. Phase 1 establishes a backward-compatible ESG/GHG module registry, organization configuration resolution, program revisions, and legacy completion compatibility before any Documents or Training functionality is built.

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
- `/app/backend/modules/supplier_assessment/module_registry.py` — Supplier Assessment module contract and ESG/GHG completion adapters.
- `/app/backend/modules/supplier_assessment/programs.py` — Program revision binding and legacy relationship compatibility resolver.
- `/app/backend/modules/sustainability_config/` — Single `organization_config` source including `supplier_assessment` configuration.

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

### Session 3 (2026-08-22) — Supplier Assessment Phase 1 Compatibility Foundation
- **DONE:** Added the common Supplier Assessment module contract and registry. Only ESG and GHG adapters are registered; each reads the existing questionnaire and supplier-tagged emission collections without migrations or duplicated data.
- **DONE:** Extended the existing `organization_config` resolver with `supplier_assessment.modules`. ESG/GHG are enabled by default; Documents/Training are schema-only, disabled compatibility shapes—no module, collection, route, UI, upload, or media functionality was added.
- **DONE:** New supplier relationships bind to immutable `supplier_assessment_programs` revisions through `assessment_program_id` and `assessment_program_version`; relationships do not embed program configuration. Unbound legacy relationships resolve through the historic ESG/GHG completion path.
- **DONE:** `_update_completion_status()` remains the compatibility facade and now delegates to the registry. Legacy ESG/GHG/revenue weighting is preserved exactly.
- **Verified:** Python lint and compilation clean; focused Phase 1 + GHG configuration tests passed (19 total locally); independent backend validation passed (12/12) and live `/api/sustainability-config/resolved` smoke passed. No APIs are **MOCKED**.
- **Known pre-existing test state:** Full GHG golden suite is currently red from prior baseline/live configuration drift outside this phase. No `calc_engine` file or golden artifact was modified.

### Session 4 (2026-08-22) — Focused Supplier Documents: NDA/Agreement Acceptance
- **DONE:** Implemented only the client-required agreement flow: customer admin uploads one PDF/DOC/DOCX NDA or agreement to existing private R2 storage; suppliers assigned to the resulting program revision can list, open via a 15-minute signed URL, and accept it.
- **DONE:** Added immutable `supplier_document_versions`, revision-bound `supplier_document_requirements`, and immutable `supplier_document_acceptances`. Acceptance records the exact `document_version_id`; numeric version labels increment per normalized agreement lineage.
- **DONE:** Registered the Documents completion adapter. Documents influence completion for the newly revision-bound assessment only; legacy unbound ESG/GHG relationships retain their prior behavior. Admin and supplier agreement pages are available at `/supplier-assessment/documents` and `/supplier-assessment/documents/review`.
- **Explicitly deferred:** supplier uploads, VIEW/ACCEPT/UPLOAD/ACCEPT+UPLOAD rule configuration, document replacement UI, document deletion, submission workflow, Training, PPT conversion, video/audio processing, and all `calc_engine` changes.
- **Verified:** Scoped backend suite passed (21 tests); authenticated admin list endpoint and frontend agreement page smoke passed; independent validation passed auth boundaries and scoped tests. **MOCKED:** Live R2 upload/accept mutation was intentionally not run to avoid creating preview data.

### Session 5 (2026-08-22) — Documents P0 Verification and Hardening
- **VERIFIED:** The focused tranche is canonical and passes organization/supplier authorization, immutable acceptance, exact document-version acceptance history, supplier isolation, two-supplier acceptance of one version, lineaged version numbering (1→2→3; separate lineage→1), and Documents completion updates.
- **VERIFIED LIVE:** Controlled disposable objects were written/read/presigned/deleted in `R2_BUCKET_ORG_FACILITY=organization-facility-data-dev` under `supplier-assessment/verification/<uuid>`. Controlled temporary Mongo program/relationship/document/acceptance records were created, completion recalculated, and all verified deleted.
- **HARDENED:** Added regression coverage in `test_supplier_documents_p0.py`. Live mutation verification is now opt-in only via `RUN_LIVE_SUPPLIER_DOCUMENTS_P0=1`, preventing routine test runs from writing R2 or Mongo data.
- **FIXED:** The existing supplier review page was unintentionally covered by Layout's supplier premium gate. Added `/supplier-assessment/documents/review` to the established supplier allowlist; signed-in supplier smoke now renders the agreement page without the gate.
- **Latest tests:** normal focused suite: **17 passed, 3 opt-in live tests skipped**; explicit live gate: **3 passed**; combined verification: **20 passed** (one existing passlib deprecation warning). No Training or `calc_engine` files were modified.
- **Remaining verification boundary:** No live multipart admin upload was sent to the production-like customer organization because that would rebind live assessment relationships/configuration. R2 lifecycle, upload metadata, acceptance persistence, and completion are verified through controlled disposable records and focused tests.

### Session 6 (2026-08-22) — Supplier Training P0 Tranche
- **DONE:** Added the focused Training model: immutable `supplier_training_contents` and `supplier_training_versions`; organization-owned `supplier_training_requirements`; relationship-backed `supplier_training_assignments`; and mutable, auditable `supplier_training_progress` that preserves the exact immutable `training_version_id` completed.
- **DONE:** Added admin Training creation/assignment/status routes and pages, plus supplier Training list, protected content URL, and progress routes/pages. Thresholds are per requirement (1–100): `0` is Not Started, values below the threshold are In Progress, and values at/above it are Completed.
- **DONE:** Training uses the existing R2 client under the dedicated `supplier_assessment` bucket mapping: `R2_BUCKET_SUPPLIER_ASSESSMENT=supplier-assessment-dev`. Training-only audio/video types and up-to-250MB training files are supported without changing global upload limits.
- **VERIFIED:** Normal focused regression gate: **16 passed, 2 opt-in live tests skipped**. Explicit controlled live R2 gate: **2 passed**. Disposable R2 training object and temporary Mongo content/version/requirement/assignment/progress/program rows were deleted; supplier Training page smoke passed without the premium gate.
- **FIXED:** Invalid out-of-range progress now returns API 400, while an unknown assignment remains 404. Documents, Supplier ESG/GHG functionality, and `calc_engine` were not modified.

### Session 7 (2026-08-22) — Superadmin Supplier Assessment Module Catalog
- **DONE:** Added a Supplier Assessment tab under Superadmin → Org Config. Per organization, Superadmins can enable/disable the registered ESG, GHG, Documents, and Training workflows; configure GHG Scope 1/Scope 2; and set the supplier-facing display name for every workflow (for example, `Compliance Documents`).
- **DONE:** Added `display_name` to the validated supplier-assessment module configuration and preserved it in immutable assessment-program revisions. The Module Registry now serializes enabled module metadata—code, display name, completion, route, and description—for supplier-facing surfaces without module-specific completion branches.
- **DONE:** Supplier Dashboard module progress now uses the bound program’s enabled-module metadata and labels. Disabled ESG/GHG panels are not shown; custom Document/Training labels are ready for the module-driven dashboard expansion.
- **HARDENED:** Documents and Training are now controlled by the authoritative organization setting. Publishing an agreement or assigning training is rejected while its workflow is disabled; neither action silently re-enables a module. Existing immutable document/training content and completion behavior remain unchanged.
- **VERIFIED:** Superadmin read-only browser smoke passed after selecting ORG1 and opening the Supplier Assessment tab. Independent validation passed 21/21 focused backend tests and the supplier metadata contract. Root-level focused test execution now works through `pytest.ini`: 20 passed locally. No R2 uploads or live organization-config mutations were made. **MOCKED:** none.

### Session 8 (2026-08-23) — Supplier Training Management and Storage Alignment
- **DONE:** Customer-admin Training now uses the resolved organization display label in its page and sidebar. New assignments are server-enforced at **100% completion**; the threshold field has been removed from the UI and API contract.
- **DONE:** Added optional per-training due dates, editable after creation; safe disable/enable controls; and audit-preserving delete (removed from supplier access and lists, while immutable history remains). The list now clearly states `100% completion required` and `X of Y suppliers complete`.
- **FIXED:** Creation has a loading lock to prevent repeated clicks and duplicate uploads while large files are processing. Focused Training suites passed **8/8**; authenticated non-destructive UI/auth checks passed **9/9**. No APIs are **MOCKED**.
- **DONE:** New Supplier Assessment agreements/documents now upload to the dedicated `supplier_assessment` R2 bucket mapping (`R2_BUCKET_SUPPLIER_ASSESSMENT`, currently `supplier-assessment-dev`). Existing document versions retain their stored bucket mapping and remain readable. Focused document tests passed **3/3**; 3 opt-in live R2 tests were skipped to avoid mutating live storage.
- **IN PROGRESS / USER-REQUESTED NO TEST:** Replaced Training supplier multi-select with clear native checkboxes and a Select all control. Customer-admin Training cards now expose per-supplier progress, including name, percentage, and status.
- **IN PROGRESS / USER-REQUESTED NO TEST:** Added customer-admin Document deletion. This is an audit-safe archive: it removes the agreement from all active supplier assignments and recalculates completion, while retaining the immutable document version, acceptance history, and R2 object. Physical R2 purge remains intentionally excluded to preserve audit evidence.
- **DONE:** Supplier Assessment storage hierarchy now uses the dedicated bucket without a redundant top-level prefix: new Training uploads use `training/<parent-organization>/<YYYYMMDD>/<uuid>`, while new Documents use `documents/<parent-organization>/<YYYYMMDD>/<uuid>`. Existing version records remain accessible from their stored keys. Verified locally: focused Training/Documents suite **9 passed**; no R2 objects were uploaded or changed.
- **IN PROGRESS / USER-REQUESTED NO TEST:** Removed all supplier-side `0%`, `50%`, and `Mark complete` Training controls. The supplier training progress endpoint now rejects self-reported progress with HTTP 403, while the supplier can still open assigned content and the parent organization retains the progress view.
- **IN PROGRESS / TESTING PAUSED BY USER:** Implemented in-app Supplier Training consumption. New PDF/PPT/PPTX assets are privately rendered into page images; audio/video play through native in-app players. The original assets remain private in R2. Viewer events (page views and timed media positions) are persisted server-side and determine progress; direct content URLs and direct progress writes are blocked. Legacy assets prepare a viewer manifest on first secure viewing. Local lint and focused service checks passed before the user paused further testing; no independent testing-agent run was started.
- **DONE / FURTHER TESTING PAUSED BY USER:** Documents now supports immutable response modes per requirement/version: `ACCEPTANCE` (existing behavior) and extensible `STATUS` selections. Admins can configure arbitrary status options, suppliers select an allowed value, and the selection is stored against the assigned requirement/version. Admin response dialogs show each assigned supplier’s response; a response satisfies that document requirement for completion.
- **DONE / FURTHER TESTING PAUSED BY USER:** Document publishing now uses the same supplier checklist and Select all experience as Training. Each requirement stores its selected supplier relationship IDs; supplier listing, document access, response submission, admin response summaries, and completion calculation enforce that assignment boundary. Focused backend checks and an admin checklist smoke test passed before the user requested no further tests.
- **DONE:** STATUS document responses now use an explicit supplier-side selection followed by `Submit response`. A submitted response is immutable: server-side attempts to change it are rejected. The admin publishing field is named **Response Type** (`Acceptance` or `Status`).
- **DONE:** Supplier GHG data now stages in `supplier_ghg_entries` and is excluded from parent organization views, rankings, and emissions endpoints until the supplier creates a one-time `supplier_ghg_submissions` snapshot. The Supplier Assessment GHG screen aggregates draft data by scope/category, provides one submission action, and locks replacement submission while still allowing subsequent new draft entries. Parent GHG shows submitted scope/category aggregation only.
- **DONE:** ESG answers remain supplier-visible as drafts but are hidden from parent response views until final submission. Final ESG questionnaire submission is immutable; draft saves, re-submission, and admin reopen are blocked afterward.
- **VERIFIED:** Python/JS lint clean; focused local supplier assessment suite **23 passed**. Supplier GHG submission route smoke-tested successfully. Independent non-destructive verification: **2 passed, 3 data-dependent checks skipped** because no matching seed states were created. **MOCKED: none.**
- **FIXED:** Replaced a supplier-service hardcoded frontend URL fallback with required `FRONTEND_URL` environment configuration and restarted the backend successfully.
- **DONE:** Simplified Supplier Assessment GHG persistence at user request. `supplier_ghg_entries` and `supplier_ghg_submissions` were confirmed empty and physically dropped. The existing `emission_records` now stores `submitted_to_parent_org`, `submission_id`, and `submitted_by`; null/missing status means draft, while populated status means the immutable, parent-visible one-time submission. Existing Scope 1 supplier records now appear in Supplier Assessment as unsubmitted drafts and remain invisible to parent views until submitted.
- **VERIFIED:** Focused local GHG checks **11 passed**. Read-only live verification **4/4 passed**: no runtime references to dropped collections, parent excluded draft IDs, and supplier legacy Scope 1 drafts aggregated to 103.73 tCO₂e. **MOCKED: none.**
- **FIXED:** Supplier/admin post-login module bootstrap no longer returns 404 when a supplier organization document is absent; `/api/organization/module-config` now returns the existing default module configuration. Verified both roles receive HTTP 200.

### Session 9 (2026-08-23) — Immutable Supplier Submissions and Parent-Controlled Resubmission
- **DONE:** ESG questionnaire submissions are now revisioned. A parent unlock preserves the currently parent-visible submitted revision, creates a private supplier draft revision, and only switches parent visibility when the revised questionnaire is submitted.
- **DONE:** GHG submissions are immutable after submission. Parent unlock creates private draft copies of the submitted emission records; existing submitted records remain parent-visible until the supplier resubmits. Generic emission update/delete endpoints reject submitted supplier GHG records.
- **DONE:** Document acceptance/status responses now support parent-controlled unlocks through a revision layer. Unlocking creates a private reopened response while the parent continues to see the prior response; supplier re-submission atomically becomes the visible response.
- **DONE:** Added parent unlock controls for ESG (Supplier detail), GHG (Supplier GHG view), and Documents (response dialog), plus supplier-facing locked/reopened states and stable test IDs for new controls and questionnaire/GHG filter inputs.
- **VERIFIED:** Python and JavaScript lint clean; focused backend suites **8 passed, 2 skipped** only because the live dataset lacks deterministic eligible STATUS-document/in-progress-ESG data; authenticated Supplier administration browser smoke passed. Testing-agent live regression: **5 passed, 2 skipped**. **MOCKED: none.**
- **FOLLOW-UP (2026-08-23):** The shared GHG edit screen now preserves the API’s explicit locked-submission message: `Submitted supplier GHG entries are locked. Ask the parent organization to unlock resubmission.` JavaScript lint and authenticated supplier GHG page smoke passed. No matching locked record exists in the current supplier account, so the exact live toast could not be triggered without creating or changing data.
- **INVESTIGATED — NO CHANGE REQUESTED (2026-08-23):** An unlock intentionally clones each immutable submitted emission into a new private draft. The original stays locked and parent-visible, while the cloned draft is editable and marked `resubmission_of`. Supplier Assessment and parent-submission endpoints filter to the appropriate revision, but the general GHG Logs endpoint lists both record revisions; this is the source of the apparent duplicate entries after an unlock. No duplicate-display behavior was changed.
- **FIXED (2026-08-23):** General GHG Logs now excludes a submitted supplier revision only when its linked reopened draft exists, so suppliers see the current editable revision instead of a duplicate. The original submitted revision remains immutable in `emission_records` for audit history and parent visibility. No new MongoDB collection was created; the earlier temporary `supplier_ghg_entries` and `supplier_ghg_submissions` collections were already removed in favor of `emission_records`. Verified: focused regression tests **2 passed**, Python lint clean, and authenticated GHG Logs browser smoke passed. **MOCKED: none.**
- **DONE (2026-08-23): Explicit Supplier GHG Revision Lineage** — Every newly created supplier emission now carries `revision_lineage_id`, `revision_number`, and `is_current_revision`. Unlocking creates the next immutable lineage revision with `revised_from_record_id`, while marking only the superseded source revision non-current; existing records receive lineage metadata when submitted or unlocked. The normal GHG Logs query now uses the explicit current-revision contract (with legacy fallback filtering) rather than treating revisions as unrelated duplicates.
- **DONE (2026-08-23): Supplier Revision History Surface** — Supplier-source rows in GHG Logs use the existing History action to open a dedicated revision timeline. The protected `/api/supplier-assessment/my-assessment/emissions/{emission_id}/revisions` endpoint returns Pydantic-validated, `_id`-free lineage metadata and revision entries; ordinary emission history remains unchanged. No new MongoDB collection was created. **Verified:** Python/JS lint clean; focused tests **7 passed**; authenticated supplier/admin history-route verification and GHG Logs browser smoke passed. **MOCKED: none.**

## Known Issues

### P0: Process Emissions and Custom Fuel Density Payload Loss
- **RESOLVED (2026-08-20)**: Runtime Process Emissions density is now forwarded to the calc engine as `user_overrides.density` and persisted in `dynamic_field_values`, even when density is a virtual field outside the configured field list.
- Custom Fuel continues to preserve the entered directional density in both calculation overrides and saved field values. The legacy Process Template path also retains supplied density in formula values and persistence payloads.
- Verified: frontend lint; focused frontend suites 16/16; backend density/venting regressions 5/5; authenticated no-save Scope 1 Add Emission smoke. No backend calculation-engine changes.

### P0: Edit Form Methodology Inference Bug
- **RESOLVED**: Nullable `ef_quantity` values are excluded from Quantity Basis methodology inference in `Emissions.js`.
- Verification was intentionally skipped at the user's request.

### Resolved: Required-Input Units in GHG Ledger Views
- User confirmed the monthly/yearly required-input unit work is fixed and removed it from the active task list (2026-08-21).

### Resolved: C6 Create Form Layout/Dropdown Overflow
- Scope 3 C6 calculation-method menu is now constrained to the visible viewport and the create dialog preserves its normal desktop max width.

### P1: BRSR Section A Stale Form Data on Year Switch
- Stale data bleeds into new year view when reporting year is changed.
- Fix: Reset `formData` to `INITIAL_FORM_DATA` in `BRSRDetailsSection.js` on year change.

### Closed: Playwright Locator Timeouts on Shadcn Select
- User requested that this E2E automation-only concern be removed from the active task list (2026-08-21). No product or test-automation code was changed.

### P2: Inflation Rate Path for Spend-basis
- 3 conflicting resolution paths identified.
- Fix: Correct `currency_conversion` lookup, ensure `reporting_period` populated.

### Pre-existing: Legacy Backend Test Failures (non-golden)
- Stale expected record counts in `test_calc_engine_phase3.py` and `test_phase_b5_emissions_refactor.py`.

## Prioritized Backlog

### P0 — Supplier Assessment (gated)
- Phase 1 Compatibility Foundation — **DONE (2026-08-22)**
- Phase 2: Documents module — **focused agreement upload/view/accept/completion tranche DONE (2026-08-22)**. Remaining: configurable rule modes, supplier-upload rules, replacement/deletion management, and broader document administration.
- Phase 3: Focused Training content, assignment, protected access, threshold completion, and live-R2 cleanup — **DONE (2026-08-22)**. PPT slide conversion and byte-range media telemetry remain intentionally deferred.
- Phase 4: Supplier module-driven dashboard — **PARTIALLY DONE (2026-08-22):** registry-backed module labels/progress and ESG/GHG visibility. Remaining: module-specific action cards/routes for Documents and Training, richer module status, and responsive supplier flow closeout.
- Phase 5: Organization/Admin program, document, and training configuration UX — **PARTIALLY DONE (2026-08-22):** Superadmin organization-level registered workflow selection and display names. Remaining: customer-admin program/document/training configuration and management UX.
- Phase 6: Completion/submission integration — blocked until prior Supplier Assessment phases.
- Phase 7: Cross-suite hardening and compatibility regression gate — blocked until prior Supplier Assessment phases.
- Immutable submission and parent-controlled unlock workflow — **DONE (2026-08-23)**. Follow-up: add disposable deterministic fixtures for complete unlock/resubmit mutation coverage without altering shared preview data.

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

### Historical backlog snapshot (superseded)

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

### Historical backlog snapshot (superseded)

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

### Historical backlog snapshot (superseded)

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

### Historical backlog snapshot (superseded)

- **P1:** BRSR Section A stale form data on year switch; Custom Dashboard; Target Settings UI; SHA-256 evidence integrity; supplier/customer onboarding; BRSR Word export; MIS preview/bookmarks.
- **P2:** Correct spend-basis inflation resolution; Custom Fuel month-value copy; repair legacy non-golden backend failures.
- **P3:** Scope 1/3 dashboard deduplication; admin disable UI. Phase 7 remains explicitly blocked.

## Change Log — 2026-08-20: Process Emissions Carbon Composition Quantity Save

- Fixed the Create-form submission boundary for Process Emissions Carbon Composition. Legacy row values stored as `qty` or `quantity` now populate the configured `quantity_used_process_emissions` key before validation, calculation, and persistence.
- The normalization applies only to the affected Process Emissions Carbon Composition flow; stored dynamic-field names, decision-tree routing, backend APIs, and all calculation-engine code remain unchanged.
- **TESTING WAS NOT RUN at the user’s explicit request.** No APIs are **MOCKED**.

## Change Log — 2026-08-20: Fuel Quantity Unit State Initialization

- Fixed P0 Create-form initialization for fuel-backed quantity fields in monthly and yearly entries. When a generic schema default (for example `kg`) is not valid for the selected fuel, form state now initializes to the selected fuel's first valid unit (for example Diesel `L`).
- This keeps persisted `qty_unit` aligned with the visible dropdown and prevents an untouched volume unit from being submitted as an invalid mass unit.
- Scope is intentionally limited to unit initialization. **TESTING WAS NOT RUN at the user's explicit request.** No APIs are **MOCKED**.

### Historical backlog snapshot (superseded)

- **P0:** User validation of standard-fuel volume-unit save behavior and Process Emissions Quantity Basis routing in live Create and Edit flows.
- **P1:** Missing monthly/yearly required-input units (blocked pending approval); BRSR Section A stale form data on year switch; Custom Dashboard; Target Settings UI; SHA-256 evidence integrity; supplier/customer onboarding; BRSR Word export; MIS preview/bookmarks.
- **P2:** Stabilize Shadcn Select Playwright locators; correct spend-basis inflation resolution; Custom Fuel month-value copy; repair legacy non-golden backend failures.
- **P3:** Scope 1/3 dashboard deduplication; admin disable UI. Phase 7 remains explicitly blocked.

## Change Log — 2026-08-20: Scope 1 Unit-Key and Density Guard Correction

- Fixed all `activeMonths` state loops in `EmissionEntryForm` to derive the storage key from `month.key`. Unit initialization, default materialization, Scope 3 EF synchronization, and fuel-backed unit synchronization now update the actual month (`"01"`–`"12"`) instead of an object-coerced key.
- Restricted `/api/emissions` mass/volume Density validation to Process Emissions and Custom Fuel. Standard Stationary and Mobile Combustion records no longer receive a false user-density error; their configured fuel factors remain available to the existing calculation flow.
- No calculation-engine files were changed. **TESTING WAS NOT RUN at the user’s explicit request.** No APIs are **MOCKED**.

## Change Log — 2026-08-20: Runtime Density Scope Correction

- Restricted the shared Create-form runtime Density path to Process Emissions and Custom Fuel. Standard Stationary/Mobile fuel rows, including Diesel Quantity Basis, no longer create a runtime Density requirement from a mass/volume unit comparison.
- Cleared stale `runtime_density_required` flags when a user switches back to a standard fuel/category. Yearly Process Density and the legacy volume-density prompt now use the same Process-only boundary.
- Verified with focused JavaScript lint on `Step3YearMonthlyData.js`. No APIs are **MOCKED**.

## Change Log — 2026-08-20: Monthly Validation and Custom Fuel Edit Repair

- P0: Untouched monthly rows no longer count factor defaults such as Density or Oxidation Factor as an entered emission. Completion, required-field validation, runtime-density validation, and optional-override validation now begin only after a core activity input is supplied.
- P0: Custom Fuel Edit restores the Quantity Used unit selector. It updates the dedicated `custom_qty_unit` state and the dynamic quantity unit together, preserving the unit selected for recalculation and save.
- P0: Changing a Create-form Process Type now explicitly initializes `calculation_methodology` to `using_heat_basis_ncv`, matching the visible default and allowing immediate formula routing.
- No backend or `/app/backend/calc_engine/` code was changed. **TESTING WAS NOT RUN at the user's explicit request.** No APIs are **MOCKED**.

### Historical backlog snapshot (superseded)

- **P0:** User validation of the standard-fuel Carbon Composition density fallback, custom Fugitive Fuel quantity × GWP routing and configured-unit list, four repaired frontend cases, and monthly atomic-save rollback behavior.
- **P1:** Missing monthly/yearly required-input units (blocked pending approval); BRSR Section A stale form data on year switch; Custom Dashboard; Target Settings UI; SHA-256 evidence integrity; supplier/customer onboarding; BRSR Word export; MIS preview/bookmarks.
- **P2:** Stabilize Shadcn Select Playwright locators; correct spend-basis inflation resolution; Custom Fuel month-value copy; repair legacy non-golden backend failures.
- **P3:** Scope 1/3 dashboard deduplication; admin disable UI. Phase 7 remains explicitly blocked.

## Change Log — 2026-08-20: Standard-Fuel Carbon Composition Density Fallback

- P0 fix: Stationary and Mobile Combustion Carbon Composition submission validation now accepts the selected standard fuel's configured density and density unit when the row has no user-entered density.
- An explicit row density still takes precedence; Custom Fuel remains unchanged. No backend or calculation-engine code was changed.
- Verified: focused JavaScript lint passed for `useEmissionSubmit.js`. No APIs are **MOCKED**.

## Change Log — 2026-08-21: Custom Fugitive Fuel Quantity × GWP Route

- Custom Fuel for Fugitive Emissions now requires only Quantity and GWP Fugitives. Emission Factor, Calorific Value, Carbon Composition, and Density inputs are not rendered or validated for this route.
- The shared custom-fuel adapter, Create payload, Edit payload, and calculation audit payload preserve GWP Fugitives as a user override while keeping all other custom-fuel routes unchanged.
- Verified: focused adapter suite passed (16 tests), touched source files passed lint, and the login page completed a browser smoke check. No APIs are **MOCKED**.

## Change Log — 2026-08-21: Data-Driven Custom Fugitive Quantity Units

- Custom Fugitive Fuel quantity selectors now reuse the matching Fugitive fuel-master `allowed_units` for the active scope/category, across monthly Create, yearly Create, and Edit. No new `kg`/`g`/`t` list is hardcoded.
- The shared resolver deduplicates all units configured for matching Fugitive fuel masters; the general custom-fuel option configuration remains only as a temporary fallback while fuel master data is unavailable.
- Verified: focused master-unit resolver test passed, touched source files passed lint, and the browser smoke check passed. No APIs are **MOCKED**.

## Change Log — 2026-08-21: User-Confirmed Task Closure

- Removed from the active task list at the user's confirmation: required-input units in monthly/yearly views; atomic monthly-save rollback behavior; standard stationary/mobile quantity-basis routing and Process Emissions quantity validation.
- Removed the Shadcn Select Playwright locator-timeout item from the active task list at the user's request. It was an E2E automation reliability concern, not a confirmed application defect.
- No application source, calculation engine, test suite, or test-report artifact was modified in this status-only update.

## Change Log — 2026-08-21: Historical Test-Report Cleanup

- At the user's request, removed all historical artifacts from `/app/test_reports` (JSON reports, JUnit XML, screenshots, PDFs, and exported payloads).
- Kept `/app/test_reports` as an empty destination for future test runs. Source regression suites—including backend golden tests and frontend refactor contracts—remain intact.

## Change Log — 2026-08-23: Supplier Assessment P0/P1 Submission, Review, Period, Assignment, and Reminder Workflows

- P0: ESG, GHG, Document, and Revenue completion now recognises only submitted parent-visible data. Revenue has an explicit draft → submitted workflow and blocks edits after submission. Supplier questionnaire responses, manual scores, rankings, GHG progress, and revenue submissions use the relationship reporting period.
- P0: Parent organisations can open a submitted ESG response and save a validated manual score. Submission scoring receives the current answers rather than reading an unsaved response from MongoDB.
- P1: Supplier creation supports reporting periods plus assigning existing document/training content. Document and Training assignment screens use searchable, paginated supplier pickers; document requirements support due dates.
- P1: Manual reminders accept empty or module-specific payloads, support ESG/GHG/Documents/Training/Revenue choices, respect a reporting period, and include pending document/training due dates. The unreachable Resend send call was corrected.
- Verified: Supplier Assessment P0/P1 live suite passed **7 passed, 1 skipped**; Python and JavaScript lint passed; signed-in Suppliers smoke check passed. No APIs are **MOCKED**.

### Prioritised Backlog

- **P1:** Automatic reminder scheduler; document replacement/version publishing; advanced document response types; custom dashboard; target settings; evidence integrity; supplier/customer onboarding wizards; BRSR Word export and prior-year columns.
- **P2:** MIS schedule preview/report bookmarks; Custom Fuel month-value copy; spend-basis inflation resolution; remaining non-golden backend test cleanup.
- **P3:** Scope 1/3 dashboard deduplication; admin disable UI. Phase 7 unified GHG form remains strictly blocked until instructed.

## Change Log — 2026-08-23: Supplier Portal Task and Submission Clarity

- **DONE:** Revenue Information now has an explicit task checklist for revenue percentage, annual amount, and final submission. Each task visibly reports `Pending`, `Ready to submit`, or `Completed`.
- **DONE:** Revenue and ESG questionnaire submits now require an in-app confirmation that clearly explains the data will lock after submission. Save Draft and Submit actions have deliberate spacing.
- **DONE:** The ESG dashboard lists every assigned questionnaire, including multiple assignments, and displays each question with its saved response or a pending-response state.
- Per user instruction, this frontend-only change was **not tested**. No APIs are **MOCKED**.

## Change Log — 2026-08-23: Supplier Dashboard Workflow Routing

- **DONE:** ESG now shows only each questionnaire’s progress and submission state; unfinished questionnaires provide a direct Continue ESG action.
- **DONE:** GHG distinguishes no entries (opens Environment → GHG Logs) from unsubmitted entries (opens Supplier Assessment → GHG submission). Submitted GHG shows its submitted state without an action.
- **DONE:** Configured Documents and Training modules now appear as status cards with completion, pending/completed/no-assignment states, and direct task actions only when work remains.
- Per user instruction, no further UI test was run after implementation. No APIs are **MOCKED**.

## Change Log — 2026-08-23: Dedicated Supplier ESG and Training States

- **DONE:** Added a dedicated supplier ESG route at `/supplier-assessment/supplier/esg`, linked from the supplier dashboard and sidebar. It presents every assigned questionnaire, its questions, saved answers, pending responses, progress, and a direct continuation action.
- **DONE:** The parent organization’s `/supplier-assessment/esg` questionnaire builder remains unchanged and separate from the supplier portal route.
- **DONE:** Removed per-training percentage display. Each training now reports only `Not started`, `In progress`, or `Completed`.
- Frontend lint passed before the user paused testing; per user instruction, no further test was run. No APIs are **MOCKED**.

## Change Log — 2026-08-23: Supplier Assessment Assignment and Program Repair

- **FIXED:** Edit Supplier now always initializes document and training assignment arrays, preventing the `.includes()` runtime crash.
- **FIXED:** Training creation now loads the complete supplier relationship, preserves its reporting period and full program configuration, and refreshes completion immediately after assignments are stored.
- **FIXED:** Explicitly targeted document requirements remain accessible and count toward completion after later program revisions; unassigned suppliers remain excluded.
- **FIXED:** Training with no active assignments is excluded from overall-progress weighting rather than counted as 100% complete.
- **DATA REPAIRED:** Test Supplier (`aede75ba-cc86-48ad-ad8b-b350c29c3c68`) was moved to complete program revision 8, its two training assignments were repaired to `FY 2026-27`, and its progress snapshot was recalculated to 0%.
- Per user instruction, no further test run was performed after these changes. No APIs are **MOCKED**.

### Follow-up — Training Reporting-Period Visibility

- Confirmed the training creation path now reads the full relationship record and persists `relationship.reporting_period` into each training assignment. Existing active assignments for the affected organization no longer have a null reporting period. Per user instruction, no test suite was run.

## Change Log — 2026-08-23: Scrollable Supplier Forms

- Updated Add Supplier and Edit Supplier dialogs with viewport-bounded layouts: the header and actions remain visible while the form content scrolls independently, including document/training assignment lists.
- Added stable test identifiers for the dialogs, scroll areas, and form actions. JavaScript lint completed before the user requested no further testing; no browser or flow testing was run. No APIs are **MOCKED**.

## Change Log — 2026-08-23: Empty Supplier Assignment Cleanup

- The Add Supplier form now shows “Assign existing content” only when at least one active document or training requirement is available. Empty assignment controls no longer take space in a new workspace.
- Per user instruction, this focused UI adjustment was not tested. No APIs are **MOCKED**.

## Change Log — 2026-08-23: Explicit ESG Questionnaire Assignment

- Add Supplier now loads active ESG questionnaires and presents a selectable assignment list whenever ESG is enabled. Active questionnaires are preselected for continuity; the parent organization can choose the exact questionnaire set and must retain at least one when ESG is enabled.
- The selected IDs are persisted on the supplier relationship. Supplier questionnaire lists, direct questionnaire access, answer submission, and ESG completion calculations now use that assigned set. Older relationships without assignment data retain their historical all-active-questionnaire behavior.
- Existing supplier edit submissions do not change questionnaire assignments. Per user instruction, this implementation was not tested. No APIs are **MOCKED**.

## Change Log — 2026-08-23: Questionnaire Creation Targeting

- New Questionnaire now includes an assignment choice for the active reporting period: assign to all eligible ESG suppliers or select individual suppliers. Supplier selection is required in the selected-suppliers mode.
- Creation persists the target list, updates each selected relationship’s questionnaire assignment, and freezes legacy implicit relationships to their pre-existing questionnaire set so a newly targeted questionnaire does not leak to unselected suppliers.
- Per user instruction, this implementation was not tested. No APIs are **MOCKED**.

## Change Log — 2026-08-23: Post-Creation Supplier Questionnaire Management

- Edit Supplier now displays the active ESG questionnaire assignments and allows parent organizations to add or remove unsubmitted questionnaires. Submitted questionnaire rows are visibly locked and cannot be removed in the UI.
- Backend assignment updates validate active questionnaires, reject any attempt to remove a questionnaire with a submitted response, and refresh ESG completion after assignment changes. Legacy all-active assignments are resolved explicitly before editing.
- Per user instruction, this implementation was not tested. No APIs are **MOCKED**.

## Change Log — 2026-08-23: Global Supplier Assessment Reporting-Period Selector

- Added one persistent reporting-period selector across the customer-admin Supplier Assessment workspace. It reads available supplier periods, keeps the selected period while navigating among assessment pages, and includes current/adjacent calendar-year options for new periods.
- Supplier lists, supplier assignment search, rankings, submitted GHG, document requirements/responses, and training assignment/progress are now requested and displayed for the active reporting period. New supplier creation defaults to that same selected period.
- Per user instruction, this change was **not tested**.

## Change Log — 2026-08-23: Fiscal-Year Default Correction

- Corrected the Supplier Assessment selector and new-supplier default to derive reporting periods from the organization’s `reporting_year_type` and `financial_year_start_month`.
- Financial-year organizations now receive labels such as `FY 2026-27`; calendar-year organizations receive `CY 2026`. A stale saved selector choice from the wrong type is automatically replaced with the organization’s current default.
- Per the previous user instruction, this correction was **not tested**.

## Change Log — 2026-08-23: API Startup Recovery

- Restored the missing `Optional` typing import in `ghg_submission_service.py`, which was preventing the backend from importing and produced `502 Bad Gateway` responses, including on login.
- Verified the external `POST /api/auth/login` response recovered with HTTP 200 in 0.53 seconds.

## Change Log — 2026-08-23: Confirmed Org1 Supplier Assessment Data Purge

- After explicit confirmation, permanently removed Org1’s supplier-assessment data and linked R2 objects: 5 supplier relationships, 8 supplier GHG records, 3 ESG responses, 1 revenue submission, 4 document versions/requirements, 4 training contents/versions/requirements, 8 training assignments, progress and consumption events, plus legacy document responses.
- Removed 24 linked R2 assets, including documents and rendered training viewer files. Verification confirmed zero Org1 supplier relationships, document/training records, and zero objects under the Org1 supplier-assessment R2 prefixes.
- Supplier user accounts and organizations were retained as explicitly scoped during confirmation.

## Change Log — 2026-08-23: Canonical Supplier Assessment Scoring

- P0: Questionnaire configuration now persists ESG Category Weight and Overall Component Weight values. Questions use Simple Mode Importance (`Low`, `Medium`, `High`, `Critical`) or an Advanced exact numerical override—never both combined. The builder keeps all six scoring methods and hides raw question weights unless Advanced Configuration is opened.
- P0: Submission scoring receives the submitted answer payload, persists question/section/ESG breakdowns, and refreshes one relationship-level `canonical_score_snapshot`. GHG is scored from submitted Scope 1+2 emissions intensity per supplier revenue million. Supplier details, rankings, and supplier lists read the persisted canonical snapshot rather than recalculating scores.
- P0 follow-up: questionnaire creation now defaults `scoring_method` to `question`, avoiding the prior 500 response. Login now has a five-failure, 15-minute account lockout and backend CORS requires explicit configured origins.
- Verified: Python/JavaScript lint passed; canonical scoring unit suite passed **3/3**; live questionnaire configuration persistence passed with automatic cleanup; ranking/supplier endpoints returned HTTP 200; backend CORS allowed only the configured origin and rejected an untrusted origin; lockout returned HTTP 429 after five invalid attempts. The retained supplier test account has no active relationship because Org1 assessment data was intentionally purged, so a full live supplier submission requires new relationship fixture data. No APIs are **MOCKED**.

### Prioritised Backlog

- **P1:** BRSR Section A year-switch state correction; document replacement/version publishing; advanced document response types; custom dashboard; target settings; evidence integrity; supplier/customer onboarding wizards; BRSR Word export and prior-year columns.
- **P2:** Spend-basis inflation resolution; MIS schedule preview/report bookmarks; Custom Fuel month-value copy; remaining non-golden backend test cleanup.
- **P3:** Scope 1/3 dashboard deduplication; admin disable UI. Phase 7 unified GHG form remains strictly blocked until instructed.
