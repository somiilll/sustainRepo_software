# ESG Platform - Product Requirements Document

## Original Problem Statement
Build a comprehensive ESG (Environmental, Social, Governance) tracking and reporting platform with:
1. Shared tasks model with multiple assignees per task
2. Separation of operational status from governance/approval status
3. GHG Integration module mapping emissions/energy to granular subcategories
4. Facility-level assignments with per-facility approvers
5. Approval workflow with edit tracking and re-approval flows

## Architecture
```
/app/
├── backend/
│   ├── modules/
│   │   ├── esg_records/ (Data Entry, Assignments, Task Engine, GHG Integration)
│   │   ├── esg_tracking/ (Tracker endpoints)
│   │   ├── esg_targets/ (Target definitions and baseline service)
│   │   ├── esg_kpi_definitions/ (Reusable KPI metric configurations)
│   │   ├── kpi_engine/ (Dynamic KPI calculation engine) - NEW
│   │   ├── approval_workflow/ (Approval queue & request engines)
├── frontend/
    └── src/
        ├── components/
        │   ├── tasks/
        │   ├── tracker/
        │   ├── kpi-definitions/ (5-step KPI wizard components)
        │   ├── ApproverQueue.js
        │   ├── ESGRecordsTracker.js 
        │   ├── ESGRecordsDataEntry.js 
```

## Key DB Schema
- `approval_requests`: Contains approval tickets with `is_edit`, `changes_summary`, `previous_field_values`
- `esg_task_assignees`: Junction table linking `task_id` to `user_id`
- `esg_reporting_tasks`: Holds `status` and `approval_status`
- `esg_targets`: Generic target definitions (metric_key, tracking values, goal types, scopes)
- `esg_kpi_definitions`: Reusable KPI metric configurations (source, aggregation, filters, units, visibility)
- `environment_records` / `social_records` / `governance_records`: ESG data collections queried by kpi_engine

## Completed Features

### July 2026
- **KPI Calculation Engine (`kpi_engine`)** - P0 COMPLETE (July 10, 2026)
  - Backend: `/app/backend/modules/kpi_engine/` with calculator.py, aggregators.py, filters.py, utils.py, router.py
  - API endpoints: `/api/kpi-engine/calculate`, `/api/kpi-engine/calculate/batch`, `/api/kpi-engine/calculate/dimension`, `/api/kpi-engine/health`
  - Features:
    - Dynamic KPI calculation by `kpi_id` or `metric_code`
    - SUM aggregation when KPI has `value_field`, COUNT when no `value_field`
    - Auto-selects correct collection based on KPI section (environment_records, social_records, governance_records)
    - MongoDB query building from KPI filters (supports =, !=, >, <, >=, <=, in, not_in, between, contains, starts_with)
    - Batch calculation for multiple KPIs
    - Dimension-based grouping (group by facility_id, subcategory, etc.)
    - Period filtering (year, month, quarter, date range)
    - Facility-level scope filtering
  - Test coverage: 11/11 pytest tests pass (100%)

- **ESG KPI Definition Engine (Super Admin)** - P0 COMPLETE
  - Backend: `/app/backend/modules/esg_kpi_definitions/` with contracts.py, service.py, router.py
  - API endpoints: `/api/esg-kpi-definitions` (CRUD, duplicate, archive, lookup)
  - Frontend: 5-step wizard at `/super-admin/kpi-definitions`
    - Step 1: Identity (name, description, auto-generated metric_code, section, category hierarchy, tags)
    - Step 2: Data Source (records/manual source type, records config with section/value_field)
    - Step 3: Query Builder (aggregation type: sum/count/avg/min/max, filters with operators, dimensions)
    - Step 4: Units (output type, default unit, supported units, unit conversion, decimal places, display settings)
    - Step 5: Settings (visibility flags for dashboard/reports/tracking/targets/analytics, supported_scopes, status)
  - Features: Create, edit, duplicate, archive, delete KPIs; filter by section/status/search; stats cards
  - 320 predefined ESG KPIs seeded across Environment, Social, Governance sections
  - Test coverage: Backend pytest 7/7 pass, Frontend Playwright all pass

- **ESG Targets Module Integration with KPI Definitions** - P0 COMPLETE
  - Targets now reference `kpi_id` from `esg_kpi_definitions` instead of static `metric_key`
  - Backward compatibility maintained (`kpi_id` is optional)
  - Target list UI displays KPI names from definitions

### December 2024
- **Approver Queue ESG Record View**: Added `RecordApprovalPanel` for editable ESG records from queue with `field_definitions`
- **Re-approval Tracking**: Editing approved records generates `is_edit: true` approval requests with `changes_summary`
- **Multi-Assignee Facility Level Assignments**: Unique user/approver assignments per facility
- **Task Cleanup Logic**: Orphaned `esg_task_assignees` purged on assignment deletion
- **Period Validation**: Non-admin users blocked from unassigned reporting periods
- **Dual-status Synchronization**: Approval/rejection cascades status correctly
- **Month Data Normalization**: Fixed numeric-to-string month mapping
- **Approval Workflow Error Handling**: ESG records handle approvals without pre-existing workflow documents
- **GHG Integration Subcategory Mapping**: 
  - Scope 1/2/3 → `GHG Emissions - Scope 1/2/3`
  - Biogenic → `GHG Emissions - Biogenic (Direct/Indirect)`
  - Energy Scope 1 → `Fuel Within Organization`
  - Energy Scope 2 (electricity) → `Electricity Within Organization`
  - Energy Scope 2 (heat/steam) → `Heating Within Organization`

## Known Issues (Deferred)
1. **Dashboard Scope 1 & 3 Emissions Deduplication Bug** - P1
   - Location: `/app/backend/modules/dashboards/router.py`
   - Fix: Bypass `should_include_emission` filter
   
2. **Carbon Intensity Calculation Discrepancy** - P1
   - Location: `reports/router.py` lines 818-830
   - Fix: Check `generate_ghg_inventory_report` logic

3. **Missing filters on seeded Water Withdrawal KPIs** - P0
   - 6 Water Withdrawal KPIs need `source_type` filters (Ground Water, Surface Water, etc.)
   - Required for accurate kpi_engine calculations

## Upcoming Tasks (P1)
- Implement overdue task cron job for automatic `"overdue"` status
- Build Targets subtab UI inside Metrics
- Replace dummy data with actual backend data in Environment visualizations

## KPI Definition Engine - Pending Enhancements (P2)
Saved for later implementation:
1. **Version History UI** (MEDIUM)
   - Create `esg_kpi_definition_versions` collection for snapshots
   - Add "View Versions" action in dropdown menu
   - Build version history modal showing field-level changes
   
2. **Refresh & Storage Strategy fields** (SMALL)
   - Add `refresh_strategy`: manual, on_record_update, hourly, daily, monthly
   - Add `result_storage_strategy`: calculate_live, cache, persist
   - Add UI controls in Step 5 (Settings)
   
3. **Table Columns Enhancement** (SMALL)
   - Add columns: Category, Subcategory, Aggregation, Dashboard Enabled, Target Enabled
   
4. **category_id Storage** (SMALL)
   - Store `category_id` from esg_record_categories at top level for proper linking

## Future/Backlog (P2)
- Dynamic, metadata-driven ESG Disclosure Engine
- Sentry Error Monitoring Integration
- kpi_engine scalability: MongoDB server-side aggregation for large datasets
- kpi_engine cache invalidation on KPI definition updates

## 3rd Party Integrations
- Cloudflare R2 (Storage) - requires User API Key
- Resend (Emails) - requires User API Key

## Test Credentials
See `/app/memory/test_credentials.md`
