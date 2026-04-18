# SustainRepo - GHG Calculation Platform PRD

## Original Problem Statement
Multi-tenant Greenhouse Gas (GHG) calculation platform with dynamic, configuration-driven emissions calculation engine managed by SuperAdmin.

## Core Architecture
- **Frontend:** React + Tailwind CSS + Shadcn UI
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **File Storage:** Cloudflare R2 (S3-compatible)
- **3rd Party:** Anthropic (AI summaries), Resend (emails), ReportLab (reports), Matplotlib (charts), Playwright + mammoth (PDF generation)

## What's Been Implemented (Latest Session - 2026-04-18)

### Feature Additions
-4. **Calc Engine — Phase 2 UI Components (2026-04-18)**
   - New `/app/frontend/src/pages/VariableRegistry.js`: Lists all system variables with search/filter, add custom variables (non-system), view key/label/type/dimension/default_unit, system lock badges
   - New `/app/frontend/src/pages/PropertyValuesEditor.js`: Lists all property values with filter by property, add property values with context key-value pairs, shows value/unit/context/source columns
   - New `/app/frontend/src/pages/FormulaBuilder.js`: Visual formula editor with inputs/properties/steps/outputs sections, dependency graph preview, category binding, version badges, expandable formula details
   - New `/app/frontend/src/pages/DecisionTreeEditor.js`: Visual decision tree editor, categories without trees warning panel, recursive node editor (branch/leaf), formula selector dropdowns, tree preview
   - Added routes in `App.js`: `/super-admin/variable-registry`, `/super-admin/property-values`, `/super-admin/formula-builder`, `/super-admin/decision-trees`
   - Updated `Sidebar.js` with navigation items: Variable Registry, Property Values, Formula Builder, Decision Trees
   - **Dynamic Variable Protection**: Removed hardcoded "system" lock. Variables can now be edited/deleted unless used in formulas. Usage check shows which formulas reference the variable.
   - All pages fully functional with CRUD dialogs, filter/search, data-testids for testing
   - Testing agent passed all 9 test cases (100% frontend success rate)

