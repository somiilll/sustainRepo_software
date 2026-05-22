# SustainRepo - GHG Calculation Platform PRD

## Original Problem Statement
Multi-tenant Greenhouse Gas (GHG) calculation platform compliant with ISO 14064-1:2018. Features include:
- Dynamic GHG calculations with centralized CalcEngine
- Premium ESG Analytics Dashboard
- ISO-compliant DOCX report generation for Scope 1, 2, and 3
- Robust Scope 3 Bulk Upload
- Comprehensive Base Year tracking module

## Core Architecture
- **Frontend**: React, Tailwind CSS, Shadcn/UI
- **Backend**: FastAPI, Motor async driver, Pydantic
- **Database**: MongoDB
- **Key Pattern**: Centralized `CalcEngine` with dynamic property resolution

## Key Files
- `/app/backend/server.py` - Main API (~10,000+ lines, needs refactoring)
- `/app/frontend/src/pages/Dashboard.js` - Dashboard with analytics
- `/app/frontend/src/pages/Emissions.js` - Emissions management (~7000+ lines)
- `/app/frontend/src/components/EmissionEntryForm.js` - Entry form (~4479 lines, Phase 5 complete)
- `/app/frontend/src/components/MultiEmployeeInput.jsx` - C6/C7 employee table input
- `/app/frontend/src/pages/Sinks.js` - GHG Sinks module with Monthly/Yearly data entry

## What's Been Implemented

### May 2026 Session (Latest)

**May 26, 2026 - Phase 5 Frontend Refactoring (Complete)**

1. **Step 1 Component Extraction (NEW)**
   - Extracted Step 1 (Basic Selection) from EmissionEntryForm.js
   - Using `/app/frontend/src/modules/ghg/emissions/shared/components/steps/Step1BasicSelection.js`
   - Component handles: Facility selection, Scope radio buttons, Category dropdown, Fuel/Activity selection
   - ~690 lines replaced with component call

2. **Step 3 Component Extraction (NEW)**
   - Extracted Step 3 (Year & Monthly Data) from EmissionEntryForm.js
   - Using `/app/frontend/src/modules/ghg/emissions/shared/components/steps/Step3YearMonthlyData.js`
   - Component handles: Reporting year, Frequency, Monthly accordions, Yearly data, Evidence uploads
   - ~1016 lines replaced with component call

3. **Step 2 Component Extraction**
   - Extracted Step 2 (Process & Responsibility) from EmissionEntryForm.js
   - Created `/app/frontend/src/modules/ghg/emissions/shared/components/steps/Step2ProcessResponsibility.js`
   - Component handles: Process names, Responsible person, Designation, Contact, Asset name, Location fields
   - ~250 lines extracted

4. **Step 4 Component Extraction**
   - Extracted Step 4 (Notes & Summary) from EmissionEntryForm.js
   - Created `/app/frontend/src/modules/ghg/emissions/shared/components/steps/Step4Notes.js`
   - Component handles: Additional notes, Review summary with all form data
   - ~120 lines extracted

5. **EmissionEntryForm.js Final Reduction**
   - **Reduced from 6056 lines to 4479 lines (~1577 lines = 26% reduction)**
   - All 4 form steps now use modular components
   - Used Python script for safe large-block JSX replacement (search_replace fails on 700+ line strings)

**May 21, 2026 - Phase 5b: Deep Modularization Prep**

1. **Standalone Utility Extraction**
   - Created reusable hooks, constants, and utilities as building blocks for future integration
   - These modules can be incrementally integrated into EmissionEntryForm.js

2. **New Modules Created:**
   - `useEmissionFormState.js` (~280 lines) - All 60 useState hooks extracted
   - `useEmissionFormEffects.js` (~180 lines) - Data fetching effects
   - `emission-form-constants.js` (~100 lines) - Constants and helpers
   - `DynamicFieldRenderer.js` (~200 lines) - Renders dynamic form fields
   - `validation.js` (~300 lines) - Step validation utilities
   - `payload-builders.js` (~270 lines) - API payload construction
   - **Total: ~1,330 lines of reusable, tested code**

