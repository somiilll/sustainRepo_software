# Test pack results (9 Nov 2026)

Scored against `reviewer/Answer_Key.md`. PASS = every expectation met; PARTIAL = some met; FAIL = a wrong value is accepted without a flag; OPEN = needs a decision or is not built.
Evidence: automated tests in `engine/tests/test_testpack.py` (workbook, no AI, free) and live runs in the testbench (real classifier and vision model, about 31 credits in total).
Test facilities were configured as the key describes (Plant A - Chakan, Plant B - Vadodara, Corporate Office; Plant Z unknown).

## Before and after this round of changes

The first live run found these wrong values accepted silently. They are now flagged and cannot be "ready":

| Case | First run | Now |
|---|---|---|
| R07 exact duplicate of R01 | both "ready" | second one flagged `possible_duplicate` |
| R10 date 31/02/2026 | accepted, period 2026-02 | flagged `bad_date` |
| R11 invoice date 2027-10-15 | "ready" | flagged `future_date` + `date_period_conflict` |
| R13 `1.250,50` EUR | read as 1.25 | flagged `bad_number` (decimal comma) |
| R14 `1O0` kg | read as 1 | flagged `bad_number` (letter O) |
| M02 September `0.55 KL` in a litres row | 0.55 L | read as 550 L (unit inside the cell is honoured) |
| M03 / M04 blank or `-` September | silently three months | flagged `series_gap` on the other months, nothing invented |
| R19 explicit upstream fuel next to auto-added one | both "ready" | flagged `double_count_upstream` |
| E05 repeats E04 (11,000 kWh) | not caught | flagged `possible_duplicate` |
| Meter Readings sheet | every column (Record ID, Opening, Closing...) became an electricity row | one row per reading, kWh |
| 03 electricity bill: meter delta 2,500 vs billed 2,600 | warning on the document only; row "ready" | warning copied to the row; row needs attention |
| 05 hauling: lines add to 14,500, subtotal 15,000 | warning on the document only | warning copied to the row |

## Still open

| Case | Status | What is missing |
|---|---|---|
| R04 "2 units" CNC machine read as 2 kWh | FAIL | A bare "Units" is kWh by design (Indian bills). A machine count is not electricity; this needs your decision (see the change list, item 1). |
| R08 / 06 credit note | PARTIAL | Negative quantity is flagged, but the credit note is not linked to FUEL-1001 and no net (80 L) is shown. |
| R10 classified as hazardous landfill | PARTIAL | The description says non-hazardous; the classifier chose the hazardous activity. |
| R12 USD amount | PARTIAL | USD preserved and spend-based, but no documented conversion to INR. |
| E02 / E03 meter delta vs billed, meter replacement | OPEN | The reading columns (Opening, Closing, Multiplier) are not carried into the row, so the delta cannot be checked for spreadsheets. PDFs already check it. |
| E06 cross-month service period (Oct/Nov) | OPEN | Allocation by days works for PDFs; the spreadsheet path takes the period start month only. |
| E07 consumer DEMO-A-001 vs "Plant B" | OPEN | Consumer number and facility name disagree; not detected. |
| 03 bill: printed total 25,824 vs 21,800 + 3,924, arrears 5,000, consumer vs printed plant | PARTIAL | The model misread the line amount as 30,824 (caught by quantity x rate); the total arithmetic and consumer/plant conflict are not checked. |
| 05 hauling: four line amounts | PARTIAL | Only three lines were extracted (the 500 surcharge was missed); the mismatch is now flagged. |
| 04 maintenance invoice | NOT RE-RUN | First run only. |
| L03 / L07 / L08 and other classification-intent cases | NOT SCORED | Need a person to review the live results. |
