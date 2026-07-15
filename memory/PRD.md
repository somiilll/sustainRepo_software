# ESG Platform - Product Requirements Document

## Original Problem Statement
Build a comprehensive ESG (Environmental, Social, Governance) Platform with:
- 5-step KPI Creation Wizard for Super Admins
- Flexible schema (`esg_kpi_definitions`)
- KPI engine route: `/super-admin/kpi-definitions`
- Targets Module consuming KPIs from the engine
- Reusable calculation engine (`kpi_engine`) for dynamic COUNT/SUM
- Target progress with percentage badges

## Architecture
```
/app/
├── backend/
│   ├── modules/
│   │   ├── esg_targets/ (router.py, baseline_service.py, baseline_config.py)
│   │   ├── kpi_engine/ (calculator.py, ghg_adapter.py, aggregators.py, filters.py, utils.py)
│   │   ├── esg_kpi_definitions/ (service.py, contracts.py, router.py)
│   │   ├── esg_records/ (ghg_integration.py, services/dashboard/)
│   │   ├── dashboards/ (esg_analytics_service.py)
│   │   └── emissions/ (router.py, service.py)
│   ├── shared/ (utils/)
├── frontend/
│   └── src/
│       ├── modules/dashboard/ (DashboardESG.jsx, ExecutiveAnalyticsDashboard)
│       ├── components/ (ESGRecordsDataEntry.js)
```

## What's Been Implemented

### Core KPI Engine
- KPI calculation engine with REST APIs
- Endpoints: `/api/kpi-engine/calculate`, `calculate_by_code`, `batch`, `dimension`
- Dynamic COUNT/SUM records based on KPI config
- Period filtering (daily, monthly, quarterly, yearly)

### GHG Module Adapter
- `ghg_adapter.py`: Routes GHG-linked KPIs to `emission_records` collection
- Uses `baseline_mapping_key` field on KPI definitions for scope/category mapping

### Executive ESG Dashboard
- 10 KPI cards + 7-row analytics layout with Recharts
- Live data from `/api/esg-records/dashboard-metrics` and `/api/dashboard/esg-analytics`
- `design_guidelines.json` for consistent theming

### Dashboard Data Pipeline (Jul 15, 2026)
- **Shared unit_utils.py**: `to_kilolitres()`, `to_mwh()`, `to_number()` — single source of truth for unit conversions across all dashboard services
- **Shared date_utils.py**: `build_date_filter()` — generates MongoDB $or conditions for ALL reporting period types (monthly name+number, daily/weekly date range, quarterly year+quarter, yearly FY/CY)
- **is_current/status filters**: All dashboard service queries now exclude draft and old-version records
- **Metric behavior semantics** in `esg_analytics_service.py`:
  - **Snapshot** (employees, aging buckets): carry forward across entire reporting period
  - **Flow** (injuries, breaches, energy, water, waste): land on specific month only
  - **Ratio** (turnover, LTIFR, AP Days): carry forward like snapshot

### ESG Data Entry Fixes (Jul 15, 2026)
- FY year dropdown shows "FY YYYY-YYYY+1" format when org uses Financial Year (all reporting types)
- Edit form month dropdown uses numeric values matching add form (fixes empty month bug)
- Backend `_validate_reporting_period` enforces month for monthly entries

### Target Progress
- `/api/esg-targets/with-progress` calculates on-the-fly progress
- Progress logic handles `upper_limit`, `lower_limit`, `range`, `exact` goals

## Pending Issues

### P0: Water Withdrawal KPI Source Filters Missing
- Six seeded Water Withdrawal KPI definitions still need `field_values.source_type` filters injected into `esg_kpi_definitions`

### P1: Dashboard Scope 1 & 3 Emissions Deduplication Bug
- In `dashboards/router.py`, `should_include_emission` filter causing issues

### P1: Carbon Intensity Calculation Discrepancy
- Check `generate_ghg_inventory_report` in `reports/router.py` ~lines 818-830

## Upcoming Tasks
- P1: Cron job for marking tasks as "overdue" when `due_at` passes
- P1: Phase 2 Dashboard enhancements (PDF export, fullscreen, drill-down)
- P1: Make metric_behavior config-driven via esg_kpi_definitions instead of hardcoded

## Future/Backlog
- P2: Dynamic ESG Disclosure Engine
- P2: Sentry Error Monitoring Integration
- P2: KPI engine scalability (server-side MongoDB aggregation)
- P2: MFA for admin users
- P2: SBTi target validation rules
- P2: Dark mode support

## Key Data Models
- `esg_kpi_definitions`: KPI configs with `baseline_mapping_key` field
- `esg_targets`: Target config with `kpi_id`
- `emission_records`: GHG module emission data
- `environment_records` / `social_records` / `governance_records`: ESG data

## Key API Endpoints
- `GET /api/dashboard/esg-analytics` - Time series for charts (metric behavior-aware)
- `GET /api/esg-records/dashboard-metrics` - Aggregated KPI totals
- `POST /api/kpi-engine/calculate` - Calculate KPI value
- `GET /api/esg-targets/with-progress` - Targets with progress

## 3rd Party Integrations
- Cloudflare R2 (Storage)
- Resend (Emails)
