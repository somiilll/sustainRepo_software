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
- **Production Data** contains Production Quantity only; **Revenue Data** contains Turnover / Revenue only. Both show saved reporting years only, offer explicit Current and Previous reporting-year additions, support exactly one entry type (monthly or yearly) per period, and respect the organization calendar/financial reporting year.
- Organization details do not display a last-updated timestamp or Related Modules navigation cards.
- The organization summary displays organization identity and a live No. of Facilities count; country, timezone, reporting-year type, target count, and reporting cadence are omitted.
- The view-mode corporate address is presented as one joined address line without timezone.

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
- Production and Revenue edit views now show only saved years, with explicit actions to add the current or previous reporting year.
- Their Cancel and Save Changes controls now appear after the reporting-year entries; selecting Monthly or Yearly clears the inactive data mode and the API persists only the selected mode.
- **NOT TESTED** per the user’s standing instruction.

## Previous Change — September 7, 2026
- Restored the live No. of Facilities count in the saved Organization summary.
- **NOT TESTED** per the user’s standing instruction.

## Earlier Change — September 7, 2026
- Arranged Person Responsible, Designation, and Contact Details as one responsive editing row.
- Moved Reporting Frequency into GHG Details; Reporting Year Type remains in Basic Details.
- Restyled the equity-share disclaimer and saved Organizational Boundaries content with neutral treatments, and paired Boundaries with Uncertainty Assessment on wide screens.
- **NOT TESTED** per the user’s standing instruction.

## Prior Change — September 7, 2026
- Simplified the Organization summary to organization logo and name only.
- Combined street, city, state, country, and postal code into one corporate-address line without timezone.
- Replaced the Production/Revenue year dropdown with five simultaneous reporting-year editors, each supporting monthly or yearly data and an independent save action.
- **NOT TESTED** per the user’s explicit instruction.

## Current Priorities
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