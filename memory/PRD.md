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
- **22 active decision trees** in `ce_decision_trees` — one per category_id, resolved at runtime
- **Decision tree IDs NOT stored in emission records** — trees looked up by `category_id` every calculation
- **502 fuels** in `fuel_database` — properties resolved via `ce_property_source_mappings`
- **Stationary Combustion** trees (Scope 1, Biogenic, Flaring) now branch on `calculation_methodology` with 3 flat options: `using_heat_basis_ncv`, `using_qty_basis_ef`, `using_carbon_composition`
- **Process Emissions** venting sub-tree also uses the same 3 methodology options
- `ef_quantity_provided` decision field removed — replaced by explicit methodology choice
- **Key formula IDs**: `b52e732f` (heat-basis Scope 1), `d5c88230` (heat-basis Biogenic), `f863ca67` (quantity-based), `ed2819e3` (fugitives), `d10c79f4` (carbon composition)

## Completed Work (Dec 2025)

### Decision Tree Editor — Wrap Node Feature (P1)
- **File**: `/app/frontend/src/components/TreeNodeEditor.js`
- Added "Wrap" button to both `BranchNode` and `LeafNode` components
- Inline `WrapPrompt` component asks for option value, then wraps current node under new parent
- Works at any tree depth via existing `onUpdate` callback chain
- **Status**: ✅ Implemented

### Calculation Methodology Dropdown (P1)
- **Files changed**:
  - `/app/frontend/src/modules/ghg/emissions/shared/components/steps/Step1BasicSelection.js` — Rendered dropdown (Stationary/Flaring categories)
  - `/app/frontend/src/components/EmissionEntryForm.js` — Decision tree traversal for Scope 1, default `using_heat_basis_ncv` in `buildDecisionInputs`, edit hydration inference
  - `/app/frontend/src/hooks/useCalcEngine.js` — Accepts `calculationMethodology` param, passes in `decision_inputs`
  - `/app/frontend/src/pages/Emissions.js` — Edit flow passes inferred methodology to calc engine
  - `/app/frontend/src/components/EmissionEditForm.jsx` — Edit dialog methodology selector
- **3 options**: Using Heat Basis (NCV), Using Qty Basis EF, Using Composition of Carbon
- `ef_quantity_provided` implicit fork removed — replaced with explicit 3-way choice
- Backward compatible: existing records infer methodology from saved `dynamic_field_values` keys
- **Status**: ✅ Implemented (Updated Aug 2026)

### Field Toggling by Methodology (P1)
- **Files**: `EmissionEntryForm.js`, `Emissions.js`
- Hardcoded toggling logic:
  - "Using Carbon Composition": hide `ef_quantity` (Emission Factor), show `carbon_content`, `oxidation_factor`
  - "Using NCV": hide `carbon_content`, `oxidation_factor`, show `ef_quantity`
- Applies to Stationary, Mobile, Flaring categories
- **Status**: ✅ Implemented (hardcoded — P0 TODO: proper formula-input-based logic)

### Oxidation Factor Defaults & Validation
- DB: `oxidation_factor` has `default_value: 1`, `validation_rules: {max: 1, min: 0}`
- Frontend: `DynamicFieldRenderer.js` auto-populates default, enforces max via toast error
- **Status**: ✅ Implemented

### Custom Fuel Type Implementation (P0)
- **Files**: `Step1BasicSelection.js`, `EmissionEntryForm.js`
- Added "Use Custom Fuel" toggle for Stationary, Mobile, Fugitive, Flaring categories
- Custom fuel input fields: Name, Emission Factor, EF Unit, Source
- **Units restricted to mass-based only**: kg, g, t (per user requirement)
- Added `CUSTOM_FUEL_UNITS` array with `tCO2/kg`, `tCO2/g`, `tCO2/t`
- **Status**: ✅ Implemented

### Flaring Category Support
- Added `flaring` to `isStationaryOrMobile` check in both Add and Edit forms
- Flaring now has same calculation methodology options as Stationary Combustion
- **Status**: ✅ Implemented

### Fuel Database Categories Fix
- **File**: `Emissions.js` line 1379-1402
- Fixed grouping key to iterate over `fuel.categories` array instead of just `fuel.category`
- Ensures fuels with multiple categories (like Flaring) appear correctly
- **Status**: ✅ Implemented

## Upcoming Tasks (P0) — Proper Logic

