# ESG Platform Changelog

## September 17, 2026 — C6 Compact Trip-Row Layout
- Moved every C6 trip’s dynamic inputs, Departure, Arrival, and evidence control into one horizontally scrollable in-card row so values remain aligned and scannable.
- Replaced the text upload control with the same compact upload icon, evidence count badge, hover file list, view links, and removal action used by the standard monthly ledger.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — C6 Add-Trip ReferenceError Fix
- Declared the missing `testIdSuffix` default parameter in `DynamicFieldRenderer`, resolving the confirmed first-trip render error: `ReferenceError: testIdSuffix is not defined`.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — C6 Multi-Trip Render Guard
- Removed the browser-dependent trip-ID call that ran only when **Add trip** was clicked, replacing it with a safe local ID generator.
- Made the shared dynamic field renderer tolerate temporarily unavailable units/activity reference lists while a new C6 trip mounts.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — C6 Business Travel Multi-Trip Entry
- C6 Create now supports multiple independently detailed trips within every monthly or yearly reporting period; each trip has its own dynamic calculation inputs, route, applicable airport lookup, and evidence attachments.
- Every completed trip is calculated and saved as its own emission record in one rollback-protected submission batch. Existing C6 Edit deliberately remains one record/trip at a time.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — Scope 3 Activity Search Precision
- Replaced cmdk’s default scattered-character fuzzy search only for Scope 3 Activity selection with case-insensitive, normalized word-prefix matching.
- Every query term must match the start of a genuine activity-name word. Exact phrases/words rank first; valid prefixes follow; no fuzzy fallback remains.
- Search inputs such as `co`, `comp`, `copp`, `copper`, and multi-term queries now follow the intended semantic behavior without UI, API, data, or selection changes. **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per user instruction.

## September 17, 2026 — Scope 3 Long Activity Names
- Scope 3 Activity menus now grow leftward from their original right edge to a responsive 34rem maximum when opened.
- Activity names wrap in the expanded menu rather than truncating. Added in both Add and Edit without changing values or backend behavior. **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per user instruction.

## September 17, 2026 — Biogenic Emission-Type Form Alignment
- Presented the Biogenic emission type label and both radio options in one neutral standard form row, removing the green container/background treatment.
- Renamed the visible choices to **Direct Emissions** and **Indirect Emissions** while retaining their existing values and all backend behavior.
- Applied the same visual/label treatment to Edit for consistency. **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per user instruction.

## September 8, 2026 — Scope 3 Bulk Spend Currency Inference
- Spent Amount without PPP/Inflation values now defaults Bulk Upload to Standard Currency Conversion.
- Providing Purchase Power Value or Inflation Rate selects PPP and Inflation Rate; when both are present, both are retained as overrides.
- Updated the Excel column guidance for **Currency Conversion Method** and **Exchange Rate (Override)**. **NOT TESTED** per user instruction.

## September 8, 2026 — Scope 1 Bulk Carbon Input Alignment
- Removed incorrect override classification from bulk-uploaded Carbon Content, Oxidation Factor, and Quantity Basis EF fields.
- Bulk Upload now persists these required formula inputs using the same `value` and `unit` shape as manual entry, while genuine Calorific Value and Density overrides remain unchanged.
- Carbon Content/Oxidation Factor tests passed 2/2 before the user requested no further testing; EF Quantity was not tested per that instruction.

## September 7, 2026 — Facility Form Spacing Consistency
- Standardized the Facility edit form to one vertical spacing scale across sections, field rows, Address, and Attachments.
- Made each field grid responsive so rows retain even spacing when the dialog narrows.
- **NOT TESTED** per the user’s explicit instruction.

## September 7, 2026 — Facility Form Layout Polish
- Replaced the Facility Equity Share Percentage warning panel and saved Equity badge with neutral styling.
- Aligned Facility Person Responsible, Designation, and Contact Details in a responsive three-column row.
- **NOT TESTED** per the user’s explicit instruction.

## September 7, 2026 — Organization Historical Operational Data Access
- Removed the empty Organization form card that appeared while editing Production or Revenue data.
- Restored all five available reporting years (current plus four prior), allowing administrators to add missing historical data directly.
- **NOT TESTED** per the user’s explicit instruction.