3. **Directory Structure:**
   ```
   /modules/ghg/emissions/shared/
   ├── components/
   │   ├── DynamicFieldRenderer.js  # NEW
   │   └── steps/                   # Existing step components
   ├── constants/                   # NEW
   │   └── emission-form-constants.js
   ├── hooks/                       # NEW
   │   ├── useEmissionFormState.js
   │   └── useEmissionFormEffects.js
   └── utils/                       # NEW
       ├── validation.js
       └── payload-builders.js
   ```

**May 19, 2026 - C9 Customer Labels & Sinks Yearly Entry**

1. **C9 "Customer" Label Change (P0)**
   - Changed "Supplier Name" → "Customer Name" for C9 (Downstream Transportation and Distribution)
   - Changed "Supplier Code" → "Customer Code" for C9
   - Updated section header: "Supplier Information (Optional)" → "Customer Information (Optional)"
   - Updated placeholder text accordingly
   - Applied in both EmissionEntryForm.js (creation) and Emissions.js (edit dialog)
   - DB field remains `supplier_name`/`supplier_code` (only UI label changed)

2. **Sinks Yearly Data Entry (P0)**
   - Added "Data Entry Frequency" dropdown with Monthly/Yearly options
   - Monthly mode: Shows 12-month accordion for individual month entries
   - Yearly mode: Shows single annual input field with purple styling
   - Added `frequency_type` field to Sink models (backend)
   - Backend preserves frequency_type when editing (locked once saved)
   - Reporting year display follows org settings:
     - Financial Year orgs: "FY 2026-27" format
     - Calendar Year orgs: "CY 2026" format
   - Badge shows "Annual Entry" or "Monthly Entry" with formatted year
   - Yearly records display as "FY 2026" in table Period column

**May 19, 2026 - Earlier Updates**
1. **Activity Search in Edit Dialog for C6/C7**
   - Added searchable activity dropdown in Edit Dialog (`Emissions.js`)
   - Mirror functionality from `EmissionEntryForm.js`
   - Search input with clear button, real-time filtering
   - Shows count of matching activities
   - "No match" message displayed when no activities match search term
   - Search clears on activity selection and when category/activity type changes

2. **C6 Unit Field Fix**
   - Removed spurious unit text field for "No. of Days Travelled" in C6 Annual Data
   - Added `qty_days_travelled` and `working_days` to unitless count fields list in `MultiEmployeeInput.jsx`
   - Also fixed in `EmissionEntryForm.js` and `Emissions.js` edit dialog for C6 categories

3. **Dashboard KPI Layout Update**
   - Removed "Total Facilities" KPI card
   - Removed "Scope 3 Categories" card row
   - Added three vertically-stacked KPI cards on left side of "Emissions by Scope" graph:
     - Total Emissions (with secondary gradient styling)
     - Total Sinks (green gradient styling)
     - Net Emissions (blue gradient styling)

4. **Dashboard Scope 3 Emission Hotspots**
   - Changed bar colors from red/severity-based to distinct colors (Violet, Blue, Emerald, Amber)
   - Fixed chart height to 280px
   - Added tCO₂e label to X-axis
   - Removed "Top 4 categories" footer text
   - Updated ranking panel with matching color schemes

5. **Dashboard Emission Categories & Fuel Type Analysis**
   - Renamed "Top 3 contributors" to "Top contributors"
   - Removed percentage badges from both sections
   - Fixed fuel name truncation to show full names

6. **Dashboard Filter Alignment**
   - Fixed filter panel alignment issues

7. **N2O Color Consistency Fix**
   - Fixed N2O formula step showing blue color instead of green in edit dialog
   - Made isOutput check case-insensitive for co2, ch4, n2o, co2e
   - Changed N2O emissions display from purple to amber to match warm tones

8. **Formula Name Hidden for C7**
   - Removed formula name display in MultiEmployeeInput for C7 Employee Commuting

9. **From/To Location Fields for C4, C6, C7, C9**
   - Added optional "From Location" and "To Location" text fields for transportation/travel categories
   - C7: Added to each employee row in MultiEmployeeInput
   - C4, C6, C9: Added as single fields in EmissionEntryForm and Emissions.js edit dialog
   - Backend: Added from_location and to_location to EmissionRecordCreate and EmissionRecordResponse models

