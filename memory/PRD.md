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
- Organization Details uses four responsive tabs: **Basic Details**, **GHG Details**, **Production Data**, and **Revenue Data**.
- **GHG Details** is visible only when the organization has opted into the canonical `environment.ghg` entitlement.
- **Production Data** and **Revenue Data** are visible only when at least one canonical Environment, Social, or Governance entitlement is enabled.
- **Basic Details** contains company identity, logo, corporate address, organization description, mission, vision, process description, a responsive responsible-person contact row, reporting year, attachments, and other organization information.
- **GHG Details** contains Purpose of the Report, reporting frequency, Organizational Boundaries, Uncertainty Assessment, GHG Reduction Initiatives, and Internal Performance Tracking Description.
- The equity-share facility disclaimer uses neutral supporting text, not a warning treatment. In view mode, Organizational Boundaries and Uncertainty Assessment share a responsive desktop row, and boundary approaches use neutral surfaces.
- **Production Data** contains Production Quantity only; **Revenue Data** contains Turnover / Revenue only. Both show the current reporting year plus the prior four years (including empty years), support exactly one entry type (monthly or yearly) per period, and respect the organization calendar/financial reporting year.
- Organization details do not display a last-updated timestamp or Related Modules navigation cards.
- The organization summary displays organization identity and a live No. of Facilities count; country, timezone, reporting-year type, target count, and reporting cadence are omitted.
- The view-mode corporate address is presented as one joined address line without timezone.
- Facility equity-share guidance uses neutral supporting text instead of a yellow warning panel. Facility Person Responsible, Designation, and Contact Details appear in one responsive row.
- The Facility edit form uses a consistent section and field-row gap throughout, with responsive grids that prevent uneven wrapping.

### GHG Data Entry
- Support monthly and yearly Scope 1, Scope 2, Scope 3, and approved biogenic entries.
- Preserve common create/edit contracts, calculation audit linkage, and approval behavior.
- Monthly multi-row submissions remain atomic through `submission_batch_id` rollback.
- Enforce organization capability overrides server-side.
- Resolve density visibility and requiredness from actual quantity/reference unit dimensions.
- Preserve source values while normalizing valid reverse unit conversions before calculations reach the frozen engine.

### GHG Period Row Allowance
- `entitlements.environment.ghg.monthly_rows_allowed` is an organization-wide base allowance per distinct monthly period.
- Yearly allowance is `monthly_rows_allowed × 12` per distinct yearly period; blank means unlimited.
- Monthly and yearly quotas are independent; legacy monthly records count as monthly.
- Superseded supplier revisions do not consume current-row allowance.
- Manual entry, C7, Bulk Upload preview/save, and bulk confirmation share the same enforcement rule.

### Supplier Assessment
- Preserve the module registry and immutable program-revision model.
- Supplier ESG and GHG submissions are immutable, with parent-controlled reopen/resubmission.
- Supplier GHG reporting assignment and scope access derive from the active relationship and immutable program revision.
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
- Enforce scopes, categories, Process Emissions, Flaring, custom fuels, and plan limits through canonical resolvers.
- Provide dry-run totals, row-level errors/warnings, valid-row partial success, and rollback on persistence failure.
- Limit files to 10 MB, sheets to 5,000 rows, workbooks to 25,000 rows, and pending validated records to 24 hours.

## Architecture
- `/app/backend/modules/sustainability_config/` — canonical organization settings and GHG overrides.
- `/app/backend/modules/entitlements/` — module access and numeric plan-limit enforcement.
- `/app/backend/modules/emissions/` — manual GHG create/edit/history, C7, rollback, and contracts.
- `/app/backend/bulk_upload_scope3/` — Excel generation, parsing, validation, preview, and persistence.
- `/app/backend/modules/supplier_assessment/` — supplier programs, submissions, Documents, Training, and completion.
- `/app/backend/calc_engine/` — frozen calculation decision engine.
- `/app/frontend/src/pages/OrganizationDetails.js` — customer Organization settings and organization reporting data UI.
- `/app/frontend/src/modules/ghg/` — shared GHG capabilities, form orchestration, adapters, and categories.
- `/app/frontend/src/modules/bulkUpload/` — Bulk Upload UI and API orchestration.

## Primary Data Collections
- `organization_config` — entitlements, GHG overrides, organization settings, and aliases.
- `emission_records` — current GHG records and immutable supplier revisions.
- `emission_history` — emission version history.
- `ce_decision_trees` and `ce_decision_tree_versions` — immutable calculation logic versions.
- `ce_input_field_mappings` — configuration-driven field display, defaults, units, and ordering.
- `bulk_upload_jobs`, `bulk_upload_pending_records`, `bulk_upload_errors` — Bulk Upload workflow records.
- `supplier_relationships`, `supplier_assessment_programs`, `supplier_ghg_submissions` — supplier assignment/submission lifecycle.

## Key API Endpoints
- `POST /api/emissions`
- `POST /api/emissions/c7/month`
- `POST /api/emissions/c7/yearly`
- `POST /api/emissions/batch-rollback`
- `POST /api/bulk-upload/scope3/upload`
- `POST /api/bulk-upload/scope3/jobs/{job_id}/save`
- `GET /api/organizations/my`, `PUT /api/organizations/my`
- `GET`, `POST /api/organization/yearly-data/{year}`

## Latest Change — September 8, 2026
- **September 10, 2026 — Ranking Overview KPI alignment:** Updated Overview status KPI cards to the compact Supplier Ranking card format, with white surfaces, pale icon tiles, oversized values, and status-specific top edges: green for Excellent, blue for Good, and red for Overdue follow-up.
- **NOT TESTED** per the user’s standing instruction.

- **September 10, 2026 — Supplier Ranking KPI sizing correction:** Kept the approved white/emerald KPI treatment but restored compact dashboard dimensions: reduced card height, padding, icon tile, labels, and metric text. Removed responsive metric text scaling to prevent oversized cards on wide screens.
- **NOT TESTED** per the user’s standing instruction.

- **September 10, 2026 — Supplier Ranking KPI visual refresh:** Redesigned the Supplier Ranking summary KPI cards to match the approved reference: a clean white surface, slim emerald top rule, generous pale-green icon tile, and oversized primary metric. Existing metric data and interactions remain unchanged.
- **NOT TESTED** per the user’s standing instruction.

- **September 10, 2026 — Supplier GHG tabs consolidated:** Moved the “Emissions by Supplier” and “Logs” view tabs into the Supplier GHG top control bar, alongside the emissions search and reporting-period selector.
- **NOT TESTED** per the user’s standing instruction.

- **September 10, 2026 — Supplier GHG toolbar alignment:** Supplier GHG Emissions now uses the same responsive top control panel as the other Supplier Assessment modules. Its emissions search and reporting-period selector are consolidated in the top bar, while scope, supplier, and category remain focused filters within the Logs tab.
- **NOT TESTED** per the user’s standing instruction.

- **September 10, 2026 — Documents and Training toolbar alignment:** Supplier Documents and Training now use the same responsive top-toolbar pattern as Suppliers and ESG Questionnaires: search at left, the existing publish/create action, and the reporting-period selector at right. Both lists filter by title/description with an explicit no-results state.
- **NOT TESTED** per the user’s standing instruction.

- **September 10, 2026 — ESG Questionnaire toolbar alignment:** Restructured the ESG Questionnaire top controls to match the Supplier module’s panel pattern. The unified toolbar now provides questionnaire search, Review responses, New Questionnaire, and the reporting-period selector aligned at the right. Search filters questionnaires by name and description with a clear empty state.
- **NOT TESTED** per the user’s standing instruction.

- **September 10, 2026 — Custom Fuel EF default persistence:** Quantity Basis Custom Fuel now materializes `kgCO2/kg` into each row’s form state when no EF unit was selected. Create and Edit payload serializers also use method-specific safeguards (`kgCO2/kg` for Quantity Basis; `tCO2/TJ` for Heat Basis), eliminating empty emission-factor units in saved requests.
- **NOT TESTED** per the user’s standing instruction.

- **September 10, 2026 — Custom Fuel quantity EF restriction:** The Quantity Basis Custom Fuel emission-factor picker now offers only `kgCO2/L` and `kgCO2/kg`. The calculation adapter and Emission API reject any other quantity-basis Custom Fuel emission-factor unit, preventing bypass through stale UI state or direct API submission.
- **NOT TESTED** per the user’s standing instruction.

- **September 10, 2026 — Formula resolver scope repair:** Moved the standard-fuel unit-basis variables into the Scope 1/2 formula resolver where they are used. This removes the `selectedCvUnit is not defined` runtime crash introduced during the standard-fuel routing enhancement.
- **NOT TESTED** per the user’s standing instruction.

