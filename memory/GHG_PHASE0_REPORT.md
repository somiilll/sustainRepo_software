# GHG Refactor — PHASE 0 REPORT (Safety Net)

Date: June 2026
Gate: **PHASE 0 COMPLETE — STOP. Awaiting review before Phase 1.**

Scope of this change set: golden-record fixtures + regression tests only.
No production code was modified. No dead code was deleted. No schema, API
contract, formula, emission factor, unit or user-visible behaviour changed.

---

## 1. What was created

All new files. Nothing existing was edited.

| File | Purpose |
|---|---|
| `backend/tests/golden/ghg_golden_support.py` | Shared helpers: baseline IO, float comparison (rel 1e-12), bucket keys, decision-tree leaf enumeration, `user_overrides` reconstruction from audit trails. |
| `backend/tests/golden/capture_ghg_baseline.py` | Read-only capture script that builds all six baselines. |
| `backend/tests/golden/export_hydrate_fixtures.py` | Exports 63 real records as frontend hydration fixtures. |
| `backend/tests/golden/conftest.py` | Makes the support module importable. |
| `backend/tests/golden/README.md` | How to run / regenerate, and what each guard locks. |
| `backend/tests/golden/run_ghg_golden.sh` | One-command full run (backend + frontend). |
| `backend/tests/golden/baselines/ghg_calc_replay.json` | 89 calculation replay fixtures. |
| `backend/tests/golden/baselines/ghg_http_endpoint.json` | 72 live-endpoint fixtures. |
| `backend/tests/golden/baselines/ghg_decision_trees.json` | 22 trees / 134 leaves / 83 selection fixtures. |
| `backend/tests/golden/baselines/ghg_form_config.json` | Form config for all 24 active categories. |
| `backend/tests/golden/baselines/ghg_record_contract.json` | 114 behaviour buckets over 840 records. |
| `backend/tests/golden/baselines/ghg_api_contract.json` | Pydantic field sets for the 3 emission models. |
| `backend/tests/golden/baselines/ghg_known_inconsistencies.json` | Pre-existing inconsistencies, reported not fixed. |

Backend test files: `test_ghg_golden_calculation.py`,
`test_ghg_golden_live_endpoint.py`, `test_ghg_golden_formula_selection.py`,
`test_ghg_golden_form_config.py`, `test_ghg_golden_record_contract.py`,
`test_ghg_golden_api_contract.py`.

Frontend test files: `units.golden.test.js`, `unitHelpers.golden.test.js`,
`validation.golden.test.js`, `hydrateEmissionForm.golden.test.js` (+ 63
snapshots), `customFuelCalcAdapter.golden.test.js`, and
`fixtures/hydrate-fixtures.json`.

### Read-only guarantee

Every calculation replay sends `dry_run: true`, so `CalcEngine.execute` returns
without inserting an audit-log row. No record is created, updated or deleted.
Verified before and after the full run:

| Collection | Before | After |
|---|---|---|
| `emission_records` | 840 | 840 |
| `ce_calculation_audit_logs` | 1339 | 1339 |
| `emission_history` | 1754 | 1754 |

A dedicated test (`test_replay_never_persists`) asserts `dry_run is True` on
every replay so the suite cannot silently become a writer.

---

## 2. Which GHG flows and categories are covered

Coverage was derived from the real database: 840 emission records across 149
distinct behaviour buckets, of which 155 records carry a linked calculation
audit log (the replayable set).

**Calculation replay: 89 fixtures across 55 buckets, 26 scope/category combinations.**

| Scope | Categories covered |
|---|---|
| Scope 1 | Stationary Combustion, Mobile Combustion, Fugitive Emissions, Flaring (Stationary Combustion), Process Emissions (`venting` and `ch4_overall_combustion`) |
| Scope 2 | Purchased Electricity, Purchased Steam/Heat |
| Scope 3 | C1, C2, C3, C4, C5, C6, C8, C9, C10, C11, C12, C13, C14, C15 |
| Biogenic | Stationary Combustion (S1), Mobile Combustion (S1), C8, C10, C11 (S3) |

Cross-cutting dimensions inside those buckets: monthly / yearly / unspecified
frequency, `activity_basis` / `spend_basis` / `supplier_basis`, standard fuel
and custom fuel, all three Scope 1 methodologies
(`using_heat_basis_ncv`, `using_qty_basis_ef`, `using_carbon_composition`),
with-override and without-override records.

**Not covered by calculation replay (and why):**

