# SustainRepo - GHG Calculation Platform PRD

## Original Problem Statement
Multi-tenant Greenhouse Gas (GHG) calculation platform compliant with ISO 14064-1:2018 standards.

## Core Features Implemented

### GHG Calculation Engine
- Dynamic GHG calculations with formula-based execution
- Support for Scope 1, Scope 2, Scope 3, and Biogenic emissions
- Configurable calculation methods (spend_basis, activity_basis, supplier_basis)
- Unit conversion system with chained conversions
- Decision tree for formula selection

### Scope 3 Emission Factors (scope3_ef)
- Database of emission factors with `allowed_units` and `default_unit`
- Activity-based and spend-based methods
- Auto-conversion of input values to default units
- Categories: Purchased Goods, Capital Goods, Upstream/Downstream Transportation, Employee Commuting, etc.

### Excel-Based Bulk Upload
- 3-layer validation engine
- Currently supports Scope 3 only (P1: Expand to Scope 1 & 2)

### User Interface
- Role-based access control (SuperAdmin, Admin, User)
- Dynamic field filtering based on formula requirements
- Search functionality in GHG Emissions module
- Live calculation preview

## Recent Changes (Dec 2025)

### Supplier Hotspot Heatmap (NEW - Dashboard Feature)
- **Backend API**: `GET /api/dashboard/supplier-hotspots`
  - Aggregates Scope 3 emissions by category and supplier
  - Returns hierarchical data with monthly trends
  - Top 20 suppliers ranking
- **Frontend Component**: `SupplierHotspotHeatmap.jsx`
  - Treemap visualization using @visx/hierarchy
  - Two-level drill-down: Categories → Suppliers → Detail
  - Color-coded categories (red=high, green=low)
  - Supplier detail modal with trend chart and records list
  - Breadcrumb navigation
- **Libraries Added**: @visx/hierarchy, @visx/group, @visx/scale, @visx/tooltip, @visx/responsive, @visx/event, d3-hierarchy

### Scope 3 Supplier/Employee Fields
- Added `supplier_name` and `supplier_code` for ALL Scope 3 emissions (optional)
- Added `employee_name` and `employee_id` for Employee Commuting category (optional)
- Fields appear in Step 1 of Add Emission form
- Fields appear in Edit Emission dialog

### Data Ingestions Completed
- Downstream Transportation and Distribution: 14 Spend-Based entries
- Upstream Transportation and Distribution: 14 entries
- Purchased Goods and Services: Updated allowed_units/default_unit
- Capital Goods: Updated allowed_units/default_unit

### Bug Fixes
- Fixed `default_unit` payload serialization (`|| null` → `|| ''`)
- Fixed `supplier_basis` naming mismatch in decision tree
- Standardized volume units (ml, kl, m3) for chained conversions
- Fixed emission card display for supplier-based calculations

## Technical Architecture

### Backend
- FastAPI with Motor async driver
- MongoDB database
- JWT authentication
- Calculation engine in `/app/backend/calc_engine/`

### Frontend
- React with Tailwind CSS
- Shadcn/UI components
- Key files:
  - `EmissionEntryForm.js` - Add emission wizard
  - `Emissions.js` - GHG Emissions page with edit form
  - `Scope3EF.js` - Scope 3 EF management
  - `Dashboard.js` - Main dashboard with analytics
  - `SupplierHotspotHeatmap.jsx` - Treemap visualization component

### Key Collections
- `scope3_ef`: Emission factors with allowed_units, default_unit
- `emissions`: Emission records with dynamic_field_values, outputs, supplier_name/code
- `ce_decision_trees`: Formula selection rules
- `units`, `ce_unit_conversions`: Unit management

## Critical Technical Notes

### Unit Strictness
Volume unit symbols are STRICTLY: `ml`, `kl`, `m3` (lowercase l, regular 3)
DO NOT use `mL`, `kL`, or `m³` - breaks chained conversions

### Context Overrides
`scope3_ef_default_unit` is passed to `execute-by-category` for auto-conversion
Fallback is strictly `|| ''` (empty string), NOT `|| null`

### Decision Trees
Calculation method for supplier basis MUST be `'supplier_basis'` (not `'supplier_based'`)

### Dashboard Date Filtering
Dashboard auto-detects financial year based on latest emission data
Supplier Hotspots respects the same date range filter

## Pending Tasks

### P1 (High Priority)
- [ ] Expand Bulk Upload to Scope 1 & Scope 2
- [ ] Implement 'Copy as Test Case' in Calculation Sandbox

### P2 (Medium Priority)
- [ ] Geographic heatmap view for suppliers (requires location data)
- [ ] CBAM module and report template
- [ ] Auto-save for GHG Emissions
- [ ] Refactor `server.py` (7000+ lines)
- [ ] Refactor `Emissions.js` (4400+ lines)

### Known Issues
- React Hydration Warnings (`<span>` in `<option>/<select>`)

## Test Credentials
- SuperAdmin: superadmin@ecotrack.com / SuperAdmin123!
- Admin: goyalsomil2@hotmail.com / Test123!

## 3rd Party Integrations
- Cloudflare R2 (Storage) - requires User API Key
- Resend (Emails) - requires User API Key
