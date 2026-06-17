# ESG Platform Changelog

## June 17, 2026 (Latest)

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
