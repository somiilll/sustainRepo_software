# GHG Post-Phase-4 Architecture Audit

**Audit type:** Read-only architecture audit  
**Scope:** Frontend GHG Create/Edit form, shared form components, configuration, capability, registry, hydration, compatibility, custom-fuel, Biogenic, Scope 1/2/3, C6/C7/C9/C11 paths  
**Production code changed:** 0  
**Database writes:** 0  
**API writes:** 0

## 1. Executive Summary

## PARTIAL — remaining active capability logic exists

Phase 4 successfully centralized the named Scope 3 capabilities that it explicitly converted: C11 product type, C9 customer labels, asset name, journey locations, activity type, multi-employee detection, flight details, subcategory detection, and compatibility exports.

The capability architecture is **not yet complete**, however. Active Create/Edit code still makes category-specific rendering and validation decisions from display-name strings, particularly for Process Emissions, Stationary/Mobile/Flaring, Fugitive Emissions, C7 loading/employee fields, custom-fuel visibility, and legacy override visibility. There is also an active Edit capability-wiring defect: `resolveGhgFormContext` exposes `effectiveScope`, but `Emissions.js` passes `editGhgFormContext.effectiveScopeCode` to `resolveGhgCapabilities`. That value is undefined, so Edit capability resolution falls back to `NONE` for every category.

The current architecture also has two active capability authorities:

1. `frontend/src/modules/ghg/config/resolveGhgCapabilities.js` for form UI decisions.
2. `frontend/src/modules/emissions/categories/scope3-definitions.js` plus `frontend/src/modules/emissions/index.js` for registry/payload capabilities.

This dual authority can drift and prevents a clean future organization-override pipeline. Existing regression suites remain fully green because they verify resolver parity, field derivation, hydration, and calculation outputs; they do not exercise the active Edit resolver call site or all static JSX branches.

**Overall risk rating: HIGH.** Calculation parity is protected, but the stated capability-completeness and organization-customization goals are not yet met.

## 2. Search Coverage

### Directories searched

- `frontend/src/components/`
- `frontend/src/pages/`
- `frontend/src/pages/emissions/`
- `frontend/src/modules/ghg/`
- `frontend/src/modules/emissions/`
- `frontend/src/hooks/`
- `frontend/src/constants/`
- `frontend/src/utils/`

The broad production-source inventory covered 304 JavaScript/TypeScript files across the relevant component, page, module, hook, utility, and constant trees. Tests, snapshots, comments-only matches, and `.bak` files were excluded from production findings. Adjacent GHG pages such as Base Year, Scope 3 EF administration, Emission Configuration, dashboards, approvals, and the reachable `/emissions/dynamic` test route were triaged separately from the primary Add/Edit flow.

### Primary active components examined

- `frontend/src/components/EmissionEntryForm.js`
- `frontend/src/components/EmissionEditForm.jsx`
- `frontend/src/pages/Emissions.js`
- `frontend/src/modules/ghg/config/*`
- `frontend/src/modules/ghg/emissions/shared/components/steps/*`
- `frontend/src/modules/ghg/emissions/shared/hooks/*`
- `frontend/src/modules/ghg/emissions/shared/utils/*`
- `frontend/src/modules/emissions/categories/*`
- `frontend/src/modules/emissions/core/*`
- `frontend/src/pages/emissions/utils/*`
- `frontend/src/hooks/useEmissionsCoreData.js`
- `frontend/src/components/EmissionApprovalWrapper.jsx`

### Search patterns used

- Direct comparisons: `category ===`, `category.name ===`, `category.code ===`, `category_id ===`, `categoryId ===`, `scope ===`, `scope_code ===`, `scopeCode ===`, `subcategory ===`
- String matching: `.includes()`, `.startsWith()`, `.endsWith()`, `.indexOf()`, `.toLowerCase()`, regular-expression C-code extraction
- Control flow: `switch(category)`, `switch(categoryCode)`, `switch(scope)`
- Indirect forms: category-keyed objects, scope/category arrays, `Set` construction, registry IDs, helper functions dedicated to one category
- Named categories/codes: C1–C15, C6, C7, C9, C11, Stationary Combustion, Mobile Combustion, Fugitive Emissions, Process Emissions, Employee Commuting, Business Travel
- Capability terms: asset, location, customer/supplier, product, flight, custom fuel, activity type, multi-employee, subcategory
- Organization terms: organization ID/config/override checks

