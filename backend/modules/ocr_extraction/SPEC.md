# OCR Extraction v2 - specification

Replaces the extraction backend behind SustainRepo's **OCR Extraction** page. The page, History and Save-all stay.
What changes: any invoice, bill, scan, phone photo or Excel file is read; every line is classified to GHG scope /
category / sub-category (plus the Energy, Water and Waste modules) **and** mapped to the Emergent formula fields
Save-all needs to calculate. One line can produce several rows (fuel + well-to-tank, electricity + T&D losses,
waste disposal + waste transport).

The reference implementation is `engine/extractor_core` (Python 3.11, tested). `testbench/` runs it with a review UI.

## 1. Decisions (product owner, 7 Nov 2026)

| Topic | Rule | Where |
|---|---|---|
| Classifier | Jev (`typesafe/jev-1.13`) via OpenRouter; fallback OpenAI Decisions (`gpt-6-luna`), then Claude Haiku | `policy.json > classifier_chain` |
| Waste transport | Waste details (type, quantity or disposal route) on the line -> Cat 5 waste row (Waste module) **and** Cat 4 transport row; money on the transport row. Only "waste transport" -> Cat 4 only. No extra row when the document has its own transport line. | `policy.json > waste_transport`, `derive.py` |
| No quantity | Scope 3 -> spend-based (`spent_value`), flagged. Scope 1/2 -> cannot calculate (Emergent has no spend formula), Needs attention | `policy.json > no_quantity` |
| Ready | Every confidence (classification, quantity, facility, period) >= 90 % **and** no warning or error | `policy.json > review` |
| Freight direction | Transport we pay for = Cat 4 (inbound, outbound, between own sites). Cat 9 only when the customer pays | `policy.json > freight_direction` |
| Missing values | Never fill "Default Facility" or "Corporate Expenditure"; flag instead | `validate.py` |
| v1 scope | Scope 1, 2, 3 (all 15 categories) + Energy, Water, Waste modules | `activity_taxonomy.json` |
| Clients | Mostly Indian factories, multilingual documents, PDFs up to 10 pages, Excel 1-10k rows (50k cap) | `policy.json > limits` |

## 2. Pipeline

```
upload -> normalise -> (Excel) layout map -> rows of raw items
       -> (documents) page images -> vision extraction -> cross-checks -> raw items
       -> group identical items -> classify once per group (memory > rules > Jev > Decisions > Claude)
       -> formula + fields -> companion rows -> checks -> confidence -> review status
```

1. **Normalise** (`normalise.py`). Every sheet, including hidden ones (flagged). Merged cells are un-merged and title
   rows skipped; several tables on one sheet are split at blank rows. PDFs and images become page images, up to 10
   pages; anything longer is flagged. Pages are auto-rotated and contrast-boosted, and blurry, low-resolution or
   low-contrast pages are flagged. A PDF's text layer is kept next to the image.
2. **Excel layout** (`layout.py`). The header fingerprint is looked up in org memory first. Next the heuristics
   (aliases, numeric share, month headers) run. Only then does Claude Haiku see the headers plus 20 sample rows.
   Three shapes are handled:
   - **ledger**: one row per item;
   - **wide_months**: months across the columns; the Indian FY is resolved from the title;
   - **column_items**: dates down the rows, items across.

   Total rows are dropped. The mapping is saved per org, so the next upload of the same layout costs nothing.
3. **Document extraction** (`extract.py`; prompt and schema in `prompts/`). One call per document returns, per invoice:
   - **header**: vendor, GSTIN, invoice no., dates, billing period, consumer no., meter readings;
   - **line items**: printed text plus English, HSN/SAC, quantity, unit, rate, amount, a nature hint, and travel, freight and waste details;
   - **evidence**: page and quote for each line;
   - **per-line confidence**, plus a list of the uncertain fields.

   Taxes, duties and fixed charges are not lines. A utility bill gives one consumption line carrying the total amount.
   Packed goods are totalled (5 × 4.5 kg CO₂ = 22.5 kg).
4. **Cross-checks** (`extract.cross_check`):
   - line amounts add up to the subtotal;
   - quantity × rate ≈ amount;
   - meter readings × multiplier ≈ units billed;
   - the billing period is in order.

   A critical failure in Fast mode triggers one re-read with Sonnet, and the better read is kept.
5. **Group** (`group.py`). Rows with the same cleaned description, unit dimension and vendor are classified once.
   A 10k-row ledger with 300 distinct items costs 300 decisions, not 10k.
