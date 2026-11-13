# OCR Extraction v2 - build notes and rules for Emergent

Read this first, then `SPEC.md` (the full behaviour) and `README.md` (wiring steps). This file says **what is built, what
you must keep exactly as it is, what you must supply, and what is still open**. Last updated 9 Nov 2026.

## 1. What this is

A tested reference implementation of the extraction backend behind SustainRepo's **OCR Extraction** page. It reads invoices,
bills, scans, phone photos and Excel files; classifies every line to GHG scope / category / sub-category (plus Energy, Water,
Waste modules); fills the Emergent formula fields Save-all needs; and gives a review UI with credits, a job queue and an audit
trail. The Python package `engine/extractor_core` is the product. `testbench/` is a throw-away app that proves it works and is
the UI reference. **Port the behaviour, not the testbench code.**

## 2. What is built (all covered by 116 offline tests)

| Area | What it does | Where |
|---|---|---|
| Reading | PDFs and images (up to 10 pages), multilingual; Excel in three shapes (ledger, months across, items across) incl. hidden sheets | `normalise.py`, `extract.py`, `layout.py` |
| Classification | Org memory, then rules + HSN/SAC table, then Jev, OpenAI Decisions, Claude Haiku; one decision per distinct item | `decider/`, `group.py` |
| Formula fields | Picks the first Emergent formula whose required fields exist; converts to canonical units | `fields.py`, `units.py` |
| Companion rows | Well-to-tank, T&D losses, steam, waste + transport split, gas blends | `derive.py` |
| Checks | Facility, period split, unit fit, price range, duplicates, series gaps/outliers, history outliers, meter and total arithmetic | `validate.py`, `plausibility.py` |
| Trust label | **High / Check / Needs you** with plain reasons (replaces the confidence percentage) | `validate.trust` |
| Credits | Every AI call becomes a usage event priced from `mappings/pricing.json`; credit gate, per-job budget | `usage.py` |
| Job queue | Light and heavy lanes, per-org cap, cancel, retry, restart recovery, global AI call cap | `jobqueue.py`, `limits.py` |
| Facilities | The customer chooses the facility per file, sheet or facility name before extraction starts; nothing is guessed from the bill | `facilities.py` |
| Audit trail | Who approved, rejected or edited what, with old and new values | `audit.py` |
| Learned decisions | Per-vendor memory with undo, change and "use for all vendors" | `memory.py`, `decider/cascade.py` |
| Export | `save_all_payload` and the approval guard | `export.py` |

## 3. Rules you must keep (these are product decisions)

1. **Never fill silently.** No default facility, vendor, unit, period or amount. Flag it and let a person fill it.
2. **Facility is the customer's choice**, made before extraction, from their own facilities. A chosen facility is certain; a line left
   unassigned stays unassigned. Same files with different facility choices are a new extraction, not a repeat.
3. **Approval guard.** A row without a formula, a facility and a period cannot be approved, and Save-all never exports it, even if it
   was approved and then edited. Companion rows travel with their parent.
4. **Scope 1 and 2 never use spend.** No quantity on Scope 1/2 means "cannot calculate". Scope 3 falls back to spend-based, flagged.
5. **A bare "Units" on an Indian bill means kWh.** Never convert it to a count. It is flagged for confirmation.
6. **Piece counts (Nos, sets) are never activity data**; the row falls back to spend.
7. **Warnings are never silent fixes.** A warned row is never Ready.
8. **Category 4 vs 9.** Transport we pay for is Category 4, inbound or outbound. Category 9 only when the customer pays.
9. **Credits.** Customers see credits, never USD. Failed calls cost 0 but are counted. An unknown model is charged at the default
   rate and flagged estimated, never free. Refuse a job (HTTP 402) when the balance is 0; stop a running job when it is spent.
10. **Learning is vendor-only by default.** A correction is saved for that vendor and wording (`x:` key). The edit dialog has an extra
    tick-box, "also use it for any vendor" (`d:` key). Automatic memories from a confident AI answer are **unconfirmed** and show as
    Check until a person approves a line that used them. Approval of a line confirms the memory it used.
11. **Labels.** High = methods agree or the user confirmed it before, nothing odd. Check = one method only, unconfirmed memory, or a
    warning. Needs you = open question, missing value, methods disagree, or a failed check. Keep the scores in a tooltip only.
12. **Audit everything a person does**: approve, reject, reset, edit, refused approval, memory undo, change and share.
13. **Never print or store API keys in results, logs or the audit trail.**

## 4. What you must provide or swap in