No direct `if (organizationId === ...)` or equivalent organization-specific branch exists in the active forms today.

## 3. Remaining Category-Specific Logic

| File | Line | Logic | Category | Classification | Centralized? | Recommendation |
|------|------|-------|----------|----------------|--------------|----------------|
| `pages/Emissions.js` | 447–454 | Edit calls `resolveGhgCapabilities` with nonexistent `editGhgFormContext.effectiveScopeCode`; context exposes `effectiveScope`. | All | A. CAPABILITY LOGIC | Intended, but ineffective | Correct the wiring in a separately approved capability phase and add an active-call-site test. |
| `components/EmissionEntryForm.js` | 915–930 | Create resolves the selected category definition by display name + effective scope before passing code + scope to the capability resolver; subcategory is resolved a second time. | All | F. LEGITIMATE CATEGORY IDENTITY RESOLUTION | Partially | Preserve name fallback for legacy records, but carry canonical code in active state and reuse one resolved capability object. |
| `modules/ghg/emissions/shared/hooks/useEmissionFormEffects.js` | 41–51 | Form-config category ID lookup uses display name + effective scope. | All | F. LEGITIMATE CATEGORY IDENTITY RESOLUTION | No | Prefer code + scope; retain name fallback only for legacy hydration. |
| `pages/Emissions.js` | 362–378 | Edit form-config lookup is based on `resolveGhgFormContext`; the context itself may fall back to display name. | All | F. LEGITIMATE CATEGORY IDENTITY RESOLUTION | Partially | Keep the fallback, but ensure normal Edit always supplies category code. |
| `components/EmissionEntryForm.js` | 1681–1682, 2586–2589 | Yearly and C7 calculator category-ID lookups use display name + scope. | All / C7 | F. LEGITIMATE CATEGORY IDENTITY RESOLUTION | No | Resolve category ID once from canonical context; keep display-name fallback only for historical records. |
| `pages/Emissions.js` | 1933–1941, 2676–2679 | Edit preview and C7 calculator category-ID lookups use display name + scope. | All / C7 | F. LEGITIMATE CATEGORY IDENTITY RESOLUTION | No | Use the already resolved category definition/ID. |
| `pages/emissions/utils/persistCalcAuditLog.js` | 47–56 | Audit replay category lookup uses display name + effective scope. | All | F. LEGITIMATE CATEGORY IDENTITY RESOLUTION | No | Pass the canonical category ID from Edit context. |
| `components/EmissionApprovalWrapper.jsx` | 65–72 | Approval snapshot fallback resolves category ID by display name + scope. | All | E. DATA HYDRATION / LEGACY COMPATIBILITY | No | Legitimate fallback for historical snapshots; use snapshot category ID when present, as already preferred. |
| `modules/ghg/emissions/shared/components/steps/Step1BasicSelection.js` | 630–705 | Process type, calculation methodology, fuel visibility, and custom-fuel affordance are selected by `process/stationary/mobile/fugitive/flaring` display-name fragments. | Scope 1 / Biogenic direct | A. CAPABILITY LOGIC | No | Add explicit capabilities/config flags for process type, fuel requirement, methodology selection, and custom fuel. |
| `components/EmissionEditForm.jsx` | 462–588 | Edit repeats the same Process/Stationary/Mobile/Fugitive/Flaring rendering decisions by display-name fragments. | Scope 1 / Biogenic direct | A. CAPABILITY LOGIC | No | Drive both Create and Edit from the same capability/config fields. |
| `modules/ghg/emissions/shared/utils/validation.js` | 59–67 | Fuel validation is bypassed when category name contains `process`. | Process Emissions | A. CAPABILITY LOGIC | No | Consume a resolved `requiresFuel`/`processType` capability instead of category text. |
| `modules/emissions/categories/shared/Scope1Create.js` | 216–227 | Create module validation detects Process Emissions from the display name. | Process Emissions | A. CAPABILITY LOGIC | No | Bind validation to canonical module/config identity. |
| `modules/emissions/categories/shared/Scope1Edit.js` | 198–210, 294–321 | Edit module validation and payload process-type inclusion detect Process Emissions from the display name. | Process Emissions | A. CAPABILITY LOGIC | No | Bind to canonical module/config identity. |
| `pages/Emissions.js` | 1800–1806 | Edit calculation readiness bypasses fuel when display name contains `process`. | Process Emissions | A. CAPABILITY LOGIC | No | Consume the same resolved capability used by rendering and validation. |
| `modules/ghg/config/categoryRules.js` | 45–53 | Process detection uses `code.includes('process')` or display-name fallback. | Process Emissions | B. FIELD-DERIVATION LOGIC | Inside config layer, but heuristic | Prefer exact `(code, scope_code)` identity; retain name fallback only for legacy input. |
| `modules/ghg/config/categoryRules.js` | 55–63 | Stationary/Mobile/Flaring detection selects field/formula behavior using code/name terms. | Stationary/Mobile/Flaring | C. CALCULATION LOGIC | Inside config layer | Leave untouched in this workstream; protect with golden tests. |
| `pages/Emissions.js` | 468–496 | Missing historical `process_type` is inferred from category text and saved formula name. | Process Emissions | E. DATA HYDRATION / LEGACY COMPATIBILITY | No | Keep as legacy hydration until historical records are normalized. |
| `components/EmissionEditForm.jsx` | 173–186 | Edit loading readiness independently detects C7 from `c7`/`employee commuting` text. | C7 | A. CAPABILITY LOGIC | No | Use the parent’s centralized `isEditC7EmployeeCommuting` value. |
| `pages/emissions/utils/hydrateEmissionForm.js` | 94–121, 247–329 | C7 detection and activity normalization recover legacy employee data. | C7 | E. DATA HYDRATION / LEGACY COMPATIBILITY | No | Keep; this is historical-record hydration, not a UI capability decision. |
| `modules/ghg/emissions/shared/components/steps/Step1BasicSelection.js` | 810–837 | Optional employee name/ID fields render only for exact display name `Employee Commuting`. | C7 | A. CAPABILITY LOGIC | No | Drive from `multiEmployee` or a dedicated employee-context capability. |
| `components/EmissionEditForm.jsx` | 843–872 | Edit repeats the exact display-name employee-field check. | C7 | A. CAPABILITY LOGIC | No | Use the same centralized capability as Create. |
| `modules/ghg/emissions/shared/components/steps/Step3YearMonthlyData.js` | 605–693 | Legacy no-form-config override UI is suppressed by a `fugitive` display-name check. | Fugitive Emissions | A. CAPABILITY LOGIC | No; fallback only | Model override support explicitly; retain a temporary fallback only if required for legacy config absence. |
| `components/EmissionEditForm.jsx` | 1544–1547 | Edit legacy override UI is suppressed by a `fugitive` display-name check. | Fugitive Emissions | A. CAPABILITY LOGIC | No; fallback only | Use the same override-support capability as Create. |
| `components/EmissionEntryForm.js` | 1042–1058 | Active subcategory option list is hardcoded locally. | C8/C10/C11/C13/C14 | B. FIELD-DERIVATION LOGIC | No | Source options from resolved config; organization overrides cannot currently replace this list. |
| `pages/Emissions.js` | 1372–1387 | Edit duplicates the active hardcoded subcategory option list. | C8/C10/C11/C13/C14 | B. FIELD-DERIVATION LOGIC | No | Use the same resolved options as Create. |
| `components/EmissionEntryForm.js` | 783–864 | Scope 3 EF options use hardcoded subcategory branches (`fugitive`, `stationary`, `mobile`, `energy`, legacy `electricity`). | Subcategory categories | B. FIELD-DERIVATION LOGIC | Partially | Keep data-source compatibility, but move selectable option/branch metadata into shared config. |
| `pages/Emissions.js` | 1389–1497 | Edit duplicates the same Scope 3 EF option branches. | Subcategory categories | B. FIELD-DERIVATION LOGIC | Partially | Share the same derivation/filter helper with Create. |
| `modules/ghg/emissions/shared/components/steps/Step4Notes.js` | 96–111 | Review labels and “Fuel Used” row depend on hardcoded subcategory values. | Subcategory categories | B. FIELD-DERIVATION LOGIC | No | Resolve labels/presentation metadata from the same config used by the field. |
| `components/EmissionEntryForm.js` | 1102–1135 | Custom-fuel emission-factor options are hardcoded by scope. | Scope 1/2/Biogenic | B. FIELD-DERIVATION LOGIC | No | Move static field options into resolved standard config so organization `fieldOptions` can affect them. |
| `modules/ghg/emissions/shared/components/steps/Step3YearMonthlyData.js` | 751–771, 812–820 | `YearlyDataEntry` checks `capabilities.flightDetails`, but the parent does not pass `capabilities`; yearly C6 flight UI therefore receives `{}`. | C6 | A. CAPABILITY LOGIC | Resolver exists; propagation missing | Pass the resolved capability object in a separately approved fix and cover monthly/yearly parity. |
| `modules/emissions/categories/scope3-definitions.js` | 70–217 | Active registry config duplicates `requiresSubcategory`, `requiresAssetName`, `requiresLocation`, activity types, and multi-employee flags. | C1–C15 | A. CAPABILITY LOGIC | Separate authority | Derive registry capabilities from the canonical resolver/config or make one layer the sole authority. |
| `modules/emissions/index.js` | 112–149 | Registry/payload capabilities are built from `CATEGORY_CONFIGS`, not `resolveGhgCapabilities`. | C1–C15 | A. CAPABILITY LOGIC | Separate authority | Eliminate dual ownership before organization-specific capability overrides. |
| `components/EmissionEntryForm.js` | 2921–2941 | Create Step 3 module dispatch extracts C-codes from display text and sniffs Scope 1 names. | Scope 1/2/3/Biogenic | F. LEGITIMATE CATEGORY IDENTITY RESOLUTION | No | Dispatch by resolved `(code, scope_code)`; keep generic fallback. |
| `pages/Emissions.js` | 1053–1101 | Edit module dispatch repeats C-code extraction and Scope 1 display-name sniffing. | Scope 1/2/3/Biogenic | F. LEGITIMATE CATEGORY IDENTITY RESOLUTION | No | Share canonical module resolution with Create. |
| `modules/ghg/emissions/shared/hooks/useEmissionSubmit.js` | 95–123 | Create save dispatch repeats C-code extraction and Scope 1 display-name sniffing. | Scope 1/2/3/Biogenic | F. LEGITIMATE CATEGORY IDENTITY RESOLUTION | No | Pass the resolved module/category identity into submit orchestration. |
| `modules/emissions/core/CategoryRegistry.js` | 25–46, 94–118 | Registry supports display-name aliases and extracts C-codes from historical category strings. | All | E. DATA HYDRATION / LEGACY COMPATIBILITY | No | Keep compatibility lookup, but do not use it as the normal active identity path. |
| `modules/emissions/categories/shared/Scope3FlatCreate.js` | 376–380 | Defensive employee fields use exact `category === 'Employee Commuting'`; normal C7 returns earlier and the persisted name is usually prefixed. | C7 | G. DEAD / UNREACHABLE CODE | No | Report only; validate reachability before any future removal. |
| `hooks/useEmissionsCoreData.js` | 66–80 | Fugitive source records are extracted from fuel data by exact category name. | Fugitive Emissions | E. DATA HYDRATION / LEGACY COMPATIBILITY | No | Keep until source data has a stable canonical type/code. |
| `modules/ghg/emissions/shared/hooks/useEmissionFormEffects.js` | 91–110 | A second fugitive source extraction uses the same exact data label. | Fugitive Emissions | E. DATA HYDRATION / LEGACY COMPATIBILITY | No | Keep for data compatibility; consolidate only in a separately approved cleanup. |
| `components/EmissionEntryForm.js` | 1818–1837 | Browser formula evaluator remains in the Create form and is passed to submit orchestration. | Formula-dependent | C. CALCULATION LOGIC | No | Explicitly do not touch in this phase. |
| `modules/ghg/config/deriveGhgFields.js` | 31–142 | Formula/method/activity/subcategory lookup maps choose formulas and field mappings. | Multiple | C. CALCULATION LOGIC | Yes, in derivation layer | Leave untouched; golden tests cover this behavior. |
| `modules/emissions/categories/C7EmployeeCommuting/*` and `modules/ghg/emissions/shared/hooks/useEmissionSubmit.js` | Multiple | Dedicated C7 validation, employee calculations, endpoints, and payload workflow. | C7 | D. DOMAIN/WORKFLOW LOGIC | Module-owned | Leave untouched. |

