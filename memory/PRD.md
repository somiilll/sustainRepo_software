# ESG Platform - Product Requirements Document

## Change Log — Aug 17, 2026: Internal Data AI Response and CSR Reporting P0

### Implemented
- Removed the visible internal framework-question highlight from deterministic Internal Data AI responses; chat answers now show only user-facing labels, state, and source.
- Added `framework_confidence` to `/api/internal-ai/chat` and a visible **Registry confidence** badge in Repo Pilot's Internal Data AI mode.
- Added explicit GRI routing for **areas of biodiversity importance** to configured disclosure `GRI 101-5-a(i)`, including exact sub-disclosure response retrieval and user-friendly formatting.
- Updated Reporting → BRSR → CSR Applicability to always show CSR under Section 135, Turnover (INR), and Net Worth (INR), with saved values safely merged against defaults.

### Verification
- Independent backend/frontend validation passed in `/app/test_reports/iteration_174.json`: 32 registry and live API tests passed; live Repo Pilot and BRSR CSR edit/save flows passed. **MOCKED APIs: NONE.**
- User subsequently requested no further testing; no additional verification should be run unless requested.

### Prioritized Follow-up
- **P1:** Reset BRSR Section A form data when the reporting year changes to prevent stale values appearing.
- **P2:** Stabilize Playwright Select locators; address existing Recharts sizing and React `key` console warnings.

## Change Log — Aug 15, 2026: Internal Data AI BRSR Query Repair

### Implemented
- Fixed generic BRSR count routing so phrases such as “BRSR questions filled” no longer become a literal `question_key` filter.
- Added deterministic support for bare annual ranges such as `2026-2027`, resolving them as the organization’s financial year.
- Updated BRSR version-history retrieval to resolve response keys from the active `organization_esg_responses` collection and match version records stored by question key.
- Increased BRSR retrieval bounds from 50 to 1,000 records so broad filled-count answers do not silently undercount larger questionnaires.

### Verification
- Focused deterministic regression tests: **3/3 passed** (`backend/tests/test_internal_ai_brsr_regressions.py`).
- Authenticated live Internal AI regression: **1/1 passed** across all three reported prompts (`/app/test_reports/iteration_173.json`).
- Verified live results: generic and FY 2026–27 count prompts return **6 filled / 165 configured**; training coverage history returns **1 approved event**. **MOCKED APIs: NONE.**

### Prioritized Follow-up
- **P1:** Reset BRSR Section A form data when reporting year changes to prevent stale values appearing in the UI.
- **P2:** Stabilize Playwright selectors for Shadcn Select controls.

## Change Log — Aug 12, 2026: Internal Data AI Evidence Routing

### Implemented
- Added a phased Internal Data AI foundation without new ESG data collections: normalized quantity/unit readers, structured query contracts, deterministic fuel/period planning, relationship traversal (record → formula → version → audit), evidence states, and session context stored in `internal_ai_conversations`.
- Added deterministic month aliases (`aug`, `sept`) and explicit query routes for calculation properties, BRSR response counts, environment approval status, and evidence/attachments.
- Added record-safe evidence presentation: stored updater display names are retained; internal user/record/formula/version identifiers are not exposed in AI answers.
- Fixed query outputs for:
  - Diesel calorific value in August 2026: reads stored `dynamic_field_values.cv` (`0.1 TJ/kg` for Facility E).
  - BRSR questions filled for FY 2026–27: returns an actual count rather than a placeholder state.
  - Water entries awaiting approval: returns a concrete count rather than routing to emissions analytics.
  - Petrol/Motor Gasoline attachment lookup for September 2025: uses the resolved reporting-period filter.

### Verification
- Testing-agent report: `/app/test_reports/iteration_163.json`.
- Focused local + live verification passed: **23/23** (22 focused tests plus one authenticated four-query live test).
- Live test validated query types: `calculation_property_lookup`, `brsr_lookup`, `approval_status_lookup`, and `evidence_lookup`.

### Current Architecture
- Internal AI keeps organization/facility authorization server-owned and never accepts an organization ID from model output.
- Structured plans dispatch to existing services/collections only; no `ai_records`, `module_records`, or duplicate ESG storage was introduced.
- Response generation receives only retrieval evidence relevant to the structured plan.

