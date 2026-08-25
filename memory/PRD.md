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
