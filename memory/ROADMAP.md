# ESG Platform Roadmap

## P0 — Immediate

### Supplier Reporting Policy
- Make supplier facility allowance an intentional configurable policy instead of a fallback.
- Add monthly and quarterly supplier GHG submission windows that lock individual periods rather than only annual assignments.
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
- MIS schedule preview and report bookmarks.
- Canonical RBAC overhaul phases 1–5 — paused until explicit user instruction.

## P2 — Later
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