## 4. Remaining Hardcoded Arrays and Keyed Lookups

| Location | Array / lookup | Purpose | Active? | Capability-related? | Should move? |
|----------|----------------|---------|---------|---------------------|--------------|
| `modules/ghg/config/resolveGhgCapabilities.js:11–27` | `STANDARD_GHG_CAPABILITIES` keyed by `code|scope` | Canonical UI capability table | Yes | Yes | No; this is the intended home. |
| `modules/ghg/config/resolveGhgCapabilities.js:34–40` | `MODULE_CODE_ALIASES` | Converts C1–C15 aliases to canonical category codes | Yes | Identity compatibility | Keep, but apply scope consistently. |
| `components/EmissionEntryForm.js:1047–1052` | Local subcategory options | Create subcategory field options | Yes | Yes, field derivation | Yes, into resolved configuration. |
| `pages/Emissions.js:1379–1384` | Local subcategory options | Edit subcategory field options | Yes | Yes, field derivation | Yes, into the same resolved configuration. |
| `modules/emissions/categories/scope3-definitions.js:13–23` | `TRAVEL_ACTIVITY_TYPES` | Registry activity options | Yes | Yes | Derive/share with canonical form config. |
| `modules/emissions/categories/scope3-definitions.js:28–64` | `SUBCATEGORY_OPTIONS` keyed by C-code | Registry subcategory options | Yes | Yes | Merge with canonical resolved options. |
| `modules/emissions/categories/scope3-definitions.js:70–217` | `CATEGORY_CONFIGS` keyed by C-code | Module generation and duplicated capability flags | Yes | Yes | Must no longer be a second capability authority. |
| `modules/emissions/index.js:92–95` | `FLAT_FIELD_SCOPE3_CATEGORIES` | Attaches shared render/create/edit APIs to all non-C7 Scope 3 modules | Yes | No; registry workflow | May be derived from registry metadata later; not a capability blocker by itself. |
| `modules/emissions/index.js:177–181` | `SCOPE1_MODULE_IDS` | Attaches shared APIs/renderers to Scope 1 modules | Yes | No; registry workflow | Keep until registry metadata can enumerate these modules. |
| `constants/categories.js:7–42` | `SCOPE3_CATEGORIES`, `CATEGORY_CODES` | Legacy constants and aliases | Compatibility-only in the active form graph | Identity | Keep until consumers are retired; do not use for new decisions. |
| `constants/categories.js:46–56` | Derived capability arrays | Compatibility exports derived from resolver | Compatibility-only | Yes, but derived | No urgent move; safe while strictly derived. |
| `constants/categories.js:59–95` | `SUBCATEGORY_OPTIONS` keyed by C-code | Legacy option source | Inactive in primary Create/Edit; referenced by inactive hook/form | Yes | Dead-code candidate only; do not delete without approval. |
| `modules/ghg/emissions/shared/constants/emission-form-constants.js:50–56` and `EmissionEntryForm.js:1102–1111` | Scope-keyed emission-factor unit options | Custom-fuel field options | Local Create copy active; shared export not active in primary graph | Field derivation | Move active options to resolved config in a future approved phase. |
| `modules/ghg/emissions/shared/constants/emission-form-constants.js:67–79` plus local Step1/Edit maps | Activity display labels | Activity option labels | Yes, duplicated | Field presentation | Centralize as field-option metadata. |
| `modules/ghg/config/deriveGhgFields.js:31–73` | Formula/method/subcategory/activity lookup maps | Formula and input-field resolution | Yes | No; calculation/derivation | Do not move as capability cleanup. |
| `pages/emissions/utils/hydrateEmissionForm.js:110–120` | C7 display-to-internal map | Legacy C7 activity normalization | Yes | No; hydration | Keep. |
| `modules/ghg/emissions/categories/scope3/*/config.js` | Category-keyed module configuration and subcategory arrays | Parallel GHG category architecture | No active primary consumer | Yes | Dead/inactive candidate only; do not delete. |
| `pages/EmissionConfiguration.js:19–35` | Admin scope/category lists | Separate calculation-configuration administration UI | Yes, adjacent route | No Add/Edit capability decision | Keep separate from this audit; its data-source design is a different workstream. |
| `pages/BaseYearEmissions.js:116, 592–710, 1015–1018` | Base-year Biogenic/scope lists | Base-year setup workflow | Yes, adjacent route | No Add/Edit capability decision | Keep separate; do not conflate with Add/Edit category capabilities. |

