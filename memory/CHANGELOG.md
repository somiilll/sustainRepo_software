# ESG Platform Changelog

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
