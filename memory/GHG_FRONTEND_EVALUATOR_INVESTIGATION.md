# Frontend Formula Evaluator — Investigation (read-only)

Date: June 2026
Subject: `EmissionEntryForm.js` ~L2023–2447 (`evaluateFormula`, `executeFormula`,
`getParameterValue`, `findFormulaForScope`, `getConversionFactor`).
Status: **investigation only. Nothing was modified, removed or rewritten.**

Answering each question you raised, with the evidence for it.

---

## The five functions are not one thing — they split into two groups

| Function | Defined at | Called from |
|---|---|---|
| `evaluateFormula` | L2023 | Passed out of the component into `useEmissionSubmit` (L2948). **Reachable in principle.** |
| `executeFormula` | L2378 | **Nowhere.** |
| `getParameterValue` | L2262 | Only from `executeFormula` (L2403), which is itself never called. |
| `findFormulaForScope` | L2220 | **Nowhere.** |
| `getConversionFactor` | L2189 | **Nowhere.** |

`Emissions.js` already removed its own copies of the same four functions — the
file still carries the marker comment at L1949–1950: *"E5: Dead-code block
removed (getParameterValueDynamic, getParameterValue, findFormulaForScope,
executeFormula) — these were never called from production"*. The
`EmissionEntryForm.js` copies were left behind at that time.

So four of the five are unreachable. Only `evaluateFormula` has a live-looking
call path, and it needs a closer look.

## Where `evaluateFormula` is called

`EmissionEntryForm.js` L2948 passes it into `useEmissionSubmit`. Inside
`useEmissionSubmit.js` it is called exactly twice:

* L286 — yearly branch, inside `if (isProcessEmissions && selectedTemplate)`
* L513 — monthly branch, inside `if (isProcessEmissions && selectedTemplate)`

Both call sites are gated on the same two values.

## What triggers it — and why the gate never opens

`useEmissionSubmit` destructures `isProcessEmissions`, `selectedTemplate`,
`templateInputValues` and `selectedSubIndustry` from its ctx argument
(L44–46). **`EmissionEntryForm.js` never passes any of them.** The ctx object it
assembles (L2931–2957) contains `isC7EmployeeCommuting`, `requiresSubcategory`,
`selectedFuel`, `evaluateFormula`, `buildDecisionInputs` and the rest — but no
`isProcessEmissions` and no `selectedTemplate`. A grep for `isProcessEmissions`
across `EmissionEntryForm.js` returns zero hits.

Therefore `isProcessEmissions` is `undefined` at both call sites and the branch
is unreachable from the live Add form.

Three further independent confirmations that this is a retired path:

1. `selectedTemplate` / `templateInputValues` / `selectedSubIndustry` exist as
   state in `useEmissionFormState.js` (L84–86) and are returned by the hook, but
   `EmissionEntryForm.js` never reads them.
2. `processTemplates` is declared as a prop of `EmissionEntryForm` (L77) and is
   never referenced anywhere in the file's body.
3. Database evidence: the `process_templates` collection contains **0**
   documents, and **0** of the 840 `emission_records` have a `template_id`. The
   payload that branch would build is stamped with `template_id` and
   `template_inputs`, so nothing in production data has ever come through it.

Meanwhile, the Process Emissions records that *do* exist (`process_type` =
`venting` and `ch4_overall_combustion`) all carry calc-engine audit logs and
resolve through the decision tree to the `Process Emissions - Carbon
Composition` and `Process Emissions - CH4` formulas. They come from the normal
dynamic-field path, not the template path.

## What values it generates, and whether they are saved

`evaluateFormula` is a string-substitution evaluator: it replaces variable names
in a formula string with numbers, normalises `×`/`x`/`–`, then evaluates it via
`Function('"use strict"; return (' + expression + ')')()`, returning `0` on any
error.

Had the gate been open, its result would **not** have been display-only. It
would have been written straight into the POST body as pre-calculated emissions:

* monthly branch (L520–553): `calculated_co2`, `calculated_ch4: 0`,
  `calculated_n2o: 0`, `calculated_co2e`, plus `co2_unit`/`ch4_unit`/`n2o_unit`/
  `co2e_unit`, `emission_factor: 1`, `template_id`, `template_inputs`
