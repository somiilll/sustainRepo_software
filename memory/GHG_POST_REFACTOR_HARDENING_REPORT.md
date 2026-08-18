# GHG Post-Refactor Hardening Report

**Status:** Complete — final production-readiness review gate  
**Scope:** Read-only architecture audit plus one permanent frontend architecture-contract test  
**Success metric:** enforcement of the canonical architecture, not component line count or another redesign.

## 1. Phase 0–5 completion confirmation

Phases 0–5 and the final presentation/options completion remain intact. This hardening pass did not reopen or redesign them.

- Phase 1 Create/Edit field equivalence remains protected.
- Phase 2 shared configuration/context/field derivation remains the active path.
- Phase 3 C7 safety remains unchanged.
- Phase 4/4.1 capability resolution remains centralized and live-path protected.
- Phase 5 organization overrides remain the only future organization customization boundary.

## 2. Current canonical architecture

```
standard config + organization overrides
  → resolveGhgConfig
  → resolveGhgFormContext
  → resolveGhgFormArchitecture
       → resolveGhgCapabilities
       → resolved field options / organization UI config
  → deriveGhgFields
  → resolveGhgScope3Options
  → resolveGhgUiState
  → existing calculation and save pipeline
```

### Create path

`EmissionEntryForm` resolves its explicit context, then calls `resolveGhgFormArchitecture`, `deriveGhgFields`, and `resolveGhgScope3Options`. Shared step components receive resolved capabilities, fields, options, and UI state.

### Edit path

`Emissions` resolves the edit context, then calls the same architecture, derivation, and Scope 3 option resolver. `EmissionEditForm` is a view component consuming those resolved values and `resolveGhgUiState`.

The components retain separate hydration, auditing, evidence, approval, loading, and persistence orchestration by design.

## 3. Architecture verification

| Concern | Verification result |
|---|---|
| Standard configuration | `resolveGhgConfig` returns the standard config by reference when no override exists. |
| Organization overrides | Validated against a strict allowlist; invalid documents fail closed to standard configuration. |
| Capability authority | `resolveGhgCapabilities` is the canonical active source. Scope 3 registry capability projections are already asserted against it. |
| Field derivation | Both forms invoke `deriveGhgFields` with resolved config and explicit context. |
| Scope 3 options | Both forms invoke `resolveGhgScope3Options`; method/activity/subcategory presentation values are shared. |
| UI state | Create and Edit consume `resolveGhgUiState` for capability-controlled presentation. |
| Validation | Both receive the same derived required/options/validation metadata; shared Step 1 validation is capability-driven. Workflow/persistence validation remains intentionally flow-specific. |
| Organization IDs | No organization-ID conditional was found in GHG form UI logic. |

## 4. Remaining duplication and category-name logic audit

No safe production cleanup was identified.

| Finding | Classification | Treatment |
|---|---|---|
| Scope 3 activity filtering in Create and Edit | Workflow / compatibility | Retained. It filters existing EF/activity data, sector, historical `electricity`, fugitive, and biogenic compatibility paths. Moving it without dedicated payload/historical proof would be unsafe. |
| Scope comparisons (`scope1`, `scope3`, `biogenic`) | Workflow / calculation context | Retained. These select request, hydration, save, and rendered step behavior; they are not an alternate capability registry. |
| Process name recovery and saved formula handling | Hydration / legacy | Retained to safely hydrate older records. |
| Category module selection in Edit | Workflow / compatibility | Retained. It selects existing payload/render adapters and includes a legacy fallback. |
| Scope 3 module metadata | Compatibility projection | Retained. Existing capability-projection tests guard it against drifting from `resolveGhgCapabilities`. |
| Category/subcategory string comparisons in `deriveGhgFields` | Calculation / legacy | Retained and protected by the Phase 1 equivalence suite. |
| Existing constants/module option objects | Compatibility data | Retained unless directly consumed by active shared UI. Active Create/Edit process/product/activity options already use `standardGhgFormConfig`. |

## 5. Capability verification

The canonical resolver continues to cover active presentation capabilities:

