# ESG Platform — Product Requirements Document

## Original Problem Statement
Maintain the product roadmap and repository health while fixing backend defects and improving the Supplier Portal and GHG workflows. Bulk Upload must stay in strict architectural parity with the canonical GHG configuration and entitlement pipeline rather than introducing route-specific shadow configuration.

## Product Goal
Provide a dependable ESG and GHG management platform where organization configuration controls every supported input path consistently, including manual entry, Bulk Upload, reporting, supplier assessment, and administrative workflows.

## User Personas
- **Super Admin:** Configures organization capabilities, module access, plan limits, workflows, and platform-wide controls.
- **Organization Admin:** Manages facilities, emissions, ESG records, suppliers, documents, training, targets, and reports.
- **Assigned User:** Enters and manages records allowed by facility, KPI assignment, workflow, and organization entitlements.
- **Supplier User:** Completes assigned ESG, GHG, document, and training requirements with immutable submissions.

## Core Product Requirements

### Canonical Configuration
- `organization_config` is the single source of truth for module entitlements and GHG capability overrides.
- All manual, bulk, supplier, report, and target routes must consume canonical resolvers.
- Do not introduce duplicate or route-local authorization/configuration systems.
- `/app/backend/calc_engine/` remains frozen unless separately approved.

### GHG Data Entry
- Support monthly and yearly GHG records across Scope 1, Scope 2, Scope 3, and supported biogenic paths.
- Preserve the shared create/edit payload contracts, calculation audit linkage, and approval behavior.
- Monthly multi-row manual submissions must remain atomic through `submission_batch_id` rollback.
- Organization scope/category/custom-fuel/process-type capabilities must be enforced server-side.

### GHG Period Row Allowance
- `entitlements.environment.ghg.monthly_rows_allowed` is an organization-wide base allowance.
- A configured value of `10` allows up to 10 current GHG records for each distinct monthly reporting period such as `2026-05` and another 10 for `2026-06`.
- Yearly-frequency allowance is `monthly_rows_allowed × 12` for each distinct yearly reporting period. A configured value of `10` therefore allows 120 rows for `CY2026` and separately 120 rows for another reporting year.
- Monthly and yearly quotas are independent.
- Legacy monthly records without `frequency_type` count as monthly records.
- Superseded supplier revisions where `is_current_revision` is false do not consume current-row allowance.
- Manual GHG, C7 monthly/yearly, Bulk Upload preview, direct bulk save, and confirm-save must enforce the same rule.
- Bulk Upload must mark excess records with `PERIOD_ROW_LIMIT_EXCEEDED`, keep in-limit records saveable, and recheck the batch immediately before persistence.
- A blank `monthly_rows_allowed` value means unlimited.

### Bulk Upload
- Generate organization-aware Scope 1, Scope 2, and Scope 3 Excel templates.
- Enforce enabled scopes, disabled categories, Process Emissions, Flaring, process types, and custom-fuel capability through the canonical resolver.
- Support standard and custom fuel calculations without changing the frozen calculation engine.
- Provide dry-run preview totals before saving.
- Preserve valid-row partial success while surfacing row-level errors and warnings.
- Roll back partial inserts when a bulk persistence operation fails.
- Enforce 10 MB maximum file size, 5,000 data rows per sheet, and 25,000 data rows per workbook.
- Store pending validated records for no longer than 24 hours.

### Supplier Assessment
- Preserve the module registry and immutable program revision model.
- Support ESG and GHG immutable submissions with parent-controlled reopen/resubmission.
- Treat the active supplier relationship's `reporting_period` as the only allowed GHG reporting assignment.
- For an assigned financial year such as `FY 2025-26`, monthly supplier entries may use only April 2025 through March 2026 and yearly entries must use `FY 2025-26`.
- Supplier Add forms must display and lock the assigned reporting year; Edit forms must keep the existing in-assignment reporting period read-only.
- Supplier GHG APIs must reject create or update payloads outside the active assignment and supplier record lists must exclude unrelated periods and relationships.
- Supplier GHG scope access must resolve from the bound immutable assessment-program revision, not from supplier-organization GHG capabilities or relationship shadow fields.
- Suppliers may only receive Scope 1, Scope 2, or both, exactly as assigned by the parent organization.
- Scope 3 and Biogenic must never appear in supplier tabs, Add/Edit forms, record lists, submission summaries, or accepted API payloads.
- Direct supplier navigation to an unassigned GHG scope must fall back to the first assigned scope.
- Supplier users must not see GHG Version History icons or history dialogs.
- Supplier GHG create and edit activity must still be recorded internally in the canonical `emission_history` collection, using the same audit model as normal organization GHG records.
- Parent/admin users retain internal history access where authorized, while supplier submission/reopen lineage remains separate and unchanged.
- Supplier users must not access the main organization Dashboard, GHG Base Year, or GHG Analysis modules; the Supplier Assessment dashboard remains available.
- Dashboard, Sinks, Base Year, and Analysis must use muted supplier navigation text while remaining clickable.
- Clicking `/dashboard`, `/ghg/base-year`, or `/ghg/analysis` as a supplier must navigate to the route and render the established full-page Premium Module locked experience.
- Do not add sidebar lock icons or blocked-link behavior to these items.
- Require suppliers to acknowledge that submitted ESG and GHG data has been reviewed and verified for accuracy and completeness before final submission is enabled.
- Enforce the acknowledgement in backend request contracts and store `data_verified`, `data_verified_at`, and `data_verified_by` with the submitted record for auditability.
- Support versioned Documents responses and Training progress while retaining audit history.
- Soft-deleted/deactivated suppliers must not retain platform access.

