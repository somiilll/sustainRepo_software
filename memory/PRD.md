# ESG Platform — Product Requirements Document

## Original Problem Statement
Build a comprehensive ESG (Environmental, Social, Governance) platform with:
- Materiality Assessment UI
- Premium Environment, Social, and Governance Dashboards
- Super Admin 3-level hierarchical navigation
- GHG Scope 1/2/3 tracking and reporting
- Multi-tenant organization management

## Core Architecture
- **Frontend**: React + Shadcn/UI + Recharts + Framer Motion
- **Backend**: FastAPI + MongoDB (Motor async driver)
- **Storage**: Cloudflare R2
- **Email**: Resend
- **AI/RAG**: OpenAI embeddings, LlamaParse

## What's Been Implemented

### Completed Features
- [x] Materiality Assessment UI (complete)
- [x] Super Admin 3-level sidebar navigation restored
- [x] Premium Environment Dashboard (Scope Explorer 3 cards, Water Trends)
- [x] Premium Social Dashboard (Employee Diversity, Board Diversity, H&S Waffle chart)
- [x] Premium Governance Dashboard
- [x] GHG Dashboard (Scope 1/2/3 emissions tracking)
- [x] Executive Dashboard with ESG analytics
- [x] Multi-tenant org management
- [x] User authentication (JWT)
- [x] Facility management
- [x] Workflow system (My Tasks, Tracker, Approver Queue)
- [x] Target tracking (SBT targets)
- [x] Audit trails
- [x] Notification system
- [x] File upload system

### Bug Fixes (Jul 16, 2026)
- [x] Fixed Social Dashboard 500 error — `NameError: name 'status' is not defined` in `social_detail_service.py`
- [x] Fixed Governance Dashboard AP Days — aligned with ESG Summary using latest record values (both 352.8 days)
- [x] Fixed Governance Data Breaches/Violations/Corruption case-sensitivity (breaches=6, violations=5, corruption=3)
- [x] Fixed My Tasks: restored "Fill Now" for metrics, removed incorrect BRSR tagging, restored backfill/current/future task grouping — root cause was `WorkflowMyTask.js` using `MyAssignments` instead of `MyTasks` component

## Pending Issues
| ID | Priority | Description | Status |
|----|----------|-------------|--------|
| 1 | P1 | Module Access Super Admin UI — toggle modules per org | NOT STARTED |
| 2 | P2 | Water Withdrawal KPI filters missing | DEFERRED (user request) |
| 3 | P2 | Scope 1 & 3 Emissions deduplication bug | NOT STARTED |
| 4 | P2 | Carbon Intensity calculation discrepancy | NOT STARTED |

## Upcoming Tasks (P1)
- Overdue task cron job (auto-mark tasks past `due_at`)
- Executive Dashboard Phase 2 (PDF export, fullscreen charts, drill-down)
- Test Repo Pilot with actual PDF uploads (end-to-end RAG validation)

## Future/Backlog (P2)
- Dynamic ESG Disclosure Engine
- Sentry Error Monitoring Integration
- MFA for admin users (TOTP)
- SBTi target validation rules
- Dark mode fine-tuning

## Key API Endpoints
- `GET /api/dashboard/environment-detail`
- `GET /api/dashboard/social-detail`
- `GET /api/dashboard/governance-detail`
- `GET /api/dashboard/stats`
- `GET /api/dashboard/esg-analytics`
- `GET /api/dashboard/esg-summary`
- `GET /api/esg-records/tasks/my-tasks`
- `GET /api/tracking/my-disclosures`

## Key Files
- `/app/backend/modules/dashboards/social_detail_service.py`
- `/app/backend/modules/dashboards/environment_detail_service.py`
- `/app/backend/modules/dashboards/governance_detail_service.py`
- `/app/backend/modules/dashboards/esg_analytics_service.py`
- `/app/backend/modules/dashboards/router.py`
- `/app/frontend/src/modules/dashboard/DashboardSocial.jsx`
- `/app/frontend/src/modules/dashboard/DashboardEnvironment.jsx`
- `/app/frontend/src/modules/dashboard/DashboardGovernance.jsx`
- `/app/frontend/src/pages/Dashboard.js`
- `/app/frontend/src/pages/WorkflowMyTask.js`
- `/app/frontend/src/components/MyTasks.js`
- `/app/frontend/src/components/tasks/TaskGroupedView.js`
- `/app/frontend/src/components/tasks/TaskCard.js`
- `/app/frontend/src/components/tasks/TaskRow.js`
- `/app/frontend/src/config/superAdminSidebarConfig.js`

## DB Schema (Key Collections)
- `organizations`: module_access, enabled_access
- `social_records`: workforce, H&S incidents, training, complaints
- `environment_records`: emissions, energy, water, waste
- `governance_records`: AP Days, anti-competitive cases, breaches

## Test Credentials
- Super Admin: `esg-superadmin@sustainrepo.com`
- Admin (ORG1): `goyalsomil2001@gmail.com` / `TestUser123!`
