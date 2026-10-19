# GHG Refactor — Phase 2 Edit Baseline

Date: June 2026

## Frozen pre-change source

- `frontend/src/pages/Emissions.js`, prior to the Phase 2 patch
- SHA-256: `83c08f0ffcf868c07e958c45c22ec9ae767fc7e946f805a769c61f6b20945f19`
- Extracted derivation region: former lines 396–671 (286 numbered baseline lines including surrounding context)

## Existing Edit behaviour retained outside derivation

- `hydrateEmissionForm` remains the record-to-form-state adapter. Its 63 real-record snapshots cover periods, Scope 1/2/3/Biogenic state, existing values and units, Scope 3 choices, custom fuel values, C7 employee values, evidence URLs, facility data, and historical records.
- `editEmissionDispatch` remains responsible for applying hydrated state, retaining evidence filenames, approval-related record state, opening the dialog, and clearing stale session data.
- Dynamic-value hydration remains in `Emissions.js`: saved values/units, legacy field aliases, override checkboxes, audit-log fallback, custom-fuel aliases, and legacy Process Type recovery were not moved.
- Evidence, attachments, approval, reporting periods, facility/source fields, payload construction, calculation calls, formula evaluator, C7, emission factors, unit conversion, and backend contracts are untouched.

## Derivation comparison before Phase 2

| Concern | Create / shared Phase 1 | Legacy Edit | Phase 2 treatment |
|---|---|---|---|
| Config resolution | `resolveGhgConfig` | Direct `editFormConfig` | Edit now calls `resolveGhgConfig` with no overrides; identity is preserved. |
| Category resolution | Canonical `(code, scope_code)` first, name fallback | Display name + scope only | Edit now resolves through `resolveGhgFormContext`. Stored legacy records do not include a category code, so the resolver's existing fallback maps their display name once within the effective scope. The resolved definition thereafter carries canonical code + scope. |
| Scope 3 decision tree | Shared traversal | Local recursive traversal | Shared traversal only. |
| Scope 3 legacy fallback | Activity then method | Subcategory, activity, compatible saved formula, then method; accepted `spend_based` | These compatibility fallbacks now live in the shared resolver, activated only from explicit context. |
| Scope 1/2/Biogenic fallback | Shared decision tree and standard fallback | Local tree then saved formula, then older generic fallback | The saved formula is now explicit shared context for initial hydration. Subsequent user category/method changes resolve through the same canonical shared path as Create, avoiding stale formulas. |
| Field filtering and ordering | Shared mapping filter + display order | Local copy | Shared only. |
| Custom fuel suppression | Shared context | Local copy | Shared only. |
| `isOverrideExplicitlyFalse` metadata | Not produced | Local output-only metadata | No production consumer exists. It did not affect rendering, validation, calculations, or payloads, so it is intentionally not retained as an Edit-only derivation branch. |

## Baseline regression gates

- Phase 1 shared derivation equivalence: 785 assertions across 24 categories, 158 reachable paths, four fuel variants, and Biogenic Scope 3.
- Hydration golden snapshots: 63 snapshots from real stored records.
- New Edit-focused suite: canonical category identity, every active decision path with saved-formula hydration, method-change stale-formula protection, and custom-fuel field suppression.
- The existing golden suites are read-only. No fixture recapture or snapshot update is permitted during Phase 2.

## Read-only live-calculation guard

- Independent read-only QA initially exposed a legacy `400` request to `POST /api/calc-engine/execute-by-category` while an existing record was still hydrating.
- The Phase 2 refactor did not change that effect (the pre- and post-refactor effect block SHA-256 was identical: `945b033c2783e649a6c839c93c05f4f44a8b6edccf257952709818e960138a5c`).
- A narrow Edit hydration guard now avoids recalculation until the user makes an edit. The persisted audit result remains displayed for inspection, and calculation logic/API payloads remain unchanged.
- Live read-only retest: a saved Scope 1 custom-fuel record opened with its saved fields intact and **no** `execute-by-category` request in the browser console.