- **September 10, 2026 — Edit routing startup repair:** Corrected the standard-fuel Edit calculation callback to reference the existing early-resolved `editSelectedFuel` value. This removes the temporal-dead-zone startup crash while preserving fuel-default-aware basis routing.
- **NOT TESTED** per the user’s standing instruction.

- **September 10, 2026 — Standard-fuel density and routing parity:** Standard-fuel Edit now exposes only its active density unit (the saved unit, fuel-native default, or dynamically required unit), rather than the unrestricted administrator allowlist. Standard stationary/mobile/flaring calculations now derive the decision-tree EF/CV basis from the active factor or calorific-value denominator, including fuel database defaults, instead of forcing the mass branch. This keeps volume-basis fuels on their correct calculation path.
- **NOT TESTED** per the user’s standing instruction.

- **September 10, 2026 — Canonical density `kl` unit:** Density units now normalize every standalone `kL` component to lowercase `kl`, including both `kg/kL → kg/kl` and `kL/kg → kl/kg`. The rule is scoped strictly to density; calorific units such as `TJ/kL` remain unchanged. New and updated fuel records, emission payloads, calculation overrides, Scope 1/2 Bulk Upload overrides, and legacy fuel/emission responses all use the canonical spelling; immutable historical records are not rewritten.
- **NOT TESTED** per the user’s standing instruction.

- **September 10, 2026 — FY-aware currency fallback hierarchy:** The shared currency resolver now applies the requested financial-year hierarchy in all context-aware GHG calculation and default-resolution paths. For monthly entries in an FY, it uses the exact month, then the containing April–March FY, then the matching calendar year (Apr–Dec use that year; Jan–Mar use the following year). Calendar-year monthly entries remain calendar-only. A yearly FY record uses its exact FY first, then the FY starting calendar year. Method isolation remains intact: PPP/inflation and standard exchange-rate records resolve only within their selected method.
- **NOT TESTED** per the user’s standing instruction.

- **September 10, 2026 — Optional PPP and inflation configuration:** Super Admins can now create or update PPP/inflation currency configurations without entering either Purchase Parity or Inflation Factor. The frontend no longer marks those inputs required, and server validation now preserves blank values as `null`; standard currency conversion continues to require its exchange rate.
- **NOT TESTED** per the user’s standing instruction.

- **September 10, 2026 — Currency conversion null-state repair:** Made period applicability inference and display formatting null-safe. The always-mounted delete confirmation now safely renders before a conversion has been selected, and malformed/null list entries are excluded from the displayed configuration collection.
- **NOT TESTED** per the user’s standing instruction.

