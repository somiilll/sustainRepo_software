# GHG Add/Edit — Architecture & Code Audit (read-only, no code changed)

Date: June 2026
Scope: GHG Emissions Create (Add) + Edit flow, frontend + supporting backend contracts.
Status: **AUDIT ONLY — zero files modified.**

---

## A. Current GHG Add/Edit architecture

There are **two separate implementations** behind one dialog in `pages/Emissions.js`:

```
Route /ghg, /ghg/scope1..3, /ghg/biogenic, /uploads/ghg-entry
        │
        └── pages/Emissions.js                      3,688 lines   ← HOST PAGE + EDIT BRAIN
             ├── list / filters / grid / history / delete / approvals deep-link
             ├── ALL edit-mode state (~70 useState)
             ├── edit dynamicInputFields memo + decision-tree traversal (dup of create)
             ├── edit calc orchestration (useCalcEngine + effectiveCalculatedEmissions)
             ├── handleSubmit()  ← EDIT persistence (PUT /api/emissions/:id)
             ├── handleEdit()    → emissions/utils/editEmissionDispatch.js (hydration)
             │
             ├── if (!editingEmission)  →  components/EmissionEntryForm.js    3,273 lines
             │                              (CREATE: owns its own state via hooks)
             └── else                   →  components/EmissionEditForm.jsx    1,842 lines
                                            (EDIT: ~120 props, presentational only)
```

Create path is *partially* modularised already (good news):

```
EmissionEntryForm.js (orchestrator, still 3.2k lines)
 ├── modules/ghg/emissions/shared/hooks/useEmissionFormState.js      308  (≈60 useState + 4 effects)
 ├── modules/ghg/emissions/shared/hooks/useEmissionFormEffects.js    200  (5 data fetches)
 ├── modules/ghg/emissions/shared/hooks/useEmissionSubmit.js         878  (create persistence + calc)
 ├── modules/ghg/emissions/shared/components/steps/Step1..Step4      2,609
 ├── modules/ghg/emissions/shared/utils/validation.js                392
 ├── modules/ghg/emissions/shared/components/DynamicFieldRenderer    389
 └── modules/emissions (plugin registry)  → per-category create/edit payload + validation
```

Edit path:

```
Emissions.js (state + submit)
 ├── pages/emissions/utils/editEmissionDispatch.js   162  (hydration side effects)
 ├── pages/emissions/utils/hydrateEmissionForm.js    497  (pure hydration — SHARED with create edit-mode)
 ├── pages/emissions/utils/persistCalcAuditLog.js    143
 ├── pages/emissions/utils/units.js                  184  (unitsMatch / isVolumeUnit / conversion)
 ├── pages/emissions/useEvidenceManagement.js        216
 ├── components/EmissionEditForm.jsx                 1,842
 └── pages/emissions/EditFormSections.js             632  (edit-only field JSX)
```

Backend (already largely configuration-driven — this is the biggest asset):

```
GET  /api/calc-engine/form-config/{category_id}   → decision_tree + formulas + input_field_mappings
                                                    + decision_fields  (drives ALL dynamic fields)
POST /api/calc-engine/execute-by-category         → authoritative calculation + audit log
GET  /api/calc-engine/fuel-allowed-units/{fuel}   → unit whitelist
GET  /api/calc-engine/unit-conversions, /convert, /properties, /property-source-mappings
POST /api/emissions, PUT /api/emissions/{id}      → modules/emissions/router.py (1,700)
modules/emissions/categories/registry.py          → backend category descriptors + capabilities
modules/esg/service.py (esg_org_configs)          → per-org enabled_scopes / modules / frameworks
```

**Dead / abandoned parallel refactors found (safe to delete, ~2,100 lines):**
`pages/emissions/useEmissionEdit.js` (398), `pages/emissions/EmissionEditDialog.js` (361),
`pages/emissions/useEmissionsData.js` (269), `pages/emissions/EmissionTable.js` (353),
`components/EmissionEntryFormRefactored.js` (334), `components/MultiEmployeeInput.jsx.bak`.
They are only re-exported by `pages/emissions/index.js`, never imported by a live route.

---

## B. Component dependency tree