## Architecture
- `/app/backend/modules/sustainability_config/` — canonical organization settings and GHG overrides.
- `/app/backend/modules/entitlements/` — canonical module access and numeric plan-limit enforcement.
- `/app/backend/modules/emissions/` — manual GHG create, edit, history, C7, rollback, and response contracts.
- `/app/backend/bulk_upload_scope3/` — Excel generation, streaming parsing, validation, preview, and record construction for all GHG scopes.
- `/app/backend/modules/supplier_assessment/` — supplier programs, submissions, Documents, Training, and completion.
- `/app/backend/calc_engine/` — frozen calculation decision engine.
- `/app/frontend/src/modules/ghg/` — shared GHG capabilities, form orchestration, adapters, and category modules.
- `/app/frontend/src/modules/bulkUpload/` — module-aware Bulk Upload UI and API orchestration.

## Primary Data Collections
- `organization_config` — entitlements, GHG overrides, aliases, and organization settings.
- `emission_records` — current GHG records and immutable supplier revisions.
- `emission_history` — emission version history.
- `bulk_upload_jobs` — validation/save job metadata.
- `bulk_upload_pending_records` — validated records awaiting confirmation; 24-hour TTL.
- `bulk_upload_errors` — row-level validation errors.
- `supplier_relationships` and `supplier_assessment_programs` — supplier assignment and immutable program revision binding.

## Key API Endpoints
- `POST /api/emissions`
- `POST /api/emissions/c7/month`
- `POST /api/emissions/c7/yearly`
- `POST /api/emissions/batch-rollback`
- `POST /api/bulk-upload/scope3/upload`
- `POST /api/bulk-upload/scope3/jobs/{job_id}/save`
- `GET /api/bulk-upload/scope3/template/download`
- `GET /api/sustainability-config/resolved`

## Current Verification Baseline
- GHG period row-limit focused regression: **7/7 passed** on 2026-08-25.
- Independent feature verification: backend **100%**, frontend smoke **100%**, no mocked APIs.
- Bulk Upload page authenticated smoke passed at `/uploads/bulk`.
- Bulk Upload architectural parity suite iteration 18 passed with 11 backend checks and frontend code verification.
- Two unrelated pre-existing checks remain outside this feature: preview-gateway CORS header rewriting and stale restricted-user entitlement fixture state.

## Latest Changes — 2026-08-25
- Supplier invitation emails are now assignment-aware: they list Revenue, ESG, GHG, Documents/Agreements, and Training according to the supplier's enabled assessment modules.
- The supplier assessment dashboard now uses always-visible static module panels rather than collapsible accordions. Panels and progress cards use softer rounded corners and subtle elevated shadows.
- The standalone supplier ESG overview now uses the same static panel component, eliminating the stale accordion import that caused a frontend compilation error.
- Supplier dashboard refinement: Revenue Information is the only collapsible panel; ESG, GHG, Documents, and Training now keep their progress percentage and primary action in one compact row, with no duplicate questionnaire progress bar and wider spacing between panels.
- Supplier GHG submission refinement: Scope 1 and Scope 2 draft totals now use distinct Factory/Zap icons with blue/purple edge shadows, and scope/category rows use matching colored scope boxes.
- Supplier GHG shadows were reduced to a subtle, tighter blue/purple depth treatment to avoid visual overload.
- Supplier dashboard color treatment: each Overall Progress tile and matching requirement card now uses a subtle shadow in its icon accent color (blue, indigo, emerald, cyan, or amber).
- Supplier dashboard spacing refinement: requirement panels use wider vertical spacing, while Overall Progress tiles use larger gaps and tighter accent shadows to prevent neighboring color shadows from blending.
- Supplier detail-page consistency: ESG questionnaire cards use indigo shadows. Document and Training detail cards intentionally retain their original neutral card treatment.
- Verification was intentionally skipped at the user's request (`dont test`).

## Latest Changes — 2026-08-26
- Dashboard GHG aggregation now uses one eligible-record lifecycle filter: deleted, draft, pending, rejected, superseded, and non-current supplier revisions are excluded before totals are calculated.
- Dashboard reporting ranges use exact enumerated monthly/FY/CY values (including explicit legacy variants), reject incomplete or malformed date ranges, normalize valid legacy scope/period values once, and prefer yearly records over overlapping monthly records to prevent double counting.
- Previous-year dashboard requests now send repeated `facility_id` query values as the API expects; target KPI mapping no longer falls back to substring matches.
- The Reduction Target Achieved card now maps the target API's `target_name`, displays the active target name, and shows named options in the target selector.
- Focused backend checks passed before the latest UI request (14 checks). Per the user's subsequent `dont test` instruction, no further validation was run after the final UI-only adjustment.

## Latest Changes — 2026-08-26 (Lifecycle and Target Alignment)
- Applied `eligible_ghg_record_filter()` to previously unprotected GHG reads in the executive ESG analytics service, environment-detail dashboard, GHG-to-ESG integration, GHG target baseline lookup, MIS emissions summaries/deep-dive data, and Super Admin organization emissions statistics.
- The main GHG dashboard no longer treats overlapping monthly and yearly records as duplicates; it retains both reported inputs, matching the Target module’s intended aggregation behavior.
- The Reduction Target Achieved card now displays the backend Target module’s precomputed `progress_percentage` directly. The frontend no longer recalculates target progress from dashboard totals, so Scope 1 + 2 targets use their canonical target calculation.
- Before the user stopped further testing, the live target endpoint returned 72.8% and 75.0%, and the dashboard card displayed 72.8%. No additional tests were run after the user's `dont test` instruction.

