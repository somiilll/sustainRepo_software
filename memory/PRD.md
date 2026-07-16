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
- **Storage**: Cloudflare R2 (buckets: ghg-emissions-evidence-dev, esgMetrics-dev, etc.)
- **Email**: Resend
- **AI/RAG**: OpenAI embeddings, LlamaParse

## What's Been Implemented

### Completed Features
- [x] Materiality Assessment UI
- [x] Super Admin 3-level sidebar navigation
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
- [x] Audit trails & Notification system
- [x] File upload system
- [x] Evidence upload for ESG metrics (esgMetrics-dev bucket, org-scoped folders)
- [x] GRI tab on Organization Details (Coming Soon)
- [x] OCR Detection under Uploads (Coming Soon)
- [x] Reports sidebar link restored

### Bug Fixes (Jul 16, 2026)
- [x] Social Dashboard 500 error — `NameError` on `status` in social_detail_service.py
- [x] Governance AP Days aligned with ESG Summary (latest record approach)
- [x] Governance Data Breaches/Violations/Corruption case-sensitivity fix
- [x] My Tasks: restored Fill Now, removed BRSR tagging, restored backfill/current/future grouping
- [x] Removed Value column from metric logs

## Pending Issues
| ID | Priority | Description | Status |
|----|----------|-------------|--------|
| 1 | P1 | Module Access Super Admin UI — toggle modules per org | NOT STARTED |
| 2 | P2 | Water Withdrawal KPI filters missing | DEFERRED |
| 3 | P2 | Scope 1 & 3 Emissions deduplication bug | NOT STARTED |
| 4 | P2 | Carbon Intensity calculation discrepancy | NOT STARTED |
| 5 | P2 | Waste recovery trend (esg_analytics_service.py dict key fix) | User self-fixed |

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
- `POST /api/upload/evidence` (bucket_type=esg_metrics, folder=environment|social|governance)
- `GET /api/esg-records/tasks/my-tasks`

## Key Files
- `/app/backend/modules/dashboards/social_detail_service.py`
- `/app/backend/modules/dashboards/environment_detail_service.py`
- `/app/backend/modules/dashboards/governance_detail_service.py`
- `/app/backend/modules/dashboards/esg_analytics_service.py`
- `/app/backend/modules/dashboards/router.py`
- `/app/backend/modules/esg_records/contracts.py` (EvidenceFile model)
- `/app/backend/modules/esg_records/service.py` (evidence_files in create/update)
- `/app/backend/r2_storage.py` (esg_metrics bucket)
- `/app/backend/server.py` (upload endpoint)
- `/app/frontend/src/components/ESGRecordsDataEntry.js` (evidence upload UI)
- `/app/frontend/src/modules/dashboard/DashboardSocial.jsx`
- `/app/frontend/src/modules/dashboard/DashboardEnvironment.jsx`
- `/app/frontend/src/modules/dashboard/DashboardGovernance.jsx`
- `/app/frontend/src/pages/Dashboard.js`
- `/app/frontend/src/pages/WorkflowMyTask.js`
- `/app/frontend/src/pages/OrganizationDetails.js` (GRI tab)
- `/app/frontend/src/config/sidebarConfig.js` (Reports, OCR Detection)

## DB Schema (Key Collections)
- `organizations`: module_access, enabled_access
- `social_records`: workforce, H&S incidents, training, complaints
- `environment_records`: emissions, energy, water, waste
- `governance_records`: AP Days, anti-competitive cases, breaches
- `uploaded_files`: R2 file metadata (file_id, r2_key, bucket_type)

## R2 Buckets
- `ghg-emissions-evidence-dev` — GHG emission evidences
- `esgMetrics-dev` — ESG metric evidences (folder: {section}/{orgName}/{date})
- `organization-facility-data-dev` — Org/facility attachments
- `repo-pilot-dev` — RAG documents

## Test Credentials
- Super Admin: `esg-superadmin@sustainrepo.com`
- Admin (ORG1): `goyalsomil2001@gmail.com` / `TestUser123!`