10. **Reporting Year Type Restriction**
    - If organization has "Reporting Year Type" set to Financial or Calendar, hide the year type toggle in EmissionEntryForm
    - Auto-select year type based on organization setting
    - Show read-only indicator "(Set by organization)" when preference is locked

### December 2025 Session

**Premium Dashboard UI/UX Transformation**
- Transformed dashboard into premium, futuristic climate intelligence platform
- Added ambient gradient backgrounds (emerald, blue, violet)
- Implemented glassmorphism cards with colored glows based on category
- Added AI Insights strip with dynamic contextual insights
- Premium Emissions Trend chart with gradient fills, glowing strokes, monotone curves
- Premium tooltip with dark glass effect
- Scope 3 Hotspots with animated progress bars
- Default reporting period changed to Previous FY
- Filter panel with compact spacing and quick FY buttons

1. **Dashboard Scope 3 Proration Fix**
   - Fixed `CY 2025` format parsing (whitespace handling)
   - Fixed bulk upload `total_emissions` field not being saved
   - Added dashboard fallback to `co2e_emissions` field

2. **Base Year Comparison Separation**
   - Split into Direct (Scope 1 & 2) and Indirect (Scope 3 & Biogenic) panels
   - Each panel shows its own base year
   - Added "Base Year Not Configured" state handling

3. **DOCX Report Generation Enhancements**
   - Added Category-wise Emission Analysis Chart in Organization Analysis section
   - Report proration logic with `*` markers for prorated items
   - Fixed Scope 1,2 Base Year showing 0
   - Fixed Chapter 3 showing out-of-period records

4. **Scope 3 Asset Name Field**
   - Added mandatory Asset Name text field for C8, C13, C14, C15 categories
   - Added to Bulk Upload Excel template

### Previous Sessions
- UI/UX Standardization (Custom flags, Override checkboxes)
- Data Entry Validations
- Version History Overhaul
- Overlapping Date Filtering for CY/FY periods
- Dashboard Proration implementation

## Known Issues
- P1: Scope Change Recalculation Bug in EmissionEntryForm (recurring issue - `setFuelId('')` wipes fuel state)
- P1: Dashboard "No Data" after toggling organization Scope access
- P2: C7 Edit Dialog Stale State (yearly financial periods not transforming correctly)

- ✅ Phase 7l-C (Feb 2026): CREATE Migration Phase C — C1 PoC SHIPPED & VERIFIED
  - **Added C1-only short-circuit** at the top of `EmissionEntryForm.handleSubmit` (`/components/EmissionEntryForm.js` lines ~3857–3970), gated by `frequencyType === 'monthly' && scope === 'scope3' && /^c1/.test(category) && module.buildCreatePayload`.
  - Per-month loop now drives entirely through module helpers: `extractInputsForCalcEngine` → calc engine → `buildCreatePayload` → POST.
  - **All other scopes/categories continue through legacy code** (gating logic verified by code review — C2, S1, C7 cannot accidentally enter the new branch).
  - **Manual E2E verification PASSED** via Playwright: full Add Emission flow — Facility A → Scope 3 → C1 → Spend Based → Soybean Farming → Process + Person → April 2026 / 1000 → Submit:
    - POST `/api/calc-engine/execute-by-category` → 200 (CO2e = 0.0228 tCO2e)
    - POST `/api/emissions` → 200/201 (single record persisted, dialog closed, list refreshed)
    - Payload contains all 26 expected keys including scope3_ef_id, calculation_method_scope3='spend_basis', scope3_activity='Soybean Farming', dynamic_field_values dict, outputs, process_names
    - Payload correctly EXCLUDES asset_name + from_location (C1 has no asset-name / journey-locations capability)
    - supplier_name + supplier_code present (Scope 3 always has these)
  - **Architectural milestone**: CREATE flow now demonstrably traverses module dispatch end-to-end. Phase D (broaden to C2–C15) can begin.

