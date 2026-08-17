# GHG Refactor — PHASE 1 REPORT (Create flow only)

Date: June 2026
Gate: **PHASE 1 COMPLETE — STOP. Awaiting review before Phase 2 (Edit).**

Invariant held: **SAME INPUT → SAME CALCULATION → SAME OUTPUT.**

## Changed files

**Exactly one production file changed.**

| File | Change |
|---|---|
| `frontend/src/components/EmissionEntryForm.js` | **−262 / +62 lines** (3335 → 3073). The 256-line inline `dynamicInputFieldsResult` memo is replaced by three small memos that call the shared config layer. Also: `effectiveScopeForCategories` now calls the shared `resolveEffectiveScopeCode`, the orphaned `isDensityRequiredForQtyBasis` import was dropped, and a new `organizationGhgOverrides = null` prop was added. |

Nothing else was touched. No backend file, no `Emissions.js`, no Edit component, no C7 code, no evidence or approval code, no formula, emission factor, unit or schema, no dead code removed, no frontend evaluator change.

## Extracted modules

New folder `frontend/src/modules/ghg/config/` — all pure (no React, no network, no module state):

| File | Lines | Responsibility |
|---|---:|---|
| `deriveGhgFields.js` | 289 | **The single shared field-derivation path.** Resolved config + explicit context → `{ fields, formulaId, matchedFormula }`. Verbatim extraction. |
| `resolveGhgFormContext.js` | 81 | Builds the explicit context (effective scope, category identity, method/activity/subcategory, decision values, fuel). Replaces reading a dozen unrelated React state values. |
| `resolveGhgConfig.js` | 102 | **Organization override extension point.** Standard config + overrides → resolved config. |
| `categoryRules.js` | 63 | Canonical `(code, scope_code)` identity resolution + the two name-based category predicates, isolated so configuration can replace them later. |
| `overrideSchema.js` | 96 | Override whitelist and validation. |
| `index.js` | 27 | Public surface. |

Test support: `testSupport/legacyDeriveFields.reference.js` (277 lines) — a **frozen, byte-faithful copy of the pre-refactor logic**, imported only by the equivalence test. It is the permanent evidence that Phase 1 changed nothing.

## Responsibility separation achieved

| Concern | Before | After |
|---|---|---|
| Field derivation | 256 lines inline in the form component | `deriveGhgFields` (pure, shared, testable) |
| Form context / scope + category identity | re-derived inline in 2 places | `resolveGhgFormContext` + `categoryRules` |
| Conditional field visibility | inline in the memo | inside `deriveGhgFields`, driven by the resolved config |
| Config resolution / org customization | did not exist | `resolveGhgConfig` + `overrideSchema` |
| Form state | already in `useEmissionFormState` | unchanged |
| Validation | already in `shared/utils/validation` | unchanged |
| Calculation | already backend-authoritative | unchanged |
| API persistence | already in `useEmissionSubmit` | unchanged |

## Regression evidence

### Equivalence proof (the important one)

`__tests__/deriveGhgFields.equivalence.test.js` runs the new derivation **and** the frozen legacy reference over:

* all **24 active categories** (real `GET /api/calc-engine/form-config` responses, exported to a fixture)
* every reachable decision path per category — **158 paths** enumerated from the live decision trees
* × **4 fuel variants** (no fuel / fuel without density / fuel with density / custom fuel)
* plus the biogenic→scope3 branch

**785 assertions, all passing**, comparing the full field list, field order, every field property, and the resolved `formulaId`. Not one difference.

It also asserts that all 24 categories resolve to the same id by canonical `(code, scope_code)` as by name — including `Stationary Combustion` and `Mobile Combustion`, which resolve correctly to their Scope 1 and Biogenic definitions even when the display name is deliberately wrong.

### Test counts, before and after

| Suite | Before Phase 1 | After Phase 1 | Delta |
|---|---:|---:|---|
| Backend golden (`tests/golden`) | 497 passed, 9 skipped | **497 passed, 9 skipped** | unchanged |
| Frontend golden | 145 passed, 63 snapshots | **145 passed, 63 snapshots** | unchanged |
| Frontend new (config layer) | — | **805 passed** | +805 |
| **Frontend total** | 145 | **950 passed, 7 suites** | +805 |

* **Failures: none.**
* **Changed snapshots: none** — all 63 `hydrateEmissionForm` snapshots pass untouched.
* **Changed calculations: none** — every golden calculation and live-endpoint fixture reproduces its baseline exactly (relative tolerance 1e-12).

### Pre-existing backend failures (unrelated, not fixed)

Running the wider GHG backend suites surfaces failures that exist independently of this change — no backend file was modified, so they cannot be caused by it:

| Suite | Result | Cause |
|---|---|---|
| `test_calc_engine.py` | pass | — |
| `test_dynamic_emission_records.py` | pass | — |
| `test_process_emissions_venting_regression.py` | pass | — |
| `test_calc_engine_phase3.py` | 8 errors | empty `BASE_URL` — `Invalid URL '/api/auth/login': No scheme supplied` (environment, not code) |
| `test_phase_b5_emissions_refactor.py` | 8 failed | stale hardcoded expectations: `expected 20 modules, got 35`; `expected 40 baseline records, got 337` |

