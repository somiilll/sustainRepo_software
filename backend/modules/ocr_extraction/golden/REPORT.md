# Golden-set report

Run 07 Nov 2026 18:20, with AI, 249.0 s. 20 files, 329 rows, 24 Ready.

Expected rows marked **draft** were written from the documents by the engineer and must be confirmed by the product owner before these numbers are used to tune the Ready threshold.

| Field | Accuracy (files with expected rows) |
|---|---|
| scope | 100% |
| category | 100% |
| subcategory | 100% |
| quantity | 100% |
| period | 100% |

## Why rows are not Ready (rows per reason)

| Reason | Rows |
|---|---|
| facility_unmatched | 176 |
| spend_based | 83 |
| low confidence | 69 |
| unclear_on_document | 35 |
| unit_dimension | 25 |
| unit_note | 23 |
| cannot_calculate | 18 |
| needs_quantity | 15 |
| negative | 9 |
| future_period | 8 |
| unit_price | 2 |
| no_period | 1 |

## Per file

| File | Expected | Got | Matched | Scope | Category | Sub-cat | Qty | Period | Ready | Prototype agreement |
|---|---|---|---|---|---|---|---|---|---|---|
| waste_transportation_invoice.pdf (draft - written by the engineer from the document; product owner to confirm) | 3 | 4 | 3 | 100% | 100% | - | 100% | 100% | 0 | - |
| UCPL - 0701  MSEDCL BILL October - 2025 177529058940.pdf (draft - written by the engineer from the document; product owner to confirm) | 2 | 2 | 2 | 100% | 100% | - | 100% | 100% | 0 | - |
| Fire Extinguisher.pdf (draft - written by the engineer from the document; product owner to confirm) | 4 | 4 | 4 | 100% | 100% | - | 100% | 100% | 0 | - |
| Diesel Hydra.png (draft - written by the engineer from the document; product owner to confirm) | 1 | 2 | 1 | 100% | 100% | - | 100% | 100% | 0 | - |
| raw_material_purchase_invoice.pdf (draft - written by the engineer from the document; product owner to confirm) | 4 | 4 | 4 | 100% | 100% | 100% | 100% | - | 0 | - |
| indigo_business_travel_invoice.pdf (draft - written by the engineer from the document; product owner to confirm) | 1 | 1 | 1 | 100% | 100% | - | - | - | 0 | - |
| Calibration of DP Type Flow Transmitter.pdf (draft - written by the engineer from the document; product owner to confirm) | 0 | 0 | 0 | 100% | 100% | - | - | - | 0 | - |
| MPCB Consent Location-07.pdf (draft - written by the engineer from the document; product owner to confirm) | 0 | 0 | 0 | 100% | 100% | - | - | - | 0 | - |
| 10.LPG JAN.2026.PDF | - | 20 | - | - | - | - | - | - | 0 | - |
| DVVNL_aug-25.pdf | - | 2 | - | - | - | - | - | - | 0 | - |
| March-26 final-Dumad Grid Electricity.pdf | - | 2 | - | - | - | - | - | - | 0 | - |
| 6. Contract vehicle payment agreement 2.pdf | - | 10 | - | - | - | - | - | - | 0 | - |
| MULTRA.pdf | - | 6 | - | - | - | - | - | - | 0 | - |
| Argon Gas Consumption.png | - | 1 | - | - | - | - | - | - | 0 | - |
| LPG Bill.png | - | 3 | - | - | - | - | - | - | 0 | - |
| Schlumberger Luanda-By Sea Invoice.pdf | - | 3 | - | - | - | - | - | - | 0 | - |
| transport_distribution_to_plant.pdf | - | 3 | - | - | - | - | - | - | 0 | - |
| water_supply_invoice.pdf | - | 1 | - | - | - | - | - | - | 0 | - |
| 0f3cbfcda168_A_edge_case_test_ledger.xlsx | - | 189 | - | - | - | - | - | - | 0 | 90% of 133 |
| 0e062129a080_scope3_and_org_context_stress_test.xlsx | - | 72 | - | - | - | - | - | - | 24 | 92% of 64 |

