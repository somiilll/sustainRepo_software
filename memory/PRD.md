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

## Prioritized Backlog
- **P0:** Verify the legacy version-history unit `1` cleanup after user authorization; verify soft-deleted suppliers cannot log in or refresh tokens; consolidate assignment deletion behavior and legacy/V2 architecture; unify disconnected target systems.
- **P1:** BRSR Section A year-switch state; document replacement/version publishing; custom dashboard; target settings UI; onboarding wizards; BRSR Word export and previous-year columns.
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
