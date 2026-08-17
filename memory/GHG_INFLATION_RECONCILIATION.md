# Inflation / PPP Reconciliation — Analysis and Proposal (read-only)

Date: June 2026
Status: **analysis only. Nothing implemented. No stored emission changed.**

## Where inflation and PPP are used

Spend-basis Scope 3 uses the `Spent Based` formula (`ce_formulas`):

```
co2e = spent_value * emission_factor / (1000 * inflation_rate * ppp)
```

`inflation_rate` and `ppp` are declared as **properties** (not inputs), so the
calc engine resolves them unless a `user_overrides` entry supplies them. Both
sit in the denominator, so an error in either scales the result inversely — a
3 % error in `inflation_rate` is a 3 % error in reported emissions.

Affected records: **106 spend records** — 70 `calculation_method_scope3 =
spend_basis` plus 36 legacy `spend_based`. Categories: C1, C2, C4, C9.

## The three resolution paths

**Path A — user override from the form (highest precedence).**
`ce_input_field_mappings` exposes `ppp` ("Purchase Power Value",
`display_order` 19) and `inflation_rate` ("Inflation Rate", 20), both
`is_required: false`, `is_override: true`. When the user ticks the override the
value is sent in `user_overrides` and `properties.resolve_property` returns it
with `source: "user_override"`.

**Path B — router injection from `currency_conversion`.**
`calc_engine/router.py` L787–860, inside `execute-by-category` only, and only
when `decision_inputs.calculation_method_scope3 == "spend_basis"`. It sniffs the
input units for a currency code, extracts a year from
`context.reporting_period`, looks up `currency_conversion` for that
`(source_currency, year_applicable)`, falls back to the **latest available year**
when there is no exact match, and finally defaults to `1.0`. It writes the result
into `merged_user_overrides` — so downstream it is indistinguishable from a real
user override.

**Path C — property source mapping (calc engine).**
`ce_property_source_mappings` has one active row per key:

| property_key | source_table | source_field | lookup_context_key | lookup_table_field | filter_field | filter_value |
|---|---|---|---|---|---|---|
| `inflation_rate` | `currency_conversion` | `inflation_factor` | `fuel_name` | `fuel_name` | `year_applicable` | `""` |
| `ppp` | `currency_conversion` | `purchase_parity` | `fuel_name` | `fuel_name` | `year_applicable` | `""` |

**Both mappings are misconfigured.** `currency_conversion` documents have no
`fuel_name` field, so the lookup clause never matches and is dropped;
`filter_value` is empty, so `if filter_field and filter_value` is false and the
year filter is skipped entirely (`properties.py::_resolve_from_source_mapping`).
The query therefore degenerates to "any active `currency_conversion` document",
returning the first in natural order — **currency-blind and year-blind**.

### Which services use which path

| Caller | Path A | Path B | Path C |
|---|---|---|---|
| `POST /api/calc-engine/execute-by-category` (Add + Edit forms) | yes | **yes** | only if A and B both absent |
| `POST /api/super-admin/calc-engine/execute` (sandbox) | yes | no | yes |
| `bulk_upload_scope3` processors | yes | depends on endpoint used | yes |
| Phase 0 in-process engine replay | yes | no | yes |

Path B exists in exactly one endpoint. Any other consumer of the same formula
silently gets Path C. **That is the defect** — not the values themselves.

## Evidence from the data

`currency_conversion` holds 8 INR rows: 2019 → 0.8842, 2020 → 0.8978,
2021 → 0.9213, 2022 → 1.0, 2023 → 1.0499, 2024 → 1.0864, 2025 → 1.1123,
2026 → 1.1486.

Distinct `inflation_rate` values actually applied across the audit logs:

| Value | Source recorded | Logs | Note |
|---|---|---|---|
| 1.11486 | `source_mapping` | 36 | **Not present in `currency_conversion` today** — a value that has since been edited (probably a typo for 1.1486). Path C produced it. |
| 1.1486 | `user_override` | 19 | 2026 rate, injected by Path B or entered manually |
| 1.1123 | `user_override` | 15 | 2025 rate |
| 1.11486 | `user_override` | 9 | the stale value, injected by Path B before the row was corrected |
| 1.0 | `user_override` | 9 | Path B's "USD / no currency" default, or 2022 rate |
| 1.0864 | `user_override` | 8 | 2024 rate |
| 2.0 / 3.0 / 1.3 | `user_override` | 12 | **hand-entered values with no basis in the reference table** |
| 1.0499 | `user_override` | 1 | 2023 rate |

