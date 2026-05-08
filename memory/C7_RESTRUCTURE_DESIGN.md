# C7 Employee Commuting Data Model Restructure - Design Document

## Current Architecture (Problems)

### Current Data Model
```json
{
  "id": "emission-uuid",
  "facility_id": "facility-uuid",
  "scope": "scope3",
  "category": "C7 - Employee Commuting",
  "reporting_year": 2025,
  "employees": [
    {
      "id": "emp-uuid-1",
      "name": "John Smith",
      "employee_id": "EMP001",
      "department": "Engineering",
      "monthly_data": {
        "jan": { "inputs": {...}, "emissions": { "co2e": 50 } },
        "feb": { "inputs": {...}, "emissions": { "co2e": 45 } },
        ...
        "dec": { "inputs": {...}, "emissions": { "co2e": 48 } }
      }
    },
    {
      "id": "emp-uuid-2",
      "name": "Jane Doe",
      "employee_id": "EMP002",
      "department": "Marketing",
      "monthly_data": {
        "apr": { "inputs": {...}, "emissions": { "co2e": 30 } },
        "may": { "inputs": {...}, "emissions": { "co2e": 32 } },
        ...
      }
    }
  ],
  "monthly_totals": {...},
  "yearly_total": { "co2e": 1250 }
}
```

### Problems with Current Approach
1. **Single Large Document**: All employees for entire year in one record
2. **Difficult to Audit**: Individual month changes hard to track
3. **Performance**: Large document for organizations with many employees
4. **Edit Complexity**: Edit dialog must load/display all 12 months × all employees
5. **Version History**: Cannot track month-specific changes easily
6. **Reporting**: Aggregation queries become complex
7. **Partial Year Data**: Employees with different join dates create sparse data

---

## Proposed Architecture

### New Data Model: Monthly Parent Entries

Each reporting month creates a **separate parent emission entry** containing all employees active in that month.

```json
// January 2025 Entry
{
  "id": "emission-jan-2025-uuid",
  "facility_id": "facility-uuid",
  "scope": "scope3",
  "category": "C7 - Employee Commuting",
  "reporting_year": 2025,
  "reporting_month": "jan",
  "reporting_period": "2025-01",
  "c7_data_model_version": 2,
  "employees": [
    {
      "id": "emp-uuid-1",
      "name": "John Smith",
      "employee_id": "EMP001",
      "department": "Engineering",
      "activity_type": "car_travel",
      "activity": "Daily Commute",
      "calculation_method": "supplier_basis",
      "inputs": {
        "distance_travelled": 660,
        "working_days": 22,
        "emission_factor": 0.17,
        "emission_factor_unit": "kgCO2e/km"
      },
      "emissions": {
        "co2e": 112.2
      }
    },
    {
      "id": "emp-uuid-2",
      "name": "Jane Doe",
      "employee_id": "EMP002",
      "department": "Marketing",
      "activity_type": "bus_travel",
      "activity": "Public Transit",
      "calculation_method": "activity_basis",
      "inputs": {
        "distance_travelled": 440,
        "working_days": 22
      },
      "emissions": {
        "co2e": 22.0
      }
    }
  ],
  "monthly_total": {
    "co2e": 134.2,
    "employee_count": 2
  },
  "version_history": [...],
  "created_at": "2025-01-31T...",
  "created_by": "user-uuid"
}

// February 2025 Entry
{
  "id": "emission-feb-2025-uuid",
  "facility_id": "facility-uuid",
  "scope": "scope3",
  "category": "C7 - Employee Commuting",
  "reporting_year": 2025,
  "reporting_month": "feb",
  "reporting_period": "2025-02",
  "c7_data_model_version": 2,
  "employees": [
    {
      "id": "emp-uuid-1",  // Same employee, different month entry
      "name": "John Smith",
      ...
    }
    // Jane Doe NOT in February (maybe she left)
  ],
  "monthly_total": {
    "co2e": 108.5,
    "employee_count": 1
  }
}
```

---

## Key Benefits

### 1. Cleaner UX
- Edit dialog opens **one month at a time**
- Much simpler form with fewer employees visible
- Clear month selection in UI

### 2. Better Auditability
- Each month has its own version history
- Changes tracked per-month granularly
- Old/new value diffs per employee per month

