# GHG Regression Coverage Dashboard

Generated: June 2026, from the Phase 0 baselines. Read-only.

Legend:
- **Calc** — engine replay fixtures (`test_ghg_golden_calculation.py`)
- **E-b-C** — live `execute-by-category` fixtures (`test_ghg_golden_live_endpoint.py`)
- **Sel** — formula-selection fixtures (`test_ghg_golden_formula_selection.py`)
- **FCfg** — form-config snapshot (`test_ghg_golden_form_config.py`)
- Record contract (`test_ghg_golden_record_contract.py`) covers **all 114 buckets / 840 records**, so every row below is at least structurally protected.

Status definitions:
- **FULL** — calculation replay + live endpoint + formula selection + form config
- **STRUCTURAL** — record contract (+ validation/UI guards) only; no calculation replay possible
- **PARTIAL** — engine replay but no live-endpoint or no selection coverage
- **NONE** — no form config exists for the category at all (legacy names)

| Scope | Category | Records | Calc | E-b-C | Sel | FCfg | Status | Risk / note |
|---|---|---|---:|---:|---:|---:|:--:|---|
| scope1 | Stationary Combustion | 112 | 6 | 6 | 8 | Y | **FULL** | all 3 methodologies + custom fuel |
| scope1 | Mobile Combustion | 81 | 3 | 3 | 4 | Y | **FULL** | |
| scope1 | Fugitive Emissions | 57 | 2 | 2 | 5 | Y | **FULL** | 1 record unreplayable — `HFC-134a` deleted from `fuel_database` |
| scope1 | Process Emissions | 2 | 2 | 2 | 2 | Y | **FULL** | both `venting` and `ch4_overall_combustion` |
| scope1 | Flaring (Stationary Combustion) | 2 | 2 | 2 | 2 | Y | **FULL** | standard + custom fuel |
| scope2 | Purchased Electricity | 82 | 5 | 5 | 6 | Y | **FULL** | |
| scope2 | Purchased Steam/Heat | 8 | 1 | 1 | 3 | Y | **FULL** | thin — 1 calc fixture |
| scope2 | `Scope 2` (non-canonical scope value) | 1 | 0 | 0 | 0 | Y | **STRUCTURAL** | I3 — malformed scope string |
| biogenic | Stationary Combustion | 22 | 4 | 4 | 4 | Y | **FULL** | own Biogenic heat-basis formula |
| biogenic | Mobile Combustion | 2 | 1 | 1 | 1 | Y | **FULL** | |
| biogenic | C8 - Upstream Leased Assets | 9 | 1 | 0 | 0 | Y | **PARTIAL** | engine only |
| biogenic | C10 - Processing of Sold Products | 3 | 1 | 0 | 0 | Y | **PARTIAL** | engine only |
| biogenic | C11 - Use of Sold Products | 2 | 1 | 0 | 0 | Y | **PARTIAL** | engine only |
| biogenic | C13 - Downstream Leased Assets | 6 | 0 | 0 | 0 | Y | **STRUCTURAL** | no audit log on any record |
| biogenic | C14 - Franchises | 1 | 0 | 0 | 0 | Y | **STRUCTURAL** | |
| biogenic | C3 - Fuel and Energy Related Activities | 6 | 0 | 0 | 0 | Y | **STRUCTURAL** | |
| scope3 | C1 - Purchased Goods and Services | 56 | 7 | 7 | 7 | Y | **FULL** | activity + spend + supplier |
| scope3 | C2 - Capital Goods | 28 | 8 | 8 | 8 | Y | **FULL** | ⚠ 1 spend fixture in the inflation discrepancy |
| scope3 | C3 - Fuel and Energy Related Activities | 20 | 6 | 6 | 6 | Y | **FULL** | |
| scope3 | C4 - Upstream Transportation and Distribution | 22 | 4 | 4 | 4 | Y | **FULL** | ⚠ 2 spend fixtures in the inflation discrepancy |
| scope3 | C5 - Waste Generated in Operations | 13 | 3 | 3 | 3 | Y | **FULL** | |
| scope3 | C6 - Business Travel | 44 | 7 | 3 | 3 | Y | **PARTIAL** | 4 records unreplayable (missing `No. of Days Travelled`); airport/flight fields not calculation-covered |
| scope3 | **C7 - Employee Commuting** | 94 | **0** | **0** | **0** | Y | **STRUCTURAL ONLY** | **no calculation audit log exists by design** — per-employee inputs do not fit the `execute-by-category` contract, so nothing can be replayed. Protected by the `employees[]` / `monthly_totals` / `yearly_total` contract test and the C7 step-3 validation tests. **Highest-risk category in the refactor.** |
| scope3 | C8 - Upstream Leased Assets | 41 | 7 | 0 | 0 | Y | **PARTIAL** | engine only — `subcategory_selection` decision inputs not reconstructible |
| scope3 | C9 - Downstream Transportation and Distribution | 23 | 7 | 7 | 7 | Y | **FULL** | ⚠ 1 spend fixture in the inflation discrepancy |
| scope3 | C10 - Processing of Sold Products | 27 | 2 | 2 | 2 | Y | **FULL** | |
| scope3 | C11 - Use of Sold Products | 21 | 3 | 1 | 3 | Y | **PARTIAL** | both `type_of_product` branches selection-covered |
| scope3 | C12 - End-of-Life Treatment | 1 | 1 | 1 | 1 | Y | **FULL** | single record |
| scope3 | C13 - Downstream Leased Assets | 5 | 2 | 2 | 2 | Y | **FULL** | |
| scope3 | C14 - Franchises | 1 | 1 | 0 | 0 | Y | **PARTIAL** | engine only |
| scope3 | C15 - Investments | 8 | 2 | 2 | 2 | Y | **FULL** | supplier basis only |
| scope3 | Purchased Goods and Services *(legacy)* | 16 | 0 | 0 | 0 | **N** | **NONE** | I5 — uncoded name, no category row, no form config, no formula |
| scope3 | Capital Goods *(legacy)* | 5 | 0 | 0 | 0 | **N** | **NONE** | I5 |
| scope3 | Upstream Transportation and Distribution *(legacy)* | 6 | 0 | 0 | 0 | **N** | **NONE** | I5 |
| scope3 | Downstream Transportation and Distribution *(legacy)* | 3 | 0 | 0 | 0 | **N** | **NONE** | I5 |
| scope3 | Employee Commuting *(legacy)* | 4 | 0 | 0 | 0 | **N** | **NONE** | I5 |
| scope3 | Business Travel *(legacy)* | 4 | 0 | 0 | 0 | **N** | **NONE** | I5 |
| scope3 | Waste Generated in Operations *(legacy)* | 2 | 0 | 0 | 0 | **N** | **NONE** | I5 |

