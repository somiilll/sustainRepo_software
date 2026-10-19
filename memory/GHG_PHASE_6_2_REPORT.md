# GHG Phase 6.2 — Edit Boundary Cleanup & Orchestration Isolation

**Date:** 2026-08-19

## 1. Executive summary

Phase 6.2 cleaned the proven-obsolete Edit-form compatibility boundary and removed four unread state mirrors. `editDraft` remains the sole mutable source for actual Edit-form values.

No calculation formula, decision tree, factor, unit, API contract, backend module, database schema, historical record, C7 serialization/persistence behavior, evidence storage behavior, approval behavior, organization override rule, Create flow, inflation path, or Phase 7 architecture changed.

Calculation-preview orchestration and the two-stage hydration pipeline were deliberately retained: the dependency analysis did not show a safe, small controller boundary or a safe synchronous hydration replacement.

## 2. Reconnaissance classification

| Classification | Result |
|---|---|
| **SAFE TO REMOVE** | `EmissionEditForm` legacy value/setter compatibility contract; `formDataRef`, `overrideCalorificValueRef`, `overrideDensityRef`, `overrideEmissionFactorHeatRef`; their synchronization effects; the `{false ? ...}` quantity-unit branch; unused `activeCategoryModule`, `isApprovalMode`, and `getQuantityUnitFromEFUnit` EditForm props. |
| **ACTIVE** | `draft` and `onDraftChange`; render/UI props; reference/configuration props; evidence handlers; calculation-preview result/state; C7 employee handler; page-owned state used for dialog, loading, audit, dirty state, filters, and saving. |
| **COMPATIBILITY** | `hydrateEmissionForm`, its legacy record-shape handling, dynamic-field aliases, audit-log fallback, saved-unit fallback, C7 employee hydration, and process formula inference. |
| **POSSIBLY USED / retained** | Page-owned preview orchestration, as it shares dependencies with save/audit/C7 state and backend calculator hooks. |
| **UNKNOWN** | None after repository-wide import, export, dynamic-import, route, feature-flag, string-reference, caller, and test-reference searches. |

## 3. Dead compatibility and inert mirrors removed

### EditForm compatibility contract

The repository has one production `EmissionEditForm` caller: `pages/Emissions.js`. It always supplies `draft` and `onDraftChange`; no static or dynamic alternate caller was found.

Removed legacy value fallbacks:

- `formData`, `editFrequencyType`, `biogenicScopeSelection`, `selectedCategory`
- `scope3Method`, `scope3ActivityType`, `scope3Subcategory`, `scope3ActivityId`, `scope3CustomActivity`, `useCustomActivity`, `typeOfProduct`
- `editCalcMethodology`, `editProcessType`, `editUseCustomFuel`, `editCustomFuelName`
- `editEmployees`, `editEmployeeMonthlyTotals`, `editEmployeeYearlyTotal`
- `dynamicFieldValues`, `existingEvidences`
- `overrideCalorificValue`, `overrideDensity`, `overrideEmissionFactorHeat`, `overrideJustification`

Removed matching legacy setter fallback branches:

- `setFormData`, `setBiogenicScopeSelection`, `setScope3Method`, `setScope3ActivityType`, `setScope3ActivityId`, `setScope3Subcategory`
- `setScope3CustomActivity`, `setUseCustomActivity`, `setEditUseCustomFuel`, `setEditCustomFuelName`, `setTypeOfProduct`
- `setEditCalcMethodology`, `setEditProcessType`, `setDynamicFieldValues`, `setEditEmployees`
- `setOverrideCalorificValue`, `setOverrideDensity`, `setOverrideJustification`

The remaining form-value contract is intentionally direct:

```text
editDraft → draft + onDraftChange → EmissionEditForm
```

### Mirror refs

Removed `formDataRef`, `overrideCalorificValueRef`, `overrideDensityRef`, and `overrideEmissionFactorHeatRef` plus their synchronization effects. Repository-wide reference searches showed each was written but never read.

### Unreachable fragments

- Removed the conclusively unreachable `{false ? ...}` quantity-unit display branch.
- Removed its now-unused `getQuantityUnitFromEFUnit` prop.
- Removed unused `activeCategoryModule` and `isApprovalMode` props from the renderer contract.

## 4. Hydration analysis

`emissionRecordToDraft()` remains the first-stage adapter and delegates to `hydrateEmissionForm()`, the protected historical compatibility oracle. It initializes common values, period/frequency, scope/category/fuel selection, Scope 3 selections, biogenic selection, custom-fuel identity, C7 employees/totals/month, evidence URL placeholders, and legacy override values.

The later `populateDynamicFields` effect is classified **ASYNC HYDRATION + COMPATIBILITY** and was retained. It waits for asynchronously loaded form configuration and derived input metadata, then initializes dynamic field values/units, optional/override state, custom-fuel aliases, calculation methodology, process type, and the audit-log fallback. It supports historical `dynamic_field_values`, legacy field aliases, saved units, legacy audit-log-only records, custom fuel, Scope 3, C7-adjacent records, and process records that require a formula decision-tree lookup to infer an omitted `process_type`.