## September 7, 2026 — Organization Operational Data Editing
- Production and Revenue now list only reporting years containing data, with explicit **Add current** and **Add previous** reporting-year actions in edit mode.
- Moved the operational Cancel and Save Changes actions below the reporting-year editors.
- A period now accepts exactly one data mode: choosing Monthly clears the annual value, choosing Yearly clears monthly values, and the API ignores any inactive legacy payload values.
- **NOT TESTED** per the user’s explicit instruction.

## September 7, 2026 — Organization Facility Count Restored
- Restored the live **No. of Facilities** count in the saved Organization summary using the existing scoped Facilities API.
- **NOT TESTED** per the user’s explicit instruction.

## September 7, 2026 — Organization GHG Details Layout Polish
- Aligned Person Responsible, Designation, and Contact Details in one responsive edit row.
- Moved Reporting Frequency from Basic Details to GHG Details while retaining Reporting Year Type under Basic Details.
- Replaced the equity-share disclaimer’s yellow warning treatment with neutral supporting text.
- On saved GHG Details, placed Organizational Boundaries and Uncertainty Assessment in a responsive shared row and removed tinted boundary-approach panels.
- **NOT TESTED** per the user’s explicit instruction.

## September 7, 2026 — Organization Summary and All-Years Data View
- Removed country, timezone, reporting-year type, facility count, target count, and reporting cadence from the Organization summary.
- Joined the corporate address into one line and removed timezone from the address card.
- Replaced the Production/Revenue year selector with five simultaneous reporting-year editors supporting monthly and yearly entry with per-year saving.
- Extracted the reporting-year editor into focused reusable components.
- **NOT TESTED at user request.**

## September 7, 2026 — Organization Entitlement-Aware Tabs
- Removed the BRSR/GRI framework badges from the Organization summary.
- GHG Details now appears only for organizations with the canonical GHG entitlement.
- Production Data and Revenue Data now appear only when at least one Environment, Social, or Governance entitlement is enabled; inaccessible active tabs fall back to Basic Details.
- **NOT TESTED at user request.**

## September 7, 2026 — Organization Details Tab Structure
- Replaced the single Organization Details view with Basic Details, GHG Details, Production Data, and Revenue Data tabs.
- Moved Purpose of the Report, Organizational Boundaries, Uncertainty Assessment, GHG Reduction Initiatives, and Internal Performance Tracking Description into GHG Details.
- Kept all remaining organization fields in Basic Details, separated Turnover / Revenue from Production Quantity, and removed Last updated plus Related Modules.
- **NOT TESTED at user request.**

## September 7, 2026 — Monthly Day-Limit Runtime Error Fixed
- Replaced the undefined `month` reference in Scope 3 monthly day-limit feedback with a month label resolved from `monthKey`.
- **NOT TESTED at user request.**

## September 7, 2026 — Scope 3 Monthly Leap-Year Limits
- Corrected February limits for financial-year monthly entries by mapping January–March to the financial year’s ending calendar year.
- Standard Scope 3, C7 multi-employee, pre-save, and legacy C7 paths now share the same month/day resolver.
- **NOT TESTED at user request.**

## September 7, 2026 — Scope 3 Annual Day Limits
- Added dynamic 365/366 limits for annual Scope 3 day-count fields based on the selected calendar or financial reporting period.
- Covered standard Scope 3 yearly entry, C7 multi-employee entry, pre-save validation, and legacy C7 validation.
- Targeted ESLint and 38 regression tests passed.

## September 7, 2026 — Scope 3 Category/Method Transition
- Preserved Spend Basis across category changes only when supported by the destination category; unsupported methods now reset to Select Method.
- Cleared and reinitialized all downstream category-dependent calculation state to prevent stale activities, units, formulas, and results.
- **NOT TESTED at user request.**

## September 7, 2026 — Scope 3 Unit Controls Fixed
- Supplier Basis free-text units now start blank instead of inheriting the first global unit (`2022_USD`).
- Monthly and yearly unit choices now persist when typed or selected; valid non-default dropdown options are no longer overwritten.
- Targeted ESLint and 8 unit-control regression tests passed.

