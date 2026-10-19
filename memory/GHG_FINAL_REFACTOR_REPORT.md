# GHG Final Refactor Report

**Status:** Complete — final review gate active  
**Scope:** Frontend configuration, capability, option, parity, and proven dead-code cleanup only  
**Success metric:** clear responsibility boundaries and preserved behavior, **not line count**.

## 1. Before architecture

The application already had the foundational shared pipeline from Phases 0–5:

```
standard config + organization overrides → resolved config
capabilities → form context → derived fields → existing calculation pipeline
```

The remaining coupling was primarily presentation duplication: Create and Edit independently built Scope 3 method/activity/subcategory option lists and repeated activity/process/product display values. The active `EmissionEntryForm` remained a large orchestrator, but its state, fetching/effects, submission, steps, field renderer, and category payload adapters were already separate responsibilities; it was not reduced merely for size.

## 2. Final architecture

```
modules/ghg/config/
  standardGhgFormConfig.js        standard presentation option definitions
  resolveGhgConfig.js             validated standard + organization config
  resolveGhgCapabilities.js       canonical capability authority
  resolveGhgFormContext.js        canonical category/scope context
  deriveGhgFields.js              shared field derivation + formula resolution
  resolveGhgScope3Options.js      shared Create/Edit Scope 3 presentation options
  resolveGhgUiState.js            shared presentation conditions

Create: EmissionEntryForm → shared architecture/resolvers → existing submit path
Edit:   Emissions + EmissionEditForm → shared architecture/resolvers → existing save path
```

No generic form framework, new state-management system, API layer, database object, or calculation path was introduced.

## 3. Files changed

### Added
- `modules/ghg/config/resolveGhgScope3Options.js`
- `modules/ghg/config/__tests__/finalCreateEditParityMatrix.test.js`
- This final report.

### Updated
- `standardGhgFormConfig.js` — canonical display options for activity type, process type, and product type.
- `resolveGhgUiState.js` — canonical product-type presentation condition.
- `config/index.js` — exports the shared configuration surfaces.
- `EmissionEntryForm.js` and `Emissions.js` — consume one Scope 3 option resolver.
- `Step1BasicSelection.js` and `EmissionEditForm.jsx` — consume shared option definitions and UI state.

### Deleted after reference audit
- `components/EmissionEntryFormRefactored.js` — incomplete placeholder/prototype; no imports, routes, runtime references, or test references.
- `modules/ghg/emissions/hooks/useEmissionForm.js` and its barrel — obsolete unused hook prototype; no imports, routes, runtime references, or test references.

## 4. Responsibilities moved

- Scope 3 method order, activity type filtering, and resolved subcategory display options moved to `resolveGhgScope3Options`.
- Activity labels, process type options, and C11 product type options moved to `standardGhgFormConfig`.
- C11 product-type visibility/required-presentation condition moved to `resolveGhgUiState`.
- Only presentation/configuration behavior moved. EF record filtering for activity selection, legacy hydration, payload building, and calculation execution remain in their existing compatibility/workflow boundaries.

## 5. Create/Edit shared paths

Create and Edit share:

- `resolveGhgConfig`
- organization override validation and resolution
- `resolveGhgCapabilities`
- `resolveGhgFormContext`
- `resolveGhgFormArchitecture`
- `deriveGhgFields`
- `resolveGhgScope3Options`
- standard UI options and product-type presentation state

They intentionally retain different hydration, evidence, approval, load, and persistence orchestration.

## 6. Configuration, capabilities, options, and validation

- **Configuration:** standard config plus a validated organization override flows into both forms without an organization-ID component conditional.
- **Capabilities:** all active category capability decisions remain in `resolveGhgCapabilities`; no parallel active capability arrays were added.
- **Options:** active Scope 3 method/activity/subcategory lists now resolve from one pure resolver. Standard activity/process/product labels come from one option module.
- **Validation:** resolved fields carry the same `required`, visibility, options, and UI validation metadata into Create and Edit. Existing step validation and payload-specific validation remain separate because they validate distinct workflows (monthly entry, edit hydration, and persistence) rather than duplicate domain configuration.

## 7. Inventory classification

