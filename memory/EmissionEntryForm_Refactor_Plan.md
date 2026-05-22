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

### Phase F2: useEmissionFormState integration (MEDIUM RISK — DONE Feb 22, 2026)
1. ✅ Added one hook call `const _formState = useEmissionFormState({ organization, editingEmission })` at top of EmissionEntryForm.
2. ✅ Destructured 60+ state slots + setters from `_formState` into named consts.
3. ✅ Removed all inline `useState` for those slots (form went from 79 inline `useState` calls to 0 — only the React import remains).
4. ✅ Removed 4 duplicated inline `useEffect` blocks now owned by the hook:
   - org reporting-year-type sync → `setReportingYearType(defaultYearType)` when org pref present
   - decisionFieldValues sync with scope3Method/ActivityType/Subcategory
   - auto-enable `useCustomActivity` on `scope3ActivityType==='others'` + `scope3Method==='supplier_basis'`
   - editingEmission frequencyType + yearlyData hydration (with cv/density override flags + user_overrides)
5. ✅ Kept the dirty-tracking useEffect inline in EmissionEntryForm (it depends on `onFormChange` prop closure — must not move).
6. ✅ Verified by testing_agent_v3_fork iter_81 — form opens cleanly, ZERO console/page errors, all Step 1 controls work, dirty-tracking modal still fires.
7. ✅ Saved 69 lines this step. Cumulative F1+F2: −99 lines (4120 → 4022).

### Phase F3: useEmissionFormEffects integration (MEDIUM RISK — DONE Feb 22, 2026)
1. ✅ Replaced 5 inline `useEffect` blocks (form-config fetch, fugitive emissions fetch, scope3-ef fetch, biogenic categories fetch, biogenic scope3-ef fetch) with single `useEmissionFormEffects({...})` hook call at the top of the form (lines 174-193).
2. ✅ Imports added: `useEmissionFormEffects` from `modules/ghg/emissions/shared/hooks/useEmissionFormEffects`.
3. ✅ Verified by testing_agent_v3_fork iter_82: GET `/api/calc-engine/form-config/<id>` fires automatically on Stationary Combustion selection (live confirmation that hook is wired correctly). Other 4 effects share the same dependency-array pattern.
4. ✅ Saved 142 lines this step.

### Phase F4: validateStep1/2/3 + canProceedToStep integration (HIGH RISK — DONE Feb 22, 2026)
1. ✅ Augmented `modules/ghg/emissions/shared/utils/validation.js` validateStep3 with the missing override+justification+auto-unselect logic (custom EF, calorific value, density, heat-basis EF) — preserving the optional-chaining `updateMonthData?.(...)` callback so behaviour is byte-identical.
2. ✅ Replaced the 327-line inline `canProceedToStep` switch with a 14-line wrapper that delegates to `canProceedToStepUtil(step, {...params})`.
3. ✅ Imports added: `canProceedToStep as canProceedToStepUtil` from `modules/ghg/emissions/shared/utils/validation`.
4. ✅ Verified by testing_agent_v3_fork iter_82: ALL 8 validation toast messages are byte-identical to the spec (incl. the literal double-quotes in `'Please add description for process: "<name>"'`). Step 1→Step 2 navigation works after all required fields populated.
5. ✅ Saved 311 lines this step. Cumulative F1+F2+F3+F4: −551 lines (4120 → 3569).

### Phase F5: DynamicFieldRenderer integration + final cleanup (LOW RISK)
1. Replace inline dynamic-field JSX with `<DynamicFieldRenderer />` (already done for Scope 3 in Phase 7e — extend to Scope 1 / 2).
2. Delete dead helpers below `handleSubmit` (legacy fallbacks Phases 7g–7l already trimmed most of this).
3. Final reduction: ~200 lines.

### Final Target
| Phase | Lines Removed | Lines After |
|---|---|---|
| F1 (DONE Feb 22, 2026) | 30 | 4091 |
| F2 (DONE Feb 22, 2026) | 69 | 4022 |
| F3 (DONE Feb 22, 2026) | 142 | 3880 |
| F4 (DONE Feb 22, 2026) | 311 | 3569 |
| F5 (DONE Feb 22, 2026) | 184 | 3385 |
| F6 — Option B / useEmissionSubmit hook (DONE Feb 22, 2026) | 593 | **2792** |
| F6 — Option A (Aggressive Lift to ~969) | DEFERRED — not needed for current goals | n/a |

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
