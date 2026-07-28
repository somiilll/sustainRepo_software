# ESG Platform - Product Requirements Document

## Original Problem Statement
Build a comprehensive ESG (Environmental, Social, Governance) platform with:
- Materiality Assessment UI
- Premium Environment, Social, and Governance Dashboards
- BRSR Reporting (Section B and Section C)
- Internal Data AI using GPT integration
- Assignment-aware data access and completion logic
- V2 Assignment architecture (one assignment linked to multiple assignees)
- Peer Benchmarking for competitor ESG comparison

## Core Architecture

### CompletionService - Single Source of Truth (Dec 2024)
- **Location**: `/app/backend/modules/esg_assignments/completion_service.py`
- **Purpose**: THE single authority for all completion/progress calculations
- **Key Methods**:
  - `DataChecker.check_exists()` - Check if data exists for a period (supports both KPI and questionnaire)
  - `DataChecker._check_questionnaire()` - Check esg_responses for questionnaire completion
  - `completion_service.get_task_status()` - Compute task status (not stored)
  - `completion_service.get_task_status_with_approval()` - Compute both status AND approval_status from records
  - `completion_service.get_assignment_progress()` - Calculate filled/total/percentage
  - `completion_service._calculate_question_progress()` - Progress for questionnaire assignments
  - `calculate_aggregate_approval_status()` - Compute org-level status from facility statuses
- **Used by**: My Tasks, Progress Engine Router, Tracker, Dashboard
- **Philosophy**: Task status AND approval_status are COMPUTED from actual data, never stored
- **Entity Type Support**:
  - `record_category`: KPI metrics (Water, Energy, GHG, etc.) - checks environment_records, emission_records
  - `question`: BRSR/GRI questionnaires - checks esg_responses
- **Aggregate Approval Rules** (Priority order: approved > pending > rejected): 
  - ANY approved → ALL_APPROVED (status=completed, approval_status=approved)
  - NO approved, ANY pending → ALL_PENDING (status=completed, approval_status=pending_approval)
  - ALL rejected (none approved, none pending) → HAS_REJECTION (status=pending, approval_status=rejected)
  - NOT_REQUIRED → No approval workflow (status=completed, approval_status=None)
- **Progress Calculation Rule** (Dec 2024):
  - `pending_approval` records count as completed (work done, awaiting review)
  - `approved` records count as completed
  - `rejected` records do NOT count as completed (need resubmission)

### Assignment Versioning (Dec 2024)
- **Version Tracking**: Assignments have `version` field (incremented on update)
- **Facility Snapshots**: Org-level assignments capture `facility_snapshot` at creation
- **Task Audit Fields**: Tasks store `assignment_version_at_creation`, `created_with_approval_workflow`, etc.
- **Smart Update Rules**:
  - Completed tasks: KEEP with original settings (audit trail preserved)
  - Pending tasks: REASSIGN to new settings
  - Future periods: GENERATE new tasks

### Data Integrity Features (Dec 2024)
- **Optimistic Locking**: Records have `version` field, updates check version match (409 on conflict)
- **Duplicate Submission Warning**: Creating duplicate record returns warning (not error)
- **Idempotency**: POST endpoints support `X-Idempotency-Key` header (24h cache)
- **Transaction Handling**: Assignment creation + task generation with error recovery

### Immutable Approved Data Principle (Dec 2024)
- **Core Rule**: Approved records are NEVER mutated until the edit is approved
- **Implementation**: When editing an approved record with approval required:
  1. Record stays unchanged (returns with `_pending_edit` flag)
  2. `proposed_changes` stored in approval request (`edit_type='immutable_edit'`)
  3. On approval: `proposed_changes` applied to record
  4. On rejection: Approval request discarded, record remains approved
- **Benefits**:
  - Dashboards always show approved data
  - No rollback logic needed
  - Clean audit trail
- **Files**: `esg_records/service.py`, `approval_workflow/service.py`