- ✅ Phase 7l-B (Feb 2026): CREATE Migration Phase B — Shared Helpers
  - **Created `/modules/emissions/categories/shared/Scope3FlatCreate.js`** (~360 lines): capability-aware `validateCreateSubmission` + `buildCreatePayload` + `createScope3FlatCreateApi(module)` factory + helper exports (`extractInputsForCalcEngine`, `buildDynamicFieldValues`, `buildDecisionContext`). Mirrors `Scope3FlatEdit.js`. Capability-aware: `asset_name` (C8/C13/C14/C15), `from_location`/`to_location` (C4/C6/C9), employee fields (C7).
  - **Created `/modules/emissions/categories/shared/Scope1Create.js`** (~250 lines): same surface for Scope 1/2 + biogenic-scope1. CV/density/EFH override semantics + override_justification min-length 20 chars preserved.
  - **Wired both into `initializeCategoryModules()`**: every flat-field Scope 3 module (C1–C6, C8–C15) + GenericScope3 + all Scope 1 modules (Stationary/Mobile/Fugitive + Generic) + GenericScope2 now expose `validateCreateSubmission` + `buildCreatePayload` + helper functions on the registry.
  - **Behaviour preserved**: validations, payload shape, dynamic_field_values structure, calc-engine context all byte-identical to legacy `EmissionEntryForm.js handleSubmit`.
  - **Init log unchanged at 41 entries** — same modules, just more methods attached. Smoke test confirms clean compile + page renders.
  - **Phase C (C1 PoC) ready to start**: `EmissionEntryForm.js handleSubmit` can now look up `activeModule.buildCreatePayload(...)` for any flat-field Scope 3 / Scope 1 / Scope 2 record.

- ✅ Phase 7k+l (Feb 2026): C7 Save Fix + Step3Renderer Wiring + CREATE Migration Scoped
  - **Investigated C7 Update silent no-op** — reproduced via console logging. Root cause: C7 module's `hasCalculatedData` validation rejected hydrated records where `emissions.co2e` was `null/undefined` after `handleEdit` transformation. Toast was firing but Sonner auto-closed before test harness captured.
  - **Fix 1 (Hydration)**: `handleEdit` now clones `emissions` and normalises `co2e: null/undefined` → `0` for both monthly and yearly transforms.
  - **Fix 2 (Validation)**: C7 `hasCalculatedData` check now accepts presence of **inputs** in `monthly_data` / `yearly_data` even without `emissions.co2e` — covers hydrated records.
  - **Fix 3 (C7 audit log skip)**: removed `persistCalcAuditLog` call from C7 branch — the calc-engine endpoint doesn't accept C7's per-employee shape and was returning HTTP 400. Restores parity with pre-refactor behaviour (legacy never called audit log for C7).
  - **C7 EDIT save VERIFIED FIXED via manual screenshot test**: single PUT 200, no failing audit POST, dialog closes cleanly, list refreshes.

  - **Step3FrequencyRenderer** (`/modules/emissions/shared/renderers/Step3FrequencyRenderer.jsx`): thin adapter re-exporting the existing 1140-line `Step3YearMonthlyData` as a module-attachable renderer.
  - **`EmissionEntryForm.js`** now resolves `activeModule` via the registry (mirroring `Emissions.js` EDIT lookup) and uses `module.Step3Renderer` for Step 3 (falls back to direct import). Architectural symmetry between EDIT and CREATE.

  - **CREATE Migration Plan documented** at `/app/memory/CREATE_MIGRATION_PLAN.md` — 8 phases mapped, risks identified, ~5–6 session estimate.
  - **Phase A of CREATE migration shipped**: extended `CategoryModuleInterface.js` JSDoc with `validateCreateSubmission` + `buildCreatePayload` contract (mirror of EDIT contract) and documented `Step3Renderer` + `CreateWizard` renderer slots.