* yearly branch (L293–310): `calculated_co2e`

That is the important part of the answer to your question: **the frontend
evaluator was designed to feed the save payload, not to preview it.** It is
unreachable today, but it is not "obviously preview logic", and it should not be
treated as safe to delete on that assumption. What makes it safe is the
reachability evidence above, not its nature.

## Does the backend always recalculate?

No — and this is the reason the gate mattered. `POST /api/emissions` persists
the calculation values it is given; it does not re-derive them. Every live GHG
path therefore calls `POST /api/calc-engine/execute-by-category` from the
frontend first and sends the returned outputs. So a payload carrying
`calculated_co2e` from a frontend evaluation would have been stored verbatim,
with no server-side verification and **no `ce_calculation_audit_logs` entry** —
meaning no audit trail and no way to re-derive the number later.

## Does any GHG category rely on frontend-calculated values?

No live category does. All 26 scope/category combinations present in the
database resolve their numbers through `execute-by-category`; 155 records carry
matching calc-engine audit logs, and Phase 0 replays 89 of them successfully.

The one category that would have used the frontend evaluator — Process
Emissions via a `process_templates` template — has no templates configured and
no records.

## Do Create and Edit use it differently?

Yes, and the asymmetry is itself informative:

* **Create** still holds all five functions, and still wires `evaluateFormula`
  into the submit hook, so a future change that starts passing
  `isProcessEmissions` would silently re-activate a frontend calculation path.
* **Edit** already removed the equivalent block (the E5 comment in
  `Emissions.js`). Edit has no frontend evaluator at all; it goes through
  `useCalcEngine` and `effectiveCalculatedEmissions`, which read from the backend
  result or from the record's saved audit log.

## How it differs from the backend calc engine

| | Frontend `evaluateFormula` | Backend calc engine |
|---|---|---|
| Formula source | a formula **string** on a `process_templates` document | versioned `ce_formulas` definitions with typed inputs/outputs/properties |
| Units | none — bare numbers | full unit normalisation, compound units, dimension checks, `volume_to_mass` |
| Properties (CV, density, EF, GWP) | whatever the template hardcodes as `predefined_inputs` | resolved through `ce_property_source_mappings` / `gwp_config`, with override tracking |
| Formula selection | the template the user picked | decision-tree traversal |
| Audit trail | none | full per-step `ce_calculation_audit_logs` entry |
| Failure mode | returns `0` | raises, surfaced as HTTP 400 |
| Evaluation | `new Function(...)` on a substituted string | expression evaluator with validation |

## Are there formulas that exist only on the frontend?

Only in the sense that `process_templates` formula strings are not `ce_formulas`
documents — but the collection is empty, so in practice: **no.** Every formula
that produces a number in this system today lives in `ce_formulas`. Phase 0
enumerates 18 of them across the captured fixtures and 134 decision-tree leaves
across 22 trees.

---

## Conclusion and recommendation

`executeFormula`, `getParameterValue`, `findFormulaForScope` and
`getConversionFactor` in `EmissionEntryForm.js` are unreachable dead code —
already removed from `Emissions.js`, retained here.

`evaluateFormula` is reachable only through a branch whose gating props are
never supplied, backed by an empty `process_templates` collection and zero
records with `template_id`. It is dead in practice, but it is a **latent
write-path**: it would have written unverified, unaudited emission values
directly into saved records.

Per your instruction it has been left completely untouched. Two options for when
you want to act on it, both after Phases 1–2 are stable:

* **Minimal and safest:** leave the code in place and add a guard so the
  template branch cannot ever produce saved values without a backend
  calculation. Zero behaviour change today, closes the latent risk.
* **Cleanest:** remove all five functions plus the unreachable
  `isProcessEmissions && selectedTemplate` branches, the unused
  `processTemplates` prop and the three unused template state slots. Larger diff,
  but it removes the only remaining route by which a frontend-computed emission
  number could reach the database.

I recommend deferring both to the dead-code phase you already scheduled after
Phase 2, and treating the `process_templates` feature as a product question
first: is template-based Process Emissions entry meant to come back? If yes it
should be rebuilt on the calc engine, not on `new Function`.