### Interpretation-Critical Snapshots (Dec 2024)
- **Location**: `assignment.interpretation_snapshot`
- **Purpose**: Capture fields that affect historical interpretation at assignment creation
- **Snapshot Contains**:
  - `assignment_level`: org vs facility (affects task structure)
  - `requires_approval`: prevents retroactive approval requirement changes
  - `version`: audit anchor point
  - `facility_snapshot`: captured facility list (affects completion calculation)
- **NOT Snapshotted** (workflow metadata):
  - `assignee` (use `completed_by_user_id` on task)
  - `approval_chain` (frozen in approval request)
  - `filling_frequency` (tasks already generated)
  - `start_date/end_date` (tasks have own `period_key`)
- **Immutability**: interpretation_snapshot is NEVER updated on assignment edits

### Questionnaire Support (Dec 2024)
- **Purpose**: Support BRSR/GRI questionnaire assignments with same lifecycle as KPI metrics
- **Entity Types**: 
  - `record_category`: KPI metrics (Water, Energy, GHG) - existing
  - `question`: BRSR/GRI questions - NEW
  - `section`: Auto-expands to question assignments - NEW
- **Section Expansion**:
  - Assigning "Section B" expands to individual question assignments (Q1, Q2, Q3...)
  - No parent section assignment stored - only leaf-level question assignments
  - Same pattern as category → subcategory expansion
  - Questions fetched from `esg_question_configs` collection
- **Task Generation**:
  - Question tasks have `entity_type="question"` and `entity_id=question_key`
  - Tasks stored in same `esg_reporting_tasks` collection
  - No category/subcategory/facility fields for question tasks
- **Completion Checking**:
  - `DataChecker._check_questionnaire()` queries `esg_responses` collection
  - Same priority logic: approved > pending_approval > rejected
- **My Tasks Integration**:
  - Question tasks appear alongside KPI tasks
  - User doesn't know if task came from Water or BRSR
- **Files Changed**:
  - `assignment_resolver.py`: `resolve_question()`, `get_user_question_assignments()`
  - `assignment_service_v2.py`: `_expand_section_to_questions()`
  - `completion_service.py`: `_check_questionnaire()`, `_calculate_question_progress()`
  - `task_engine.py`: `_generate_question_tasks()`

### AssignmentResolver - Single Source of Truth (Dec 2024)
- **Purpose**: Centralized assignment resolution using V2 architecture exclusively
- **Location**: `/app/backend/modules/esg_assignments/assignment_resolver.py`
- **Key Methods**:
  - `resolve()` - Returns KPI metric assignment or None (V2 architecture only)
  - `resolve_question()` - Returns questionnaire assignment for a question_key
  - `require_assignment()` - Returns assignment or raises HTTPException
  - `require_question_assignment()` - Returns question assignment or raises HTTPException
  - `get_user_assignments()` - Returns all user's assignments (both KPI and questionnaire)
  - `get_user_question_assignments()` - Returns only questionnaire assignments
- **V2 Architecture**: Assignees in `esg_assignment_assignees` collection (many-to-many)
  - Query uses `organization_id` filter for efficient scoped lookups
- **Legacy `assigned_to_user_id`**: REMOVED - V2 is now the exclusive source of truth
- **Entity Type Support**:
  - `record_category`: Uses category/subcategory for lookup
  - `question`: Uses entity_id (question_key) for lookup

### Category-Level Assignment Expansion (Dec 2024)
- **Design**: When admin assigns a category (no subcategory), system expands to independent subcategory assignments
- **No parent assignment**: Only leaf-level (subcategory) assignments exist after expansion
- **Metadata Fields**:
  - `assignment_source`: "category" (from expansion) or "subcategory" (direct)
  - `expanded_from_category`: Original category name (for UI convenience)
- **Category Progress**: Computed at runtime via `get_category_progress()` - aggregates all subcategory assignments
- **Bulk Operations**: `UPDATE WHERE category = "Water"` - no inheritance logic needed
- **Subcategory Source**: `esg_record_categories` (Super Admin managed) with fallback to `environment_records`
- **Files**: `assignment_service_v2.py`

