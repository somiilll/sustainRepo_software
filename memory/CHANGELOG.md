# ESG Platform Changelog

## September 21, 2026 — Scope 3 Grid Power Label
- Changed the shared Scope 3 Subcategory display label from **Energy** to **Grid Power** for C8, C10, C11, C13, and C14. The stored `energy` value, factor matching, calculations, decision trees, and historical records are unchanged.
- Aligned Super Admin Scope 3 EF presentation: the table, factor details, and editor display **Grid Power** while continuing to save `energy`.
- **SOURCE-REVIEWED ONLY; NO FUNCTIONAL ADD/EDIT TESTING** per the user’s instruction.

## September 21, 2026 — Emissions Reset Widths Placement
- Moved **Reset widths** from the Emissions grid toolbar to the right side of the Scope tabs row. The grid exposes the same reset action through a ref, so it still clears manual column widths and returns the ledger scroll position to the start.
- **SOURCE-REVIEWED ONLY; NO FUNCTIONAL UI TESTING** per the user’s instruction.

## September 21, 2026 — C3/C5 Bulk Activity Type Persistence
- Aligned Bulk Upload with Manual Add/Edit and OCR: after resolving an exact Scope 3 factor, C3/C5 records now persist the matched factor’s canonical `activity_type` into both top-level `scope3_activity_type` and `dynamic_field_values.scope3_activity_type`.
- Explicit spreadsheet Activity Type remains authoritative for C6/C7, preserving existing template behavior. C3/C5 need no new spreadsheet column, formula, EF, or decision-tree change. **SOURCE-REVIEWED ONLY; NO FUNCTIONAL BULK-UPLOAD TESTING** per the user’s instruction.

## September 21, 2026 — C5 Disposal Taxonomy and Add/Edit Filtering
- Added the C5 Activity Type capability and shared selector support. C5 users select a disposal method first, then a base Activity; the selected factor ID remains the exact existing EF record.
- Applied `migrate_c5_activity_taxonomy.py` to all 184 local C5 factor records. It preserved every original `activity` string and factor ID while adding `activity_name`, normalized `activity_type`, and `activity_type_label`. Copper Wire now presents as one Activity with Combusted, Landfilled, and Recycled types. Backup: `/app/.emergent/backups/c5-activity-taxonomy-20260921T090000Z`.
- Added **Composted** and **Other** to preserve all current C5 records, including Waste Water Treatment. The migration normalizes legacy double-spacing in the Wet Digestate display label without altering the original stored Activity string. Structural validation found zero records missing taxonomy fields. **MIGRATION PREFLIGHT AND STRUCTURAL VALIDATION ONLY; NO FUNCTIONAL ADD/EDIT TESTING** per the user’s instruction.
- Updated C5-only Add/Edit layout: base Activity appears first with duplicate material names collapsed, followed by Activity Type. All other Scope 3 categories retain Type-before-Activity flow. **SOURCE-REVIEWED ONLY; NO FUNCTIONAL TESTING** per the user’s instruction.
- C5 Activity Type now lists only disposal methods available for the selected base Activity. Factors classified as `other`, including Waste Water Treatment, do not show an unnecessary Activity Type field. **SOURCE-REVIEWED ONLY; NO FUNCTIONAL TESTING** per the user’s instruction.
- Fixed the C5 selector regression where selecting one Activity Type caused the menu to show only that same type. Add/Edit now derive available C5 disposal types from the complete C5 catalog for the selected base Activity. **SOURCE-REVIEWED ONLY; NO FUNCTIONAL TESTING** per the user’s instruction.
- Fixed the C5 selection-state collision: Add/Edit now keep base material separately for presentation and reserve `scope3_ef_id` for the exact Activity + Activity Type factor. Changing type resolves the matching factor without clearing Activity; selecting a typed material clears only the stale factor until a valid type is chosen. **SOURCE-REVIEWED ONLY; NO FUNCTIONAL TESTING** per the user’s instruction.
- C5 Edit now lays out Activity and Activity Type in the same responsive row. It persists the exact factor ID (`scope3_ef_id`) plus normalized Activity Type (`scope3_activity_type`); `activity_name` is deliberately not duplicated in the emission payload because it is deterministically available from the factor ID. **SOURCE-REVIEWED ONLY; NO FUNCTIONAL TESTING** per the user’s instruction.
- Fixed C5 detection in Edit to recognize its canonical category code, not only a display label beginning with `C5`. Waste Water Treatment now correctly omits Activity Type because its factor taxonomy is `other`. **SOURCE-REVIEWED ONLY; NO FUNCTIONAL TESTING** per the user’s instruction.
- C5 Version History now hides `scope3_activity_type` / `activity_type` change rows without removing audit data. C3, C6, C7, and all non-C5 records continue showing relevant activity-type changes. **SOURCE-REVIEWED ONLY; NO FUNCTIONAL TESTING** per the user’s instruction.

## September 21, 2026 — Scope 1/2 Formula Clone Destinations
- Formula Builder’s clone dialog now offers approved Scope 3 formula-group destinations plus every configured Scope 1 and Scope 2 category/subcategory.
- Direct Scope 1/2 cloning creates an independent formula record with the target category/scope assignment and source-formula traceability; it intentionally does not alter any decision tree. Backend validation rejects direct destinations outside Scope 1/2, preserving Scope 3 group governance.
- **SOURCE-REVIEWED ONLY; NO FUNCTIONAL UI OR API TESTING** per the user’s instruction.

## September 21, 2026 — Group-Aware Bulk Upload and OCR
- Scope 3 Bulk Upload now passes the resolved formula’s `activity_formula_group_id` through calculation context and formula definition, allowing Calc Engine to use the matching group-owned field mapping for default-unit and allowed-unit validation.
- OCR GHG-save now carries the resolved formula group to execution and prioritizes that group’s mapping while hydrating activity inputs. Legacy mappings remain the fallback for non-group formulas and spend/supplier flows.
- Workbook column names, Bulk Upload templates, formula definitions, emission-factor records, spend-basis, and supplier-basis logic were not changed. **SOURCE-REVIEWED ONLY; NO FUNCTIONAL BULK/OCR TESTING** per the user’s instruction.

## September 21, 2026 — Formula Builder Clone and Impact Guardrails
- Replaced the dedicated Formula Groups navigation page with an in-place Formula Builder clone action. It creates an independent formula in a selected target group without silently changing a decision tree.
- Formula Builder retains its category filter and now exposes it with an explicit test ID; Input Field Mapping gained a category filter that includes mappings assigned directly to the selected category plus global mappings. The mapping table identifies group-owned rows and inactive historical duplicates using unique test IDs.
- Formula Builder loads an impact panel before an existing formula is published, listing every active category/branch that references it and warning when it is group-owned. Protected Super Admin APIs provide group inventory, per-formula impact, and formula cloning. **SOURCE-REVIEWED ONLY; NO FUNCTIONAL UI OR API TESTING** per the user’s instruction.

