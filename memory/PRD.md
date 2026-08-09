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
- When methodology is `using_qty_basis_ef`, density field shown **only** when fuel's allowed units could actually mismatch EF denominators
- Example: fuel has only mass units (kg,g,t), EF mapping has `kgCO2/L` option → density shown
- Example: fuel has volume units (L,ml,kl), EF mapping has `kgCO2/L` → density NOT shown (no mismatch)
- DynamicFieldRenderer checks per-month selected EF unit for required indicator
- Edit form (Emissions.js) has the same conditional density check
- **Status**: ✅ Implemented

### Heat Basis / Carbon Composition Density Checks (P1)
- `isDensityRequiredForHeatBasis(cvUnit, qtyUnit)`: compares CV denominator dimension vs qty unit dimension
- `isDensityRequiredForCarbonComposition(qtyUnit)`: density needed when qty unit is volume-based
- Custom fuel density shown only on actual dimension mismatch per methodology
- All helpers in shared `unitHelpers.js` — clean, reusable, unit-testable
- **Status**: ✅ Implemented

### Process Emissions Qty Unit Dropdown (P1)
- Replaced fixed "(fixed)" unit label with selectable dropdown (kg, g, t, L, kL, ml, m3, cm3)
- Applied to both monthly and yearly views in Step3YearMonthlyData.js
- Unit stored as `{field.key}_unit` in monthlyData/yearlyData
- **Status**: ✅ Implemented

### Custom Fuel 3-Methodology Support (P1)
- Step 1: Name + Source only (slim). All calculation inputs entered per-month in Step 3.
- `CustomFuelMonthFields.js`: per-methodology fields + Qty Unit + Density (shown on dimension mismatch)
  - Heat Basis: EF + EF unit + CV + CV unit + Qty unit + Density (when CV denom ≠ qty dimension)
  - Qty Basis: EF + EF unit + Qty unit + Density (when EF denom ≠ qty dimension)
  - Carbon Composition: Carbon Content + Oxidation Factor + Qty unit + Density (when qty is volume)
- Standard dynamic fields suppressed for custom fuel (`cv`, `ef_quantity`, `carbon_content`, `oxidation_factor`, `density`)
- Custom fuel direct-save path in `useEmissionSubmit.js` for scope1/biogenic (no module needed)
- Per-month custom fuel data saved in `dynamic_field_values` for persistence
- Edit form hydrates custom fuel fields from saved `dynamic_field_values`
- Edit form renders `CustomFuelMonthFields` when `editUseCustomFuel` is true
- **Status**: ✅ Implemented

### Standard Fuel Density Override (P1)
- Density for `using_qty_basis_ef` shown only when dimension mismatch AND fuel has no density in DB
- If fuel has density in DB (e.g. Diesel density=0.84), calc engine uses it automatically — no override needed
- **Status**: ✅ Implemented

## Operational Maintenance (Aug 2026)

### Staging Database Replacement
- Replaced `sustainrepo_staging` contents with the current `test_database` source after explicit user confirmation.
- Copied 99 collections and 17,772 documents; recreated 53 non-default indexes and all empty source collections.
- Verified matching collection names, document counts, and index names. UUID handling used MongoDB standard representation.
- No Decision Tree, formula, variable, or calc-engine database configuration was changed.

### Repo Pilot Report Migration
- Migrated the completed `IndianOil_BRSR2425.pdf` Repo Pilot document from `test_database` to `sustainrepo_staging` after explicit user confirmation.
- Preserved the document identifier, metadata, 293 linked chunks and their identifiers, 57 page-image references, and private R2 storage references.
- Verified source/destination report metadata and chunk identifier sets match exactly. No Decision Tree or calc-engine configuration changed.

### Emission Live-Calculation Presentation
- Custom Fuel and non-Custom Fuel live results now use the same colourful CO₂ / CH₄ / N₂O / CO₂e summary with calculation-detail audit entries.
- Removed the repeated Custom Fuel applied-formula header from Add and Edit result displays only; backend formula resolution and calculation data are unchanged.
- Monthly Add Emissions now retains live result state per entered month and presents the shared colourful summary when the calc engine returns a result.
- Create Emissions now suppresses the entire live Calculated Emissions panel and preview requests for Custom Fuel only; Custom Fuel Edit and non-Custom Fuel views remain unchanged.

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