| Gap | Reason | Compensating guard |
|---|---|---|
| C7 Employee Commuting | The code deliberately does **not** persist a calc audit log for C7 (per-employee inputs do not match the `execute-by-category` contract), so there is nothing to replay. | `test_ghg_golden_record_contract.py::test_c7_multi_employee_contract_unchanged` locks the `employees[]`, `monthly_totals` and `yearly_total` shapes, and `validation.golden.test.js` locks the C7 step-3 gates. |
| C7 supplier_basis, C15, legacy uncoded Scope 3 categories ("Purchased Goods and Services", "Business Travel", …) | Records exist but have no audit log, or the log has `formula_id: null`. | Covered by the record-contract guard (114 buckets, i.e. **all** buckets) and the form-config guard. |
| 4 C6 Business Travel records | Audit-log inputs predate a now-required formula input (`No. of Days Travelled`), so they cannot be replayed at all today. | Reported as a pre-existing inconsistency; other C6 fixtures replay fine. |
| 1 Fugitive record (`HFC-134a`) | The fuel no longer exists in `fuel_database`, so `co2_gwp_fugitives` cannot resolve. | Reported; the `HFC-134a/R-134a` fugitive fixture replays fine. |
| Evidence upload, approval workflow | Not calculation surfaces; they are behind file/HTTP side effects the read-only suite must not trigger. | Record-contract guard locks `evidence_url` presence per bucket; approval fields are locked by the API-contract guard. Explicit E2E coverage is proposed as a Phase-1 prerequisite (see §7). |

**Formula selection: 83 fixtures across 47 buckets**, plus all 22 active decision
trees enumerated exhaustively (134 leaves). Decision-input combinations locked
include every Scope 1 methodology, all three Scope 3 methods,
`subcategory_selection=fugitive_emissions`, `type_of_product=continuous_usage`
(C11), `activity_type=hotel_stay` (C6), and both process types.

**Form config: all 24 active categories**, locking mappings, field order,
labels, required/override flags, allowed units, unit sources, compound units,
options, validation rules, decision fields, formulas and required properties.

**Record contract: all 114 buckets** present in the database.

---

## 3. What calculations are captured

Per fixture the baseline stores the complete, hermetic calculation input:

```
formula_id + formula_version_id
inputs            { variable: { value, unit } }
context           { fuel_name, fuel_id, scope, category, reporting_period,
                    activity, activity_type, scope3_ef_id, ... }
user_overrides    reconstructed from the audit trail — every property whose
                  resolve_property step recorded source == "user_override"
                  (user CV/density/EF overrides, router-injected
                  co2_gwp_fugitives, inflation_rate, ppp)
```

and the expected result:

```
baseline_outputs  { co2, ch4, n2o, co2e }  each with value + unit
stored_outputs    what was persisted on the record when it was created
```

18 distinct formulas are exercised: Stationary Combustion Heat Basis (Scope 1
and Biogenic), Mobile Combustion Heat Basis, Quantity Based, Carbon Composition,
Fugitives Scope 1, Fugitives Continuous Usage, Electricity Scope 2, Activity
Based (4 variants incl. passengers-distance and hotel stays), Spent Based,
Supplier Method, Continuous energy/fuel consumption, Process Emissions CH4 and
Process Emissions Carbon Composition.

Because the whole engine runs, the fixtures transitively lock: unit conversion
and compound-unit handling, `volume_to_mass` and density normalisation,
property/EF resolution via `ce_property_source_mappings`, GWP resolution from
`gwp_config`, currency (PPP/inflation) handling for spend basis, and output
aggregation to `tCO2e`.

## 4. Baseline outputs

Two independent baselines were recorded and both are internally stable:

* **Engine baseline** — outputs of `CalcEngine.execute` at capture time.
* **Endpoint baseline** — outputs of `POST /api/calc-engine/execute-by-category`,
  which additionally exercises the router's `scope3_ef_id` context enrichment,
  fugitive GWP injection and spend-basis currency resolution.

Comparison to what is stored on the records:

| Comparison | Result |
|---|---|
| Engine replay vs value stored on record | **85 of 89 identical**, 4 differ (all `spend_basis`) |
| Endpoint replay vs engine replay | **68 of 72 identical**, 4 differ (the same `spend_basis` fixtures) |
| Endpoint resolved formula vs formula stored on record | **72 of 72 identical** |

The refactor must reproduce the two recorded baselines exactly (relative
tolerance 1e-12). The historical differences are pre-existing drift, documented
below and deliberately **not** corrected.

## 5. Test results

```
Backend   497 passed, 9 skipped   (36s)
Frontend  145 passed, 63 snapshots (0.5s)
Total     642 passing
```