## September 21, 2026 — Scope 3 Activity-Basis Formula Groups
- Applied the approved ten-group isolation architecture to local `test_database`: **C1/C2**, **C3**, **C4/C9**, **C5/C12**, **C6**, **C7**, **C8**, **C10/C13/C14**, **C11**, and **C15**. It created 20 new immutable formula records, 31 mutable group-owned field mappings, and re-published 15 decision trees. Activity branches now resolve only to their group’s formula family; spend-basis, supplier-basis, and Scope 3 emission-factor records were not changed.
- C10’s activity branch is the canonical configuration for C10/C13/C14, as required by the shared group definition. C6, C8, and C11 retain their multiple existing activity branches, now as exclusive formula families within their respective group.
- A repeated migration invocation briefly produced nested duplicate clones. No formula or mapping was deleted: the repair re-bound all trees to first-generation group clones and deactivated only the 20 duplicate formulas and 30 duplicate mappings. Backups: `/app/.emergent/backups/scope3-activity-groups-20260921T073204Z`, `/app/.emergent/backups/scope3-activity-groups-20260921T073300Z`, and `/app/.emergent/backups/scope3-activity-group-repair-20260921T073406Z`.
- Structural ownership validation confirms 20 active group formulas, 31 active group mappings, and zero nested active clones. **NO FUNCTIONAL BROWSER OR CALCULATION TESTING** per the user’s instruction.

## September 21, 2026 — C4/C9 Mapping Label Authority
- Removed the C4/C9 frontend exception that changed the `km_travelled` mapped label to **Distance Travelled**. The shared GHG field resolver now uses `ce_input_field_mappings.field_label` directly for all categories, so a configured **Distance Travelled per day** label remains intact in both Add and Edit.
- **SOURCE-REVIEWED ONLY; NO FUNCTIONAL TESTING** per the user’s instruction.

## September 21, 2026 — Staging Connection Cleanup
- Removed the temporary staging MongoDB URI and database-name settings from `backend/.env` after the approved migration/reset work.
- Removed the target-specific bootstrap/reset utilities and restored the C3 migration to its standard local environment behavior. The retained generic catalog migration has no embedded staging URI or database name; it accepts target values only at runtime.

## September 21, 2026 — Approved Staging GHG Reset (MongoDB Only)
- Added and applied `reset_staging_ghg_data.py`, a target-locked, transaction-backed reset with a complete JSON backup manifest at `/app/.emergent/backups/staging-ghg-reset-20260921T065543Z`.
- Deleted 7,070 staging-only GHG records/traces: 658 emission records, 1,825 emission-history rows, 17 pending records, 1,415 calculation audit logs, 122 Scope 3 bulk jobs, 900 pending bulk rows, 2,082 bulk errors, 8 Base Year records, 11 Base Year deletion records, 19 emission approval requests, and 13 emission approval-history rows. Supplier-GHG submissions and Base Year history events were already empty.
- R2 objects and `uploaded_files` metadata were deliberately left untouched by the user’s decision. Organizations, facilities, users, supplier relationships/programs, peer benchmarking, targets, sinks, and ESG records were not changed. **MIGRATION PREFLIGHT AND STRUCTURAL VALIDATION ONLY; NO FUNCTIONAL TESTING** per the user’s instruction.

## September 21, 2026 — Staging GHG Catalog Version Baseline
- Added and applied a staging-only, backup-first baseline migration for immutable calculation metadata. It found all 31 staging formulas already linked to formula versions, then created 3 missing decision-tree snapshots and populated formula-version maps for all 23 current trees. Structural validation completed with no errors; `emission_records` and `emission_history` were not queried for writes or changed.
- Applied the C3 canonical Activity Type migration to staging: 32 non-biogenic factors now carry `fuel`, `electricity`, or `steam`. Backups are stored at `/app/.emergent/backups/staging-version-baseline-20260921T063336Z` and `/app/.emergent/backups/c3-activity-types-20260921T063346Z.json`.
- Added explicit credential-safe CORS origins for the preview, approved staging frontend, hosted release, and local development; wildcard CORS remains rejected. **MIGRATION PREFLIGHT AND STRUCTURAL VALIDATION ONLY; NO FUNCTIONAL GHG OR BROWSER TESTING** per the user’s instruction.

## September 21, 2026 — C3 Canonical Activity Type Filtering
- Enabled the existing shared Scope 3 Activity Type → Activity filtering flow for C3 in both Add and Edit. C3 now presents **Fuel**, **Electricity**, and **Steam** in that order and requires a type before a factor can be selected.
- Added durable `scope3_ef.activity_type` data for 32 non-biogenic C3 factors: coal-electricity generation and electricity T&D are `electricity`; Heat/Steam loss and generation is `steam`; remaining C3 factors are `fuel`. The controlled migration created `/app/.emergent/backups/c3-activity-types-20260921T060449Z.json` before applying its updates. Existing emission records, formulas, calculations, and histories were unchanged. **SOURCE-REVIEWED ONLY; NO FUNCTIONAL TESTING** per the user’s explicit instruction.

## September 20, 2026 — Supplier Assessment Correlated Logging
- Added structured, customer-safe business events for Document publishing/assignment/response/reopen/archive, Training creation/assignment/archive/viewer/consumption, multipart upload lifecycle, Questionnaire authoring/assignment/changes/manual review/reopen/response, revenue actions, and supplier evidence operations.
- Events inherit the platform `request_id` and `operation_id` and retain only safe entity IDs, counts, outcomes, and stable error codes. Background training media preparation is now observable; scoring fallback no longer uses `print`. Raw request data, content, notes, filenames, URLs, credentials, and exception text are excluded. **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 20, 2026 — Safe OCR Provider Failure Diagnostics
- Advanced Fast (Anthropic) and Think (OpenAI) OCR now convert provider request failures into bounded diagnostics stored only on the failed file job and emitted through structured server logs: provider, validated provider request ID when present, categorized failure, HTTP status, and timestamp.
- Categories distinguish quota/credit exhaustion, rate limiting, authentication, permissions, invalid request, overload, timeout, network, provider-server, response validation, and unknown failures. Raw exception messages, provider response bodies, prompts, document content, authorization data, headers, and API keys are not persisted or logged. Existing customer-safe error and retry behavior is unchanged; customer OCR API responses omit the internal diagnostic fields. **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 20, 2026 — Native OpenAI Think OCR and Emergent Dependency Removal
- Replaced Think OCR's `emergentintegrations.LlmChat`/LiteLLM path with the official `AsyncOpenAI` Chat Completions client, preserving `gpt-5.6-sol`, `gpt-5.6-terra`, `OPEN_API_KEY_OCR`, prompt content, high-detail JPEG images, and reasoning token limits.
- Removed `emergentintegrations` and LiteLLM from the installed backend and generated requirements. Repository-wide source/config review found no other consumers and no `sk-emergent-` literal or configured key prefix.
- Fast OCR remains on native `AsyncAnthropic`. **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 20, 2026 — Native Anthropic Fast OCR Transport
- Replaced the advanced Fast pipeline's Emergent/LiteLLM adapter call with the official `AsyncAnthropic` client already installed in the backend.
- Fast vision requests now send Anthropic-native Base64 image blocks followed by the extraction prompt; Fast reasoning requests send the prompt directly. Existing `claude-sonnet-5`, `claude-haiku-4-5`, prompts, API-key environment variable, queue workflow, and OCR accounting logic are preserved.
- Think mode remains on its existing OpenAI gateway. **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — OCR Session-Scoped Failure Banner
- OCR no longer restores prior-session failed-upload IDs into a fresh workspace. Legacy failure storage is cleared when the page opens and before a new upload begins.
- Only an upload started or retried in the active session can show the generic failure banner and its retry action; current upload failures retain the existing retry behavior. **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — OCR Stale Failure Banner Recovery
- A newly and successfully queued OCR upload now removes the previous run’s persisted `ocr-failed-upload-ids` marker and clears the associated generic failure banner.
- Failures from the newly queued batch remain visible through the existing polling and retry behavior. **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — C6 Bulk Upload Travel-Day Exclusion
- Removed **No. of Days Travelled** from the C6 Business Travel workbook schema. Legacy C6 workbook values under either the template or formula key are stripped before validation, calculation, and persistence.
- C6 no longer includes `qty_days_travelled` in calculation inputs or saved `dynamic_field_values`; C7 keeps its existing travel-day support. **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — Adaptive Scope 3 Activity Menu Width
- Replaced the fixed 34rem Scope 3 Activity dropdown width with a shared, measured behavior in Add and Edit. Menus retain the trigger width when all current activity labels fit, otherwise they expand only by the measured space required for the longest label, check icon, gap, and padding.
- Menus continue to grow from the right-aligned trigger toward the left, never exceed 34rem or the mobile viewport safe width, and wrap only labels that cannot fit within that cap. Selection data, search behavior, and emission payloads are unchanged.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — C4/C9 Manual Distance Label Fix
- Corrected the frontend category matcher to recognize the canonical manual-entry codes for C4 and C9, so their `km_travelled` field now displays **Distance Travelled** instead of **Distance Travelled per Day** in Add and Edit.
- Kept the change display-only; calculation variables, formulas, payloads, OCR behavior, and stored emission values are unchanged. Generated placeholders now use the same resolved label.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — OCR Formula Inputs Hidden by Scope/Category
- Frontend-only visibility rule: formula-derived edit inputs are hidden for Scope 1, Scope 2, and Scope 3 categories C1, C2, C3, and C5.
- Hidden formula inputs no longer prevent edit-form save readiness; other Scope 3 categories retain their applicable inputs.
- **NOT TESTED** per the user’s explicit instruction.

