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

### Enhanced Excel-Based Bulk Upload (NEW - Dec 2025)
- **Multi-sheet template** with 17 sheets (Instructions, C1-C15, hidden _Data)
- **Dynamic dropdowns** per category based on database data
- **Sheet protection** - locked structure, unlocked data cells
- **Category-specific columns** - Employee Name/ID for C7 (Employee Commuting)
- **Cascading validation** for methods, activities, units
- **Fuzzy matching** for typo tolerance
- **Error report download** with row-by-row error details
- **Category breakdown** in validation results UI

### Supplier Hotspot Heatmap (Dashboard Feature)
- **Backend API**: `GET /api/dashboard/supplier-hotspots`
  - Aggregates Scope 3 emissions by category and supplier
  - Returns hierarchical data with monthly trends
  - Top 20 suppliers ranking
- **Frontend Component**: `SupplierHotspotHeatmap.jsx`
  - Treemap visualization using @visx/hierarchy
  - Two-level drill-down: Categories → Suppliers → Detail
  - Color-coded categories (red=high, green=low)
  - Supplier detail modal with trend chart and records list

### User Interface
- Role-based access control (SuperAdmin, Admin, User)
- Dynamic field filtering based on formula requirements
- Search functionality in GHG Emissions module
- Live calculation preview

## Recent Changes (Dec 2025)

### Enhanced Bulk Upload System
- Multi-sheet Excel template (C1-C15 categories)
- Instructions sheet with detailed guidelines
- Hidden _Data sheet with valid values for dropdowns
- Category-specific validation rules
- Fuzzy matching for facility names and activities
- Error report Excel download
- Category breakdown in validation results

### Scope 3 Supplier/Employee Fields
- Added `supplier_name` and `supplier_code` for ALL Scope 3 emissions (optional)
- Added `employee_name` and `employee_id` for Employee Commuting category (optional)
- Fields appear in Step 1 of Add Emission form and Edit dialog

### Supplier Hotspot Heatmap
- Treemap visualization of Scope 3 emissions by category
- Drill-down from category to individual suppliers
- Monthly trend charts per supplier
- Recent emission records list

## Technical Architecture

### Backend
- FastAPI with Motor async driver
- MongoDB database
- JWT authentication
- Calculation engine in `/app/backend/calc_engine/`
- Bulk upload module in `/app/backend/bulk_upload_enhanced.py`

### Frontend
- React with Tailwind CSS
- Shadcn/UI components
- Visualization: @visx/hierarchy, Recharts
- Key files:
  - `EmissionEntryForm.js` - Add emission wizard
  - `Emissions.js` - GHG Emissions page with edit form
  - `Dashboard.js` - Main dashboard with analytics
  - `BulkUpload.js` - Bulk upload interface
  - `SupplierHotspotHeatmap.jsx` - Treemap visualization

### Key Collections
- `scope3_ef`: Emission factors with allowed_units, default_unit
- `emissions`: Emission records with supplier_name/code, employee_name/id
- `bulk_upload_sessions`: Upload session tracking
- `ce_decision_trees`: Formula selection rules

## Critical Technical Notes

### Unit Strictness
Volume unit symbols are STRICTLY: `ml`, `kl`, `m3` (lowercase l, regular 3)

### Context Overrides
`scope3_ef_default_unit` fallback is `|| ''` (empty string), NOT `|| null`

### Decision Trees
Calculation method for supplier basis MUST be `'supplier_basis'` (not `'supplier_based'`)

### Bulk Upload Template
- Template is generated dynamically per organization
- Dropdowns are category-specific based on scope3_ef data
- Example rows contain "Example" or "[your facility]" or "delete before upload" text (skipped during validation)
- **Enhanced validation error messages (Dec 2025)**: Unit validation errors now display the specific `allowed_units` array for the selected activity instead of generic suggestions
- **Collection fix (Dec 2025)**: Bulk upload now saves to `emission_records` collection (previously incorrectly saved to `emissions` collection)

## Pending Tasks

### P1 (High Priority)
- [ ] Implement 'Copy as Test Case' in Calculation Sandbox
- [ ] Expand Bulk Upload to Scope 1 & Scope 2

### P2 (Medium Priority)
- [ ] Geographic heatmap for suppliers (requires location data)
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
