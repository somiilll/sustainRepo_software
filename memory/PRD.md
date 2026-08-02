# ESG Platform - Product Requirements Document

## Original Problem Statement
Complete the Materiality Assessment UI, design premium ESG Dashboards, fix analytics mapping bugs, build missing UI, redesign the Assignment dialog into a step-by-step wizard, implement BRSR/GRI comprehensive questionnaire approval workflows.

## Current Session Focus
Unify database architecture to use only 1 collection (organization_esg_responses) with question-level documents. Ensure GRI and BRSR have separate approval panel components in the Approver Queue. Fix various bugs related to status display, badge rendering, and approval workflow.

## Architecture Decisions

### Database Architecture (UNIFIED — FLAT STORAGE)
- **Single Collection**: `organization_esg_responses` 
- **Document Structure**: FLAT — one document per question_key (no nesting/sub_responses)
```javascript
{
  org_id: "uuid",
  question_key: "gri_101_2_a_i",  // Exact key as sent by frontend
  framework: "GRI",
  reporting_year: "FY 2026-2027",
  section: "environment",
  value: "...",
  status: "saved",
  approval_status: "approved",
  ...
}
```
- **No `_split_question_key`** — every key gets its own document
- **Legacy nested `sub_responses` format** still readable for backward compat

### Approval Queue Architecture
- **Two data sources merged**:
  1. `/api/esg-questionnaire/submissions/pending` - Old system (esg_response_submissions)
  2. `/api/approval-workflows/requests` - New unified system (approval_requests)
- **Deduplication**: By question_key for esg_response items, new system takes precedence
- **Panel Routing**:
  - BRSR questions → BRSRApprovalPanel (amber gradient)
  - GRI questions → GRIApprovalPanel (emerald gradient)

## Completed Work (Previous Session)

### Backend Fixes
1. ✅ Created `_save_to_unified_collection` helper method for consistent saves
2. ✅ Fixed `save_gri_response` to save to unified collection BEFORE creating approval submission
3. ✅ Added `frameworks` field to DB projection in `get_all_pending_submissions_for_org`
4. ✅ Fixed framework detection to check both `framework` and `frameworks[0]` fields
5. ✅ Fixed `_create_submission_for_approval` to create approval_request for unified queue

### Frontend Fixes
1. ✅ Fixed API endpoint from `/config/` to `/configs/` (plural) in ApproverQueue.js
2. ✅ Fixed API endpoint in SubmissionReviewPanel.js
3. ✅ Added `principle_toggle_with_description` to type check for BRSR form rendering
4. ✅ Fixed deduplication to prefer new approval_requests (put recordApprovals first)
5. ✅ Fixed deduplication key to use question_key for esg_response items
6. ✅ Created GRIApprovalPanel for GRI-specific approval UI
7. ✅ Added framework propagation in approval queue item mapping

## Completed Work (Current Session — Jul 29 2026)

### Bug Fix: GRI Responses not showing for Pending Approval (P0)
- **Root Cause**: `get_responses()` used `config_keys` from `esg_question_configs` as a proxy for section filtering. If a question_key (e.g., `gri_302_1`) had no matching config, it was silently dropped.
- **Fix**: Replaced config_keys filtering with direct `section` field in DB query (section is stored on every question-level doc). Configs are now only used for `response_modes` (FY merging), matching the pre-refactoring behavior.
- **Also fixed**: `_calculate_previous_fy()` crashed on `"FY2024-25"` format (no space after FY, 2-digit end year). Now handles all FY formats.
- **Status**: ✅ Verified — `gri_302_1`, `gri_302_2` responses now returned correctly

### Bug Fix: "Approval request not found" when approving BRSR (P0)
- **Root Cause (5-step chain)**:
  1. `_create_submission_for_approval` never set `current_approvers` on the approval_request
  2. Frontend calls `/api/approval-workflows/requests?my_approvals=true` → backend filters by `current_approvers`
  3. BRSR approval_request not returned → item only comes from old system endpoint (no `_approval_request_id`)
  4. Frontend calls `/api/approval-workflows/requests/undefined/approve` → 404
- **Fix**: 
  1. `_create_submission_for_approval` now resolves `current_approvers` (from esg_assignments → section assignments → org admins fallback)
  2. Submission doc's `approval_request_id` is now linked back after upsert
  3. Framework defaults no longer blindly default to "GRI" — uses submission's own framework field + question_key prefix inference
