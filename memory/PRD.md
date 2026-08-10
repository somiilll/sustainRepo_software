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
- **Status**: Done

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
- **Status**: Done (Updated Aug 2026)

### Field Toggling by Methodology (P1)
- **Files**: `EmissionEntryForm.js`, `Emissions.js`
- Hardcoded toggling logic
- Applies to Stationary, Mobile, Flaring categories
- **Status**: Done (hardcoded — P0 TODO: proper formula-input-based logic)

### Oxidation Factor Defaults & Validation
- DB: `oxidation_factor` has `default_value: 1`, `validation_rules: {max: 1, min: 0}`
- Frontend: `DynamicFieldRenderer.js` auto-populates default, enforces max via toast error
- **Status**: Done

### Custom Fuel Type Implementation (P0)
- **Files**: `Step1BasicSelection.js`, `EmissionEntryForm.js`
- Added "Use Custom Fuel" toggle for Stationary, Mobile, Fugitive, Flaring categories
- Custom fuel input fields: Name, Emission Factor, EF Unit, Source
- **Units restricted to mass-based only**: kg, g, t (per user requirement)
- **Status**: Done

### Flaring Category Support
- Added `flaring` to `isStationaryOrMobile` check in both Add and Edit forms
- **Status**: Done

### Fuel Database Categories Fix
- **File**: `Emissions.js` line 1379-1402
- Fixed grouping key to iterate over `fuel.categories` array instead of just `fuel.category`
- **Status**: Done

## Upcoming Tasks (P0) — Proper Logic

