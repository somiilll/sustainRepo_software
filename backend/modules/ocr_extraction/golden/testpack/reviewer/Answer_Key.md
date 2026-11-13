# Sustainability OCR test pack - reviewer answer key

All organizations, sites, vendors and transactions are fictional. Reference date: 9 November 2026.

Upload only the files in Upload. Keep this answer key out of the extraction system. The workbook contains deliberate errors; do not repair them before uploading.

## Facility context

Set up Plant A - Chakan (alias Chakan Plant, consumer DEMO-A-001), Plant B - Vadodara (consumer DEMO-B-002), and Corporate Office. Keep Plant Z unknown. These are test identifiers, not real accounts. If you do not configure facilities, unmatched-facility warnings are expected and should not be scored as extraction failures.

## How to run

1. Upload the workbook alone; check every sheet and compare against the cases below.
2. Upload invoices individually. Then upload the diesel invoice and its scanned copy together to test duplicates.
3. Re-upload a file to check cross-job duplicate handling.
4. Check extracted values, units, periods, invoice IDs and evidence separately from classification, readiness and export eligibility. Correct classification does not establish calculation readiness.
5. Record actual outcomes in the separate CSV checklist. PASS means every listed expectation was met; PARTIAL means some were met; FAIL means a wrong value was silently accepted. An appropriate clarification counts as correct when evidence is ambiguous.

Classification expectations are test intentions, subject to the configured organizational boundary and supported calculation methods. No emission factors or emissions totals are supplied. Do not infer complete accounting accuracy from a passed extraction.

## Workbook cases

| Sheet | Location | Record | Expected handling |
|---|---|---|---|
| Invoice Register | row 2 | R01 | Valid control. Scope 1 stationary fuel; 100 L. Upstream fuel may be a linked record. |
| Invoice Register | row 3 | R02 | Numeric text with grouping. 1,250 kL = 1,250,000 L; water withdrawal. |
| Invoice Register | row 4 | R03 | Units may mean kWh ONLY because electricity context establishes it; ask/confirm if needed. |
| Invoice Register | row 5 | R04 | Counts are equipment units, never kWh; capital goods, typically spend-based unless suitable physical factor. |
| Invoice Register | row 6 | R05 | Missing unit: ask; do not infer L from diesel alone. dd/mm vs mm/dd date needs locale or clarification. |
| Invoice Register | row 7 | R06 | Valid refrigerant top-up control. Scope 1 fugitive activity; do not convert kg to cylinders. |
| Invoice Register | row 8 | R07 | Exact duplicate of R01; same invoice/vendor/date/quantity/amount. Do not count twice. |
| Invoice Register | row 9 | R08 | Credit note, not positive consumption. Link original invoice; reconcile signed reversal before acceptance. |
| Invoice Register | row 10 | R09 | Valid explicit zero; preserve zero instead of treating it as missing. |
| Invoice Register | row 11 | R10 | Impossible calendar date. Quantity 2.5 metric tonnes = 2,500 kg. |
| Invoice Register | row 12 | R11 | Invoice date is future relative to test date 2026-11-09 and conflicts with service period. |
| Invoice Register | row 13 | R12 | Valid spend-only service. Preserve USD; require documented conversion if engine only supports INR. |
| Invoice Register | row 14 | R13 | European decimal convention: intended EUR 1,250.50; confirm locale rather than drop separators blindly. |
| Invoice Register | row 15 | R14 | Quantity has letter O, not zero. Ask for correction; do not silently parse 1 or 100. |
| Invoice Register | row 16 | R15 | Physical quantity present but amount missing. Preserve mass and do not invent zero spend. |
| Invoice Register | row 17 | R16 | Quantity absent, amount available; may use supported spend method, disclose fallback. |
| Invoice Register | row 18 | R17 | Mass only; no distance. Do not manufacture tonne-km; ask for distance or supported spend fallback. |
| Invoice Register | row 19 | R18 | Customer use of sold products; not our Scope 2. Lifetime period must remain explicit. |
| Invoice Register | row 20 | R19 | Explicit upstream row: not direct combustion. Reconcile with auto-generated WTT for R01; avoid duplication. |
| Invoice Register | row 21 | R20 | Lessor context: downstream leased assets candidate; rental income alone does not establish emissions factor. |
| Invoice Register | row 22 | R21 | Incompatible quantity dimension. Do not convert kg into energy; ask for corrected unit. |
| Invoice Register | row 23 | R22 | Unknown facility. Must remain unmatched, not auto-assigned to a similar known site. |
| Invoice Register | row 24 | R23 | Negative quantity with positive cost and no credit context: flag sign inconsistency. |
| Invoice Register | row 25 | R24 | Valid alternate unit: 1.5 kL = 1,500 L; preserve original and normalized units. |
| Monthly Matrix | row 5 | M01 | Four distinct monthly records; do not import a total as an extra period. |
| Monthly Matrix | row 6 | M02 | July 450 L, August 500 L, September 550 L, October 600 L; total 2,100 L. Never sum 450 + 500 + 0.55 + 600 as if same units. |
| Monthly Matrix | row 7 | M03 | September blank is missing, not zero. Do not invent complete four-month total. |
| Monthly Matrix | row 8 | M04 | September dash is ambiguous/missing, not proven zero. Ask. |
| Monthly Matrix | row 9 | M05 | Trips alone lack distance and occupancy for many activity methods; request needed inputs. |
| Monthly Matrix | row 10 | M06 | Explicit zero months are valid. 8 kg only in September. |
| Monthly Matrix | row 11 | M07 | 9.5/10/10.2/11 MWh = 9,500/10,000/10,200/11,000 kWh. Keep period/facility separate. |
| Monthly Matrix | row 12 | M08 | August is numeric text 15. Four months, 51 room nights total; retain room-night dimension. |
| Site Log | row 5 | L01 | Valid operational scrap recycling control; 1,200 kg. |
| Site Log | row 6 | L02 | Facility inherited from merged C5:C7; 75 kL = 75,000 L. |
| Site Log | row 7 | L03 | 5 cylinders of nominal 4.5 kg are not proof of 22.5 kg released/refilled. Ask actual gas mass/refill basis. |
| Site Log | row 8 | L04 | Purchased lubricant/oil for maintenance, not fuel burned; do not classify as combustion. |
| Site Log | row 10 | header | Repeated table header; skip it. Blank row 9 also skipped. |
| Site Log | row 11 | L05 | Third-party effluent treatment; distinguish waste/wastewater from chemical purchases. |
| Site Log | row 12 | L06 | Facility inherited from merged C11:C13. Hire service, not direct fuel quantity; clarify control if needed. |
| Site Log | row 13 | L07 | Contractor-controlled diesel; do not assume our Scope 1. Clarify purchased transport/service context. |
| Site Log | row 14 | L08 | Customer end-of-life of sold products, not our operational waste. |
| Site Log | row 15 | SUBTOTAL | Subtotal formula = 83,800 INR; do not import as another purchase. |
| Site Log | row 16 | L09 | Deliberate #DIV/0! (12000/0): flag formula error. Not an invoice amount or an extra 12,000 kWh purchase. |
| Meter Readings | row 2 | E01 | Valid 2,500 kWh control. |
| Meter Readings | row 3 | E02 | Read delta 2,500 kWh vs billed 2,600: flag mismatch; do not silently overwrite either. |
| Meter Readings | row 4 | E03 | Meter replacement: opening/closing cannot be directly subtracted across meters. Ask replacement details; do not use negative consumption. |
| Meter Readings | row 5 | E04 | Valid 11,000 kWh including x10 multiplier, not 1,100. |
| Meter Readings | row 6 | E05 | Duplicate of E04 despite new row ID and different note; do not double count. |
| Meter Readings | row 7 | E06 | 3,000 kWh spans Oct/Nov. If allocating by inclusive service days: Oct 17/31, Nov 14/31. Label allocation assumption; do not lose November. |
| Meter Readings | row 8 | E07 | Consumer DEMO-A-001 belongs to Plant A, but row says Plant B. Ask; also future end date relative to 2026-11-09. |

