# ESG Platform — Product Requirements Document

## Original Problem Statement
Maintain the product roadmap and repository health while improving the Supplier Portal, ESG modules, Organization settings, and GHG workflows. Keep manual entry, Bulk Upload, reporting, supplier assessment, and administrative workflows aligned with canonical configuration.

## Product Goal
Provide dependable, organization-aware ESG and GHG management for customer organizations and their suppliers, with secure records, immutable calculation history, and consistent module access.

## User Personas
- **Super Admin:** Configures organizations, plan limits, module access, workflows, and organization-scoped accounts.
- **Organization Admin:** Manages organization details, facilities, emissions, ESG records, suppliers, documents, training, targets, and reports.
- **Assigned User:** Manages records permitted by organization, facility, KPI, and workflow assignment.
- **Supplier User:** Completes assigned ESG, GHG, document, training, and revenue requirements through immutable submissions.

## Core Requirements

### Canonical Configuration
- `organization_config` is the single source of truth for module entitlements and GHG capability overrides.
- All manual, bulk, supplier, report, and target routes use canonical configuration resolvers.
- Do not introduce route-local authorization or shadow configuration.
- `/app/backend/calc_engine/` is frozen unless separately approved.

### Organization Module
- Organization Details uses responsive **Basic Details**, **GHG Details**, **Production Data**, and **Revenue Data** tabs.
- GHG Details requires the canonical `environment.ghg` entitlement; Production and Revenue require an enabled Environment, Social, or Governance entitlement.
- Production Data contains Production Quantity only; Revenue Data contains Turnover / Revenue only, for the active year and four preceding years.
- Organization and Facility details remain responsive, concise, and use neutral supporting copy for equity-share guidance.

### GHG Data Entry
- Support monthly and yearly Scope 1, Scope 2, Scope 3, and approved biogenic entries.
- Preserve common Create/Edit contracts, calculation audit linkage, approval behavior, and atomic monthly multi-row submissions through `submission_batch_id` rollback.
- Enforce organization capability overrides server-side.
- Resolve density visibility and requiredness from actual quantity/reference-unit dimensions.
- Preserve source values while normalizing valid reverse unit conversions before calculations reach the frozen engine.
- Scope 3 Activity menus retain a viewport-safe adaptive width for readable selection.
- Scope 3 Category 3 requires a canonical Activity Type of **Fuel**, **Electricity**, or **Steam** before Activity selection; the type limits visible C3 factors without changing calculations or historical emission records.
- Scope 3 Category 5 uses a durable disposal taxonomy: users select a base Activity first, then only the disposal Activity Types valid for that material. If an Activity has no disposal variant, such as Waste Water Treatment, no Activity Type field is shown. Factor IDs and original combined activity strings remain immutable for calculation and audit continuity.
- C4 and C9 calculation-field labels are configuration-driven; the UI must not override a mapped variable label based on category.
- Scope 3 `activity_basis` formulas and input-field configurations are isolated by these ten formula groups: **C1/C2**, **C3**, **C4/C9**, **C5/C12**, **C6**, **C7**, **C8**, **C10/C13/C14**, **C11**, and **C15**. A group owns its activity-branch formula family and mutable field mappings; no active formula or mapping is shared across groups. Spend-basis, supplier-basis, and factor records remain unchanged.
- Super Admins can inspect activity formula groups, category ownership, active mappings, formula counts, and decision-tree impact. Before publishing a formula change, Formula Builder shows every active category/branch affected; group-owned formulas direct admins to clone rather than reuse across groups.
- Formula Builder cloning supports two destination types: approved Scope 3 activity formula groups, and direct Scope 1 or Scope 2 categories/subcategories. Direct clones are independent records and never rebind a decision tree automatically.
- Scope 3 Bulk Upload and OCR GHG-save preserve the resolved activity formula’s group ID into Calc Engine execution. OCR activity-input hydration now prefers the matching group-owned mapping before legacy fallback; Bulk Upload receives matching group-owned default-unit and allowed-unit validation without changing workbook column names or unrelated method logic.
- C3/C5 Bulk Upload, OCR, and Manual Add/Edit persist the resolved factor’s canonical `scope3_activity_type`. Bulk preserves explicit C6/C7 spreadsheet values first, then falls back to the matched factor type for C3/C5; no new spreadsheet columns are required.