And `context.reporting_period` is **absent on 64 of those logs**, so Path B could
not do a year-specific lookup for them and fell back to the latest year.

That is the mechanism behind the three-value C2 example: endpoint gives 1.1486
(Path B, latest-year fallback because no reporting period), in-process engine
gives 1.1123 (Path C, first natural-order row), and the value stored on the
record was computed with 1.1123.

## Do historical records already contain the inputs?

Partly, and this matters for what is safely recalculable:

| | Records |
|---|---|
| `dynamic_field_values.inflation_rate` present | 57 |
| `dynamic_field_values.ppp` present | 55 |
| Spend records total | 106 |

So roughly half the spend records carry the exact factor on the record and can be
recalculated faithfully from their own stored inputs. The remainder relied on
resolution at save time; for those the applied value survives only in
`applied_factors` on the calculation audit log — and 412 audit logs are already
orphaned, so this is not a durable record.

## Recommendation — one source of truth

**`currency_conversion`, resolved by `(source_currency, year_applicable)`, with
the year taken from the record's reporting period — reached through exactly one
code path: the calc engine's property resolver (Path C, fixed).**

Precedence, unchanged in spirit from today:

```
1. explicit user override (Path A)          — stays authoritative, with justification
2. currency_conversion for (currency, year) — the single automatic source
3. explicit, audited failure                — NOT a silent 1.0
```

Concretely:

1. **Fix the two `ce_property_source_mappings` rows** so the lookup is
   `source_currency` from context and the filter is `year_applicable` derived
   from `reporting_period`. This is reference-data configuration, not code.
2. **Always populate `context.reporting_period`** for spend-basis calculations
   (it is missing on 64 logs). Without it no year-aware resolution is possible
   from any path.
3. **Retire Path B** — delete the router's currency injection block once Path C
   resolves correctly, so `execute-by-category` and every other consumer agree.
4. **Replace the silent `1.0` default** with an explicit error or a clearly
   flagged `source: "default"` in the audit trail. A missing exchange factor
   silently multiplying by 1 is how a 20× PPP error becomes invisible.
5. **Persist the applied factor onto the record** (`dynamic_field_values`) for
   every spend calculation, so the record is self-describing and does not depend
   on an audit log that may be orphaned.

Why `currency_conversion` and not the form: it is super-admin governed, carries
`source` provenance ("IMF and US Bureau of Labor Statistics") and a year, and is
auditable. The form override should remain available but exceptional — the 2.0 /
3.0 / 1.3 values currently in the data show what happens when it is the easy
path.

## The three cases, kept strictly separate

**1. Historical stored calculations — DO NOT TOUCH.**
`co2_emissions` / `co2e_emissions` / `outputs` on the 106 existing spend records
stay exactly as they are. They are what was reported. Fixing the mappings does
not rewrite them, because nothing recalculates a record unless a user re-saves
it.

**2. Recalculation of historical data — separate, opt-in, out of scope here.**
If a record is re-saved after the fix, it will pick up the corrected factor and
its number will change. That is not a migration, it is a user action, and it is
already true today. If you want historical restatement it should be a deliberate,
reported exercise: compute old vs new for all 106 records, show the deltas, and
decide per reporting period — never as a side effect of a config fix. Note the
1.11486 → 1.1486 correction alone shifts affected results by about 0.33 %.

**3. Future calculations — the only thing the fix changes.**
New spend-basis entries resolve `inflation_rate` / `ppp` from
`currency_conversion` for their own reporting year, identically from every
endpoint.

## Interaction with Phase 0 and Phase 1

The Phase 0 suite currently locks **both** paths independently:
`test_ghg_golden_calculation.py` pins Path C's output,
`test_ghg_golden_live_endpoint.py` pins Path B's output, and they legitimately
disagree on 4 spend-basis fixtures across C2, C4 and C9. That is intentional —
today's behaviour is captured as it is.

When the reconciliation is implemented, those 4 fixtures **will** change, and the
suite **should** go red. That is the one and only sanctioned baseline
re-capture, and it needs your explicit approval with the old/new numbers in front
of you. Phase 1 must not be started with this pending if you intend to fix it
first — otherwise a Phase 1 diff and a deliberate calculation change would land
in the same red suite and become impossible to tell apart.

**My recommendation on sequencing:** treat this as its own gated change *after*
Phase 1 and Phase 2. Phase 1 and 2 are pure architecture with a green-suite
requirement; this is a deliberate calculation correction with an approved
baseline change. Mixing them removes the whole value of the safety net.