## September 17, 2026 — OCR Facility Review Warning Cleanup
- Saving a valid facility now removes only the stale `missing facility` review reason from that row’s current values.
- Unrelated review warnings remain intact, so a corrected facility no longer displays `Review: missing facility` after save.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — OCR Scope 1/2 Calculation Method Hidden
- Calculation method now renders only for Scope 3 in the OCR edit dialog. Scope 1/2 show Scope across the full row instead.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — OCR Scope 1/2 Calculation Method Optional
- Scope 1 and Scope 2 edit flows now use the internal Activity factor path without requiring Calculation method; Scope 3 retains method selection and validation.
- Scope changes into Scope 1/2 reset the internal method to Activity, preventing hidden spend-method state from affecting factor lookup or required-field feedback.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — OCR Tick Styling Full Revert
- Restored the original standard checkbox selection controls and original green Accept/Save buttons in desktop and mobile review actions.
- Removed all custom thick bright-green tick styling.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — OCR Accept/Save Tick Placement Correction
- Restored standard selection checkboxes and removed selection-row tick styling.
- Applied the large, thick, bright-green standalone check exclusively to the Actions-column Accept/Save control on desktop and mobile.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — OCR Bold Green Ledger Tick
- Updated the OCR selection marker to a larger, thick, bright-green standalone check mark with a slight hand-drawn tilt and no surrounding frame.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — OCR Frameless Selection Tick Correction
- Replaced the shared checkbox primitive in the OCR ledger with a custom frameless green tick control. Selected rows retain the emerald highlight; no checkbox square is rendered.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — OCR Upload Control Label
- Renamed the OCR upload-control label from **Browse files** to **Upload Files** without changing behavior.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — OCR Edit Form Order and Green Selection
- Removed NAICS code and NAICS commodity from the OCR edit UI. Reordered its first rows to: Facility/Reporting Period; Calculation Method/Scope; Category/Subcategory; Item Description/Factor Database; then invoice/vendor and remaining inputs.
- Selected review rows now receive an emerald highlight and show a simple green tick without the prior checkbox frame.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — OCR Header and Default Selection Cleanup
- Removed the Export CSV action. The compact Fast/Think selector now matches Clear workspace width, with a lightning icon for Fast.
- OCR completion keeps the **All** source selector active by default so review opens across every invoice and Excel workbook.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — OCR Source File Row Selector
- Replaced source-type filters with an **All** source card followed by one compact selector per uploaded invoice or Excel workbook.
- All displays rows across every source; choosing a source displays only that file’s rows. Source-level review hides invoice-number grouping so Excel and combined rows remain directly visible.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — OCR Source Card JSX Compile Fix
- Corrected an extra closing parenthesis in the new Source documents card map that prevented `OCRInvoice.js` from compiling.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — OCR Source Documents Simplification
- Removed the embedded secure-preview panel. Source documents now use compact cards with All / Invoices / Excel filters; invoice documents open through a secure eye action in a new tab, while Excel has no eye control.
- Excel review no longer shows invoice-number grouping. Cancelled source documents now provide Process and Delete actions; processing one safely requeues only that file and requests a facility assignment again when needed.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — OCR Reporting Period Label
- Simplified the OCR review ledger label from **Reporting period / date** to **Reporting period** on desktop and mobile.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — OCR Review Control and Ledger Cleanup
- Renamed **Select all shown** to **Select all**. The selected count plus Save selected/Reject selected controls now appear only after at least one row is selected.
- Replaced text-based View more actions with a compact, tooltip-labeled details icon and centered all desktop ledger headers, values, and action controls.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — OCR Queued Batch Recovery
- Fixed the facility-assignment launch guard by including the upload status in its MongoDB projection, allowing assigned invoices to actually start their background OCR worker.
- Added an atomic worker claim and a **Resume queued** control/API for batches left queued by the earlier launch failure; only one worker can claim and process a batch.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — OCR Cancelled-Invoice Assignment Fix
- Cancelled invoices are now removed immediately from the early facility-assignment dialog and excluded from its polling refresh, so they cannot block or reappear in assignment.
- Their cancelled status remains visible in the source/processing queue; remaining invoices can be assigned and extracted normally.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — OCR Invoice-Level Queue Controls and Early Facility Assignment
- OCR uploads with invoice documents now pause immediately after secure upload for facility assignment; extraction starts only after the selected facility is saved and is carried into each extracted row.
- Added invoice-level cancellation in both the assignment dialog and processing queue. Cancelling one invoice does not stop sibling invoices; a late cancellation is checked again immediately before row persistence.
- Aligned the green “same facility” control and consolidated Preview/Close preview into one toggle button. **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — OCR Quantity and C6 Formula Alignment
- Excel freight extraction now always maps transported-goods quantity and units from the generic **Quantity** and **Units** columns, rather than legacy goods-specific columns.
- C6 OCR activity-input creation no longer sends `qty_days_travelled` to formula evaluation; passenger count and distance remain available where mapped.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — OCR Template Subtitle Cleanup
- Removed the instructional subtitle from the OCR Ledger sheet; the workbook title, column headers, and separate Instructions sheet remain unchanged.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — OCR Excel Template Redesign
- Rebuilt the OCR Ledger into the requested 16-column order and added a bordered 500-row entry area. Facility guidance now appears only on the Facility header; Rooms and Nights headers note that they are required only for hotel stays.
- Added light-blue optional headers for Invoice Number, Vendor Name, From Location, To Location, and Notes, plus an Instructions sheet with a colour legend and field-by-field guidance.
- Updated spreadsheet aliases and generic Quantity/Units handling so Quantity supports fuels, purchased goods, and transported goods. **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — GHG Log Width Reset
- Added a **Reset widths** control that appears after a user manually resizes GHG log columns. It clears saved manual widths, returns the grid to screen-fit sizing, and resets horizontal position.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — GHG Logs Grid Responsiveness
- Active Scope tabs now use the platform emerald active state; the dots-menu column is explicitly labeled **Actions** across Scope 1, Scope 2, Scope 3, and Biogenic logs.
- Default GHG log column widths now expand to the available screen width. The first manual resize freezes current widths instead of forcing all columns back into the viewport.
- The custom bottom horizontal scrollbar only appears when resized columns actually overflow. **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — C6 Default Travel Days
- New C6 trips now initialize `No. of Days Travelled` (`qty_days_travelled`) at 1, while existing trips and saved records remain unchanged.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — C6 Field Control Consistency
- Standardized C6 trip fields without a unit selector to use the same visible border, stone fill, height, and focus treatment as fields with unit selectors.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — C6 Evidence Column Spacing
- Changed the wide-screen C6 trip row from equal grid columns to flexible dynamic-field columns plus a fixed-width evidence column.
- The upload icon now sits directly after the final input at the right edge, and calculation fields use the released space.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — C6 No-Scroll Trip Inputs
- Removed the C6 trip-row horizontal scroll container. Dynamic fields and the compact evidence icon stay in one row on wide screens, use two columns at medium widths, and stack on small screens.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — C6 Route Fields in Trip Header
- Moved each trip’s Departure and Arrival inputs from the detail row into the corresponding Trip header, alongside its title and remove action.
- The detail row remains focused on calculation fields plus the compact ledger-style evidence icon.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — C6 Compact Trip-Row Layout
- Moved every C6 trip’s dynamic inputs, Departure, Arrival, and evidence control into one horizontally scrollable in-card row so values remain aligned and scannable.
- Replaced the text upload control with the same compact upload icon, evidence count badge, hover file list, view links, and removal action used by the standard monthly ledger.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — C6 Add-Trip ReferenceError Fix
- Declared the missing `testIdSuffix` default parameter in `DynamicFieldRenderer`, resolving the confirmed first-trip render error: `ReferenceError: testIdSuffix is not defined`.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — C6 Multi-Trip Render Guard
- Removed the browser-dependent trip-ID call that ran only when **Add trip** was clicked, replacing it with a safe local ID generator.
- Made the shared dynamic field renderer tolerate temporarily unavailable units/activity reference lists while a new C6 trip mounts.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — C6 Business Travel Multi-Trip Entry
- C6 Create now supports multiple independently detailed trips within every monthly or yearly reporting period; each trip has its own dynamic calculation inputs, route, applicable airport lookup, and evidence attachments.
- Every completed trip is calculated and saved as its own emission record in one rollback-protected submission batch. Existing C6 Edit deliberately remains one record/trip at a time.
- **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per the user’s explicit instruction.

