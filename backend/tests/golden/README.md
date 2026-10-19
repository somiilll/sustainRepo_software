# GHG Golden Safety Net (Phase 0)

Purpose: prove that the GHG Add/Edit refactor does not change any calculation
result, formula selection, form configuration or persisted record shape.

**Everything here is read-only.** Calculation replays always send
`dry_run=true`, so no `ce_calculation_audit_logs` row, emission record or
reference-data document is ever written.

## Run

```bash
bash /app/backend/tests/golden/run_ghg_golden.sh
```

Or individually:

```bash
cd /app/backend  && python3 -m pytest tests/golden -q
cd /app/frontend && CI=true npx react-scripts test --watchAll=false --testPathPattern="golden"
```

## Regenerate baselines

Only when a change to reference data or contracts is **intentional**:

```bash
cd /app/backend && python3 tests/golden/capture_ghg_baseline.py
cd /app/backend && python3 tests/golden/export_hydrate_fixtures.py
cd /app/frontend && CI=true npx react-scripts test --watchAll=false \
  --testPathPattern="hydrateEmissionForm.golden" -u
```

Never regenerate to make a red suite green during a refactor that is supposed
to be behaviour-neutral — a diff there is the signal, not the noise.

## What each guard locks

| File | Locks |
|---|---|
| `test_ghg_golden_calculation.py` | Calc engine in isolation: formula + inputs + context + overrides -> outputs. Unit conversion, property/EF resolution, GWP, transformations. |
| `test_ghg_golden_live_endpoint.py` | `POST /api/calc-engine/execute-by-category` end to end, including router enrichment (`scope3_ef_id` context, fugitive GWP injection, spend-basis currency resolution) and the decision path returned to the UI. |
| `test_ghg_golden_formula_selection.py` | Every decision-tree leaf (path -> formula id) and that each stored record still resolves to the same formula. |
| `test_ghg_golden_form_config.py` | `GET /api/calc-engine/form-config/{id}` for all active categories: mappings, order, units, unit sources, decision fields, formulas. This is the sole input to the duplicated `dynamicInputFields` derivation. |
| `test_ghg_golden_record_contract.py` | Persisted record contract per behaviour bucket + the C7 multi-employee aggregation shape. |
| `test_ghg_golden_api_contract.py` | `EmissionRecordCreate` / `EmissionRecordResponse` / `EmissionHistoryResponse` field names and types. |
| `units.golden.test.js` | `unitsMatch`, `isVolumeUnit`, conversion-factor lookup and its fallbacks. |
| `unitHelpers.golden.test.js` | Unit dimensions and the density-required rules per methodology. |
| `validation.golden.test.js` | Every step gate and every user-visible validation message. |
| `hydrateEmissionForm.golden.test.js` | Edit-mode hydration, snapshot-locked against 63 real records. |
| `customFuelCalcAdapter.golden.test.js` | Custom-fuel input assembly and its unit maths (tCO2->kgCO2, MJ->TJ). |

## Known pre-existing inconsistencies

See `baselines/ghg_known_inconsistencies.json`. They are recorded, not fixed —
per the refactor rule that existing business behaviour must not change silently.
