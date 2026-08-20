# GHG Refactor — PHASE 3 REPORT (C7 safety net only)

Date: June 2026
Gate: **PHASE 3 COMPLETE — STOP.**

## Scope and authoritative path

- This phase added regression protection only. **No C7 production file changed.**
- C7 persistence/aggregation is owned by `backend/modules/emissions/c7_router.py` and its Pydantic contracts in `c7_contracts.py`.
- The authoritative per-employee calculation remains `POST /api/calc-engine/execute-by-category`, called by the existing Create (`EmissionEntryForm.js`) and Edit (`Emissions.js`) C7 handlers. C7's persistence route only stores/sums the resulting employee emissions; it does not calculate them.
- C7 is intentionally not forced into the standard audit-log architecture. Each C7 replay is explicitly `dry_run: true`.

## Files changed

| Type | Files |
|---|---|
| Production | **None** |
| Test fixture | `backend/tests/golden/fixtures/c7_safety_net.json` — 7 sanitized production-shaped fixtures (3 calculation replays + 4 aggregate/structural contracts) |
| Test code | `backend/tests/golden/test_c7_safety_net.py` — 124 lines, 9 test cases, 50 assertions after parametrization |
| Existing fixtures/snapshots | **Unchanged** |

## Coverage

### Numerically protected

Three read-only end-to-end calculator replays lock the formula, decision path, `co2e` result, and output unit:

1. Monthly activity-basis car commuting: distance + days travelled, EF reference `kgCO2e/km`.
2. Monthly supplier-basis bike commuting: supplier activity value + supplied EF.
3. Yearly activity-basis work-from-home: working days + hours, EF reference `kgCO2e/Working Hour`.

Saved aggregation invariants are additionally protected for:

- v2 monthly two-employee air commuting;
- v2 yearly two-employee taxi commuting;
- legacy full-year, two-employee monthly data (12 employee months, persisted monthly totals, yearly total, and record total);
- legacy zero-activity/missing-optional-fields shape.

### Structurally protected

- Canonical C7 category identity: `C7`, `C7 - Employee Commuting`, `scope3`.
- Employee counts, required employee object shapes, monthly/yearly aggregate structures, reporting periods, Scope 3 method/activity identity, and saved total semantics.
- Monthly/yearly C7 Pydantic request and response contracts: required input fields plus `monthly_total` / `yearly_total` response fields.
- No C7 persistence endpoint is referenced by the safety-net test; replays call only the actual calculator endpoint with `dry_run=true`.

## Verification

| Check | Result |
|---|---|
| Dedicated C7 suite | **9 passed** |
| Full backend golden suite | **506 passed / 9 skipped** (497 previous + 9 C7 tests) |
| Frontend full suite | **1,134 passed / 63 unchanged snapshots** |
| Existing Phase 1 equivalence | **785 assertions / 0 differences** |
| Independent read-only QA | Passed: dry-run only, fixture coverage confirmed, Scope 3 C7 rows visible |
| Database before/after | `emission_records=840`, `ce_calculation_audit_logs=1339`, `emission_history=1763` — **unchanged** |
| Mocked APIs | **NONE** |

## Uncovered paths and risks

1. Some historical activity-basis C7 records no longer contain the complete input set required by today's calculation configuration. They are retained as structural evidence, not replay fixtures; no attempt was made to repair or reinterpret them.
2. Fixture coverage represents activity, supplier, WFH, multi-employee, legacy, full-year, partial-period/monthly, and zero-activity shapes. It does not exhaustively replay every historical transport activity/factor combination among the 98 current C7 records.
3. The calculator replays depend on current approved factor/configuration records. A deliberate factor/configuration update will correctly fail these frozen expected outputs and requires an explicit, reviewed fixture-baseline update.

## Stop gate

No C7 refactor, calculation/UI/persistence/validation change, inflation work, capability work, cleanup, evaluator removal, or Phase 4 work was started.