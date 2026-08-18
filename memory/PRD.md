# ESG Platform — Product Requirements Document

## Original Problem Statement
Simplify the Add/Edit GHG Emission form to a single-page experience without altering the backend, calculation engine, or core shared GHG configuration architecture. Make sure the UI is simple, clean, modern, and aligned correctly.

## Core Requirements
- Refine monthly data UX to a compact ledger format.
- Optional and override fields aligned inline with correct default values.
- Tighter header-to-content spacing in create emission dialogs.
- "Done" badge / filled months counter only when ALL mandatory fields for a month are populated.
- Remove redundant helper text/labels from Edit Emission form.
- Zero behavioral drift on the backend (golden regression suites must stay green).

## Architecture
- `/app/backend/modules/ghg/` — Core GHG calculations engine (FROZEN).
- `/app/backend/calc_engine/` — Decision-tree calc engine, audit log persistence.
- `/app/backend/tests/golden/` — Golden-record regression fixtures.
- `/app/frontend/src/modules/ghg/config/` — Centralized field-derivation, capabilities, UI state, override schemas.
- `/app/frontend/src/modules/ghg/emissions/shared/hooks/useEmissionSubmit.js` — Create flow submission orchestration.
- `/app/frontend/src/pages/Emissions.js` — Edit flow state management.
- `/app/frontend/src/components/EmissionEditForm.jsx` — Edit form rendering.

## What Has Been Implemented

### Session 1 (Aug 2026)
- Phase 0–5 GHG refactor: safety net, shared config, edit flow unification, capabilities closeout, org config boundary.
- Internal Data AI: retrieval hardening, formatting, comparison, history, auxiliary queries, refactoring.
- BRSR Internal AI repair.

### Session 2 (Current)
- Aligned optional/override field boxes with correct configured/fuel default values in ledger — DONE
- Reduced vertical spacing (header-to-content transitions) in create emission dialogs — DONE
- Fixed monthly "Done" validation to require ALL mandatory fields — DONE
- Removed redundant helper text from Edit Emission form — DONE
- **Fixed Edit form live calculation display for all scopes** — DONE
  - Removed `emissionAuditLog.length > 0` gate so persisted values show on first Edit open
  - Added `audit_log_id` return from calc engine + link endpoint
  - Create flow now links audit logs to emission records after POST

### Regression Status
- Backend golden: 506 passed / 9 skipped
- Frontend: 1226 passed / 63 snapshots

## Known Issues

### P0: Missing Units in GHG Ledger Views
- Units for required inputs are missing in monthly/yearly views.
- **BLOCKED**: Awaiting explicit user permission to fix.
- Root cause: fallback unit logic removed in a prior commit.

### P1: BRSR Section A Stale Form Data on Year Switch
- Stale data bleeds into new year view when reporting year is changed.
- Fix: Reset `formData` to `INITIAL_FORM_DATA` in `BRSRDetailsSection.js` on year change.

### P2: Playwright Locator Timeouts on Shadcn Select
- E2E tests frequently time out on Shadcn Select elements.
- Fix: Adjust timeouts, simplify locators, add `data-testid`.

### P2: Inflation Rate Path for Spend-basis
- 3 conflicting resolution paths identified.
- Fix: Correct `currency_conversion` lookup, ensure `reporting_period` populated.

### Pre-existing: Legacy Backend Test Failures (non-golden)
- Stale expected record counts in `test_calc_engine_phase3.py` and `test_phase_b5_emissions_refactor.py`.

## Prioritized Backlog

### P1 — Upcoming
- Custom Dashboard (consume `kpi_cards`)
- Target Settings UI (`target_direction` config)
- SHA-256 Evidence Integrity on upload
- Supplier/Customer Org Onboarding Wizards
- BRSR Word download (.docx) + "Previous Year Columns"
- MIS Schedule Preview & Report Bookmarks

### P2
- Copy Month Values for Custom Fuel EF/CV
- BRSR year-switch form reset

### P3
- Dashboard Scope 1 & 3 Emissions Deduplication
- Admin Disable UI (enable/disable ESG subcategories)

## 3rd Party Integrations
- Resend (Emails) — requires user API key
- OpenAI GPT 5.6 Sol / text-embedding-3-large (Repo Pilot & Internal AI) — Emergent LLM Key

## Test Credentials
- See `/app/memory/test_credentials.md`
