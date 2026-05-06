# SustainRepo - GHG Calculation Platform PRD

## Original Problem Statement
Building a multi-tenant Greenhouse Gas (GHG) calculation platform named 'SustainRepo' with:
- Dynamic GHG calculations compliant with ISO 14064-1:2018
- Excel-Based GHG Bulk Upload System with 3-layer validation engine
- Advanced frontend validation for emission entries
- Role-based UI access control for Scope 3 emissions
- Context-driven calculation parameters
- Supplier hotspot visualizations on the dashboard

## Architecture
- **Frontend**: React, Tailwind CSS, Shadcn/UI
- **Backend**: FastAPI, Motor async driver, Pydantic
- **Database**: MongoDB
- **Key Patterns**: Nested Decision Trees for dynamic form rendering

## Key Technical Concepts
- **CalcEngine**: Dynamic calculation engine handling unit conversions, nested decision trees, and formulas
- **Nested Decision Trees**: Frontend dynamically builds input fields based on `/api/calc-engine/form-config/{category_id}`
- **Unit Fallback Logic**: For Scope 3: `scope3_ef.allowed_units` → `input_field_mappings.allowed_units` → `formula.expected_unit`

## Database Schema
- `emission_records`: {..., scope, scope3_ef_id, category, calculation_method_scope3, scope3_activity_type, dynamic_field_values}
- `scope3_ef`: {activity, activity_type, category, method, allowed_units, default_unit, emission_factor}
- `ce_input_field_mappings`: {field_key, maps_to_variable, unit_source, allowed_units, applies_to_categories, applies_to_scopes}

## Completed Features

### January 2026
- ✅ Added "Use Custom Activity" toggle for Biogenic Scope 3 with `supplier_basis` method
  - Updated `EmissionEntryForm.js` (Add form) - Biogenic Scope 3 Activity Selection block
  - Updated `Emissions.js` (Edit form) - Added condition to show Activity Selection for Biogenic Scope 3
  - Toggle shows text input for custom activity name when checked

### December 2025
- ✅ Fixed Scope 3 Unit Dropdown issue for C5 and all categories
  - Updated `ce_input_field_mappings.activity_value` to include all 15 Scope 3 category IDs
  - Updated frontend unit determination logic with clear priority chain
  - Fixed legacy `allowedUnits` memo to support Scope 3 activities

### Earlier Completed
- ✅ Ingested category.csv for C12 into scope3_ef table
- ✅ Fixed C6 and C7 with new activity_type column
- ✅ Added activity_type to scope3_ef backend schema and frontend SuperAdmin table
- ✅ Upgraded CalcEngine router for recursive nested decision tree traversal
- ✅ Rewrote frontend dynamicInputFields logic for nested decision fields
- ✅ Fixed edit dialog race conditions for activity_type pre-selection
- ✅ Multi-Employee Input for C7 Employee Commuting (forced default flow)

## Pending Issues
1. **P2**: React Hydration Warnings in `EmissionEntryForm.js` (console warnings about invalid HTML nesting)

## In Progress Tasks
1. **P1**: Expand Bulk Upload to Scope 1 & Scope 2
   - Create `bulk_upload_scope1.py` and `bulk_upload_scope2.py`

## Upcoming Tasks
1. **P1**: Implement 'Copy as test case' button in Calculation Sandbox

## Future/Backlog
- P2: Implement CBAM module and report template
- P2: Implement Auto-save for GHG Emissions
- P2: Geographic heatmap for Supplier Hotspots (requires supplier location data)
- P2: Refactor `backend/server.py` into structured package (7200+ lines)
- P2: Refactor `Emissions.js` into smaller sub-components (4600+ lines)
- P2: Refactor `EmissionEntryForm.js` (3200+ lines)

## Key Files
- `/app/backend/calc_engine/router.py` - Form config and tree traversal
- `/app/frontend/src/components/EmissionEntryForm.js` - GHG Creation Form
- `/app/frontend/src/pages/Emissions.js` - GHG page with Edit Dialog
- `/app/frontend/src/pages/Scope3EF.js` - SuperAdmin EF management

## 3rd Party Integrations
- Cloudflare R2 (Storage) - requires User API Key
- Resend (Emails) - requires User API Key

## Test Credentials
- SuperAdmin: superadmin@ecotrack.com / SuperAdmin123!
- Admin (Test Org): goyalsomil2@hotmail.com / Test123!