### Formula-Input-Based Field Toggling
- Populate formula `inputs` array in `ce_formulas` DB for each formula
- Update form-config API to return formulas with populated inputs
- Remove hardcoded field toggling, replace with dynamic filtering based on `requiredInputVars`
- Handle decision fields separately (don't filter by formula inputs)

## Completed Work (Feb 2026) — MIS Executive PDF

### Beautiful Executive PDF Report (P0)
- **File**: `/app/backend/modules/mis_reports/pdf_builder.py`
- Complete rewrite of `build_executive_pdf()` with 7 professional sections
- Charts rendered via `matplotlib` -> PNG -> embedded in `reportlab` PDF
- **Status**: Done

### MIS Target Progress Fix (P0)
- **Bug**: Targets showed "Unnamed Target 0.0 / 20,291.0 L (0%)" — wrong fields, no real progress
- **Fix**: MIS now calls `kpi_calculator.calculate()` + `_calculate_progress()` for real actual_value and progress_pct
- **Status**: Done

### Energy Renewable/Non-Renewable Target Subcategories (P1)
- Added aggregate "Renewable Energy" and "Non-Renewable Energy" subcategories to target hierarchy
- **Status**: Done

### Memory Optimization — Streaming Heap for Embedding Queries (P1)
- Peak memory per query: Repo Pilot ~600MB -> ~12MB, Internal AI ~60MB -> ~2MB
- **Status**: Done

## Completed Work (Aug 2026) — Decision Tree Flattening

### Stationary Combustion 3-Way Methodology (P1)
- **4 Decision Trees updated** in MongoDB
- **2 Mobile Combustion Trees updated**
- **5 Frontend files updated**
- **Status**: Done

### Qty Basis EF Density Requirement (P1)
- **Status**: Done

### Heat Basis / Carbon Composition Density Checks (P1)
- **Status**: Done

### Process Emissions Qty Unit Dropdown (P1)
- **Status**: Done

### Custom Fuel 3-Methodology Support (P1)
- **Status**: Done

### Standard Fuel Density Override (P1)
- **Status**: Done

## Operational Maintenance (Aug 2026)

### Staging Database Replacement
- **Status**: Done

### Repo Pilot Report Migration
- **Status**: Done

### Emission Live-Calculation Presentation
- **Status**: Done

## MIS Report Enhancements (Aug 2026)

### MIS Executive Summary v2 — Page 2 Redesign
- Complete rebuild with 5 section-colored tables and 13-month average insight engine
- **Status**: Done

### MIS Emissions Overview v2 — Visual Analytics Redesign
- 5 dedicated sections: Total, Scope 1-3, Biogenic with trends and donuts
- **Status**: Done

### MIS Energy, Water & Waste — Separate Premium Sections
- Split into 3 dedicated sections with visual identity
- **Status**: Done

### Water Source Charts + PDF Module Split
- Water Withdrawal by Source donut + multi-line trend
- Split pdf_builder.py into 4 sub-modules
- **Status**: Done

### MIS Facility Performance — Complete Redesign
- Per-facility emissions analysis including ALL facilities
- **Status**: Done

### MIS Incidents & Compliance + Supplier Assessment — Redesign
- **Status**: Done

### MIS Targets Section — Complete Redesign
- Individual target visual blocks with direction-aware comparison
- **Status**: Done

## Bug Fixes (Aug 2026 — Latest Session)

### MIS SBTi Targets + Multiline Trend Legend Spacing
- **Root Cause**: MIS only queried `esg_targets`; separately stored `sbti_targets` were never mapped into the report target feed. Multiline chart legends used three cramped columns without a dedicated gutter.
- **Fix**: Added a read-only SBTi-to-MIS target mapper with live KPI progress, target year, term type, and short/long-term labeling. Multiline charts now use two legend columns, reserved legend height, and explicit row/column spacing.
- **Status**: Done — independently verified by testing agent (5/5 runtime checks, PDF content, and visual legend review passed).

### MIS Water / Waste Dashboard Parity
- **Root Cause**: MIS water metrics included pending-approval records; waste values were legacy kilograms while the UI labeled them as MT; MIS disposal was derived rather than using the submitted Disposal record.
- **Fix**: Water metrics now use approved/not-required records; dashboard and MIS normalize legacy waste quantities to MT; MIS trends use explicit disposal totals; report labels use MT; environment-detail honors the selected reporting period.
- **Status**: Implemented and API parity self-checked for August 2026. Independent test-agent verification was requested but stopped before execution by the prior user instruction.

### Supplier Assessment "Not Assessed" Fix
- **Root Cause**: `pdf_sections.py` read `overall_score`/`esg_score`/`ghg_score` (all None in DB) instead of `overall_completion_percent`/`esg_completion_percent`/`ghg_completion_percent` (actual values).
- **Fix**: Updated field mapping in `pdf_sections.py` lines 698-700 with fallback. Also fixed `high_risk_suppliers` count in `service.py`.
- **Status**: Done (self-verified via curl)

### Incident Trends Showing 0 Fix
- **Root Cause**: `governance_records.reporting_period` is a nested object `{year, month}` but MIS queried it as flat string `"2026-08"` — never matched.
- **Fix**: Added `_governance_period_filter()` helper in `service.py`. Applied to 3 locations: operational trends, exec summary 13-month loop, incident breakdown.
- **Status**: Done (self-verified via curl)

### Incident KPI Mismatch Fix (4 vs 1)
- **Root Cause**: Main report incident count (line 309) had NO period filter — counted ALL incidents across ALL months. Exec summary `total_incidents` used this unfiltered count.
- **Fix**: Added `_governance_period_filter` to main report query. Exec summary now uses per-month `inc_tm[period_start]` value.
- **Status**: Done (self-verified via curl)

## Pending Issues

### Process Emissions Live-Calculation Review (P0)
- **Status**: PARKED by user for later

### Custom Fuel Edit Save Validation (P0)
- **Status**: USER VERIFICATION PENDING

### React 19 Console Warnings — Recharts (P3)
- **Status**: Open

### Environment Report PDF Character Spacing Bug (P2)
- **Status**: Open

## Upcoming Tasks (P1)
- Target Settings UI (replace legacy name-based `target_direction` fallback)
- Hash-based Integrity Verification for Evidence Files (SHA-256)
- SuperAdmin Config UI for Modules
- Supplier and Customer Org Onboarding Wizards
- Word document download for BRSR (.docx) + "Previous Year Columns"
- MIS Schedule Preview (preview full PDF before activating delivery)
- Report Bookmarks (PDF outline/sidebar navigation)
- Dynamic Unit Config (auto-detect org units like MWh vs GJ)

## Future Tasks (P2+)
- Decouple Add/Edit Emissions Flow into unified `EmissionDraft` workflow
- Copy Month Values for Custom Fuel EF/CV
- Dashboard Scope 1 & 3 Emissions Deduplication
- BRSRDetailsSection.js decomposition (1800+ lines)
- Remaining toLocaleString() migrations
- Materiality Assessment Phase 2+
- SOC 2 Compliance Implementation

## Key Files Reference

### Backend — MIS Reports
- `/app/backend/modules/mis_reports/service.py` — Data aggregation, `_governance_period_filter` helper
- `/app/backend/modules/mis_reports/pdf_builder.py` — PDF entry point
- `/app/backend/modules/mis_reports/pdf_sections.py` — Section builders (supplier uses completion_percent)
- `/app/backend/modules/mis_reports/pdf_charts.py` — Matplotlib chart renderers
- `/app/backend/modules/mis_reports/pdf_styles.py` — Constants, colors, flowable classes

### Backend — Calc Engine
- `/app/backend/calc_engine/execution.py` — CalcEngine executor
- `/app/backend/calc_engine/formulas.py` — Formula + Decision Tree CRUD
- `/app/backend/calc_engine/router.py` — Calc engine API endpoints

### Frontend — Emissions
- `/app/frontend/src/components/EmissionEntryForm.js` — Emission entry form
- `/app/frontend/src/modules/ghg/emissions/shared/components/steps/Step1BasicSelection.js`
- `/app/frontend/src/hooks/useCalcEngine.js`
- `/app/frontend/src/pages/Emissions.js`

## Test Credentials
- Admin: goyalsomil2001@gmail.com / TestUser123!
- SuperAdmin: superadmin@ecotrack.com
- Organization ID: 9067d872-8a3a-4ed9-8494-e3ef04952f7c

## 3rd Party Integrations
- Resend (Emails) - requires User API Key
- OpenAI GPT 5.6 Sol / text-embedding-3-large (Repo Pilot) — uses Emergent LLM Key