### Prioritized Follow-up
- **P1:** Constrain BRSR submission-status merging by `(question_key, reporting period)` to prevent cross-period status bleed.
- **P1:** Deduplicate pending approval requests by `entity_id` before presenting “entries awaiting approval.”
- **P2:** Extend structured query routing to additional ESG/social/governance analytics and approval questions as requested.

## Change Log — Aug 15, 2026: Internal Data AI Evidence and BRSR Routing Repair

### Implemented
- Preserved explicit `evidence_lookup`, BRSR, and GRI query types when the metric resolver recognizes a related ESG topic; Water-consumption evidence now remains on the linked-file retrieval path.
- Added native parsing for `financial year 2026-2027` and BRSR-aware routing: P1 maps to `section_c` plus the `p1_` question-key prefix, while training and awareness programme wording maps to `p1_training_awareness_coverage`.
- Scoped BRSR response, submission, unified-response, draft, progress, and question-config filters by section, reporting year, and question key. Unified BRSR data now accepts both legacy `framework` and current `frameworks` schemas and only counts non-empty values.
- Added a standalone `evidence` lexical fallback and a credentials-from-environment live regression test to prevent future route drift without storing credentials in code.

### Verification
- Focused backend tests passed: **11/11** (`test_internal_ai_auxiliary_queries.py`, `test_internal_ai_phase2_query_understanding.py`).
- Direct live service checks found 1 Water evidence file, 3 filled P1 records, and the stored FY 2026-2027 BRSR training coverage.
- Independent live regression passed: evidence lookup returned the linked Water file; P1 returned **3**; coverage returned BoD **100%**, KMP **83%**, employees **50%**, workers **10%** (`/app/test_reports/iteration_172.json`). **MOCKED APIs: NONE.**

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

### Staging MIS Delivery Run Collection
- Created the previously missing `mis_report_delivery_runs` collection in `sustainrepo_staging`.
- The collection was created empty with MongoDB's default `_id_` index, matching the local collection's index structure; no delivery records were copied or modified.
- **Status**: Done and verified.

### Immutable MIS Report Archive
- New scheduled and **Send now** deliveries are archived in the configured `mis-reports-dev` R2 bucket at `{organization name}/{YYYY-MM-DD}/{delivery_run_id}/report.pdf|report.xlsx`; organization IDs are not used in archive paths.
- `mis_report_delivery_runs` now records immutable report-configuration and recipient snapshots, reporting period, exact artifact keys, sizes, and SHA-256 checksums for PDF/XLSX artifacts. Direct browser exports remain on-demand and do not archive to R2.
- Partial uploads are removed before a failed run is recorded, preventing orphaned archive files.
- **Staging cleanup**: Deleted 2 old delivery-run records, 14 related recipient-delivery records, and 4 legacy R2 artifacts. The existing schedule was retained.
- **Status**: Done — archive contract tests passed (7/7), including a live temporary R2 write/read/checksum/delete check. **MOCKED** report-builder, database, and email layers were used for schedule-flow contract tests.

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

### Internal Data AI — Scoped Retrieval, Reporting Periods, and Methodology Lineage
- **Security**: Added server-owned organization and facility query helpers. Internal AI now resolves facility names to authorized IDs and applies organization ID + allowed facility IDs in MongoDB queries before data reaches the model. Evidence global-file fallback, global user listing, and unscoped audit/history paths were removed or replaced with scoped record-ID allowlists.
- **Reporting periods**: Raw-question parsing deterministically resolves explicit month, ISO month, FY, CY, quarter, and current FY/CY requests using organization reporting configuration. Model-invented periods are discarded; no-period answers select the latest valid stored period for emissions analytics and expose the resolved period.
- **Methodology**: Formula questions now retrieve authorized emission records first, follow their exact `formula_id`, return the stored formula/variables/properties/audit data, and explicitly report missing formula/audit information without inference.
- **Analytics**: Scope normalization accepts `Scope 1`, `scope 1`, or `1`; analytics applies scope, category, facilities, organization, and reporting period before aggregation.
- **Status**: Done — iteration 159 verification passed 24/24 executed tests plus frontend login/dashboard smoke. **MOCKED** MongoDB fixture and LLM intent/formatting layers were used for deterministic security tests; the optional live Internal AI chat smoke was skipped because its LLM environment guard was unavailable.