## September 17, 2026 — Scope 3 Activity Search Precision
- Replaced cmdk’s default scattered-character fuzzy search only for Scope 3 Activity selection with case-insensitive, normalized word-prefix matching.
- Every query term must match the start of a genuine activity-name word. Exact phrases/words rank first; valid prefixes follow; no fuzzy fallback remains.
- Search inputs such as `co`, `comp`, `copp`, `copper`, and multi-term queries now follow the intended semantic behavior without UI, API, data, or selection changes. **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per user instruction.

## September 17, 2026 — Scope 3 Long Activity Names
- Scope 3 Activity menus now grow leftward from their original right edge to a responsive 34rem maximum when opened.
- Activity names wrap in the expanded menu rather than truncating. Added in both Add and Edit without changing values or backend behavior. **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per user instruction.

## September 17, 2026 — Biogenic Emission-Type Form Alignment
- Presented the Biogenic emission type label and both radio options in one neutral standard form row, removing the green container/background treatment.
- Renamed the visible choices to **Direct Emissions** and **Indirect Emissions** while retaining their existing values and all backend behavior.
- Applied the same visual/label treatment to Edit for consistency. **SOURCE-REVIEWED ONLY; NOT RUNTIME-TESTED** per user instruction.

## September 8, 2026 — Scope 3 Bulk Spend Currency Inference
- Spent Amount without PPP/Inflation values now defaults Bulk Upload to Standard Currency Conversion.
- Providing Purchase Power Value or Inflation Rate selects PPP and Inflation Rate; when both are present, both are retained as overrides.
- Updated the Excel column guidance for **Currency Conversion Method** and **Exchange Rate (Override)**. **NOT TESTED** per user instruction.

## September 8, 2026 — Scope 1 Bulk Carbon Input Alignment
- Removed incorrect override classification from bulk-uploaded Carbon Content, Oxidation Factor, and Quantity Basis EF fields.
- Bulk Upload now persists these required formula inputs using the same `value` and `unit` shape as manual entry, while genuine Calorific Value and Density overrides remain unchanged.
- Carbon Content/Oxidation Factor tests passed 2/2 before the user requested no further testing; EF Quantity was not tested per that instruction.

## September 7, 2026 — Facility Form Spacing Consistency
- Standardized the Facility edit form to one vertical spacing scale across sections, field rows, Address, and Attachments.
- Made each field grid responsive so rows retain even spacing when the dialog narrows.
- **NOT TESTED** per the user’s explicit instruction.

## September 7, 2026 — Facility Form Layout Polish
- Replaced the Facility Equity Share Percentage warning panel and saved Equity badge with neutral styling.
- Aligned Facility Person Responsible, Designation, and Contact Details in a responsive three-column row.
- **NOT TESTED** per the user’s explicit instruction.

## September 7, 2026 — Organization Historical Operational Data Access
- Removed the empty Organization form card that appeared while editing Production or Revenue data.
- Restored all five available reporting years (current plus four prior), allowing administrators to add missing historical data directly.
- **NOT TESTED** per the user’s explicit instruction.

## September 7, 2026 — Organization Operational Data Editing
- Production and Revenue now list only reporting years containing data, with explicit **Add current** and **Add previous** reporting-year actions in edit mode.
- Moved the operational Cancel and Save Changes actions below the reporting-year editors.
- A period now accepts exactly one data mode: choosing Monthly clears the annual value, choosing Yearly clears monthly values, and the API ignores any inactive legacy payload values.
- **NOT TESTED** per the user’s explicit instruction.