## 5. Category String Checks

### Active capability or field-decision checks that remain

- `process` display-name checks: Step 1 Create, Edit form, shared validation, Scope1 Create/Edit module validation/payload, Edit calculation gate.
- `stationary`, `mobile`, `flaring`, `fugitive` display-name checks: Create/Edit rendering and module dispatch.
- `c7` / `employee commuting` checks: Edit loading readiness and legacy hydration.
- Exact `Employee Commuting` checks: optional employee fields in Create/Edit and a defensive payload block.
- `fugitive` check: legacy override visibility in Create/Edit.
- Hardcoded subcategory values: `stationary_combustion`, `mobile_combustion`, `fugitive_emissions`, `energy`, legacy `electricity` in Create/Edit option filtering and review summary.
- C-code extraction (`/^(c\d+)/`): Create Step 3 dispatch, Edit module dispatch, Create submit dispatch, registry compatibility.

### Active data/compatibility checks that are not capability defects

- Scope 3 EF records are matched by their stored category display label because the EF dataset is name-keyed.
- Fuel records are matched by stored category display label/category arrays.
- Fugitive source rows are identified by the historical fuel category label `Fugitive Emissions`.
- Approval snapshots and historical records fall back from missing category IDs to display name + scope.
- C7 historical employee/activity data is normalized from legacy strings.

