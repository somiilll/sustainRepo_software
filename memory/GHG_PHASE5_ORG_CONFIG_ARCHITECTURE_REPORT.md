# GHG Phase 5 — Organization-Ready Configuration Architecture Report

**Status:** Complete — review gate active  
**Scope:** Frontend configuration architecture only  
**Safety invariant:** identical standard configuration input produces identical rendered calculation fields and formula resolution.

## 1. Current configuration architecture

The active form path is now:

```
Standard form config / standard options / category data
  → organization override validation
  → resolveGhgConfig + resolveGhgCategoryOptions + resolveGhgFieldOptions
  → resolveGhgFormArchitecture
  → resolveGhgCapabilities + resolveGhgFormContext
  → deriveGhgFields
  → Create and Edit rendering
```

- **Category and scope source:** existing SuperAdmin-managed `dynamicScopes` and `dynamicCategories`, with existing fuel/biogenic compatibility fallback.
- **Scope 3 definitions/registry:** canonical capability metadata remains in `resolveGhgCapabilities`; registry flags derive from it.
- **Field source:** existing `GET /api/calc-engine/form-config/{category_id}` responses remain the standard field/formula source.
- **Organization source:** `organizationGhgOverrides`, passed as configuration data only. No component reads an organization ID.

## 2. Inventory: behavior source and safe configuration boundary

| Behavior | Current source | Create consumer | Edit consumer | Configurable now | Calculation-sensitive |
|---|---|---|---|---|---|
| Scope/category choices | Dynamic scope/category data + fallback lists | `EmissionEntryForm` / Step 1 | `Emissions` / `EmissionEditForm` | Disabled scopes/categories only | Selection affects future input, not engine code |
| Scope 3 subcategories | Standard GHG field options | Step 1 | Edit form | Disabled subcategories and safe options | Yes; values remain existing decision values |
| Capabilities | `resolveGhgCapabilities` | Shared architecture | Shared architecture | No org capability override | Yes |
| Standard mapped fields | Calculator form config | `deriveGhgFields` | `deriveGhgFields` | Visibility, required, label, safe options, display metadata | Yes |
| Custom organization fields | `presentation_custom_fields` | Dynamic renderer | Dynamic renderer | Text/select presentation-only fields | No — excluded from calculation/persistence helpers |
| Conditional UI behaviors | `resolveGhgUiState`, capabilities, existing components | Shared step components | Edit components | Not activated by overrides | Often calculation/business sensitive |
| Formulas, decision trees, factors, units | Backend form config/calculation domain | Never overridden | Never overridden | Not configurable | Yes |

## 3. What moved into configuration

1. `resolveGhgCategoryOptions` resolves disabled categories by canonical category code or display name and resolves disabled scopes without component-specific organization checks.
2. `resolveGhgSubcategoryOptions` filters standard subcategory options through the same validated override document.
3. `resolveGhgConfig` resolves safe field metadata and exposes valid custom fields separately as `presentation_custom_fields`.
4. `deriveGhgFields` converts presentation custom fields into `presentationOnly` render descriptors after the standard calculation-field order.
5. Shared Create/Edit architecture resolves the same config, field options, capabilities, and form context.

## 4. What intentionally remains outside organization configuration

- Formula selection and formula contents
- Decision trees and decision-tree values
- Emission factors, properties, conversions, inflation, and currency logic
- Units and unit-source behavior
- Calculation APIs, backend production code, records, audit logs, history, C7 contracts, evidence, and approvals
- `evaluateFormula` and all deferred dead-code cleanup

## 5. Override capability audit