## September 7, 2026 — Exchange Rate Unit Reset Fixed
- Removed the startup seed overwrite that repeatedly restored the Exchange Rate mapping unit to `1`.
- Startup now inserts the mapping only when missing and preserves all later Super Admin edits.
- Repaired the local catalog and verified a subsequent startup seed leaves Exchange Rate unitless.

## September 7, 2026 — Scope 3 Spend Default Rates
- Displayed period-specific PPP, inflation, and standard exchange-rate defaults in Scope 3 Spend Basis ledgers using the same resolver as backend calculations.
- Preserved explicit override behavior and existing saved overrides across monthly and yearly entry.
- Targeted static checks and resolver API verification passed.

## September 7, 2026 — Scope 3 Create Selection Alignment
- Aligned Category, Calculation Method, Activity Type when applicable, and Activity in one responsive desktop row while preserving mobile stacking.
- **NOT TESTED at user request.**

## September 7, 2026 — Local Decision-Tree Formula-Version Map Repair
- Corrected the record-binding existence check so a legacy snapshot with a missing projected map is no longer mislabeled as a nonexistent decision-tree version.
- Added and applied a guarded migration for missing `formula_version_map` values across current and historical decision-tree documents. It backfilled 86 documents and created a local pre-write backup.
- **NOT TESTED at user request.**

## September 4, 2026 — Immutable Formula and Decision-Tree Versions
- Added a reusable calculation-version resolver and record-write guard. New emission records pin exact formula/tree versions and store a canonical formula snapshot generated from the server-side catalog.
- Formula edits append formula versions and automatically append linked decision-tree versions with formula-version maps. Historical edits use pinned form configuration and calculations; switching to newer rules during edit is rejected.
- Extended version persistence across manual emissions, C7 Employee Commuting, and Scope 1/2/3 Bulk Upload paths. Existing unversioned records are deliberately unchanged pending a separately approved migration.
- Verified with backend unit tests (7/7), live API regressions (9/9), process-emissions tests (4/4), frontend tests/lint, production build, Python compilation, authenticated API checks, and browser smoke. No mocked APIs.

## September 4, 2026 — R2-Backed Login Background
- Uploaded the supplied WebP scene to the existing `software-image-dev` R2 bucket at `images/login-background.webp`.
- Added the private R2 software-asset mapping and switched Login to fetch its signed background URL through `/api/software-assets/login-background`; no public raw asset URL is used by the page.
- Verified R2 upload, signed URL generation, frontend ESLint, and live Login rendering.

## September 4, 2026 — Super Admin Team Account Creation
- Super Admins can now create and manage organization-scoped **User** and **Admin** accounts from Team Accounts, with a role selector, organization selector, separate seat-limit enforcement, secure password hashing, and invitation-email rollback on delivery failure.
- Accounts continue to use the existing `users` collection and standard account fields; no collection or user-data migration was introduced.
- Verified by production build, browser flow, and focused backend regression checks (13 passed; side-effecting email checks skipped safely). The known edge-proxy CORS override remains infrastructure-blocked.

## September 4, 2026 — New Organization Org Config Null-Framework Repair
- Fixed the Org Config HTTP 500 caused by iterating over `esg_frameworks_enabled: null` while initializing newly created organizations.
- Absence of an enabled ESG framework is now represented safely as an empty list for both legacy reads and future organization creation.
- Verified through focused unit/API checks and the authenticated Testing organization editor; testing-agent iteration 41 passed backend and frontend checks with no mocked APIs.

## September 4, 2026 — Energy KPI Logs Polish and Filters
- Refined shared ESG KPI tables, Status/All Facilities filtering, and scoped Energy/Water filter visibility.
- Matched Energy Logs tabs, KPI cards, and page surfaces to the supplied reference: independent compact tabs and left-icon KPI tiles.
- Added a white Add Metric workspace surface. Verified with frontend ESLint and authenticated live Energy Logs rendering.
- Added validated Start Period/End Period filtering for native and GHG-imported KPI records; verified with the authenticated live Energy KPI view.
- Added KPI icons, content-sized metric tabs, and a white Add Metric workspace; verified with frontend ESLint and authenticated live interaction checks.