### 3. Improved Performance
- Smaller documents (one month vs. 12 months)
- Faster queries for specific month data
- Pagination friendly

### 4. Easier Reporting
- Monthly queries are direct lookups
- FY/CY aggregation via simple date ranges
- Employee headcount per month readily available

### 5. Flexible Employee Tenure
- New employees appear only in months they're active
- Departed employees stop appearing in future months
- No sparse data within documents

---

## Implementation Plan

### Phase 1: Backend Changes

#### 1.1 New Endpoints
```
POST /api/emissions/c7/month
  - Create/update a single month's C7 entry
  - Accepts: facility_id, year, month, employees[]

GET /api/emissions/c7/{facility_id}/{year}
  - Returns all monthly entries for year
  - Aggregates yearly totals

GET /api/emissions/c7/{facility_id}/{year}/{month}
  - Returns single month entry

PUT /api/emissions/c7/{id}
  - Update single month entry (employees, inputs, etc.)

DELETE /api/emissions/c7/{id}
  - Delete single month entry
```

#### 1.2 Data Migration
- Identify existing C7 entries with old model
- Split into monthly entries
- Preserve `created_at`, `created_by`
- Add `c7_data_model_version: 2` flag
- Keep original as backup temporarily

#### 1.3 Version History Enhancement
- Track employee-level changes within monthly entry
- Store: `{ field, employee_id, old_value, new_value, changed_at, changed_by }`

### Phase 2: Frontend Changes

#### 2.1 Add Emission Form (C7)
- Month selector at top of Step 3
- Display employees for selected month only
- "Copy from previous month" button
- Employee add/remove per month

#### 2.2 Edit Dialog (C7)
- Month-wise tabs or dropdown
- Load single month data on edit
- Save updates single month entry

#### 2.3 Emissions List
- Group C7 entries by year
- Show monthly breakdown expandable
- Aggregate yearly totals in header

### Phase 3: Bulk Upload

#### 3.1 Template Changes
- C7 sheet now expects: Month, Employee Name, Employee ID, Activity, Inputs...
- Each row = one employee-month combination

#### 3.2 Processing Changes
- Group uploaded rows by (facility, year, month)
- Create/update monthly entries accordingly

---

## Database Index Recommendations

```javascript
// For C7 monthly lookups
db.emissions.createIndex({
  "facility_id": 1,
  "scope": 1,
  "category": 1,
  "reporting_year": 1,
  "reporting_month": 1
}, {
  partialFilterExpression: { "category": { "$regex": "C7" } }
});

// For employee search across months
db.emissions.createIndex({
  "facility_id": 1,
  "employees.employee_id": 1,
  "reporting_year": 1
}, {
  partialFilterExpression: { "category": { "$regex": "C7" } }
});
```

---

## Backward Compatibility

### Detection Logic
```javascript
function isOldC7Model(emission) {
  return emission.category?.includes('C7') && 
         !emission.reporting_month &&
         emission.employees?.some(e => e.monthly_data);
}

function isNewC7Model(emission) {
  return emission.category?.includes('C7') && 
         emission.reporting_month &&
         emission.c7_data_model_version === 2;
}
```

### Transition Period
1. Read: Support both models
2. Write: Always use new model
3. Display: Auto-detect and render appropriately
4. Migration: Background job converts old → new

---

## Open Questions

1. **Employee ID Uniqueness**: Should `employee_id` be unique across organization or just facility?
2. **Historical Edits**: Can users edit previous months? Lock period?
3. **Copy Forward**: Auto-populate from previous month or explicit action?
4. **Deletion**: Delete employee from all months or just one?

---

## Estimated Effort

| Phase | Task | Complexity |
|-------|------|------------|
| 1.1 | New API endpoints | Medium |
| 1.2 | Data migration script | Medium |
| 1.3 | Version history enhancement | High |
| 2.1 | Add form restructure | High |
| 2.2 | Edit dialog restructure | High |
| 2.3 | List view updates | Medium |
| 3.x | Bulk upload changes | Medium |

**Total**: ~3-4 development cycles depending on testing requirements

---

## Approval Required

Please review and confirm:
1. Is this approach acceptable?
2. Any changes to the proposed data model?
3. Priority of phases?
4. Answers to open questions?

Once approved, implementation can begin.
