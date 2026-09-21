# ESG Platform Roadmap

## P0 — Immediate

### Supplier Reporting Policy
- Make supplier facility allowance an intentional configurable policy instead of a fallback.
- Add a deliberate parent-controlled migration/reassignment flow for existing suppliers when a new immutable assessment-program revision changes supplier GHG permissions (Custom Fuels, Process Emissions, or Flaring). Existing and newly added suppliers must be able to be aligned explicitly without silently changing issued assessments.

### User Verification
- Verify GHG period row limits in the live workflow:
  - 10 monthly rows accepted for May and another 10 for June.
  - 11th row for one month rejected.
  - 120 yearly rows accepted for one reporting year when monthly allowance is 10.
  - Bulk Upload preview marks excess rows as errors and saves only valid rows.
- Verify the existing soft-deleted supplier access blocker for login and session refresh.

### Canonical Target-System Consolidation
- Unify Org Config target overrides, Voluntary Targets, and Base Year Target Setting under one target catalog.
- Reconcile `/sustainability-config/target-fields` with `/esg-targets/lookup/categories`.
- Map custom GHG and Energy target fields to canonical `field_code` values without duplicate targets.

## P1 — Upcoming
- Add inline Save validation errors to the monthly ledger so every affected field is shown at once rather than returning one toast at a time.
- Extend Formula Groups with controlled decision-tree rebind and mapping-clone workflows, including a mandatory preview of affected category branches before applying either action.
- Fix Scope 3 Category 3 Activity Based Add-form unit defaults: keep the selected `scope3_ef.allowed_units` as valid choices, but initialize new monthly/yearly quantity rows from that activity's `default_unit` (for example, Diesel (average biofuel blend) defaults to `L`, not the first allowed unit `m3`). Preserve valid explicit OCR/spreadsheet units, manual user selections, saved Edit units, and historical records; do not broaden the change to other Scope 3 categories or methods.
- Configure the C8 `floor_area_share` input-field mapping (Decision Tree version 11 and Activity Based/Supplier Method formulas are published). Bulk Upload is deferred.
- Persist Repo Pilot Data Retrieval and Internal Data AI chats with unified conversation sessions, then expose retrievable history in Repo Pilot.
- Add multi-organization membership/context for suppliers that are also standalone customer organizations.
- Add parent-configurable Supplier GHG dashboard widgets, KPIs, and visibility.
- Implement a cleaner Supplier-to-Customer conversion architecture.
- Fix the Supplier Documents `Submit and lock` confirmation dialog trigger.
- Enable the ORG1 Training module in staging after explicit user confirmation.
- Restart the staging backend/pod so the R2 singleton re-reads `R2_BUCKET_SUPPLIER_ASSESSMENT`.
- Fix BRSR Section A stale form data when switching reporting years.
- Document replacement and version-publishing UI.
- Advanced Document response types, including upload-required workflows.
- Custom Dashboard consuming configured KPI cards.
- Target Settings UI for explicit `target_direction` configuration.
- SHA-256 evidence integrity verification.
- Customer organization onboarding wizard.
- Supplier organization onboarding wizard.
- BRSR Word export and previous-year columns.
- Map ESG metrics and GHG results to BRSR/GRI questions as reviewable suggested responses. Users must be able to accept an imported response, reject it and answer manually, or reverse either decision later while preserving immutable response history, source provenance, and stale-source detection.
- MIS schedule preview and report bookmarks.
- Canonical RBAC overhaul phases 1–5 — paused until explicit user instruction.

## P2 — Later
- Design and execute the production legacy-emission migration for records created before calculation versioning:
  - Preserve stored inputs, outputs, totals, reporting periods, and timestamps without recalculation.
  - Infer missing Scope 1 methodologies from saved field signatures; send ambiguous records to manual review.
  - Treat old Scope 3 Spend Basis records without a currency-method choice as legacy PPP/Inflation where supported by their saved fields/formula lineage.
  - Create immutable legacy formula and decision-tree snapshots, then backfill only calculation metadata and migration provenance.
  - Keep unresolved records calculation-locked and never fabricate historical calculation audit details.
  - Use an idempotent dry-run report, pre-migration backup, aggregate/hash comparisons, and rollback support.