-3. **Calc Engine — Phase 2 (Formulas + Decision Trees + Sandbox) (2026-02)**
   - New `calc_engine/formulas.py` with persistence: `ce_formulas`, `ce_formula_versions` (append-only, auto-bumped on every `definition` change), `ce_decision_trees`, `ce_decision_tree_versions`. Each formula mutation retires the previous version and writes a snapshot.
   - Decision-tree resolver: walks a nested `{field_name, allowed_values, options: {val: {next|formula_id}}}` structure given `decision_inputs`, returns `(formula_id, path_audit)`.
   - Endpoints: full CRUD `/api/super-admin/calc-engine/formulas` + versions, decision trees + `execute-by-category` (tree resolution → formula lookup → engine.execute), `/super-admin/calc-engine/execute` (direct by formula id).
   - Pre-create/update formula is validated against system variable registry (undeclared names rejected, gas→co2e aggregation enforced).
   - **Calculation Sandbox** page at `/super-admin/calc-sandbox` (user's explicit ask): formula picker, auto-generated input form from formula_inputs, context + optional per-property user overrides, "Run" button, side-by-side Outputs panel + colour-coded step-by-step Audit Log. All dry-run, nothing persisted.
   - Live tested via curl + Playwright: Stationary Combustion formula → decision tree → executes with context `fuel_code=Diesel, region=IN` → outputs co2 74.1MM / ch4 3k / n2o 600 / co2e 74.34MM kgCO2e, audit log captures 13 steps (validate → input → convert → resolve_property × 5 → formula_step × 4 → outputs).

-2. **Calc Engine — Phase 1 Foundations (2026-02)**
   - New `/app/backend/calc_engine/` package with `variables`, `units`, `properties`, `transformations`, `expression` (AST-whitelisted safe_eval), `audit`, `execution` orchestrator, `seed`, `router`.
   - New collections seeded idempotently on startup: `ce_variables` (13 system-locked), `ce_units` (27 simple), `ce_compound_units` (14 compound, derived dimension vectors + base factors), `ce_properties` (8 system properties), plus empty `ce_property_values`, `ce_org_property_values` (schema reserved, resolver layer skipped for Phase 1), `ce_calculation_audit_logs`.
   - Unit system: dimension-vector based; same-dim conversions always allowed; cross-dim requires a transformation (`volume_to_mass` via density shipped).
   - Property resolver: user_override → org_override (SKIPPED P1) → `ce_property_values` (context-matched, specificity scoring) → **fuel_database read-through adapter** (maps CV/density/EF columns onto properties) — no data migration needed.
   - Formula validator: rejects undeclared names, enforces gas-based formulas also produce co2e.
   - Endpoints: GET /api/calc-engine/{variables,units,properties,transformations,resolve-unit,property-values}; SuperAdmin POST/DELETE /api/super-admin/calc-engine/{variables,property-values}; **POST /api/super-admin/calc-engine/dry-run** (Sandbox); POST /api/super-admin/calc-engine/validate-formula.
   - Test coverage: `/app/backend/tests/test_calc_engine.py` — 14 assertions covering unit conversions, dimension mismatch, 3-layer property resolution, formula validator, gas-based + co2e-only formula execution with audit log, volume→mass transformation, missing-input rejection, non-dry-run persistence. All pass.
   - Parallel to existing engine — zero impact on current emissions flow.

-1. **Dynamic Scopes & Categories (SuperAdmin-managed) (2026-02)**
   - New collections `scopes` and `emission_categories`; seeded idempotently on startup (`seed_scopes_and_categories`) with Scope 1/2/3/Biogenic and their historical categories
   - `/app/backend/scopes_module.py` exposes `GET /api/scopes`, `GET /api/categories`, plus SuperAdmin CRUD under `/api/super-admin/scopes` and `/api/super-admin/categories` including `/restore` endpoints
   - Soft-delete: blocked when category is referenced by emission records (name or code match), blocked for scopes with active categories or emission records, blocked code change for `is_system` entries
   - New SuperAdmin UI at `/super-admin/scopes-categories` (`ScopeCategoryManagement.js`) with tree view, inline add/edit/soft-delete/restore, system badges, inactive toggle
   - Fuel Database form redesigned: Scope selector is required and drives the visible Categories; categories clear automatically when scope changes
   - Emissions (`Emissions.js`) + `EmissionEntryForm.js` scope radios and custom-category dropdown now pull from `/api/scopes` and `/api/categories`; tabs on Emissions list also dynamic
   - Test coverage: backend CRUD + guardrails verified end-to-end by testing agent (20 passed)

0. **Cascading Hard Delete for Organizations & Facilities (2026-02)**
   - New `/app/backend/cascade_delete.py` utility with `cascade_delete_organization` and `cascade_delete_facility`
   - On permanent delete, cleans up across: facilities, emission_records, emission_history, sinks, base_year_emissions, base_year_emissions_deletions, users, password_resets, uploaded_files (DB) and linked R2 objects
   - Harvests file ids from: org.logo/attachments/invoice_history, facility.attachments, emission.evidence_url/attachments, sink.evidence_files, plus orphan uploaded_files belonging to org users
   - R2 failures are logged and do NOT block DB cleanup; no orphan records remain
   - Endpoint: `DELETE /api/super-admin/organizations/{org_id}/permanent` and `DELETE /api/facilities/{facility_id}`
   - Test coverage: `/app/backend/tests/test_cascade_delete.py` (unit + e2e, passes)

1. **Responsible Person - Designation & Contact Fields**
   - Added to Emissions module (EmissionEntryForm.js + Emissions.js)
   - Added to Facilities module
   - Added to Organization Details
   - Updated all backend schemas

2. **Heat Basis Field Hidden**
   - "Custom CO₂ Emission Factor (Heat Basis)" now hidden in Emissions UI
   - Functionality preserved for existing data

3. **Base Year Sinks Display & Input**
   - Sinks now shown in Base Year Emissions view dialog
   - When base year < oldest reporting year and sinks exist, prompts for sink inputs
   - Added `sinks_data` field to BaseYearEmissions models

4. **Sink Delete R2 Cleanup**
   - Enhanced `delete_sink` endpoint to delete associated R2 files
   - Returns "Sink record and associated files deleted successfully"

5. **PDF Generation with Playwright (Async)**
   - Replaced LibreOffice with Playwright + mammoth
   - DOCX → HTML → PDF conversion using async API
   - Fixed "Sync API inside asyncio loop" error

### Bug Fixes
- Scope 1→Scope 2 filter reset
- Scope 2 Renewable Electricity custom EF reset (using `??` for 0 handling)
- Password Eye icons with upfront requirements
- Email password display
- User hard delete
- Monitoring/Reporting frequency validation
- "Last Updated" sorting option
- Fuel type search filter

### UI Updates
- Login page: "Haven't registered yet? Contact us to sign up here." with link
- Password requirements shown upfront with progressive validation

## Completed Fixes (Previous Sessions)
- Base Year Edit Logic
- Financial Year Mapping
- Report Structure Overhaul (ISO 14064-1 compliance)
- Branding updates (Logo, Favicon, Login background)
- PDF generation system package install

## Database Collections
| Collection | Purpose |
|------------|---------|
| users | User accounts with roles and auth |
| organizations | Companies with subscription details |
| facilities | Physical sites with responsible person details |
| emission_records | Individual emissions with responsible person |
| base_year_emissions | Baseline with sinks_data support |
| sinks | Carbon sinks with evidence files |
| uploaded_files | R2 file metadata |

## Pending Issues
- **P2:** GHG Inventory report may show extraneous text when no charts
- **P3:** CH₄ GWP doesn't differentiate fossil vs non-fossil
- **P3:** Frontend dropdowns hardcoded

## Upcoming Tasks
- **P1:** "Copy as test case" button in Calculation Sandbox
- **P1:** Phase 3 of Calc Engine Rollout - Wire new calculation engine into Emissions Create/Edit UI as opt-in toggle
- **P1:** Public-facing landing page
- **P1:** Scope 3 emissions module
- **P2:** Formula breakdown in emissions UI
- **P2:** CBAM module and report template

## Future/Backlog
- AWS Lambda migration for report generation
- Refactor backend/server.py into package structure
- Consolidate emission form logic
- Dynamic frontend dropdowns

## Key API Endpoints
- `POST/PUT /api/base-year-emissions` - Now supports sinks_data
- `DELETE /api/sinks/{sink_id}` - Deletes R2 files
- `POST /api/reports/ghg-inventory` - PDF via Playwright

## Credentials
- SuperAdmin: superadmin@ecotrack.com / SuperAdmin123!
- Admin: testadmin@test.com / Test123!
