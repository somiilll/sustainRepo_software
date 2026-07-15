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
│   │   ├── esg_records/ (ghg_integration.py)
│   │   ├── emissions/ (router.py, service.py)
│   │   └── ...
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── ESGTargetForm.js (4-step wizard)
│       │   ├── ESGTargetsTab.js (target list with progress)
│       │   └── ...
```

## What's Been Implemented

### Core KPI Engine
- KPI calculation engine (`kpi_engine`) with REST APIs
- Endpoints: `/api/kpi-engine/calculate`, `calculate_by_code`, `batch`, `dimension`
- Dynamic COUNT/SUM records based on KPI config
- Period filtering (daily, monthly, quarterly, yearly)

### GHG Module Adapter (Jul 10, 2026)
- **`ghg_adapter.py`**: Routes GHG-linked KPIs to `emission_records` collection
- Uses `baseline_mapping_key` field on KPI definitions for scope/category mapping
- Precise category matching (C1 vs C10 disambiguation via regex)
- Correctly sums `total_emissions` from GHG module data

### ESG Target Form Fixes (Jul 10, 2026)
- Tracking mode moved from Step 4 to Step 2 (Target Definition)
- Percentage target type hidden for non-static tracking modes
- Baseline mandatory for static tracking mode
- Fixed API endpoint `/api/organizations/current` → `/api/organizations/my` (CY/FY bug)
- `baseline_mapping_key` stored on KPI definitions for direct baseline config lookup

### Baseline Auto-Fetch Fix (Jul 10, 2026)
- Added `baseline_mapping_key` field to 22 GHG KPI definitions in DB
- Backend lookup endpoint returns `baseline_mapping_key` in hierarchy response
- Frontend uses `baseline_mapping_key` (falls back to `metric_code`)
- Fixed category matching in baseline_service.py (C1 vs C10 bug)

### Target Progress
- `/api/esg-targets/with-progress` calculates on-the-fly progress
- Frontend `ESGTargetsTab.js` displays dynamic percentage progress badge
- Progress logic handles `upper_limit`, `lower_limit`, `range`, `exact` goals

### Executive ESG Dashboard KPI Set (Jul 15, 2026)
- Replaced legacy executive KPI cards with the requested 11-card set: Total Emissions, production-based GHG and Energy Intensity, Renewable Energy, Water Recycled, Waste Recovery, Employees, Female Workforce, LTIFR, Accounts Payable Days, and Employee Turnover.
- Total Emissions is Scope 1 + Scope 2 + Scope 3; GHG Intensity uses Scope 1 + Scope 2 divided by production quantity; Energy Intensity uses total MWh divided by production quantity.
- Water dashboard aggregation now returns `water.recycled` in KL from dedicated `Water / Recycle` records, respecting organization, facility, and reporting-period filters.
- Renamed the combined dashboard module to `DashboardESG.jsx`; Female Workforce % is now displayed within the Employees card rather than as a separate KPI card.

## Pending Issues

### P0: Water Withdrawal KPI Source Filters Missing
- Six seeded Water Withdrawal KPI definitions still need `field_values.source_type` filters injected into `esg_kpi_definitions`.
- This is required for accurate source-level water calculations.

### P1: Dashboard Scope 1 & 3 Emissions Deduplication Bug
- In `dashboards/router.py`, `should_include_emission` filter causing issues
- Status: NOT STARTED

### P1: Carbon Intensity Calculation Discrepancy
- Check `generate_ghg_inventory_report` in `reports/router.py` ~lines 818-830
- Status: NOT STARTED

## Upcoming Tasks
- P1: Cron job for marking tasks as "overdue" when `due_at` passes
- P1: Replace dummy data with actual backend data in Environment visualizations

## Future/Backlog
- P2: KPI Definition Engine enhancements (version history, refresh/storage schema, category_id linking)
- P2: Dynamic ESG Disclosure Engine
- P2: Sentry Error Monitoring Integration
- P2: kpi_engine scalability (server-side MongoDB aggregation)

## Key Data Models
- `esg_kpi_definitions`: KPI configs with `baseline_mapping_key` field
- `esg_targets`: Target config with `kpi_id`
- `emission_records`: GHG module emission data (scope, category, total_emissions)
- `base_year_emissions`: Base year emissions data
- `environment_records` / `social_records` / `governance_records`: ESG questionnaire data

## Key API Endpoints
- `POST /api/kpi-engine/calculate` - Calculate KPI value
- `GET /api/esg-targets/with-progress` - Targets with progress
- `GET /api/esg-targets/baseline/lookup?metric_key=X` - Baseline auto-fetch
- `GET /api/esg-targets/lookup/categories?section=X` - KPI hierarchy for target form

## 3rd Party Integrations
- Cloudflare R2 (Storage)
- Resend (Emails)