## MIS Reporting Enhancements — 2026-08-08
- Added centralized reporting-period logic, FY/CY current-vs-prior-period semantics, FY/CY emissions trend mapping, direction-aware management statuses, action lists, and overflow-safe PDF table cells.
- Legacy target directions temporarily fall back to target-name rules; explicit `target_direction` or `percentage_direction` remains authoritative.
- Validation: `/app/test_reports/iteration_146.json` — 18 backend checks passed with no send/email actions.

### Remaining MIS Reporting Work
- Add aligned FY/CY comparison trend datasets/charts for energy, water recycle, waste recycle, and renewable energy.
- Add a Target Settings UI to replace temporary legacy name-based direction fallback with stored configuration.

### MIS Resource Source of Truth — 2026-08-08
- MIS resource snapshots now consume dashboard metric-service energy, water, recycle, waste, and recovery values directly; detailed-record overrides were removed.
- Validation: `/app/test_reports/iteration_147.json` — 20 pure MIS tests passed, with no Send Now, emails, or data mutation.

### MIS Executive Summary Energy Routing — 2026-08-08
- Energy Consumption now appears in the Executive Summary whenever GHG is selected, preserving compatibility with existing configurations that do not have a standalone Energy selector.
- Validation: `/app/test_reports/iteration_150.json` — 3 targeted tests passed with no delivery side effects.

### MIS Operations Trend Charts — 2026-08-08
- Added conditional rolling 12-month Incidents, LTIFR, and Account Payable Days charts to the Operations PDF section, including explicit unavailable-history treatment.
- Validation: `/app/test_reports/iteration_152.json` — 4/4 focused checks passed without API calls, delivery, email, or data mutation.


### MIS Executive Summary v2 — Page 2 Redesign — 2026-08-09
- **Complete rebuild** of Page 2 Executive Summary with 5 section-colored tables (GHG=Teal, Energy=Amber, Water=Cyan, Waste=Purple, Social&Governance=Indigo).
- **13-month average insight engine**: Each metric computes a rolling average of the 13 completed months preceding the current month. Insights are factual ("Increased X% compared with the previous N-month average of Y") — no qualitative phrases like "Improving" or "Needs Attention".
- **Conditional insights**: Insight column only shows text when the current-vs-previous month swing exceeds 30%; small changes leave the cell blank.
- **Direction-aware colouring**: Green for favourable movement, red for unfavourable, based on per-metric directionality (e.g. decrease in GHG = green, increase in recycling = green).
- **Metrics**: GHG (Scope 1-3, Biogenic, Intensity by Production, Intensity by Revenue), Energy (Renewable, Non-Renewable, Intensity by Production/Revenue), Water (Consumption, Withdrawal, Discharge, Recycle), Waste (Generated, Disposed, Recycled), Social & Governance (LTIFR, AP Days, Number of Incidents with breakdown).
- **Intensity by Revenue**: New metric using organisation's `organization_financials.turnover` as denominator.
- **Zero/Null handling**: "No data available" for None, "Decreased to 0 from a N-month average of Y" for zero values, "No meaningful historical average available" for zero baseline.
- **Configuration-driven**: Only sections matching the MIS report configuration are displayed.
- **Files changed**: `service.py` (added `_compute_avg_with_count`, `_generate_insight`, `build_executive_summary_data`), `pdf_builder.py` (added `ColoredSectionBar`, `_exec_summary_section_table`, `_insight_para`, `_fmt_val`, rewrote `_sec_executive_summary`).
- **Tests**: 20 unit tests in `/app/backend/tests/test_executive_summary_insights.py` + 8 existing reporting-period tests — all 28 pass.