- **C8 Allocation Method UI (P1):** Added a C8 Activity Based-only Allocation Method selector before Sub-category in Add and Edit Emission. `allocation_method` is passed to Decision Tree execution and stored with new C8 records. Changing it clears the downstream Sub-category/activity choice and calculation preview. Existing C8 records are intentionally not migrated or defaulted; Bulk Upload is intentionally unchanged. Formula Builder variable, input-field mapping, and Decision Tree branches remain user-owned configuration work.
- **C8 Floor Area Share Decision Tree (P1):** Published C8 Decision Tree version 10 (`f2718a79-8ab2-4e9b-8b96-8d854c5dfe2f`). For Activity Based: `allocation_method=entire_quantity` preserves the existing subcategory routes; `floor_area_share` routes Fugitive Emissions to **Floor Area Share - Fugitives** (`79f0dca2-9559-4ec6-9ab0-0f6c0ca9097b`) and all other existing C8 Activity Based subcategories to **Floor Area Share - Activity Based** (`2970cc05-eac5-432f-a186-665ebe313208`). The required `floor_area_share` input-field mapping has not yet been created.
- **C8 Supplier Method Floor Area Share (P1):** Published C8 Decision Tree version 11 (`f1e512d9-1455-47cb-aa28-47b13d8de9fb`). Supplier Method now also requires `allocation_method`: `entire_quantity` preserves its existing formula and `floor_area_share` routes every existing C8 Supplier Method subcategory to **Floor Area Share - Supplier Method** (`8fbfe6f0-1f7f-4366-8501-8b23193321e8`). The C8 selector is shown for both Activity Based and Supplier Method.
- **C8 Allocation Method edit hydration fix (P1):** Restored `allocationMethod` in the shared persisted-record-to-edit-draft adapter. Newly saved C8 records already stored the selection correctly in `dynamic_field_values.allocation_method`, but the adapter omitted it before rendering the edit dropdown.
- **GHG entry UI polish (P1):** Renamed the PPP currency method to **Currency adjusted to Inflation Rate and Purchase Power** across Add, Edit, and currency configuration controls. In C8 Edit, Subcategory, Activity, and Asset Name now use one responsive row and Asset Name no longer uses the yellow information panel. In Add Emission, Asset Name moved from Optional fields into Primary information immediately after the activity selection.
- **C8 edit-save allocation fix (P1):** Passed the saved `editDraft.allocationMethod` into the Scope 3 edit validation context. The draft and payload already contained the selected value, but validation received `undefined` and incorrectly blocked every C8 Activity Based/Supplier Method update.
- **Custom Activity audit cleanup (P1):** Store `dynamic_field_values.use_custom_activity` only when a real custom activity is selected (`true`); standard activity records omit the default `false` marker. Excluded this technical control flag from future audit diffs and hide its legacy entries in Version History. Custom activity changes remain visible through the readable Activity change, including its `(custom)` indicator.
- **Fuel and Activity picker consolidation (P1):** Added a shared single-control searchable picker and replaced separate search + dropdown rows in Add Emission for Fuel and Scope 3 Activity, and in Edit for Fuel and Scope 3 Activity. Options show names only, per user direction; existing IDs, filtering eligibility, Custom Fuel, and Custom Activity behavior are preserved.
- **Searchable picker opacity (P1):** Set the new picker’s popover and command list to explicit opaque white backgrounds, preventing underlying form content from showing through an open menu.
- **Scope 3 source-row alignment and picker scrolling (P1):** Made Add Emission source rows decision-aware: C8 and C11 use three desktop columns, keeping their dependent fields together (C8 Subcategory / Activity / Asset). The shared searchable picker now uses a viewport-limited, touch-safe scrolling option list for long Fuel or Activity lists.
- **Searchable picker field alignment fix (P1):** Added a real DOM layout wrapper around the shared searchable picker. This allows surrounding form spacing to apply correctly, aligning the Activity picker with Category/Calculation Method and fixing the same alignment issue for Scope 1 Fuel Type.
- **Edit-form picker and Asset Name layout follow-up (P1):** Removed the remaining extra vertical offset around the Scope 1 Fuel Type searchable picker. All Scope 3 categories with the `asset-name` capability now render Asset Name in the same responsive source-details grid as Activity (and Subcategory where applicable), using the standard neutral field treatment instead of the legacy yellow Asset Information panel.
- **SOURCE REVIEW ONLY:** Automated and browser testing were not run per the user’s standing instruction; live user verification remains pending.
- **NOT TESTED** per the user’s standing instruction.
- **NOT TESTED** per the user’s standing instruction.
- **NOT TESTED** per the user’s standing instruction.
-
- **September 9, 2026 — Scope 3 currency-method terminology:** Renamed the visible `PPP and Inflation Rate` dropdown option to **`Reporting Year & PPP Adjustment`** in Scope 3 Add Emission, edit emission, and Super Admin currency-configuration controls. The stored `ppp_inflation` value and all calculation behavior remain unchanged.
- **NOT TESTED** per the user’s standing instruction.
-
- **September 9, 2026 — Removed disconnected Process Templates module:** Deleted the Super Admin Process Templates page, navigation route, CRUD/public backend endpoints, contracts, frontend fetch/state plumbing, dormant template-specific form state, renderer branches, save payload builders, utility files, and obsolete endpoint/unit tests.
- Active Scope 1 Process Emissions remain available through the canonical configuration-driven form, decision tree, calculation engine, and module dispatch. Existing `process_templates` database rows were intentionally left untouched; they are no longer read or written by application code.
- **NOT TESTED** per the user’s standing instruction; a reference-only sweep found no remaining Process Templates code references.
-
- **September 9, 2026 — Removed unused emissions repository wrapper:** Deleted `backend/repositories/emissions_repository.py` after confirming it had no imports or runtime consumers. Active emissions routes and processors continue using the existing MongoDB access paths directly.
- Super Admin Process Templates investigation: CRUD and active-template fetch endpoints exist, but the emissions form does not currently select or assign a fetched template. `selectedTemplate` remains `null`, leaving the template-specific rendering and save branches dormant; active Process Emissions use the configuration-driven calculation flow instead.
- **NOT TESTED** per the user’s standing instruction.
-
- **September 9, 2026 — Canonical dynamic quantity storage:** Removed top-level `quantity`, `quantity_unit`, and `unit` from active manual-create, edit, process-template, legacy Bulk Upload, approval, and repository write paths. Backend write boundaries now discard these compatibility fields so `dynamic_field_values` is the single source of truth for activity inputs.
- Emissions tables, sorting, edit hydration, delete confirmation, supplier read-only views, approval details, and approval comparisons now resolve quantity from dynamic fields. Existing top-level values remain read-only fallbacks for records that predate dynamic inputs; edits do not mutate or synchronize those legacy fields.
- Version History no longer tracks or renders duplicate top-level Quantity/Unit changes. Existing saved duplicate entries are suppressed, while the canonical dynamic input change remains visible as Quantity Used.
- **NOT TESTED** per the user’s explicit instruction.
-
- **September 9, 2026 — Consistent density calculation audit (manual and Bulk Upload):** Property-based direct, reverse, and compound unit conversions now attach additive density resolution metadata without changing conversion factors, formula selection, or numerical outputs. The shared execution layer records this metadata as the same canonical `resolve_property` audit step already produced by the volume-to-mass transformation path, so future manual and Bulk Upload records retain consistent density value, unit, and source details.
- Calculation Details now recognizes the earlier direct-conversion audit shape (`convert` + `property_key: density`) for existing manual and Bulk Upload records, displaying the density that was already used without rewriting immutable history. Removed the unwanted Default/Overridden density labels.
- **NOT TESTED** per the user’s explicit instruction.
-
- **September 9, 2026 — Calculation Details density clarity:** When a calculation uses density, its property row now explicitly identifies whether the displayed amount is the **Overridden value** or the resolved **Default value**, while retaining its calculation-data source badge.
- **NOT TESTED** per the user’s standing instruction.
-
- **September 9, 2026 — Scope 1 fuel-edit recalculation and history repair:** Changing a fuel while editing a Scope 1 emission now marks the form as changed, allowing the existing calculation flow to replace the stored result immediately after the new fuel inputs hydrate.
- Scope 1 edit submissions now mirror the calculated primary quantity and its unit to the record-level `quantity`, `quantity_unit`, and `unit` fields. Version history therefore compares the edited quantity against its real stored value rather than the Pydantic default of `null` / `(empty)`.
- **NOT TESTED** per the user’s explicit instruction.
-
- **September 9, 2026 — Scope 1/2 category contribution:** Added a `% Contribution` column to the Scope 1 and Scope 2 Category Analysis table. Each category’s percentage is calculated against combined Scope 1 + Scope 2 emissions for the selected reporting period.
- **NOT TESTED** per the user’s standing instruction to avoid testing during rapid iteration.
-
- **September 9, 2026 — Scope 1/2 analysis visualization:** Renamed the report section to **Scope 1 and Scope 2 Category Analysis** and added a horizontal bar chart for stationary combustion, mobile combustion, fugitive emissions, and non-renewable electricity.
- **Data finding:** ORG1 has qualifying Scope 3 spend-basis records for C1 only; it has no C2 spend-basis record, which is why the methodology table correctly shows C1 alone. Method-breakdown percentages are calculated as each method’s Scope 3 tCO₂e total divided by the report’s total Scope 3 tCO₂e, then rounded to one decimal place.
- **NOT TESTED** per the user’s standing instruction to avoid testing during rapid iteration.
-
- **September 9, 2026 — GHG dashboard reset repair:** Restored the `getCurrentFinancialYear` helper connection from `useDashboardData` through `BaseExecutiveDashboard` into `DashboardFilters`. Reset to Default can again clear facilities and restore the current FY without calling an undefined callback.
- **NOT TESTED** per the user’s explicit instruction.
-
- **September 9, 2026 — GHG methodology-table refinement:** Scope 1/2/3 reports retain the carbon-content formula when applicable but no longer show `Carbon Content - Based Approach` in the Subcategory/Methodology column. Scope 3 spend-based methodology rows are now emitted beneath each actual category (such as C1 or C2) using PPP/inflation, standard conversion, or both according to the methods used in the reporting period.
- Scope 1/2 organization analysis now contains a dedicated table showing Stationary Combustion, Mobile Combustion, Fugitive Emissions, and Non-renewable Electricity totals in tCO₂e, making those four requested amounts explicit.
- **NOT TESTED** per the user’s standing instruction to avoid testing during rapid iteration.
-
- **September 9, 2026 — GHG report accuracy and methodology update:** Missing record-level responsible-person names now fall back to the relevant facility’s responsible person. Report base-year messaging now requires an exact FY/CY reporting-window match, preventing a different reporting period from being described as the base year.
- Scope 1/2 reports now disclose the Carbon Content - Based Approach and its explanatory definitions when any organization facility used it during the reporting period. Scope 1/2/3 methodology tables conditionally include the carbon-content formula and only the spend-currency formulas actually used by organization facilities (PPP/inflation, standard currency conversion, or both). The reference source list now includes RBI.
- Carbon intensity now consistently uses Scope 1 + Scope 2 emissions divided by production quantity. Scope 1/2 organization analysis now includes stationary combustion, mobile combustion, fugitive emissions, and non-renewable electricity totals. Scope 1/2/3 reports now contain separate Scope 1, Scope 3, and overall category-wise analyses.
- Confirmed reporting policy: partial FY windows proportionally allocate annual emissions and production data; the existing report footnote identifies these rows. This explains the reported 10.77 tCO₂e C1 and 414.60 MT figures for an Apr–Sep report, while a full Apr–Mar FY report uses 15.76 tCO₂e and 829.2 MT.
- **NOT TESTED** per the user’s explicit instruction. A prior Python import/proration sanity check completed before this instruction; no further test was run.
-
- **September 9, 2026 — GHG report download authentication fix:** The Reports-page GHG inventory flow now retrieves the generated file through an Axios blob request carrying the existing bearer token, rather than navigating directly to the protected download URL. The browser then downloads the authenticated blob with the returned report filename.
- Root cause: report generation (`POST /api/reports/ghg-inventory`) succeeded, but the follow-up direct `GET /api/reports/download/{token}` returned 401 without an `Authorization` header. Added the focused authenticated-report regression procedure to `/app/auth_testing.md`.
- **NOT TESTED** per the user’s explicit instruction. No authentication configuration or credentials were changed.
-
- **September 9, 2026 — ORG1 Scope 2 local-data deletion:** With explicit user confirmation, created and executed `backend/scripts/delete_org_scope2_records.py ORG1 --apply`. The scoped deletion removed 6 current Scope 2 emission records, 8 linked `emission_history` entries, and 7 linked `ce_calculation_audit_logs` entries for ORG1 only.
- Automatic BSON backup: `/app/.emergent/backups/org1-scope2-delete-20260909T092221Z.json`. **VERIFIED:** ORG1 now has 0 Scope 2 records and 0 linked history/audit records for the deleted IDs; 11 other-scope records remain unchanged.
-
- **September 9, 2026 — GHG sticky-filter inset:** Increased the shared sticky-filter header’s horizontal padding so the GHG logo/title begins with more space from the left edge and the Show filters control has matching right-side space.
- **NOT UI TESTED** per the user’s explicit standing instruction to avoid UI testing during rapid iteration.
-
- **September 9, 2026 — Contextual KPI comparisons:** GHG KPI delta labels now read `vs previous FY` for the current financial-year window, `vs previous CY` for the current calendar-year window, and `vs previous month` for any single-month window. Custom multi-month windows continue to show the equivalent prior-year dates.
- The comparison query now fetches the immediately preceding calendar month for a one-month selection, rather than the same month last year, so the displayed label and underlying KPI delta use the same comparison period.
- **NOT UI TESTED** per the user’s explicit standing instruction to avoid UI testing during rapid iteration.
-
- **September 9, 2026 — GHG target-card copy cleanup:** Removed the redundant selected target name beneath the Reduction Target Achieved KPI percentage, including its unavailable-progress state. The multi-target selector remains available when it is needed to switch targets.
- **NOT UI TESTED** per the user’s explicit standing instruction to avoid UI testing during rapid iteration.
-
- **September 9, 2026 — Complete same-day GHG dashboard restore:** Restored all 21 GHG dashboard files changed today to the pre-today dashboard baseline. This removes the same-day changes to filtering, empty states, charts, rankings, KPI layout/visual styling, targets, and GHG data presentation; the C3 work remains unaffected.
- Retained only the requested KPI comparison behavior: KPI deltas now show the selected prior-year window in a single phrase, e.g. **`9.3% vs Apr 2025 – Mar 2026`**. Its minimal changes are limited to `BaseExecutiveDashboard.jsx` and `KpiCard.jsx`; non-visible whitespace cleanup was retained in three shared files.
- **NOT UI TESTED** per the user’s explicit standing instruction to avoid UI testing during rapid iteration; source whitespace validation passed.
-
- **September 9, 2026 — Selective dashboard restore:** Restored the dashboard styling, sticky-filter appearance, KPI ordering/emphasis, grid rhythm, and ranking-card density that existed before today’s dashboard iterations. The C3 category migration and all non-dashboard work remain intact.
- Retained only the requested KPI comparison copy improvement, which now renders percentage comparisons as `9.3% vs Apr 2025 – Mar 2026` rather than separate `change` and `Compared with` phrases.
- **NOT UI TESTED** per the user’s explicit standing instruction to avoid UI testing during rapid iteration; whitespace validation passed.
-
- **September 9, 2026 — C3 title correction:** Standardized the final C3 title to **`C3 - Fuel and energy-related activities`** across the application, bulk-upload output, reports, dashboards, and configuration controls.
- Re-ran the idempotent C3 migration with a new BSON backup at `/app/.emergent/backups/c3-category-label-20260909T071920Z.json`, updating 23 current emission records, 29 pending uploads, 51 Scope 3 factors, and 1 category definition. No prior live C3 label remains; only source-code compatibility aliases retain it for externally imported legacy input.
- **VERIFIED:** Migration dry run, apply result, post-migration MongoDB counts, and whitespace check passed. No UI testing was performed per the user’s standing instruction.
-
- **September 9, 2026 — C3 category-title migration:** Renamed C3 to **`C3 Fuel- and energy-related activities`** in the frontend catalogue, Scope 3 Bulk Upload output, dashboards, reporting, and GHG capability settings. The immutable category/formula IDs remain unchanged, so C3 calculations continue to use their existing version bindings.
- Added and executed `backend/scripts/migrate_c3_category_label.py`. After a dry run and automatic BSON backup at `/app/.emergent/backups/c3-category-label-20260909T071532Z.json`, it migrated 22 current emission records, 29 pending bulk-upload records, 51 Scope 3 emission-factor records, and the active C3 category definition. Verification confirmed no legacy live values remain.
- `emission_history` was deliberately not modified so calculation/audit history remains immutable; the legacy label is retained only as a backwards-compatible registry alias.
- **VERIFIED:** Migration dry run, apply result, post-migration MongoDB counts, and whitespace check passed. No UI testing was performed per the user’s standing instruction.
-
- **September 9, 2026 — GHG dashboard compactness follow-up:** Added deliberate inner horizontal padding to the full-width sticky filter header, retaining its edge-to-edge surface while giving the title and controls comfortable breathing room. Facility, Scope 3 hotspot, and emission-category rankings now show the top five entries only.
- **NOT TESTED** per the user’s explicit standing instruction to avoid UI testing during rapid iteration.
-
- **September 9, 2026 — GHG ranking rhythm refinement:** Reduced the label-to-bar spacing within each facility, Scope 3 hotspot, and emission-category ranking entry, while increasing the separation between distinct ranking entries.
- **NOT TESTED** per the user’s explicit standing instruction to avoid UI testing during rapid iteration.
-
- **September 9, 2026 — Dashboard P0 follow-up:** KPI cards now use a rounder `rounded-xl` frame. The shared sticky filter header exactly matches the dashboard content wrapper on mobile and desktop, using calculated full-width sizing so no left/right inset remains.
- Added an explicit 24px space after the sticky filter before dashboard KPI rows. Increased the vertical separation between items in Facility-wise Emissions, Scope 3 Emission Hotspots, and Emission Categories.
- KPI deltas now compact the percentage and reporting period into one line, for example `131.9% vs Apr 2025 – Mar 2026`, removing the redundant `change` and `Compared with` copy.
- **NOT TESTED** per the user’s explicit standing instruction to avoid UI testing during rapid iteration.
-
- **September 9, 2026 — Dashboard P0 visual-system pass:** Rebuilt the shared sticky filter header as a full-width, solid-white sticky surface with restrained border and shadow separation. Dashboard rows now use a consistent 24px separation, while internal grids use 16px gaps.
- Made **Net Emissions** the first and featured KPI across the dedicated GHG dashboard and the Executive ESG dashboard. It has a stronger, calm emerald emphasis, larger tabular metric treatment, and remains full-width across the compact two-column mobile KPI grid.
- Unified dashboard cards around white surfaces, stone 1px borders, 8px radii, restrained shadows, and focused hover transitions. Headings now use the existing Manrope display face; supporting text and numerical metrics have clearer weights and tabular alignment without adding decorative treatments.
- Improved GHG facility, Scope 3 hotspot, and category ranking scans with fixed-width `01`–`06` rank labels and consistent right-aligned value/share metadata.
- **NOT TESTED** per the user’s explicit standing instruction to avoid UI testing during rapid iteration.
-
- **September 9, 2026 — GHG dashboard trust and clarity pass:** Fixed the `Reset to Default` runtime error by consistently passing `getCurrentFinancialYear` into the shared filter component. Reset now clears facility selection and restores the current financial year.
- Dashboard statistics now return an explicit `record_count`, allowing the frontend to distinguish **confirmed zero emissions** (submitted records total 0 tCO₂e), **no reported data**, **no results for the selected filters**, and **load errors**. These states are shown as distinct, user-facing dashboard notices; filter-empty and error notices offer Reset or Retry actions.
- KPI comparison calculations now request the exact equivalent prior-year date window and preserve repeated facility filters. KPI wording shows the actual prior comparison window instead of the ambiguous “vs previous period.” A dashboard-level line identifies both selected and equivalent prior-year windows.
- Replaced GHG dashboard decorative graph-shaped KPI arrows with meaningful inline change indicators. Scope 3 hotspots, facility emissions, and emission categories now use ranked horizontal bars with full readable labels, emissions values, and percentage shares.
- Target cards now state whether a target applies organization-wide or to named/selected facilities, and show the target reporting period where available. The mobile GHG KPI layout is now a compact two-column grid so the emissions analysis appears earlier.
- **Build verification completed before the later user instruction to stop testing:** frontend production build and Python compilation passed. No post-change browser/API testing was performed after the user said “dont test.”
- **September 9, 2026 — Follow-up copy refinement:** Removed the redundant selected/equivalent-window line below the KPI cards. Unavailable comparison copy now reads `Prior reporting period: [window] (no reported data)`.
- **September 9, 2026 — Remaining dashboard design pass:** Simplified the shared GHG/ESG dashboard header and card surfaces by removing decorative icons, gradient/colored stripes, excessive rounding, and heavy shadow treatments. The filter panel is now denser and accessible, with a semantic facility button and no redundant filter-summary strip.
- Added consistent, specific empty states for GHG trend, scope breakdown, facility ranking, category ranking, Scope 3 hotspots, and geographic heatmap. Reduced GHG chart height and card padding to improve mobile information density while preserving hierarchy.
- **NOT TESTED** per the user’s explicit instruction.
- **September 9, 2026 — Sticky filter refinement:** Added a subtle emerald background and larger responsive horizontal padding to the shared GHG/ESG filter header. Increased control spacing and added a visible gap before the Show/Hide filters control.
- **NOT TESTED** per the user’s explicit instruction.
- **September 9, 2026 — Annual trend allocation and KPI compacting:** Dashboard statistics now distribute eligible FY/CY yearly emission records evenly across each month in the selected reporting window for the emissions trend. The trend subtitle discloses this allocation whenever it occurs; selected-window totals remain governed by the existing proration rules.
- Reduced GHG inter-row spacing from 32px to 20px. KPI values now render with their unit on one baseline, and percentage change plus prior-period comparison share one responsive metadata line.
- **NOT TESTED** per the user’s explicit instruction.
- **September 9, 2026 — GHG row-spacing correction:** Replaced the parent spacing utility with explicit `mt-8` margins on the trend, ranking, and base-year/heatmap row containers, ensuring a visible 32px separation between every dashboard row.
- **NOT TESTED** per the user’s explicit instruction.
- **September 9, 2026 — GHG density refinement:** Increased spacing between GHG dashboard rows. Removed duplicate selected-target names from target cards; organization-wide applicability is no longer shown, while facility applicability is a compact header badge when relevant. Scope 3, facility, and category rankings now show each emissions value and percentage share on one line.
- **NOT TESTED** per the user’s explicit instruction.

