# SustainRepo - GHG Calculation Platform PRD

## Original Problem Statement
Multi-tenant Greenhouse Gas (GHG) calculation platform compliant with ISO 14064-1:2018. Features include:
- Dynamic GHG calculations with centralized CalcEngine
- Premium ESG Analytics Dashboard
- ISO-compliant DOCX report generation for Scope 1, 2, and 3
- Robust Scope 3 Bulk Upload
- Comprehensive Base Year tracking module

## Core Architecture
- **Frontend**: React, Tailwind CSS, Shadcn/UI
- **Backend**: FastAPI, Motor async driver, Pydantic
- **Database**: MongoDB
- **Key Pattern**: Centralized `CalcEngine` with dynamic property resolution

## Key Files
- `/app/backend/server.py` - Main API (~10,000+ lines, needs refactoring)
- `/app/frontend/src/pages/Dashboard.js` - Dashboard with analytics
- `/app/frontend/src/pages/Emissions.js` - Emissions management (~6800 lines)
- `/app/frontend/src/components/EmissionEntryForm.js` - Entry form (~6000 lines)

## What's Been Implemented

### December 2025 Session
1. **Dashboard Scope 3 Proration Fix**
   - Fixed `CY 2025` format parsing (whitespace handling)
   - Fixed bulk upload `total_emissions` field not being saved
   - Added dashboard fallback to `co2e_emissions` field
   - Updated 23 existing records with missing emissions values

2. **Base Year Comparison Separation**
   - Split into Direct (Scope 1 & 2) and Indirect (Scope 3 & Biogenic) panels
   - Each panel shows its own base year
   - Added "Base Year Not Configured" state handling

3. **DOCX Report Generation Enhancements** (Latest)
   - Added **Category-wise Emission Analysis Chart** in Organization Analysis section for Scope 1,2,3 reports
   - Implemented `_create_category_analysis_chart()` - horizontal bar chart with top 15 categories
   - Auto-builds category data from `by_scope_category_fuel` or falls back to `by_category`
   - Handles empty data, long names (truncation), and filtering of negligible values
   - Report proration logic with `*` markers for prorated items
   - Deduplication fix (no longer strips monthly records when yearly exists)
   - Historical data proration (`_get_previous_year_data`)
   - Scope 3 category matching fix (exact prefix matching vs substring)
   - Conditional Chapter 5/6 text based on organization data
   - **Fixed Scope 1,2 Base Year showing 0**: `_get_base_year_emissions_for_entity` now populates `scope12_emissions_data` for Scope 1,2 reports (was only set for Scope 1,2,3)
   - **Fixed Chapter 3 showing out-of-period records**: Added `_filter_emissions_by_period` to Chapter 3, same as Chapter 4. Now both chapters apply consistent reporting period filtering.

4. **Scope 3 Asset Name Field** (Latest)
   - Added mandatory **Asset Name** text field in Step 2 for categories: C8 (Upstream Leased Assets), C13 (Downstream Leased Assets), C14 (Franchises), C15 (Investments)
   - Field is displayed in both EmissionEntryForm.js (new emissions) and Emissions.js (edit dialog)
   - Saved to database as `asset_name` field
   - Includes validation - cannot proceed without entering asset name
   - Auto-resets when switching away from these categories
   - **Added to backend**: `asset_name` field in EmissionCreate/EmissionRecordResponse Pydantic models in server.py
   - **Added to Bulk Upload**: Asset Name column in Excel template for C8, C13, C14, C15 sheets, mapped and saved to database

### Previous Sessions
- UI/UX Standardization (Custom flags, Override checkboxes)
- Data Entry Validations
- Version History Overhaul
- Overlapping Date Filtering for CY/FY periods
- Dashboard Proration implementation

## Known Issues
- P0: Dashboard "No Data" after toggling organization Scope access

## Upcoming Tasks (P1)
- "Apply to all months" autofill for S3C7 Employee Commuting
- Expand Bulk Upload to Scope 1 & 2

## Future/Backlog (P2)
- Add Monthly/Yearly frequency indicators
- CBAM module and report template
- Refactor server.py (>10,000 lines)
- Refactor Emissions.js (>6800 lines)
- Refactor EmissionEntryForm.js (>6000 lines)

## Technical Notes
- Reporting periods: Monthly (YYYY-MM), Financial Year (FY YYYY-YYYY), Calendar Year (CYYYYY or CY YYYY)
- Dashboard applies proration for CY/FY entries based on date filter overlap
- Base year data separated by scope group (direct vs indirect)

## 3rd Party Integrations
- Cloudflare R2 (Storage) - requires User API Key
- Resend (Emails) - requires User API Key
