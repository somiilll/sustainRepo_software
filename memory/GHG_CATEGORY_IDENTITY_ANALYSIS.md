# Category Identity — Impact Analysis (read-only)

Date: June 2026
Status: **analysis only. No category was deleted, merged, renamed or migrated.**

## Headline: they are not duplicates — my Phase 0 finding I2 was wrong

`Stationary Combustion` and `Mobile Combustion` each exist **twice by name but
once per scope**. They are two legitimately distinct categories that happen to
share a display name, not a duplication defect.

| Name | Category id | `code` | `scope_id` | Scope | Created | Active |
|---|---|---|---|---|---|---|
| Stationary Combustion | `8d62f52d-0ca6-4737-9b14-dd60878c1f27` | `stationary_combustion` | `8649468b…` | **Scope 1** | 2026-04-17 10:37 | yes |
| Stationary Combustion | `3232f8ea-bb14-4e21-86a3-b138368c95fa` | `stationary_combustion` | `f868ced4…` | **Biogenic** | 2026-04-17 11:09 | yes |
| Mobile Combustion | `92a11a68-ed7e-4670-b218-d1ede0480eca` | `mobile_combustion` | `8649468b…` | **Scope 1** | 2026-04-17 10:37 | yes |
| Mobile Combustion | `1acae127-2693-4fea-a4ef-84c7568fdc54` | `mobile_combustion` | `f868ced4…` | **Biogenic** | 2026-04-17 11:09 | yes |

Both are `is_system: true`, `display_order` 1 and 2 respectively — i.e. they are
the seeded Scope 1 set and the seeded Biogenic set. The 24-category table has no
other same-name groups.

Correction to Phase 0: my capture script resolved categories by **name only**,
which is why it flagged an ambiguity. The application does not. Fixed in the
capture script (test-only change, re-captured, suite still green).

## Runtime resolution is already unambiguous

All four category-resolution sites in the live code resolve by
**(name, scope_code)**:

| Site | Code |
|---|---|
| Create — form config | `useEmissionFormEffects.js` L51: `dynamicCategories.find(c => c.name === category && c.scope_code === effectiveScope)` |
| Edit — form config | `Emissions.js` L364: `c.name === formData.category && c.scope_code === effectiveScope` |
| Edit — calculation | `Emissions.js` L2145: same predicate |
| Edit — C7 employee calc | `Emissions.js` L2883: same predicate, pinned to `scope3` |

`effectiveScope` is derived exactly once per flow:
`biogenic + biogenic_scope_selection === 'scope3'` → `scope3`;
`biogenic + scope1` → `biogenic`; otherwise the record's own scope. Records carry
both `scope` and `biogenic_scope_selection`, so the discriminator is present on
every record.

**Conclusion: no historical record can resolve to the wrong category
definition.** A Scope 1 Stationary Combustion record resolves to `8d62f52d…`; a
biogenic one resolves to `3232f8ea…`. Verified against the data: all 22 biogenic
Stationary Combustion records used the Biogenic formula, all Scope 1 ones used
the Scope 1 formula. Zero cross-contamination in 217 records.

## The definitions are genuinely different — merging would change results

### Stationary Combustion — trees differ

| Methodology | Scope 1 (`8d62f52d…`) | Biogenic (`3232f8ea…`) |
|---|---|---|
| `using_heat_basis_ncv` | `b52e732f…` **Stationary Combustion - Heat Basis - Scope 1** | `d5c88230…` **Stationary Combustion - Heat Basis - Biogenic** |
| `using_qty_basis_ef` | `f863ca67…` Quantity Based (shared) | `f863ca67…` Quantity Based (shared) |
| `using_carbon_composition` | `d10c79f4…` Carbon Composition (shared) | `d10c79f4…` Carbon Composition (shared) |

Structure hashes differ (`4390e252…` vs `1fb1b34d…`). The heat-basis branch is
the whole point of the split: the biogenic formula applies non-fossil CH₄ GWP.
Both target formulas are active and both are used by real records (12 records on
the Scope 1 formula, 4 on the Biogenic one).

**Merging these two would silently reroute biogenic stationary combustion onto
the fossil formula and change emission results. It must not be done.**

### Mobile Combustion — trees are byte-identical

Both trees hash to `8c67240e…` and route to the same three formulas
(`a1bfeca8…` Mobile Combustion - Scope 1 **and Biogenic** - Heat Basis, plus the
two shared ones). The formula itself already handles both scopes.

So Mobile Combustion is *functionally* redundant — but it is the correct
structural mirror of Stationary Combustion, and the two categories differ in
another dimension (see next section). Collapsing it would make the Scope 1 and
Biogenic category sets asymmetric for no calculation benefit.