6. **Classify** (`decider/`):
   - **Memory**: an exact or description match from earlier user corrections (0.99), or a confident earlier decision.
   - **Rules**: keywords from the taxonomy (description text counts fully, notes only a little) plus:
     - an HSN/SAC prefix table (longest prefix wins);
     - a unit-dimension filter;
     - the "nature" hint;
     - specific-over-generic weighting (a CO₂ refill beats "repair & maintenance"; WTT and T&D lines beat plain fuel or power).
   - **AI**: two-stage questions. Stage 1 asks domain (17 choices), fuel use context and freight direction. Stage 2
     asks the activity within that domain, and is skipped when the rules already chose one in that domain.
   - **Combine**: agreement raises confidence; disagreement gives max × 0.75, the alternative is listed, and the row goes to review.
   - **Questions**: a fuel whose use can't be told (DG set, own vehicle, forklift or transporter) gets a question, not a guess.
   - **Failures**: if every provider fails, the rules' answer is used, capped at 0.8. A provider that returns
     401/402/403 or "no credits", or fails 3 times in a row, is switched off for the rest of the job. The job's metrics
     report it in `providers_disabled`, so a dead key costs at most a few calls, not one per row.
7. **Fields** (`fields.py`). Activity + context -> GHG scope/category/sub-category -> candidate Emergent formulas ->
   the first formula whose required fields are present. Values are converted to canonical units (KL -> L, MT -> kg,
   MWh -> kWh, SCM/CCF -> m³) and each field gets `<key>_unit`. Some lines can't be used as-is:
   - **Piece counts** (Nos, sets) are never used as activity data; the row falls back to spend.
   - **Lump sums**: "1 L for ₹1.3 crore" is treated as a lump sum.
   - **Fugitive gas in pieces**: count × the printed capacity gives kg.
8. **Companions** (`derive.py`), linked by `parent_id`:
   - electricity -> one Cat 3 "T&D losses and Generation" row;
   - fuels -> Cat 3 well-to-tank row;
   - steam -> Cat 3 row;
   - waste + transport split (section 1);
   - argon/CO₂ blends -> Scope 1 CO₂ share + Cat 1 argon share.

   Companion rows never carry money.
9. **Checks** (`validate.py`). Each check is info, warn or error:

   | Check | Level |
   |---|---|
   | Facility (consumer no. > name > address keyword > buyer GSTIN > only facility) | flagged when unmatched |
   | Billing-period split across months (day-weighted) | – |
   | Future period | error |
   | Unit doesn't fit the activity | warn |
   | Price per unit implausible (INR ranges) | warn |
   | Negative quantity | warn |
   | Same file uploaded again | – |
   | Same invoice (GSTIN/vendor + number + total) | warn |
   | Hidden sheet | info |
   | No vendor | info |
10. **Status**. `ask` if there is a question or classification is below 60 %. `ready` only if every confidence is
    at least 90 % and there are no warnings or errors. Otherwise `needs_attention`.

## 3. Review UI changes (on the existing OCR Extraction page)

- Show the **status** (Ready / Needs attention / Question) with filter tabs and counts; keep the scope pill tabs.
- **Classification** shows the scope badge, category and sub-category, the modules, and a decision line: "Rules and Jev agree", "Remembered (your correction)" or "Jev chose X, rules chose Y - please check".
- **Calculation** shows the formula label plus field chips (`qty=500 L`), or "Cannot calculate: Quantity Used missing".
- **Trust label** (High / Check / Needs you) with plain reasons replaces the percentage ring; the scores stay in the tooltip. High = methods agree or you confirmed it before, nothing odd. Check = one method only, unconfirmed AI memory, or a warning. Needs you = open question, missing value, methods disagree, or a failed check. Measured percentages come once enough reviewed lines exist (the audit trail records approvals and edits).
- **Confidence**: overall, with a tooltip per field. **Checks** are listed under the status.
- **Companion rows** are indented under their parent (↳). Approve and reject act on the parent and its companions together.
- **Evidence**: the page image with the quote highlighted (PDF text layer), or the sheet name and Excel row number.
- **Edit / answer** modal with these fields:
  - activity (grouped by domain);
  - fuel use;
  - quantity, unit and amount;
  - period;
  - facility;
  - "Remember for this vendor + item" (on by default).

  Saving recalculates the row and its companions, and confirms the classification.
- **Approve guard**: rows without a formula, facility or period cannot be approved. Save-all refuses them too.
- **Documents panel**: status per file, warnings (image quality, pages cut, cross-check failures), and "lines not recorded" (taxes, fees).
- Large files: paginate 50 parent rows per page; bulk approve / reject on selection.
- **Quantity** shows the value *as printed* (any unit: L, kL, MT, SCM, kWh, kVAh, nights, km, INR...). Only when the
  calculation needs a different unit is a second line shown: "-> 6,500 kg (6.5 t) for calculation". The canonical
  unit exists only because Emergent's formulas expect it; once the export lists `allowed_units` per field, the printed
  unit can be kept whenever it is allowed.