- **Status**: ✅ Verified — BRSR approval request approved successfully

### Bug Fix: Flat Storage Migration + Tracker Collection Fix (P0)
- **GRI flat storage**: Removed `_split_question_key` from all save paths (`_save_to_unified_collection`, `save_gri_response`, `approve_submission`, approval handler). Every `question_key` now gets its own document — no nesting. 301 incorrectly split config-level keys eliminated.
- **Data migration**: Migrated 8 nested sub_responses to flat docs, deleted 6 parent-only docs, cleaned 3 orphan docs without question_key.
- **Tracker fix**: Changed `esg_tracking/service.py` `self._responses` from `db["esg_responses"]` (old empty collection) to `db["organization_esg_responses"]`. Updated `get_framework_sections` and `get_section_disclosures` to query `org_id` and handle flat+legacy nested formats.
- **Rejection handler**: Fixed to use flat storage (was using nested `_split_question_key`)
- **Status**: ✅ Verified — GRI responses save/read as flat keys, no nested docs remain

## Completed Work (Current Session — Jul 30 2026)

### GHG Emissions Targets - Subcategories & Baseline from Records (P1)
- **Backend** (`/app/backend/modules/esg_targets/router.py`):
  - Added `_get_ghg_subcategories()` helper returning predefined subcategories:
    - Scope 1 Emissions, Scope 2 Emissions, Scope 3 Emissions, Total Emissions, Scope 1 + Scope 2 Emissions
  - Updated `/api/esg-targets/lookup/categories` to inject GHG Emissions category for environment section
  - Added new endpoint `GET /api/esg-targets/baseline/ghg-emissions` to fetch baseline from actual emission records
- **Frontend** (`/app/frontend/src/components/ESGTargetForm.js`):
  - Added `fetchGHGBaseline()` function for GHG-specific baseline lookup
  - Modified `fetchBaseline()` to detect GHG category and route to appropriate endpoint
- **Status**: ✅ Implemented

### BRSR ngrbc_policy_matrix Fix (P0)
- Fixed `NGRBCPolicyMatrixRenderer` in ESGQuestionnaire.js - removed broken `initialized` state pattern
- Added `NGRBCPolicyMatrixDisplay` component to ApproverQueue.js for proper approval workflow display/edit
- **Status**: ✅ Implemented

### ESG Records Admin Delete Bypass (P1)
- Updated `/app/backend/modules/esg_records/service.py` `delete_record()` to accept `user_role` parameter
- Admins now bypass approval workflow for deletes (matching GHG behavior)
- **Status**: ✅ Implemented

### Organization Timezone Setting Implementation (P0)
- **Backend Changes**:
  - Added `timezone` field to Organization model (`/app/backend/modules/organizations/contracts.py`)
  - Created `/app/backend/shared/utils/timezone_utils.py` with:
    - Country-to-timezone mapping (50+ countries)
    - Common IANA timezone list for dropdown
    - `get_default_timezone_for_country()` helper
    - `is_valid_timezone()` validator
  - Added API endpoints:
    - `GET /api/timezones` - Returns list of common timezones
    - `GET /api/timezones/default/{country}` - Returns default timezone for country
  - Updated module-config endpoint to include `timezone` field

- **Frontend Changes**:
  - Created `/app/frontend/src/utils/dateTimeUtils.js` - Centralized date formatting utility
    - `formatDateTime()`, `formatDate()`, `formatTime()`, `formatRelativeTime()`
    - All use IANA timezone with consistent `'en-GB'` locale
  - Created `/app/frontend/src/contexts/OrganizationContext.js` - Provides timezone to app
  - Created `/app/frontend/src/hooks/useDateFormatter.js` - Hook for easy access to formatters
  - Updated `App.js` to wrap with `OrganizationProvider`
  - Updated Organization Details page with timezone selector (auto-suggests based on country)

- **Components Updated to Use New Formatter**:
  - NotificationBell.js
  - ApproverQueue.js (including BRSRApprovalPanel, GRIApprovalPanel, RecordApprovalPanel)
  - QuestionnaireApprovalPanel.js
  - SubmissionReviewPanel.js
  - ESGQuestionnaire.js (QuestionRenderer)
  - ESGRecordsTracker.js
  - GRIQuestionnaire.js
  - ApprovalModule.js
  - ESGTrackingTab.js
  - tasks/TaskRow.js
  - tasks/utils.js
  - AuditTrails.js