## Previous Change — September 8, 2026
- Corrected Scope 3 Bulk Upload calculation provenance for spend-currency properties. Database-resolved Standard Exchange Rate, Inflation Rate, and Purchase Power Value now carry the configured currency-record source (for example, `RBI (2025)`) into the calculation audit instead of appearing as `User Specified`.
- Spreadsheet-supplied currency values continue to display `User Specified`. Calculation formulas and resolved values were not changed. Manual and Bulk Upload paths now share the same currency-source label formatter.
- Testing was not performed for this provenance adjustment, per explicit user instruction.
- Repaired immutable Scope 3 Spend Basis catalog versioning across **C1-C15**. Each active decision tree now has a matching immutable snapshot containing both `standard` and `ppp_inflation` currency branches.
- Corrected the cross-formula version collision: PPP retains its valid version `c837d08d-584d-4c8a-a0f8-1eedd2e50ee6`, while Standard Currency Conversion now owns distinct version `208c20e3-4305-4081-9d2e-716b7037f953`.
- Published and activated a new decision-tree version for every C1-C15 category. New manual and Bulk Upload calculations now resolve and persist these active tree/formula version IDs.
- Added catalog integrity guards that reject missing formulas and formula-version IDs owned by a different formula before a decision-tree version can be published or executed.
- Replaced the original direct-update Scope 3 currency seed path with the canonical versioned publication flow, preventing current trees from diverging from immutable snapshots again.
- Added an idempotent audit/repair command at `backend/scripts/repair_scope3_spend_currency_versioning.py`; the applied migration created a pre-change backup under `/app/.emergent/backups/`.
- **Automatic behavior clarified:** Decision Tree Editor updates use `PUT /api/super-admin/calc-engine/decision-trees/{tree_id}`. If tree content changes, the backend automatically archives/deactivates the prior snapshot, creates and activates a new immutable version, rebuilds its formula-version map, and new calculations use that version. Saving identical tree content does not create another version. Formula definition changes likewise create a new formula version and republish linked active tree versions.
- **VERIFIED BEFORE USER STOPPED FURTHER TESTING:** 20 focused backend tests passed with 2 existing skips; all C1-C15 current and pinned form-config responses returned the correct two currency branches and distinct formula versions; a live Standard calculation resolved the newly active tree/formula IDs; the catalog repair was idempotent; application smoke check loaded without horizontal overflow. No testing agent run was continued per user request.
- Scope 3 Spend Basis Bulk Upload now treats **Standard Currency Conversion** as the numeric exchange-rate column. The separate **Exchange Rate (Override)** column was removed from newly generated templates; its old header remains accepted as an import alias.
- A supplied Standard Currency Conversion value is validated, used as the standard-rate override, and persisted in `dynamic_field_values.exchange_rate`. A blank value continues to use the configured effective standard rate for the reporting period.
- Standard-method records always include `dynamic_field_values.exchange_rate`: supplied values persist with `is_override: true`; blank cells persist as `value: null`, `is_override: false`, with an empty unit and justification.
- Standard conversion values cannot be combined with Purchase Power Value or Inflation Rate in the same row.
- Scope 3 Bulk Upload now extracts each successful calculation trace into `ce_calculation_audit_logs` when records are saved, linking it by emission-record ID so the Edit form can display **Calculation Details** like manual records.
- Calculation-audit persistence is covered in both immediate-save and validate-then-confirm save paths, with compensating cleanup if audit persistence fails. No historical backfill was added because the user confirmed there are no existing affected records.
- **VERIFIED BEFORE USER STOPPED FURTHER TESTING:** Python compilation passed; 21 focused backend regression tests passed; the live generated template check passed. Full end-to-end upload/edit browser verification was not continued per user instruction.
- Restored compatibility for prior Scope 3 workbooks: both **Spent Amount** and **Spent Amount (INR)** now map to the required Spend Basis value, preventing false missing-value errors.
- Bulk Upload now rejects future Reporting Month, CY Reporting Year, and FY Reporting Year values across Scope 1, Scope 2, and Scope 3. The current calendar month/current financial year remain valid.
- Scope 3 Spend Basis Bulk Upload now infers Standard Currency Conversion when only Spent Amount is supplied. Providing Purchase Power Value and/or Inflation Rate selects PPP and Inflation Rate, and each supplied value is retained as an override.
- The Excel column is **Standard Currency Conversion**; the legacy **Currency Conversion Method** header remains accepted when importing existing workbooks. Standard-rate overrides use **Exchange Rate (Override)**.
- **NOT TESTED:** Per the user’s standing instruction.

