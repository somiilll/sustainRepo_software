# ESG Platform - Product Requirements Document

## Original Problem Statement
Complete the Materiality Assessment UI, design premium ESG Dashboards, fix analytics mapping bugs, build missing UI, redesign the Assignment dialog into a step-by-step wizard, implement BRSR/GRI comprehensive questionnaire approval workflows.

## Current Session Focus
GHG Calculation Engine enhancements: Custom Fuel Types, new Composition of Carbon methodology for Stationary Combustion, and Decision Tree UI improvements (Wrap Node feature).

## Architecture Decisions

### Database Architecture (UNIFIED — FLAT STORAGE)
- **Single Collection**: `organization_esg_responses` 
- **Document Structure**: FLAT — one document per question_key (no nesting/sub_responses)

### GHG Calculation Engine Architecture
- **17 active formulas** in `ce_formulas` — each with stable UUID, versioned via `ce_formula_versions`
- **20 active decision trees** in `ce_decision_trees` — one per category_id, resolved at runtime
- **Decision tree IDs NOT stored in emission records** — trees looked up by `category_id` every calculation
- **502 fuels** in `fuel_database` — properties resolved via `ce_property_source_mappings`
- **Stationary Combustion Scope 1** tree now branches on `calculation_methodology` → `using_ncv` → `ef_quantity_provided`, or `using_carbon_composition` → Carbon Composition formula
- **Key formula IDs**: `b52e732f` (heat-basis), `f863ca67` (quantity-based), `ed2819e3` (fugitives), `d10c79f4` (carbon composition)

## Completed Work (Aug 6 2026)

### Decision Tree Editor — Wrap Node Feature (P1)
- **File**: `/app/frontend/src/components/TreeNodeEditor.js`
- Added "Wrap" button to both `BranchNode` and `LeafNode` components
- Inline `WrapPrompt` component asks for option value, then wraps current node under new parent
- Works at any tree depth via existing `onUpdate` callback chain
- **Status**: ✅ Implemented

### Calculation Methodology Dropdown (P1)
- **Files changed**:
  - `/app/frontend/src/modules/ghg/emissions/shared/components/steps/Step1BasicSelection.js` — Rendered dropdown (Stationary Combustion only)
  - `/app/frontend/src/components/EmissionEntryForm.js` — Decision tree traversal for Scope 1, default `using_ncv` in `buildDecisionInputs`, edit hydration inference
  - `/app/frontend/src/hooks/useCalcEngine.js` — Accepts `calculationMethodology` param, passes in `decision_inputs`
  - `/app/frontend/src/pages/Emissions.js` — Edit flow passes inferred methodology to calc engine
- Backward compatible: existing records default to `using_ncv`
- **Status**: ✅ Implemented

### Stationary Combustion Decision Tree Updated (via SuperAdmin UI)
- Scope 1 tree `9fa2ca12` updated to v5: `calculation_methodology` → `using_ncv` | `using_carbon_composition`
- Carbon Composition formula `d10c79f4` created and linked
- All formula references verified active
- **Status**: ✅ Done by user via UI

## Upcoming Tasks (P1) — GHG Calc Engine

### Custom Fuel Type
- Add inline custom fuel entry for Stationary/Mobile/Fugitive
- Units locked to kg/g/t for custom fuels
- All formula properties become manual inputs (NCV, EF, density, etc.)
- Values go as `user_overrides` — no backend changes needed

### Form Field Toggling by Methodology
- When "Using Carbon Composition" selected: show only Quantity, Carbon Content (%), Oxidation Factor
- When "Using NCV" selected: show existing fields (Quantity, NCV, Density, EF)
- Dynamic input fields should respond to `calculation_methodology` decision field value

### Biogenic Stationary Combustion Tree Update
- Apply same `calculation_methodology` wrapping to Biogenic tree `80dbef24`

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

### Backend — Calc Engine
- `/app/backend/calc_engine/execution.py` — CalcEngine executor
- `/app/backend/calc_engine/formulas.py` — Formula + Decision Tree CRUD
- `/app/backend/calc_engine/router.py` — Calc engine API endpoints
- `/app/backend/calc_engine/properties.py` — Property resolution
- `/app/backend/calc_engine/variables.py` — Variable registry

### Frontend — Emissions
- `/app/frontend/src/components/TreeNodeEditor.js` — Decision tree node editor (Wrap Node)
- `/app/frontend/src/pages/DecisionTreeEditor.js` — Decision tree editor page
- `/app/frontend/src/components/EmissionEntryForm.js` — Emission entry form (methodology dropdown integration)
- `/app/frontend/src/modules/ghg/emissions/shared/components/steps/Step1BasicSelection.js` — Step 1 with methodology dropdown
- `/app/frontend/src/hooks/useCalcEngine.js` — Calc engine hook (methodology param)
- `/app/frontend/src/pages/Emissions.js` — Emissions page (edit flow methodology)

## Test Credentials
- Admin: goyalsomil2001@gmail.com / TestUser123!
- SuperAdmin: superadmin@ecotrack.com
- Organization ID: 9067d872-8a3a-4ed9-8494-e3ef04952f7c