```
Emissions.js
├─ useAuth, useGHGAccess (KPI access control)
├─ useEmissionsCoreData        (facilities, fuelDatabase, units, formulas, scopes, categories, gwp)
├─ useEmissionsCalculator      (legacy FE calculator)
├─ useCalcEngine               (backend calc, backendCalcResult / useBackendCalc)
├─ useEvidenceManagement
├─ EmissionFilters / EmissionDataGrid / EmissionHistoryDialog
├─ categoryRegistry (modules/emissions)  ── C7 module, Scope3Flat*, Scope1Create/Edit, GenericScope1/2/3
├─ EmissionEntryForm  (create)
│   ├─ useEmissionFormState / useEmissionFormEffects / useEmissionSubmit
│   ├─ Step1BasicSelection (844) Step2ProcessResponsibility (379)
│   │   Step3YearMonthlyData (1,257) Step4Notes (129)
│   ├─ DynamicFieldRenderer / DynamicFieldInput / CustomFuelMonthFields
│   ├─ MultiEmployeeInput (C7), AirportSearchInput (C6)
│   └─ hydrateEmissionForm (when used in standalone edit mode)
└─ EmissionEditForm  (edit)
    ├─ EditFormSections (632)
    ├─ MultiEmployeeInput (C7)
    ├─ EmissionCalculationTrace
    └─ units.js
```

---

## C. Duplicated Add vs Edit logic (the core problem)

| Concern | Create location | Edit location | Verdict |
|---|---|---|---|
| `dynamicInputFields` derivation (formula match → mapping filter → override fields) | `EmissionEntryForm.js` L1254–1514 (260 lines) | `Emissions.js` L396–671 (275 lines) | **near-identical, drifted** |
| Decision-tree traversal | `buildDecisionInputs` L1814 | `buildEditDecisionInputs` L704 + `traverseDecisionTreeEdit` | duplicated |
| Formula matching (scope1/2 vs scope3 vs biogenic) | L1354–1470 | L428–580 | duplicated |
| Unit initialisation / unit source resolution (`fuel` / `scope3_ef` / field) | 3 effects L1589–1811 | inline in `populateDynamicFields` (`getFieldUnit`) | duplicated |
| `getMethodLabel` / `getSubcategoryLabel` | L103–120 | `Emissions.js` L267 | duplicated |
| Category capability rules (`c8,c13,c14,c15` asset name; `c4,c6,c9` locations; `c8,c10,c11,c13,c14` subcategory) | hardcoded arrays L938–1035 | recomputed in `Emissions.js` + `hydrateEmissionForm` | **triplicated** |
| Validation | `shared/utils/validation.js` (steps 1–4) | `module.validateEditSubmission` per category | two systems |
| Payload build | `useEmissionSubmit` + `module.buildCreatePayload` | `module.buildEditPayload` | two builders per category |
| Custom-fuel handling | `CustomFuelMonthFields` + `customFuelCalcAdapter` | `editUseCustomFuel` / `editCustomFuelName` + same adapter | duplicated |
| Evidence upload | `handleEvidenceUpload` inside `EmissionEntryForm` L2477 | `useEvidenceManagement` hook | duplicated |
| Calc invocation | `POST execute-by-category` x2 inside form + submit hook | `useCalcEngine` in page | duplicated |
| `isVolumeUnit` | redefined locally L37 | imported from `units.js` | duplicated |

Net: **≈1,200–1,500 lines of semantically duplicated logic** between Add and Edit.

---

## D. Mixed responsibilities

- `Emissions.js` = list page **+** edit form state container **+** edit persistence **+** calc orchestrator **+** audit-log hydration **+** approvals deep-link **+** KPI gating.
- `EmissionEntryForm.js` = wizard shell **+** formula matching **+** unit inference **+** FE formula evaluation **+** OCR prefill mapping **+** evidence upload **+** calc-engine calls **+** dirty tracking.
- `Step3YearMonthlyData.js` (1,257) = layout **+** month status derivation **+** unit dropdown logic **+** per-field conditional rules.
- `useEmissionSubmit.js` (878) = validation **+** calc **+** payload **+** HTTP **+** OCR finalize **+** supplier-portal endpoint switch.
- `EmissionEditForm.jsx` = presentational, but reads business rules via `selectedCategory.toLowerCase().includes('stationary'|'mobile'|'fugitive'|'flaring'|'process')` in JSX.