## September 3, 2026 — Voluntary Target Section Headings
- Added section-specific shared headers for Environment Target, Social Target, and Governance Target.
- Verified with frontend ESLint and authenticated live Environment Target rendering. No API or data behavior changed.

## September 3, 2026 — Organization GRI Tab Removal
- Removed the Organization module’s GRI tab and its placeholder panel. **NOT TESTED at user request.**

## September 3, 2026 — Portal Module Header Alignment
- Added the shared title-only module header across the remaining primary portal and admin modules, using appropriate colored left icons and preserving existing action controls.
- Fixed the Facilities JSX regression introduced during the broad header refactor; frontend ESLint passes. Broader visual regression testing remains deferred at user request.
- Matched Supplier Assessment’s centered icon/title geometry and fixed outlier top spacing for GHG Base Year, Peer Benchmarking, MIS Reports, and SBTi Targets. **NOT TESTED at user request.**
- Unified standard route top padding and module header-to-content spacing with the Supplier Assessment baseline. **NOT TESTED at user request.**
- Removed Supplier Assessment’s unintentional 24px outlet gap; live geometry now confirms both Supplier Assessment and GHG Base Year headers begin at 16px. Frontend ESLint passed.

## September 3, 2026 — Deferred P1: Reporting Period Standardization
- Added the reporting-period and reusable country/calendar reference-data consolidation to the P1 architecture backlog. No code changes were made.

## September 3, 2026 — Water Add Metric Field Alignment
- Standardized the label area and input baseline for dynamic numeric metric fields, fixing the visibly staggered Water consumption controls.
- Verified with frontend ESLint and authenticated live Water Add Metric browser check. No API or data behavior changed.

## September 3, 2026 — R2 File Lifecycle Integrity
- Added shared, storage-first R2 cleanup and made generic file deletion fail safely rather than hiding metadata when R2 removal fails.
- Applied cleanup to emission, sink, ESG, facility, organization, Repo Pilot, benchmark, OCR, and organization-cascade paths.
- Live isolated-artifact regression suite passed **3/3**; Python compilation, frontend ESLint, and authenticated GHG smoke passed. No APIs are **MOCKED**.

## September 3, 2026 — GHG Evidence Tooltip Contrast
- Updated the attached-evidence filename link in the Add Emission hover tooltip from blue to white, avoiding the blue-on-green clash while retaining clear hover feedback.
- Verified with frontend ESLint and an authenticated GHG Emissions browser smoke. No APIs or data behavior changed.

## August 30, 2026 — Roadmap Update
- Added P0: a deliberate migration/reassignment workflow for existing suppliers after parent GHG permission changes, preserving immutable issued assessments while allowing explicit alignment with newer program revisions.

## August 30, 2026 — Canonical ESG Response Migration
- Removed runtime dependencies on the deprecated `esg_responses` collection across questionnaire approvals, completion, BRSR/GRI retrieval, and Internal Data AI history.
- Standardized current questionnaire responses on flat `organization_esg_responses` documents and retained immutable approval history in `esg_responses_versions`.
- Updated legacy approval helpers to preserve approver edits, rejection restoration, audit/version events, and organization isolation without dual writes.
- Made the questionnaire approval queue questionnaire-only; record approvals continue through the canonical workflow request endpoint.
- Dropped the empty legacy collection and verified it was not recreated.
- Verification passed with the 37-test migration suite, 11 focused completion/history checks, Python compilation, frontend ESLint with zero errors, and live-app smoke testing. Added the missing `yarn lint` script for reliable automated lint execution. No mocked APIs.

## August 30, 2026 — Supplier Assessment State and Policy Repairs
- Reminders now load and send only incomplete, parent-program-enabled modules for the supplier's assigned reporting period. The picker no longer presents completed work.
- Restored due-date visibility after completion across parent assessment detail, supplier Documents, and supplier Trainings views.
- Preserved `revenue_required` while opening Edit Supplier, avoiding accidental Annual Revenue requirement resets on save.
- Added immutable-program policy flags for supplier custom fuels, Process Emissions, and Flaring. All are disabled by default and rejected by both supplier-specific and generic emission APIs unless explicitly enabled by the parent.
- Initial Python/ESLint/API/UI smoke checks passed before the user requested no further testing. **NOT TESTED** after that instruction; no mocked APIs were added.

