# SustainRepo Changelog

## May 26, 2026 — V2 Approval Workflow Backend Complete

### Approval Workflow V2 (P0 fix)
- Fixed broken `intercept_create` signature in `modules/emissions/router.py` (was using V1 args returning bool; now correctly unpacks V2 tuple `(action, pending_record)`).
- Fixed `intercept_update` and `intercept_delete` to set `created_at` on new pending_records.
- Added V2 schema fields to `EmissionRecordResponse`: `original_record_id`, `submitted_by`, `submitted_by_email`, `submitted_by_name`, `submitted_at`, `edit_history`, `version_history`, `version`.
- Backfilled missing `created_at` on legacy pending_records.
- **Verified E2E (13/13 tests PASS)**: user create → pending_create → admin approve → emission_records (version=1, history populated); user edit → pending_update → admin approve → updated (version=2, history=3 entries); user delete → pending_delete → admin approve → record gone; reject flow → rejected_create status; pending count; admin bypass (direct create/update/delete) all working; org isolation intact.
- Dashboard stats unaffected (4505.84 tCO₂e, all scopes byte-similar).

## May 25, 2026

### Bug Fixes
- **Biogenic Scope3 Access Control**: Fixed filtering of biogenic records with `biogenic_scope_selection='scope3'` for organizations without `scope1_2_3` access
  - Backend: GET /api/emissions now filters these records
  - Backend: GET /api/dashboard/stats excludes them from calculations
  - Frontend: Client-side filter added as backup in Emissions.js
  - Test: 5/5 pytest cases PASS

### Security
- Deleted `/tmp/atlas_sync.py` containing plaintext MongoDB Atlas credentials

## May 26, 2026 (Previous Session)

### Refactoring
- Phase 5 Frontend Refactoring: Extracted Steps 1-4 from EmissionEntryForm.js
- EmissionEntryForm.js reduced from 6056 to 4479 lines (~26% reduction)

## Feb 2026 Sessions

### Backend Modularization (B1-B11)
- server.py: 11290 → 3409 lines (−69.8% reduction)
- Extracted domains: auth, users, organizations, facilities, sinks, emissions, dashboards, reports, superadmin
- Added WebSocket live dashboard cockpit
- Added event bus for real-time updates

### Frontend Refactoring
- EmissionEntryForm.js: 4120 → 2792 lines (−32.2% reduction)
- Emissions.js modularization: E1+E2+E3 complete (−312 lines)
- Dashboard modularization: 1481 → 33 lines
- Bulk Upload modularization: 665 → 143 lines
