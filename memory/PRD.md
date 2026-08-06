# ESG Platform - Product Requirements Document

## Original Problem Statement
Complete the Materiality Assessment UI, design premium ESG Dashboards, fix analytics mapping bugs, build missing UI, redesign the Assignment dialog into a step-by-step wizard, implement BRSR/GRI comprehensive questionnaire approval workflows.

## Current Session Focus
GHG Calculation Engine enhancements: Custom Fuel Types, new Composition of Carbon methodology for Stationary Combustion, and Decision Tree UI improvements (Wrap Node feature).

## Architecture Decisions

### Database Architecture (UNIFIED — FLAT STORAGE)
- **Single Collection**: `organization_esg_responses` 
- **Document Structure**: FLAT — one document per question_key (no nesting/sub_responses)
```javascript
{
  org_id: "uuid",
  question_key: "gri_101_2_a_i",
  framework: "GRI",
  reporting_year: "FY 2026-2027",
  section: "environment",
  value: "...",
  status: "saved",
  approval_status: "approved",
  ...
}
```

### GHG Calculation Engine Architecture
- **17 active formulas** in `ce_formulas` — each with stable UUID, versioned via `ce_formula_versions`
- **20 active decision trees** in `ce_decision_trees` — one per category_id, resolved at runtime
- **Decision tree IDs NOT stored in emission records** — trees looked up by `category_id` every calculation
- **502 fuels** in `fuel_database` — properties resolved via `ce_property_source_mappings`
- **Stationary Combustion** tree branches on `ef_quantity_provided` → heat-basis vs quantity-based
- **Key formula IDs**: `b52e732f` (heat-basis), `f863ca67` (quantity-based), `ed2819e3` (fugitives)

### Approval Queue Architecture
- **Two data sources merged** for approval queue
- **Approval Bypass**: Missing `approval_status` treated as "not_required"

## Completed Work (Aug 6 2026)

### Decision Tree Editor — Wrap Node Feature (P1)
- **File**: `/app/frontend/src/components/TreeNodeEditor.js`
- Added "Wrap" button to both `BranchNode` and `LeafNode` components
- Inline `WrapPrompt` component asks for option value, then wraps current node under new parent
- Works at any tree depth via existing `onUpdate` callback chain
- Extracted `OptionRow` as separate component for cleaner code
- `wrapNode()` pure helper function handles the tree restructuring
- **Status**: ✅ Implemented

## Upcoming Tasks (P1) — GHG Calc Engine

### Custom Fuel Type
- Add `POST /api/fuel-database/custom` for org-scoped custom fuels
- Custom fuels in same `fuel_database` collection with `is_custom: true`, `org_id`
- Frontend: "Custom Fuel" option in dropdown for Stationary/Mobile/Fugitive
- No formula changes needed — same property resolution pipeline

### Composition of Carbon Methodology (Stationary Combustion)
- New formula: `Qty × Composition_of_Carbon(%) × Oxidation_Factor × (44/12)`
- New variables: `composition_of_carbon` (input, %), `oxidation_factor` (input, ≤1, default 1)
- New input field mappings for the two variables
- Extend Stationary Combustion decision tree: `calculation_methodology` → `using_ncv` | `using_carbon_composition`
- Frontend: methodology selector in EmissionEntryForm, conditional field display

### Calculation Methodology Selector (Frontend)
- Add dropdown for Stationary Combustion: "Using NCV" (default) vs "Using Composition of Carbon"
- Dynamically show/hide fields based on selection
- Default to "using_ncv" for backward compatibility with existing records

## Upcoming Tasks (P1) — Other

- MIS Reports & Automation Module
- Hash-based Integrity Verification for Evidence Files
- Smart Follow-ups (Internal Data AI)
- SuperAdmin Config UI for Modules
- Supplier and Customer Org Onboarding Wizards
- Word document download option for BRSR
- Add "Previous Year Columns" to BRSR tables

## Pending Issues
- Orphaned OCR Temp Files (P2)
- Section A Approval Workflow Verification (P2)
- Environment Report PDF Character Spacing Bug (P2)
- React 19 Console Warnings — Recharts (P3)

## Future Tasks (P2+)
- Emission Form Refactoring
- SuperAdmin Org View (supplier org names)
- BRSRDetailsSection.js decomposition (1800+ lines)
- Remaining toLocaleString() migrations
- Materiality Assessment Phase 2+
- Dashboard Scope 1 & 3 Emissions Deduplication
- SOC 2 Compliance Implementation

## Key Files Reference

### Backend
- `/app/backend/calc_engine/execution.py` - CalcEngine executor
- `/app/backend/calc_engine/formulas.py` - Formula + Decision Tree CRUD
- `/app/backend/calc_engine/router.py` - Calc engine API endpoints
- `/app/backend/calc_engine/properties.py` - Property resolution
- `/app/backend/calc_engine/variables.py` - Variable registry
- `/app/backend/modules/emissions/router.py` - Emission record endpoints
- `/app/backend/modules/emissions/contracts.py` - Emission schemas

### Frontend
- `/app/frontend/src/components/TreeNodeEditor.js` - Decision tree node editor (UPDATED - Wrap Node)
- `/app/frontend/src/pages/DecisionTreeEditor.js` - Decision tree editor page
- `/app/frontend/src/components/EmissionEntryForm.js` - Emission entry form
- `/app/frontend/src/hooks/useCalcEngine.js` - Calc engine hook

## Test Credentials
- Admin: goyalsomil2001@gmail.com / TestUser123!
- SuperAdmin: superadmin@ecotrack.com
- Organization ID: 9067d872-8a3a-4ed9-8494-e3ef04952f7c
