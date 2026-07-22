# ESG Platform — Product Requirements Document

## Original Problem Statement
Build a comprehensive ESG (Environment, Social, Governance) platform with premium dashboards, materiality assessment, GHG emissions tracking, BRSR/GRI reporting, workflow management, and evidence upload capabilities.

## Core Architecture
- **Frontend**: React + Shadcn/UI + Recharts + Tailwind CSS
- **Backend**: FastAPI + MongoDB
- **Storage**: Cloudflare R2 (evidence uploads)
- **Integrations**: OpenAI (RAG), Resend (emails), LlamaParse (document parsing)

## What's Been Implemented

### KPI Assignment-Based Access Control (Completed 2026-07-22)
- **GHG Subcategory Restrictions**: User assignments for GHG Emissions subcategories (Scope 1/2/3/Biogenic/Sinks) restrict data access to only assigned scope types
- **Facility-Level Restrictions**: Facility-level assignments restrict users to only view/create data for assigned facilities
- **Organization-Level Access**: Org-level assignments grant access to all facilities
- **Admin Bypass**: Admins always have full access regardless of assignments
- **Completion Tracking**: Per-facility completion tracking for org-level assignments; marked complete when all facilities have at least one record
- **New Backend APIs**: `/api/esg-assignments/kpi-access/ghg`, `/kpi-access/facilities`, `/kpi-access/facilities/list`, `/assignments/{id}/progress`
- **New Frontend Hooks**: `useGHGAccess`, `useFacilityAccess`, `useAssignmentProgress` in `/app/frontend/src/hooks/useKPIAccess.js`
- **Integrated Pages**: Emissions.js (scope tab + facility filtering), Sinks.js (access warning + facility filtering)

### Multi-User Assignment Bug Fix (Completed 2026-07-22)
- Fixed race condition in ESGRecordsTracker.js where parallel API calls caused only one user to be assigned
- Changed from `.map()` + `Promise.all` to sequential `for` loop with `await`
- Fixed assignment modal to read from `assignees[]` array instead of single `assigned_to_user_id` when loading existing assignments

### Internal Data AI (Phase 1 — Built 2026-07-20)
- Intelligent analytics assistant in RepoPilot (toggle: Document AI / Internal Data AI)
- GPT-5.6-sol for intent detection + response formatting; text-embedding-3-large for entity resolution
- 15 intents, 8 service modules, facility-level permission filtering
- Architecture: User Question → Embeddings → Intent Detection → Planner → Service Calls → Response Builder → Rich UI

### Dashboards & Analytics
- Executive Dashboard (GHG Scope 1/2/3 with base-year comparison)
- Environment Dashboard (Emissions, Energy, Water, Waste KPIs + charts)
- **Energy Dashboard** (4 KPIs + 5 charts: Monthly Trend, Source Breakdown, Renewable vs Non, Facility-wise, Intensity) — Rebuilt 2026-07-18 to reuse esg-analytics + environment-detail APIs
- **Water Dashboard** (4 KPIs + 7 charts: Monthly Trend, Source Donut, Source Trend, Flow Overview, Discharge Destinations, Recycling Gauge, Monthly Recycled) — Built 2026-07-18
- **Waste Dashboard** (6 KPIs + 7 charts: Monthly Trend, Composition Donut, Haz vs Non-Haz Trend, Recovery Trend, Disposal Trend, Flow Overview, Recovery Gauge) — Built 2026-07-18
- Social Dashboard (Workforce, Training, Complaints, Health & Safety)
- Governance Dashboard (AP Days, Anti-Competitive, Data Breaches, Violations)
- ESG Summary Dashboard (combined view)
- All dashboards filter out `pending_approval` and `rejected` records

### Sidebar Restructuring (Completed 2026-07-17)
- Dashboards relocated under respective modules:
  - GHG Module → Analysis (`/ghg/analysis`)
  - Environment → Analysis (`/environment/analysis`)
  - Social → Analysis (`/social/analysis`)
  - Governance → Analysis (`/governance/analysis`)
- 4 wrapper pages created: `GHGAnalysis.jsx`, `EnvironmentAnalysis.jsx`, `SocialAnalysis.jsx`, `GovernanceAnalysis.jsx`
- Routes added to `App.js`

### Data Entry & Approvals
- ESG Records CRUD with category-scoped pagination
- Approval workflow (assign approvers by category/subcategory)
- Evidence file upload via Cloudflare R2 (`esg-metrics-dev` bucket)
- Stats endpoint (draft/submitted/approved counts per section)

### Reporting
- BRSR Module with edit mode and reporting year sync
- BRSR progress tracking (question_key matching)
- GRI Module placeholder
- Reports page

### Workflow
- Workflow Tracker, My Task, Approver Queue
- MyTasks component with Fill Now, BRSR tagging, group tracking

### Dashboards & Analytics

### Other Features
- Materiality Assessment UI
- Bulk Upload, OCR Detection placeholder
- Voluntary Targets (Environment, Social, Governance)
- SBTi Targets
- Repo-Pilot (RAG document Q&A)
- User Management, Audit Trails, Facilities
- Super Admin dashboard with org/admin management
- Water Flow & Waste Management gradient area charts

## Pending Issues
1. **P1**: Module Access Super Admin UI (toggle modules per org) — NOT STARTED
2. **P2**: Dashboard Scope 1 & 3 Emissions deduplication bug — NOT STARTED
4. **P2**: Carbon Intensity Calculation discrepancy — NOT STARTED

## Upcoming Tasks (P1)
- Cron job for auto-marking overdue tasks
- Phase 2 Executive Dashboard (PDF export, fullscreen charts, drill-down)
- Test Repo Pilot with actual PDF uploads (end-to-end RAG)

## Future/Backlog (P2)
- Dynamic ESG Disclosure Engine
- Sentry Error Monitoring
- MFA for admin users
- SBTi target validation rules
- Dark mode fine-tuning

## Known Deferred Items
- Water Withdrawal KPI seeded filter issue (user asked to delay)

## Key Files
- `/app/frontend/src/config/sidebarConfig.js` — Sidebar menu config
- `/app/frontend/src/App.js` — Route definitions
- `/app/frontend/src/pages/Dashboard.js` — Main dashboard router
- `/app/frontend/src/pages/{GHG,Environment,Social,Governance}Analysis.jsx` — Module analysis wrappers
- `/app/frontend/src/hooks/useKPIAccess.js` — KPI assignment-based access hooks
- `/app/frontend/src/modules/dashboard/` — Dashboard components
- `/app/backend/modules/dashboards/` — Dashboard API services
- `/app/backend/modules/esg_records/` — Records CRUD + approvals
- `/app/backend/modules/esg_assignments/kpi_access_helper.py` — KPI access control logic
- `/app/backend/modules/esg_assignments/completion_tracking.py` — Assignment completion tracking
- `/app/backend/r2_storage.py` — Cloudflare R2 integration