- **Key Design Decisions**:
  - Backend stores ALL timestamps in UTC (no change)
  - Frontend displays in organization's configured timezone
  - Default timezone derived from country, but admin can override
  - Single formatting utility replaces all `toLocaleString()` calls
  - Consistent `'en-GB'` locale for uniform date format (DD MMM YYYY, HH:MM AM/PM)

- **Status**: ✅ Implemented and tested

## Known Issues

(None currently active — all tracked issues resolved)

## Key Files Reference

### Backend
- `/app/backend/modules/esg_questionnaire/service.py` - Core questionnaire service
- `/app/backend/modules/esg_questionnaire/unified_response_service.py` - New unified service
- `/app/backend/modules/esg_tracking/service.py` - Tracker service
- `/app/backend/modules/esg_assignments/completion_service.py` - Completion status
- `/app/backend/modules/approval_workflow/service.py` - Approval workflow
- `/app/backend/modules/organizations/router.py` - Timezone endpoints
- `/app/backend/shared/utils/timezone_utils.py` - Timezone utilities

### Frontend
- `/app/frontend/src/components/ApproverQueue.js` - Approval queue with GRI/BRSR panels
- `/app/frontend/src/components/SubmissionReviewPanel.js` - Legacy submission review
- `/app/frontend/src/components/ESGQuestionnaire.js` - Questionnaire UI
- `/app/frontend/src/utils/dateTimeUtils.js` - Centralized date formatting
- `/app/frontend/src/contexts/OrganizationContext.js` - Organization context with timezone
- `/app/frontend/src/hooks/useDateFormatter.js` - Date formatting hook
- `/app/frontend/src/pages/OrganizationDetails.js` - Organization settings with timezone

## Test Credentials
- Admin: goyalsomil2001@gmail.com / TestUser123!
- Organization ID: 9067d872-8a3a-4ed9-8494-e3ef04952f7c