### GHG Period Row Allowance
- `entitlements.environment.ghg.monthly_rows_allowed` is an organization-wide allowance per distinct monthly period.
- Yearly allowance is `monthly_rows_allowed × 12` per distinct yearly period; blank means unlimited.
- Monthly and yearly quotas are independent; legacy monthly records count as monthly.
- Superseded supplier revisions do not consume the current-row allowance.
- Manual entry, C7, Bulk Upload preview/save, and bulk confirmation share the same enforcement rule.

### Supplier Assessment
- Preserve the module registry and immutable program-revision model.
- Supplier ESG and GHG submissions are immutable, with parent-controlled reopen/resubmission.
- Supplier GHG reporting derives from the active relationship and immutable program revision.
- Suppliers receive only assigned Scope 1 and/or Scope 2; Scope 3 and Biogenic are excluded end-to-end.
- Supplier final submissions require auditable verification acknowledgement.
- Soft-deleted or deactivated suppliers cannot retain application access.

### Security and Data Integrity
- Password-reset tokens must be hashed before persistence.
- Approved PII and financial fields require application-level AES-GCM encryption, with blind indexes where equality lookup is needed.
- Preserve plaintext operational GHG metrics required for aggregation/reporting.
- Evidence files require hash-based integrity verification.
- New emission records pin immutable formula and decision-tree versions; historical calculations use their stored version references.

### Bulk Upload
- Generate organization-aware Scope 1, Scope 2, and Scope 3 templates.
- C6 Business Travel bulk uploads do not request, validate, calculate with, or persist `No. of Days Travelled`; C7 retains its own travel-day field.
- Enforce scopes, categories, Process Emissions, Flaring, custom fuels, and plan limits through canonical resolvers.
- Provide dry-run totals, row-level errors/warnings, valid-row partial success, and rollback on persistence failure.
- Limit files to 10 MB, sheets to 5,000 rows, workbooks to 25,000 rows, and pending validated records to 24 hours.

## Architecture
- `/app/backend/modules/sustainability_config/` — canonical organization settings and GHG overrides.
- `/app/backend/modules/entitlements/` — module access and numeric plan-limit enforcement.
- `/app/backend/modules/emissions/` — manual GHG create/edit/history, C7, rollback, and contracts.
- `/app/backend/bulk_upload_scope3/` — Excel generation, parsing, validation, preview, and persistence.
- `/app/backend/modules/supplier_assessment/` — supplier programs, submissions, Documents, Training, and completion.
- `/app/backend/modules/ocr_invoice/` — native OCR extraction, classification, provider diagnostics, and OCR-to-GHG save flow.
- `/app/backend/calc_engine/` — frozen calculation decision engine.
- `/app/frontend/src/modules/ghg/` — shared GHG capabilities, form orchestration, adapters, and categories.
- `/app/frontend/src/pages/Emissions.js` — emission ledger and Edit orchestration.
- `/app/frontend/src/components/EmissionEntryForm.js` — Add Emission form orchestration.

## Primary Data Collections
- `organization_config` — entitlements, GHG overrides, organization settings, and aliases.
- `emission_records` — current GHG records and immutable supplier revisions.
- `emission_history` — emission version history.
- `ce_decision_trees` and `ce_decision_tree_versions` — immutable calculation logic versions.
- `ce_input_field_mappings` — configuration-driven field display, defaults, units, and ordering.
- `scope3_ef` — Scope 3 emission factors, including canonical C3 `activity_type` classification.
- `bulk_upload_jobs`, `bulk_upload_pending_records`, `bulk_upload_errors` — Bulk Upload workflow records.
- `supplier_relationships`, `supplier_assessment_programs`, `supplier_ghg_submissions` — supplier assignment/submission lifecycle.

## Key API Endpoints
- `POST /api/emissions`
- `POST /api/emissions/c7/month`
- `POST /api/emissions/c7/yearly`
- `POST /api/emissions/batch-rollback`
- `GET /api/scope3-ef`
- `POST /api/bulk-upload/scope3/upload`
- `POST /api/bulk-upload/scope3/jobs/{job_id}/save`
- `GET /api/organizations/my`, `PUT /api/organizations/my`

