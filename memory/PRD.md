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

## Completed Work This Session

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

## Known Issues (Not Fixed)

### Issue 1: Response not showing for Pending Approval
- **Symptom**: Questions with pending_approval status don't show their response value in questionnaire UI
- **Root Cause**: `get_responses()` method may not be returning pending_approval responses correctly
- **Files to check**: `/app/backend/modules/esg_questionnaire/service.py` - `get_responses()` method

### Issue 2: Tracker not updating status
- **Symptom**: GRI/BRSR tracker not showing correct status updates
- **Root Cause**: Needs investigation of tracker query logic
- **Files to check**: `/app/backend/modules/esg_tracking/service.py`

### Issue 3: Potential caching issues
- **Symptom**: Frontend may show stale data due to browser caching
- **Workaround**: Hard refresh or clear cache

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