## September 7, 2026 — Organization Facility Count Restored
- Restored the live **No. of Facilities** count in the saved Organization summary using the existing scoped Facilities API.
- **NOT TESTED** per the user’s explicit instruction.

## September 7, 2026 — Organization GHG Details Layout Polish
- Aligned Person Responsible, Designation, and Contact Details in one responsive edit row.
- Moved Reporting Frequency from Basic Details to GHG Details while retaining Reporting Year Type under Basic Details.
- Replaced the equity-share disclaimer’s yellow warning treatment with neutral supporting text.
- On saved GHG Details, placed Organizational Boundaries and Uncertainty Assessment in a responsive shared row and removed tinted boundary-approach panels.
- **NOT TESTED** per the user’s explicit instruction.

## September 7, 2026 — Organization Summary and All-Years Data View
- Removed country, timezone, reporting-year type, facility count, target count, and reporting cadence from the Organization summary.
- Joined the corporate address into one line and removed timezone from the address card.
- Replaced the Production/Revenue year selector with five simultaneous reporting-year editors supporting monthly and yearly entry with per-year saving.
- Extracted the reporting-year editor into focused reusable components.
- **NOT TESTED at user request.**

## September 7, 2026 — Organization Entitlement-Aware Tabs
- Removed the BRSR/GRI framework badges from the Organization summary.
- GHG Details now appears only for organizations with the canonical GHG entitlement.
- Production Data and Revenue Data now appear only when at least one Environment, Social, or Governance entitlement is enabled; inaccessible active tabs fall back to Basic Details.
- **NOT TESTED at user request.**

## September 7, 2026 — Organization Details Tab Structure
- Replaced the single Organization Details view with Basic Details, GHG Details, Production Data, and Revenue Data tabs.
- Moved Purpose of the Report, Organizational Boundaries, Uncertainty Assessment, GHG Reduction Initiatives, and Internal Performance Tracking Description into GHG Details.
- Kept all remaining organization fields in Basic Details, separated Turnover / Revenue from Production Quantity, and removed Last updated plus Related Modules.
- **NOT TESTED at user request.**

## September 7, 2026 — Monthly Day-Limit Runtime Error Fixed
- Replaced the undefined `month` reference in Scope 3 monthly day-limit feedback with a month label resolved from `monthKey`.
- **NOT TESTED at user request.**

## September 7, 2026 — Scope 3 Monthly Leap-Year Limits
- Corrected February limits for financial-year monthly entries by mapping January–March to the financial year’s ending calendar year.
- Standard Scope 3, C7 multi-employee, pre-save, and legacy C7 paths now share the same month/day resolver.
- **NOT TESTED at user request.**

## September 7, 2026 — Scope 3 Annual Day Limits
- Added dynamic 365/366 limits for annual Scope 3 day-count fields based on the selected calendar or financial reporting period.
- Covered standard Scope 3 yearly entry, C7 multi-employee entry, pre-save validation, and legacy C7 validation.
- Targeted ESLint and 38 regression tests passed.

## September 7, 2026 — Scope 3 Category/Method Transition
- Preserved Spend Basis across category changes only when supported by the destination category; unsupported methods now reset to Select Method.
- Cleared and reinitialized all downstream category-dependent calculation state to prevent stale activities, units, formulas, and results.
- **NOT TESTED at user request.**

## September 7, 2026 — Scope 3 Unit Controls Fixed
- Supplier Basis free-text units now start blank instead of inheriting the first global unit (`2022_USD`).
- Monthly and yearly unit choices now persist when typed or selected; valid non-default dropdown options are no longer overwritten.
- Targeted ESLint and 8 unit-control regression tests passed.

## September 7, 2026 — Exchange Rate Unit Reset Fixed
- Removed the startup seed overwrite that repeatedly restored the Exchange Rate mapping unit to `1`.
- Startup now inserts the mapping only when missing and preserves all later Super Admin edits.
- Repaired the local catalog and verified a subsequent startup seed leaves Exchange Rate unitless.

## September 7, 2026 — Scope 3 Spend Default Rates
- Displayed period-specific PPP, inflation, and standard exchange-rate defaults in Scope 3 Spend Basis ledgers using the same resolver as backend calculations.
- Preserved explicit override behavior and existing saved overrides across monthly and yearly entry.
- Targeted static checks and resolver API verification passed.

## September 7, 2026 — Scope 3 Create Selection Alignment
- Aligned Category, Calculation Method, Activity Type when applicable, and Activity in one responsive desktop row while preserving mobile stacking.
- **NOT TESTED at user request.**

## September 7, 2026 — Local Decision-Tree Formula-Version Map Repair
- Corrected the record-binding existence check so a legacy snapshot with a missing projected map is no longer mislabeled as a nonexistent decision-tree version.
- Added and applied a guarded migration for missing `formula_version_map` values across current and historical decision-tree documents. It backfilled 86 documents and created a local pre-write backup.
- **NOT TESTED at user request.**

## September 4, 2026 — Immutable Formula and Decision-Tree Versions
- Added a reusable calculation-version resolver and record-write guard. New emission records pin exact formula/tree versions and store a canonical formula snapshot generated from the server-side catalog.
- Formula edits append formula versions and automatically append linked decision-tree versions with formula-version maps. Historical edits use pinned form configuration and calculations; switching to newer rules during edit is rejected.
- Extended version persistence across manual emissions, C7 Employee Commuting, and Scope 1/2/3 Bulk Upload paths. Existing unversioned records are deliberately unchanged pending a separately approved migration.
- Verified with backend unit tests (7/7), live API regressions (9/9), process-emissions tests (4/4), frontend tests/lint, production build, Python compilation, authenticated API checks, and browser smoke. No mocked APIs.

## September 4, 2026 — R2-Backed Login Background
- Uploaded the supplied WebP scene to the existing `software-image-dev` R2 bucket at `images/login-background.webp`.
- Added the private R2 software-asset mapping and switched Login to fetch its signed background URL through `/api/software-assets/login-background`; no public raw asset URL is used by the page.
- Verified R2 upload, signed URL generation, frontend ESLint, and live Login rendering.

## September 4, 2026 — Super Admin Team Account Creation
- Super Admins can now create and manage organization-scoped **User** and **Admin** accounts from Team Accounts, with a role selector, organization selector, separate seat-limit enforcement, secure password hashing, and invitation-email rollback on delivery failure.
- Accounts continue to use the existing `users` collection and standard account fields; no collection or user-data migration was introduced.
- Verified by production build, browser flow, and focused backend regression checks (13 passed; side-effecting email checks skipped safely). The known edge-proxy CORS override remains infrastructure-blocked.

## September 4, 2026 — New Organization Org Config Null-Framework Repair
- Fixed the Org Config HTTP 500 caused by iterating over `esg_frameworks_enabled: null` while initializing newly created organizations.
- Absence of an enabled ESG framework is now represented safely as an empty list for both legacy reads and future organization creation.
- Verified through focused unit/API checks and the authenticated Testing organization editor; testing-agent iteration 41 passed backend and frontend checks with no mocked APIs.

