# SustainRepo - GHG Calculation Platform PRD

## Latest Updates (December 2025)

### Scope 3 EF Default Unit for Activity Value (P0 - COMPLETE)
- **New Field**: Added `default_unit` field to Scope3EF table for auto-conversion of activity values
- **Backend**: Updated `Scope3EFCreate` and `Scope3EFResponse` models in `/app/backend/server.py`
- **Frontend**: SuperAdmin can select `default_unit` from `allowed_units` dropdown in Scope 3 EF form
- **Calc Engine**: When processing Scope 3 activity_value, if `scope3_ef_default_unit` is provided in context, it's used as the target conversion unit (fallback to formula's `expected_unit` if not set)
- **Test Coverage**: 7 tests passing (create/update/get with default_unit, null handling, clearing default_unit)

## Previous Updates (April 30, 2026)

### Scope 3 Bulk Upload System (P0 - COMPLETE)
- **Template Generation**: Excel template with dropdowns for Scope 3 categories, activities, methods
- **3-Layer Validation**: Schema (required fields, types), Referential (facility/category/activity lookup), Calculation (unit/method compatibility)
- **Fuzzy Matching**: Using `rapidfuzz` with `token_set_ratio` for categories (handles "Purchased Goods" → "Purchased Goods and Services")
- **Unit Validation**: Excludes composite EF units (tCO2e, kgCO2) from physical unit matching
- **Fixed**: Currency units (INR, USD) now correctly rejected for activity_basis method

### GHG Module - Region & Year-Based Fuel Filtering (COMPLETE)
Enhanced fuel selection logic with multi-level fallback:
1. **Region Priority**: Facility-specific region → Global → Any available
2. **Year Priority**: Exact year match → Most recent before target → Null year (timeless) → Any
3. **Combined Logic**: Region priority applied first, then year within each region group
4. **UI Enhancement**: Fuel dropdown now shows region/year info, selected fuel displays metadata

## Previous Updates (April 29, 2026)
- **NEW FEATURE**: Bulk Upload System for GHG Emissions Data
  - Excel template download with dropdowns and validation rules
  - Reference sheet with valid facilities, scopes, categories, activities, units
  - 3-layer validation: Schema → Referential → Calculation
  - Fuzzy matching with suggestions (case-insensitive, handles typos)
  - User decision options: Save valid rows, Download error report, Re-upload
  - Audit trail for all uploads
  - Aligned with GHG Protocol and ISO 14064

## Previous Updates (April 28, 2026)
- **P0 Fix**: Dynamic Scope/Category dropdowns in Scope 3 EF module now working correctly
- **NEW**: Industry Sectors in Scope 3 EF now use sectors from SuperAdmin Sectors module (dynamic)
- **NEW**: Unit dropdown in Scope 3 EF now uses BOTH simple + compound units from CalcEngine Units module
- **NEW**: Units module now supports custom unit types (e.g., "currency") beyond mass/volume/energy
- **NEW**: Property Source Mapping now supports:
  - **Scope 3 EF source table** with configuration section (source field dropdown, lookup fields)
  - **Filter Conditions** with dropdown for field selection (SuperAdmin doesn't need to know backend field names)
  - **Sort By** dropdown showing all fields
  - Conditions support operators: equals, not_equals, greater_than, less_than, in, contains, exists
  - Value can reference context variables using "From context" checkbox
- **NEW**: Scope 3 EF allowed_units field for defining input units per activity
- **FIX**: Calculation Sandbox shows Activity dropdown (from Scope 3 EF) for Scope 3 instead of Fuel dropdown
- **FIX**: Method values in Scope 3 EF standardized to match Decision Tree (spend_basis, activity_basis)

## Original Problem Statement
Multi-tenant Greenhouse Gas (GHG) calculation platform with dynamic, configuration-driven emissions calculation engine managed by SuperAdmin.

## Core Architecture
- **Frontend:** React + Tailwind CSS + Shadcn UI
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **File Storage:** Cloudflare R2 (S3-compatible)
- **3rd Party:** Anthropic (AI summaries), Resend (emails), ReportLab (reports), Matplotlib (charts), Playwright + mammoth (PDF generation)

---

## Key API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/bulk-upload/template` | GET | Download Scope 3 Excel template |
| `/api/bulk-upload/validate` | POST | Validate uploaded Excel file |
| `/api/bulk-upload/{id}/save` | POST | Save valid rows |
| `/api/bulk-upload/{id}/error-report` | GET | Download error report Excel |
| `/api/bulk-upload/sessions` | GET | List recent upload sessions |
| `/api/calc-engine/execute-by-category` | POST | Execute calculation for category |
| `/api/calc-engine/form-config/{category_id}` | GET | Get dynamic form config |
| `/api/emissions` | POST/PUT | Create/Update emission (dynamic structure) |

---

## Prioritized Backlog

### P0 - Critical (User Verification Pending)
1. ✅ Scope 3 Bulk Upload System - COMPLETE, awaiting user testing

### P1 - High Priority
1. Expand Bulk Upload to Scope 1 & Scope 2 (after user approval of Scope 3)
2. Restrict Scope 3 access based on organization subscription (`enabled_access`)
3. Implement 'Copy as test case' button in Calculation Sandbox
4. Implement full Scope 3 emissions module

### P2 - Future Tasks
1. Implement CBAM module and report template
2. Migrate Report Generation to AWS Lambda Async Job Queue
3. Refactor `backend/server.py` into structured package (7000+ lines)
4. Refactor `Emissions.js` (~3900 lines) into smaller sub-components
5. Create a public-facing landing page

---

## Test Credentials
- **SuperAdmin**: superadmin@ecotrack.com / SuperAdmin123!
- **Admin (Org 2)**: goyalsomil2@hotmail.com / Test123!

---

## Files of Reference
- `/app/backend/bulk_upload.py` - Bulk upload API (template, validation, save, error report)
- `/app/frontend/src/pages/BulkUpload.js` - Bulk upload UI
- `/app/frontend/src/pages/Emissions.js` - Main emissions page with region/year filtering
- `/app/frontend/src/components/EmissionEntryForm.js` - Add emission wizard with region/year filtering
- `/app/frontend/src/pages/Scope3EF.js` - Scope 3 Emission Factors module (includes default_unit field)
- `/app/backend/calc_engine/router.py` - Calculation engine router
- `/app/backend/calc_engine/execution.py` - Formula execution (uses scope3_ef_default_unit for activity_value conversion)
- `/app/backend/calc_engine/properties.py` - Property resolution with conditions
- `/app/backend/calc_engine/expression.py` - Expression evaluation (fixed ast.Num deprecation)
- `/app/backend/tests/test_scope3_default_unit.py` - Tests for default_unit feature