- fuel/custom fuel and manual factor override availability
- process type and methodology presentation
- asset name and journey locations
- C6 activity/flight details
- C7 multi-employee presentation
- C9 customer versus supplier presentation
- C11 subcategory/product-type presentation

No independent active Create/Edit capability array was found. Per-category module configuration remains a compatibility/payload contract, not a second form capability authority.

## 6. Validation and option-definition verification

- Organization overrides can affect supported UI field visibility, required state, labels, safe options, and presentation-only custom fields.
- Overrides cannot change formulas, decision trees, factors, units, calculation inputs, calculation algorithms, or capabilities. Unsupported capability/algorithm override keys reject safely.
- The shared configuration output supplies the same required/options/validation metadata to Create and Edit; the new architecture contract asserts parity for these properties.
- Active Scope 3 methods/activity/subcategories, process types, C11 product types, and activity labels are all resolved from shared configuration modules.

## 7. Create/Edit and organization-override regression protection

Added `postRefactorArchitectureContract.test.js` with:

1. Create/Edit contract coverage for Scope 1 Stationary/Mobile/Fugitive/Process, Scope 2 Purchased Electricity, Scope 3 C1/C2/C6/C7/C9/C11, and Biogenic Stationary/Mobile.
2. Equality checks for form context, resolved configuration, resolved field options, capabilities, derived fields, field-level validation metadata, shared Step 1 validation output, and shared UI-state output.
3. Shared Scope 3 option resolver parity coverage.
4. Representative organization override parity: hidden/required/renamed fields, presentation options, disabled category/subcategory, and custom presentation field.
5. Rejection coverage for formula, decision-tree, emission-factor, unit, calculation-algorithm, and capability override attempts.

This is permanent protection against a second independent Create/Edit configuration or capability path.

## 8. `evaluateFormula` safety check

**Retained.** It has a live reference from `EmissionEntryForm` into `useEmissionSubmit` and two active process-template invocation branches. It is not conclusively unreachable, so no deletion was attempted. No evaluator behavior changed.

## 9. Large-component and dead-code review

- `EmissionEntryForm`, `Emissions`, and `EmissionEditForm` were reviewed but intentionally not split. Their remaining size reflects distinct orchestration, hydration, persistence, evidence, and approval responsibilities. No new extraction had a sufficiently isolated, low-risk contract.
- No new conclusively unreachable candidate was found in this hardening pass. The previously removed prototype files remain absent and unreferenced.

## 10. Files changed

- Added `frontend/src/modules/ghg/config/__tests__/postRefactorArchitectureContract.test.js`
- Added this report.
- Updated `PRD.md` with the hardening result.

No backend production, calculation, persistence, API, schema, evidence, approval, C7, or inflation file changed.

## 11. Regression and database verification

| Gate | Baseline | Final |
|---|---:|---:|
| Frontend tests | 1,207 / 1,207 | **1,223 / 1,223** |
| Snapshots | 63 unchanged | **63 unchanged** |
| Backend golden | 506 passed / 9 skipped | **506 passed / 9 skipped** |
| C7 safety | 9 / 9 | **Protected; no C7 production change** |
| Phase 1 equivalence | 785 / 785 | **Included in green frontend suite** |

The frontend test total increased by **16** only because the permanent architecture-contract matrix was added. No pre-existing test expectation or snapshot changed.

| Collection | Before | After |
|---|---:|---:|
| `emission_records` | 840 | 840 |
| `ce_calculation_audit_logs` | 1,339 | 1,339 |
| `emission_history` | 1,764 | 1,764 |

All verification was read-only; no database writes occurred.

## 12. Risks, known coupling, and future work

- The remaining risk is intentional: legacy activity filtering and record hydration are sensitive to historical data and calculation payloads. They should only be changed with a dedicated compatibility and calculation-contract plan.
- A future SuperAdmin UI may persist only validated presentation overrides and should preview resolved configuration before save.
- Inflation, C7 redesign, backend/API changes, evidence/approval changes, and unrelated ESG work remain outside this completed hardening phase.

## 13. Final conclusion

The existing GHG refactor architecture is enforced and production-hardened. No further refactor was warranted by the evidence. Stop at this report; do not begin another phase without a new instruction.