## September 4, 2026 — Energy KPI Logs Polish and Filters
- Refined shared ESG KPI tables, Status/All Facilities filtering, and scoped Energy/Water filter visibility.
- Matched Energy Logs tabs, KPI cards, and page surfaces to the supplied reference: independent compact tabs and left-icon KPI tiles.
- Added a white Add Metric workspace surface. Verified with frontend ESLint and authenticated live Energy Logs rendering.
- Added validated Start Period/End Period filtering for native and GHG-imported KPI records; verified with the authenticated live Energy KPI view.
- Added KPI icons, content-sized metric tabs, and a white Add Metric workspace; verified with frontend ESLint and authenticated live interaction checks.

## September 3, 2026 — Voluntary Target Section Headings
- Added section-specific shared headers for Environment Target, Social Target, and Governance Target.
- Verified with frontend ESLint and authenticated live Environment Target rendering. No API or data behavior changed.

## September 3, 2026 — Organization GRI Tab Removal
- Removed the Organization module’s GRI tab and its placeholder panel. **NOT TESTED at user request.**

## September 3, 2026 — Portal Module Header Alignment
- Added the shared title-only module header across the remaining primary portal and admin modules, using appropriate colored left icons and preserving existing action controls.
- Fixed the Facilities JSX regression introduced during the broad header refactor; frontend ESLint passes. Broader visual regression testing remains deferred at user request.
- Matched Supplier Assessment’s centered icon/title geometry and fixed outlier top spacing for GHG Base Year, Peer Benchmarking, MIS Reports, and SBTi Targets. **NOT TESTED at user request.**
- Unified standard route top padding and module header-to-content spacing with the Supplier Assessment baseline. **NOT TESTED at user request.**
- Removed Supplier Assessment’s unintentional 24px outlet gap; live geometry now confirms both Supplier Assessment and GHG Base Year headers begin at 16px. Frontend ESLint passed.

## September 3, 2026 — Deferred P1: Reporting Period Standardization
- Added the reporting-period and reusable country/calendar reference-data consolidation to the P1 architecture backlog. No code changes were made.

## September 3, 2026 — Water Add Metric Field Alignment
- Standardized the label area and input baseline for dynamic numeric metric fields, fixing the visibly staggered Water consumption controls.
- Verified with frontend ESLint and authenticated live Water Add Metric browser check. No API or data behavior changed.

## September 3, 2026 — R2 File Lifecycle Integrity
- Added shared, storage-first R2 cleanup and made generic file deletion fail safely rather than hiding metadata when R2 removal fails.
- Applied cleanup to emission, sink, ESG, facility, organization, Repo Pilot, benchmark, OCR, and organization-cascade paths.
- Live isolated-artifact regression suite passed **3/3**; Python compilation, frontend ESLint, and authenticated GHG smoke passed. No APIs are **MOCKED**.

## September 3, 2026 — GHG Evidence Tooltip Contrast
- Updated the attached-evidence filename link in the Add Emission hover tooltip from blue to white, avoiding the blue-on-green clash while retaining clear hover feedback.
- Verified with frontend ESLint and an authenticated GHG Emissions browser smoke. No APIs or data behavior changed.

## August 30, 2026 — Roadmap Update
- Added P0: a deliberate migration/reassignment workflow for existing suppliers after parent GHG permission changes, preserving immutable issued assessments while allowing explicit alignment with newer program revisions.

## August 30, 2026 — Canonical ESG Response Migration
- Removed runtime dependencies on the deprecated `esg_responses` collection across questionnaire approvals, completion, BRSR/GRI retrieval, and Internal Data AI history.
- Standardized current questionnaire responses on flat `organization_esg_responses` documents and retained immutable approval history in `esg_responses_versions`.
- Updated legacy approval helpers to preserve approver edits, rejection restoration, audit/version events, and organization isolation without dual writes.
- Made the questionnaire approval queue questionnaire-only; record approvals continue through the canonical workflow request endpoint.
- Dropped the empty legacy collection and verified it was not recreated.
- Verification passed with the 37-test migration suite, 11 focused completion/history checks, Python compilation, frontend ESLint with zero errors, and live-app smoke testing. Added the missing `yarn lint` script for reliable automated lint execution. No mocked APIs.

## August 30, 2026 — Supplier Assessment State and Policy Repairs
- Reminders now load and send only incomplete, parent-program-enabled modules for the supplier's assigned reporting period. The picker no longer presents completed work.
- Restored due-date visibility after completion across parent assessment detail, supplier Documents, and supplier Trainings views.
- Preserved `revenue_required` while opening Edit Supplier, avoiding accidental Annual Revenue requirement resets on save.
- Added immutable-program policy flags for supplier custom fuels, Process Emissions, and Flaring. All are disabled by default and rejected by both supplier-specific and generic emission APIs unless explicitly enabled by the parent.
- Initial Python/ESLint/API/UI smoke checks passed before the user requested no further testing. **NOT TESTED** after that instruction; no mocked APIs were added.

## August 30, 2026 — Supplier GHG Program Policy Visibility
- Routed immutable supplier-program permissions into the shared GHG create/edit form. Process Emissions and Flaring are now hidden unless returned as program-allowed categories; Custom Fuel is hidden unless the program enables it.
- Corrected the generic supplier emission contract to include optional `category_id`, preventing a direct restricted payload from producing a 500. It now returns a controlled 403 rejection.
- Verified with 2 frontend policy unit tests, 6 backend supplier-policy tests, a live API request, Python compilation, and a supplier `/ghg` browser flow. No mocked APIs.

## August 30, 2026 — Training Player Control Cleanup
- Disabled Picture-in-Picture and remote playback for supplier and administrator training video viewers.
- **NOT TESTED** after implementation, per user instruction. No mocked APIs.

## August 30, 2026 — Parent Supplier Detail Expansion
- Extended parent-side supplier details with ESG, GHG, Documents, and Training completion tracks.
- Consolidated the ESG, Environment, Social, and Governance scores into one responsive score row.
- **NOT TESTED** after implementation, per user instruction. No mocked APIs.

## August 30, 2026 — Supplier Status Alignment
- Positioned the View Supplier status badge beneath its Status label.
- **NOT TESTED** after implementation, per user instruction. No mocked APIs.

## August 30, 2026 — Detailed Rankings Table Fit
- Compacted Detailed Rankings columns and spacing to retain the View action within standard desktop content widths.
- **NOT TESTED** after implementation, per user instruction. No mocked APIs.

## August 30, 2026 — Overdue Supplier Task Follow-up
- Replaced score-driven Attention Required entries with overdue, incomplete task detection across ESG, GHG, Documents, and Training.
- The parent ranking dashboard now names each overdue module for every supplier listed.
- Verified by live API and parent-dashboard smoke checks, Python compilation, and frontend linting (zero errors; existing warnings only). No mocked APIs.

## August 30, 2026 — Document/Training Action Consistency
- Unified due-date action icons and aligned Training actions to the Documents order.
- Made the Training overflow menu fully opaque.
- **NOT TESTED** after implementation, per user instruction. No mocked APIs.

## August 30, 2026 — Supplier Onboarding Copy
- Clarified the supplier onboarding heading with the Supplier Assessment workspace name.
- **NOT TESTED** after implementation, per user instruction. No mocked APIs.

