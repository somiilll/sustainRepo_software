# SustainRepo - GHG Calculation Platform PRD

## Latest Updates (April 22, 2026)
- **NEW MODULE**: Audit Trails - Full audit logging system for tracking all user and admin activities
- **P0 Fix Complete**: Version History cleanup - removed "Initial Values" section, filtered null values from changes display, no-op detection prevents empty updates

## Original Problem Statement
Multi-tenant Greenhouse Gas (GHG) calculation platform with dynamic, configuration-driven emissions calculation engine managed by SuperAdmin.

## Core Architecture
- **Frontend:** React + Tailwind CSS + Shadcn UI
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **File Storage:** Cloudflare R2 (S3-compatible)
- **3rd Party:** Anthropic (AI summaries), Resend (emails), ReportLab (reports), Matplotlib (charts), Playwright + mammoth (PDF generation)

---

## What's Been Implemented (Latest Session - 2026-04-22)

### NEW: Audit Trails Module (COMPLETED)
**Purpose**: Comprehensive activity logging and monitoring system for compliance and auditing.

**Backend** (`audit_logger.py`, `server.py`):
1. New `AuditLogger` class with methods:
   - `log()`: Record any action with who/what/where/when/before/after
   - `get_logs()`: Paginated, filtered retrieval
   - `get_activity_summary()`: Statistics by action/module/user
2. API Endpoints (admin-only):
   - `GET /api/audit-logs`: List with filters (module, action, user, date range, search)
   - `GET /api/audit-logs/summary`: Activity statistics
   - `GET /api/audit-logs/{id}`: Single log detail
   - `GET /api/audit-logs/filters/options`: Available filter values

**Frontend** (`AuditTrails.js`):
1. Summary cards: Total Events, Creates, Updates, Logins
2. Filterable table: Time, User, Action, Module, Description, Status
3. Detail dialog: Full log info with old/new values, metadata
4. Pagination and sorting

**Logged Actions**:
- Login (success/failure with IP)
- Facility create/update
- Emission create/update/delete
- Organization update

### P0: 100% Dynamic Emission Record Structure (COMPLETED)

**Problem**: Emission records were using hardcoded legacy field names (`quantity`, `calorific_value`, `override_calorific_value`, etc.) requiring code changes for each new variable.

**Solution**: Migrated to a fully dynamic structure using:
- `dynamic_field_values`: Dict of variable_name → {value, unit, is_override, justification}
- `outputs`: Dict of gas → {value, unit}

**Backend Changes** (`server.py`):
1. New Pydantic models:
   - `DynamicFieldValue`: {value, unit, is_override, justification}
   - `EmissionRecordCreate`: Uses `dynamic_field_values` and `outputs` dicts
   - `EmissionRecordResponse`: Reads from dynamic structure with convenience accessors
2. Create/Update endpoints extract `co2_emissions`, `ch4_emissions`, etc. from `outputs` dict
3. Old legacy fields completely removed from schema

**Frontend Changes** (`Emissions.js`, `EmissionEntryForm.js`):
1. **handleSubmit** (Emissions.js): Builds `dynamic_field_values` by iterating `dynamicInputFields`
2. **handleSubmit** (EmissionEntryForm.js): Same dynamic payload construction for Add flow
3. **Edit loading**: Reads from `emission.dynamic_field_values` with fallback to audit log
4. **List display**: Reads quantity from `dynamic_field_values.qty` and emissions from `outputs.*`
5. **Reporting Month fix**: Added `parseReportingPeriod()` to handle "February 2025" → "2025-02" conversion

**Key Data Structure**:
```javascript
{
  "dynamic_field_values": {
    "qty": {"value": 500, "unit": "kL"},
    "cv": {"value": 38.6, "unit": "MJ/L", "is_override": true, "justification": "Test"},
    "density": {"value": 0.85, "unit": "kg/L", "is_override": false}
  },
  "outputs": {
    "co2": {"value": 1350.5, "unit": "tCO2"},
    "ch4": {"value": 0.05, "unit": "tCH4"},
    "n2o": {"value": 0.01, "unit": "tN2O"},
    "co2e": {"value": 1356.8, "unit": "tCO2e"}
  }
}
```

**Test Status**: 
- Backend: 100% (5/5 pytest tests pass)
- Frontend: Verified via screenshot - list displays correct values, edit dialog loads fields with correct override states

---

## Previous Session Changes (2026-04-21)

### Removed Legacy Code
- Deleted `calculatedEmissions` useMemo (frontend formula calculations)
- Removed Process Emissions specific hardcoded UI blocks
- Removed Custom Fuel Type override logic (`useCustomFuelType`)
- Deleted legacy SuperAdmin pages: `Formulas.js`, `CalculationFormulas.js`, `EmissionConfiguration.js`

### Added Backend Fallback
- `router.py`: If category lacks decision tree, directly looks up formula by `category_id`

---

## Prioritized Backlog

### P1 - Upcoming Tasks
1. Implement 'Copy as test case' button in Calculation Sandbox
2. Implement Scope 3 emissions module
3. Migrate Report Generation to AWS Lambda Async Job Queue
4. Create a public-facing landing page

### P2 - Future Tasks
1. Implement CBAM module and report template
2. Refactor `backend/server.py` into structured package
3. Refactor `Emissions.js` (~3800 lines) into smaller sub-components:
   - Extract `EditEmissionDialog`
   - Extract `AddEmissionDialog` 
   - Extract `EmissionCard`
4. Fix Radix Select hydration warning (span in option)
5. Add aria-describedby to DialogContent

---

## Key API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/calc-engine/execute-by-category` | POST | Execute calculation for category |
| `/api/calc-engine/form-config/{category_id}` | GET | Get dynamic form config |
| `/api/user/calc-engine/audit-log/{emission_id}` | GET | Get audit log for emission |
| `/api/emissions` | POST/PUT | Create/Update emission (new dynamic structure) |

---

## Test Credentials
- **SuperAdmin**: superadmin@ecotrack.com / SuperAdmin123!
- **Admin (Org 2)**: goyalsomil2@hotmail.com / Test123!

---

## Files of Reference
- `/app/frontend/src/pages/Emissions.js` - Main emissions page (edit flow)
- `/app/frontend/src/components/EmissionEntryForm.js` - Add emission wizard
- `/app/backend/server.py` - API endpoints and models
- `/app/backend/calc_engine/router.py` - Calculation engine router
- `/app/backend/calc_engine/execution.py` - Formula execution
- `/app/backend/calc_engine/properties.py` - Property resolution