### MIS SBTi Targets + Multiline Trend Legend Spacing
- **Root Cause**: MIS only queried `esg_targets`; separately stored `sbti_targets` were never mapped into the report target feed. Multiline chart legends used three cramped columns without a dedicated gutter.
- **Fix**: Added a read-only SBTi-to-MIS target mapper with live KPI progress, target year, term type, and short/long-term labeling. Multiline charts now use two legend columns, reserved legend height, and explicit row/column spacing.
- **SBTi Leadership Snapshot**: Added a compact six-column “SBTi Trajectory Summary” at the top of the Targets section showing baseline → current → target, term, target year, and status/achievement.
- **Status**: Done — independently verified by testing agent (5/5 runtime checks, PDF content, and visual legend review passed; trajectory layout verified in the exported PDF).

### MIS Water / Waste Dashboard Parity
- **Root Cause**: MIS water metrics included pending-approval records; waste values were legacy kilograms while the UI labeled them as MT; MIS disposal was derived rather than using the submitted Disposal record.
- **Fix**: Water metrics now use approved/not-required records; dashboard and MIS normalize legacy waste quantities to MT; MIS trends use explicit disposal totals; report labels use MT; environment-detail honors the selected reporting period. The Hazardous vs Non-Hazardous Waste chart now reserves a dedicated bottom legend band and has extra PDF height.
- **Status**: Waste legend layout independently verified in the August 2026 PDF (5/5 testing-agent checks). Water/waste API parity was self-checked; the earlier dedicated parity testing-agent run stopped before execution by prior user instruction.

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

### Internal Data AI — Fuel/Activity Consumption Query Routing Fix
- **Root Cause**: `kpi_lookup` intent for fuel-specific consumption questions (e.g., "How much Crude Oil was consumed for July 2026?") was misrouted to `esg_kpi_definitions` (KPI metadata catalog) instead of the emissions pipeline. The `is_emission_metric` heuristic only checked for "emission"/"ghg" keywords and explicit scope — missed `fuel_type` entity presence. Additionally, `analytics.query()` never applied `fuel_type` as a filter.
- **Fix**: 
  1. Added `_has_operational_data_dimension()` in `planner.py` — entity-driven check (fuel_type, scope, category, facility) with no hardcoded fuel names.
  2. Updated `kpi_lookup` routing: when operational data dimensions present + fuel_type → `emissions.search_records()`; no fuel_type → `analytics.query()`; no dimensions → `esg_records.get_kpis()`.
  3. Added `fuel_type` regex filter to `analytics.query()` match stage.
  4. Added `consumption_breakdown` aggregation (quantity + unit + fuel_type) to analytics response.
  5. Added structured debug logging for routing decisions.
- **Status**: Done — iteration 160 verified 32/32 tests (26 planner unit + 6 integration including live endpoint checks).

### Internal Data AI — Consumption Quantity Extraction from dynamic_field_values
- **Root Cause**: `emissions.search_records()` read `r.get("quantity")` / `r.get("unit")` — top-level fields that don't exist on emission records. Actual data lives in `dynamic_field_values.qty.value` / `.unit`. Similarly, `analytics.py` aggregation summed `$quantity` (non-existent). Result: GPT response builder saw `quantity: null` → "No data found."
- **Fix**:
  1. Added `extract_consumption(record)` helper in `query_scope.py` — safely reads `dynamic_field_values.qty`, coerces string values to numeric, returns `(None, None)` for missing data.
  2. `emissions.py` uses the helper for each record summary.
  3. `analytics.py` consumption pipeline uses `$dynamic_field_values.qty.value` with `$convert` (onError/onNull guards) and groups by `$dynamic_field_values.qty.unit` — different units are never incorrectly combined.
  4. `formulas.py` record_inputs also uses the helper.
- **Status**: Done — 39 unit/integration tests pass (26 routing + 13 extraction). User requested skip of full testing agent run.

### Internal Data AI — Scope Filter Format Mismatch
- **Root Cause**: DB stores scope as `"scope1"` but the regex filter `^1$` (from `normalize_scope`) only matched the bare number `"1"`. Additionally, the LLM intent detector infers `scope` and `category` even when the user only mentions a fuel name, adding extra filters that compound the mismatch.
- **Fix**: Added `scope_filter()` helper in `query_scope.py` that builds regex `^(scope\s*)?{num}$` — matches `"1"`, `"scope1"`, `"Scope 1"`, `"SCOPE 1"`, etc. Applied in both `emissions.py` and `analytics.py`.
- **Verified**: All 4 failing queries now return correct data:
  - Consumption: "400 L across 2 records"
  - CO2e: "0.5452 tCO2e combined"
  - Methodology (no period): Both formula_ids with definitions
  - Methodology (with period): Both formula_ids for July 2026