## August 30, 2026 — Supplier GHG Submitted Totals
- Promoted submitted Scope 1 and Scope 2 totals above current draft values in the supplier GHG summary.

## August 30, 2026 — Published Emission Consumer Filter
- Applied the shared published-record lifecycle filter to Internal AI analytics/evidence and Peer Benchmarking date discovery.
- Kept operational lifecycle surfaces able to inspect drafts, pending approvals, rejected records, and history by design.

## August 28, 2026 — Unit-Driven Density and Reverse EF Conversion
- Added one shared density-state resolver for monthly/yearly rendering, validation, calculation preparation, and API enforcement.
- Density now appears only for a real mass/volume mismatch. Valid standard-fuel density is an overridable default; missing density becomes required with the correct directional unit.
- Carbon Composition with mass Quantity no longer shows Density.
- Quantity Basis with mass Quantity and a volume-denominator EF now normalizes the EF before the frozen calculation engine, replacing the previous `Cannot convert 'ef_quantity'` failure.
- Removed hardcoded standard-fuel formula-basis routing and made basis selection unit-driven.
- Stabilized the controlled Add Emission modal open action.
- Verified with 46 frontend tests, 8 backend tests, a production build, repeated modal opens, missing-density validation, and a successful cleaned-up reverse-conversion save.

## August 25, 2026 — Exact Supplier GHG Scope Enforcement
- Fixed the shared supplier GHG screen reading the supplier organization's dynamic GHG scopes, which exposed Scope 3 and Biogenic despite the parent assignment.
- Scope access now resolves canonically from the bound immutable supplier assessment-program revision.
- Parent Scope 1-only assignments expose only Scope 1; Scope 2-only exposes only Scope 2; combined assignments expose both.
- Scope 3 and Biogenic are stripped from supplier tabs, Add/Edit forms, summaries, list/state/history queries, and submission batches.
- Generic and supplier-specific create/edit APIs reject any scope not assigned by the parent.
- Direct Scope 3/Biogenic URLs fall back to the first assigned Scope 1/2 route.
- Verified with 23 focused backend tests, 4 frontend unit tests, 7 live read-only supplier checks, and an authenticated UI check.

## August 25, 2026 — Supplier Dashboard/Base Year/Analysis Locks
- Locked the main organization Dashboard, GHG Base Year, and GHG Analysis for supplier accounts while preserving the Supplier Assessment dashboard.
- Dashboard, Sinks, Base Year, and Analysis now use muted supplier navigation text without sidebar lock icons.
- All four remain clickable; restricted routes display the established full-page Premium Module overlay, matching the Sinks interaction.
- Added explicit direct-route locking so `/dashboard`, `/ghg/base-year`, and `/ghg/analysis` cannot bypass the premium overlay.
- Changed the sidebar logo destination for suppliers to the Supplier Assessment workspace rather than the locked organization Dashboard.
- Centralized supplier muted menu keys, route locks, and premium copy in one navigation policy.

## August 25, 2026 — Supplier GHG History Visibility and Audit Parity
- Removed supplier-facing Version History actions and dialogs from the GHG emissions grid.
- Non-supplier internal users now use the canonical emission-history view for supplier-sourced records rather than the supplier revision dialog.
- Added canonical `emission_history` creation events to the supplier-specific GHG create endpoint, matching normal organization record creation.
- Existing supplier draft edits continue writing field-level updates to `emission_history` through the shared GHG update route.
- Supplier submission/reopen revision lineage and immutable submitted revisions remain unchanged.
- Verified with lint checks and 16 focused supplier tests.

## August 25, 2026 — Supplier GHG Reporting-Period Lock
- Fixed supplier GHG forms inheriting the supplier organization's calendar-year default instead of the parent-assigned reporting period.
- Supplier Add now displays the assigned period, such as `FY 2026-27`, and prevents changing the reporting year.
- Financial-year monthly entry is constrained to April through March; yearly entry uses the exact assigned FY label.
- Supplier Edit keeps its reporting period read-only and displays the active customer assignment.
- Added backend create/update enforcement for both generic and supplier-specific GHG paths.
- Supplier GHG lists now return only records belonging to the active relationship and assigned annual/monthly periods.
- Added parsing support for both financial-year and calendar-year supplier assignments, including legacy calendar labels.

## August 25, 2026 — Supplier ESG/GHG Verification Acknowledgement
- Added a required supplier checkbox to both ESG questionnaire and GHG submission confirmation dialogs.
- Final submission remains disabled until the supplier confirms the data was reviewed and verified for accuracy and completeness.
- Added backend enforcement so direct API calls cannot bypass the acknowledgement.
- Persisted `data_verified`, `data_verified_at`, and `data_verified_by` on final ESG responses and submitted GHG records.
- Added unique test identifiers for the acknowledgement, statement, and checkbox controls.

## August 25, 2026 — GHG Period Row Allowance Parity
- Reinterpreted `environment.ghg.monthly_rows_allowed` as a per-reporting-month organization limit instead of one lifetime total across all monthly records.
- Added yearly-frequency allowance at `monthly_rows_allowed × 12` per reporting year.
- Applied the shared canonical guard to standard manual GHG creation and C7 monthly/yearly creation.
- Bulk Upload now rejects only excess period rows during validation with `PERIOD_ROW_LIMIT_EXCEEDED`; in-limit rows remain available for preview and save.
- Added full-batch rechecks immediately before direct bulk persistence and confirmation-save persistence.
- Added `frequency_type: monthly` and `submission_batch_id` to new C7 monthly records so legacy-aware counting and batch rollback stay consistent.
- Verified with 7 focused backend tests and an authenticated Bulk Upload frontend smoke test. Independent iteration 19 reported no scoped defects and no mocked APIs.

## August 25, 2026 — Bulk Upload Stability and Architectural Parity
- Enforced canonical organization GHG scope/category/process/custom-fuel capabilities in Bulk Upload.
- Added Flaring and Process Emissions handling, custom-fuel auto-detection, dry-run preview summaries, and partial-insert rollback.
- Added a 24-hour TTL for pending records.
- Enforced 10 MB files, 5,000 rows per sheet, and 25,000 rows per workbook.
- Iteration 18 passed 11 backend checks with frontend preview verification.

## June 19, 2026 (Latest)

### ESG Records Module - Phase 1 Implementation
- **Reusable Architecture**: Built modular records system supporting Environment, Social, and Governance
- **Backend Components**:
  - `/app/backend/modules/esg_records/` (contracts, service, router)
  - Collections: `esg_record_categories`, `{section}_records`, `{section}_record_versions`
  - Full CRUD APIs with pagination, filtering, search
  - Version history with snapshot preservation
- **Frontend Components**:
  - `ESGRecords.js` - Reusable records table with filters, pagination
  - Multi-step "Add Record" modal with dynamic field rendering
  - Version history modal
- **Initial Categories Seeded** (11 total):
  - Environment: Water (3), Energy (2), Emissions (1), Waste (2)
  - Social: Workforce (1), Training (1)
  - Governance: Compliance (1)