| Override key | Classification | Phase 5 behavior |
|---|---|---|
| `hiddenFields` | IMPLEMENTED | Removes mapped fields from resolved presentation config. |
| `requiredFields` | IMPLEMENTED | Marks existing mapped fields required in resolved form metadata. |
| `fieldLabels` | IMPLEMENTED | Changes display label only. |
| `fieldOptions` | IMPLEMENTED, guarded | Changes safe UI options; unit-like option keys are rejected. |
| `fieldOverrides` | IMPLEMENTED, guarded | Allows only approved display/validation metadata; no mapping/unit/calculation changes. |
| `customFields` | IMPLEMENTED, guarded | Text/select, no unit/mapping/override semantics; rendered as presentation-only and excluded from calc/payload helpers. |
| `disabledScopes` | IMPLEMENTED | Filters scope choices before rendering. |
| `disabledCategories` | IMPLEMENTED | Filters resolved category choices. |
| `disabledSubcategories` | IMPLEMENTED | Filters resolved standard subcategory options. |
| `conditionalFields` | SCHEMA ONLY | Retained as a shaped document field; not consumed because current conditional paths contain business/decision semantics. |
| `validationRules` | SCHEMA ONLY | Top-level key is not consumed. Existing per-field `validation_rules` through safe `fieldOverrides` remains presentation validation. |
| `calculationInputs` | NOT SAFE TO CONFIGURE | Explicitly rejected. |
| `formulaOverrides` | NOT SAFE TO CONFIGURE | Explicitly rejected. |
| Decision-tree, emission-factor, unit overrides | NOT SAFE TO CONFIGURE | Explicitly rejected, including unit-like field options. |

There is deliberately no organization capability override. Capabilities such as C6 flight details and C7 employee behavior govern calculation or serialized workflow contracts and remain centrally standard-resolved.

## 6. Create/Edit and field-resolution flow

Both paths call `resolveGhgFormArchitecture`, then use its `resolvedConfig` with `deriveGhgFields`.

- **Create:** `EmissionEntryForm` resolves standard categories, options, config, capabilities, context, and fields.
- **Edit:** `Emissions` resolves the same architecture and passes the resolved category list into `EmissionEditForm`.
- **Parity guarantee:** the Phase 5 test resolves an identical category context through both paths and asserts equal resolved configs and derived field descriptors.

Standard calculation mappings retain their existing order and formula resolution. Presentation custom fields are appended only after those mappings.

## 7. Safety and security boundaries

- Invalid documents fail closed: resolvers return standard config/options unchanged.
- Null or empty overrides retain standard config object identity.
- Overrides cannot provide formula, decision-tree, EF, unit, mapping-variable, or calculation-input changes.
- Custom fields have no `maps_to_variable`, unit source, allowed/default unit, or override mode.
- C7 custom presentation fields are deliberately suppressed because its dedicated multi-employee serialization contract is out of Phase 5 scope.
- No organization ID conditionals were added to React components.

## 8. Default behavior guarantee

With `organizationGhgOverrides = null`, `resolveGhgConfig` returns the standard config by reference. Existing field order, properties, labels, options, visibility, required status, capabilities, and formula ID resolution are unchanged.

## 9. Tests and read-only verification

- Baseline: frontend **1,189/1,189**, 63 snapshots; backend golden **506 passed, 9 skipped**.
- Post-change: frontend **1,194/1,194**, 63 snapshots; backend golden **506 passed, 9 skipped**.
- Phase 1 equivalence, capability, Phase 4.1 live-path, Create/Edit parity, C7 safety-net, invalid override, and presentation-only input tests are included in the green frontend suite.
- Authenticated live smoke test: `/ghg/scope1` loaded successfully; independent QA also verified Scope 1 → Scope 3 add-modal stability.
- Database counts before and after remained unchanged: `emission_records=840`, `ce_calculation_audit_logs=1339`, `emission_history=1764`.
- No emission, audit, history, or configuration data was written.

## 10. Remaining hardcoded behavior

The remaining direct component conditions are calculation/business workflow behaviors, including methodology and process choice UI, C6 flight controls, C7 employee flow, activity filtering, and legacy fallback rendering. They were intentionally not converted into generic override conditions because an organization configuration must not alter calculation inputs or decision paths.

## 11. Recommended future SuperAdmin UI

Build a data editor—not a React-code editor:

```
Organization → GHG Configuration → Scopes → Categories → Subcategories
  → Fields → Labels / options / required / visible → Preview → Save
```

The screen should validate against `overrideSchema`, show rejected calculation-domain keys as unavailable, preview the fully resolved standard-plus-override configuration, and persist only approved UI metadata. It must never expose formulas, factors, units, decision trees, or calculation inputs as editable organization settings.

## 12. Stop gate

This phase does not authorize inflation work, calculation refactoring, C7 changes, evaluator/dead-code removal, evidence/approval changes, backend changes, schema changes, or a SuperAdmin UI. Await review before any next phase.