---

## E. Hardcoded business rules (must become configuration)

1. Category capability arrays (FE): `subcategoryCategories`, `assetNameCategories`, `locationCategories`, `isC7EmployeeCommuting`, C6/C7 activity-type gating.
2. String-sniffing rules: `category.toLowerCase().includes('stationary'|'mobile'|'fugitive'|'flaring'|'process'|'business travel'|'employee commuting'|'c6'|'c7')` — used for *rendering and validation* in `EmissionEntryForm`, `EmissionEditForm`, `hydrateEmissionForm`.
3. `EMISSION_FACTOR_UNITS` and `CUSTOM_FUEL_UNITS` literal lists in `EmissionEntryForm.js` L1097–1113 (custom fuel restricted to kg/g/t).
4. Default methodology `'using_heat_basis_ncv'` forced for Scope 1 / biogenic-scope1 stationary combustion (both create L1856 and edit L133).
5. `FLAT_FIELD_SCOPE3_CATEGORIES = ['c1'..'c15' minus c7]` in `modules/emissions/index.js`.
6. Backend `router_reference_data.py get_emission_categories()` returns a **hardcoded Python list** of Scope 1/2/biogenic/sinks categories (with "do NOT re-add" comments) while `emission_categories` collection is the real source elsewhere.
7. Backend `categories/registry.py` `_SEED` list — hardcoded capability seed, must stay in lock-step with FE `scope3-definitions.js` (no test enforces this).
8. `isFutureMonth` + financial-year Apr–Mar wrap logic duplicated in create form and elsewhere.
9. Override justification required only for scope1/scope2 (`Scope1Edit`/`Scope1Create` helpers).
10. `isDensityRequiredForQtyBasis` unit-type rule.

---

## F. Organization-specific conditions

**Good news: there are none in the GHG Add/Edit code.** No `org_id === '...'`, no org-name string checks, no per-org components. Existing org variability is already config-shaped:

- `esg_org_configs.enabled_scopes / enabled_modules / enabled_frameworks / approval_workflow_enabled` (`modules/esg/`).
- `organization.reporting_year_type` (calendar/financial) read in `useEmissionFormState`.
- `organization_config` (sustainability_config) per-org feature records.
- KPI access control (`useGHGAccess`) gates scopes/periods per user, not per org.

So requirement 6 (org customisation via configuration) starts from a clean slate — nothing to un-hardcode, only a resolver to add.

---

## G. Calculation logic currently inside UI components

| Location | What |
|---|---|
| `EmissionEntryForm.js` L2023–2447 | `evaluateFormula`, `getParameterValue`, `executeFormula`, `getConversionFactor`, `findFormulaForScope` — a **full frontend formula evaluator** (legacy shadow of the calc engine). Still wired (used at L2948). |
| `EmissionEntryForm.js` L1866–2021 | `executeYearlyCalcEngine` — dry-run POST + response shaping. |
| `useEmissionSubmit.js` L401/627/789 | 3 separate `execute-by-category` calls with per-branch input assembly. |
| `Emissions.js` L2265 | `effectiveCalculatedEmissions` — merges backend result vs saved record vs audit log (display + validation gate). |
| `hooks/useEmissionsCalculator.js` | legacy FE calculator. |
| `pages/emissions/utils/customFuelCalcAdapter.js` | custom-fuel input assembly. |
| `Step3YearMonthlyData.js` | compound-unit suffix + month totals derivation. |

**The authoritative numbers come from the backend calc engine.** The FE evaluator is a parallel path — that is the single highest refactor risk.

---

## H. Validation logic inside UI components

- `shared/utils/validation.js` — step gates (extracted, good).
- `canProceedToStep` consumed inside `EmissionEntryForm` with extra inline conditions (L2594: scope1/2/biogenic dynamic-field required check).
- `Emissions.js handleSubmit` — override-justification checks, process-name checks, C7 employee checks (delegated to modules, but the *choice* of branch is inline).
- `EmissionEditForm.jsx` — `required` gating expressed in JSX conditionals.
- **`Emissions.js` L2404: `document.querySelector('[data-testid="override-calorific-checkbox"]').checked`** — business validation reads the DOM. Severe coupling; must be preserved bit-for-bit or moved with a dedicated regression test.

---

## I. API/DB logic inside UI components