- **Features**:
  - Record levels: Organization / Facility
  - Reporting types: Daily, Monthly, Quarterly, Yearly (FY & CY)
  - Config-driven dynamic fields per category
  - Framework mapping support (BRSR, GRI future-ready)
  - Version tracking with audit trail

---

## June 17, 2026

### Environment Questions Q75-Q94 (Resource Management, Emissions & Compliance)
- Added 20 new BRSR Environment questions via `/app/backend/scripts/seed_brsr_environment_q75_94.py`:
  - Q75: `env_energy_consumption_intensity` - Energy metrics matrix with assurance field
  - Q76: `env_pat_scheme_compliance` - PAT scheme Yes/No with nested details
  - Q77: `env_water_withdrawal_consumption` - Water withdrawal metrics matrix
  - Q78: `env_water_discharge_treatment` - Water discharge by destination with treatment levels
  - Q79: `env_zero_liquid_discharge` - ZLD Yes/No with description
  - Q80: `env_air_emissions_non_ghg` - Air emissions table (NOx, SOx, PM, etc.)
  - Q81: `env_scope12_ghg_emissions` - **Linked to GHG module** (read-only)
  - Q82: `env_ghg_reduction_initiatives` - GHG reduction projects
  - Q83: `env_waste_generation_management` - Master waste matrix (generated, recovered, disposed)
  - Q84: `env_waste_management_practices_desc` - Long text for practices description
  - Q85: `env_ecologically_sensitive_areas` - Dynamic table for sensitive areas
  - Q86: `env_eia_details` - Environmental Impact Assessment table
  - Q87: `env_environmental_compliance` - Compliance Yes/No with non-compliance table
  - Q88: `env_water_stress_areas` - Water metrics for stress areas
  - Q89: `env_scope3_emissions` - **Linked to GHG module** (read-only)
  - Q90: `env_biodiversity_impact` - Long text for biodiversity impacts
  - Q91: `env_resource_efficiency_initiatives` - Dynamic table for initiatives
  - Q92: `env_business_continuity_disaster` - Text with optional weblink
  - Q93: `env_value_chain_impacts` - Long text for value chain impacts
  - Q94: `env_value_chain_assessment` - Percentage with description

### New Frontend Renderers (Q75-Q94)
- `HistoricalEnvironmentalMetricsMatrixRenderer` - Energy/sectioned metrics with assurance
- `YesNoWithNestedDetailsRenderer` - Nested sub-questions with conditional visibility
- `HistoricalWaterMetricsMatrixRenderer` - Water withdrawal/consumption matrix
- `HistoricalWaterDischargeMatrixRenderer` - Destination x Treatment nested matrix
- `YesNoWithDescriptionRenderer` - Yes/No with conditional textarea
- `HistoricalEmissionsTableRenderer` - Air emissions with unit column
- `LinkedGHGMetricsMatrixRenderer` - Read-only GHG module integration
- `HistoricalWasteManagementMasterMatrixRenderer` - 3-section waste matrix
- `LongTextResponseRenderer` - Simple textarea for long responses
- `DynamicTableRenderer` - Generic add/remove row table
- `HistoricalWaterStressMatrixRenderer` - Reuses water metrics for stress areas
- `LinkedScope3MetricsMatrixRenderer` - Read-only Scope 3 integration
- `TextWithOptionalWeblinkRenderer` - Text with optional URL field
- `PercentageWithDescriptionRenderer` - Percentage input with description

### Backend Updates (Q75-Q94)
- Added 14 new question types to `contracts.py`
- Total BRSR Environment questions: **29** (4 original + 5 Q70-74 + 20 Q75-94)

---

### Environment Questions Q70-Q74 (Life Cycle Assessment & Circular Economy)
- Added 5 new BRSR Environment questions via `/app/backend/scripts/seed_brsr_environment_q70_74.py`:
  - Q70: `env_life_cycle_assessment` - Yes/No with conditional dynamic table for LCA details
  - Q71: `env_lca_concerns_actions` - Textarea for LCA concerns (conditional on Q70)
  - Q72: `env_recycled_input_material` - Historical percentage table for recycled input materials
  - Q73: `env_reclaimed_products_packaging` - Matrix table with Current/Previous FY columns
  - Q74: `env_waste_management_practices` - Historical waste management matrix

### Historical Autofill API (NEW)
- Added `GET /api/esg-questionnaire/responses/{framework}/{section}/{year}/historical` endpoint
- Dynamically fetches previous FY data without storing historical snapshots in current document
- Returns:
  - `previous_year`: Calculated previous reporting year (e.g., "2024-25" from "2025-26")
  - `previous_responses`: The actual response data from the previous year
  - `autofill_mappings`: Question-to-field mappings for frontend autofill logic
  - `has_previous_data`: Boolean indicating if previous data exists

### New Frontend Renderers
- `YesNoWithDynamicTableRenderer` - Yes/No toggle with conditional table display
- `HistoricalMaterialPercentageTableRenderer` - Dynamic table with historical autofill
- `HistoricalReclaimPercentageTableRenderer` - Fixed-row matrix with FY comparison
- `HistoricalWasteManagementMatrixRenderer` - Product category matrix with historical autofill

### Backend Updates
- Added 4 new question types to `contracts.py`: `yes_no_with_dynamic_table`, `historical_material_percentage_table`, `historical_reclaim_percentage_table`, `historical_waste_management_matrix`
- Added `get_historical_data()` and `_calculate_previous_fy()` methods to `ESGQuestionnaireService`
- Total Environment questions: 9 (4 original + 5 new)

---

### Config-Driven ESG Questionnaire System (NEW)
- Created `/app/backend/modules/esg_questionnaire/` module with:
  - `contracts.py` - Pydantic models for question configs and responses
  - `service.py` - ESGQuestionnaireService with full CRUD operations
  - `router.py` - REST API endpoints for configs and responses
- Created `/app/frontend/src/components/ESGQuestionnaire.js` (628 lines):
  - Generic questionnaire renderer supporting 10+ question types
  - PrincipleToggleRenderer for NGRBC P1-P9 questions
  - TableRenderer for dynamic table questions
  - Completion progress tracking with badges
- Updated ESG module pages:
  - `Environment.js` - Integrated ESGQuestionnaire (section="environment")
  - `Social.js` - Integrated ESGQuestionnaire (section="social")
  - `Governance.js` - Integrated ESGQuestionnaire (section="governance")
- Seeded 3 initial BRSR governance questions via `/app/backend/scripts/seed_brsr_governance_questions.py`
- New MongoDB collections: `esg_question_configs`, `organization_esg_responses`

### Previous (Same Day)
- BRSR Extended Sections Batch 1 (Employees, Women Representation, CSR, Holding/Subsidiary)
- Turnover Rate Matrix with 3-FY simultaneous editing
- Complaints/Grievances and Material Issues sections
- Admin sidebar restructure (GHG under parent menu)
- Hybrid DB architecture (static vs yearly data separation)

## June 16, 2026
- ESG Platform foundation (users_esg migration, framework registry)
- BRSR Organization Details UI integration
- ESG Frameworks selection UI for Super Admin

## February 2026
- EmissionEntryForm refactoring (F1-F6 complete, -32.2% code reduction)
- Emissions.js modularization (E1-E3 complete, -4.7% code reduction)
