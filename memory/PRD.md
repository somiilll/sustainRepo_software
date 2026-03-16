# SustainRepo - GHG Calculation Platform PRD

## Original Problem Statement
Build a multi-tenant Greenhouse Gas (GHG) calculation platform named "SustainRepo" with:
- Dynamic, configuration-driven emissions calculation engine managed by SuperAdmin
- "Equity Share Approach" where emissions are adjusted based on facility-level ownership percentages
- Role-based access control system for modules and report templates
- AI-powered report generation for executive summaries and strategic recommendations

## User Personas
1. **SuperAdmin**: Full system access, manages process templates, fuels database, GWP values, organizations
2. **Organization Admin**: Manages their organization's facilities, emissions data, users, and generates reports
3. **Organization User**: Views and enters emissions data for assigned facilities

## Core Requirements
- Multi-tenant architecture with organization isolation
- Dynamic emissions calculation with configurable formulas
- Equity share adjustments on all reports
- PDF/DOCX report generation
- AI-powered executive summary generation

---

## What's Been Implemented

### Core Platform (DONE)
- [x] Multi-tenant authentication with JWT
- [x] Role-based access control (SuperAdmin, Admin, User)
- [x] Organization and Facility management
- [x] Emissions data entry and management (Scope 1, Scope 2, Biogenic)
- [x] Carbon Sinks tracking

### Calculation Engine (DONE)
- [x] CO2, CH4, N2O calculations with GWP values
- [x] Unit conversion system
- [x] Process Templates for dynamic calculations
- [x] Equity Share percentage on facilities

### Dashboard (DONE - Dec 2025)
- [x] Multi-facility filter (multi-select dropdown)
- [x] Default financial year date filter
- [x] Emissions by Scope charts
- [x] Emissions Trend visualization
- [x] Emissions by Facility breakdown
- [x] Emissions by Category analysis
- [x] Year-wise analysis
- [x] Month-over-month comparison
- [x] Carbon Sinks and Net Emissions display

### Reports (DONE)
- [x] GHG Inventory Report (PDF/DOCX)
- [x] Scope 2 Market-Based Report
- [x] AI Executive Summary Report (Anthropic Claude integration)

### Data Integrity (DONE - Dec 2025)
- [x] Dropped unused `emissions` collection
- [x] Standardized on `emission_records` collection
- [x] Backfilled `organization_id` on all records
- [x] Enforced `organization_id` on new entries

---

## Prioritized Backlog

### P0 - Critical
- None currently

### P1 - High Priority
- [ ] Implement "Forgot Password" feature
- [ ] Implement full Scope 3 module (new categories, report templates, frontend UI)

### P2 - Medium Priority
- [ ] Show detailed formula breakdown in emissions entry UI
- [ ] Implement CBAM (Carbon Border Adjustment Mechanism) module
- [ ] Fix GWP CH4 calculation (fossil vs non-fossil fuel differentiation)
- [ ] Make hardcoded dropdowns dynamic (scopes, categories, units)
- [ ] Locate and fix "Why SustainRepo?" animation speed (blocked on user input)

### P3 - Low Priority/Technical Debt
- [ ] Refactor monolithic `backend/server.py` into routes/models/services
- [ ] Full SMTP integration for user notifications
- [ ] Add comprehensive test coverage

---

## Key Files
- `/app/backend/server.py` - Main backend (monolithic, needs refactoring)
- `/app/frontend/src/pages/Dashboard.js` - Main dashboard
- `/app/frontend/src/pages/admin/Emissions.js` - Emissions management
- `/app/frontend/src/pages/admin/Reports.js` - Report generation
- `/app/frontend/src/components/forms/EmissionEntryForm.js` - Emission entry form

## Test Credentials
- **SuperAdmin:** superadmin@ecotrack.com / SuperAdmin123!
- **Admin (Org 1):** testadmin@test.com / Test123!

## Third-Party Integrations
- `anthropic` - AI executive summaries (Claude)
- `reportlab` - PDF generation
- `python-docx` - DOCX generation
- `matplotlib` - Chart generation in reports
- `pandas`, `openpyxl` - Excel data imports

---

## Recent Changes (Dec 2025)

### Bug Fixes
- Fixed `ReferenceError: selectedFacility is not defined` in Dashboard.js
  - Updated 3 occurrences where old variable name was still used after multi-select refactor
- Fixed multi-facility filter not working when more than 1 facility selected
  - Backend: Changed `facility_id: Optional[str]` to `facility_id: List[str] = Query(default=[])`
  - Updated query to use `$in` operator for multiple IDs
- Renamed "Biogenic" to "Scope 3" then reverted to "Biogenic" per user request
  - Order now: Scope 1 → Scope 2 → Biogenic (with custom Legend components)