### Task Ownership Fields (Dec 2024)
- **Purpose**: Clear audit trail for who submitted/completed tasks, even after reassignments
- **Fields on `esg_reporting_tasks`**:
  - `submitted_by_user_id` / `submitted_at`: Who submitted the data and when
  - `completed_by_user_id` / `completed_at`: Who marked it complete (submitter if no approval, approver if approval required)
  - `approved_by_user_id` / `approved_at`: Who explicitly approved (set only when approval workflow used)
- **Immutability**: These fields are NEVER modified after initial set, even if task is reassigned
- **Files**: `task_engine.py`, `esg_records/service.py`, `approval_workflow/service.py`

### Task Lifecycle States (Dec 2024)
- **ACTIVE**: Normal operational state (pending, completed, etc.)
- **CANCELLED**: Assignment was deleted, task has no data (audit visible)
- **ORPHANED**: Assignment was deleted, but task has data (preserved for audit)
- **ARCHIVED**: Old cancelled tasks after retention period

### V2 Assignment System
- **Assignments** are central objects stored in `esg_assignments`
- **Assignees** are linked via `esg_assignment_assignees` collection
- **Tasks** are generated from assignments via `task_engine.py` (metadata only, no status)
- **Completion** is computed on-the-fly by CompletionService
- **Conflict Validation**: Cannot have org-level + facility-level assignments for same category/period

### Delete Approval Workflow (Dec 2024)
- **Flow**: Delete → Create Delete Approval Request → Approve → Hard Delete
- **Record marked** `pending_deletion=true` while awaiting approval
- **If rejected**: pending_deletion cleared, record remains active

### Resubmission After Rejection
- **Rule**: Rejected records CANNOT be edited
- **User must**: Create a new submission instead
- **Enforced in**: `esg_records/service.py` update_record()

### Unified ESG Metrics Service
- **Location**: `/app/backend/services/esg_metrics_service.py`
- **Purpose**: Centralized data fetching and calculations for all ESG metrics
- **Used by**: Peer Benchmarking (can extend to Dashboard, Targets, Internal Data AI)
- **Date Filtering**: Uses `reporting_period` field with start_date/end_date parameters

### Key Collections
- `esg_assignments`: id, start_date, end_date, reporting_period
- `esg_assignment_assignees`: assignment_id, user_id, role
- `esg_tasks`: Generated tasks linked to assignees
- `emission_records`: ESG data points with facility_id and reporting_period
- `environment_records`: Water, Waste, Energy data
- `social_records`: Health & Safety, Training data
- `governance_records`: Financial, Compliance data

## What's Been Implemented

### Completed Features
- [x] V2 Assignment Architecture
- [x] Task generation from V2 assignments (task_engine.py)
- [x] Automatic task completion on emission save
- [x] TaskLedger.js UI component (ledger-style table)
- [x] BRSR/GRI tab filtering by entityType
- [x] Assignment completion tracking with date overlap logic
- [x] Internal Data AI Phase 1
- [x] **Peer Benchmarking Module** (July 2025)
  - Upload PDF reports for ESG metric extraction (LlamaParse + GPT-5.6-luna)
  - Internal company data fetched via unified ESGMetricsService
  - Date range filtering with From/To date pickers
  - Radar chart visualization
  - AI-powered executive summary generation
  - Printable report export
  - **R2 Storage Migration (Dec 2025)**: Migrated from EMERGENT_LLM_KEY proxy to direct Cloudflare R2 via boto3
- [x] **Progress Engine V2** (July 2025)
  - Handles emission_records schema (facility_id only, string dates, scope field)
  - Handles environment_records schema (org_id, dict dates, is_current field)
  - Smart org-level calculation: only expands to facility count if facility records exist
  - GHG Emissions Scope 1 progress: 14.3% (2/14 tasks)
  - Water/Discharge progress: 75% (3/4 tasks)