### MIS Emissions Overview v2 — Visual Analytics Redesign — 2026-08-09
- **Complete redesign** of the Emissions Overview page into a premium visual analytics report spanning 5 dedicated sections: Total Emissions, Scope 1, Scope 2, Scope 3, Biogenic.
- **Per-scope analytics pattern**: Each scope gets a full-width 12-13 month trend chart (with value labels on every point and current-month highlight), a composition donut chart (with all categories including zeros), a detailed breakdown table, and a multi-line category trend chart.
- **Scope 3 grouping**: Categories contributing <2% are visually grouped as "Other" in the donut chart; the full C1-C15 breakdown is preserved in the detailed legend/table. Top 5 categories shown as trend lines; remainder aggregated into "Other Categories".
- **Scope 2 dedicated electricity trend**: A separate Purchased Electricity trend chart is rendered below the Scope 2 composition.
- **Zero-value handling**: Zero-value categories are never hidden — they appear in legends, tables, and donut labels as "0.00 tCO2e — 0.0%".
- **Colour system**: Total=Dark Blue, Scope 1=Orange family, Scope 2=Blue family, Scope 3=Purple family, Biogenic=Green family. Sub-categories use distinct shades within their family.
- **Data source**: Single MongoDB aggregation pipeline (`build_emissions_deep_data`) groups emissions by (period, scope, category) across 13 months in one query — no separate calculations.
- **Files changed**: `service.py` (added `build_emissions_deep_data`), `pdf_builder.py` (added `_render_labeled_trend`, `_render_deep_donut`, `_render_multiline_trend`, `_sec_emissions_analytics`; replaced `_sec_emissions_overview`).


### MIS Emissions Analytics — Bug Fixes — 2026-08-09
- **GHG Emissions master heading**: Added "GHG Emissions" as the chapter title on the page after Executive Summary; Total Emissions, Scope 1-3, and Biogenic are now sub-sections with colored accent bars.
- **All 15 Scope 3 categories**: Added `SCOPE3_CANONICAL` constant list (C1-C15). All 15 categories now always appear in composition and category trends even when their value is 0.
- **Trend line breaks at missing data**: `_render_labeled_trend` and `_render_multiline_trend` now segment the line into consecutive non-None runs, creating visual gaps where months have no data instead of misleading straight lines.
- **FY/CY annual record distribution**: `build_emissions_deep_data` now also queries emission records with FY (e.g. "FY 2025-2026"), CY (e.g. "CY2025"), and range (e.g. "2025-04 to 2026-03") reporting periods. These are distributed evenly (value/12) across their constituent months. Helper `_period_to_months(period_str, fy_start_month)` handles all formats.
- **Validation**: `/app/test_reports/iteration_153.json` — 7 new tests + 28 regression tests, 100% pass rate.


### MIS Energy, Water & Waste — Separate Premium Sections — 2026-08-09
- **Split into 3 dedicated sections**: Replaced the combined "Energy, Water & Waste Performance" section with separate "Energy Performance" (amber), "Water Performance" (blue), and "Waste Performance" (purple) sections, each with distinct visual identity.
- **Energy Performance**: Total consumption trend (full-width, value-labeled), renewable vs non-renewable donut + breakdown table, combined renewable/non-renewable multi-line comparison trend.
- **Water Performance**: Four individual trend charts — Consumption (full-width), Withdrawal + Discharge (side-by-side), Recycle (full-width). All with value labels and KL units.
- **Waste Performance**: Generated trend (full-width), Disposed + Recovered (side-by-side), Hazardous vs Non-Hazardous grouped bar comparison chart, plus individual hazardous/non-hazardous generated + recovered trends.
- **No current-vs-previous comparison tables** per user instruction — sections go straight to visual trends.
- **Data source**: `_build_resources_deep()` derives all data from the extended `twelve_month_resource_trends` (now includes renewable_total, non_renewable_total, waste_recovered, hazardous/non_hazardous splits) — zero additional DB calls for basic data.
- **Files changed**: `service.py` (extended `build_twelve_month_resource_trends` metrics dict, added `_build_resources_deep`), `pdf_builder.py` (added `_render_grouped_bar`, `_sec_energy_performance`, `_sec_water_performance`, `_sec_waste_performance`; removed `_sec_eww`).
- **Tests**: 35 total tests passing (28 regression + 7 emissions deep).


### Water Source Charts + PDF Module Split — 2026-08-09
- **Water Withdrawal by Source**: Added donut chart showing current-month withdrawal composition (Groundwater, Surface Water, Third-Party Water, Seawater/Desalinated) plus a 12-month multi-line source trend chart. Data fetched via a single bulk query on `environment_records` with `field_values` extraction.
- **PDF Module Split**: Broke the 1343-line `pdf_builder.py` into 4 focused sub-modules:
  - `pdf_builder.py` (115 lines) — main entry point, page callbacks, imports
  - `pdf_styles.py` (185 lines) — colour constants, flowable classes, table helpers
  - `pdf_charts.py` (229 lines) — all matplotlib chart renderers
  - `pdf_sections.py` (623 lines) — all section builder functions
