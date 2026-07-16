# ESG Platform - Product Requirements Document

## Original Problem Statement
Build a comprehensive ESG (Environmental, Social, Governance) Platform with dynamic KPI engine, executive dashboard, data entry, targets, and reporting capabilities.

## Architecture
```
/app/
├── backend/
│   ├── modules/
│   │   ├── esg_records/ (services/dashboard/, ghg_integration.py)
│   │   ├── dashboards/ (esg_analytics_service.py)
│   │   ├── organizations/ (contracts.py - module_access field)
│   │   ├── kpi_engine/, esg_kpi_definitions/, esg_targets/
│   │   └── emissions/
├── frontend/
│   └── src/
│       ├── config/sidebarConfig.js (menu hierarchy definition)
│       ├── hooks/useModuleAccess.js (access flag hook)
│       ├── components/Sidebar.js (config-driven hierarchical sidebar)
│       ├── modules/dashboard/ (DashboardESG, ExecutiveAnalyticsDashboard)
│       ├── components/ESGRecordsDataEntry.js
│       └── pages/PlaceholderPage.js
```

## What's Been Implemented

### Phase 1: Sidebar Restructure (Jul 16, 2026)
- Config-driven hierarchical sidebar with 3-level nesting
- Menu config at `/config/sidebarConfig.js` — single source of truth
- `useModuleAccess` hook for per-module access flags
- `module_access: Dict[str, bool]` field added to organization schema
- Placeholder pages for new modules (Biodiversity, Climate Change, Material, Tracker, KPI Metrics, Env/Social/Gov Targets)
- Backwards-compatible redirects for old routes
- New route structure: /environment/*, /workflow/*, /uploads/*, /targets/voluntary/*

### Dashboard Data Pipeline (Jul 15-16, 2026)
- Shared `unit_utils.py`: to_kilolitres, to_mwh, to_number
- Shared `date_utils.py`: build_date_filter for ALL period types
- is_current/status filters on all dashboard queries
- Metric behavior semantics: snapshot (carry-forward), flow (single month), ratio
- GHG energy data now feeds energy time series charts
- Proportional distribution for quarterly/yearly emission records
- CV unit conversion (_cv_to_tj_per_kg) for fuel energy calculations
- Fixed renewable electricity detection in _get_ghg_energy_breakdown
- Fixed org_query to use org_id only (not organization_id)
- Incidents Trend chart (data breaches + H&S + violations)
- Default dashboard date range changed to current FY

### ESG Data Entry Fixes
- FY dropdown format, edit form month mismatch, period validation

## Pending Issues
- P0: Water Withdrawal KPI source_type filters (20+ forks missed)
- P1: Dashboard Scope 1&3 emissions deduplication
- P1: Carbon Intensity calculation discrepancy
- P1: Emission record version deduplication (old+new versions both counted)

## Upcoming Tasks
- Phase 2: Fill placeholder pages (Biodiversity, GRI, Approver Queue)
- Superadmin UI for module_access checkbox grid
- Make metric_behavior config-driven via esg_kpi_definitions
- Cron job for overdue tasks
- Phase 2 Dashboard enhancements (PDF export, drill-down)

## Future/Backlog
- Dynamic ESG Disclosure Engine
- Sentry Error Monitoring
- MFA for admin users
- SBTi target validation rules

## Key API Endpoints
- GET /api/dashboard/esg-analytics - Time series (behavior-aware)
- GET /api/esg-records/dashboard-metrics - Aggregated KPI totals
- GET /api/dashboard/esg-summary - KPI card values
- GET /api/organizations/my - Org config + module_access

## 3rd Party Integrations
- Cloudflare R2 (Storage)
- Resend (Emails)