- [x] **ESG Records Tracker UI Updates** (July 2025)
  - Status column shows colored boxes: Orange (Pending), Red (Overdue), Green (Completed)
  - Tooltips on hover for each status box
  - Removed Stale stat card from overview (now 5 cards)

### ESG Metrics Calculations (via ESGMetricsService)
| Metric | Formula | Data Source |
|--------|---------|-------------|
| Scope 1/2 Emissions | Sum of records | `emission_records` |
| Emission Intensity | total_emissions / turnover | `emission_records` + `governance_records` |
| Treated Water Discharged % | treated / total × 100 | `environment_records` (Water/Discharge) |
| Waste Recycled % | recovered / generated × 100 | `environment_records` (Waste) |
| Hazardous Waste | Sum of hazardous_waste_generated | `environment_records` (Waste/Generated) |
| Waste Intensity | total_waste / turnover | `environment_records` + `governance_records` |
| LTIR Employee | (injuries / hours) × 1,000,000 | `social_records` (Health & Safety) |
| LTIR Worker | (injuries / hours) × 1,000,000 | `social_records` (Health & Safety) |
| Days Accounts Payable | (AP × 365) / COGS | `governance_records` |
| Data Privacy Policy | Boolean from records | `governance_records` |
| Disciplinary Actions | Count from records | `governance_records` |

### Field Mappings
- **Treated Water**: `quantity_discharged_with_treatment_done` OR sum of primary+secondary+tertiary treatment
- **Waste Recycled**: `quantity` from "Recovered / Diverted from disposal" subcategory
- **LTIR**: `no_of_loss_time_injuries` / `total_hours_worked` from Health & Safety Incidents

## Prioritized Backlog

### P0 - Critical (Testing Debt)
- [ ] Backend testing for task engine & completion flows
- [ ] Frontend testing for TaskLedger UI
- [ ] Internal Data AI Phase 2 verification

### P1 - High Priority
- [ ] Module Access Super Admin UI (toggle enabled_access/module_access)
- [ ] Overdue tasks cron job (auto-mark when due_at passes)
- [ ] Executive Dashboard enhancements (PDF export, fullscreen, drill-down)
- [ ] Extend ESGMetricsService usage to Dashboard, Targets, Internal Data AI

### P2 - Medium Priority
- [ ] Assignment Lifecycle Management (Archived/Superseded states)
- [ ] Dashboard Scope 1 & 3 Emissions Deduplication
- [ ] Carbon Intensity Calculation fix
- [ ] SOC 2 Compliance (MFA, rate limiting, CSP headers)
- [ ] Dynamic ESG Disclosure Engine
- [ ] Sentry Error Monitoring
- [ ] SBTi target validation rules
- [ ] Dark mode fine-tuning
- [ ] Materiality cutoff backend persistence

## Key Files Reference

### Unified Services
- `/app/backend/services/esg_metrics_service.py` - **NEW** Centralized ESG metrics calculations

### Task System
- `/app/backend/modules/esg_records/task_engine.py` - Task generation
- `/app/backend/modules/emissions/router.py` - Emission saves, task completion & assignment-based approval
- `/app/backend/modules/esg_assignments/completion_service.py` - Single source of truth for completion
- `/app/frontend/src/components/tasks/TaskLedger.js` - Main task display UI
- `/app/frontend/src/components/MyTasks.js` - Task container component

### Approval Workflow
- `/app/backend/modules/esg_records/service.py` - ESG records approval pattern (reference implementation)
- `/app/backend/modules/emissions/router.py` - Emission approval via `_create_emission_approval_request()`
- **Deleted**: `/app/backend/modules/approval_workflow/integration.py` (replaced with assignment-based approval)

### Peer Benchmarking Module
- `/app/frontend/src/modules/peer-benchmarking/` - Frontend module
- `/app/frontend/src/modules/peer-benchmarking/components/UploadView.js` - PDF upload
- `/app/frontend/src/modules/peer-benchmarking/components/ComparisonView.js` - Comparison with date pickers
- `/app/frontend/src/modules/peer-benchmarking/components/RadarChartWidget.js` - Radar chart
- `/app/frontend/src/modules/peer-benchmarking/components/ExecutiveSummaryWidget.js` - AI summary
- `/app/backend/modules/benchmarking/router.py` - Backend API using ESGMetricsService

