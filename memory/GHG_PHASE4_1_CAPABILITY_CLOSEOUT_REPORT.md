# GHG Phase 4.1 — Capability Closeout Report

**Status:** COMPLETE — STOP GATE  
**Scope:** Frontend capability architecture only  
**Backend production changes:** 0  
**API/schema/migration changes:** 0  
**Formula/calculation/evaluator changes:** 0

## 1. Files Changed

### Canonical configuration and tests

- `frontend/src/modules/ghg/config/resolveGhgCapabilities.js`
- `frontend/src/modules/ghg/config/resolveGhgConfig.js`
- `frontend/src/modules/ghg/config/resolveGhgFormArchitecture.js` — new shared live Create/Edit architecture seam
- `frontend/src/modules/ghg/config/resolveGhgUiState.js` — new shared UI visibility policy
- `frontend/src/modules/ghg/config/standardGhgFormConfig.js` — new standard active field-option source
- `frontend/src/modules/ghg/config/index.js`
- `frontend/src/modules/ghg/config/__tests__/resolveGhgCapabilities.test.js`
- `frontend/src/modules/ghg/config/__tests__/phase4_1LivePaths.test.js` — new live-path parity suite

### Active Create/Edit flow

- `frontend/src/components/EmissionEntryForm.js`
- `frontend/src/components/EmissionEditForm.jsx`
- `frontend/src/pages/Emissions.js`
- `frontend/src/pages/emissions/utils/hydrateEmissionForm.js`
- `frontend/src/modules/ghg/emissions/shared/components/steps/Step1BasicSelection.js`
- `frontend/src/modules/ghg/emissions/shared/components/steps/Step3YearMonthlyData.js`
- `frontend/src/modules/ghg/emissions/shared/components/CustomFuelMonthFields.js`
- `frontend/src/modules/ghg/emissions/shared/hooks/useEmissionSubmit.js`
- `frontend/src/modules/ghg/emissions/shared/utils/validation.js`
- `frontend/src/modules/ghg/emissions/shared/utils/__tests__/validation.golden.test.js`

### Registry capability consumers

- `frontend/src/modules/emissions/index.js`
- `frontend/src/modules/emissions/categories/scope3-definitions.js`
- `frontend/src/modules/emissions/categories/shared/Scope1Create.js`
- `frontend/src/modules/emissions/categories/shared/Scope1Edit.js`

### Documentation/test evidence

- `memory/GHG_PHASE4_1_CAPABILITY_CLOSEOUT_REPORT.md`
- `test_reports/iteration_184.json`
- `test_reports/phase4_1_smoke.jpeg`
- `test_reports/phase4_1_scope3_retest.jpeg`

No backend production file, database schema, API contract, formula, decision tree, emission factor, unit definition, inflation path, currency path, frontend evaluator, dead-code candidate, or C7 production module was changed.

## 2. Exact Capability Issues Fixed

1. **Edit scope wiring:** `Emissions.js` no longer reads nonexistent `editGhgFormContext.effectiveScopeCode`. It passes the complete resolved context to `resolveGhgFormArchitecture`, which reads `formContext.effectiveScope`.
2. **Live-path regression guard:** tests resolve the actual shared architecture used by Edit and prove Scope 1 and Biogenic Stationary Combustion remain different `(code, scope_code)` identities.
3. **Capability propagation:** Create and Edit now propagate the same capability object and resolved field options to active children.
4. **C6 monthly/yearly:** `YearlyDataEntry` now receives capabilities; C6 flight details are available in both monthly and yearly Create. Edit receives the same flight capability and renders the existing flight-details component for both frequencies.
5. **Process UI:** Process-type and venting-methodology visibility are driven by `capabilities.processType` and `capabilities.calculationMethodology`.
6. **Fuel requirement:** Create validation, Scope 1 module validation, Edit calculation readiness, and fuel UI use `capabilities.requiresFuel`; Process no longer relies on a display-name check.
7. **Stationary/Mobile/Flaring:** calculation-methodology and custom-fuel visibility use canonical capabilities.
8. **Fugitive:** fuel/custom-fuel remain enabled, while legacy manual-factor overrides use `capabilities.manualFactorOverrides=false`.
9. **C7 UI boundary:** employee-field visibility and Edit loading readiness use the existing multi-employee capability. C7 calculation, endpoints, payload, persistence, and aggregation were not changed.
10. **Subcategory options:** the active four-option Create/Edit list is defined once in `standardGhgFormConfig.js` and flows through resolved `fieldOptions`.
11. **Custom-fuel options:** active emission-factor, quantity, heat-EF, calorific-value, and quantity-EF unit lists are sourced from standard resolved field options. Values and calculation semantics are unchanged.
12. **Registry authority:** `scope3-definitions.js` derives all capability booleans from `resolveGhgCapabilities`; `modules/emissions/index.js` also maps registry capability names from that resolver.
13. **Organization override input:** `Emissions` accepts one optional `organizationGhgOverrides` input, applies it to Edit architecture, and passes it to Create. Existing `fieldOptions` overrides flow to both paths.
14. **Independent-QA runtime issue:** capability initialization was moved above the Scope 3 activity memo after QA reproduced a temporal-dead-zone crash. The exact Scope 1 → Add Emission → Scope 3 path now passes live.