## Previous Change — September 8, 2026
- Scope 1 Bulk Upload now stores Carbon Content, Oxidation Factor, and Quantity Basis EF as standard required calculation inputs, matching manual entry, without adding `is_override: true`.
- Genuine override fields such as Calorific Value and Density retain their override metadata.
- Carbon Content/Oxidation Factor regressions passed 2/2 before the user requested no further testing; EF Quantity was not tested per that instruction.

## Previous Change — September 7, 2026
- Bulk-uploaded Scope 1 records now persist the derived `calculation_methodology` in `dynamic_field_values`, matching manual emission entry and edit payloads.
- **VERIFIED:** Processor compiles and the dynamic-field persistence path is present.

## Previous Change — September 7, 2026
- Per user confirmation, permanently deleted all 14 Scope 1 emission records for ORG1 (`9067d872-8a3a-4ed9-8494-e3ef04952f7c`), plus 14 directly linked emission-history rows and 14 calculation-audit rows.
- **VERIFIED:** No matching Scope 1 records remain for ORG1. Follow-ups on organization-type conversion and duplicate-email organization checks are deferred.

## Previous Change — September 7, 2026
- Bulk-upload reporting-month parsing now removes harmless whitespace around hyphens, accepting values such as `2026 - 06` and normalizing them to `2026-06` across Scope 1, Scope 2, and Scope 3.
- **VERIFIED:** Parser accepts spaced and standard month formats while rejecting invalid months.

## Previous Change — September 7, 2026
- Removed the Assessment module coverage filter; the chart now consistently shows all configured modules.
- Increased vertical separation between the Attributed emissions by scope `Total` caption and the center value to prevent overlap.
- **NOT TESTED:** Per the user’s explicit instruction.

## Previous Change — September 7, 2026
- Replaced custom donut-center numeric text with native Recharts labels so the ESG assessed-supplier count reliably renders.
- Updated the Attributed emissions by scope center value to calculate and show **Scope 1 + Scope 2** attributed emissions with the `tCO₂e` unit.
- **NOT TESTED:** Per the user’s explicit instruction.

## Previous Change — September 7, 2026
- Added the total attributed-emissions value and `tCO₂e` unit to the center of the Attributed emissions by scope donut, and removed its segment spacing.
- **NOT TESTED:** Per the user’s explicit instruction.

## Previous Change — September 7, 2026
- Corrected the ESG score-distribution donut center label so the assessed supplier count renders visibly above the `suppliers assessed` caption.
- **NOT TESTED:** Per the user’s explicit instruction.

## Previous Change — September 7, 2026
- Moved Supplier ESG score comparison and Scope 1 category comparison legends below their charts; their bar spacing now adapts to supplier count and remains within the available chart width for large datasets.
- Added the total assessed-supplier count to the center of the ESG score-distribution donut and removed the intentional color-segment gaps.
- Reduced Supplier Assessment ranking KPI-card height while preserving their content hierarchy.
- **NOT TESTED:** Per the user’s explicit instruction.

## Previous Change — September 7, 2026
- Removed the leading colon from hover tooltips in the Attributed emissions by scope and ESG score distribution donut charts.
- **NOT TESTED:** Per the user’s prior explicit instruction.

## Previous Change — September 7, 2026
- Refined Supplier Assessment Ranking → GHG charts: removed the redundant Attributed emissions legend and added `tCO₂e` Y-axis labels to emissions comparison, Scope 1 category, and month-on-month charts.
- Added a dynamic emissions-intensity Y-axis unit, such as `tCO₂e/INR`, with a neutral `tCO₂e/currency` label if multiple currencies are present.
- **NOT TESTED:** Per the user’s explicit instruction.

## Previous Change — September 7, 2026
- Softened the Excellent, Good, and Overdue follow-up status-card colors in Supplier Assessment ranking and removed their decorative line artwork.
- **NOT TESTED:** Per the user’s explicit instruction.

## Previous Change — September 7, 2026
- Updated Supplier Assessment ranking KPI cards so each icon sits to the left of its heading, including **Suppliers assessed**.
- **NOT TESTED:** Per the user’s explicit instruction.

## Previous Change — September 7, 2026
- Replaced login-page user-facing authentication wording with **Sign in**, including loading, success, and fallback error messages.
- **VERIFIED:** Live login screen renders the primary **Sign in** button correctly.

## Previous Change — September 7, 2026
- Polished the login page with a balanced pale-green-to-blue form-panel gradient, softened white form card, refined input focus/hover states, and a more tactile sign-in button.
- Added an accessible Show/Hide Password control, preserving the existing sign-in behavior and all login routes.
- Centered and clarified the account-recovery/contact actions beneath a subtle divider.
- **VERIFIED:** Desktop and 390px mobile views render without horizontal overflow; the password visibility control changes input state correctly.