### Confirmed removals

- No active C9 display-name check remains for customer labels in primary Create/Edit.
- No active C11 display-name check remains for product-type rendering in primary Create/Edit.
- No active hardcoded Scope 3 asset-name or journey-location arrays remain in primary Create/Edit/shared step JSX.
- C6 monthly flight rendering uses `capabilities.flightDetails`; yearly propagation is incomplete as noted above.

## 6. Create vs Edit

| Concern | Create | Edit | Aligned? |
|---------|--------|------|----------|
| Capability resolution | Uses `resolveGhgCapabilities` after display-name + scope definition lookup | Calls the same resolver, but passes undefined `effectiveScopeCode` | **No** |
| Field derivation | `resolveGhgFormContext` + `deriveGhgFields` + resolved config | Same shared context/derivation architecture | **Yes for derived fields** |
| Category identity | Normal path begins from display name, then resolves code + scope | Hydration can supply code, but active capability call is broken and module dispatch sniffs names | **No** |
| Configuration resolution | Supports an optional `organizationGhgOverrides` prop | Hardcodes `organizationOverrides: null` | **No** |
| Process/fuel/custom-fuel UI | Hardcoded category-name fragments | Duplicated hardcoded fragments | Behaviorally similar, architecturally duplicated |
| Subcategory options/filtering | Local hardcoded options and filtering | Duplicated local options and filtering | Behaviorally similar, not shared |
| C7 capability | Centralized for multi-employee branch, plus separate hardcoded employee fields | Intended centralized flag is defeated by resolver wiring; local C7 loading/string checks remain | **No** |
| C6 flight details | Monthly capability gate works; yearly child misses capability prop | No equivalent shared flight-details section in Edit | **No** |
| Registry dispatch | Display-name/C-code heuristic | Separate display-name/C-code heuristic | **No shared resolver** |