## August 30, 2026 — Supplier GHG Program Policy Visibility
- Routed immutable supplier-program permissions into the shared GHG create/edit form. Process Emissions and Flaring are now hidden unless returned as program-allowed categories; Custom Fuel is hidden unless the program enables it.
- Corrected the generic supplier emission contract to include optional `category_id`, preventing a direct restricted payload from producing a 500. It now returns a controlled 403 rejection.
- Verified with 2 frontend policy unit tests, 6 backend supplier-policy tests, a live API request, Python compilation, and a supplier `/ghg` browser flow. No mocked APIs.

## August 30, 2026 — Training Player Control Cleanup
- Disabled Picture-in-Picture and remote playback for supplier and administrator training video viewers.
- **NOT TESTED** after implementation, per user instruction. No mocked APIs.

## August 30, 2026 — Parent Supplier Detail Expansion
- Extended parent-side supplier details with ESG, GHG, Documents, and Training completion tracks.
- Consolidated the ESG, Environment, Social, and Governance scores into one responsive score row.
- **NOT TESTED** after implementation, per user instruction. No mocked APIs.

## August 30, 2026 — Supplier Status Alignment
- Positioned the View Supplier status badge beneath its Status label.
- **NOT TESTED** after implementation, per user instruction. No mocked APIs.

## August 30, 2026 — Detailed Rankings Table Fit
- Compacted Detailed Rankings columns and spacing to retain the View action within standard desktop content widths.
- **NOT TESTED** after implementation, per user instruction. No mocked APIs.

## August 30, 2026 — Overdue Supplier Task Follow-up
- Replaced score-driven Attention Required entries with overdue, incomplete task detection across ESG, GHG, Documents, and Training.
- The parent ranking dashboard now names each overdue module for every supplier listed.
- Verified by live API and parent-dashboard smoke checks, Python compilation, and frontend linting (zero errors; existing warnings only). No mocked APIs.

## August 30, 2026 — Document/Training Action Consistency
- Unified due-date action icons and aligned Training actions to the Documents order.
- Made the Training overflow menu fully opaque.
- **NOT TESTED** after implementation, per user instruction. No mocked APIs.

## August 30, 2026 — Supplier Onboarding Copy
- Clarified the supplier onboarding heading with the Supplier Assessment workspace name.
- **NOT TESTED** after implementation, per user instruction. No mocked APIs.

## August 30, 2026 — Supplier GHG Submitted Totals
- Promoted submitted Scope 1 and Scope 2 totals above current draft values in the supplier GHG summary.

## August 30, 2026 — Published Emission Consumer Filter
- Applied the shared published-record lifecycle filter to Internal AI analytics/evidence and Peer Benchmarking date discovery.
- Kept operational lifecycle surfaces able to inspect drafts, pending approvals, rejected records, and history by design.

## August 28, 2026 — Unit-Driven Density and Reverse EF Conversion
- Added one shared density-state resolver for monthly/yearly rendering, validation, calculation preparation, and API enforcement.
- Density now appears only for a real mass/volume mismatch. Valid standard-fuel density is an overridable default; missing density becomes required with the correct directional unit.
- Carbon Composition with mass Quantity no longer shows Density.
- Quantity Basis with mass Quantity and a volume-denominator EF now normalizes the EF before the frozen calculation engine, replacing the previous `Cannot convert 'ef_quantity'` failure.
- Removed hardcoded standard-fuel formula-basis routing and made basis selection unit-driven.
- Stabilized the controlled Add Emission modal open action.
- Verified with 46 frontend tests, 8 backend tests, a production build, repeated modal opens, missing-density validation, and a successful cleaned-up reverse-conversion save.

## August 25, 2026 — Exact Supplier GHG Scope Enforcement
- Fixed the shared supplier GHG screen reading the supplier organization's dynamic GHG scopes, which exposed Scope 3 and Biogenic despite the parent assignment.
- Scope access now resolves canonically from the bound immutable supplier assessment-program revision.
- Parent Scope 1-only assignments expose only Scope 1; Scope 2-only exposes only Scope 2; combined assignments expose both.
- Scope 3 and Biogenic are stripped from supplier tabs, Add/Edit forms, summaries, list/state/history queries, and submission batches.
- Generic and supplier-specific create/edit APIs reject any scope not assigned by the parent.
- Direct Scope 3/Biogenic URLs fall back to the first assigned Scope 1/2 route.
- Verified with 23 focused backend tests, 4 frontend unit tests, 7 live read-only supplier checks, and an authenticated UI check.

