# EmissionEntryForm.js Hook Integration — Migration Plan

**Goal**: Reduce `/app/frontend/src/components/EmissionEntryForm.js` from **4091 → ~800 lines** by integrating the already-extracted hooks, constants, and utilities under `/app/frontend/src/modules/ghg/emissions/shared/`.

**Status (Feb 22, 2026)**: Plan documented. First safe step shipped (MONTHS constants, ~30 lines saved). Full integration deferred to a dedicated focused session.

---

## Why Defer?

- 79 inline `useState` / `useEffect` calls — risk surface is enormous.
- 4 form steps × Scope 1/2/3 × 16 categories × monthly+yearly = ~768 distinct flow paths.
- `handleSubmit` orchestrator already uses `categoryRegistry.get(...)` dispatch (Phase 7l) — that dispatch is what makes a clean hook integration possible, but every reference to the 60+ state setters has to be re-wired.
- A regression in this form blocks ALL emission data entry — the highest-impact form in the app.
- Recommended: dedicate a single session with full Playwright coverage at the end (not a side-task).

---

## Already Built (Just Not Yet Wired)

| Module | Lines | Status |
|---|---|---|
| `hooks/useEmissionFormState.js` | 289 | Built, NOT used |
| `hooks/useEmissionFormEffects.js` | ~180 | Built, NOT used |
| `constants/emission-form-constants.js` | 158 | Partially used (MONTHS shipped) |
| `components/DynamicFieldRenderer.js` | ~200 | Built, NOT used |
| `utils/validation.js` | ~300 | Built, NOT used |
| `utils/payload-builders.js` | ~270 | Used inside category modules, NOT in this form's `handleSubmit` |
| `components/steps/Step1-4*.js` | ~1900 | **USED** (Phase 5) |

---

## Step-by-Step Plan (per session)

### Phase F1: Constants (LOW RISK — DONE Feb 22, 2026)
- ✅ Move `MONTHS`, `CALENDAR_YEAR_MONTHS`, `FINANCIAL_YEAR_MONTHS` to shared constants
- ✅ Replace inline definitions with imports
- 30 lines saved

### Phase F2: useEmissionFormState integration (MEDIUM RISK)
1. At top of `EmissionEntryForm`: replace ~60 inline `useState` blocks with one destructure:
   ```js
   const formState = useEmissionFormState({ organization, editingEmission });
   const {
     facilityId, setFacilityId, scope, setScope, category, setCategory,
     // ... ~60 fields
   } = formState;
   ```
2. Run app, verify form opens for create + edit.
3. Test save flow on Scope 1 Stationary Diesel monthly (lowest-risk path).
4. Expected line reduction: ~280 lines.

### Phase F3: useEmissionFormEffects integration (MEDIUM RISK)
1. Replace 8-10 inline `useEffect` blocks (data fetching, scope changes, category changes, biogenic resets) with the extracted hook.
2. Test all scope-switch edge cases (Scope 1 ↔ Scope 2 ↔ Scope 3 ↔ biogenic).
3. Watch out for the recurring P1 bug: "Scope Change Recalculation — `setFuelId('')` wipes fuel state". The extracted hook should preserve current behaviour byte-identically.
4. Expected reduction: ~180 lines.

### Phase F4: validation.js + payload-builders.js integration (HIGH RISK)
1. Replace inline validation in `handleSubmit` (Step 1/2/3 validators) with `validateStep1`, `validateStep2`, `validateStep3` from utils/validation.js.
2. Replace inline payload building tail with `buildCreatePayload(...)` from utils/payload-builders.js. Note: most categories already use `module.buildCreatePayload(...)` from `categoryRegistry` — this step is for the few that fall through to the legacy path.
3. Test ALL category dispatches via testing_agent_v3_fork (Scope 1 × 4 + Scope 2 × 1 + Scope 3 C1–C15 × 16 + biogenic × 2 = 23 paths × monthly + yearly).
4. Expected reduction: ~600 lines.

### Phase F5: DynamicFieldRenderer integration + final cleanup (LOW RISK)
1. Replace inline dynamic-field JSX with `<DynamicFieldRenderer />` (already done for Scope 3 in Phase 7e — extend to Scope 1 / 2).
2. Delete dead helpers below `handleSubmit` (legacy fallbacks Phases 7g–7l already trimmed most of this).
3. Final reduction: ~200 lines.

### Final Target
| Phase | Lines Removed | Lines After |
|---|---|---|
| F1 (DONE) | 30 | 4091 |
| F2 | 280 | ~3811 |
| F3 | 180 | ~3631 |
| F4 | 600 | ~3031 |
| F5 | 200 | ~2831 |
| F6 (lift remaining handlers into category modules) | ~2000 | **~830** |

---

## Critical Don't-Break Rules

- **Calc-engine signature** — every `module.buildCreatePayload(ctx)` call must produce the SAME payload byte-for-byte.
- **Audit logger persistence** — every save still must call `persistCalcAuditLog(...)`. Currently lives in `handleSubmit` at the top.
- **C7 multi-employee branch** — has its own dedicated dispatch (`module.create`). Don't touch.
- **Process Emissions yearly** — has inline template-driven logic. Defer.
- **Override justification min-length 20** — preserved in current `module.validateCreateSubmission`.

---

## Test Protocol Before Declaring Done

1. `lint_javascript` — must pass.
2. Boot contract verifier — must log `PASSED — 18+ modules checked`.
3. Manual smoke (Playwright):
   - Create Scope 1 Stationary Diesel monthly → POST /emissions 200, total_emissions matches calc-engine output.
   - Create Scope 3 C2 Capital Goods Spend Based monthly → POST 200.
   - Create Scope 3 C7 Employee Commuting yearly → POST /emissions/c7/yearly 200.
   - Edit each of the above → PUT 200 with field_changes populated.
4. `testing_agent_v3_fork` regression on all 23 category × frequency paths.

---

## Open Questions for Next Session

- Do we keep the form file as a single 800-line orchestrator, or split into `EmissionEntryForm.jsx` + `EmissionEntryFormContainer.jsx` (data) + `EmissionEntryFormUI.jsx` (presentation)?
- Should the `handleSubmit` POST tail also move into the category modules (so the form does NOT call `axios.post` directly)? Cleaner architecturally but requires module-level access to `getAuthHeader`.