## Remaining toLocaleString() Files (Lower Priority)
The following files still have `toLocaleString()` calls that should be updated in a future pass:
- EmissionApprovalWrapper.jsx
- TargetProgressChart.js
- BRSRYearlySections.js
- ESGTargetVersionHistory.js
- ESGTargetForm.js
- TaskCalendarGrid.js
- WorkforceDataTable.js
- Layout.js
- ESGRecordsDataEntry.js
- assignment-wizard/StepSchedule.jsx
- assignment-wizard/StepReview.jsx
- tasks/TaskLedger.js
- tracker/TrackerTableRow.js
- DataCoverageGrid.js
- FacilityProductionSection.js
- ESGRecords.js
- BRSRDetailsSection.js
- ESGTargetsTab.js
- PropertyValuesEditor.js
- RepoPilot.js
- dashboard/components/*.jsx

## Upcoming Tasks (P1)
- Multi-level Approval Flow Implementation
- Module Access Super Admin UI
- Cron job for marking tasks as "overdue"
- Phase 2 Executive Dashboard enhancements
- Complete remaining toLocaleString() migration

## Completed Work (Current Session — Jul 30 2026 continued)

### Supplier Assessment Module (P0) - NEW FEATURE
Complete implementation of a new top-level module for supplier ESG and GHG assessment.

**Architecture:**
- Extended `organizations` collection with `org_type` field (customer/supplier/customer_supplier)
- Extended `users` collection with `user_type` field (admin/employee/supplier/super_admin)
- New collections: `supplier_relationships`, `supplier_questionnaires`, `supplier_questions`, `supplier_questionnaire_responses`
- Supplier emissions stored in existing `emission_records` with `source: supplier` metadata

**Backend Implementation:**
- `/app/backend/modules/supplier_assessment/` - Complete module with:
  - `contracts.py` - Pydantic schemas for all entities
  - `service.py` - Business logic for supplier management, questionnaires, scoring
  - `router.py` - 25+ API endpoints for full CRUD operations
  - `email_templates.py` - Invitation and reminder email templates

**Frontend Implementation:**
- `/app/frontend/src/modules/supplier-assessment/` - Complete module with:
  - `SupplierList.jsx` - Supplier management with Add/Edit/View/Remind/Deactivate
  - `QuestionnaireBuilder.jsx` - Full questionnaire builder with questions management
  - `SupplierRanking.jsx` - Rankings based on ESG + GHG scores
  - `SupplierGHGView.jsx` - Customer admin view of all supplier emissions
  - `SupplierDashboard.jsx` - Supplier-side dashboard
  - `SupplierQuestionnaire.jsx` - Supplier questionnaire completion interface
  - `SupplierEmissions.jsx` - Simplified Scope 1 & 2 emission entry

**Key Features:**
1. **Supplier Management (Customer Admin)**:
   - Create suppliers with company name, contact, email, due date
   - Auto-create supplier org + user + send invitation email
   - View progress, completion %, scores
   - Send reminder emails with pending items

2. **ESG Questionnaire Builder (Customer Admin)**:
   - Create/edit/duplicate/delete questionnaires
   - Add questions with 4 response types: Yes/No, Numeric, Text, Dropdown
   - Configure question weight, category (E/S/G), required flag
   - Support both question-level and section-based scoring

3. **Supplier Rankings**:
   - Combined ESG + GHG performance scores
   - Ranked table with completion status

4. **Supplier Portal**:
   - Revenue percentage question
   - Questionnaire completion with draft/submit
   - Simplified GHG emission entry (Scope 1 & 2 only)

**Status**: ✅ Fully Implemented and Tested

## Completed Work (Current Session — Jul 31 2026)

### GHG Emissions V2 Assignment Filtering (P0)
- **Issue**: Non-admin users couldn't see emission records because `fetch_emissions_for_user` used legacy V1 `assigned_facilities` field
- **Fix**: Updated `/app/backend/modules/approvals/emission_flow_v2.py` to query V2 `esg_assignment_assignees` table
- **Result**: Both Aman and Ravi now see the same 5 Scope 1 records at Facility E
- **Status**: ✅ Fixed and Tested

### GHG Emissions Pending Proposal Display (P0)
- **Issue 1**: Non-admin user's pending edit values not shown in edit form - showed approved values instead
- **Root Cause**: `GET /api/emissions` (grid) queried only `pending_records` but emission updates write to `approval_requests`
- **Fix**: Updated `/app/backend/modules/approvals/emission_flow_v2.py` `fetch_emissions_for_user` to also check `approval_requests` and overlay user's proposed values
- **Status**: ✅ Fixed - Ravi now sees his proposed qty=6282, Aman sees original qty=2312

### GHG Emissions Status Display for Others (P0)
- **Issue 2**: After user submits edit, everyone sees "Awaiting Approval" instead of just the submitter
- **Root Cause**: PUT endpoint updated `emission_records.approval_status` to `pending_approval` in the database
- **Fix**: 
  - Removed DB update of `approval_status` in UPDATE flow (line 1198-1205 in router.py)
  - `fetch_emissions_for_user` now overlays `approval_status: pending_approval` only for the submitter
  - Others see `approval_status: approved` with `has_pending_proposal: True` badge
- **Status**: ✅ Fixed - Aman sees "Approved" with "pending by Ravi" badge, Ravi sees "Awaiting Approval"

### GHG Emissions Approval Field Mapping Bug (P0)
- **Issue 3**: After approval, `dynamic_field_values` showed old values while `co2e_emissions` had new values
- **Root Cause**: Approval handler in `service.py` mapped `proposed_changes.inputs` to `record_update["inputs"]` but DB uses `dynamic_field_values`
- **Fix**: Updated `/app/backend/modules/approval_workflow/service.py` line 1177-1183 to map `inputs` → `dynamic_field_values`
- **Status**: ✅ Fixed

### GHG Multi-Proposal Support (P0)
- **Issue 4**: When Ravi submitted edit, it overwrote Aman's pending request
- **Root Cause**: `existing_request` query didn't filter by `submitted_by`
- **Fix**: Added `"submitted_by": user_id` filter to query in `/app/backend/modules/emissions/router.py` line 1160-1165
- **Status**: ✅ Fixed

### Facilities Access for Non-Admin Users (P1)
- **Issue**: `/api/facilities` returned empty array for non-admin users
- **Fix**: Updated `/app/backend/modules/facilities/router.py` to return V2-assigned facilities for non-admin users
- **Status**: ✅ Fixed

### ESG Questionnaire Configs V2 Filtering (P1)
- **Issue**: BRSR disclosures not filtered by user assignment
- **Fix**: Updated `/app/backend/modules/esg_questionnaire/service.py` and `router.py` to filter configs by V2 assignments for non-admins
- **Status**: ✅ Fixed

### Frontend Pending Proposal Badges (P1)
- **Fix**: Added `StatusCell` component to `/app/frontend/src/pages/emissions/components/EmissionDataGrid.jsx`
- **Shows**: "Your Pending Edit" for user's own pending edits, "Edit pending by X" for others
- **Status**: ✅ Implemented

## Pending Issues (Noted for Later)
1. Safari: Existing data entry for Scope 1 / Facility E not showing
2. Safari: Fuel type dropdown not showing after choosing category
3. Workflow module conditional access (bypass restrictions when workflow disabled)
4. Replace remaining legacy V1 `assigned_to_user_id` usages (~34 occurrences)
5. Task status shows "Completed" instead of "Pending Approval"
6. SuperAdmin: Add supplier org names visibility to Organizations view

## Completed Work (Current Session — Dec 2025)

### Simplified Facility Form for Suppliers
- **Requirement**: Suppliers should only need to provide facility name when creating facilities
- **Changes**:
  - Frontend (`/app/frontend/src/pages/Facilities.js`): Added `isSupplier` check using `user.user_type === 'supplier'`
  - Suppliers see simplified form with only "Facility Name" field
  - Full form fields hidden until supplier becomes a customer (subscription)
  - Updated `validateFacilityForm` to only require name for suppliers
  - Backend (`/app/backend/modules/facilities/contracts.py`): Made `address` field optional (was required)
- **Status**: ✅ Implemented

### Supplier GHG Architecture Simplification
- **Decision**: Suppliers will use the main GHG Emissions flow (same as regular users) instead of a custom form
- **Rationale**: 
  - Single source of truth for emission entry/edit (no code duplication)
  - Existing GHG edit flow already works correctly
  - Simpler architecture, less maintenance burden
- **Removed Files**:
  - `/app/frontend/src/modules/supplier-assessment/SupplierEmissionsForm.jsx` — custom supplier emission form (unused)
  - `/app/frontend/src/pages/SupplierPortalEmissions.jsx` — page wrapper (unused)
  - Removed route `supplier-assessment/emissions` from App.js
- **Kept Files**:
  - `/app/frontend/src/modules/supplier-assessment/SupplierGHGView.jsx` — customer admin view of supplier emissions
  - `/app/frontend/src/pages/emissions/utils/hydrateEmissionForm.js` — reusable hydration utility
- **Supplier Org Name**: Auto-filled from customer-provided `company_name` when relationship is created (already implemented in `service.py` line 86)
- **Status**: ✅ Implemented — Code cleaned up, bundle size reduced

### Supplier Emissions Form Edit Hydration Utility (P0)
- **Issue**: Supplier Emissions Form Edit mode showed empty fields instead of pre-populated values with live calculations
- **Solution**: Extracted pure `hydrateEmissionForm(emission, config)` utility from `editEmissionDispatch.js`
  - Created `/app/frontend/src/pages/emissions/utils/hydrateEmissionForm.js` — pure transformation function
  - Refactored `/app/frontend/src/pages/emissions/utils/editEmissionDispatch.js` to use the new utility
  - Updated `/app/frontend/src/components/EmissionEntryForm.js` to use dynamic import of hydration utility
- **Key Design Decisions**:
  - `hydrateEmissionForm` is a pure function: no side effects, no state setters, no API calls
  - Returns a plain object with all form values ready for consumption
  - `editEmissionDispatch` public behavior unchanged for backward compatibility
  - `EmissionEntryForm` now uses the same comprehensive hydration logic as the main Emissions.js
- **Status**: ✅ Implemented — Single source of truth for edit hydration

## Future Tasks (P2)
- Materiality Assessment Phase 2+
- Dashboard Scope 1 & 3 Emissions Deduplication
- SOC 2 Compliance Implementation
- Dynamic ESG Disclosure Engine
- Sentry Error Monitoring Integration