- **Files created**: `pdf_styles.py`, `pdf_charts.py`, `pdf_sections.py`
- **Files changed**: `service.py` (added `WATER_SOURCE_FIELDS`, `_record_to_month`, async `_build_resources_deep` with source queries)
- **Tests**: 35 total passing, no regression.


### MIS Facility Performance — Complete Redesign — 2026-08-09
- **Complete rebuild**: Replaced the old "Top Facilities" ranking with a comprehensive per-facility emissions analysis that includes ALL org facilities (including zero-emission ones).
- **Summary page**: All-facility comparison table (Facility | Current Month | Previous Month | Change) + horizontal bar chart showing every facility (zeros visible at 0.0).
- **Per-facility detail blocks** (1 page each, 7 facilities = 7 pages): facility header, current vs previous values, full-width 12-13 month labeled trend chart, scope breakdown table (S1/S2/S3/Biogenic with zeros), Scope 1 source table, Scope 2 source table, all 15 Scope 3 categories (C1-C15 including zeros) — all displayed side-by-side for compact layout.
- **Zero handling**: Zero-emission facilities still appear with full structure (trend chart, scope tables, C1-C15). Zero scopes/categories shown as "0.00 tCO2e — 0.0%".
- **FY/CY distribution**: Per-facility annual records distributed across months using `_period_to_months()`.
- **Data source**: Single aggregation pipeline groups by (period, scope, category, facility_id). Facility list from `facilities` collection master data, not emission records.
- **Files changed**: `service.py` (added `build_facility_deep_data`), `pdf_sections.py` (rewrote `_sec_facility_performance`).
- **Report size**: 23 pages / 1.5MB for 7 facilities. 35 MIS tests passing.


### MIS Incidents & Compliance + Supplier Assessment — Redesign — 2026-08-09
- **Removed GHG/Energy Intensity** from Incidents & Compliance section (belonged in emissions/energy sections).
- **Fixed LTIFR consistency**: When LTIFR is "Not reported" (None), the trend chart is NOT displayed — replaced with clean empty-state message. KPI card and trend never contradict.
- **Fixed operational trends**: `build_twelve_month_operational_trends` now works without `reporting_context` (same fix as resource trends). Incident count query uses proper $or filter (Safety Incidents + Data Breaches + Violations) instead of counting all governance records.
- **Full-width trends**: LTIFR, Incidents, and Account Payable Days trends are all full-width with labeled values.
- **Incident breakdown table**: Shows Safety Incidents, Data Breaches, Violations, and Total for the current month.
- **New Supplier Assessment section**: Overall Supplier Ranking table (Rank | Supplier | Overall/ESG/Emissions scores), Emissions vs ESG side-by-side ranking tables. "Not Assessed" shown for suppliers without scores (never converted to 0). Horizontal bar chart shown when assessed suppliers exist.
- **Files changed**: `service.py` (fixed `build_twelve_month_operational_trends` incident filter + context handling), `pdf_sections.py` (rewrote `_sec_incidents_compliance`, added `_sec_supplier_assessment`), `pdf_builder.py` (added supplier section call + import).
- **Report size**: 32 pages / 1.7MB. 35 MIS tests passing.


### MIS Targets Section — Complete Redesign — 2026-08-09
- **Individual target visual blocks**: Each target gets its own card with Name, Type (Yearly/Static/Monthly), Period, Direction, Target Value, Actual Value, Achievement %, Gap, Status — plus a dedicated Actual vs Target horizontal bar chart.
- **Grouped by section**: Targets organized under Environment, Social, Governance, SBTi headings with colored accent bars.
- **Direction-aware comparison**: Respects whether higher or lower is better (increase/decrease/maintain). Uses existing Targets module evaluation logic.
- **Fixed enrichment**: Added `tracking_mode`, `section`, and `gap` fields to `_enrich_targets_with_progress`.
- 34-page / 1.75MB report. 35 MIS tests passing.