- `EmissionEntryForm.js`: 3 axios calls (`execute-by-category` x2, `upload/evidence`).
- `useEmissionFormEffects.js`: 5 GETs (`form-config`, `fuel-database`, `scope3-ef` x2, biogenic categories).
- `useEmissionSubmit.js`: 11 calls incl. `POST /emissions`, `POST /supplier-assessment/my-assessment/emissions`, C7 endpoints, `ocr-invoice/finalize-import`.
- `Emissions.js`: 12 calls (list, PUT update, delete, audit log, single-record fetch, history…).
- `editEmissionDispatch.js`, `persistCalcAuditLog.js`, `useEvidenceManagement.js`: direct axios.

No API client layer; `${API}` template strings are scattered across 8+ files.

---

## J. Existing GHG data models/shapes

Backend `modules/emissions/contracts.py`:
- `EmissionRecordCreate` — 45+ optional fields, most of them **category-specific columns on a shared model**: `scope3_*`, `asset_name`, `from_location`/`to_location`, `supplier_*`, `customer_*`, `nights_stayed`, `rooms_taken`, `employees`, `type_of_product`, `process_type`, `is_custom_fuel`…
- Generic containers already exist: `dynamic_field_values: {var: {value, unit, is_override, justification}}` and `outputs: {var: {...}}`.
- `EmissionRecordResponse` adds computed `co2/ch4/n2o/co2e`, `emission_factor_used`, approval/version fields.
- `EmissionHistoryResponse` — versioned field changes.

Frontend shapes: `models/emissions/emission-record.js` (167), `models/emissions/form-state.js`, plus an untyped `formData` object literal in `Emissions.js` L191 and a second one in `useEmissionFormState`.

**Key insight:** the persistence model is already half-generic (`dynamic_field_values`). The category-specific top-level columns are the legacy half.

---

## K. Field dependencies & conditional rendering

```
facility → scope → (biogenicScopeSelection) → category
   → [scope1/2] fuel  |  customFuel
   → [scope3]   method (activity/spend/supplier) → activityType → subcategory → activity | customActivity
   → category_id ⇒ GET form-config ⇒ decision_tree + formulas + input_field_mappings
   → decision_fields values (calculation_methodology, process_type, type_of_product)
        ⇒ traverse decision tree ⇒ formula_id
        ⇒ filter input_field_mappings by formula inputs/properties
        ⇒ dynamicInputFields (label, variable, required, isOverride, allowedUnits, unitSource)
   → per-month (or yearly) values + units + evidence
   → execute-by-category ⇒ outputs + audit log
```
Conditional extras: asset_name (c8/c13/c14/c15), from/to location (c4/c6/c9 — c6 uses airport lookup), subcategory (c8/c10/c11/c13/c14), multi-employee grid (c7), supplier/customer fields, process names/descriptions (scope1 process + stationary/mobile/flaring), override checkboxes (CV / density / EF-heat + justification), custom-fuel month fields.

---

## L. Scope 1 / 2 / 3 differences

| | Scope 1 | Scope 2 | Scope 3 | Biogenic |
|---|---|---|---|---|
| Source of EF | `fuel_database` | `fuel_database` | `scope3_ef` collection | `scope3_ef?sub_scope=biogenic` (S3) / fuel DB (S1) |
| Method selector | `calculation_methodology` decision field | same | `calculation_method_scope3` (activity/spend/supplier) | inherits by `biogenic_scope_selection` |
| Override + justification | yes | yes | no | S1: yes |
| Custom fuel | yes (mass units only) | yes | custom *activity* instead | yes |
| Categories | stationary / mobile / fugitive (+process) | purchased electricity / steam-heat | C1–C15 | biogenic_scope1 / biogenic_scope3 |
| Payload branch | `Scope1Create/Edit` | reuses `Scope1Create/Edit` | `Scope3FlatCreate/Edit` (+ C7 special) | routed to S1 or S3 generic |
| Special UI | process names, fugitive gas list | – | asset/location/subcategory/multi-employee/airport | scope selector first |

Biogenic is *not a third scope* — it is a scope-1-or-3 alias, and that aliasing is re-derived in ~8 places.

---

## M. Emission-factor & unit-conversion dependencies