## Previous Change — September 7, 2026
- Replaced the login-page background with the supplied “Platform for Smarter Sustainability Management” visual. The new PNG is stored in the configured Cloudflare R2 software-images bucket, displayed as the left-side login visual on desktop, and stacked above the form on mobile.
- Deleted the previous `images/login-background.webp` R2 object. No corresponding legacy database metadata record existed in either `software_assets` or `uploaded_files` (both were confirmed empty and cleared).
- Moved the sign-in form to the right-hand panel on desktop while preserving a responsive, no-horizontal-overflow mobile layout.
- **VERIFIED:** R2 new-object existence, R2 old-object removal, software asset URL endpoint, frontend lint, and desktop/mobile browser rendering all passed.

## Previous Change — September 7, 2026
- Repaired the GHG geographic heatmap basemap by replacing the Carto layer that displayed an API-key watermark with OpenStreetMap tiles and visible attribution. The heat overlay remains driven by filtered, facility-level emissions data; it is not static.
- Removed the Leaflet product label from the heatmap footer while retaining the required OpenStreetMap contributors credit.
- The GHG dashboard now explicitly requests only active GHG targets, so archived targets cannot appear in its Reduction Target KPI.
- Added horizontal overflow containment to the GHG dashboard root; mobile document width is verified to match the 390px viewport.
- Rebuilt GHG PDF report content to render native scope and monthly-trend charts, facility-wise emissions, Scope 3 category emissions (value, share, and records), and current-versus-prior-financial-year comparisons from the active dashboard payload.
- Added active GHG target progress (current value, target value, and reported completion percentage) to the PDF. Added a Base Year vs Current FY chart and table only when configured base-year records exist.
- **NOT TESTED** per the user’s explicit instruction.
- Replaced the standalone no-target placeholder with the established Reduction Target KPI card, including its Add Emission Reduction Targets action.
- Corrected the GHG dashboard sticky header's mobile-only horizontal overflow.
- **VERIFIED:** GHG dashboard heat layer and India/Global controls render correctly; OpenStreetMap tile URLs were confirmed, the no-target KPI state was browser-verified, mobile overflow was empty, and `yarn lint` passed.

## Previous Change — September 7, 2026
- Standardized Facility form vertical spacing and responsive field-grid gaps for consistent row-to-row rhythm.
- **NOT TESTED** per the user’s standing instruction.

## Previous Change — September 7, 2026
- Updated Facility editing: the equity-share panel and display badge now use neutral styling, and responsible-person fields share one responsive row.
- **NOT TESTED** per the user’s standing instruction.

## Earlier Change — September 7, 2026
- Hid the otherwise empty Organization edit card for Production and Revenue tabs.
- Restored all five available reporting years so administrators can enter data for an older FY/CY directly.
- **NOT TESTED** per the user’s standing instruction.

## Prior Change — September 7, 2026
- Production and Revenue editing introduced a dedicated bottom action area and mutually exclusive monthly/yearly entry modes. The temporary saved-years-only filter was superseded by the five-year view above.
- Their Cancel and Save Changes controls now appear after the reporting-year entries; selecting Monthly or Yearly clears the inactive data mode and the API persists only the selected mode.
- **NOT TESTED** per the user’s standing instruction.

## Previous Organization Change — September 7, 2026
- Restored the live No. of Facilities count in the saved Organization summary.
- **NOT TESTED** per the user’s standing instruction.

## Earlier Organization Change — September 7, 2026
- Arranged Person Responsible, Designation, and Contact Details as one responsive editing row.
- Moved Reporting Frequency into GHG Details; Reporting Year Type remains in Basic Details.
- Restyled the equity-share disclaimer and saved Organizational Boundaries content with neutral treatments, and paired Boundaries with Uncertainty Assessment on wide screens.
- **NOT TESTED** per the user’s standing instruction.

## Prior Organization Change — September 7, 2026
- Simplified the Organization summary to organization logo and name only.
- Combined street, city, state, country, and postal code into one corporate-address line without timezone.
- Replaced the Production/Revenue year dropdown with five simultaneous reporting-year editors, each supporting monthly or yearly data and an independent save action.
- **NOT TESTED** per the user’s explicit instruction.

