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

### V2 Assignment System
- **Assignments** are central objects stored in `esg_assignments`
- **Assignees** are linked via `esg_assignment_assignees` collection
- **Tasks** are generated from assignments via `task_engine.py`
- **Completion** is tracked via overlapping date logic (not exact period match)

### Unified ESG Metrics Service (NEW)
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
  - Upload PDF reports for ESG metric extraction (LlamaParse + GPT-4o)
  - Internal company data fetched via unified ESGMetricsService
  - Date range filtering with From/To date pickers
  - Radar chart visualization
  - AI-powered executive summary generation
  - Printable report export

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
- `/app/backend/modules/emissions/router.py` - Emission saves & task completion
- `/app/backend/modules/esg_assignments/completion_tracking.py` - Assignment completion
- `/app/frontend/src/components/tasks/TaskLedger.js` - Main task display UI
- `/app/frontend/src/components/MyTasks.js` - Task container component

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

## Known Issues
- Water Withdrawal KPIs missing filters (BLOCKED - user requested delay)
- Emission Intensity shows null if turnover not populated in governance_records
- Waste Intensity shows null if turnover not populated in governance_records