## Latest Changes — 2026-08-26 (Complete Lifecycle Filter Rollout)
- Completed the remaining canonical `eligible_ghg_record_filter()` rollout for facility, consolidated, inventory, and AI-generated reports; legacy base-year discovery, synchronization, and change-year calculations; Internal Data AI emission search; and supplier GHG scoring.
- These paths now consistently exclude deleted, draft, pending, rejected, superseded, and non-current supplier-revision GHG records before calculating or presenting totals.
- No tests or lints were run for this rollout, following the user's explicit `dont test` instruction.

## Latest Changes — 2026-08-26 (Scope 3 Spend Currency Conversion P0)
- Added a Scope 3 spend-basis selector for `Standard Currency Conversion` or `PPP and Inflation Rate`. Legacy/manual records without a selection are explicitly routed to `ppp_inflation`, preserving historic calculations.
- Added effective-dated currency configuration: rates now support `conversion_method`, optional `month_applicable`, and `effective_from`. The calculator selects an exact monthly rate before a matching annual rate.
- Added an isolated standard-currency formula and decision-tree branch across all 15 Scope 3 category trees. PPP uses the original formula; standard conversion uses the active market exchange rate snapshot.
- Updated Bulk Upload templates and record payloads with spent currency, currency conversion method, and optional standard-rate override fields. Month labels such as `May-2025` normalize before effective-rate lookup.
- Verification passed: backend/frontend testing agent iteration 21 (100% backend and frontend), including formula fallback, monthly-rate precedence, Super Admin controls, manual selector, and template columns. Temporary test rates were deleted.

## Latest Changes — 2026-08-26 (Scope 3 Spend Override and Edit Parity)
- The shared GHG form context now passes `spend_currency_conversion_method` into decision-tree traversal, so Spend Basis selects the correct PPP/Inflation or Standard Currency formula before fields are derived.
- Added the Scope 3 `exchange_rate` override mapping and made the Exchange Rate property overridable. The idempotent migration updated the live configuration and all 15 Scope 3 decision trees; PPP and Inflation continue to use their existing dynamic rate resolver, with no property-source mapping added.
- Edit drafts now hydrate, display, calculate with, and persist the selected currency conversion method. Edit shows the same method selector as Create, and refreshes the displayed overrides when it changes.
- Per user instruction, frontend/backend testing was intentionally skipped for this change.

## Latest Changes — 2026-08-26 (Scope 3 Standard Currency Edit Repair)
- Fixed the Scope 3 spend-basis edit payload: the selected `spendCurrencyConversionMethod` is now passed from `Emissions.js` and consumed by `Scope3FlatEdit`, preventing the client-side ReferenceError that blocked updates before the API request.
- Corrected the live `exchange_rate` input-field mapping to `unit_source: "none"` with no default or allowed unit. The generic renderer now hides its unit selector through configuration rather than a Standard Currency-specific UI rule. The seed and an idempotent migration preserve this configuration.
- Stabilized shared edit-field headers so long labels and override controls reserve the same vertical space; Amount Spent and Standard Currency Exchange Rate inputs align in the edit dialog.
- Focused lint and non-saving browser checks were completed before the later `dont test` instruction. No additional automated tests or regression-test file were added after that instruction.

## Latest Changes — 2026-08-26 (Base Year Scope 1 & 2 Totals)
- Added live Scope 1, Scope 2, and Total Emissions rollups to both the Scope 1 & 2 base-year setup and edit dialogs. Values update immediately when an emission row is changed.
- The detailed/expanded Scope 1 & 2 panels and read-only base-year dialog show calculated **Total Base Year** values. Per user direction, the always-visible organization/facility row cards show only the base-year label and period.
- Totals intentionally include only Scope 1 and Scope 2 entries; sinks and biogenic entries remain outside this requested Scope 1 & 2 measure.
- Verification passed: focused JavaScript lint, production frontend build (pre-existing warnings only), authenticated browser smoke test, and an unsaved live-value edit check (total changed from `1341.1631` to `1380.0671 tCO₂e`).

## Latest Changes — 2026-08-26 (Base Year Emission Edit/Delete Synchronization)
- Extracted the existing Base Year recalculation into `modules/base_year/sync_service.py` so it can be used by the sync API and the approved-emission lifecycle.
- Approved emission deletes and direct edits now refresh the matching facility and organization Base Year snapshots when either the old or new emission belongs to that Base Year period. Scope changes are handled by refreshing both affected scope groups.
- The synchronization preserves explicitly manually added Base Year categories and ignores emissions outside the Base Year reporting period.
- Annual period matching now uses exact normalized FY/CY ranges. A `FY 2026-2027` emission matches a `FY 2026-2027` Base Year at 100%; proration is used only for genuinely partial annual overlaps. Delete and edit both use this shared rule.
- **NOT TESTED** after implementation, per the user's explicit `dont test` instruction.

## Latest Changes — 2026-08-26 (Canonical GHG Reporting Period Storage)
- New yearly GHG records now persist Calendar Years exclusively as `CYyyyy` (for example, `CY2026`). Inputs using the legacy spaced format, such as `CY 2026`, are normalized before storage. Financial Years are normalized to the full `FY yyyy-yyyy` form.
- The normalization is enforced at the main GHG API contract, supplier GHG contract, C7 yearly contract, and both Scope 3 bulk-upload save paths. Historical records were intentionally not migrated.
- Fixed the GHG Logs period filter to parse both legacy `CY 2022` and canonical `CY2022`, preventing out-of-range legacy CY records from bypassing a selected date window.
- Verification passed: 10 focused pytest checks for contract and bulk-save normalization, authenticated GHG Logs browser smoke test, and frontend/backend lint checks. No mocked APIs or test data were used.