## Current Status — September 21, 2026
- **P1 planned:** retire the overlapping broad Scope 3 `subcategory_selection` mapping for C8/C10/C11/C13/C14 after group-owned resolver precedence and legacy-formula verification are in place.
- C3 Activity Type filtering and 32-factor canonical classification are complete. A rollback backup is stored at `/app/.emergent/backups/c3-activity-types-20260921T060449Z.json`.
- Staging catalog baseline migration is complete: all 31 staging formulas were already version-linked; 3 missing decision-tree snapshots and formula-version maps for all 23 current trees were written without modifying historical emissions. Staging C3 classification was also applied to 32 factors. Backups are stored at `/app/.emergent/backups/staging-version-baseline-20260921T063336Z` and `/app/.emergent/backups/c3-activity-types-20260921T063346Z.json`.
- The approved staging MongoDB-only GHG reset removed 7,070 emissions, history, pending approval, calculation audit, Scope 3 bulk-upload, supplier-GHG, and Base Year records/traces. The backup is `/app/.emergent/backups/staging-ghg-reset-20260921T065543Z`. Organizations, facilities, users, supplier accounts/relationships/programs, peer benchmarking, targets, sinks, ESG records, `uploaded_files`, and all R2 objects were preserved.
- `CORS_ORIGINS` explicitly includes the approved staging frontend origin and the hosted release origin. No wildcard origin is enabled.
- The temporary staging MongoDB URI, database-name configuration, and target-specific reset/bootstrap utilities were removed after the completed staging work. The retained generic catalog migration accepts target connection values only from runtime environment variables and contains no staging URI or database name.
- Removed the C4/C9 `km_travelled` frontend label override. Add and Edit now use `ce_input_field_mappings.field_label` directly, including a configured **Distance Travelled per day** label.
- Applied the local `test_database` Scope 3 activity-group migration: 20 new versioned group-owned activity formulas, 31 group-owned input-field mappings, and 15 decision-tree rebinds were added without deleting any legacy formula or mapping. C10 became the canonical activity branch for the required C10/C13/C14 group. A non-destructive repair then re-bound first-generation clones and deactivated 20 nested duplicate formulas plus 30 nested duplicate mappings created by a repeated migration invocation; all records are retained in backups.
- Added a Formula Builder impact panel and an in-place safe clone action that creates an independent formula without changing any decision tree. Formula Builder and Input Field Mapping both support category filtering; Input Field Mapping visibly identifies group-owned and inactive-history rows.
- Aligned OCR GHG-save and Scope 3 Bulk Upload calculation execution with activity formula groups. Both retain group identity while resolving the selected formula; OCR now selects the group-owned mapping for activity input defaults, while Bulk Upload uses that same group-specific mapping during Calc Engine unit validation.
- Expanded Formula Builder cloning so a source formula can be copied to any Scope 1 or Scope 2 category/subcategory, in addition to the approved Scope 3 group destinations.
- Added non-destructive C5 factor taxonomy fields to all 184 C5 records in `test_database`: `activity_name`, normalized `activity_type`, and `activity_type_label`. The shared Add/Edit selector now exposes a disposal type before the base Activity. Original C5 activity strings, factor IDs, units, calculations, and existing emission records were not changed. Backup: `/app/.emergent/backups/c5-activity-taxonomy-20260921T090000Z`.
- Revised the C5 Add/Edit interaction to show the deduplicated base Activity selector before Activity Type; other Scope 3 categories retain their existing Type-before-Activity behavior.
- Refined C5 further: Activity Type options now filter to the selected base Activity, and the field is omitted for `other` taxonomy records such as Waste Water Treatment.
- Corrected C5 type-option derivation to use the complete matching C5 catalog rather than the already type-filtered Activity list. Users can now switch among all valid disposal types for the selected material.
- Corrected the C5 selector state model: the visible base Activity is now independent from the saved exact `scope3_ef_id`. Choosing a disposal type resolves the factor ID without clearing the selected material, while choosing a material does not retain an incompatible factor ID.
- C5 Edit places base Activity and Activity Type in one responsive row. The payload persists the exact `scope3_ef_id` and `scope3_activity_type`; base `activity_name` remains presentation taxonomy resolved from the referenced factor, not a separate emission-record payload field.
- C5 Edit recognizes the canonical `waste_generated_in_operations` category code in addition to display labels. Waste Water Treatment is classified as `other`, so its Activity Type control is suppressed.
- C5 Version History suppresses Activity Type change rows as display-only noise; audit values remain stored and other categories retain their Activity Type history.
- The Emissions **Reset widths** action sits at the right edge of the Scope 1 / Scope 2 / Scope 3 / Biogenic tab row and resets the same resizable ledger columns without affecting filters or records.
- For Scope 3 C8, C10, C11, C13, and C14, the Subcategory value remains `energy` for decision trees and factor filtering while its user-facing label is **Grid Power**.
- The Super Admin Scope 3 EF table, factor detail view, and edit selector use the same **Grid Power** display label for stored `energy` subcategories.
- Restored native Think OCR configuration parity with the uploaded standalone processor: the OpenAI Think provider now reads `OPENAI_API_KEY`, matching the native `OpenAI` SDK contract. The prior `OPEN_API_KEY_OCR` variable prevented Think mode from initializing after the wrapper removal. Source reviewed only; no functional testing was run by user instruction.
- OCR Extraction’s empty upload state is now a borderless, page-centered workspace. The existing source-document text, Upload Files action, and Download template action remain unchanged, while selected-file controls continue to use their compact workflow layout.
- Once source files are selected in OCR Extraction, the empty-state upload copy is replaced by a single-column file list. Each row shows filename, size, selected/uploaded timestamp, and remove action; the footer provides Process *n* files and Upload More Files actions.
- The OCR Fast/Think selector is now a compact rounded dark-teal toggle, with a distinct active mode while retaining its existing mode values and behavior.
- OCR selected-file staging now uses a capped, scrollable file box. Filename, size, and any validation/provider error share one responsive row; invalid files cannot be processed until removed, and queued failure rows also retain their file-specific error.
- OCR upload guidance now lists invoices, utility bills, receipts, CSV ledgers, and Excel workbooks, with an enforced 20-file batch limit, 20MB per-file limit, and first-15-PDF-pages processing behavior. Think is now the non-persistent default mode in both UI and API; Fast/Think uses a white shell with dark-teal selection.
- The scrollable OCR selected-files container uses rounded-2xl corners for a softer visual boundary.
- OCR now canonicalizes common Calc Engine mass and volume aliases before persistence and calculation: tonne variants become `t`, and litre variants become `L`. This normalization covers extracted values, factor selection, edit auto-save, direct GHG save payloads, and dynamic calculation inputs so the ledger retains canonical units.
- Added British-spelling unit coverage: `kilolitres` now normalizes to `kL`, while `millilitre` and `millilitres` convert their quantity to litres (`L`) before OCR calculation persistence.
- OCR workspace cleanup now clears Batch Queue state when Clear Workspace succeeds. When the final source file’s rows are all saved to GHG or rejected—individually or in bulk—the workspace automatically returns to the empty upload state.
- The Emissions ledger now hides Reset widths until a column has an actual manual width override. Resetting removes the override and hides the control again.
- Scope 1, Scope 2, Scope 3, and Biogenic navigation now uses compact, rounded responsive pills. The selected scope uses dark emerald green aligned with Add Emission, while controls wrap safely on small screens.
- Completed a database-only Calc Engine input cleanup: removed 30 inactive duplicate field-mapping configurations after confirming each had an active same-category replacement and no references in formulas, decision trees, emission records, or history. No active field or stored emission value was removed.
- Removed the two unreferenced, completed one-off staging utilities (`backend/scripts/migrate_local_to_staging.py` and `scripts/ingest_amns_to_staging.py`). No executable code now contains staging Mongo target variables or the staging database name; runtime database access remains environment-driven.
- Expanded developer-facing Supplier Assessment runtime logging. Invitation, reminder, assignment, and unlock email paths now emit structured sent/failed/skipped/deduplicated events; GHG, questionnaire, document, revenue, and supplier-access lifecycle transitions emit explicit locked/unlocked events with safe IDs and no recipient-email PII.
- Completed remaining Supplier Assessment debug-log coverage: document publication, due-date changes, assignment synchronization, and archival; program-revision creation; scoring-engine start/completion/fallback plus canonical-score refresh; and training creation, assignment synchronization, update, and archival now emit structured runtime events. Existing route-level rejection/failure events complement these service-level traces.
- Supplier creation now collects and persists an optional Vendor Code before Company Name. The supplier portal’s Revenue Information module is now Org Information without the prior parent-name description; it adds Parts/Components Manufactured and Location of the plant fields with parent-company contextual tooltips, persisted in both relationship drafts and submitted snapshots.
- Completed the parent-facing Supplier Assessment unlock flow: supplier eye detail no longer shows the generic locked ESG submission panel, displays Parts/Components Manufactured and Plant Location, and provides a submitted Org Information unlock action. Questionnaire and Document Manage Suppliers dialogs now expose targeted unlock controls for submitted responses. Org Information reopen creates an editable revision while retaining the submitted audit record, resets completion state, and sends the existing supplier-unlock notification. **SOURCE-REVIEWED ONLY; NO FUNCTIONAL TESTING** per the user’s instruction.
- Reordered existing liquid-volume allowed units for 20 C3 Fuel `scope3_ef` factors to `L`, `kl`, `ml`, `m3`, `cm3`, without adding/removing allowed units or changing `default_unit`. Eight mass-only C3 Fuel factors remain unchanged. Pre-update backup: `/app/.emergent/backups/c3-fuel-allowed-units-order-20260921T121758Z.json`.
- Reordered allowed units for 25 C8 `scope3_ef` factors that already include `L` to `L`, `kl`, `ml`, `m3`, `cm3`. No factor received a new `L` unit, 16 C8 factors without `L` remained untouched, and `default_unit` values were preserved. Pre-update backup: `/app/.emergent/backups/c8-existing-l-allowed-units-order-20260921T122837Z.json`.
- Reordered allowed units for 100 C10/C11/C13/C14 `scope3_ef` factors that already include `L` to `L`, `kl`, `ml`, `m3`, `cm3`. No factor received a new `L` unit, 64 factors without `L` remained untouched, and `default_unit` values were preserved. Pre-update backup: `/app/.emergent/backups/c10-c11-c13-c14-existing-l-allowed-units-order-20260921T123020Z.json`.
- Extended liquid-volume unit availability for 48 Scope 1 `fuel_database` records: any existing `L`/`kl`/`ml`/`m3`/`cm3` fuel now allows all five in the ordered volume segment `L`, `kl`, `ml`, `m3`, `cm3`, while preserving mass-unit order and every `default_unit`. The 406 Scope 1 fuels without a liquid-volume unit remain unchanged. Pre-update backup: `/app/.emergent/backups/scope1-fuel-liquid-volume-units-20260921T123302Z.json`.
- OCR Extraction now includes a header-level History dialog with one row per uploaded source file, showing filename, uploader name, upload timestamp, and safe processing/resolution status. Clearing a workspace removes its source files and review rows but retains this audit metadata; History does not reopen source documents.
- OCR History now stores `full_name` (email fallback) for new uploads and resolves legacy `Unknown` entries through the stored uploader ID. File outcomes are labeled Saved, Partially Saved, Rejected All, Event Cancelled, or Error; active/unresolved entries retain truthful Processing or Pending Review states.
- OCR History is now widened and shows a row-level audit table under each extracted, non-cancelled source file: item extracted, scope, category, subcategory, reporting period, and row outcome. Newly resolved rows are retained as safe audit snapshots, allowing Partially Saved files to show which rows were saved or rejected.
- OCR History now presents both Rejected and Rejected All outcomes with an orange audit-status treatment for immediate visual distinction.
- Detailed implementation history is in `/app/memory/CHANGELOG.md`.
- Prioritized remaining work is in `/app/memory/ROADMAP.md`.
- **Testing constraint:** The user requires source review only; do not run functional, screenshot, curl, or testing-agent checks unless that instruction changes.