## August 25, 2026 — Supplier Dashboard/Base Year/Analysis Locks
- Locked the main organization Dashboard, GHG Base Year, and GHG Analysis for supplier accounts while preserving the Supplier Assessment dashboard.
- Dashboard, Sinks, Base Year, and Analysis now use muted supplier navigation text without sidebar lock icons.
- All four remain clickable; restricted routes display the established full-page Premium Module overlay, matching the Sinks interaction.
- Added explicit direct-route locking so `/dashboard`, `/ghg/base-year`, and `/ghg/analysis` cannot bypass the premium overlay.
- Changed the sidebar logo destination for suppliers to the Supplier Assessment workspace rather than the locked organization Dashboard.
- Centralized supplier muted menu keys, route locks, and premium copy in one navigation policy.

## August 25, 2026 — Supplier GHG History Visibility and Audit Parity
- Removed supplier-facing Version History actions and dialogs from the GHG emissions grid.
- Non-supplier internal users now use the canonical emission-history view for supplier-sourced records rather than the supplier revision dialog.
- Added canonical `emission_history` creation events to the supplier-specific GHG create endpoint, matching normal organization record creation.
- Existing supplier draft edits continue writing field-level updates to `emission_history` through the shared GHG update route.
- Supplier submission/reopen revision lineage and immutable submitted revisions remain unchanged.
- Verified with lint checks and 16 focused supplier tests.

## August 25, 2026 — Supplier GHG Reporting-Period Lock
- Fixed supplier GHG forms inheriting the supplier organization's calendar-year default instead of the parent-assigned reporting period.
- Supplier Add now displays the assigned period, such as `FY 2026-27`, and prevents changing the reporting year.
- Financial-year monthly entry is constrained to April through March; yearly entry uses the exact assigned FY label.
- Supplier Edit keeps its reporting period read-only and displays the active customer assignment.
- Added backend create/update enforcement for both generic and supplier-specific GHG paths.
- Supplier GHG lists now return only records belonging to the active relationship and assigned annual/monthly periods.
- Added parsing support for both financial-year and calendar-year supplier assignments, including legacy calendar labels.

## August 25, 2026 — Supplier ESG/GHG Verification Acknowledgement
- Added a required supplier checkbox to both ESG questionnaire and GHG submission confirmation dialogs.
- Final submission remains disabled until the supplier confirms the data was reviewed and verified for accuracy and completeness.
- Added backend enforcement so direct API calls cannot bypass the acknowledgement.
- Persisted `data_verified`, `data_verified_at`, and `data_verified_by` on final ESG responses and submitted GHG records.
- Added unique test identifiers for the acknowledgement, statement, and checkbox controls.

## August 25, 2026 — GHG Period Row Allowance Parity
- Reinterpreted `environment.ghg.monthly_rows_allowed` as a per-reporting-month organization limit instead of one lifetime total across all monthly records.
- Added yearly-frequency allowance at `monthly_rows_allowed × 12` per reporting year.
- Applied the shared canonical guard to standard manual GHG creation and C7 monthly/yearly creation.
- Bulk Upload now rejects only excess period rows during validation with `PERIOD_ROW_LIMIT_EXCEEDED`; in-limit rows remain available for preview and save.
- Added full-batch rechecks immediately before direct bulk persistence and confirmation-save persistence.
- Added `frequency_type: monthly` and `submission_batch_id` to new C7 monthly records so legacy-aware counting and batch rollback stay consistent.
- Verified with 7 focused backend tests and an authenticated Bulk Upload frontend smoke test. Independent iteration 19 reported no scoped defects and no mocked APIs.

## August 25, 2026 — Bulk Upload Stability and Architectural Parity
- Enforced canonical organization GHG scope/category/process/custom-fuel capabilities in Bulk Upload.
- Added Flaring and Process Emissions handling, custom-fuel auto-detection, dry-run preview summaries, and partial-insert rollback.
- Added a 24-hour TTL for pending records.
- Enforced 10 MB files, 5,000 rows per sheet, and 25,000 rows per workbook.
- Iteration 18 passed 11 backend checks with frontend preview verification.