| Classification | Final treatment |
|---|---|
| Configuration | Centralized active category/subcategory options and organization-safe presentation overrides. |
| Capability | Canonical resolver retained; duplicated active UI arrays were not introduced. |
| Field derivation | Already shared from earlier phases and protected by equivalence tests. |
| Validation | Shared field metadata retained; workflow/persistence validation intentionally remains local. |
| UI presentation | Shared Scope 3 selection resolver and standard options added. |
| Hydration/legacy | Left intact and isolated; it protects historical records. |
| Calculation | Left intact; backend pipeline remains authoritative. |
| Workflow | Create/Edit submission, evidence, approval, and C7 workflows retained separately. |
| Compatibility | Legacy category, biogenic, fuel, and record fallback code retained where it protects existing data. |
| Dead/unreachable | Three conclusively unused prototype files removed. |

Remaining category-name checks are either compatibility identity fallbacks, historical hydration, activity/EF lookup, or calculation/workflow branches. They were not blindly replaced.

## 8. Organization customization readiness

Organization overrides can safely control supported form presentation: field visibility/required state/labels/safe options/custom presentation fields and disabled scopes/categories/subcategories. Formula, calculation input, decision tree, emission factor, and unit override attempts are rejected. Capabilities are deliberately not organization-overridable because they can affect dedicated calculation/workflow contracts.

## 9. Calculation and C7 boundaries

- No formula, decision tree, EF, unit, algorithm, backend production code, API contract, persistence schema, historical record, evidence, or approval change was made.
- C7 calculation and persistence behavior is unchanged. Its dedicated multi-employee rendering and serialization were not folded into generic form configuration.
- Existing calculation API calls remain authoritative.

## 10. `evaluateFormula` status

**Retained intentionally.** Reference audit found it is active in `useEmissionSubmit` process-template submission paths (two invocation branches) and is supplied by `EmissionEntryForm`. It is therefore not conclusively unreachable and was not deleted. No frontend calculation fallback was expanded or changed.

## 11. Test results and snapshot comparison

| Gate | Baseline | Final |
|---|---:|---:|
| Frontend suite | 1,194 passed / 63 snapshots | **1,207 passed / 63 unchanged snapshots** |
| Backend golden | 506 passed / 9 skipped | **506 passed / 9 skipped** |
| C7 safety net | protected baseline | **9/9 independent QA checks passed** |
| Live UI smoke | n/a | authenticated Scope 3 page passed, read-only |

The new parity matrix covers Scope 1 Stationary/Mobile/Fugitive/Process, Scope 2 Purchased Electricity, Scope 3 C1/C2/C6/C7/C9, and Biogenic Stationary/Mobile. It asserts matching Create/Edit context, config, capabilities, and derived fields. Phase 5 organization tests continue to protect valid presentation overrides and rejected calculation-domain overrides.

## 12. Database safety

| Collection | Before | After |
|---|---:|---:|
| `emission_records` | 840 | 840 |
| `ce_calculation_audit_logs` | 1,339 | 1,339 |
| `emission_history` | 1,764 | 1,764 |

All verification was read-only. No emission/configuration create, edit, delete, or migration operation ran.

## 13. Known remaining coupling and intentional non-refactors

- `EmissionEntryForm`, `Emissions`, and `EmissionEditForm` remain substantial orchestrators because they coordinate different workflow, hydration, evidence, and persistence responsibilities. Their size alone was not treated as a defect.
- Complex activity filtering and legacy/historical hydration remain in their existing flows. Moving them without a dedicated historical and calculation-contract proof would introduce risk.
- The current override schema intentionally leaves top-level conditional fields/validation rules schema-only instead of activating calculation-sensitive behavior.
- No SuperAdmin customization UI or persistence was built; a future screen should edit only validated override data and preview resolved configuration.

## 14. Recommended future work

1. Build the separate SuperAdmin GHG configuration preview/persistence UI using the existing safe override schema.
2. Address inflation only in its separately approved workstream with refreshed spend-basis golden baselines.
3. Keep any future C7 or historical hydration refactor behind dedicated E2E and persistence-contract coverage.

## 15. Final gate

The GHG configuration/presentation refactor is complete. No inflation, backend, C7, calculation, evidence, approval, or unrelated ESG work is authorized by this phase.