### Input field mappings differ for both

| Category id | Scope | Field keys offered |
|---|---|---|
| `8d62f52d…` | Scope 1 | `carbon_content, cv, density, ef_quantity, oxidation_factor, qty` (6) |
| `3232f8ea…` | Biogenic | `cv, ef_quantity, qty` (3) |
| `92a11a68…` | Scope 1 | `carbon_content, cv, density, ef_quantity, oxidation_factor, qty` (6) |
| `1acae127…` | Biogenic | `cv, ef_quantity, qty` (3) |

The biogenic variants deliberately expose fewer fields (no density, no carbon
composition inputs). Merging ids would change which fields the form renders for
biogenic entries — a visible behaviour change.

## Reference inventory per id

| Collection.field | `8d62f52d` S1 Stat | `3232f8ea` Bio Stat | `92a11a68` S1 Mob | `1acae127` Bio Mob |
|---|---|---|---|---|
| `ce_decision_trees.category_id` | 1 | 1 | 1 | 1 |
| `ce_formulas.category_id` | 3 | 1 | 1 | 0 |
| `ce_formulas.category_ids` | 3 | 2 | 2 | 2 |
| `ce_input_field_mappings.applies_to_categories` | 6 | 3 | 6 | 3 |
| `emission_records.category_id` | 0 | 0 | 0 | 0 |
| `ce_calculation_audit_logs.context.category_id` | 0 | 0 | 0 | 0 |
| `esg_kpi_definitions`, `base_year_emissions`, `category_frequency_configs`, `bulk_upload_pending_records` | 0 | 0 | 0 | 0 |

Frontend: **no category id is hardcoded anywhere.** All ids arrive from
`dynamicCategories` at runtime. Backend: `modules/emissions/categories/registry.py`
identifies categories by the string ids `stationary_combustion` /
`mobile_combustion` and by scope, never by UUID.

## Affected records

| Group | Records |
|---|---|
| `scope1` + Stationary Combustion | 112 |
| `biogenic` + Stationary Combustion | 22 |
| `scope1` + Mobile Combustion | 81 |
| `biogenic` + Mobile Combustion | 2 |
| **Total** | **217** |

None store `category_id`. All store `scope` and, for biogenic,
`biogenic_scope_selection`.

## Recommendation

**Canonical identity = (`code`, `scope_code`), not the display name and not the UUID.**

```
stationary_combustion @ scope1     -> 8d62f52d-0ca6-4737-9b14-dd60878c1f27
stationary_combustion @ biogenic   -> 3232f8ea-bb14-4e21-86a3-b138368c95fa
mobile_combustion     @ scope1     -> 92a11a68-ed7e-4670-b218-d1ede0480eca
mobile_combustion     @ biogenic   -> 1acae127-2693-4fea-a4ef-84c7568fdc54
```

The `code` field already exists and is already correct on all four rows. It is
stable, human-readable and UI-independent — exactly what the future
configuration/override layer needs as a key.

**Nothing needs to be deleted or merged. No record migration is required.**

### What should change (all deferred to Phase 1, none of it data surgery)

1. **Phase 1 resolves categories by `(code, scope_code)`** instead of
   `(name, scope_code)`. Same result today, but display names become free to
   change without breaking resolution. Behaviour-neutral.
2. **Disambiguate the two names in the UI only** (for example "Stationary
   Combustion (Biogenic)"), if you want operator clarity. Needs the change in
   step 1 first, otherwise renaming breaks resolution immediately. Cosmetic,
   requires your approval, and would need the form-config baseline re-captured
   for the two affected categories.
3. **Optional, additive:** start writing `category_id` onto new emission records
   alongside `category`, so future records carry the resolved identity instead of
   re-deriving it. Additive field, no migration, no back-fill needed — this is a
   nice-to-have and I would schedule it with Phase 5, not now.

### Migration plan — deliberately empty

No `emission_categories` row is deleted, merged or edited. No
`emission_records`, `ce_decision_trees`, `ce_formulas` or
`ce_input_field_mappings` document is touched. Therefore:

* **Rollback plan:** not applicable — there is nothing to roll back. The only
  change made during this analysis was to the *test* capture script, which is
  reverted by re-running `capture_ghg_baseline.py`.
* **Calculation impact:** none. Suite re-run after the capture fix:
  **497 backend + 145 frontend tests still passing.**

If you would still prefer to physically merge Mobile Combustion (the identical
pair), that is possible but I recommend against it: it buys nothing
computationally, breaks the Scope 1 / Biogenic symmetry, and would require
updating 1 decision tree, 2 `category_ids` arrays and 3 field-mapping arrays plus
re-capturing two form-config baselines — real risk for zero calculation benefit.