## Latest Changes — 2026-08-26 (Supplier Assessment P0–P2 Experience Pass)
- **P0 Supplier workspace:** Compact create/edit layouts, remove the Documents tint, show Documents/Trainings in edit, make supplier detail scrollable, hide empty Locked ESG submissions, simplify pending GHG intensity, move reporting-period control beside Suppliers, and rename the ledger column to Login Status.
- Fixed supplier document reminders failing with `KeyError: 'id'` by including the requirement `id` in the reminder query projection.
- **P1 ESG questionnaires:** Added a multi-question ledger, supplier preview modal, native drag/drop reordering with persistence, deadline-aware status badge, tooltips for questionnaire/question actions, clearer weight validation, renamed All eligible suppliers to All suppliers, hid questionnaire descriptions, removed advanced question configuration, and require two dropdown choices.
- **P2 Supplier GHG:** Removed the attributed scope/category aggregation section, restyled cards with white rounded/shadowed surfaces, and added supplier/category filters to All Emission Records.
- **NOT TESTED** after this P0–P2 implementation pass, per the user’s explicit `dont test` instruction.

## Latest Changes — 2026-08-26 (Supplier Form & Question Ledger Refinements)
- Put Due Date and Annual Revenue requirement in the same create-supplier grid row. Edit Supplier now shows a locked email field, includes Annual Revenue requirement, and uses distinct ESG, GHG, Documents, and Training cards.
- Restored Question Importance and Scoring Method to each multi-question ledger row; selected values are now included in the save payload.
- Completion Progress displays the persisted module completion values. ESG stays at `0%` until the supplier submits the assigned questionnaire response, while GHG can independently be `100%` after submission.
- **NOT TESTED** after this follow-up, respecting the existing user instruction.

## Latest Changes — 2026-08-26 (Questionnaire Action & Drag Repair)
- Replaced the oversized inline questionnaire row with a dedicated row component. Actions now have a stable 10rem column and wrap safely inside the question boundary.
- Replaced state-only row dragging with a dedicated native drag handle that sets `dataTransfer` and sends the dragged/target IDs to the existing reorder endpoint.
- **NOT TESTED** after this correction, respecting the user instruction.

## Latest Changes — 2026-08-26 (Question Ledger Score Controls)
- Added explicit Yes and No score fields to every Yes/No ledger row and a per-option score field for every dropdown choice.
- The ledger validates every configured score is 0–100 and persists those values into the Boolean or Choice Mapping scoring configuration.
- Reworked ledger rows into responsive stacked configuration panels, preventing the previous narrow multi-column field overflow.
- **NOT TESTED** after this update, respecting the user instruction.

## Latest Changes — 2026-08-26 (Questionnaire Actions Responsive Breakpoint)
- The dense seven-column questionnaire layout now activates only at `2xl`, where the panel has enough width alongside the questionnaire sidebar.
- At all narrower widths, questions use a contained stacked layout and Actions remain inside the question boundary.
- **NOT TESTED** after this correction, respecting the user instruction.

## Latest Changes — 2026-08-26 (Questionnaire Single-Row Layout)
- Removed the locked-email helper copy from Edit Supplier while retaining its disabled email field.
- Questions now use a compact single-row grid from tablet width upward, with reduced column widths, truncation for long labels, and a contained fixed Actions area.
- **NOT TESTED** after this adjustment, respecting the user instruction.

## Latest Changes — 2026-08-26 (Supplier Detail Zero Progress)
- Restored the ESG Questionnaire `0%` row and empty progress bar in Supplier Detail, per user direction.
- Fixed the unrelated stray standalone `0` below Completion Progress: the score-card conditional previously evaluated to numeric zero and React rendered it. It now checks for present values explicitly and preserves valid score values of `0`.
- **NOT TESTED** after this adjustment, respecting the user instruction.

## Latest Changes — 2026-08-26 (Questionnaire Creation Simplification)
- Removed the Overall Component Weight accordion from the Create Questionnaire form while preserving the default and historical stored values.
- **NOT TESTED** after this adjustment, respecting the user instruction.

## Latest Changes — 2026-08-26 (ESG-Only Supplier Scoring)
- Supplier Detail now exposes only ESG Score and the Environment/Social/Governance ESG breakdown. GHG Score, Overall score, and GHG intensity were removed from the score view.
- Canonical supplier scoring now uses submitted ESG results only; GHG, revenue, documents, and training continue as progress/data modules and no longer affect supplier score completion or ranking.
- **NOT TESTED** after this change, respecting the user instruction.

## Latest Changes — 2026-08-26 (Supplier Card Visual Alignment)
- Create Supplier cards now use very light purple ESG, blue GHG, teal Documents, and amber Training borders with white surfaces and subtle matching edge shadows.
- Edit Supplier aligns ESG/GHG in a two-card row and uses the same white, lightly shadowed colored-border treatment for all four module cards.
- Removed green/yellow tinting from Yes/No and dropdown score configuration panels in the question ledger; score panels are now neutral white.
- **NOT TESTED** after this update, respecting the user instruction.

## Latest Changes — 2026-08-26 (Supplier GHG Tabs & Card Shadows)
- Strengthened Create Supplier Documents and Training card shadows with explicit teal and amber edge depth.
- Split Supplier GHG Emissions into **Emissions by Supplier** (summary cards and supplier table) and **Logs** (filters and All Emission Records) tabs.
- **NOT TESTED** after this update, respecting the user instruction.

## Latest Changes — 2026-08-26 (Supplier GHG Inline Reporting Period)
- Moved the Supplier GHG reporting-period selector to the right side of its heading row and suppressed the redundant global period bar on this route.
- **NOT TESTED** after this update, respecting the user instruction.