## 3. Create/Edit Parity — Before vs After

| Concern | Before Phase 4.1 | After Phase 4.1 |
|---------|------------------|-----------------|
| Capability scope | Create resolved correctly; Edit passed undefined `effectiveScopeCode` | Both use `formContext.effectiveScope` through `resolveGhgFormArchitecture` |
| Process UI | Duplicated display-name checks | Shared capability + shared UI policy |
| Fuel validation | Display-name Process exemption in multiple paths | `requiresFuel` capability in Create/Edit/module validation |
| Stationary/Mobile/Flaring | Duplicated name fragments | Canonical direct-category capabilities |
| Fugitive overrides | Duplicated name fragment | `manualFactorOverrides` capability |
| C7 employee UI | Exact display-name checks plus local C7 loading check | `multiEmployee` capability; domain workflow untouched |
| C6 Create | Monthly capability worked; yearly child lost capabilities | Monthly and yearly receive the same capability object |
| C6 Edit | No shared flight-details capability consumer | Existing flight component receives Edit capability/data for monthly/yearly |
| Subcategory options | Two local hardcoded lists | One standard option source through resolved field options |
| Custom-fuel options | Local/static component lists | One standard option source through resolved field options |
| Organization overrides | Create optional only; Edit hardcoded `null` | One optional input reaches both Create and Edit |
| Registry capabilities | Separate static flags | Resolver-derived flags and registry capability names |

## 4. Remaining Category-Specific Checks

Every remaining production check found by the final scan is classified below. None is an active primary Create/Edit UI capability decision.

| Location | Remaining check | Classification | Reason it remains |
|----------|-----------------|----------------|-------------------|
| `modules/ghg/config/categoryRules.js:51,61` | Process and Stationary/Mobile/Flaring code/name fallback | **calculation** | Formula/field derivation with canonical code first and legacy display-name fallback; protected by Phase 1 equivalence. |
| `pages/Emissions.js:473` | Process display-name inference | **hydration/legacy** | Recovers missing historical `process_type` from saved record/formula data. |
| `pages/emissions/utils/hydrateEmissionForm.js:94–121` | C7/Employee Commuting detection | **hydration/legacy** | Normalizes historical C7 record shapes; C7 production behavior is untouched. |
| `components/EmissionEntryForm.js:2908–2913` | Stationary/Mobile/Fugitive module fallback | **identity compatibility** | Legacy display names are converted to registry IDs when canonical C-code extraction is unavailable. |
| `pages/Emissions.js:1076–1087` | Scope 1 module fallback | **identity compatibility** | Edit dispatch fallback for historical display-name records. |
| `modules/ghg/emissions/shared/hooks/useEmissionSubmit.js:101–113` | Save-module fallback | **identity compatibility** | Legacy dispatch fallback; payload/calculation behavior was not refactored. |
| `modules/emissions/categories/shared/Scope1Edit.js:296` | Process payload-shape check | **workflow/domain** | Controls existing process payload inclusion, not UI visibility or validation; deliberately left untouched. |
| `modules/emissions/core/verifyModuleContracts.js:165` | Module-ID combustion/fugitive contract grouping | **workflow/domain** | Registry verification logic, not form capability logic. |
| `modules/emissions/categories/shared/Scope3FlatCreate.js:377` | Exact `Employee Commuting` defensive payload block | **dead/unreachable** | Dedicated C7 dispatch returns earlier; reported only and not removed. |
| Create/Edit Scope 3 EF filters | Subcategory values and name-keyed EF matching | **workflow/domain** | Selects historical data-source rows after the option is chosen; it is not field visibility/capability ownership. Legacy `electricity` alias is **hydration/legacy** compatibility. |
| Create/Edit category lookup fallbacks | Display name + effective scope | **identity compatibility** | Canonical code is preferred where present; fallback is required for historical records without `category_code`. |
| Generic Scope 1/2/3/Biogenic branches | Scope routing | **workflow/domain** | Reporting, module, and data-source workflow. Stationary/Mobile Scope 1 and Biogenic identities remain separate. |