## June 19, 2026 (Latest)

### ESG Records Module - Phase 1 Implementation
- **Reusable Architecture**: Built modular records system supporting Environment, Social, and Governance
- **Backend Components**:
  - `/app/backend/modules/esg_records/` (contracts, service, router)
  - Collections: `esg_record_categories`, `{section}_records`, `{section}_record_versions`
  - Full CRUD APIs with pagination, filtering, search
  - Version history with snapshot preservation
- **Frontend Components**:
  - `ESGRecords.js` - Reusable records table with filters, pagination
  - Multi-step "Add Record" modal with dynamic field rendering
  - Version history modal
- **Initial Categories Seeded** (11 total):
  - Environment: Water (3), Energy (2), Emissions (1), Waste (2)
  - Social: Workforce (1), Training (1)
  - Governance: Compliance (1)
- **Features**:
  - Record levels: Organization / Facility
  - Reporting types: Daily, Monthly, Quarterly, Yearly (FY & CY)
  - Config-driven dynamic fields per category
  - Framework mapping support (BRSR, GRI future-ready)
  - Version tracking with audit trail

---

## June 17, 2026

### Environment Questions Q75-Q94 (Resource Management, Emissions & Compliance)
- Added 20 new BRSR Environment questions via `/app/backend/scripts/seed_brsr_environment_q75_94.py`:
  - Q75: `env_energy_consumption_intensity` - Energy metrics matrix with assurance field
  - Q76: `env_pat_scheme_compliance` - PAT scheme Yes/No with nested details
  - Q77: `env_water_withdrawal_consumption` - Water withdrawal metrics matrix
  - Q78: `env_water_discharge_treatment` - Water discharge by destination with treatment levels
  - Q79: `env_zero_liquid_discharge` - ZLD Yes/No with description
  - Q80: `env_air_emissions_non_ghg` - Air emissions table (NOx, SOx, PM, etc.)
  - Q81: `env_scope12_ghg_emissions` - **Linked to GHG module** (read-only)
  - Q82: `env_ghg_reduction_initiatives` - GHG reduction projects
  - Q83: `env_waste_generation_management` - Master waste matrix (generated, recovered, disposed)
  - Q84: `env_waste_management_practices_desc` - Long text for practices description
  - Q85: `env_ecologically_sensitive_areas` - Dynamic table for sensitive areas
  - Q86: `env_eia_details` - Environmental Impact Assessment table
  - Q87: `env_environmental_compliance` - Compliance Yes/No with non-compliance table
  - Q88: `env_water_stress_areas` - Water metrics for stress areas
  - Q89: `env_scope3_emissions` - **Linked to GHG module** (read-only)
  - Q90: `env_biodiversity_impact` - Long text for biodiversity impacts
  - Q91: `env_resource_efficiency_initiatives` - Dynamic table for initiatives
  - Q92: `env_business_continuity_disaster` - Text with optional weblink
  - Q93: `env_value_chain_impacts` - Long text for value chain impacts
  - Q94: `env_value_chain_assessment` - Percentage with description

### New Frontend Renderers (Q75-Q94)
- `HistoricalEnvironmentalMetricsMatrixRenderer` - Energy/sectioned metrics with assurance
- `YesNoWithNestedDetailsRenderer` - Nested sub-questions with conditional visibility
- `HistoricalWaterMetricsMatrixRenderer` - Water withdrawal/consumption matrix
- `HistoricalWaterDischargeMatrixRenderer` - Destination x Treatment nested matrix
- `YesNoWithDescriptionRenderer` - Yes/No with conditional textarea
- `HistoricalEmissionsTableRenderer` - Air emissions with unit column
- `LinkedGHGMetricsMatrixRenderer` - Read-only GHG module integration
- `HistoricalWasteManagementMasterMatrixRenderer` - 3-section waste matrix
- `LongTextResponseRenderer` - Simple textarea for long responses
- `DynamicTableRenderer` - Generic add/remove row table
- `HistoricalWaterStressMatrixRenderer` - Reuses water metrics for stress areas
- `LinkedScope3MetricsMatrixRenderer` - Read-only Scope 3 integration
- `TextWithOptionalWeblinkRenderer` - Text with optional URL field
- `PercentageWithDescriptionRenderer` - Percentage input with description