## Where the old prototype and the engine disagree (sample)

Not automatically errors - several are the prototype's known mistakes (e.g. outbound freight as Cat 9).

| File | Item | Prototype | Engine | Engine's reason |
|---|---|---|---|---|
| 0f3cbfcda168_A_edge_case_test_ledger.xlsx | Diesel for Forklift | scope_1/stationary_combustion | scope_1/mobile_combustion | Rules and jev agree (keywords ['diesel']) |
| 0f3cbfcda168_A_edge_case_test_ledger.xlsx | Scrap Metal Sale | scope_3/cat_1 | scope_3/cat_5 | Rules and jev agree (keywords ['scrap metal']) |
| 0f3cbfcda168_A_edge_case_test_ledger.xlsx | Document Courier Express | scope_3/cat_1 | scope_3/cat_4 | Rules and jev agree (keywords ['courier']) |
| 0f3cbfcda168_A_edge_case_test_ledger.xlsx | Water Supply Bill | water/water_consumption | water/water_withdrawal | Rules and jev agree (keywords ['water supply']) |
| 0f3cbfcda168_A_edge_case_test_ledger.xlsx | Municipal Water Supply | water/water_consumption | water/water_withdrawal | Rules and jev agree (keywords ['municipal water', 'water supply']) |
| 0f3cbfcda168_A_edge_case_test_ledger.xlsx | Water Supply May | water/water_consumption | water/water_withdrawal | Rules and jev agree (keywords ['water supply']) |
| 0f3cbfcda168_A_edge_case_test_ledger.xlsx | Employee Transport | Unknown/Unknown | scope_3/cat_7 | Rules and jev agree (keywords ['employee transport']) |
| 0f3cbfcda168_A_edge_case_test_ledger.xlsx | Server Hardware | scope_3/cat_1 | scope_3/cat_2 | Rules and jev agree (keywords ['server']) |
| 0f3cbfcda168_A_edge_case_test_ledger.xlsx | Network Cable | scope_3/cat_6 | scope_3/cat_1 | Rules and jev agree (keywords ['cable']) |
| 0f3cbfcda168_A_edge_case_test_ledger.xlsx | Road Freight Mumbai to Delhi | scope_3/cat_6 | scope_3/cat_4 | Rules and jev agree (keywords ['freight']) |
| 0f3cbfcda168_A_edge_case_test_ledger.xlsx | Courier Express Parcel Delivery | scope_3/cat_6 | scope_3/cat_4 | Rules and jev agree (keywords ['courier', 'parcel']) |
| 0f3cbfcda168_A_edge_case_test_ledger.xlsx | Logistics Transportation of Raw Materials | scope_3/cat_6 | scope_3/cat_4 | Rules and jev agree (keywords ['logistics']) |
| 0e062129a080_scope3_and_org_context_stress_test.xlsx | Road Freight Outward - Finished Cables Delivery to Customer Project Site | scope_3/cat_9 | scope_3/cat_4 | Rules and jev agree (keywords ['freight']) |
| 0e062129a080_scope3_and_org_context_stress_test.xlsx | FCL 40ft Sea Freight Outbound - Export Dispatch of Finished Cables to Hamburg Buyer | scope_3/cat_9 | scope_3/cat_4 | Rules and jev agree (keywords ['sea freight', 'fcl']) |
| 0e062129a080_scope3_and_org_context_stress_test.xlsx | Courier express dispatch to customer retail branch network | scope_3/cat_9 | scope_3/cat_4 | Rules and jev agree (keywords ['courier']) |
| 0e062129a080_scope3_and_org_context_stress_test.xlsx | Outbound freight forwarding charges for dealer distribution network | scope_3/cat_9 | scope_3/cat_4 | Rules and jev agree (keywords ['forwarding']) |
| 0e062129a080_scope3_and_org_context_stress_test.xlsx | Franchised retail store operations electricity and energy spend (25 stores) | scope_3/cat_14 | scope_2/purchased_electricity | Rules and jev agree (keywords ['electricity']) |