### Formula-Input-Based Field Toggling
- Populate formula `inputs` array in `ce_formulas` DB for each formula
- Update form-config API to return formulas with populated inputs
- Remove hardcoded field toggling, replace with dynamic filtering based on `requiredInputVars`
- Handle decision fields separately (don't filter by formula inputs)

## Completed Work (Feb 2026) — MIS Executive PDF

### Beautiful Executive PDF Report (P0)
- **File**: `/app/backend/modules/mis_reports/pdf_builder.py`
- Complete rewrite of `build_executive_pdf()` with 7 professional sections:
  1. Cover Page (branded, decorative green theme)
  2. Executive Summary (KPI cards + comparison table with change %)
  3. Emissions Overview (Donut chart by scope + Line chart monthly trend)
  4. Facility Performance (Horizontal bar chart + table)
  5. Energy, Water & Waste (Resource bar chart + detailed metrics table)
  6. Incidents & Compliance (Operational KPIs + framework completion + supplier assessment)
  7. Targets & Progress (Visual progress bars + summary table)
- Charts rendered via `matplotlib` → PNG → embedded in `reportlab` PDF
- Consistent brand theme (#166534 green), page headers/footers on content pages
- Handles empty data gracefully
- **Status**: Implemented, locally tested (sample + empty data), API verified (HTTP 200)

### MIS Target Progress Fix (P0)
- **Bug**: Targets showed "Unnamed Target 0.0 / 20,291.0 L (0%)" — wrong fields, no real progress
- **Fix**: MIS now calls `kpi_calculator.calculate()` + `_calculate_progress()` (same as `/esg-targets/with-progress`) for real actual_value and progress_pct
- **Files**: `service.py` (`_enrich_targets_with_progress`), `pdf_builder.py` (`_sec_targets`, `ProgressBarFlowable`)

### Energy Renewable/Non-Renewable Target Subcategories (P1)
- Added aggregate "Renewable Energy" and "Non-Renewable Energy" subcategories to target hierarchy
- New KPI calculators in `energy_adapter.py`, registered in `calculator.py` dispatch
- Available at `/esg-targets/lookup/categories?section=environment`

### Memory Optimization — Streaming Heap for Embedding Queries (P1)
- **Files**: `modules/repo_pilot/vector_store.py`, `modules/internal_data_ai/embedding_service.py`
- Replaced `to_list(50000)` / `to_list(5000)` bulk loads with `async for` streaming + min-heap of size `top_k`
- Peak memory per query: Repo Pilot ~600MB → ~12MB, Internal AI ~60MB → ~2MB
- Same API, same results, zero new dependencies

## Completed Work (Aug 2026) — Decision Tree Flattening

### Stationary Combustion 3-Way Methodology (P1)
- **4 Decision Trees updated** in MongoDB:
  - Scope 1 → Stationary Combustion (`9fa2ca12`): flattened from `using_ncv → ef_quantity_provided` sub-tree to 3 flat options
  - Scope 1 → Flaring (`98b9822d`): same flattening
  - Scope 1 → Process Emissions (`d39293e1`): venting sub-tree flattened to 3 options
  - Biogenic → Stationary Combustion (`80dbef24`): added `calculation_methodology` level (was only `ef_quantity_provided`)
- **2 Mobile Combustion Trees updated**: Scope 1 (`afaed9c6`) + Biogenic (`158e8396`) — same 3-way methodology
- **5 Frontend files updated**: Step1BasicSelection.js, EmissionEntryForm.js, EmissionEditForm.jsx, Emissions.js, useCalcEngine.js
- Removed all `ef_quantity_provided` references from frontend
- Added `using_qty_basis_ef` detection in edit hydration (checks for `ef_quantity` in saved dynamic_field_values)

### Qty Basis EF Density Requirement (P1)
- When methodology is `using_qty_basis_ef`, density field is shown for Stationary and Mobile Combustion
- Density dynamically marked as required (red asterisk) when EF unit denominator dimension mismatches fuel qty unit dimension
- Example: EF = kgCO2/L (volume denom) but fuel qty = kg,g,t (mass only) → density required
- Helper: `isDensityRequiredForQtyBasis()` in `unitHelpers.js` — pure function, shared across components
- DynamicFieldRenderer auto-enables density override checkbox when density becomes required
- Backend calc engine enforces: returns clear error when density needed but not provided
- Edit form (Emissions.js) has the same density check with `densityQtyBasisCheck` flag
- **Status**: ✅ Implemented

### Custom Fuel 3-Methodology Support (P1)
- Custom fuel panel on Step 1 now shows methodology-specific input fields:
  - **Heat Basis (NCV)**: EF value + EF unit (tCO2/TJ, tCO2/MJ) + CV value + CV unit ({TJ,MJ}/{all qty units}) + Qty unit + Source
  - **Qty Basis EF**: EF value + EF unit (tCO2/{all qty units}) + Qty unit + Source
  - **Carbon Composition**: Carbon Content (%) + Oxidation Factor + Qty unit + Source
- Custom fuel no longer always hides density — density visibility follows methodology rules
- Step 3 qty unit display uses `customFuelQtyUnit` computed from the methodology
- Files: `Step1BasicSelection.js` (custom fuel fields per methodology), `EmissionEntryForm.js` (density logic + customFuelQtyUnit), `Step3YearMonthlyData.js` (qty unit display), `Emissions.js` (edit form density)
- **Status**: ✅ Implemented

## Upcoming Tasks (P1)
- GHG Form Logic & Custom Fuels E2E Testing
- Custom Fuel Backend Calculation Integration (wire custom fuel inputs through calc engine for all 3 methodologies)
- Hash-based Integrity Verification for Evidence Files
- Smart Follow-ups (Internal Data AI)
- SuperAdmin Config UI for Modules
- Supplier and Customer Org Onboarding Wizards
- Word document download option for BRSR
- Add "Previous Year Columns" to BRSR tables

## Pending Issues (P2)
- Orphaned OCR Temp Files
- Section A Approval Workflow Verification
- Environment Report PDF Character Spacing Bug
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
- `/app/frontend/src/modules/ghg/emissions/shared/components/steps/Step1BasicSelection.js` — Step 1 with methodology dropdown, Custom Fuel toggle
- `/app/frontend/src/modules/ghg/emissions/shared/components/DynamicFieldRenderer.js` — Dynamic field rendering with defaults
- `/app/frontend/src/hooks/useCalcEngine.js` — Calc engine hook (methodology param)
- `/app/frontend/src/pages/Emissions.js` — Emissions page (edit flow methodology)

## Test Credentials
- Admin: goyalsomil2001@gmail.com / TestUser123!
- SuperAdmin: superadmin@ecotrack.com
- Organization ID: 9067d872-8a3a-4ed9-8494-e3ef04952f7c
