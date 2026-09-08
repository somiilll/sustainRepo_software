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

## Latest Change — September 7, 2026
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
- **P0:** Fix deferred token expiry/session-state mismatch that causes random logouts.
- **P0:** Existing supplier assessment-program revision migration/reassignment flow.
- **P0:** Explicit supplier facility-limit policy and canonical target-system consolidation.
- **P0:** Security hardening: hash password-reset tokens and encrypt approved PII/financial data.
- **P1:** Verify QuestionLedgerDialog `lower_is_better` save mapping; fix Sinks mobile table overflow.
- **P1:** Map ESG/GHG results to reviewable BRSR/GRI suggested responses; add multi-organization membership and onboarding/version-publishing flows.
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