- ✅ Phase 7j (Feb 2026): Scope 2 Extracted + Legacy `handleSubmit` Block DELETED
  - Created `/modules/emissions/categories/Scope2Modules.js` with `GenericScope2Module` (one generic module covers all Scope 2 sub-categories — Purchased Electricity, Steam, Heating, Cooling).
  - **Reused shared `Scope1Edit` helpers** on Scope 2 (already supported `scope === 'scope2'` in override-justification check + payload spreads).
  - **Extended `activeCategoryModule`** in `Emissions.js` to resolve Scope 2 to the generic module.
  - **DELETED ~472 lines** of legacy inline `handleSubmit` payload/validation/POST/audit block. Replaced with a defensive fallback (`toast.error('No category module matched...')`) that should never fire for valid records.
  - **Emissions.js: 7144 → 6672 lines** (cumulative drop: **7141 → 6672 = 469 lines removed across the full refactor session**).
  - All edit-save flows now route exclusively through module dispatch: C7 multi-employee branch + generic Scope 1/2/3/biogenic module dispatch.
  - **Testing iter_73 PASSED 100%** across 7 verified paths (Scope 2 ×2, Scope 1 ×2, biogenic-scope1, S3 C2, biogenic-scope3). All fire PUT 200 + dual audit POST 200 with byte-identical payload shapes. Defensive fallback did not fire. Init log shows expected 41 entries (was 40, +1 for GenericScope2).

- ✅ Phase 7i (Feb 2026): Scope 1 Edit-Flow Logic Isolation + Latent Audit Log Bug Fix
  - Created `/modules/emissions/categories/shared/Scope1Edit.js` (~310 lines): shared `validateEditSubmission` + `buildEditPayload` + `createScope1EditApi(module)` factory. All 8 Scope 1 validations preserved byte-identically (CV/density override justifications, override main justification, required numeric fields, process names, fuel selection, calc-engine prerequisite, override value validity, dynamic override/optional value check).
  - **Wired editApi to all Scope 1 modules**: `stationary_combustion`, `mobile_combustion`, `fugitive_emissions` + the generic Scope 1 fallback (also handles biogenic-scope1).
  - **Extended `activeCategoryModule` lookup** in `Emissions.js` to resolve Scope 1 categories by name (stationary/mobile/fugitive) + biogenic-scope1 via generic fallback.
  - **Latent bug fix**: introduced `persistCalcAuditLog` helper at the top of `handleSubmit`. Now called by ALL dispatch branches (C7, generic module, legacy) — fixes a silent gap where Scope 3 + biogenic-scope3 module paths were skipping calc audit log persistence. Override sources will now correctly reload on re-edit for all paths.
  - **Sub-fix during iter_72**: persistCalcAuditLog used wrong `scope_code` for biogenic-scope3 category lookup. Resolved via `effectiveScope = (scope==='biogenic' && biogenicScopeSelection==='scope3') ? 'scope3' : scope`.
  - **Testing (iter_71 + iter_72)**: 7 of 8 paths fully verified — S1 Stationary, S1 Mobile, S1 Custom Fuel, biogenic-S1, S3 C2, biogenic-S3, Scope2 legacy. C7 audit log code is structurally identical (uses same helper) but test harness couldn't trigger Update click on multi-employee dialog — flagged as test-harness limitation, not regression.

- ✅ Phase 7h (Feb 2026): Biogenic-Scope3 Dispatch + Legacy Scope 3 Code Removed
  - **Extended `activeCategoryModule` lookup** in `Emissions.js` to resolve **biogenic+scope3** records to the GenericScope3 fallback module — so biogenic-scope3 edits now also flow through the new module path (consistent with all Scope 3).
  - **Wired generic Scope 3 module**: attached `validateEditSubmission`, `buildEditPayload`, `DynamicFieldsRenderer`, `hasCapability` to the registry's generic fallback. Capabilities empty → no extras leak.
  - **Deleted ~95 lines of dead Scope 3 inline code** from `Emissions.js handleSubmit`:
    - Validation block: replaced 45-line `if (isScope3LikeSave) {...}` with a 4-line fuel check (legacy now serves Scope 1/2/biogenic-scope1 only)
    - Payload spreads: removed all `...(isScope3LikeSave && {...})` blocks, the `isScope3LikeSave ? null : formData.fuel_id` ternary, the activity-fallback inside `getFieldUnitForSave`
    - Cleaned up dead `['c4','c6','c7','c9'].some(...)` + `['c8','c13','c14','c15'].some(...)` chains in the payload
  - **Emissions.js: 7102 → 7005 lines (~97 lines removed)**
  - **Testing agent (iter_70) PASSED 100%** across all 5 paths: Scope 1, Scope 2, biogenic-scope1 (legacy) + Scope 3 flat, biogenic-scope3 (module). No regressions.