- Fixed Organization Details logo preview not showing when editing
  - Added `getFullLogoUrl()` helper to handle relative URLs
  - Reset `logoError` state when entering edit mode

### Features Completed
- AI Executive Summary with equity share and carbon sinks integration
- Multi-facility dashboard filters (supports selecting multiple facilities)
- Default financial year date range
- **Reporting Year Type Selection** in emissions entry form:
  - Calendar Year (Jan-Dec) or Financial Year (Apr-Mar)
  - Dynamic month ordering based on selection
  - Proper year handling for financial year months (Jan-Mar use next year)

## Recent Changes (Mar 2026)

### GHG Sinks Module Enhancements (DONE)
- Added filter/sort UI to Sinks page (`/app/frontend/src/pages/Sinks.js`)
  - Filter by Facility dropdown
  - Filter by Year dropdown
  - Sort By dropdown (Date, Facility, Emissions Reduced)
  - Sort Order dropdown (Ascending, Descending)
  - Clickable column headers for quick sorting
  - Dynamic filtered totals display
- Dashboard "Top Sinks By Facility" update
  - Renamed from "Sinks by Facility" to "Top Sinks By Facility"
  - Data sorted in descending order by total_reduced

### GHG Emissions User Names Display (DONE)
- Updated emissions to show user names instead of emails for:
  - "Created by" field in emission cards
  - "Updated by" field in emission cards
  - User names in Version History modal
- Backend changes:
  - Added `created_by_name`, `updated_by_name` fields to EmissionRecordResponse model
  - Added `changed_by_name` field to EmissionHistoryResponse model
  - GET /api/emissions now populates names by batch-looking up user IDs
  - GET /api/emissions/{id}/history now returns user names
- Frontend fallback: Shows email if user no longer exists or name unavailable

### Profile Name Editing (DONE)
- Users and Admins can now edit their name in the Profile page
- Backend changes:
  - Added `ProfileUpdate` model and `PUT /api/auth/profile` endpoint
- Frontend changes:
  - Added edit icon next to name in Profile page
  - Inline editing with save/cancel buttons
  - Added `refreshUser()` function to AuthContext to update user data after name change
  - Sidebar user name updates immediately after save

### Report Carbon Intensity Feature (DONE)
- Added production quantity input for each facility in GHG Inventory Report dialog
  - Quantity field (numeric)
  - Unit field (e.g., kg, tonnes, units)
- Backend changes:
  - Added `FacilityProduction` model and updated `GHGReportRequest` to accept `facility_production` data
  - Updated report generator to include Carbon Intensity section in Chapter 4 for each facility
- Report now includes for each facility:
  - Carbon Intensity section (4.x.7) - ALWAYS shown
  - If production data provided: Formula, calculation, result with unit (e.g., "0.15 tCO₂e/tonne"), and explanation
  - If production data NOT provided: Shows "NA" with explanation to provide data in future reports
- Carbon Intensity unit format: tCO₂e/{user-specified unit}

### Email Integration with Resend (DONE)
- Integrated Resend email service for transactional emails
- Features implemented:
  1. **Forgot Password Flow**:
     - User enters email on `/forgot-password` page
     - Backend generates secure reset token (24hr expiry)
     - Beautiful HTML email template sent with reset link
     - User clicks link to `/reset-password?token=xxx`
     - User enters new password and confirms
     - Password updated and token marked as used
  2. **User Invitation Emails**:
     - When SuperAdmin creates Admin user
     - When Admin creates regular User
     - Beautiful HTML email with login credentials and "Login to SustainRepo" button
- Email templates feature:
  - SustainRepo branding with green gradient header
  - Professional styling with inline CSS
  - Security notices and important warnings
  - Mobile-responsive design

### GHG Inventory Report Improvements (DONE)
- **PDF Download**: Fixed - now correctly generates PDF using LibreOffice
- **Chapter 1 Numbering**: Organization and Facilities now numbered as 1.1 and 1.2
- **Font Size Hierarchy**: 
  - Chapter headings (x): 16pt, centered, bold
  - Section headings (x.y): 14pt, left aligned, bold
  - Subsection headings (x.y.z): 12pt, left aligned, bold
- **Chapter 2**: Completely rewritten with comprehensive organizational boundary text
- **List of Emissions Table**: Category column now vertically center aligned
- **Chapter 3 Biogenic Fix**: Process Overview now excludes biogenic emissions (matches List of Emissions)
- **Pie Charts**: 
  - Reduced size by 15% for category-wise emission distribution
  - Fixed text cutting with better padding
  - Labels shortened to prevent overflow
- **Figure Captions**: Now center aligned with gray italic styling