| Item | Detail |
|---|---|
| Storage | `Memory`, `Ledger`, `AuditLog` and `JobQueue` are SQLite here. Re-implement the same methods on MongoDB, one store per organisation (`org` argument). Memory: `get_decision`, `save_decision`, `list_decisions`, `delete_decision`, `set_decision`, `confirm`, `share_with_all_vendors`, `get_layout`, `save_layout`, `seen`, `mark_seen`, `add_history`, `get_history`, `get_facility_alias`, `save_facility_alias`. |
| Job runner | `JobQueue(path, runner, ...)` takes a plain function `runner(job, cancel_event, set_credits)`. Replace its SQLite table with your real job runner if you have one; keep lanes, per-org cap, cancel and retry. |
| Keys (environment) | `ANTHROPIC_API_KEY` (reading, layouts, last-resort classifier), `OPENROUTER_API_KEY` (Jev), `OPENAI_API_KEY` (OpenAI Decisions). Any classifier key can be missing; the chain skips it. |
| Facilities | Pass the organisation's facilities from the Facilities module: `{id, name, aliases, consumer_numbers, gstins, address_keywords}`. |
| Actor | Pass the signed-in user to the audit trail (the testbench uses an `X-Actor` header). |
| Emergent ids | `category_id`, `subcategory_id` and `emergent_formula_id` are `null` until we receive your JSON export (`EMERGENT_FOLLOWUP.md`). Water and waste schemas are `TBD`. |
| Settings | Expose `mappings/policy.json` (thresholds, waste-transport mode, companions on/off, limits, timing, concurrency caps) as per-organisation settings with these defaults. |

## 5. Endpoints the UI uses (testbench shapes, see `contracts/openapi.json`)

- Jobs: `POST /api/preview` (headers only, no AI), `POST /api/jobs` (files, `mode`, `facilities`, `force`), `GET /api/jobs`, `GET /api/jobs/{id}`,
  `POST /api/jobs/{id}/cancel`, `POST /api/jobs/{id}/retry`, `DELETE /api/jobs/{id}`.
- Review: `PATCH /api/jobs/{id}/items/{item_id}` (body includes `remember` and `scope: "vendor" | "all"`), `POST /api/jobs/{id}/review`
  (`approved | rejected | reset`), `GET /api/jobs/{id}/audit`, save-all export.
- Learned decisions: `GET /api/memory`, `POST /api/memory/forget`, `POST /api/memory/change`, `POST /api/memory/share`, `DELETE /api/memory`
  (decisions only; saved sheet layouts are kept).
- Credits: `GET /api/usage`, `POST /api/usage/grant`.
- Every job and credit call is organisation-scoped in your app; the testbench hard-codes one organisation.

## 6. UI to reproduce (see `testbench/static/` for the SustainRepo look)

Upload page with the facility step and a time and credit estimate; queued/running cards with cancel and retry; Review inbox across all
extractions with an extraction filter; trust label per row with a "Why" dialog (decision, reasons, evidence, history); edit dialog with
the two remember tick-boxes; Learned decisions page with Change, Undo, "Use for all vendors"; Credits and usage page; Documents panel.

## 7. Known gaps (not fixed yet; do not assume they work)

1. **Credit note** is not linked to its original invoice; it shows as an unrelated negative line. Needs a `references_invoice` field and a
   netting rule. **Question for Emergent: can an emission record carry a negative quantity?**
2. **A missing invoice line** (lines add up to less than the subtotal) is detected and flagged but never recovered.
3. **Spreadsheet meter readings** (opening / closing) are not carried into the row, so a wrong meter delta is not caught in Excel (it is in PDFs).
4. **Consumer number vs chosen plant** is not compared.
5. **Non-hazardous waste** can still be classified as hazardous; an explicit-words rule is planned.
6. **Roll-up sheets.** A summary sheet that consolidates other rows is imported as activity; ask the customer to send one entry per record.
7. **Trust percentages** are not measured yet. Labels are rule-based. After about 100 to 200 reviewed lines, calibrate against the audit trail.
8. **75 of 77 testbench memories are unconfirmed AI memories.** On a fresh organisation they start empty.
9. Open items for the product owner: your JSON export, golden-set confirmation, privacy and where it runs, credit terms and markup, a
   second reading provider, price check. Provider prices in `pricing.json` come from the product owner and are not verified against the account.

## 8. How to verify your port

1. `py -3.11 -m pytest engine/tests -q` must pass 116 tests with no network.
2. Upload `golden/testpack/upload/` and compare with `golden/testpack/reviewer/` (answer key and checklist) and `golden/testpack/RESULTS.md`.
3. `py -3.11 golden/evaluate.py` against `golden/expected/` must reach at least 95 % on scope, category, sub-category, quantity and period for
   confirmed rows before go-live.
4. Check: a failed job still records credits spent; cancel stops a running job; a restart turns a running job into "interrupted"; undoing a
   memory does not change lines already reviewed.

## 9. Run the reference locally

```
py -3.11 -m pip install -r engine/requirements.txt
py -3.11 -m uvicorn --app-dir testbench app:app --port 8040
```
Copy `testbench/.env.example` to `testbench/.env` and add your own keys. Never commit real keys.