| Suite | Tests |
|---|---|
| `test_ghg_golden_calculation.py` | 179 |
| `test_ghg_golden_live_endpoint.py` | 73 |
| `test_ghg_golden_formula_selection.py` | 106 |
| `test_ghg_golden_record_contract.py` | 116 |
| `test_ghg_golden_api_contract.py` | 6 |
| `test_ghg_golden_form_config.py` | 25 |
| `units.golden.test.js` | 21 |
| `unitHelpers.golden.test.js` | 16 |
| `validation.golden.test.js` | 28 |
| `hydrateEmissionForm.golden.test.js` | 67 (63 snapshots) |
| `customFuelCalcAdapter.golden.test.js` | 13 |

The 9 skips are categories with no decision tree (formula resolved directly) —
asserted as such rather than silently passed.

---

## 6. Existing inconsistencies discovered

Reported only. No business logic was changed. Full detail in
`baselines/ghg_known_inconsistencies.json`.

**I1 — `inflation_rate` has two independent resolution paths (highest priority).**
For `spend_basis`, `POST /calc-engine/execute-by-category` injects
`inflation_rate` / `ppp` from the `currency_conversion` collection as a user
override, while the calc engine independently resolves the same property via
`ce_property_source_mappings`. When `reporting_period` is missing from the
context the router falls back to the *latest* currency year, so the two paths
disagree. Worked example (C2 Capital Goods, Potato Farming, PPP overridden to
25): endpoint uses `inflation_rate = 1.1486`, engine uses `1.1123`, and the
value stored on the record was computed with `1.1123`. Three different numbers
for one record. Affects 4 captured `spend_basis` fixtures across C2, C4 and C9.

**I2 — Duplicate active categories with identical names.** `Stationary
Combustion` exists twice (`8d62f52d…`, `3232f8ea…`) and `Mobile Combustion`
twice (`92a11a68…`, `1acae127…`), all `is_active: true`, and **each duplicate
has its own active decision tree**. Records store only the category *name*, so
name-to-id resolution is genuinely ambiguous. This is a direct risk for the
config-driven refactor and should be resolved as data, before Phase 1 relies on
name resolution.

**I3 — Non-canonical scope value.** One record has `scope: "Scope 2"` instead of
`scope2`. Distinct stored values: `Scope 2`, `biogenic`, `scope1`, `scope2`,
`scope3`.

**I4 — Two spellings of the same Scope 3 method.** Records contain both
`spend_basis` and `spend_based`. Only `spend_basis` participates in decision
trees, so `spend_based` records cannot resolve a formula.

**I5 — Legacy uncoded Scope 3 categories.** 6 category names without the
`C{n} - ` prefix: Purchased Goods and Services, Capital Goods, Upstream
Transportation and Distribution, Downstream Transportation and Distribution,
Employee Commuting, Waste Generated in Operations. They do not map to any
`emission_categories` row, so they have no form config and no formula.

**I6 — `frequency_type` is unset on many records** (treated implicitly as
monthly). Three distinct values: `null`, `monthly`, `yearly`.

**I7 — `process_type` set outside Process Emissions.** 2 Mobile Combustion
records carry `process_type: "venting"`.

**I8 — 412 orphan calculation audit logs** referencing `emission_record_id`
values that no longer exist (deleted records leave their audit logs behind).

**I9 — 12 audit logs with `formula_id: null`**, so the calculation that produced
those records cannot be identified or replayed.

**I10 — Reference data drifted away from stored records.** `HFC-134a` no longer
exists in `fuel_database`, so a record that once resolved `co2_gwp_fugitives`
from it now fails outright. Separately, 4 C6 Business Travel records cannot be
replayed because their stored inputs lack `No. of Days Travelled`, which the
formula now requires.

**I11 — `payload-builders.js` (348 lines) is unreferenced** except by a barrel
export. Added to the dead-code inventory; **not deleted** per instruction.

---

## 7. Recommended before Phase 1 starts

1. **Decide on I2 (duplicate category ids).** Phase 1 unifies field derivation
   and will resolve categories by identity. Ambiguous name-to-id mapping would
   make that unification non-deterministic. This is a data decision, not a code
   change, and it is yours to make.
2. **Optional: add UI-level E2E coverage for evidence upload and the approval
   workflow.** The current suite is deliberately read-only, so those two write
   paths are only covered structurally. If you want them protected before
   Phase 5 touches the form shell, that is a separate, opt-in write-mode suite.
3. Note that `test_ghg_golden_record_contract.py` pins specific representative
   record ids. If those records are edited through the UI during review, the
   contract test will flag it — that is intended, but re-capture afterwards.

---

## 8. Phase gate

**PHASE 0 is complete and stopped here, as instructed.** Phase 1 (Create-flow
field-derivation extraction) has not been started. The evaluator investigation
requested separately is in `GHG_FRONTEND_EVALUATOR_INVESTIGATION.md`; it is
read-only analysis and changed nothing.