- EF: `fuel_database` (scope 1/2, region+year priority in `fuelsForCategory` memo), `scope3_ef` (scope 3, filtered by category/method/sector/year), custom fuel manual EF, fugitive gas list.
- Units: `centralizedUnits` (`ce_units`), `fuel.allowed_units`, `activity.allowed_units`, `field.allowedUnits`/`expectedUnit`, `GET /calc-engine/fuel-allowed-units/{fuel}`, `GET /calc-engine/unit-conversions`, `/convert`.
- Unit *source* precedence, currently implicit in 3 effects: `unitSource==='fuel'` → fuel.allowed_units; `'scope3_ef'` → activity.allowed_units; else field allowed/expected; `supplier_basis` → intentionally blank.
- Properties (calorific value, density, EF-heat) resolved server-side via `ce_property_source_mappings`, overridable from the form with justification.
- Conversion factors also read from formula parameters in the FE evaluator (`getConversionFactor`) — a second conversion source.

---

## N. Risk areas where refactoring could change results

**P0 — do not touch in the first passes**
1. FE formula evaluator (`evaluateFormula` / `executeFormula` / `getParameterValue`).
2. `dynamicInputFields` memos (both copies) — field order and the "first formula" fallbacks silently determine which formula runs.
3. Unit-initialisation effects — changing the order changes the saved unit, hence the conversion factor, hence the number.
4. Decision-tree traversal + `matchedFormula` fallback chains (`editingEmission.formula_id` → name match → `formulas[0]`).
5. Override flags: DOM `querySelector` read in `handleSubmit`, plus the 3 `useRef` mirrors in `Emissions.js`.
6. Custom-fuel adapter + per-month custom fields (unit forced to mass).
7. C7 multi-employee aggregation (`monthly_totals`, `yearly_total`) and its deliberate audit-log skip.
8. `persistCalcAuditLog` — if it stops firing, re-edit shows wrong override sources.
9. Financial-year month mapping (`getActualYearForMonth`, `isFutureMonth`).
10. Biogenic → scope1/scope3 aliasing.

---

## O. Recommended target architecture

```
                     ┌─────────────────────────────────────────┐
                     │  STANDARD GHG CONFIG  (server, static)  │
                     │  scopes / categories / capabilities /    │
                     │  field schema / validation / methods     │
                     └────────────────┬────────────────────────┘
                                      │ merge (deep, ordered)
                     ┌────────────────▼────────────────────────┐
                     │  ORG GHG OVERRIDES  (server, per org)   │
                     │  enable/disable, labels, required,      │
                     │  hidden, options, extra fields, rules   │
                     └────────────────┬────────────────────────┘
                                      ▼
        GET /api/ghg/config/resolved?scope&category  →  RESOLVED GHG CONFIG
                                      │
                     ┌────────────────▼────────────────────────┐
                     │        <GhgForm mode="create|edit">     │  ONE component
                     │  reads config, renders from schema      │
                     └──┬────────┬────────┬────────┬───────────┘
                        │        │         │        │
                 formState  fieldRegistry  services  adapters
                 (reducer)  (Field comps)  ├ calculation.service
                                           ├ emissionFactor.service
                                           ├ unitConversion.service
                                           ├ validation.engine (rules from config)
                                           ├ evidence.service
                                           ├ approval.service
                                           └ emissions.api  (only place with axios)
                        │
                 recordAdapter: record ⇄ formState (single hydrate/dehydrate pair)
```

Principles:
- `mode` is a prop, never a separate component tree. Edit = create + hydrate + PUT.
- Nothing in a React component knows a category code. Components ask the resolved config.
- Numbers only ever come from the backend calc engine; the FE evaluator becomes a preview-only service behind a flag, then is deleted.
- Overrides are *declarative data*, validated against a JSON Schema, so a bad override cannot break the standard form.

### Generic vs configuration-driven — the dividing line

