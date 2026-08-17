# GHG Refactor — PHASE 2 REPORT (Edit flow only)

Date: June 2026
Gate: **PHASE 2 COMPLETE — STOP.**

## 1. Files changed

| File | Change |
|---|---|
| `frontend/src/pages/Emissions.js` | **+86 / −294**. Removed the inline Edit field derivation; now resolves config/context and calls the shared derivation. Net **−208 lines** (3,688 → 3,480). Also adds the read-only hydration calculation guard. |
| `frontend/src/modules/ghg/config/deriveGhgFields.js` | **+58 / −2**. Shared compatibility fallbacks for `spend_based`, Scope 3 subcategories, and an explicit saved formula. Net **+56**. |
| `frontend/src/modules/ghg/config/resolveGhgFormContext.js` | **+4 / −0**. Accepts the explicit hydrated `savedFormulaId`. |
| `frontend/src/pages/emissions/utils/editEmissionDispatch.js` | **+2 / −1**. Resets dirty state before applying existing-record hydration. |
| `frontend/src/components/EmissionEditForm.jsx` | **+5 / −1**. Marks Process Type and Scope 1 methodology changes as user edits. |
| `frontend/src/modules/ghg/config/__tests__/editSharedDerivation.test.js` | **+102 / −0**. New 185-assertion Edit-focused shared-derivation suite. |
| `frontend/src/modules/ghg/config/__tests__/fixtures/*` | **Unchanged.** |
| `frontend/src/pages/emissions/utils/__tests__/__snapshots__/*` | **Unchanged.** |

Documentation added: this report and `GHG_PHASE2_EDIT_BASELINE.md`.

## 2. Duplicated logic removed

- Removed the former ~276-line local `dynamicInputFields` derivation from `Emissions.js`.
- Removed Edit-local decision-tree traversal, formula selection/fallbacks, mapping applicability filtering, custom-fuel filtering, field ordering, field construction, and Qty Basis density handling.
- Create and Edit now both use:

```text
resolveGhgFormContext → resolveGhgConfig → deriveGhgFields → fields
```

## 3. Edit-specific logic retained

- `hydrateEmissionForm` and `editEmissionDispatch` still hydrate the existing record, periods, category/subcategory, quantities, units, Scope 3 choices, custom-fuel values, C7 state, evidence references, facility/source data, and legacy fields.
- Dynamic saved-value/audit-log hydration remains separate from derivation, including legacy aliases, override flags, saved units, custom-fuel aliases, and Process Type recovery.
- The only shared context input originating from hydration is `savedFormulaId`; the shared resolver accepts it only as a compatibility fallback and rejects it after an incompatible method/category selection.
- The legacy `isOverrideExplicitlyFalse` output-only metadata was not retained because no production consumer reads it; it never affected rendered fields, validation, calculations, or payloads.

## 4. Test results

| Check | Before Phase 2 | After Phase 2 |
|---|---:|---:|
| Backend GHG golden suite | 497 passed / 9 skipped | **497 passed / 9 skipped** |
| Frontend golden suite | 145 passed / 63 snapshots | **145 passed / 63 snapshots** |
| Full frontend Jest suite | 950 Phase-1 tests | **1,134 passed / 63 snapshots** |
| Phase 1 configuration equivalence | 785 assertions | **785 assertions, 0 differences** |
| Edit-focused shared derivation | none | **185 passed** |
| Read-only live Edit QA | baseline captured | **Scope 1/2/3/Biogenic hydration passed; method update, Biogenic selection, and custom fuel verified** |

- **Snapshots changed:** 0.
- **Calculation differences:** 0. Backend golden results reproduce the same baselines.
- **Database writes from tests:** none. Counts stayed at `emission_records=840`, `ce_calculation_audit_logs=1339`, `emission_history=1763` across the final test/retest window.
- **MOCKED APIs: NONE.**

## 5. Read-only calculation request

Independent QA found a pre-existing transient 400 while Edit hydration eagerly invoked the backend calculator. The relevant effect was byte-identical before/after the derivation refactor. A narrow guard now defers that request until the user makes an actual Edit; live retest opened a saved custom-fuel record without an `execute-by-category` console request. The backend pipeline, formula selection endpoint, calculations, and payload format are unchanged.

## 6. Remaining coupling and risks

1. `Emissions.js` remains 3,480 lines; field derivation is removed, but state, hydration orchestration, rendering coordination, calculations, evidence, and save paths remain coupled.
2. Historical records do not persist `category_code`, so the shared resolver uses its pre-existing name fallback once within the effective scope, then operates on the resolved canonical `(code, scope_code)` category definition. A future record-adapter phase can persist/normalize this identity without changing the current API contract.
3. C7, inflation/currency, formulas/EFs, unit conversion, evidence, approval, frontend evaluator, capability configuration, schema, and APIs were deliberately untouched.
4. The read-only guard assumes all user edits continue to mark the form dirty; Process Type and Scope 1 methodology are explicitly covered now, while other existing inputs already use the page's dirty-state handler.

## Stop gate

No Phase 3+ work was started. No C7 safety net, capability configuration, inflation reconciliation, dead-code deletion, evaluator removal, UI naming, or cleanup follows this report without approval.