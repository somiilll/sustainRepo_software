# GHG Organization Capability Configuration Report

**Date:** 2026-08-20  
**Scope:** Option A resolver/UI seam only. No persistence or API delivery was added.

## 1. Existing resolver architecture

The canonical frontend path remains unchanged:

`standardGhgFormConfig → overrideSchema → resolveGhgConfig → resolveGhgCapabilities → resolveGhgFormContext → resolveGhgFormArchitecture → deriveGhgFields → resolveGhgScope3Options → resolveGhgUiState → existing save/calculation pipeline`.

The implementation adds presentation-only effective values to that path. It does not create a parallel organization-feature framework.

## 2. Existing organization override architecture

`organizationGhgOverrides` is already accepted by Create and Edit resolver inputs. `overrideSchema.js` remains the allowlist and calculation-protection boundary. `resolveGhgFormArchitecture` validates the object before passing it to capability resolution.

This phase intentionally does **not** persist, fetch, or configure the object through `organization_config`, APIs, database documents, or an admin UI.

## 3. Custom Fuel current architecture

Custom Fuel calculation behavior remains unchanged:

`CustomFuelMonthFields → useEmissionSubmit → execute-by-category → is_custom_fuel/user_overrides → backend calc engine → persistence`.

The standard capability registry remains the authority for categories supporting Custom Fuel. No category list, payload, factor, density, calorific value, carbon composition, or calc-engine behavior was changed.

## 4. Process Emissions current architecture

Process Emissions remains a Scope 1 category with its existing templates and submission path. `processType`, methodology/template resolution, `evaluateFormula`, calculated outputs, and record persistence were not changed.

Existing `disabledCategories: ['process_emissions']` remains the single category-visibility mechanism.

## 5. Process Type current architecture

`STANDARD_PROCESS_TYPE_OPTIONS` remains the central Process Type registry:

- `venting`
- `n2o_overall_combustion`
- `ch4_overall_combustion`

`isStandardProcessType` validates organization-supplied values against that registry.

## 6. New organization configuration schema

The validated caller-supplied shape is:

```js
{
  disabledCategories: ['process_emissions'], // existing behavior
  capabilityOverrides: {
    customFuel: false
  },
  processTypeOptions: ['venting', 'ch4_overall_combustion']
}
```

`capabilityOverrides.customFuel` is opt-out only; `true` is rejected. `processTypeOptions` must be a non-empty, unique subset of the central registry.

## 7. Resolver changes

- `resolveGhgCapabilities` now returns effective `customFuel` and `processTypeOptions` values only after validation.
- `resolveGhgUiState` returns the selectable Process Type set plus `renderableProcessTypeOptions` for historical rendering.
- `resolveGhgFormArchitecture` applies the validated override object consistently to both Create and Edit.

## 8. Create/Edit consumption

`Step1BasicSelection` and `EmissionEditForm` consume `resolveGhgUiState(...).renderableProcessTypeOptions`; neither contains organization IDs or duplicate organization logic.

When Custom Fuel is disabled, the new-selection toggle is absent. When Process Types are restricted, Create and Edit receive the same allowed option list.

## 9. Historical record behavior

Historical records are not migrated or modified. If a saved Process Type is later removed from new-selection options, it remains visible in Edit as a disabled option. A historical Custom Fuel record remains readable through its existing value path even when the new-selection capability is disabled.

## 10. Calculation boundary

No calculation code was changed. In particular, `evaluateFormula`, Process Emissions templates, Custom Fuel payloads, `user_overrides`, backend calculation algorithms, factors, units, and persistence contracts remain unchanged.

## 11. Rejected calculation overrides

The schema continues to reject calculation-domain keys, including:

- `formulaOverrides`
- `decisionTreeOverrides`
- `calculationInputs`
- `emissionFactorOverrides`
- `unitOverrides`
- `calculationExpressions`
- `calcEngineOverrides`

Unknown, duplicate, empty, and unsupported Process Type lists are also rejected.

## 12. Tests

Added permanent contract coverage in:

`frontend/src/modules/ghg/config/__tests__/ghgOrganizationCapabilityConfiguration.test.js`

It covers standard Custom Fuel capability availability, Custom Fuel disablement, existing Process Emissions category disabling, central Process Type registry stability, Create/Edit parity, historical disabled-option rendering, and rejected unsafe/unknown overrides.

Focused regression run: **86 tests passed across 5 suites**, including existing resolver contracts, live resolver paths, and Custom Fuel calculation golden coverage.

## 13. Browser verification

Authenticated, non-saving browser verification passed on `/ghg/scope1`:

- Stationary Combustion showed the standard Custom Fuel toggle.
- Process Emissions showed exactly the three central Process Types.
- The Add form’s monthly ledger retained strict table semantics (`tbody` children are `tr`; header row children are `th`).

Option A deliberately defers persisted organization variants, so browser configuration of enabled/disabled organizations was not attempted.

## 14. Database before/after counts

All verification was read-only; no form was saved.

| Collection | Before | After |
| --- | ---: | ---: |
| `emission_records` | 830 | 830 |
| `ce_calculation_audit_logs` | 1348 | 1348 |
| `emission_history` | 1773 | 1773 |

## 15. Limitations and follow-up work

- A caller must supply `organizationGhgOverrides`; persistence, API delivery, and the admin configuration UI are explicitly deferred by Option A.
- The live browser test therefore verifies the standard/default path only; organization-specific variants are covered by permanent resolver contracts.
- No new Process Type can be created through overrides. A future Process Type must be centrally implemented, tested, registered, and only then exposed through this allowlist.

## Additional verification repair

Browser verification exposed instrumentation wrappers around dynamic JSX within the monthly ledger table. The ledger shell now uses native React element construction for table primitives so injected wrappers cannot produce invalid `span` children under `thead`, `tr`, or `tbody`. This repair is presentation-only and does not affect calculation or save behavior.