## Current Priorities
- **C7 employee-period evidence, including edit — latest:** C7 evidence is now attached to the exact employee and reporting period. The monthly C7 ledger supplies an **Evidence** control on every employee-month row; yearly C7 provides the same control inside each employee’s annual box. Creation and edit use the existing authorized storage path, preserve nested `evidences` per employee/month or employee/year, and display saved files with count, view, and remove controls in that same employee-period location. Edit hydration now maps existing C7 row attachments from persisted records into the matching row; newly added files are marked transient only in the browser, and that marker is stripped before saving. Removing a persisted file queues storage deletion until after the update succeeds. Older top-level C7 attachments remain visible under **Legacy Record Evidence** rather than being reassigned ambiguously. Fixed the resulting edit-screen initialization error by using the already-initialized dirty-state setter in C7 evidence callbacks, rather than referencing the later `markFormDirty` callback. **NOT TESTED** per the user’s explicit instruction.
- **C7 evidence download — latest:** Added a download control beside every saved C7 employee-period attachment in the edit form. It reuses the app’s existing evidence download handler and retains per-file test IDs. **NOT TESTED** per the user’s explicit instruction.
- **C8 floor share validation — latest:** C8 edit submission now blocks saving if **Floor Area Share** allocation is selected and its Floor Share % is blank, invalid, or zero. The validation recognizes the configured field name and established fallback key variants, including object-shaped values. **NOT TESTED** per the user’s explicit instruction.
- **C8 unitless floor share repair — latest:** Corrected the edit live-calculation input, edit-save serializer, and persisted calculation-audit payload so fields configured with `unit_source = none` remain unitless. This prevents Floor Area Share from inheriting `kg`, eliminates the misleading `kg → unitless` audit conversion, and keeps saved values unit-free. General mandatory-field validation and stale live-calculation-state behavior were intentionally not changed in this increment, per the user’s direction. **NOT TESTED** per the user’s explicit instruction.
- **Mandatory input validation and stale edit summary repair — latest:** Scope 3 edit validation now rejects every configured required input that is blank or invalid, including hydrated object-shaped values. The edit live-calculation path detects missing required fields (and C8 Floor Share % under Floor Area Share allocation), clears prior results, and shows a specific in-form error rather than displaying a stale saved calculation. **NOT TESTED** per the user’s explicit instruction.
- **Supplier-method audit normalization display — latest:** Calculation Details now suppresses conversion entries explicitly marked as `no conversion (missing unit specification)`. Supplier-method quantities therefore remain displayed as their entered unit (for example `212 t`) without the misleading identity arrow to `unitless`; calculation behavior and immutable audit data are unchanged. **NOT TESTED** per the user’s explicit instruction.
- **Yearly oxidation factor parity — latest:** The yearly dynamic-field renderer now uses the same pure-count test as the working monthly renderer, so unitless ratio fields such as Oxidation Factor accept decimals rather than whole numbers only. Configured yearly defaults (including Oxidation Factor `1`) are now written to yearly state, aligning what the user sees with required-field validation and the save payload. Custom-fuel yearly Carbon Composition now also materializes Oxidation Factor `1` in annual state; the shared field preserves a valid `0` input rather than visually clearing it. **NOT TESTED** per the user’s explicit instruction.
- **Yearly custom-fuel density de-duplication — latest:** Removed the overlapping parent runtime Density field for yearly custom-fuel entries. The methodology-specific `CustomFuelMonthFields` component is now the sole density owner, so Quantity Used, Carbon Content, Oxidation Factor, and Density participate in the same responsive annual grid row without duplicate inputs or conflicting display defaults. **NOT TESTED** per the user’s explicit instruction.
- **Custom-fuel edit methodology validation repair — latest:** The Scope 1 edit save caller now passes the active methodology into validation, and validation/payload serialization resolve that method through one shared helper before considering a persisted hidden value. Custom Fuel also bypasses the generic configured-field and override loops, so only the active method is validated: EF/CV for Heat Basis, EF for Quantity Basis, Carbon Content/Oxidation Factor for Carbon Composition, or GWP for Fugitive. This applies to monthly and yearly Edit. **NOT TESTED** per the user’s explicit instruction.
- **C7 optional-field visibility and supplier persistence — latest:** C7 Edit now renders the already-hydrated Process Name, Process Description, Person Responsible, Designation, and Contact fields inside Optional fields instead of hiding them behind non-C7 conditions. Monthly and yearly C7 creation now carry `record_source`, `supplier_name`, and `supplier_code` through the create orchestration, dedicated C7 contracts, MongoDB create/update paths, response contracts, and monthly history tracking. Records created before this correction cannot recover supplier values that the old C7 endpoint discarded; users must re-enter them once. **NOT TESTED** per the user’s standing instruction; all modified paths were source-reviewed only.
- **C7 edit payload serialization repair — latest:** The final C7 update no longer sends flat edit-display primitives such as `km_travelled: ""` or `km_travelled_unit: "km"` as record-level `dynamic_field_values`. Employee commuting calculation inputs remain under each employee/month, while only pre-existing schema-valid record-level dynamic dictionaries are preserved for legacy compatibility. The shared update route now reads the C7 total from `outputs.co2e.value`, ensuring the newly calculated employee total is persisted without creating CO₂/CH₄/N₂O defaults. Focused frontend tests (6) and existing live C7 backend tests (2) passed before the user instructed that no further testing be performed; no testing continued afterward.
- **Emission update validation message fix — latest:** Edit-save failures now surface FastAPI string, object, and Pydantic validation-array details instead of replacing them with the generic “Failed to update emissions” message. Pydantic’s technical `Value error,` prefix is removed, duplicate messages are collapsed, and the generic fallback remains for responses without usable details. **VERIFIED:** 13 focused frontend tests and 10 C6 backend validation tests passed.
- **C7 create/edit completion — latest:** C7 monthly Save now counts months containing entered employee inputs, not only pre-calculated totals. C7 creation includes an Evidence Document upload in Step 4 and saves its URL on created C7 entries. C7 Edit now persists dynamic optional values and evidence URLs alongside its existing notes/process fields. The shared update endpoint preserves C7’s employee-derived CO₂e total without creating meaningless CO₂/CH₄/N₂O zero values or history changes. **NOT TESTED** per the user’s standing instruction.
- **C6 edit build-path repair — latest:** Corrected the `Scope3FlatEdit` reporting-period utility import to the shared GHG module path, resolving the frontend “Module not found” compile error introduced with C6 monthly limits. **NOT TESTED** per the user’s instruction; file-path resolution was source-checked.
- **C6 monthly travel-count limits — latest:** Monthly C6 No. of Days Travelled and No. of Nights Stayed now use the calendar-month maximum in add-field entry, add-form final validation, edit-field entry, edit save validation, and the API contract. The edit guard recognizes stored `YYYY-MM-DD`/`YYYY-MM` periods, `c6`/`business_travel` category identities, and canonical dynamic `{ value, unit }` field objects. The supported night field keys are `nights_stayed`, `number_of_nights`, and `qty_nights`; February respects leap years. **NOT TESTED** per the user’s instruction.
- **C6 yearly travel-count limits — latest:** Yearly C6 Edit now enforces the applicable annual maximum while typing and on Save for No. of Days Travelled and all supported nights fields (`nights_stayed`, `number_of_nights`, `qty_nights`). Calendar years use their own leap-year limit; financial years use the year containing February. The shared `EmissionRecordCreate` contract applies the same 365/366-day validation to both create and update requests, preventing an API bypass. Added boundary coverage for CY and FY leap/non-leap cases. **NOT TESTED** per the user’s standing instruction.
- **Emission Version History facility names — latest:** The frontend now passes the already loaded facilities list into Emission Version History and resolves `facility_id` old/new values to their facility names. Stored audit records remain unchanged; an ID is shown only if its facility is unavailable to the current frontend data. **NOT TESTED** per the user’s standing instruction.
- **Fuel Type / Activity dropdown scrolling — latest:** Updated the shared searchable selector with bounded menu/list heights, an explicit vertical options scroll area, touch pan support, and contained wheel/touch events. This applies to both Fuel Type and Activity selectors in create and edit flows. **NOT TESTED** per the user’s standing instruction.
- **Custom Fuel edit alignment — latest:** Removed the redundant “Fuel Name * / Custom fuel” caption from the Custom Fuel Edit field while retaining the required fuel-name input and Custom Fuel toggle. **NOT TESTED** per the user’s standing instruction.
- **Custom Fugitive save validation — latest:** Scope 1 Edit now passes the category code into validation. Custom Fugitive Fuel bypasses Heat/Quantity/Carbon methodology checks and requires only Quantity plus GWP Fugitives; it no longer incorrectly asks for an Emission Factor. **NOT TESTED** per the user’s standing instruction.
- **Custom Fuel density cleanup — latest:** Density is now included in Custom Fuel calculation inputs and overrides only when the current Quantity unit and CV/EF basis have a mass/volume mismatch. When a unit change removes that requirement, the form clears retained Density and Density Unit state. This prevents hidden stale density from being submitted for aligned pairs such as `kL` with `TJ/kL`. **NOT TESTED** per the user’s standing instruction.
- **Custom Fuel EF backend authority — latest:** Custom Fuel now submits the exact EF value and selected unit to the Calc Engine instead of applying client-side tCO₂/MJ normalization. The engine derives labelled emissions-factor components (for example `tCO2/MJ`) and uses the configured `t → kg` and `MJ → TJ` Super Admin conversions, yielding the correct `0.2 tCO₂/MJ → 200,000,000 kgCO₂/TJ` result. No historical-record handling is required because the user confirmed no existing affected data. **NOT TESTED** per the user’s standing instruction.
- **Calculation Details small-value precision — latest:** Normalized values below `0.000001` retain sufficient decimal precision (up to 12 places), so `0.000500 TJ/t → 0.0000005 TJ/kg` is displayed without rounding to zero. **NOT TESTED** per the user’s standing instruction.
- **Mixed density conversion chains — latest:** Calc Engine compound normalization now supports mixed static and property-based paths such as `TJ/kL → TJ/kg`, resolving the denominator through `kl → L → kg`. The `L → kg` edge uses a submitted density override when present and otherwise falls back to the selected fuel’s database density; density units are normalized before applying the factor. Formula-property normalization now retains `user_overrides`, and chained audit output preserves both conversion edges and density provenance. Direct property conversions keep their established execution path, and recursive chain resolution is guarded when density is unavailable. **NOT TESTED** per the user’s standing instruction.
- **Custom Fuel `kl` canonicalization — latest:** Hardcoded Custom Fuel Quantity, quantity-basis EF, and generated density options use lowercase `kl` (`kgCO2/kl` and `kg/kl`). Calorific Value remains catalog-aligned as `TJ/kL`/`MJ/kL`. Create, Edit, calculation payloads, persistence, and legacy hydration normalize each field to its required casing. Calc Engine retains a strict legacy compound-key alias without broad case-insensitive matching. **NOT TESTED** per the user’s standing instruction.
- **Currency applicability periods — latest:** Super Admin Currency Conversion now supports explicit Calendar Year, Financial Year, and Specific Month applicability. New records store a structured period type/key plus FY start/end years while legacy year/month rows are presented and resolved as CY/month records without a destructive migration. Yearly FY calculations resolve exact FY first, then ending CY, previous FY, and previous CY; yearly CY resolves exact CY then previous CY; monthly entries resolve the exact month then that calendar year’s annual rate. Resolution metadata and fallback provenance flow through defaults and calculation sources. Missing non-USD PPP or Inflation values now block calculation instead of silently becoming `1.0`; USD remains `1.0`, and user overrides retain priority. Duplicate protection includes legacy PPP rows without an explicit method. **NOT TESTED** per the user’s standing instruction.
- **Calculation Details normalization visibility — latest:** Every newly generated input or resolved-property conversion is now tagged with its originating field in the calculation audit. Calculation Details renders `raw value/unit → normalized value/unit` for each real normalization, rather than only Quantity-to-kg conversions. Older audit logs retain a safe exact value/unit fallback where their historic trace permits matching; immutable history is not rewritten. **NOT TESTED** per the user’s standing instruction.
- **Scope 1 Edit safeguards — latest:** Edit submissions now reject missing active required inputs even if an earlier calculation remains visible. Custom Fuel requires the methodology-specific values: Quantity, EF/CV for Heat Basis, EF for Quantity Basis, and Carbon Content plus Oxidation Factor for Carbon Composition.
- Scope 1 Edit Oxidation Factor accepts values only from **0 through 1**, rejecting negative values and values over 1 while typing and on save for both Custom Fuel and configured fields, including mappings configured as optional.
- Custom Fuel Carbon Content and Oxidation Factor now use browser-required controls and server-facing edit validation. Edit payloads are built only from fields active in the current form, preventing stale values from a former fuel or methodology from being resubmitted.
- Switching a configured Density override off restores the selected fuel's default density for display and removes the custom value/justification from the edit state; switching it on begins a fresh custom override. **NOT TESTED** per the user’s standing instruction.
- **Facilities form cleanup — September 8, 2026:** Removed the “Auto-fill facility details from organization (editable)” helper text while retaining the existing Same as Organization checkbox behavior.
- **Supplier Assessment list spacing — September 8, 2026:** Increased the Detailed Ranking card radius to 12px. Published Documents and Training admin list rows now use a consistent 24px gap, replacing their previous tight 16px stack rhythm.
- **Irreversible Org1 data cleanup — September 8, 2026:** At explicit user confirmation, removed 10,889 scoped database documents across 78 collections, 13 Org1-linked supplier organization profiles, 13 supplier user accounts, and 90 referenced R2 objects. GHG, Base Year, Sinks, all relevant histories/audits, ESG questionnaire/assessment data, supplier documents/training/submissions, uploads, and operational records were included. Verification found zero remaining Org1/supplier-scoped documents. The Org1 organization profile and its 9 internal accounts were retained as directed.
- **Supplier Emissions summary cleanup — September 8, 2026:** Removed the FY/reporting-period tag from the Supplier Attributed Emissions Summary header and removed its unused frontend prop flow.
- **Supplier Ranking tab polish — September 8, 2026:** Extended the Overview’s `rounded-xl` visual treatment to every ESG Analysis and Emissions tab surface, including metric cards, charts, summaries, legends, risk/comparison, and nested analytic panels.
- **Supplier Ranking polish — September 8, 2026:** Removed the informational `i` icon from the left of the Detailed Rankings supplier search control. Standardized Overview surface corners to `rounded-xl`, including summary bands, charts, risk matrix, progress panels, and their small supporting surfaces.
- **Base Year card density refinement — September 8, 2026:** Increased label-to-detail spacing within every Scope card to 20px, using the card height intentionally rather than leaving visual dead space. History and Change Base Year icons now sit 12px apart with consistent right/top insets across organization and facility cards.
- **Base Year Scope-card spacing — September 8, 2026:** Added a deliberate 12px visual separation between the Scope label and its single Base Year/value row. Removed the remaining `Editable` tags from both Base Year setup emissions and edit emissions headers.
- **Base Year Scope-card refinement — September 8, 2026:** Scope-card Base Year and tCO₂e value now share one horizontal row. Scope 1 & 2 cards display one figure only: Net emissions when Sinks exist, otherwise gross emissions. Removed the unnecessary Editable/View Only badge from the Base Year detail dialog opened from a ledger card.
- **Base Year ledger correctness — September 8, 2026:** Standardized every organization/facility ledger row onto fixed shared grid tracks (Entity / Scope 1 & 2 / Scope 3 / Status), removing content-dependent Scope-card misalignment.
- **Base Year premium ledger refresh — September 8, 2026:** Rebuilt the ledger’s desktop row geometry into responsive grid columns that allocate available width to Scope tiles instead of empty spacers. Organization and facility records now sit on individual rounded surfaces; Scope cards are wider, elevated, rounded panels. The organization tag now appears below its name as `Corporate Base Year`; the facility designation also moves beneath its name.
- **Base Year ledger simplification — September 8, 2026:** Removed all visible organization/facility accordion triggers and disabled the legacy expandable ledger panels. The primary ledger now relies on direct Scope-tile actions for setup/view, Version History, and Change Base Year, including direct history access when a baseline is unconfigured or previously deleted.
- **Base Year ledger actions — September 8, 2026:** Added direct Change Base Year icon actions alongside direct Version History actions on configured ledger Scope tiles. Change access mirrors existing permissions: organization records remain read-only for standard users, and facility records respect edit eligibility. Users no longer need to expand an accordion to begin a Base Year change.
- **Base Year ledger polish — September 8, 2026:** Ledger entity names now wrap safely to two lines with the complete name available on hover. Scope 1 & 2 and Scope 3 tiles display Base Year plus a two-decimal tCO₂e total. Each configured desktop Scope tile now includes a direct version-history icon, avoiding the need to expand the accordion to access audit history.
- **Sinks dialog layout fix — September 8, 2026:** Replaced the Sinks Add/Edit dialog’s stretching grid layout with a local vertical flex layout. Facility, Financial Year, and Data Entry Frequency now begin at a controlled 16px gap below the title rather than being pushed down by a stretched header row.
- **Bug fix — September 8, 2026:** Manual Base Year GHG edits now preserve the existing Base Year Sink snapshot instead of rebuilding it from live Sink data. Sink rows now use a canonical description-first identity, and history comparison treats legacy `Carbon Sink`/`other` labels as the same generic sink. Unchanged Sinks therefore no longer appear as false “removed” and “added” changes.
- **Sinks edit improvement — September 8, 2026:** Sink records can now be reassigned to another facility within the same organization and moved to a different month. Multiple Sink records remain permitted for the same facility/month. The edit form keeps Financial Year and Data Entry Frequency protected, places Facility, Financial Year, and Frequency on one responsive row, and carries existing value/evidence when a monthly record is moved.
- **Bug fix — September 8, 2026:** Sinks create, update, and delete actions now synchronize matching Scope 1 & 2 Base Year records at both facility and organization level when the sink belongs to that Base Year period. The Base Year snapshot, version, net result, and audit timeline update automatically with a linked Sinks reference and old/new removal value.
- **Base Year view polish — September 8, 2026:** Simplified the Base Year read-only dialog by removing the visible Base Year Justification and separate “Total Carbon Sinks” summary. Scope 1 & 2 totals now show gross Total Emissions plus Net Emissions only when configured sink rows exist; the Sinks row remains visible in the data table.
- **Data cleanup — September 8, 2026:** At a later user confirmation, permanently removed the subsequently created Org1 Base Year record and its audit stream: 1 active Base Year record and 2 append-only audit events. Verified zero remaining documents across all Base Year collections for Org1.
- **Bug fix — September 8, 2026:** Automatic Base Year recalculation now preserves configured `Sinks` rows instead of replacing them while rebuilding GHG-log emissions. If an older automatic sync previously removed sink rows, the next recalculation restores them from the most recent Base Year version snapshot. Sinks therefore stay visible and are excluded from false “removed” recalculation differences.
- **Data cleanup — September 8, 2026:** At user request, permanently removed Org1 Base Year data: 6 active Base Year records, 0 append-only audit events, and 14 historical deletion records. Verified zero remaining Base Year records/history documents for organization ID `9067d872-8a3a-4ed9-8494-e3ef04952f7c`.
- **P0 (completed September 8, 2026):** Rebuilt Base Year audit history as append-only events. It now records configuration, base-year changes, manual base-year value edits, automatic recalculations caused by underlying GHG entries, and deletion. Events retain actor, timestamp, written reason where required, before/after totals, category/subcategory deltas, and a link to the originating GHG entry. Base Year deletion now requires a written reason and its history remains accessible after deletion.
- **P0 note:** Existing legacy Base Year `version_history` arrays remain readable as fallback. New activity is stored in `base_year_history_events`; a later P2 migration can normalize historic records into the new event model.
- **P0:** Existing Scope 1 records uploaded before September 8 may retain incorrect Carbon Content, Oxidation Factor, or EF Quantity override metadata; migrate only after explicit approval.
- **P0:** Fix deferred token expiry/session-state mismatch that causes random logouts.
- **P0:** Existing supplier assessment-program revision migration/reassignment flow.
- **P0:** Explicit supplier facility-limit policy and canonical target-system consolidation.
- **P0:** Security hardening: hash password-reset tokens and encrypt approved PII/financial data.
- **P1:** Verify QuestionLedgerDialog `lower_is_better` save mapping; fix Sinks mobile table overflow.
- **P1:** Persist and display Repo Pilot/Internal Data AI chat history through unified conversation sessions.
- **P1:** Complete C8 Floor Area Share Formula Builder variable, input mapping, and Decision Tree configuration; leave Bulk Upload unchanged until separately scoped.
- **P1:** Map ESG/GHG results to reviewable BRSR/GRI suggested responses; add multi-organization membership and onboarding/version-publishing flows.
- **P2:** Design and execute the production legacy-emission migration for records created before calculation versioning. Preserve stored outputs, infer missing Scope 1 methodologies, bind old Scope 3 Spend Basis records to the legacy PPP/Inflation formula where unambiguous, create legacy formula/tree snapshots, report unresolved records for review, and prevent historical recalculation during migration.
- **P2:** Repair GHG cadence-change save state and refactor oversized GHG form components.

## Supporting Documents
- `/app/memory/CHANGELOG.md` — implementation history.
- `/app/memory/ROADMAP.md` — prioritized backlog.
- `/app/memory/test_credentials.md` — testing accounts.
- `/app/test_reports/iteration_18.json` through `iteration_31.json` — relevant historical verification reports.

## Third-Party Integrations
- Cloudflare R2 private object storage — user credentials required.
- Resend email delivery — user credentials required.
- OpenAI/Anthropic through the configured platform integration.