## Latest Changes — 2026-08-26 (Supplier Update, Entry Forms & Heading Cleanup)
- Fixed Supplier Update failing when an existing assignment references an inactive questionnaire: existing IDs can be retained, while only newly selected inactive questionnaires are rejected. Validation errors now return clear HTTP 400 responses.
- Added case-insensitive duplicate supplier organization-name validation for create and update flows within the same parent organization.
- Agreements and Trainings now open on their published-list views; the respective create forms are hidden until the user clicks Add agreement / Add Training. Renamed Select visible to Select All.
- Standardized key parent-admin headings to `text-2xl` across Suppliers, Supplier Agreements, Trainings, ESG Questionnaires, and Supplier GHG.
- **NOT TESTED** after this update, respecting the user instruction.

## Latest Changes — 2026-08-26 (Edit Assignment Preselection)
- Edit Supplier now explicitly maps the loaded supplier’s effective document/training IDs onto the checkbox lists after the requirements load, so existing assignments appear selected before any changes are made.
- **NOT TESTED** after this update, respecting the user instruction.

## Latest Changes — 2026-08-26 (Agreement Assignment Visibility)
- Parent-org agreement cards now display the names of active suppliers assigned to each agreement; the documents API enriches requirements with effective assigned supplier names, including program-wide assignments.
- **NOT TESTED** after this update, respecting the user instruction.

## Latest Changes — 2026-08-26 (Supplier Submission and Training Progress Refinements)
- Document acceptance and status responses now open a confirmation dialog before submission, clearly warning suppliers that the response will be locked until the customer reopens it.
- PDF and PowerPoint training progress now persists an explicit one-based `highest_page_index` in `supplier_training_progress`. Supplier training lists expose page progress, and reopening the viewer resumes at the highest page or slide reached.
- Documents, Trainings, ESG overview/questionnaire, and Revenue content now use consistent supplier-facing heading scale and section spacing through the shared `SupplierPageHeader` pattern and aligned eight-unit content gaps.
- Supplier ESG overview and questionnaire pages now use the same `max-w-7xl` content width as the Supplier Assessment module page, removing the excessive empty side margins on wide screens.
- Supplier Documents and Trainings pages now show responsive Total, Completed, Draft, Pending, and Overdue status infographics. Counts are mutually exclusive, overdue-aware, and update from the current document response or training progress state.
- Supplier module ledger percentages now use the label `Filled` instead of `Complete` (for example, `100% Filled`) without changing completion calculations or status logic.
- Monthly GHG record ledgers no longer repeat a `Done` label below filled months; the existing green status dot remains the completion indicator, while future months still show `Future`.
- The Add Emission final step no longer displays the redundant `Review Summary`; it now contains only the optional Additional Notes input, with submission behavior unchanged.
- Focused JavaScript lint and an authenticated live rendering check completed before the user's latest `dont test` instruction; no further testing was run.

## Latest Changes — 2026-08-26 (Parent Supplier Analytics and Secure Previews)
- Ranking → Emissions now includes supplier intensity comparison, grouped Scope 1 category comparison, and month-on-month combined attributed-emissions trends for the selected reporting period.
- Fixed the Ranking emissions data-source divergence: every emissions metric card, scope chart, supplier comparison, and summary row now uses the submitted-attributed `/supplier-assessment/emissions/all` pipeline instead of stale `canonical_score_snapshot` emission fields. For FY 2026-27, the verified UI values are 77.46 tCO₂e total, 66.36 Scope 1, and 11.10 Scope 2.
- Ranking → ESG no longer shows Assessment module coverage. It now compares each supplier's Environment, Social, and Governance scores with grouped bars.
- Parent Documents now provide authenticated in-app PDF previews, including server-side DOC/DOCX-to-PDF conversion. Supplier-name badge crowds were replaced by compact assigned counts and a scalable supplier dialog showing each supplier as Pending or Submitted.
- Parent Trainings now provide a secure read-only in-app preview for PDF/PPT pages and audio/video content without updating supplier progress.
- Static checks, authenticated endpoint checks, and focused live smoke checks completed before the user's latest `dont test` instruction; no further testing was run. All preview and emissions APIs are real, not mocked.

## Latest Changes — 2026-08-26 (Supplier Assignment Revocation)
- Document requirements now persist an explicit `assignment_mode`. Selected assignments no longer fall back to program-wide visibility when their supplier list becomes empty, while legacy program-wide assignments continue supporting explicit exclusions.
- Supplier edits now preserve the document assignment mode and always write explicit exclusions when a document is removed from a supplier.
- Training removal now deactivates every matching assignment row, reactivates only one canonical assignment when reassigned, and includes the correct requirement version. Startup cleanup deactivates duplicate active rows and enforces a unique active assignment index per supplier, training, and reporting period.
- Supplier Documents and Trainings pages refresh assignment visibility on focus and every 30 seconds; an open training viewer closes automatically if its assignment is revoked.
- JavaScript and Python static checks passed. Functional flow testing was not run, following the user's `dont test` instruction.

## Latest Changes — 2026-08-26 (Detailed Supplier Rankings Table)
- Detailed rankings now renders exactly one row per supplier with explicit columns for Supplier name, ESG score, Environment score, Social score, Governance score, GHG completion %, Training %, and Documents %.
- Removed the previous multi-line rank/status card ledger from this tab. Unassigned module completion is shown as `—` rather than a misleading zero.
- Added a dedicated Action column with a `View` button on every supplier row; supplier names are now plain row values rather than duplicate actions.
- Functional testing was not run, following the user's `dont test` instruction.
- Supplier intensity units now read `tCO₂e / supplier currency` across the parent GHG ledger and intensity comparison tooltip.
- Detailed ranking ESG, Environment, Social, and Governance headings are sortable in ascending or descending order; rows with missing scores remain at the bottom.
- Removed desktop top padding from the shared content wrapper for every `/supplier-assessment` route, aligning page headings directly with the workspace top edge while retaining mobile clearance for the navigation button.
- Parent Training cards no longer expand every supplier progress row inline. Each card now has a scalable `View suppliers` dialog showing one supplier per row with Progress and Status.
- Supplier emission totals now expose each supplier's stored `revenue_currency`; intensity labels and chart tooltips render the actual currency code (for example, `tCO₂e / INR`) instead of a generic denominator label.

