# CREATE-Flow Migration Plan

**Status**: Scoping
**Author**: E1 (Feb 2026)
**Goal**: Apply the same module/registry pattern used for EDIT flows
(`/modules/emissions/`) to the CREATE flow in
`/components/EmissionEntryForm.js` (~4500 lines, 5 separate POST sites).

---

## Current Pain Points

* `EmissionEntryForm.js handleSubmit` is **~990 lines** spanning scope-branching
  validation + 5 different `axios.post('/api/emissions')` sites (C7 yearly,
  C7 monthly, monthly-flat, biogenic, scope1/2 fallback).
* Adding a new category-specific CREATE flow (e.g. CBAM, C7 quick-setup with
  CSV import) requires editing the host page — exactly the coupling the EDIT
  migration eliminated.
* Validation logic is duplicated between CREATE and EDIT.

---

## Target Architecture

Mirror the EDIT migration:

```
module = categoryRegistry.get(...)
module.validateCreateSubmission(ctx) -> { valid, errorMessage }
module.buildCreatePayload(ctx)       -> POST payload
module.Step3Renderer                 -> already wired (Phase 7k)
```

Plus optional per-category CREATE wizards:

```
module.CreateWizard                  -> custom component for category-specific UX
```

`EmissionEntryForm.handleSubmit` becomes a thin dispatcher:

```js
const mod = categoryRegistry.get(...);
const { valid, errorMessage } = mod.validateCreateSubmission(ctx);
if (!valid) { toast.error(errorMessage); return; }
const payload = mod.buildCreatePayload(ctx);
await axios.post(`${API}/emissions`, payload, ...);
```

---

## Migration Phases

### Phase A — Contract (foundation)
**Files**: `/modules/emissions/core/CategoryModuleInterface.js`
* Add `validateCreateSubmission(ctx)` and `buildCreatePayload(ctx)` to the
  module interface as optional methods.
* Document expected `ctx` keys (frequencyType, monthlyData, yearlyData,
  reportingYear, etc.).

### Phase B — Shared Helpers
**Files**:
* `/modules/emissions/categories/shared/Scope3FlatCreate.js`
* `/modules/emissions/categories/shared/Scope1Create.js`

Mirror the existing `Scope*Edit.js` files. The CREATE payload differs from
EDIT (no `editingEmission`, has `frequencyType` driver, builds multiple
records per month).

### Phase C — C1 PoC
**Files**: `/categories/C1PurchasedGoods/create.js` (proxy)
* Attach `validateCreateSubmission` + `buildCreatePayload` to C1 via factory.
* In `EmissionEntryForm.handleSubmit`, add a C1-only short-circuit before
  the legacy block (same pattern used during EDIT migration).
* Regression test C1 CREATE.

### Phase D — Flat Scope 3 Rollout
* Attach shared helpers to C1–C6, C8–C15 (one-line each).
* Extend the short-circuit to dispatch any flat-field Scope 3 category.
* Regression test 2–3 categories.

### Phase E — Scope 1 + Scope 2 Migration
* Reuse `Scope1Create.js` for both (same payload shape, just like EDIT).
* Add Scope 1 / Scope 2 dispatch in `handleSubmit`.

### Phase F — Biogenic + C7
* Biogenic-scope3 → generic Scope 3 fallback.
* Biogenic-scope1 → generic Scope 1 fallback.
* C7 multi-employee yearly + monthly → dedicated `C7Create.js`.

### Phase G — Legacy Block Deletion
* After all paths route through module dispatch, delete the legacy
  validation + payload construction (~900 lines).
* Add defensive fallback `toast.error` for any unmatched category.

### Phase H — Per-Category CREATE Wizards (optional, future)
* `module.CreateWizard` overrides the entire 4-step flow for categories
  that need custom UX (e.g. CBAM, C7 CSV import).
* `EmissionEntryForm` becomes a thin frame that renders
  `activeModule.CreateWizard ?? defaultWizard`.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| CREATE payload divergence per scope (frequency, monthly vs yearly) | Helpers accept a `frequencyType` flag and return either a single payload or an array of monthly payloads — keep behaviour identical to legacy. |
| `setMonthlyData` / `setYearlyData` state mutations spread throughout legacy | Move all calc-engine output-reading + state-derived inputs into the helper's `ctx` (caller passes pre-extracted values, helper is pure). |
| C7's multi-employee flow has dozens of derived state vars | Migrate C7 last with its own dedicated `C7Create.js`. |
| Regression bugs | Ship one scope at a time + testing-agent regression after each. |

---

## Estimated Effort

* Phase A + B: 1 session (contract + shared helpers).
* Phase C: 1 session (C1 PoC + test).
* Phase D: 1 session (rollout + test).
* Phase E: 1 session (Scope 1 + 2 + test).
* Phase F: 1–2 sessions (biogenic straightforward, C7 complex).
* Phase G: 0.5 session (cleanup).
* Phase H: future, on-demand.

**Total**: 5–6 focused sessions to fully migrate CREATE.

---

## Comparison to EDIT Migration

The EDIT migration took **Phases 7a–7j** (10 phases) and dropped
`Emissions.js` from 7144 → 6672 lines. The CREATE migration is similarly
shaped but:
* `EmissionEntryForm.js` is smaller (4508 vs. 7144) → faster.
* CREATE has fewer subtle hydration bugs (no `handleEdit` state restoration).
* Step3Renderer already wired (Phase 7k) — no new UI work needed.

Expected outcome: `EmissionEntryForm.js` drops to ~3500 lines, the legacy
handleSubmit branch tree disappears, per-category CREATE wizards become
a one-line registry assignment.