- **Status**: Done — user requested skip of testing agent run.

## Completed Work (Aug 2026) — Sustainability Module Configuration

### Simplified Organization Config (replaces Milestone 1 5-collection design)
- **Architecture**: Single `organization_config` collection — one document per org containing only overrides
- **Resolution logic**: Global `esg_record_categories` + org overrides → final config
- **Schema**: `modules.enabled`, `categories.custom[]` (with full fields), `categories.disabled[]`, `kpi_overrides.{subcategory_code}`, `dashboard.type`
- **Backend**: `/app/backend/modules/sustainability_config/` — contracts, service (resolve_config merger), router (3 admin + 1 user endpoint)
- **Admin UI**: `/sustainability-config` page with 4 tabs: Overview (resolved tree), Modules (enable/disable), KPI Overrides (field editor per subcategory), Custom Categories (full field definitions)
- **Key principle**: Only store overrides. 95% of orgs use global defaults. Only different questions stored per-org.
- **Old 5 collections dropped**: `organization_modules`, `org_module_categories`, `org_module_kpis`, `org_module_kpi_fields`, `org_module_kpi_calcs` all removed
- **Sidebar**: Dynamic — reads `resolved` config and generates Environment children from org's custom modules (Power/Water/Steam)
- **Routing**: Added catch-all `environment/:moduleCode` and `environment/:moduleCode/:subcatCode` routes
- **Status**: Done — Phase A verified with Power/DG Sets/Solar/Steam all showing org-specific custom fields

### Phase A: Config → Sidebar → Environment → Data Entry (Done)
- **Backend `list_categories` enhanced**: Merges `organization_config` overrides into category list — disabled subcats removed, custom categories injected with mapped fields (`field_key`/`type`), kpi_overrides applied
- **Backend `get_category` enhanced**: Returns custom category fields for `custom_*` IDs, applies kpi_overrides for global categories
- **`_map_custom_field`**: Maps org config field format (`field_code`, `response_type`) to global format (`field_key`, `type`) so `DynamicFieldRenderer` renders them correctly
- **Sidebar**: Fetches `GET /api/sustainability-config/resolved`, replaces Environment children with org's resolved modules (Power > Electricity/DG Sets/Solar, Water > Consumption, Steam > KPI/Analysis)
- **`OrgEnvironmentKPI.js`**: New lightweight page for custom module routes, resolves display names from categories API, passes `preFilterCategory` + `preFilterSubcategory` to `ESGRecordsModule`
- **ORG1 config seeded**: Power (3 subcats with 6-7 fields each), Water/Consumption (6 fields), Steam (6 fields), features.set_target enabled, dashboard.type=custom
- **Backward compatibility**: Existing `/environment/energy`, `/ghg`, etc. routes unchanged
- **`features` field added** to organization_config schema for feature flags (set_target, etc.)

## Pending Issues

### Process Emissions Live-Calculation Review (P0)
- **Status**: PARKED by user for later

### Custom Fuel Edit Save Validation (P0)
- **Status**: USER VERIFICATION PENDING

### React 19 Console Warnings — Recharts (P3)
- **Status**: Open

### Environment Report PDF Character Spacing Bug (P2)
- **Status**: Open

## Upcoming Tasks — Sustainability Config Next Steps

### Phase B: Set Target + Record Storage (P0)
- Add Set Target tab to ESGRecordsModule (config-driven via `features.set_target`)
- Ensure records store module_code/category_code for proper Log filtering
- Verify record submit + log cycle end-to-end

### Phase C: Workflow + Analysis + Dashboard + MIS (P1)
- Assignment wizard uses resolved config categories
- Analysis page uses resolved config KPIs
- Dashboard custom mode (standard vs custom)
- MIS reads resolved config

### Phase D: Backward Compatibility + Isolation Testing (P1)
- Verify standard orgs unchanged
- Verify ORG1 sees Power/Water/Steam only
- Full testing with testing agent

## Other Upcoming Tasks (P1)
- Target Settings UI (replace legacy name-based `target_direction` fallback)
- Hash-based Integrity Verification for Evidence Files (SHA-256)
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

