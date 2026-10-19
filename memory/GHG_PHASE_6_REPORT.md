# GHG Phase 6 — Unified Form State & Record Adapters

**Completed:** 2026-08-18  
**Scope:** Edit-flow state boundary only. Create and edit remain separate flows.

## Outcome

Phase 6 introduces a shared, JSDoc-defined `EmissionDraft` for values that a
user edits or that persist with an emission. `Emissions.js` now owns one draft
state object for those values, and `EmissionEditForm.jsx` receives that draft
plus one draft-change callback instead of receiving the main set of individual
edit-value props and setters.

No backend calculation, API contract, persistence schema, historical record,
evidence contract, or C7 payload behavior was changed.

## 6A — Read-only state inventory

### State still owned by the page because it is UI/workflow state

| Group | Values | Reason |
| --- | --- | --- |
| Dialog/workflow | `dialogOpen`, `isEditLoading`, `isSaving`, `isFormDirty`, `showUnsavedChangesDialog`, `pendingCloseAction` | Visibility, transitions, and protection from losing unsaved work. |
| Route and list UI | `activeScope`, filters, search, sorting, bulk delete confirmation, delete target | Not emission form values. |
| History/evidence UI | `historyDialogOpen`, `selectedEmissionHistory`, `uploadedEvidence` | Dialog/upload presentation state. Persisted existing evidences are in the draft. |
| Calculation presentation | calculator-hook results, `emissionAuditLog`, `isCalculating`, `useBackendCalc` | Derived/preview/audit state, not user-entered record data. |
| OCR workflow | `ocrPrefillData` | Import workflow metadata, not an edit-record value. |

### State remaining page-owned because it is fetched/reference data

| Group | Values | Reason |
| --- | --- | --- |
| Form configuration | `editFormConfig`, `editFormConfigLoading`, `dynamicInputFields` | Server/configuration data used to derive fields. |
| Scope 3 lookups | `scope3EFData`, `fugitiveEmissionsData`, `loadingScope3EF` | Reference lists and request state. |
| Biogenic lookup | `biogenicCategories`, `loadingBiogenicCategories` | Reference list and request state. |
| Core data | facilities, fuels, categories, scopes, units, organization and access data | Read-only inputs to the form, supplied by existing hooks. |

### State migrated into `EmissionDraft`

| Domain area | Draft fields | Main readers/writers |
| --- | --- | --- |
| Common record values | `values` | Edit form controls; calculation preview; module validators/payload builders through the existing compatibility boundary. |
| Frequency and period mode | `frequencyType` | Edit form reporting display, C7 behavior, edit payload builders. |
| Category and scope selections | `selectedCategory`, `biogenicScopeSelection` | GHG context/config resolution and the edit renderer. |
| Scope 3 choices | `scope3Method`, `scope3ActivityId`, `scope3ActivityType`, `scope3Subcategory`, `typeOfProduct`, `scope3CustomActivity`, `useCustomActivity` | Scope 3 selectors, calculation preview, module payload builders. |
| Scope 1 method/custom fuel | `calculationMethodology`, `processType`, `useCustomFuel`, `customFuelName` | Edit renderer, context resolution, custom-fuel calculation adapter. |
| Dynamic inputs | `dynamicFieldValues` | Dynamic field controls, calculation preview, audit hydration, module payload builders. |
| Overrides | `overrideCalorificValue`, `overrideDensity`, `overrideEmissionFactorHeat`, `overrideJustification` | Legacy/manual override controls and validation. |
| C7 values | `employees`, `employeeMonthlyTotals`, `employeeYearlyTotal`, `c7Month` | Multi-employee UI and C7 module-owned validation/payload construction. |
| Existing evidence values | `existingEvidences` | Evidence list and existing-evidence handlers. |

## 6B–6R — Implementation

### Shared domain model

Added `frontend/src/modules/ghg/emissions/shared/domain/emissionDraft.js`:

- JSDoc `EmissionDraft` interface, explicitly limited to actual form/persisted
  values.
- `createEmptyEmissionDraft` and `createEmptyEmissionValues` for a consistent
  clean edit state.
- Pure immutable update helpers for whole record values and individual draft
  fields.

### Pure record adapters

Added `frontend/src/modules/ghg/emissions/shared/domain/recordAdapters.js`:

- `emissionRecordToDraft(record, lookups)` maps existing stored-record shapes
  into `EmissionDraft`, using the established pure historical hydration logic
  as the compatibility oracle.
- `emissionDraftToRecordValues(draft)` maps draft values back to existing
  record names without sending a payload or changing serializers.
- The active module payload builders remain the sole owners of final save
  payload construction. This intentionally preserves API and C7 semantics.

### Edit-flow migration

- `Emissions.js` replaces the individual edit-domain `useState` hooks with a
  single `editDraft` source of truth.
- Existing `formData`/setter call sites remain a temporary compatibility view
  over `editDraft.values`; there is no second form-value state object.
- `editEmissionDispatch` now hydrates once through `emissionRecordToDraft` and
  applies the draft atomically before opening the dialog.
- `EmissionEditForm.jsx` consumes `draft` and `onDraftChange`; its internal
  compatibility setters update the shared draft, not page-local form state.
- The edit-form call boundary no longer passes the former individual domain
  values/setters; UI controls and page-derived data remain explicit props.

## Safety and non-goals

- Create and edit forms were **not** merged (Phase 7 was not started).
- Backend GHG engine code, DB collections, endpoint signatures, dry-run
  behavior, calculation rules, evidence semantics, historical values, and C7
  serialization were not modified.
- The known missing-units issue was intentionally not touched.
- The BRSR year-switch issue and other backlog items were not touched.

## Verification

### Automated

| Check | Before | After |
| --- | --- | --- |
| Frontend `yarn test --watchAll=false` | 1226 passed / 63 snapshots | **1228 passed / 63 snapshots** |
| Backend golden `PYTHONPATH=/app/backend pytest /app/backend/tests/golden/` | 506 passed / 9 skipped | **506 passed / 9 skipped** |
| New adapter coverage | N/A | **2 focused tests passed** |

### Browser verification

- Admin login, `/ghg/scope1`, opening a persisted Scope 1 record, rendering
  its values and dynamic custom-fuel fields, and closing without saving all
  passed.
- Targeted test report: `/app/test_reports/iteration_189.json`.
- A local static `sustainrepo-logo.png` now removes the app-owned remote logo
  fallback. The preview still reports aborted Cloudflare `cdn-cgi` telemetry /
  challenge requests during automated navigation; these are ingress-level
  requests, not GHG application API or form failures. The authenticated edit
  flow itself remains operational.

## Recommended next step

Keep Phase 7 separate. The next structural improvement should first extract
the remaining calculation-preview orchestration from `Emissions.js` into a
dedicated edit controller/hook, retaining this draft model as its sole form
value input.