## Invoice cases

| File | Document | Expected handling |
|---|---|---|
| 02_Diesel_Invoice.pdf | FUEL-1001 | Valid control: 100 L diesel, INR 9,000 pre-tax, INR 1,620 GST, INR 10,620 total. Scope 1 stationary DG fuel, plus eligible linked upstream activity. Same transaction as workbook R01/R07; detect duplicates across formats. |
| 03_Electricity_Bill.pdf | GRID-2026-1002 | Flag meter delta 2,500 vs billed 2,600 kWh. Flag current total: 21,800 + 3,924 = 25,724, not printed 25,824 (difference 100). Printed total due 30,824 includes 5,000 arrears; do not treat arrears or GST as consumption. Consumer DEMO-B-002 conflicts with printed Plant A. Service interval spans Sep/Oct; inclusive allocation, if used, is Sep 16/30 and Oct 14/30. Do not assign all usage to invoice month silently. |
| 04_Maintenance_Invoice.pdf | MAINT-2026-1003 | Flag absent facility and ambiguous 10/11/26 date (DD/MM gives 10 Nov 2026, future vs reference date; MM/DD gives 11 Oct). CO2: 5 Nos x nominal 4.5 kg is not measured refill/release mass; request service card. ABC service is not direct GHG refill. Hydraulic oil quantity has letter O in 1O0; flag numeric ambiguity. Maintenance oil is purchased material, not combustion. Arithmetic totals are consistent. |
| 05_Waste_and_Hauling.pdf | HAUL-2026-1004 | Extract four line amounts: 7,800 / 1,500 / 500 / 5,200. Distinguish handling, hauling and treatment. Mass 6.5 t = 6,500 kg is the SAME consignment across two stages; not 13 t of waste generated. No distance: do not invent tonne-km. No treatment manifest: do not assert landfill/incineration. Surcharge is money, not litres burned. Contractor control and accounting policy determine transport boundary; ask rather than assume own Scope 1. |
| 06_Diesel_Credit_Note.pdf | CN-2026-1005 | Preserve -20 L, -1,800 pre-tax, -324 GST and -2,124 total. Link FUEL-1001. After reconciling one original invoice and one credit, net delivery is 80 L and INR 7,200 pre-tax. Do not sum absolute values or count duplicate copies. |
| 07_Diesel_Scanned_Copy.jpg | FUEL-1001 | Readable image-only version of 02_Diesel_Invoice.pdf with mild rotation, lower contrast and JPEG compression. Extract same 100 L/9,000 pre-tax/10,620 total. Detect as duplicate if uploaded with original; do not count as new purchase. |

## Deliberate errors versus valid differences

Only Site Log!G16 is an intentional Excel formula error (#DIV/0!). Dates and numbers stored as text are deliberate format tests; they must not be automatically scored as invalid when unambiguous. No macros, external links, real personal information, real tax IDs, or real account details are included. The 01 workbook has four sheets and 50 keyed reviewer cases. Matrix records expand into monthly observations. Repeated headers, blank lines, subtotals and the ratio row are not extra invoice transactions.

The supplied files are fixtures, not a completed run of the application. The expected handling describes what to check; some cases correctly require clarification rather than a single inferred value.