- **Live progress** while a job runs: the progress callback sends `stage`, `done`, `total`, `message`, `items`,
  `files_total`, `files_done`, `credits` and `elapsed`. The UI maps stages to a weighted bar (reading 5-60 %,
  classifying 60-93 %, building 94-99 %), creeps smoothly between events and updates in place.
- **Credits** used by the extraction are shown on the job card and the review summary.

The testbench (`testbench/static/`) implements all of the above in the SustainRepo look and can be copied from.

## 4. Data contracts

- `contracts/extracted_row.schema.json` - one review-table row (validated against 89 real rows).
- `contracts/save_all.schema.json` - the payload Save-all receives (`engine/extractor_core/export.py` builds it).
- `contracts/openapi.json` - the job / review / export endpoints, as the testbench exposes them.
- `mappings/formula_fields.json` - formula -> field keys, labels, dimensions, required.
  - `emergent_formula_id` is filled from Emergent's JSON export.
  - `water_volume` and `waste_mass` are TBD until Emergent confirms the Water/Waste record schema.
- `mappings/activity_taxonomy.json` - 155 activities in 17 domains -> GHG, formulas, companions and keywords.
  - `category_id` and `subcategory_id` are filled from Emergent's export.

## 5. Acceptance criteria

1. Every file type in section 2 is read; a bad file never stops the batch (status `error` with a reason).
2. Every row either has a formula with all required fields, or is flagged (`needs_quantity`, `cannot_calculate`, `spend_based`).
3. Nothing is filled silently: no default facility, vendor, unit or period.
4. A 10k-row Excel uses one classifier decision per distinct item. The test `test_big_sheet_classifies_unique_items_only` covers 3,000 rows -> 3 groups.
5. If Jev times out or errors, the next provider answers and no row is lost (`test_fallback_when_jev_fails`).
6. A correction applies automatically to the same vendor + item in the next upload.
7. Golden set (`golden/REPORT.md`): scope, category, sub-category, quantity and period at least 95 % on confirmed expected rows before go-live.
8. `pytest engine/tests` passes: 116 tests.

## 6. Cost and speed (measured 7 Nov 2026)

| | |
|---|---|
| Excel, no AI needed for layout (42 files, 527 rows) | 1.7 s |
| Jev decision | ~1.7 s, ~$0.00005 per call |
| Document read (Haiku, 1-3 pages) | 4-10 s, ~5-17k input tokens |
| 20-file golden set incl. 2 large Excel files | 156 s, 329 rows |
| Synthetic 10,000-row ledger (147 distinct items) | 34 s, 174 Jev calls, $0.009, no layout AI call |

## 7. Credits (customer usage across every AI provider)

Every AI call - document read, re-read, Excel layout, classifier - becomes one normalised **usage event**:
`{step, provider, model, calls, ok, input_tokens, output_tokens, seconds, cost_usd, cost_basis, estimated, credits}`.

- `credits = cost_usd x markup / usd_per_credit` (defaults: 1 credit = $0.001, markup 1.0), all in `mappings/pricing.json`.
- Cost basis per model: `tokens` (price per 1M in/out, optional long-context tier), `reported` (provider returns the
  cost, e.g. OpenRouter `usage.cost`) or `per_call`.
- **Adding a model = one entry in `pricing.json`** keyed `provider:model`. An unknown model is charged at the `default`
  rate and flagged `estimated` - never free. Failed calls cost 0 but are counted.
- `engine/extractor_core/usage.py`: `event()`, `from_llm_call()`, `from_classifier_call()`, `summarise()`, and
  `Ledger` (SQLite `usage_events` + `credit_grants`; `record`, `grant`, `balance`, `report`). For Mongo, implement the
  same methods. The pipeline result carries `usage: {events, total, by_step, by_model}`; record the events once per job.
- Testbench endpoints: `GET /api/usage?days=30` (balance, per-day, per-step, per-model, per-job, estimate per page) and
  `POST /api/usage/grant {credits, note}`. Customers see credits only; USD is internal.

### Safeguards (added 9 Nov 2026)
- **Credit gate:** a job is refused (HTTP 402) when the balance is 0, and `Engine.run(budget=remaining)` stops with
  `OutOfCredits` once the balance is spent. Calls already made are recorded, including document reads on a failed job.
- **Upload limits** (`policy.json -> limits`): `max_files` 30, `max_file_mb` 25, supported types only (415 otherwise).
- **Bare "Unit(s)"** stays kWh (Indian bills): it is flagged for confirmation, never converted to a count.
- **Approval guard:** `export.approval_blockers` holds back rows without formula, facility or period (with their linked
  rows), and Save-all never exports such a record even if it was approved and later edited.