Left alone per the no-unrelated-cleanup rule. Logged as backlog.

### UI verification (read-only)

Testing agent walked the live Add form: **no regressions, 100 % of exercised flows, `retest_needed: false`.** Confirmed rendering and reactivity for Scope 1 Stationary (all three methodologies produce different field sets: Heat Basis → Calorific Value; Qty Basis → Emission Factor; Carbon Composition → Composition of Carbon + Oxidation Factor), Mobile, Fugitive, Process Emissions (still shows **no** fields until a process type is chosen — the intentional pre-existing behaviour), Scope 2 Purchased Electricity, Scope 3 C1/C2/C6/C9 method switching (C9 correctly renders Customer fields instead of Supplier fields, proving category-specific derivation is still active), Biogenic Direct/Indirect with its own category list, and the custom-fuel toggle hiding CV/Density/EF as expected.

### No database writes

| Collection | Before | After |
|---|---|---|
| `emission_records` | 840 | **840** |
| `ce_calculation_audit_logs` | 1339 | **1339** |
| `emission_history` | 1754 | **1754** |

The golden suites are `dry_run` only and the UI verification was explicitly instructed not to save. Verified before and after.

### C7 unchanged

No C7 file, branch, payload or validation was modified. `employees[]`, `monthly_totals`, `yearly_total` and the C7 endpoints are untouched; the C7 record-contract and validation tests pass unchanged. C7 does share the new derivation for its *field list* (as it shared the old inline memo), and the equivalence test covers C7's category and decision paths — the field list is provably identical.

### Inflation unchanged

No change to `currency_conversion` resolution, the router injection path, the silent `1.0` fallback or `ce_property_source_mappings`. The 4 spend-basis fixtures where the two baselines disagree still disagree by exactly the same amounts.

## Organization customization extension point

```
Standard GHG Configuration  (GET /api/calc-engine/form-config/{categoryId})
        +
Organization GHG Overrides  (none today — prop defaults to null)
        ↓  resolveGhgConfig
Resolved GHG Configuration
        ↓  resolveGhgFormContext
Explicit form context
        ↓  deriveGhgFields
Fields + resolved formula  →  existing calculation / save pipeline
```

**Safety property:** with no overrides, `resolveGhgConfig` returns the standard config **by reference** — `expect(result).toBe(STANDARD)`. Nothing downstream can observe that the layer exists. That is what makes this behaviour-neutral, and it is asserted five ways in `resolveGhgConfig.test.js`.

Override keys are **whitelisted**, never deep-merged, so an override document cannot reach calculation inputs:

* **Applied today:** `hiddenFields`, `requiredFields`, `fieldLabels`, `fieldOptions`, `fieldOverrides` (label, required, placeholder, help text, display order, options, validation rules, hidden), `customFields`.
* **Accepted and validated, deliberately not consumed yet** (shape frozen so later phases need no rewrite): `disabledScopes`, `disabledCategories`, `disabledSubcategories`, `conditionalFields`, `validationRules`, `calculationInputs`, `formulaOverrides`. Surfaced on `resolved.organizationMeta`.
* **Rejected:** anything touching `formulas`, `decision_tree`, emission factors, units, or an `organizationId` conditional. Tested explicitly.

No SuperAdmin UI, no API endpoint, no organization-specific component, no organization id conditional was added. The only wiring is a `null`-defaulted prop.

## Remaining coupling (honest list)

1. `EmissionEntryForm.js` is still **3,073 lines**. Phase 1 only removed the derivation; the wizard shell, unit-initialisation effects, OCR prefill, evidence upload and the calc-engine calls remain in the component.
2. **The Edit flow still has its own copy** of the derivation in `Emissions.js` (L396–671). That is Phase 2 and is exactly why the shared module takes an explicit context rather than React state.
3. Unit initialisation is still three sequential `useEffect`s inside the form; ordering still determines the saved unit. Untouched deliberately (Phase 4).
4. `resolveEffectiveScopeCode` is now shared, but the Edit path still derives the effective scope inline in four places.
5. Category capability rules (`assetNameCategories`, `subcategoryCategories`, `locationCategories`, the C7 flag) are still hardcoded arrays in the form. Not in Phase 1 scope; they are the natural first consumers of `organizationMeta.disabledCategories` later.
6. `deriveGhgFields` still contains two name-sniffing predicates (`process`, `stationary|mobile|flaring`). They are isolated in `categoryRules.js` with the asymmetry between them documented, but they are still string matching, not capabilities.

## Success criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Create flow materially less coupled | **yes** — 262 lines of mixed-responsibility logic out of the component |
| 2 | Field derivation centralized | **yes** — one implementation, pure and tested |
| 3 | Create and future Edit can share the architecture | **yes** — explicit context, no React dependency |
| 4 | Clean organization customization extension point | **yes** — whitelisted overrides, identity when absent |
| 5 | Existing GHG behaviour unchanged | **yes** — 785 equivalence assertions + UI verification |
| 6 | Golden tests green | **yes** — 497 backend, 950 frontend, 0 failures |
| 7 | No calculation drift | **yes** — 0 baseline outputs changed |
| 8 | C7 untouched | **yes** |
| 9 | Inflation untouched | **yes** |
| 10 | No unrelated cleanup | **yes** — 1 production file, dead code and evaluator intact |