## Latest Changes — 2026-08-27 (Staging Database Catalog Migration)
- Added an environment-driven, credential-free migration runner at `backend/scripts/migrate_local_to_staging.py` with dry-run, conflict blocking, timestamped `mongodump` backup, transactions, idempotent upserts, index recreation, and reference validation.
- Created all 14 previously missing collections in `sustainrepo_staging` and copied only local records whose organization/user/supplier dependencies already existed in staging: 18 assessment program revisions, 5 document versions, 19 document requirements, 3 training contents, 3 training requirements, and 3 training versions.
- Migrated the current calculation catalog without importing conflicting local history UUIDs: 8 new formulas, 5 new versions for changed formulas, 20 new decision-tree versions, 4 supporting catalog inserts, 4 targeted catalog updates, 2 currency inserts, and 1 currency-method update.
- Preserved existing environment-specific UUID references while converting every `exchange_rate` catalog layer to the canonical unitless form: variable `default_unit=""`, property `unit=""`, mapping `unit_source="none"`, and no mapping `default_unit` or `allowed_units`.
- Backup created at `/app/.emergent/backups/staging-migration-20260827T044052Z` before the first staging write.
- Post-migration dry-run is a complete no-op with zero conflicts. Validation confirmed all collections/indexes exist, local and staging current formula definitions and decision trees match, currency identities are complete, formula/version references resolve, exactly one active version exists per formula, and all 8 migrated R2 file objects are accessible.
- As requested, local records with nonmatching staging relationships were skipped: 4 document submissions, 4 revenue submissions, 11 training assignments, 12 training consumption events, and 4 training progress records. Ten local login-attempt telemetry records were intentionally not migrated to avoid carrying lockout state into staging.

## Latest Changes — 2026-08-27 (Exchange Rate Unitless Catalog Completion)
- Extended `backend/scripts/migrate_exchange_rate_unitless.py` to update and validate the Exchange Rate variable, property, and input-field mapping without replacing their UUIDs or breaking references.
- Applied the idempotent migration to both local and `sustainrepo_staging` databases. Verified neither environment retains the legacy unit `1` in any Exchange Rate catalog layer.
- Re-ran the full local-to-staging migration dry run: zero pending inserts, zero catalog actions, and zero conflicts.

## Latest Changes — 2026-08-27 (Staging Ingestion Credential Cleanup)
- Removed the hardcoded staging MongoDB connection URI from `scripts/ingest_amns_to_staging.py`.
- The one-off ingestion script now requires `TARGET_MONGO_URL` and `TARGET_DB_NAME` at runtime and fails clearly when either is absent.
- Verification passed: Python compilation succeeded and a full workspace credential scan found no remaining instance of the removed URI.

## Latest Changes — 2026-08-27 (Parent Supplier Ledger UI Refinement)
- Refined the parent-org Suppliers heading with a restrained forest-green treatment, organization icon, stronger hierarchy, and softer supporting subtitle.
- Consolidated supplier search, Add Supplier, and reporting-period controls into one responsive, lightly elevated control bar while preserving all existing behavior.
- Polished the supplier ledger with a sage-tinted header, increased row spacing, softer separators, stronger company/progress/score hierarchy, modern accepted-status pills, and larger restrained action targets.
- Renamed the reminder action hover label from `Email supplier` to `Send Reminder` without changing its reminder functionality.
- Focused JavaScript lint and an authenticated desktop screenshot passed before the final tooltip-only wording change. Per user instruction, no testing was run after that final change.

## Latest Changes — 2026-08-27 (Add Supplier Form Guidance)
- Removed the bordered container around the Annual Revenue requirement so it follows the same field rhythm as the rest of the supplier form.
- Added accessible information tooltips explaining that annual revenue supports intensity calculations and that supplier assessment access locks after the due date.
- Removed the redundant selected-by-default helper copy from the Documents and Training assignment sections.
- **NOT TESTED** per the user's explicit instruction.

## Latest Changes — 2026-08-27 (Parent Supplier & ESG Questionnaire Hierarchy)
- Increased the Suppliers heading and organization icon, and removed its supporting `Manage your supplier assessments` copy for a cleaner workspace header.
- Redesigned the ESG Questionnaires workspace with the same top-left heading alignment, a purple questionnaire icon, and a single rounded control group containing Reporting period, Review responses, and the green New Questionnaire action.
- Refined the questionnaire navigator, selected questionnaire panel, question hierarchy, row spacing, low-weight separators, neutral supporting metadata, and understated importance badges. Preview remains neutral while Add Questions stays green.
- Corrected the questionnaire header's vertical offset: its larger period control had bottom-aligned the title. The header now top-aligns, and a live authenticated browser check confirmed both the ESG Questionnaire and Suppliers icons render at `y=24`.