| Make GENERIC (code, one implementation) | Keep CONFIGURATION-DRIVEN (data) |
|---|---|
| Wizard shell, step navigation, dirty/unsaved guard | which steps exist, step labels |
| Field renderer + field registry (number+unit, select, search-select, text, checkbox-with-override, month grid, employee grid, airport picker) | which fields, order, labels, required, hidden, options, allowed units, help text |
| Validation *engine* (required / range / regex / cross-field / conditional) | the rule set per scope/category/field |
| Unit conversion service, EF lookup service, calc service, evidence service, approval service | unit sources & precedence, EF source per scope, formula/decision-tree binding |
| Hydrate/dehydrate adapter driven by field schema | field ⇄ record mapping (`maps_to_variable`, top-level column mapping) |
| API client, error/toast handling, optimistic refresh | endpoint per record type (main vs supplier portal) |
| Capability mechanism (`config.capabilities.includes(x)`) | which categories have which capabilities |
| Org override *resolver* + schema validation | the org override documents themselves |

Explicitly **not** generic: organisation-specific *formulas*. Those stay in the calc engine as formula documents with an optional `organization_id` selector — never as JS.

---

## P. Recommended folder/module structure

```
frontend/src/modules/ghg/
  config/
    resolveGhgConfig.js          # standard + org overrides → resolved (pure)
    useGhgConfig.js              # fetch + cache + memo
    overrideSchema.js            # allowed override keys (guard rail)
    capabilities.js              # capability constants
  form/
    GhgForm.jsx                  # single Create+Edit shell (mode prop)
    steps/                       # Step1..Step4 (thin, config-driven)
    fields/
      registry.js                # type → component
      QuantityUnitField.jsx  SelectField.jsx  SearchSelectField.jsx
      OverridableField.jsx   MonthGridField.jsx  EmployeeGridField.jsx
      AirportField.jsx       EvidenceField.jsx
    state/
      formReducer.js  useGhgFormState.js  selectors.js
    adapters/
      recordToFormState.js  formStateToPayload.js
  services/
    calculation.service.js  emissionFactor.service.js  unitConversion.service.js
    validation.engine.js    evidence.service.js        approval.service.js
    emissions.api.js        # ONLY file allowed to import axios for GHG
  legacy/                        # current files, deleted phase by phase

backend/modules/ghg_config/
  contracts.py     # StandardGhgConfig, OrgGhgOverride (whitelisted keys)
  resolver.py      # deep-merge + validation, cached per (org, scope, category)
  router.py        # GET /api/ghg/config/resolved, GET/PUT /api/ghg/config/overrides
  seed_standard.py # standard config derived from existing registry + form-config
```

---

## Q. Migration plan — small, safe steps

Every phase: behaviour-frozen, guarded by golden tests, independently shippable and revertible.

**Phase 0 — Safety net (no product change)** ⚠️ prerequisite, do not skip
- Golden-record fixtures: for ~25 representative records (S1 stationary heat-basis + qty-basis, S1 mobile, S1 fugitive, S1 process venting, S2 electricity, custom fuel, biogenic S1, biogenic S3, C1, C2, C4, C6 (airport), C7 multi-employee, C8, C11 both branches, C15, monthly + yearly, override CV/density/EF, supplier_basis blank units) capture: resolved `dynamicInputFields` (order + units), calc-engine request body, response outputs, final POST/PUT payload.
- Backend pytest suite asserting `POST /emissions` + `PUT /emissions/{id}` + `execute-by-category` byte-stable for those fixtures.
- FE unit tests (Jest) for the 4 pure modules that already exist (`units.js`, `hydrateEmissionForm`, `validation.js`, `payload-builders.js`).
- Delete the ~2,100 lines of confirmed dead code (§A) — zero runtime impact.

**Phase 1 — Single source for field derivation** (highest value / highest risk, so first, alone)
- Extract create's `dynamicInputFields` memo into `services/fieldSchema.service.js` (pure: `formConfig + selection → fields[]`).
- Point CREATE at it, assert golden fixtures unchanged. Ship.
- Point EDIT at it (replacing `Emissions.js` L396–671), assert fixtures unchanged. Ship.
- Outcome: 535 duplicated lines → ~280 shared lines; drift eliminated.

**Phase 2 — Capability config instead of string sniffing**
- Move capability arrays + `includes('stationary')` sniffing into `config/capabilities.js` fed by the existing registry; expose `config.has('asset-name')`.
- Replace call sites in create form, edit form, `EditFormSections`, `hydrateEmissionForm`. Pure lookup swap.