- **Review inbox:** `#review` lists every pending line across extractions with an extraction filter; `#review/<id>`
  is one extraction. Extraction confidence (classification, quantity, period) is shown apart from "Facility not set".

### Audit trail and plausibility checks (added 9 Nov 2026)
- **Audit trail** (`engine/extractor_core/audit.py`, `GET /api/jobs/{id}/audit`): every approve, reject, reset, edit and refused
  approval is logged with who, when and old -> new values (quantity, unit, amount, period, facility, activity, review state).
  The Why dialog on each row shows its history. The testbench actor is "reviewer" (or an `X-Actor` header); Emergent passes the user.
- **Plausibility checks** (`engine/extractor_core/plausibility.py`) add warnings, never silent changes, and a warned row is never Ready:
  `bad_number` (letter O in a number, decimal comma), `bad_date`, `future_date`, `date_period_conflict`, `possible_duplicate`
  (same activity, quantity, month and amount or facility, also across a PDF and a spreadsheet), `series_gap` (blank or "-" month),
  `series_outlier` (5x off the other months), `double_count_upstream`, `document_check` (meter / total arithmetic from the document
  now reaches its rows) and `history_outlier` (5x off the median of earlier approved months, `Memory.add_history` on approval).
- A unit written inside a spreadsheet cell ("0.55 KL" in a litres row) is honoured. A sheet with one reading per row and a
  generic quantity column ("Billed consumption") is read as a ledger, not as one item per column.
- **Test pack:** `golden/testpack/` holds the 7 upload files, the reviewer answer key and `RESULTS.md` (what passes, what is open).

### Job queue and speed (added 9 Nov 2026)
- **Queue** (`engine/extractor_core/jobqueue.py`): every upload is queued and runs when a slot is free. Two lanes: *light* (spreadsheets
  only, 2 slots) and *heavy* (anything with a PDF or image, 3 slots), at most 2 running jobs per organisation (`policy.json -> timing`).
  States: queued, running, done, failed, cancelled, interrupted. A queued job shows its place in line and a rough wait.
- **Cancel / retry / restart:** `POST /api/jobs/{id}/cancel` and `/retry`. A cancel stops the job at the next safe point; credits already
  spent are recorded. After a server restart a running job becomes *interrupted* (its spend so far goes on the ledger) and can be retried;
  queued jobs start again by themselves. The balance is checked again when a queued job starts.
- **Global AI call cap** (`limits.py`, `policy.json -> concurrency_caps`): at most 8 Claude calls and 16 classifier calls at once across
  all jobs, so several uploads cannot trip a provider's rate limit.
- **Classify while reading:** lines of a file are classified as soon as that file is read, while other files are still being read.
- **Repeat upload:** the exact same files (by content hash) offer the earlier result instantly, free; "Run again" sends `force=true`.
- **Time estimate** on the Upload page: files are read 4 at a time, so about `4 s + max(slowest file, total / 4)` using
  `sec_per_page_fast / think` and `sec_per_sheet` from `policy.json -> timing`.

### Facility chosen by the customer (added 9 Nov 2026)
- Facility is no longer guessed from the document. After upload, before extraction starts, the Upload page asks (screenshot flow):
  a spreadsheet with a facility column shows each distinct name with a suggested match (name, alias, meter number, or "you chose this
  before") for the customer to confirm or change; a file with no facility information gets one dropdown; sheets that look like
  different facilities get a dropdown per sheet; "Use the same facility for every file" applies one choice to everything. Every
  choice is one of the customer's own facilities, or "Assign later / Leave unassigned".
- `POST /api/preview` reads only the headers (no AI) and returns facility names per sheet plus the customer's facilities.
  `POST /api/jobs` takes `facilities` = JSON `{file: {default | map{name: id|null} | sheets{sheet: id|null}}}`.
- A chosen facility is certain (method "chosen by you", confidence 1.0). A line left unassigned stays unassigned; it is never
  auto-matched. Confirmed name mappings are remembered per organisation (`Memory.save_facility_alias`).
- Same files with different facility choices are not treated as a repeat upload.
- In SustainRepo the facility list comes from the Facilities module; the testbench reads it from its settings.

## Learned decisions (memory)
- A correction is remembered for **that vendor only** (key `x:`). The edit dialog has an extra tick-box, "also use it for any vendor", which also saves the wording-only key (`d:`).
- Decisions saved automatically from a confident AI answer are **unconfirmed** (`source=auto`); approving a line that used one makes it confirmed (`source=user`). A remembered but unconfirmed decision shows as **Check**, not High.
- The Learned decisions page lists each memory with Change, Undo and "Use for all vendors". "Forget all decisions" no longer deletes sheet layouts. Endpoints: `GET /api/memory`, `POST /api/memory/forget|change|share`. Each action is written to the audit trail.