### Backend — Sustainability Config
- `/app/backend/modules/sustainability_config/contracts.py` — Pydantic models (FieldDefinition, CustomCategory, KPIOverride, OrganizationConfigUpdate)
- `/app/backend/modules/sustainability_config/service.py` — CRUD + resolve_config (global + overrides merger)
- `/app/backend/modules/sustainability_config/router.py` — 4 endpoints: GET/PUT/DELETE org-config + GET resolved

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

### Frontend — Sustainability Config
- `/app/frontend/src/pages/SustainabilityConfig.js` — Admin Config UI (Overview, Modules, KPI Overrides, Custom Categories)

### Frontend — Emissions
- `/app/frontend/src/components/EmissionEntryForm.js` — Emission entry form
- `/app/frontend/src/modules/ghg/emissions/shared/components/steps/Step1BasicSelection.js`
- `/app/frontend/src/hooks/useCalcEngine.js`
- `/app/frontend/src/pages/Emissions.js`

## Test Credentials
- Admin: goyalsomil2001@gmail.com / TestUser123!
- SuperAdmin: superadmin@ecotrack.com
- Organization ID (ORG_A): 9067d872-8a3a-4ed9-8494-e3ef04952f7c
- Organization ID (ORG_B): 5df41e27-c90d-4660-90b5-475823e0b55f

## 3rd Party Integrations
- Resend (Emails) - requires User API Key
- OpenAI GPT 5.6 Sol / text-embedding-3-large (Repo Pilot) — uses Emergent LLM Key

## Change Log — 2026-08-14
- Fixed Water metric unit editing in `ESGRecordsDataEntry`: Edit Metric now supplies `unitValue` and `onUnitChange` to `DynamicFieldRenderer`, persisting `${field_key}_unit` with the field values.
- Added stable test IDs for Edit Metric action, dialog, unit selector, discard, and save controls.
- Independent regression verification passed: changing a Water quantity unit to `KiloLitres` persists after reload, numeric quantity remains unchanged, and the original production-like record was restored.
- Internal Data AI routing work in progress: deterministic Water routes and the first router expansion for Environment, GHG, Social/Governance, and BRSR/GRI source selection are implemented but still require dedicated runtime verification.
- Fixed Internal Data AI Water/Waste retrieval regression: corrected the configuration resolver’s `organization_id` call, stopped retrieval exceptions from being displayed as `NOT_FOUND`, and mapped Waste “spillage” amount questions to configured `Volume of spill`.
- Regression verification passed (6/6): Water approved counts, `oct`/`october` Waste Spills approval routing, October spillage amount without an invented unit, retrieval-error state, and restricted-user scope.

## Prioritized Backlog Update
- **2026-08-14 — Internal Data AI history units and timezone fix:** Version-history output now ignores unit-only metadata fields (`unit` and `*_unit`) whether diffs are stored or derived, while preserving old/new units alongside actual metric-value changes. The Internal Data AI router now retrieves the organization timezone and passes it to record-history retrieval; UTC version timestamps are converted to that IANA timezone before response formatting.
- **Verification:** Python formatting checks passed for derived and stored diffs, including `Litres → KiloLitres` as the unit context for a numeric change. Live authenticated Internal Data AI history query returned `2026-07-16T14:46:05.865901+05:30` for the organization instead of UTC.
- **2026-08-14 — Internal Data AI history and people-metric fixes:** AI version-history retrieval now includes version snapshots and stored field diffs, derives before/after values from consecutive applied snapshots when needed, and presents value changes with available units. History copy now clarifies that a requested month filters the record reporting period, not the version-edit timestamp. Count metrics (employees, incidents, cases, and similar fields) no longer display the misleading `(unit not stored)` suffix. Deterministic routing now maps women/female employee questions to `Employee Diversity.no_of_female`.
- **Verification:** Not run at the user's explicit request.
- P0: Verify the expanded Internal Data AI router end-to-end before relying on it for Environment/GHG/Social/Governance/BRSR/GRI answers.
- P1: Add organization-configurable topic aliases for broad Social/Governance themes such as board, risk management, and policies.
- P1: Investigate dashboard chart container and React key-spread console warnings reported during Water unit regression testing; they were not reproduced in the current smoke log.
- P2: Consider lazy OpenAI client initialization in `response_builder.py` to simplify isolated unit-test collection when no API key is configured.