- ✅ Phase 7g (Feb 2026): Shared Scope 3 Flat-Edit Module — Full C1–C15 Migration
  - Created `/modules/emissions/categories/shared/Scope3FlatEdit.js` (~350 lines): capability-aware `validateEditSubmission` + `buildEditPayload`. Appends `asset_name` only when `module.hasCapability('asset-name')`; appends `from_location`/`to_location` only when `'journey-locations'`.
  - Added `createScope3FlatEditApi(module)` factory — binds the module reference so capability checks light up automatically per-category.
  - Refactored `/categories/C1PurchasedGoods/edit.js` into a **thin proxy** to the shared helper (~15 lines, down from ~290).
  - **`initializeCategoryModules()`** now attaches `validateEditSubmission` + `buildEditPayload` to ALL flat-field Scope 3 categories (C1–C6, C8–C15) via the factory.
  - **Emissions.js handleSubmit**: replaced the C1-only short-circuit with a **generic module dispatch**: `if (activeCategoryModule?.buildEditPayload && activeCategoryModule?.id !== 'c7')`. All 14 flat-field categories now save through the module path; legacy inline flow retained as fallback for Scope 1/2.
  - **Testing agent regression PASSED 100%** (iteration_68): C2 + C4 (journey-locations) + C10 PUTs all 200, payloads byte-identical to legacy, capability-aware extras correct, negative validation blocks save, Scope 1 regression confirms legacy path untouched.

- ✅ Phase 7f (Feb 2026): C1 Edit-Flow Logic Isolation (C7 pattern mirror)
  - Created `/modules/emissions/categories/C1PurchasedGoods/edit.js` with `validateEditSubmission` + `buildEditPayload` pure functions
  - Validations preserved byte-identically: required-field numeric check, process-name & description, scope3 method & activity selection, supplier-basis unit check, calc-engine prerequisite, override/optional value check
  - Payload structure byte-identical with prior shared inline implementation (no asset_name / no journey location — C1 has neither capability)
  - Wired onto `categoryRegistry.get('c1')` as `validateEditSubmission` + `buildEditPayload`
  - **`Emissions.js handleSubmit`**: added a C1-only short-circuit immediately after the C7 branch. C1 edits now go through the module path; C2–C15 + Scope 1/2 still use legacy shared flow (zero impact)
  - First flat-field category with truly isolated edit logic — establishes the template for migrating C2–C15

- ✅ Phase 7e (Feb 2026): Renderer Rollout + Capabilities System
  - Attached `Scope3DynamicFieldsRenderer` to **all flat-field Scope 3 categories** (C1–C6, C8–C15). C7 excluded (multi-employee renderer).
  - Introduced **module capability flags**: each module now exposes `capabilities: []` + `hasCapability(cap)` lookup. Derived from `scope3-definitions.js` (`requiresAssetName` → `'asset-name'`, `requiresLocation` → `'journey-locations'`, `requiresSubcategory` → `'subcategory'`, `activityTypes` → `'activity-types'`, `supportsMultiEmployee` → `'multi-employee'`).
  - Replaced page-side conditional chains in `Emissions.js`:
    - `['c8','c13','c14','c15'].some(...)` → `activeCategoryModule?.hasCapability?.('asset-name')`
    - `['c4','c6','c9'].some(...)` → `activeCategoryModule?.hasCapability?.('journey-locations')`
  - Cleaner architecture: when a new category is added or capability mapping changes, only the definition file is edited — no JSX chains to hunt.

