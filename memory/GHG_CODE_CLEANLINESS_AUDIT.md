# GHG Phase 9 — Code Cleanliness Audit

**Date:** 2026-08-18  
**Scope:** GHG frontend implementation only. No calculation logic, API, backend schema, or database data was changed.

## 1. Executive Summary

The GHG codebase is **clean with minor, intentionally retained technical debt**. The audit found seven conclusively inert fragments and removed them without changing behaviour. All other older-looking code was traced through production, compatibility, configuration, test, or dynamic-import paths and retained where certainty was not absolute.

## 2. Confirmed Dead Code Removed

| File | Symbol / fragment | Reason and evidence | Action |
|---|---|---|---|
| `frontend/src/components/EmissionEntryForm.js` | Two `react-hooks/exhaustive-deps` suppression comments | ESLint reported both directives as unused; the dependency arrays already satisfy the rule. | Removed. |
| `frontend/src/pages/Emissions.js` | Three `react-hooks/exhaustive-deps` suppression comments | ESLint reported all three directives as unused. | Removed. |
| `frontend/src/components/EmissionEditForm.jsx` | `&& true` guard around regular dynamic fields | Boolean literal made the guard permanently redundant. | Removed the inert literal only. |
| `frontend/src/components/EmissionEditForm.jsx` | `{false && <span>(unit locked)</span>}` | Literal `false` made the entire JSX child unreachable in every build and runtime path. | Removed. |

No prototype file, component, helper, configuration field, test, snapshot, or stylesheet was deleted because none met the same conclusive standard.

## 3. Possibly Dead Code — Retained

The following look unused by the current app's static import graph, but are re-exported through GHG module boundaries. A repository search cannot disprove a future extension, template, or external module consumer, so they were retained.

| Candidate area | Classification | Why it was retained |
|---|---|---|
| `modules/ghg/emissions/entry-modes/monthly/MonthlyDataEntry.js` and its barrel exports | POSSIBLY DEAD | No current direct application import was found, but it remains part of the GHG module's published entry-mode surface. |
| Selector/card utilities re-exported by `modules/ghg/emissions/shared/index.js` | POSSIBLY DEAD | Static usage is sparse, but the shared barrel is a compatibility boundary; no safe proof exists that no configurable or external consumer imports it. |
| Legacy helper-style exports in `modules/ghg/emissions/categories/registry.js` | ACTIVE DUPLICATION | The modern `modules/emissions` registry is active at app boot, while legacy registry helpers remain a separate compatibility/module surface. Duplication is not proof of dead code. |

## 4. Intentionally Retained Code

### `evaluateFormula`

**Classification: INTENTIONALLY RETAINED.**

- Defined in `frontend/src/components/EmissionEntryForm.js` as the process-template evaluator.
- Passed into `useEmissionSubmit` as `evaluateFormula`.
- Called by the yearly process-template submission path and the monthly process-template submission path in `frontend/src/modules/ghg/emissions/shared/hooks/useEmissionSubmit.js`.
- Those paths construct and persist process-emission payloads through the normal `/api/emissions` or supplier assessment emission endpoint.

Its behaviour was not changed.

### Compatibility and data paths

- **Legacy EF filtering:** Active in Create (`EmissionEntryForm.js`) and Edit (`Emissions.js`) Scope 3 option/activity filtering, including legacy `electricity` and missing-subcategory handling.
- **Hydration:** Active through the dynamic `hydrateEmissionForm` import in Create edit mode and the direct `editEmissionDispatch`/golden hydration paths. Historical dynamic field, fuel, custom-fuel, flight, biogenic, Scope 3, and C7 values remain supported.
- **Payload adapters:** `customFuelCalcAdapter`, `editEmissionDispatch`, category payload builders, and `useEmissionSubmit` remain reachable save-path adapters.
- **C7:** The dedicated C7 creation/editing and safety-net paths remain active and passed their focused suite.
- **Process templates:** The evaluator path above remains active for monthly and yearly template submissions.
- **Organization configuration:** Hidden/required fields, labels, safe options, disabled scopes/categories/subcategories, presentation-only custom fields, override schema, and override validation remain protected configuration-domain behaviour. No organization-specific hardcoding was introduced.

## 5. CSS Cleanup

- No standalone GHG CSS file or conclusively orphaned GHG selector was found.
- GHG form styling is primarily Tailwind utility usage embedded in the active form components; conditional and generated utility strings were retained.
- No CSS was removed.

## 6. Test Cleanup

- No tests, fixtures, helpers, or snapshots were removed.
- `postRefactorArchitectureContract.test.js` remains intact and passed.
- All 63 existing snapshots remain unchanged and passed.

## 7. Files Changed

1. `frontend/src/components/EmissionEntryForm.js`
2. `frontend/src/components/EmissionEditForm.jsx`
3. `frontend/src/pages/Emissions.js`
4. `memory/GHG_CODE_CLEANLINESS_AUDIT.md`
5. `memory/PRD.md`

## 8. Files and Categories Intentionally Untouched

- `backend/modules/ghg/` calculation engine and all backend GHG logic.
- `frontend/src/modules/ghg/config/`, including organization override schema and validation.
- `frontend/src/modules/ghg/config/__tests__/postRefactorArchitectureContract.test.js`.
- Legacy hydration, EF filtering, payload adapters, process-template submission, C7 compatibility, and Scope 3/Biogenic handling.
- All GHG tests, fixtures, and snapshots.
- Database collections and all write paths.

## 9. Regression Results

| Gate | Result |
|---|---|
| Frontend full suite | **1,223 passed** across 13 suites |
| Snapshots | **63 passed**, 0 changed |
| Backend golden suite | **506 passed, 9 skipped** |
| C7 safety net | **9 passed** |
| Phase 1 equivalence | **785/785 passed** |
| Architecture contract | Passed (included in focused 801-test run with equivalence) |
| Database before tests | `emission_records=840`, `ce_calculation_audit_logs=1,339`, `emission_history=1,764` |
| Database after tests | `emission_records=840`, `ce_calculation_audit_logs=1,339`, `emission_history=1,764` |
| Database writes | **0** — unchanged collection counts before and after all verification |

## 10. Final Assessment

Phase 9 is complete. Only conclusively inert lint metadata and literal-unreachable JSX were removed; all calculation, legacy compatibility, organization configuration, and regression protections remain unchanged.

**NO FURTHER SAFE DEAD-CODE CLEANUP IDENTIFIED.**