Create and Edit share the core field-derivation engine, but they are **not fully architecturally aligned** for capabilities, canonical identity, organization overrides, static field options, or module dispatch.

## 7. Organization Customization Readiness

### Intended pipeline

```text
Standard Config
      +
Organization Override
      ↓
resolveGhgConfig
      ↓
resolveGhgCapabilities
      ↓
resolveGhgFormContext / deriveGhgFields
      ↓
Create + Edit
```

### Actual active pipeline

- Create resolves capabilities separately from `resolvedGhgConfig`.
- `resolveGhgCapabilities` accepts `organizationOverrides` but does not apply them; it always reports `organizationOverridesApplied: false`.
- Create exposes an `organizationGhgOverrides` prop, but the active `Emissions.js` call site does not pass it.
- Edit explicitly calls `resolveGhgConfig({ ..., organizationOverrides: null })`.
- Edit capability resolution currently receives an undefined scope property.
- Static JSX decisions (Process/fuel/custom fuel/fugitive/C7 employee fields) bypass resolved configuration.
- Static subcategory and custom-fuel unit options bypass `fieldOptions` overrides.
- Registry/payload capabilities are sourced from `scope3-definitions.js`, not from `resolveGhgCapabilities`.
- The reachable `/emissions/dynamic` test route uses form-config directly and bypasses the shared override/capability pipeline entirely.

