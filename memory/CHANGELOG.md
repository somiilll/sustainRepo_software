# ESG Platform Changelog

## June 17, 2026

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