## Roll-up

| Status | Categories | Records | Share of records |
|---|---:|---:|---:|
| FULL | 19 | 495 | 59 % |
| PARTIAL | 7 | 111 | 13 % |
| STRUCTURAL only | 7 | 135 | 16 % |
| NONE (legacy, no config) | 7 | 40 | 5 % |
| *(C7 counted in STRUCTURAL)* | | | |

Remaining ~7 % sits in buckets whose representative record is covered by the
record-contract test but whose scope/category pair appears above under another row.

## Cross-cutting coverage (not category-specific)

| Concern | Guard | Status |
|---|---|---|
| Unit conversion + compound units | engine replay (transitive) + `units.golden.test.js` | FULL |
| Density-required rules per methodology | `unitHelpers.golden.test.js` | FULL |
| Emission-factor resolution (`fuel_database`, `scope3_ef`) | engine replay + `applied_factors` | FULL |
| GWP resolution | engine replay | FULL |
| Formula selection | 22 trees / 134 leaves enumerated exhaustively | FULL |
| Field derivation input (`form-config`) | all 24 active categories | FULL |
| Step validation + every message string | `validation.golden.test.js` | FULL |
| Edit-mode hydration | 63 real-record snapshots | FULL |
| Custom-fuel input assembly + unit maths | `customFuelCalcAdapter.golden.test.js` | FULL |
| Persisted record contract | all 114 buckets | FULL |
| API contract (3 Pydantic models) | field names + types | FULL |
| **Evidence upload** | `evidence_url` presence per bucket only | **STRUCTURAL** — write path, deliberately not exercised |
| **Approval workflow** | approval fields in the API contract only | **STRUCTURAL** — write path, deliberately not exercised |
| **Spend-basis inflation / PPP** | both paths pinned independently | **CONFLICTED** — 4 fixtures where the two baselines disagree; see `GHG_INFLATION_RECONCILIATION.md` |
| C6 airport / flight distance fields | not covered | **NOT PROTECTED** — added recently; no calculation fixture exercises `from_airport` / `to_airport` / `flight_distance` |

## What to watch during Phase 1

1. **C7 Employee Commuting** — 94 records, zero calculation coverage. Any Phase 1
   change that touches the C7 branch is unverifiable by the current suite. Phase 1
   should avoid C7 entirely, or C7 needs its own E2E test first.
2. **Legacy uncoded Scope 3 categories** — 40 records with no category row and no
   form config. Phase 1's unified field derivation will return an empty field list
   for them, exactly as today. Confirm that is acceptable rather than a silent
   regression.
3. **C6 airport fields** — not calculation-protected. Do not restructure the C6
   Step 3 renderer in Phase 1.
4. **Evidence and approval** — structural only. Phase 1 does not touch them; keep
   it that way until they have real coverage.