### Architectural blockers

1. There is no single resolved object that carries standard config + organization overrides + capabilities into both forms.
2. Capability overrides are not implemented or consumed.
3. Edit has no organization override input path.
4. Active static form fields/options are outside the override schema’s effective reach.
5. The module registry has a separate capability table.
6. Active identity still starts from mutable display names in several paths.

Without resolving these blockers, future customization would force special-case component logic or produce inconsistent UI versus payload validation.

## 8. Legitimate Exceptions

The following category-specific behavior should remain outside UI capability configuration:

- **Calculation and derivation:** formula traversal, formula-name matching, method/activity/subcategory-to-formula maps, unit conversion, emission factors, custom-fuel calculations, and the browser `evaluateFormula` fallback.
- **C7 domain workflow:** multi-employee monthly/yearly models, employee calculation payloads, C7-specific endpoints, C7 validation, and edit persistence.
- **Hydration and compatibility:** historical C7 activity normalization, missing `process_type` inference, legacy `electricity` subcategory support, approval snapshot fallback, name-keyed historical EF/fuel data.
- **Approval/evidence:** approval routing, evidence upload/removal, record status, and audit-log persistence orchestration.
- **Generic scope workflow:** Scope 1/2/3/Biogenic routing, reporting periods, access control, monthly/yearly mode, and generic module fallbacks.
- **Canonical separation:** Stationary Combustion/Scope 1, Stationary Combustion/Biogenic, Mobile Combustion/Scope 1, and Mobile Combustion/Biogenic must remain distinct `(code, scope_code)` identities. They must not be merged.

## 9. Dead / Unreachable Candidates

Report only; no deletion is recommended or performed.