Forcing that work into the initial adapter would either omit config/audit-dependent data or require a broader asynchronous rewrite. The existing golden hydration suite covers Scope 1 stationary/mobile/fugitive/process/custom-fuel records, Scope 2, Scope 3 C1/C2/C6/C7/C9/C11, biogenic records, monthly/yearly/unspecified periods, legacy shapes, and `dynamic_field_values`. No hydration code changed.

## 5. Calculation-preview analysis

The preview orchestration remains page-owned in `Emissions.js`.

It jointly reads `editDraft` values, dynamic fields, resolved configuration/capabilities, selected fuel, Scope 3 reference data, category resolution, custom-fuel payload preparation, persisted record values, and audit state. It writes `backendCalcResult`, calculator-use state, and page-owned calculating state; the same inputs are also used by submit/audit binding. C7 has a distinct per-employee calculation path and must retain its dedicated serialization semantics.

Extracting this into a hook now would require a large dependency object or move interleaved page-owned submit/audit/C7 behavior. That is not a clean controller boundary, so no preview controller was added and no calculation behavior changed.

## 6. Evidence race analysis

**RACE FOUND + MINIMAL FIX.**

The previous flow awaited filename metadata for Record A and then merged results with the current draft. If Record B opened first, A could overwrite B's evidence list. `activeEditIdRef` now records the current open request synchronously. `editEmissionDispatch` checks it before merging evidence metadata and again after its loading delay. The fix changes neither evidence URLs, file requests, storage, deletion, upload, nor save payload semantics.

Focused regression: `editEmissionDispatch.test.js` opens evidence-bearing Record A, opens Record B before A resolves, resolves A, and verifies B's draft remains intact.

## 7. Final Edit component boundary

`EmissionEditForm` keeps legitimate props for UI/loading state, derived presentation data, reference/configuration data, workflow handlers, evidence actions, calculation-preview presentation, and C7 rendering. It no longer accepts a second editable-value interface. Prop count was not optimized artificially.

## 8. Tests

| Gate | Before | After |
|---|---:|---:|
| Frontend suite | 1,228 passed / 63 snapshots | **1,229 passed / 63 snapshots** |
| Backend golden suite | 506 passed / 9 skipped | **506 passed / 9 skipped** |
| C7 safety net | 9/9 | **9/9** |
| Phase 1 equivalence | 785/785 | **785/785** |
| Architecture contract | passing | **16/16 passed** |
| Phase 6.2 focused tests | n/a | **5 suites, 871 tests, 63 snapshots passed** |
| Authenticated browser smoke | n/a | **passed** — admin login, existing Scope 1 Mobile Combustion edit hydration, configured dynamic fields, close without save; custom fuel not applicable to selected record |
| Independent frontend verification | n/a | **passed** — no write calls to emission/file mutation endpoints |

The only browser console noise was the pre-existing environment-level aborted `/cdn-cgi/rum` telemetry request. It is not an app-owned Edit-flow regression.

## 9. Database safety

The task brief's historical baseline was `840 / 1,339 / 1,764`. Before Phase 6.2 work, the active environment already contained `842 / 1,343 / 1,768`; the extra records/audit logs predated this phase. Phase 6.2 preserved the observed environment exactly:

| Collection | Phase 6.2 start | Phase 6.2 end |
|---|---:|---:|
| `emission_records` | 842 | **842** |
| `ce_calculation_audit_logs` | 1,343 | **1,343** |
| `emission_history` | 1,768 | **1,768** |

No Phase 6.2 validation action wrote to these collections.

## 10. Files changed

- `frontend/src/components/EmissionEditForm.jsx`
- `frontend/src/pages/Emissions.js`
- `frontend/src/pages/emissions/utils/editEmissionDispatch.js`
- `frontend/src/pages/emissions/utils/__tests__/editEmissionDispatch.test.js`
- `memory/GHG_PHASE_6_2_REPORT.md`
- `memory/PRD.md`

## 11. Files intentionally untouched

- `backend/modules/ghg/` and the calculation engine
- C7 backend routes/contracts and C7 serialization/persistence behavior
- Evidence storage and API contracts
- Approval flows
- Database schemas and historical data
- Organization override schema/rules
- Create flow and `useEmissionSubmit.js`
- Inflation, BRSR, Dashboard, and Targets
- Phase 7 architecture

## 12. Remaining technical debt

- Dynamic-field hydration remains a required asynchronous, compatibility-heavy second stage.
- Preview orchestration remains page-owned because it is intertwined with configuration, audit, save, and C7 dependencies; no safe small extraction exists yet.
- Environment-only `/cdn-cgi/rum` telemetry abort logs continue during browser automation.
- The separately tracked missing-units, BRSR year-switch, non-golden backend-test, and spend-basis inflation issues remain out of scope.

**Phase 6.2 stops here. Phase 7 has not started.**