The Phase 1 legacy reference under `config/testSupport` contains historical string checks by design and is test-only, not production behavior.

## 5. Is `resolveGhgCapabilities` Now the Single Capability Authority?

**Yes, for active capability booleans and registry capability behavior.**

- Create/Edit UI consume it through `resolveGhgFormArchitecture`.
- Shared UI visibility consumes the resolved capability object.
- Scope 1 validation receives the same object.
- `scope3-definitions.js` derives its compatibility booleans from the resolver instead of owning values.
- Registry capability names are mapped directly from the resolver.

Metadata intentionally retained outside the capability resolver:

- Scope 3 category names and descriptions
- Supported calculation methods and default method
- Activity option labels/values
- Registry subcategory option metadata, including its pre-existing Process Emissions entry
- Zod schemas, field definitions, payload builders, and API route metadata

These are form/payload/domain metadata, not competing capability decisions.

## 6. Organization Override Readiness

The active primary path is now:

```text
Backend standard form config + frontend standard field options
                       +
          existing organization override object
                       ↓
      resolveGhgConfig + resolveGhgFieldOptions
                       ↓
            resolveGhgCapabilities
                       ↓
                  Create + Edit
```

- Both forms receive the same optional override input.
- Existing `fieldOptions` keys can replace active subcategory/custom-fuel options without component conditions.
- Existing field, label, order, conditional-field, and decision-tree overrides continue through `resolveGhgConfig`.
- No organization UI, database document, organization-specific rule, or new override schema was added.
- The existing schema does not define capability-boolean overrides. If that is approved later, it can be added centrally to the resolver without component-level organization checks.

## 7. Tests Before / After

| Gate | Before | After |
|------|--------|-------|
| Backend golden | 506 passed / 9 skipped | **506 passed / 9 skipped** |
| Frontend full | 1,159 passed / 63 snapshots | **1,189 passed / 63 snapshots** |
| Capability + Phase 1 equivalence | 810 passed | **840 passed** (30 new live-path checks) |
| Phase 1 equivalence alone | 785 passed | **785 passed** |
| Phase 3 C7 safety | 9 passed | **9 passed** |
| Production build | Not part of baseline | **Compiled successfully** with existing repository warnings |

Independent QA (`iteration_184.json`) reran backend/frontend/C7 gates and found one live Scope 3 initialization crash. The issue was fixed, the frontend suites were rerun, and the exact live transition passed without page errors.

## 8. Calculation Snapshot Comparison

- Frontend snapshots: **63 before / 63 after; all unchanged**.
- Phase 1 derivation equivalence: **785 before / 785 after; zero differences**.
- Backend golden: **506 before / 506 after; no golden output drift**.
- Formula files, formula selection rules, decision trees, factors, units, conversion, calculator payload semantics, `evaluateFormula`, and backend production were not modified.

## 9. Database Counts Before / After

| Collection | Before Phase 4.1 | Final observed | Attribution |
|------------|------------------|----------------|-------------|
| `emission_records` | 840 | **840** | Unchanged |
| `ce_calculation_audit_logs` | 1,339 | **1,339** | Unchanged |
| `emission_history` | 1,763 | **1,764** | One concurrent external C7 Edit history row |

The additional history row was inserted at **2026-08-17T16:10:19Z**, category **C7 - Employee Commuting**, by the existing admin account, and records a user edit from 59 km to 60 km. It predates independent QA and both live smoke checks. No implementation command, automated suite, screenshot script, or QA flow called a mutation endpoint; all project testing was read-only/dry-run. The row was not deleted because the phase prohibited database writes.

## 10. Remaining Known Limitations

1. Historical records without `category_code` still require display-name + scope identity fallback.
2. Registry option metadata is not organization-specific; active primary Create/Edit options are override-ready, as requested.
3. Capability-boolean organization overrides are not in the existing override schema and were not invented.
4. The separate `/emissions/dynamic` test/demo route still bypasses the primary Create/Edit architecture; it was outside the approved active-flow scope.
5. Dead/unreachable code, the frontend evaluator, inflation, currency conversion, and C7 production internals remain untouched.
6. Pre-existing ESLint warnings remain in large legacy components; Phase 4.1 introduced no new blocking compile errors.

## Stop Gate

Phase 4.1 is complete. No inflation analysis/fix, evaluator cleanup, dead-code cleanup, C7 refactor, or unrelated GHG refactor has started.