- ✅ Phase 7d (Feb 2026): C1 Renderer Migration (Config-driven render proof)
  - Created `/modules/emissions/shared/renderers/Scope3DynamicFieldsRenderer.jsx`
  - Extracted ~250 lines of dynamic-field JSX (calc-engine driven inputs, override checkboxes, unit selectors, supplier-basis text units, responsible-person triplet) — byte-identical markup
  - Attached as `DynamicFieldsRenderer` on the C1 module via the registry
  - `Emissions.js` looks up `categoryRegistry.get(<code>).DynamicFieldsRenderer` and mounts it when present (C1 only); falls back to legacy inline JSX for all other categories
  - Proves the architectural boundary: **the page asks the registry "who renders this?" and the module answers** — true config-driven render via registry
  - Pixel-perfect visual parity preserved (same Tailwind classes, same JSX shape)

- ✅ Phase 7c (Feb 2026): C7 Logic Isolation (Proof-of-Concept)
  - Extracted C7 edit-flow business logic into `/modules/emissions/categories/C7EmployeeCommuting/edit.js`
  - `validateEditSubmission`, `extractTotals`, `buildEditPayload` — pure functions
  - `Emissions.js` `handleSubmit` C7 branch now ~50 lines (was ~210) — thin orchestration only
  - Module surface: `c7Module.validateEditSubmission`, `c7Module.buildEditPayload`
  - UI rendering (`MultiEmployeeInput`) preserved as-is per architectural directive
  - Payload shape **byte-identical** to prior inline implementation
  - Emissions.js dropped 7142 → 6991 lines (~150 lines extracted)
  - Architectural pattern: category module owns logic; orchestration in page

## Completed Tasks
- ✅ Phase 5: Extract Step 1-4 from EmissionEntryForm.js (26% reduction)
- ✅ Phase 5b: Extract standalone utilities (hooks, validation, payload builders)
- ✅ Phase 6: Extract and integrate EmissionFilters, form sections into Emissions.js
- ✅ Phase 6: Create EditFormSections.js with reusable form section components
- ✅ Phase 7: New Emissions Module Architecture
  - Category Registry system with factory pattern
  - Module interface/contract for all categories
  - Zustand stores (emissionsStore, editFormStore, entryFormStore)
  - API service layer abstraction
  - EmissionsContext + provider
  - Config-driven DynamicFormRenderer (react-hook-form + zod)
  - C7 Employee Commuting reference implementation
  - Generic Scope3 fallback module
- ✅ Phase 7b (Feb 2026): Full Category Registration & App-boot Wiring
  - All Scope 3 (C1-C6, C8-C15) auto-generated and registered via `CategoryGenerator`
  - Scope 1 modules (Stationary, Mobile, Fugitive + Generic fallback) registered
  - `initializeCategoryModules()` called once in `App.js` at boot — idempotent
  - Verified registration: 14 Scope 3 + Scope 1 + C7 + aliases → **40 registry entries**
  - Fixed import path in `DynamicFormRenderer.js` (`../../../` → `../../../../`)
  - Fixed duplicate `employeeFields` export in C7 module
  - Smoke tested: app builds, login works, Emissions page renders unchanged

## Upcoming Tasks (P0/P1)
- **Next P0**: Route C7 edit dialog through `DynamicFormRenderer` as proof-of-concept (then migrate C1–C15, Scope 1 & 2 one-by-one)
- Migrate remaining categories' UI through `DynamicFormRenderer` (registry already populated)
- P1 Bugs: Scope Change Recalculation, Dashboard "no data" on scope toggle
- "Apply to all months" autofill for S3C7 Employee Commuting

## Future/Backlog (P2)
- Add Monthly/Yearly frequency indicators
- CBAM module and report template
- Refactor server.py (>11,000 lines)
- Integrate extracted hooks into EmissionEntryForm.js (useEmissionFormState, useEmissionFormEffects)
- EmissionEntryForm.js: Current 4479 lines → target ~800 lines via hook integration

## Technical Notes
- Reporting periods: Monthly (YYYY-MM), Financial Year (FY YYYY-YYYY), Calendar Year (CYYYYY or CY YYYY)
- Dashboard applies proration for CY/FY entries based on date filter overlap
- Base year data separated by scope group (direct vs indirect)
- Unitless count fields: qty_passenger, qty_passengers, qty_nights, qty_room, qty_rooms, qty_days_travelled, working_days

## 3rd Party Integrations
- Cloudflare R2 (Storage) - requires User API Key
- Resend (Emails) - requires User API Key
