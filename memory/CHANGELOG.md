# SustainRepo Changelog

## May 27, 2026 — Bug Fixes

### C11 Fugitive Emissions Unit Conversion Fix (Backend)
- Fixed unit conversion not happening for `gas_consumed_per_usage` field in C11 fugitive emissions
- Root cause: When `unit_source: 'fuel'` but `fuel_id` is empty, the backend couldn't find target_base for conversion
- Added fallback logic in `execution.py` to use `scope3_ef_default_unit` from context when fuel lookup fails
- Now correctly converts compound units like `t/year` → `kg/year` (factor: 1000) and `g/year` → `kg/year` (factor: 0.001)

### C11 Fugitive Emissions Unit Initialization & Conversion Fix (Frontend)
- Fixed unit not being initialized for `gas_consumed_per_usage` field when user doesn't click dropdown
- Fixed compound unit not being constructed (e.g., `kg/year`) when base unit is from fuel_database
- Added proper handling for `unit_source: 'scope3_ef'` in input payload building (EmissionEntryForm.js, Emissions.js)
- Now correctly defaults to matched activity's `default_unit` or `allowed_units[0]` from fuel_database
- Fixed Edit Dialog duplicate units dropdown by moving savedUnit inclusion AFTER compound suffix application

### Canvas getImageData Error Fix
- Fixed `IndexSizeError: Failed to execute 'getImageData' on 'CanvasRenderingContext2D': The source width is 0` error
- Added guard in `TreemapChart` component (`SupplierHotspotHeatmap.jsx`) to prevent rendering when width/height is 0 or negative
- This error occurred when the visx `ParentSize` component passed zero dimensions during initial render or when container was hidden

### C11 Edit Dialog Fix (Verified)
- Fixed `products_expected_usage` rendering as dropdown instead of text input
- Fixed `fuel_consumed_per_usage` missing compound suffix (e.g., "kl/year")
- Root cause: Stale `Scope3DynamicFieldsRenderer.jsx` plugin component was overriding correct inline rendering logic
- Fix: Deleted stale component and removed registry overrides

## May 26, 2026 — V2 Approval Workflow + History Flush-on-Approve

### Version-history storage realigned to spec
- **While pending**: history stays embedded in `pending_records.version_history` + `edit_history` (unchanged).
- **On approve (NEW)**: `_flush_pending_history_to_collection` writes one `db.emission_history` doc per entry — edit_history first, then version_history, then the approval entry itself — all keyed by the approved record's id.
- **Approved record fields** `version_history` and `edit_history` are stripped before insert (PENDING_CREATE) / `$unset` on update (PENDING_UPDATE). Single source of truth for history is now `db.emission_history`.
- **Approve delete** also writes a final "deleted" event into `db.emission_history` for auditability before removing the approved record.
- **`GET /emissions/{id}/history`** now reads from `emission_history` collection only; embedded fallback is kept only for legacy records that were approved before this change.
- Admin direct create/update path (no approval) continues to write to `emission_history` as before — unchanged.

### Frontend V2 Schema Wiring (P1)
- Created `/app/frontend/src/modules/ghg/utils/approvalSchema.js` — central V2 schema helpers (`getRequestType`, `getScope`, `getCategory`, `getFacilityId`, `getSnapshot`, `getOriginalSnapshot`, `getEditHistory`, `getRejectionReason`, `getEntityId`, `getApprovalBadge`, `isPending`, `isRejected`). All read flat V2 fields with V1 fallback for legacy records.
- **Rewrote `ViewApprovalDialog.jsx`** — drops V1 `metadata` / `entity_snapshot` / `request_type` references; now reads flat V2 fields via helpers. Shows status badge in title, supports update field-diff view, edit history popover, and delete-confirmation banner.
- Updated `ApprovalTable.jsx` to read scope/category/facility/snapshot/rejection-reason via the new helpers (no more `r?.metadata?.*` chains).
- Updated `ApprovalSection.jsx` to derive `requestType` and `entityId` via helpers (route to scope page uses `original_record_id` for update/delete navigation).
- Updated `EmissionDataGrid.jsx` to use centralized `getApprovalBadge()` instead of inline switch.

### Approval Workflow V2 Backend (P0)
- Fixed broken `intercept_create` signature in `modules/emissions/router.py` (was using V1 args returning bool; now correctly unpacks V2 tuple `(action, pending_record)`).
- Fixed `intercept_update` and `intercept_delete` to set `created_at` on new pending_records.
- Added V2 schema fields to `EmissionRecordResponse`: `original_record_id`, `submitted_by`, `submitted_by_email`, `submitted_by_name`, `submitted_at`, `edit_history`, `version_history`, `version`.
- Backfilled missing `created_at` on legacy pending_records.
- **Verified E2E (13/13 backend tests PASS)**: full CRUD lifecycle (create→pending_create→approved, update→pending_update→approved with version=2 + 3 history entries, delete→pending_delete→approved deletion, reject→rejected_create). Admin bypass + org isolation intact. Dashboard stats unaffected.

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
