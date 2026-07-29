# ESG Platform - Product Requirements Document

## Original Problem Statement
Complete the Materiality Assessment UI, design premium ESG Dashboards, fix analytics mapping bugs, build missing UI, redesign the Assignment dialog into a step-by-step wizard, implement BRSR/GRI comprehensive questionnaire approval workflows.

## Current Session Focus
Unify database architecture to use only 1 collection (organization_esg_responses) with question-level documents. Ensure GRI and BRSR have separate approval panel components in the Approver Queue. Fix various bugs related to status display, badge rendering, and approval workflow.

## Architecture Decisions

### Database Architecture (UNIFIED)
- **Single Collection**: `organization_esg_responses` 
- **Document Structure**: Question-level documents with nested sub_responses for sub-questions
```javascript
{
  org_id: "uuid",
  question_key: "gri_302_1",  // Parent question key
  framework: "GRI",           // or "BRSR"
  reporting_year: "FY 2026-2027",
  section: "environment",
  value: "...",               // For simple questions
  sub_responses: {            // For questions with sub-parts
    "a": { value: "...", status: "pending_approval", ... },
    "b": { value: "...", status: "saved", ... }
  },
  status: "saved",
  approval_status: "pending_approval",
  ...
}
```

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

## Known Issues

### Issue 1: Tracker not updating status
- **Symptom**: GRI/BRSR tracker not showing correct status updates
- **Root Cause**: Needs investigation of tracker query logic
- **Files to check**: `/app/backend/modules/esg_tracking/service.py`

## Key Files Reference

### Backend
- `/app/backend/modules/esg_questionnaire/service.py` - Core questionnaire service
- `/app/backend/modules/esg_questionnaire/unified_response_service.py` - New unified service
- `/app/backend/modules/esg_tracking/service.py` - Tracker service
- `/app/backend/modules/esg_assignments/completion_service.py` - Completion status
- `/app/backend/modules/approval_workflow/service.py` - Approval workflow

### Frontend
- `/app/frontend/src/components/ApproverQueue.js` - Approval queue with GRI/BRSR panels
- `/app/frontend/src/components/SubmissionReviewPanel.js` - Legacy submission review
- `/app/frontend/src/components/ESGQuestionnaire.js` - Questionnaire UI

## Test Credentials
- Admin: goyalsomil2001@gmail.com / TestUser123!
- Organization ID: 9067d872-8a3a-4ed9-8494-e3ef04952f7c

## Upcoming Tasks (P1)
- Multi-level Approval Flow Implementation
- Module Access Super Admin UI
- Cron job for marking tasks as "overdue"
- Phase 2 Executive Dashboard enhancements

## Future Tasks (P2)
- Materiality Assessment Phase 2+
- Dashboard Scope 1 & 3 Emissions Deduplication
- SOC 2 Compliance Implementation
- Dynamic ESG Disclosure Engine
- Sentry Error Monitoring Integration