- Database-level Bulk Upload duplicate detection across separate uploads.
- Effective Settings read-only summary for Super Admins.
- Repair pre-existing non-golden backend suite failures, including `test_supplier_training_focused.py`, when testing is unblocked.
- Custom Fuel month-value copy.

## P3 — Future
- Bulk Upload progress indicator for large workbooks.
- Bulk Upload history dashboard with status, row counts, and error-report downloads.
- Dashboard Scope 1 and Scope 3 emissions deduplication.

## Explicitly Deferred
- AI-credit consumption/deduction enforcement.
- Bulk Upload biogenic scope selection.
- Extended Scope 2 custom-fuel parity.
- Broader RBAC changes until the user resumes that program.

## Completed Recently
- Formula Groups editor, formula-impact preview, and independent clone action are now available to Super Admins. Formula Builder warns about active branch impact before publishing; Input Field Mapping identifies group-owned/inactive-history records. **SOURCE-REVIEWED ONLY; NO FUNCTIONAL TESTING** per the user’s instruction.
- Scope 3 activity-basis formula/configuration isolation: local `test_database` now has the approved ten group-owned formula families and 31 group-owned field mappings. C10/C13/C14 share C10’s canonical activity branch; C6/C8/C11 retain isolated branch families. A non-destructive repair deactivated only duplicate nested migration clones, with all source/current records retained. **STRUCTURAL VALIDATION ONLY; NO FUNCTIONAL TESTING** per the user’s instruction.
- C4/C9 now honor the configured calculation-field label for `km_travelled`; the category-specific **Distance Travelled** override was removed. **SOURCE-REVIEWED ONLY; NO FUNCTIONAL TESTING** per the user’s instruction.
- Approved staging GHG reset: emissions, GHG histories, pending GHG approvals, calculation audits, Scope 3 upload traces, Base Year data/history, and GHG supplier submissions are cleared from staging under a restorable backup manifest. R2 objects and `uploaded_files` metadata intentionally remain untouched; organization, facility, supplier, benchmarking, target, sink, and ESG records are preserved. **MIGRATION PREFLIGHT AND STRUCTURAL VALIDATION ONLY; NO FUNCTIONAL TESTING** per the user’s instruction.
- Staging calculation catalog baseline: current formulas were already version-linked; the missing decision-tree version snapshots and formula-version maps are now present. The 32-factor C3 Activity Type classification was also applied to staging. Existing GHG records and their histories were left untouched. **MIGRATION PREFLIGHT AND STRUCTURAL VALIDATION ONLY; NO FUNCTIONAL TESTING** per the user’s instruction.
- C3 Add/Edit now uses canonical **Fuel**, **Electricity**, and **Steam** Activity Type filtering. A backed-up data migration classified 32 non-biogenic C3 factors in `scope3_ef`; legacy emission records and calculation history remain unchanged. **SOURCE-REVIEWED ONLY; NO FUNCTIONAL TESTING** per the user’s explicit instruction.
- Supplier Assessment correlated logging: Documents, Training, multipart uploads, assignments, Questionnaire changes/submissions, revenue, evidence, manual review, reopen flows, and background media preparation now emit request-correlated structured events with safe entity IDs, counts, and stable failure codes. **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.
- Safe native OCR diagnostics: failed advanced Fast/Think OCR files now retain and log only provider, validated provider request ID, decoded category, status code, and timestamp. Quota/credit exhaustion is separated from rate limits and other provider failures without persisting secrets or raw provider data; customer responses remain generic. **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.
- Think OCR now uses native `AsyncOpenAI` Chat Completions with the existing models/key and uploaded request semantics. `emergentintegrations` and LiteLLM were removed after confirming they had no other code consumers; no `sk-emergent-` value or literal exists in current source/configuration. **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.
- Advanced Fast OCR now calls Anthropic through the native asynchronous SDK, matching the uploaded working processor's provider request format while leaving model IDs, prompts, queue behavior, and Think mode unchanged. **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.
- OCR failure banners are now session-scoped: stale failed-batch storage is cleaned when the workspace opens or a new upload starts, while a current-session upload failure still shows a retry action. This prevents generic OCR errors in an otherwise empty workspace. **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.
- OCR uploads now clear stale browser-stored failed-batch IDs when a replacement batch queues successfully, preventing an earlier provider/configuration failure from incorrectly persisting as the generic OCR error after recovery. **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.
- C6 Business Travel Bulk Upload no longer exposes **No. of Days Travelled**. Any modern or legacy C6 travel-day value is discarded before validation, calculation, and record persistence, while C7 retains the field. **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.
- Scope 3 Activity menus now use measured, adaptive dropdown widths in both Add and Edit: short activity lists retain the control width, while long labels expand the right-aligned menu only as far as required (up to the viewport-safe 34rem cap). **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.
- C6 Business Travel multi-trip entry: the Create form now supports multiple independently detailed trips for each monthly or yearly period. Every trip owns its dynamic inputs, route, air-travel airport details, and evidence attachments; completed trips are calculated and saved as individual emission records in one rollback-protected submission batch. Existing C6 Edit remains one record/trip at a time. **NOT TESTED** per the user’s explicit instruction; implementation was source-reviewed only.
- Added Scope 3 Bulk Upload currency-method inference: spend-only rows use Standard Currency Conversion, while supplied PPP/Inflation values select PPP and Inflation Rate and remain overrides.
- Aligned Scope 1 Bulk Upload Carbon Content, Oxidation Factor, and Quantity Basis EF persistence with manual entry by removing incorrect `is_override` metadata while preserving genuine override fields.
- Added immutable formula and decision-tree version pinning for all new manual/C7/Bulk Upload emissions, historical edit calculation, canonical formula snapshots, and server-side guards against silent upgrades. Older unversioned records remain untouched pending the approved migration design.
- Added configurable monthly, quarterly, and yearly supplier GHG submission cadence. Period submissions lock independently, parent unlock requires a reason with optional instructions and no secondary confirmation, and the shared backend guard blocks supplier writes to locked periods.
- Completed the canonical ESG response migration: all runtime reads/writes now use `organization_esg_responses`, immutable history remains in `esg_responses_versions`, the questionnaire queue is source-isolated, and the empty `esg_responses` collection was dropped after 37/37 migration regressions passed.
- Fixed supplier reminder filtering, completed-item due-date visibility, Annual Revenue required-state retention, and server-side supplier GHG restrictions. Custom fuels, Process Emissions, and Flaring are denied unless the parent program explicitly enables each policy.
- Connected supplier GHG program settings to the shared GHG form so disallowed Flaring, Process Emissions, and Custom Fuel controls are hidden as well as API-blocked; corrected generic supplier POST rejection behavior.
- Unit-driven monthly/yearly Density visibility, requiredness, reverse EF normalization, API guards, and stable Add Emission modal opening.
- Exact parent-program Scope 1/2 enforcement for supplier GHG; Scope 3 and Biogenic are excluded end-to-end.
- Muted, clickable supplier navigation for Dashboard, Sinks, Base Year, and Analysis with full-page premium overlays.
- Hidden supplier-facing GHG history controls while preserving canonical internal history and submission revision lineage.
- Supplier GHG reporting-period lock across Add, Edit, list, and backend create/update paths.
- Required, auditable supplier data-verification acknowledgement for final ESG and GHG submissions.
- Organization-aware Bulk Upload templates and validation.
- Scope 1/2/3 capability parity, Flaring, Process Emissions, and custom-fuel auto-detection.
- Upload preview summary, 24-hour pending-record TTL, save rollback, and file/row stability limits.
- Per-month and per-year GHG row allowance enforcement across manual and Bulk Upload paths.