### Existing Dashboard Services (can be consolidated)
- `/app/backend/modules/dashboards/social_detail_service.py` - LTIR calculations
- `/app/backend/modules/dashboards/governance_detail_service.py` - Days AP calculations
- `/app/backend/modules/esg_records/services/dashboard/water_service.py` - Water metrics
- `/app/backend/modules/esg_records/services/dashboard/waste_service.py` - Waste metrics

## 3rd Party Integrations
- OpenAI `gpt-5.6-sol` (requires user API key) - Internal Data AI
- OpenAI `text-embedding-3-large` (requires user API key) - Internal Data AI
- OpenAI `gpt-4o` (OPENAI_API_KEY_PEER_BENCHMARKING) - Peer Benchmarking
- LlamaParse (LLAMA_CLOUD_API_KEY_PEER_BENCHMARKING) - PDF extraction
- Cloudflare R2 Storage (requires user API key)
- Resend Emails (requires user API key)

## Recent Updates (July 2025)

### ESG Assignment Approval Settings Fix (Dec 2025)
- **Problem**: `requires_approval` and `approver_id` were not being saved when creating ESG assignments, especially for facility-level assignments
- **Root Causes Found**:
  1. Backend `assignment_service_v2.py` was missing `approver_id` field in both create and update paths
  2. Frontend `ESGRecordsTracker.js` was missing `approver_id` in facility-level assignment payloads
  3. `approval_chain` handling in `esg_records/service.py` and `emissions/router.py` expected objects but received strings
- **Files Fixed**:
  - `/app/backend/modules/esg_assignments/assignment_service_v2.py` - Added `approver_id` to create/update paths
  - `/app/backend/modules/esg_records/router.py` - Added `approver_id` to all 3 assignment_data blocks
  - `/app/backend/modules/esg_tracking/models.py` - Added `approver_id` to BulkAssignRequest model
  - `/app/backend/modules/esg_tracking/service.py` - Added `approver_id` to assignment_data
  - `/app/backend/modules/esg_records/service.py` - Fixed approval_chain to handle string arrays
  - `/app/backend/modules/emissions/router.py` - Fixed same approval_chain handling
  - `/app/frontend/src/components/ESGRecordsTracker.js` - Added `approver_id` to facility-level payloads
- **Test Report**: `/app/test_reports/iteration_107.json` - 100% pass rate

### Granular Assignment-Based Approval Workflow for Emissions (Dec 2025)
- **Problem**: Emissions were using a generic org-level approval workflow (`approval_workflow/integration.py`) that didn't support per-category/per-subcategory approval granularity like ESG records
- **Solution**: 
  1. Updated `/app/backend/modules/emissions/router.py` to use assignment-based approval logic
  2. Added `_find_emission_assignment()` to look up user's KPI or record_category assignment
  3. Added `_create_emission_approval_request()` to create approval requests linked to assignment's `approver_id`
  4. Deleted `/app/backend/modules/approval_workflow/integration.py` (no longer needed)
- **Result**: Emissions now follow the same granular approval pattern as Water, Energy, and BRSR questions - approval triggers only when the specific assignment has `requires_approval=True`

### Reporting Period Storage Fix
- **Problem**: For monthly records in FY context, Jan/Feb/Mar were stored with FY start year (e.g., `year: 2026` for Feb FY 2026-2027) instead of actual calendar year (`year: 2027`)
- **Solution**: 
  1. Updated `ESGRecordsDataEntry.js` save logic to calculate actual calendar year based on month
  2. Updated display logic to show simple "Month Year" format (e.g., "Feb 2027") instead of "Feb FY 2026-2027"
  3. Created and ran migration script to fix existing data (14 records updated)