## Latest Changes — 2026-08-27 (Supplier GHG Emissions Refinement)
- Removed the explanatory header copy and aligned Supplier GHG Emissions with the Suppliers and ESG Questionnaire headers, using a neutral cloud icon and matching `text-3xl` heading hierarchy.
- Refined Emissions by Supplier/Logs into a restrained segmented navigation. Total and Attributed Emissions table groups now display their shared `tCO₂e` unit in the headers, use darker group labels, muted subheaders, and clear but subtle vertical separation.
- Supplier rows now have light-green hover feedback, refined neutral initials, clearer name/revenue hierarchy, bold totals only, a stronger two-line intensity treatment, and compact neutral Unlock actions.
- Verification passed: JavaScript lint and authenticated browser smoke on the populated Supplier GHG table (3 supplier rows). No APIs were changed or mocked.

## Latest Changes — 2026-08-27 (Supplier GHG Logs Refinement)
- Supplier GHG Logs rows now have the same subtle light-green hover feedback as the summary ledger, with a pale green header row and softly emphasized column labels.
- Search Emissions now matches supplier organization, category, subcategory, and the displayed fuel-type fallback.
- **NOT TESTED** per the user's explicit instruction.

## Latest Changes — 2026-08-27 (Supplier Documents Workspace Refinement)
- Replaced legacy parent-admin `Agreement` terminology with `Document` across the Documents workspace, including title, create/publish actions, empty state, feedback, and deletion confirmation. Existing API contracts and test IDs remain unchanged.
- Aligned Supplier Documents with the Supplier and ESG Questionnaire headers, added a neutral document icon, moved Reporting period and Add document into one rounded header control group, and added the matching heading divider.
- Rebuilt published document cards into compact white `rounded-xl` surfaces with low-contrast borders and soft shadows: clear title, wrapped response metadata, compact supplier count, and a right-aligned neutral Preview/View suppliers/Delete action group.
- **NOT TESTED** per the user's explicit instruction.

## Latest Changes — 2026-08-27 (Documents & Training Summary Refinement)
- Updated the Supplier Documents and Supplier GHG Emissions header icons with teal and sky-blue color treatments while retaining restrained surfaces.
- Added three compact parent Documents summary cards: Documents published, Acceptance required, and Supplier assignments.
- Aligned Supplier Trainings with the same workspace header pattern: an amber training icon, divider, and shared right-side Reporting period/Add Training group. Removed its explanatory header copy and added Published, Supplier assignments, and Completed summary cards.
- **NOT TESTED** per the user's explicit instruction.

## Latest Changes — 2026-08-27 (Supplier Training Card Progress Refinement)
- Rebuilt training cards into a clear three-part layout: title and completion requirement, visible progress and due date, then frequent supplier/preview actions on the right.
- Added per-training completion meters with `completed / assigned` counts and calculated percentages. Due dates are now a readable, neutral content block rather than a persistent edit field.
- Consolidated Save due date, Disable/Enable, and Delete into an accessible overflow menu; View suppliers and Preview remain compact neutral primary actions. Global controls were not duplicated or changed in the page-level card UI.
- **NOT TESTED** per the user's explicit instruction.

## Latest Changes — 2026-08-27 (Supplier Evidence Visibility and ESG Question Evidence)
- Parent Supplier GHG Logs now show an Evidence column with secure View and Download actions for evidence attached to submitted supplier emission records. The parent API exposes file metadata only; it no longer returns raw evidence URLs.
- Added question-level ESG evidence configuration: parent users can set each question to Not required, Optional, or Required for submission in the multi-question ledger and the question editor.
- Suppliers can upload permitted evidence files (up to 5 MB) per question, view/download their attachments, and are blocked from final submission when required evidence is missing. Uploaded evidence is retained in the immutable questionnaire response revision history.
- Parent response review now lists per-question evidence with secure View and Download actions. Dedicated endpoints verify supplier/customer ownership, response visibility, and evidence-to-question linkage before issuing 15-minute storage URLs.
- Verification passed: focused backend evidence regression (**5/5 passed**), Python/JavaScript static checks, and an authenticated browser smoke check showing the Evidence column and working action controls on populated Supplier GHG Logs. No mocked APIs were used.

## Latest Changes — 2026-08-27 (Supplier Workspace Copy and Navigation Refinement)
- Removed the redundant Supplier Rankings subtitle and aligned its heading with the Suppliers and ESG Questionnaire workspaces. Rankings now has a colored amber trophy icon and the same heading hierarchy/alignment.
- Removed the Monitor and Report frequency badges from facility cards; the saved facility-frequency values and related validation remain unchanged.
- Supplier ESG final submission now smoothly scrolls to, focuses, and briefly highlights the first missing required response (or required evidence) instead of merely reporting a remaining-count error.
- Verification passed: JavaScript lint for all changed screens plus authenticated browser checks for the aligned Rankings header and hidden facility frequency badges.
- Current GHG behavior documented: parent users can see submitted raw supplier emissions without revenue data. A saved revenue percentage determines attributed emissions; a revenue amount is used only to calculate intensity. The pipeline currently does not require the revenue record itself to be locked/submitted before using a saved percentage.

## Latest Changes — 2026-08-27 (Revenue Submission Gate for Parent GHG Attribution)
- Parent supplier GHG attribution and intensity now require `revenue_submission_status == "submitted"`. Saved draft revenue values are not used in calculations.
- The parent GHG ledger retains submitted raw emissions, while displaying `Revenue not submitted`, unavailable attributed totals, and unavailable intensity until the supplier locks their Revenue response.
- Verification passed: Python/JavaScript static checks, authenticated parent API check, and authenticated browser check for Supplier5. Its `1.45996 tCO₂e` raw total remains visible while attributed total and intensity are both unavailable.