**Phase 3 — Service extraction (no UI change)**
- `unitConversion.service` (absorb `units.js` + the 3 unit-init effects, keeping precedence identical).
- `emissionFactor.service` (fuelsForCategory + filteredScope3Activities + allowedUnits).
- `calculation.service` (all `execute-by-category` calls behind one function + one response shape).
- `emissions.api` (all axios).
- `evidence.service` (merge create's inline upload with `useEvidenceManagement`).

**Phase 4 — Unified form state + adapters**
- One `formReducer` + `useGhgFormState({ mode, record })`; edit hydration becomes `recordToFormState` (extend existing `hydrateEmissionForm`).
- Move all edit state out of `Emissions.js` into the hook. `Emissions.js` drops to ~1,200 lines (list page only).

**Phase 5 — Field registry + one shared form**
- Convert Step1–Step4 to render from `fields[]` via the registry.
- `GhgForm mode="edit"` first behind a feature flag with side-by-side payload diffing against the legacy edit form; flip when 25/25 fixtures match. Then create. Then delete `EmissionEditForm.jsx` + `EditFormSections.js`.

**Phase 6 — Declarative validation**
- `validation.engine` executes rules from config; seed rules to reproduce today's messages exactly (snapshot the toast strings first).
- Remove the DOM `querySelector` override read (§H) — replaced by state, covered by a dedicated fixture.

**Phase 7 — Retire the FE formula evaluator**
- Prove `execute-by-category` covers every branch the FE evaluator served (fixtures), then delete `evaluateFormula`/`executeFormula`/`getParameterValue` and `useEmissionsCalculator`.

**Phase 8 — Org override layer (only after 1–7)**
- `backend/modules/ghg_config`: standard config seeded from the current registry + `form-config`; `OrgGhgOverride` with a **whitelist** of override keys; deep-merge resolver; `GET /api/ghg/config/resolved`.
- FE `resolveGhgConfig` + `useGhgConfig`. With **no** override document, the resolved config must be byte-identical to the standard config → all Phase-0 fixtures still pass. That is the guarantee that existing orgs are untouched.
- Super-admin UI to edit overrides + a "diff vs standard" preview.

Sequencing rule: Phase 8 must be *possible* from Phase 1 onward but *implemented* last; every phase before it only has to make the config the **single input** to the form.

---

## R. Extract first (in this order)

1. Dead-code deletion + golden fixtures (Phase 0).
2. `fieldSchema.service` — the duplicated `dynamicInputFields` derivation (Phase 1). Biggest duplication, biggest drift risk, unlocks everything.
3. `capabilities` config (Phase 2). Cheap, removes ~40 hardcoded conditionals.
4. `unitConversion.service` + `emissionFactor.service` (Phase 3).
5. `calculation.service` + `emissions.api` (Phase 3).
6. `recordToFormState` / `formStateToPayload` adapters (Phase 4).

---

## S. Do NOT change during the first refactor

- Backend: `modules/emissions/router.py`, `calc_engine/*`, `contracts.py`, `emissions` collection shape, `dynamic_field_values` contract, approval workflow, audit-log persistence.
- Formula documents, decision trees, `ce_input_field_mappings`, `ce_property_source_mappings`, unit conversion data.
- FE formula evaluator (until Phase 7), `customFuelCalcAdapter`, C7 aggregation, `persistCalcAuditLog` timing.
- Every existing toast/error string and every `data-testid` (E2E + the DOM-read override).
- `useEmissionSubmit` branch ordering (create dispatch) until Phase 5 flag flip.
- Financial-year month mapping, `isFutureMonth`.
- Bulk upload (`bulk_upload_scope3`), base-year, OCR invoice, supplier-portal endpoints — they share these payload shapes.

---

## Effort estimate

| Phase | Size | Risk |
|---|---|---|
| 0 Safety net + dead code | M | none |
| 1 Field schema unification | M | **high** (mitigated by fixtures) |
| 2 Capability config | S | low |
| 3 Services | L | medium |
| 4 Unified state + adapters | L | medium |
| 5 One shared form + field registry | XL | medium (flagged rollout) |
| 6 Declarative validation | M | medium |
| 7 Retire FE evaluator | M | medium |
| 8 Org override layer | L | low (additive, no-override = identity) |

Total ~9 shippable increments. Net code movement: ~9,000 lines reorganised, ~3,500 net removed (duplication + dead code). Zero intended behaviour change through Phase 7.