- **Files Changed**:
  - `/app/frontend/src/components/ESGRecordsDataEntry.js` - Save & display logic
  - `/app/frontend/src/components/ESGRecords.js` - Display format
  - `/app/backend/scripts/migrate_reporting_periods.py` - Migration script (NEW)

## Four Immutable Architectural Principles

### Principle 1: Records are truth, Tasks are projections
- Dashboard, KPIs, Reports → Read Records
- Task Status → Computed from Records
- Progress → Computed from Records

### Principle 2: Completed work is immutable
- Assignment changes → May happen
- Task reassignment → May happen
- Completed history → NEVER changes

### Principle 3: Pending changes never affect reporting
- Pending edit → Not in dashboard
- Pending delete → Still in dashboard
- Pending approval → Not in KPIs
- Only APPROVED → Contributes to calculations

### Principle 4: History is append-only
- Never overwrite. Always append:
  - created, submitted, approved, rejected, reassigned, superseded, deleted

## Known Issues
- Water Withdrawal KPIs missing filters (BLOCKED - user requested delay)
- Emission Intensity shows null if turnover not populated in governance_records
- Waste Intensity shows null if turnover not populated in governance_records

## Future Enhancements (Backlog)

### Multi-Level Approval Flow (P2 - Deferred)
- **Current State**: Single-level approval with `approver_id` extracted from `approval_chain[0]`
- **Future State**: Sequential multi-level approval (L1 → L2 → L3)
- **Data Model** (backward compatible, no migration needed):
  - `approval_chain: ["L1_user", "L2_user", "L3_user"]` - already exists
  - `current_approval_level: 0` - NEW field (default 0 for existing)
  - `approval_status` stays simple ("pending_approval", "approved", "rejected")
- **Key Decisions Needed**:
  1. Rejection behavior: Back to L1 or directly to assignee?
  2. Skip levels: Can L1 approve AND skip to final?
  3. Parallel vs sequential approval?
  4. Delegation support?
- **Implementation Order**:
  1. Add `current_approval_level` to records
  2. Update approval workflow to advance through levels
  3. Update approval queue for level filtering
  4. Frontend multi-level assignment UI
- **No breaking migration**: Code will default missing `current_approval_level` to 0

---

## Implementation Log (December 2025)

### GRI Tracker & Approval Sync Fix (Dec 27, 2025)
- **Issue**: GRI tracker showing incorrect completion and approval status
- **Root Causes Fixed**:
  1. **Aggregated completion bug**: Parent questions showed `completed=True` when ANY subpart had value (should be ALL)
  2. **Approval status normalization**: GRI responses used `status` field, BRSR used `approval_status` - caused mismatches
  3. **Empty string handling**: Values of `''` (empty string) were treated as filled
- **Files Modified**:
  - `/app/backend/modules/esg_tracking/service.py` - Fixed aggregation logic, added approval_status normalization
  - `/app/backend/modules/esg_assignments/service.py` - Added approval_status normalization for My Tasks
  - `/app/backend/modules/esg_questionnaire/service.py` - Added `approval_status` field alongside `status` when approving
- **DB Migration**: Backfilled `approval_status` field for existing GRI responses that had `approved_at` set
- **Testing**: All 6 scenarios passed (100% backend test success rate)

### GHG Emissions Update Approval Refactor (Dec 28, 2025)
- **Issue**: GHG emission record updates used legacy `pending_emission_records` collection instead of unified `approval_requests`
- **Solution**: Refactored `PUT /api/emissions/{record_id}` to:
  1. Bypass legacy `approval_intercept_update` flow
  2. Create unified approval request in `approval_requests` collection for user updates requiring approval
  3. Update `emission_records` with `approval_status: pending_approval` on submission
  4. Apply `proposed_changes` on approval via `approval_workflow/service.py`
- **Files Modified**:
  - `/app/backend/modules/emissions/router.py` - New `_create_emission_update_approval_request()` helper, refactored update endpoint
  - `/app/backend/modules/approval_workflow/service.py` - Enhanced `_process_approve()` to apply `proposed_changes` for emission updates