### Backend Updates (Q75-Q94)
- Added 14 new question types to `contracts.py`
- Total BRSR Environment questions: **29** (4 original + 5 Q70-74 + 20 Q75-94)

---

### Environment Questions Q70-Q74 (Life Cycle Assessment & Circular Economy)
- Added 5 new BRSR Environment questions via `/app/backend/scripts/seed_brsr_environment_q70_74.py`:
  - Q70: `env_life_cycle_assessment` - Yes/No with conditional dynamic table for LCA details
  - Q71: `env_lca_concerns_actions` - Textarea for LCA concerns (conditional on Q70)
  - Q72: `env_recycled_input_material` - Historical percentage table for recycled input materials
  - Q73: `env_reclaimed_products_packaging` - Matrix table with Current/Previous FY columns
  - Q74: `env_waste_management_practices` - Historical waste management matrix

### Historical Autofill API (NEW)
- Added `GET /api/esg-questionnaire/responses/{framework}/{section}/{year}/historical` endpoint
- Dynamically fetches previous FY data without storing historical snapshots in current document
- Returns:
  - `previous_year`: Calculated previous reporting year (e.g., "2024-25" from "2025-26")
  - `previous_responses`: The actual response data from the previous year
  - `autofill_mappings`: Question-to-field mappings for frontend autofill logic
  - `has_previous_data`: Boolean indicating if previous data exists

### New Frontend Renderers
- `YesNoWithDynamicTableRenderer` - Yes/No toggle with conditional table display
- `HistoricalMaterialPercentageTableRenderer` - Dynamic table with historical autofill
- `HistoricalReclaimPercentageTableRenderer` - Fixed-row matrix with FY comparison
- `HistoricalWasteManagementMatrixRenderer` - Product category matrix with historical autofill

### Backend Updates
- Added 4 new question types to `contracts.py`: `yes_no_with_dynamic_table`, `historical_material_percentage_table`, `historical_reclaim_percentage_table`, `historical_waste_management_matrix`
- Added `get_historical_data()` and `_calculate_previous_fy()` methods to `ESGQuestionnaireService`
- Total Environment questions: 9 (4 original + 5 new)

---

### Config-Driven ESG Questionnaire System (NEW)
- Created `/app/backend/modules/esg_questionnaire/` module with:
  - `contracts.py` - Pydantic models for question configs and responses
  - `service.py` - ESGQuestionnaireService with full CRUD operations
  - `router.py` - REST API endpoints for configs and responses
- Created `/app/frontend/src/components/ESGQuestionnaire.js` (628 lines):
  - Generic questionnaire renderer supporting 10+ question types
  - PrincipleToggleRenderer for NGRBC P1-P9 questions
  - TableRenderer for dynamic table questions
  - Completion progress tracking with badges
- Updated ESG module pages:
  - `Environment.js` - Integrated ESGQuestionnaire (section="environment")
  - `Social.js` - Integrated ESGQuestionnaire (section="social")
  - `Governance.js` - Integrated ESGQuestionnaire (section="governance")
- Seeded 3 initial BRSR governance questions via `/app/backend/scripts/seed_brsr_governance_questions.py`
- New MongoDB collections: `esg_question_configs`, `organization_esg_responses`

### Previous (Same Day)
- BRSR Extended Sections Batch 1 (Employees, Women Representation, CSR, Holding/Subsidiary)
- Turnover Rate Matrix with 3-FY simultaneous editing
- Complaints/Grievances and Material Issues sections
- Admin sidebar restructure (GHG under parent menu)
- Hybrid DB architecture (static vs yearly data separation)

## June 16, 2026
- ESG Platform foundation (users_esg migration, framework registry)
- BRSR Organization Details UI integration
- ESG Frameworks selection UI for Super Admin

## February 2026
- EmissionEntryForm refactoring (F1-F6 complete, -32.2% code reduction)
- Emissions.js modularization (E1-E3 complete, -4.7% code reduction)