## Latest Changes — 2026-08-27 (Exact Parent Supplier GHG Read-only Form)
- Replaced the parent supplier-emission summary viewer with the shared GHG edit-form renderer in a dedicated read-only mode. Parent users now see the familiar Scope 1/2 form layout, including saved conditional calculation inputs, output summary, optional details, and reporting assignment.
- The read-only mode disables the complete form fieldset, prevents form submission, and hides submission, recalculation, upload, evidence-removal, and delete controls. Secure evidence View/Download remains outside the locked form.
- The parent-only record-detail API remains limited to submitted, parent-visible supplier records and returns no raw evidence URLs. **NOT TESTED**, per the user's explicit instruction.

## Latest Changes — 2026-08-27 (Supplier Dashboard Submission-aware Progress)
- Removed the redundant Supplier workspace label and customer instruction from the supplier-facing dashboard header. Passed due dates now render as explicit red Overdue warnings with day/month/year formatting.
- Requirement cards distinguish data being filled from formal submission: Revenue, ESG, GHG, and Documents can show `100% Filled` while remaining `In progress` until submitted.
- Overall Progress now counts formal Revenue, ESG, GHG, and Document submissions. GHG is binary in both views: its requirement card is either 0% or 100% filled, while its overall-progress value remains 0% until submission and becomes 100% only after submission.
- **NOT TESTED**, per the user's explicit instruction.

## Latest Changes — 2026-08-27 (Supplier-facing Header Consistency)
- Standardized the live supplier-facing Supplier Assessment pages on the parent workspace heading treatment: bold emerald page titles, a bottom divider, and a 48px bordered icon tile.
- Added page-specific icon colors across the dashboard/onboarding, facility, ESG overview/questionnaire, GHG submission, Documents, and Training pages.
- Removed the `100% Filled` display from the GHG requirement ledger card while preserving its Submitted/In progress/Not started status and its submission-based value in Overall Progress.
- Focused JavaScript lint passed before the user's `dont test` instruction. No browser or functional testing was run.

## Latest Changes — 2026-08-27 (GHG Create Form Layout and Annual Evidence)
- Tightened the monthly data ledger’s Month and input-column spacing and replaced the icon-only final header with the visible `Evidence` column label.
- Reworked yearly data fields into responsive grids and added a labelled annual evidence upload control. Annual evidence is stored on `yearlyData.evidences` and follows the existing create-payload evidence mapping.
- Reorganized process responsibility details so Person Responsible and Designation share one row, while Contact Details and Source of Information share the next row on desktop.
- Focused JavaScript lint passed for the three changed files before the user's `dont test` instruction. No browser or functional testing was run.

## Latest Changes — 2026-08-27 (GHG Annual Three-Field Layout)
- Create Emissions now keeps yearly inputs on a white surface and fits up to three compact fields per desktop row, including yearly custom-fuel factor and density inputs when applicable. Labels are centered above their corresponding field.
- Monthly ledger headings, including Month and Evidence, are centered within their columns.
- Verification passed: JavaScript lint for both updated components and authenticated browser smoke checks for opening Create Emissions and changing it to yearly mode. No data was saved or changed.

## Latest Changes — 2026-08-27 (GHG Annual Field Alignment and Defaults)
- Yearly required, optional, and override fields now share one three-column layout. This keeps inputs such as Quantity Used, Calorific Value, and Density on the same row when configured for the selected fuel.
- All yearly fields now reserve the same label height and label-to-input spacing, preventing Override Default controls from pushing Calorific Value or Density inputs below Quantity Used.
- Yearly default-value and unit rendering now uses the same selected-fuel resolver as monthly data. Unchanged override inputs visibly show their fuel defaults and remain disabled until Override Default is enabled.
- Verification passed: focused JavaScript lint and authenticated browser smoke check of the selected yearly Scope 1 form; no emissions data was saved or changed.

## Latest Changes — 2026-08-27 (GHG Annual Cross-Scope Alignment)
- Carbon Composition fields now flatten into the same annual row as Quantity Used. Carbon Content (%), Oxidation Factor, and conditional Density use identical label height, label-to-input spacing, and control height.
- Annual field grids now use responsive auto-fit columns: two visible inputs fill the row at 50% each, three use equal thirds, and up to four use equal quarters. This applies to the shared Scope 1, Scope 2, and Scope 3 annual renderer, process templates, and custom-fuel methods.
- Verification passed: focused JavaScript lint plus authenticated Scope 1, Scope 2, and Scope 3 Create Emissions yearly-mode smoke checks. No data was saved or changed.

## Prioritized Backlog
- **P0:** Verify the legacy version-history unit `1` cleanup after user authorization; verify soft-deleted suppliers cannot log in or refresh tokens; consolidate assignment deletion behavior and legacy/V2 architecture; unify disconnected target systems.
- **P1:** BRSR Section A year-switch state; document replacement/version publishing; custom dashboard; target settings UI; onboarding wizards; BRSR Word export and previous-year columns; configurable evidence retention/deletion controls.
- **P2/P3:** Bulk Upload database duplicate detection, effective-settings summary, MIS previews/bookmarks, bulk upload progress/history. AI credit enforcement remains deferred per user request.

## Third-Party Integrations
- Cloudflare R2 for private document/training object storage — user credentials required.
- Resend for email — user credentials required.
- LlamaParse/Llama Cloud — user credentials required.
- OpenAI text and embeddings through the configured platform integration.

## Supporting Documents
- `/app/memory/CHANGELOG.md` — implementation history.
- `/app/memory/ROADMAP.md` — prioritized pending work.
- `/app/memory/test_credentials.md` — testing accounts.
- `/app/test_reports/iteration_18.json` — Bulk Upload parity verification.
- `/app/test_reports/iteration_19.json` — GHG period row-limit verification.
- `/app/test_reports/iteration_21.json` — Scope 3 spend-basis currency conversion verification.