- **Benefits**:
  - Unified approval workflow across all record types (ESG metrics + GHG emissions)
  - Single `approval_requests` collection as source of truth for approval queue
  - Cleaner codebase with no dual-collection maintenance
- **Backward Compatibility**: Legacy `pending_emission_records` for CREATE operations still supported for existing pending records

### GHG Approval Queue UI Fix (Dec 28, 2025)
- **Issue**: Approval Queue UI was broken for GHG emission records:
  1. `EmissionApprovalPanel` used wrong API endpoint (`/api/approval-workflows/action` vs `/requests/{id}/decide`)
  2. `Textarea` component referenced but not imported (used standard `<textarea>`)
  3. `Download` icon used but not imported from lucide-react
  4. Emission records from `approval_workflow` source weren't properly detected (filter only checked `esg_record`)
  5. No diff view for UPDATE requests showing old vs new values
- **Solution**:
  - Fixed API endpoint to `/api/approval-workflows/requests/{id}/decide`
  - Replaced `Textarea` with standard `<textarea>` element
  - Added `Download` import from lucide-react
  - Updated filter to include `emission_record` entity type
  - Added distinct teal badge for GHG Emission records (vs green for Data Records)
  - Added request_type badge (UPDATE/DELETE) in queue list
  - Added comprehensive diff view in `EmissionApprovalPanel` for UPDATE requests
- **Files Modified**:
  - `/app/frontend/src/components/ApproverQueue.js`
- **Backend**: Already properly handles `emission_record` approvals/rejections with history tracking in `emission_history` collection

### GHG Logs Status Column Addition (Dec 28, 2025)
- **Feature**: Added dedicated Status column to GHG Logs table for all scopes (Scope 1, 2, 3, Biogenic)
- **Status Values**:
  - `Completed` (gray) - No approval workflow configured
  - `Completed, Approved` (green) - Record approved through workflow
  - `Completed, Rejected` (red) - Record rejected
  - `Completed, Awaiting approval` (amber) - Pending approval
- **Changes**:
  - Removed Quantity column from Scope 1 & 2 (per user request)
  - Replaced Last Updated column with Status column
  - Created `getStatusDisplay()` function in `/app/frontend/src/modules/ghg/utils/approvalSchema.js`
- **Files Modified**:
  - `/app/frontend/src/pages/emissions/components/EmissionDataGrid.jsx` - Main grid component
  - `/app/frontend/src/modules/ghg/utils/approvalSchema.js` - Added getStatusDisplay function
  - `/app/frontend/src/pages/emissions/EmissionTable.js` - Alternative table component (updated for consistency)
- **Testing**: 100% frontend pass rate (iteration_127)

### GHG Emission Approval Form Enhancement (Dec 28, 2025)
- **Feature**: Enhanced Approver Queue to reuse the exact same edit form for GHG approval
- **New Component**: `/app/frontend/src/components/EmissionApprovalWrapper.jsx`
- **Approach**: Reuses existing infrastructure instead of building custom form:
  - `useEmissionsCoreData` hook for fetching fuel database, units, categories
  - `useEmissionEdit` hook for managing form state
  - `EmissionEditForm` component for the actual form rendering
- **Features**:
  - Shows exact same form as the emissions edit page
  - Approver can modify any field
  - Modification tracking and audit trail
  - Approve/Reject with comments
  - Evidence file downloads
- **Props added to EmissionEditForm.jsx**:
  - `hideSubmitButton` - hides submit section in approval mode
  - `isApprovalMode` - flag for approval-specific behavior
- **Backend Updates**:
  - Removed duplicate approval mechanism (`approval_intercept_create`)
  - Now uses only `_create_emission_approval_request()` for assignment-based approval
  - Fixed `_build_emission_inputs()` helper to normalize legacy and new field formats
  - Fixed `request_type` parameter in `_create_approval_version_snapshot()` for proper history tracking
- **Fixes**:
  - Duplicate approval entries in queue - FIXED
  - Version history missing request_type - FIXED
  - Input fields not showing - FIXED (now shows exact edit form)