- `frontend/src/components/EmissionEntryFormRefactored.js` — no production import found.
- `frontend/src/components/MonthlyEmissionEntry.js` — no production import found.
- `frontend/src/pages/emissions/EmissionEditDialog.js` — only barrel-exported; not used by `pages/Emissions.js`.
- `frontend/src/pages/emissions/useEmissionEdit.js` — only barrel-exported; not used by `pages/Emissions.js`.
- `frontend/src/pages/emissions/useEmissionsData.js` — only barrel-exported; not used by `pages/Emissions.js`.
- `frontend/src/pages/emissions/EmissionTable.js` — only barrel-exported; not used by `pages/Emissions.js`.
- `frontend/src/modules/ghg/emissions/hooks/useEmissionForm.js` — no active consumer; contains a parallel category-detection architecture.
- `frontend/src/modules/ghg/emissions/categories/*` — parallel registry/config tree reached only through the unused GHG barrel/unused refactored form in the primary graph.
- `frontend/src/constants/categories.js` capability helper functions and `SUBCATEGORY_OPTIONS` — active primary forms do not call them; retained through compatibility exports/barrels.
- `frontend/src/modules/ghg/emissions/shared/constants/emission-form-constants.js:99–130` — legacy category helper checks have no active primary consumer.
- `frontend/src/modules/emissions/categories/shared/Scope3FlatCreate.js:376–380` — defensive exact-name employee payload block appears unreachable because C7 returns through its dedicated branch.

`DynamicEmissionForm.js` is **not** dead: it remains reachable through `/emissions/dynamic`. It is a separate test/demo form and bypasses the shared architecture.

## 10. Risk Rating

## HIGH

Reasons:

- Edit capability resolution is currently wired with an undefined scope property.
- Active category-name rendering and validation rules remain duplicated across Create/Edit.
- Two active capability authorities can drift.
- Organization overrides do not flow end-to-end.
- Existing green tests do not cover the live Edit resolver call site or all static JSX capability branches.

The rating is not CRITICAL because no calculation drift was observed, all golden suites pass, no database/API writes occurred, and C7/calculation production logic was not changed.

## 11. Final Recommendation

### A. Is the capability refactor complete?

**No.** Phase 4 completed several important Scope 3 conversions, but active Process/custom-fuel/fugitive/C7/static-option decisions and duplicate registry capabilities remain outside the canonical layer.

### B. Are Create and Edit architecturally aligned?

**Partially.** They share `resolveGhgFormContext` and `deriveGhgFields`, but capability resolution, canonical identity, organization overrides, static options, flight details, and registry dispatch are not aligned.

### C. Can we safely move to inflation analysis?

**Not under the stated phase gate if “capability architecture complete” is a prerequisite.** Inflation analysis is technically independent and the golden baseline is stable, but this audit found remaining capability work that should be explicitly accepted, deferred, or completed before declaring the refactor closed.

### D. Is there any remaining capability work that must happen before inflation?

**Yes, unless the user explicitly accepts the remaining risk.** Minimum capability closeout should address:

1. Edit `effectiveScope` capability wiring.
2. Process/fuel/custom-fuel/fugitive/C7 static UI and validation decisions.
3. Missing yearly flight capability propagation.
4. One capability authority for UI and module/payload behavior.
5. End-to-end organization override propagation or an explicit deferral statement.

### E. What should explicitly NOT be touched?

- Formulas, decision trees, emission factors, units, conversion, inflation, currency conversion, calculation inputs, historical outputs, and persisted calculations.
- C7 calculation, payload, endpoint, persistence, and employee-domain behavior.
- The frontend `evaluateFormula` implementation until separately authorized.
- Dead/unreachable candidates until separately authorized.
- Stationary/Mobile Scope 1 and Biogenic identities; do not merge them.
- API contracts, database schemas, and backend production code.

## Verification

All requested baselines matched exactly:

- Backend golden: **506 passed / 9 skipped** (`13.19s`)
- Frontend full: **1,159 passed / 63 snapshots**
- Capability + Phase 1 equivalence: **810 passed**

MongoDB document counts were read before and after the suites and were unchanged:

- `emission_records`: 840 → 840
- `ce_calculation_audit_logs`: 1,339 → 1,339
- `emission_history`: 1,763 → 1,763

No production file, API endpoint, database document, C7 implementation, calculation rule, or frontend evaluator was changed.