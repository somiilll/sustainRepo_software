# GHG Calculation Platform (SustainRepo)

## Original Problem Statement
Building a multi-tenant Greenhouse Gas (GHG) calculation platform with:
- SuperAdmin-managed dynamic emissions calculation engine
- Organization, facility, and user management
- Emission factor configuration and calculations
- GHG Inventory Report generation (.docx)
- Dashboard with analytics and visualizations

## Current Architecture

### Backend (FastAPI)
- `/app/backend/server.py` - Main API server with all routes and models
- `/app/backend/report_generator.py` - GHG Report Generator class
- MongoDB for data storage

### Frontend (React)
- `/app/frontend/src/pages/` - Main page components
  - `Dashboard.js` - Admin dashboard with 6 analysis charts
  - `Emissions.js` - Emissions management form
  - `Reports.js` - Report generation and download
  - `Facilities.js` - Facility management
- `/app/frontend/src/components/ui/` - Shadcn UI components

### Key Features
1. **Multi-tenant Architecture** - SuperAdmin > Organizations > Admins > Users
2. **Dynamic Emission Factors** - Configurable by SuperAdmin
3. **Scope 1/2/Biogenic Emissions** - Full GHG protocol support
4. **Report Generation** - Professional .docx reports with charts
5. **Token-based File Downloads** - Sandbox-compatible downloads

## Completed Work (Feb-Mar 2026)

### Carbon Sinks Module (UPDATED - Mar 6, 2026)
- [x] New "Sinks" page created (`/app/frontend/src/pages/Sinks.js`)
- [x] Backend API endpoints: POST/GET/PUT/DELETE `/api/sinks`
- [x] Sidebar navigation updated with Sinks item (between Emissions and Reports)
- [x] Dashboard displays:
  - Carbon Sinks summary card (total offset)
  - Net Emissions card (Total - Sinks)
  - Sinks by Facility breakdown
- [x] Report generator deducts sinks from total emissions in calculations
- [x] Sinks data included in GHG Inventory Report totals
- [x] **NEW:** Start Date and End Date fields (replaced single month picker)
- [x] **NEW:** Date range display in sinks table (e.g., "Jan 1, 2025 - Dec 31, 2025")
- [x] **NEW:** Migrated existing sinks to new date format

### Subscription Visibility for Admin/User (COMPLETED - Mar 6, 2026)
- [x] **Profile page** now shows "Platform Subscription" section
- [x] Displays subscription expiry date and days remaining
- [x] Color-coded status:
  - Green: Valid subscription (30+ days)
  - Yellow: Expiring soon (within 30 days)
  - Red: Expired
- [x] Warning message for expiring/expired subscriptions

### Reports Module Cleanup (COMPLETED - Mar 3, 2026)
- [x] Removed "Report Configuration" section (old multi-facility report)
- [x] Removed "Description of Change" field from GHG Inventory Report dialog
- [x] Reports page now shows only GHG Inventory Report card

### Dashboard Enhancements (COMPLETED - Mar 2, 2026)
- [x] **Emissions by Category** - Pie chart (Stationary Combustion vs Mobile Combustion vs Fugitive vs Process)
- [x] **Emissions by Fuel Type** - Horizontal bar chart showing breakdown by fuel source
- [x] **Year-wise Fuel Emissions** - Annual breakdown of emissions by fuel type
- [x] **Year-wise Facility Emissions** - Annual emissions comparison across facilities
- [x] **Month-over-Month Comparison** - Track emissions changes between consecutive months
- [x] Total of 6 analysis types in dashboard

### Report Generator Fixes (COMPLETED - Mar 2, 2026)
- [x] Added DISCLAIMER section above abbreviations (page 2)
- [x] Renamed "Organization's Overview" to "Organization" in Chapter 1
- [x] Removed platform message from footer (now only shows Date of Report)
- [x] Removed "ensuring consistency..." line from Chapter 6 conclusion
- [x] Additional Boundary Notes value now on NEW line after label
- [x] Chart number overlap fixed (Y-axis margin increased)
- [x] Summary table now filtered by Scope first, then by Date

### Report Generator Complete Rewrite (COMPLETED - Mar 2026)
- [x] New 6-Chapter structure implemented:
  - Chapter 1: General Description of Organization & Inventory Objectives
  - Chapter 2: Organization Boundaries (with Control/Equity Share approach paraphrasing)
  - Chapter 3: Reporting Boundaries
  - Chapter 4: Quantified GHG Inventory (with emissions, analysis, charts)
  - Chapter 5: GHG Reduction Initiative & Internal Performance Tracking
  - Chapter 6: Conclusion with ISO 14064-1:2018 reference
- [x] Dynamic data handling with "Not Available" fallbacks (no raw {} brackets)
- [x] Organization Boundary logic with proper paraphrasing for both approaches
- [x] Reporting Period filtering - only includes emissions within selected period
- [x] Month sorting in chronological order (Jan → Dec)
- [x] Totals calculation: Total Direct (A), Indirect (B), A+B, Removals (C), Biogenic, GHG (A+B-C)
- [x] Deduplication logic for process names and fuels (case-insensitive)
- [x] Analysis section with % contribution, category/fuel dominance
- [x] Charts: Scope comparison, Category-wise, Fuel-wise, Monthly trend, Facility comparison
- [x] Organization-level emissions table and analysis
- [x] Mathematical validation included

### Organization Module Field Updates (COMPLETED)
- [x] Added "Person Responsible" field
- [x] Renamed "Remarks/Notes" to "Other Information"
- [x] Added "Purpose of the Report" field
- [x] Organizational Boundaries now has two approach options:
  - Control Approach (100% emissions from controlled operations)
  - Equity Share Approach (emissions by equity share percentage)
- [x] Added "GHG Reduction Initiatives" field
- [x] Added "Internal Performance Tracking Description" field

### Facility Module Field Updates (COMPLETED)
- [x] Renamed "Remarks/Notes" to "Other Information"
- [x] Renamed "Products Manufactured" to "Products/Services" (large textarea)
- [x] Removed "Quantity of Products Manufactured in a Day" field
- [x] Renamed "Machinery Used" to "Machinery and Equipments"

### Permanent Delete Organization (COMPLETED - Mar 3, 2026)
- [x] Backend endpoint: `DELETE /api/super-admin/organizations/{org_id}/permanent`
- [x] Cascading delete removes: emission_records, sinks, facilities, users
- [x] SuperAdmin-only access (returns 403 for admin/user roles)
- [x] Frontend: Red AlertTriangle button on organization cards
- [x] Confirmation dialog with irreversible warning listing all data to be deleted
- [x] UI updates immediately after successful deletion
- [x] Test file created: `/app/backend/tests/test_permanent_delete_organization.py`

### UI/UX Improvements (COMPLETED - Mar 5, 2026)
- [x] **Organization form:** Person Responsible field is now mandatory (red asterisk + validation)
- [x] **Organization form:** Equity Share Percentage is mandatory when equity_share approach selected
- [x] **Facilities form:** Renamed "Responsible Person" to "Person Responsible"
- [x] **Subscription Warning Banner:** Yellow warning shown to admin/user when subscription expires within 30 days
- [x] **Reports module:** Updated text to include Sinks: "Emissions summary for selected period (Scope 1, 2, Biogenic & Sinks)"

### Control Approach Enhancement (COMPLETED - Mar 5, 2026)
- [x] When "Control Approach" is selected, must choose either:
  - **Operational Control** - Full authority to implement operating policies
  - **Financial Control** - Ability to direct financial and operating policies
- [x] Sub-selection is mandatory (validation prevents save without selecting type)
- [x] View mode shows specific control type (e.g., "Operational Control Approach")
- [x] Report generator updated to display specific control type in Chapter 2:
  - "Operational Control Approach" or "Financial Control Approach" text
- [x] Form values stored as: `control_operational` or `control_financial`

### Dashboard Month-over-Month Chart (UPDATED - Mar 5, 2026)
- [x] Removed "Previous Month" bar from the chart
- [x] Chart now shows only "Monthly Emissions" (green bars) + "Change %" line
- [x] Legend updated to show "Monthly Emissions" instead of "Current Month"

### Subscription & Login Enforcement (COMPLETED - Mar 6, 2026)
- [x] **Expired subscription blocks login** - Admin/User cannot login if org subscription has expired
- [x] Error message: "Your organization's subscription has expired. Please contact your administrator to renew."
- [x] SuperAdmin can still login regardless of any org status

### Organization Management UI Fixes (COMPLETED - Mar 6, 2026)
- [x] **Soft Delete button renamed** - Dialog title changed from "Deactivate" to "Soft Delete Organization"
- [x] Button label changed from "Deactivate" to "Delete"
- [x] Clear messaging about data preservation
- [x] Removed duplicate "Deactivate" terminology confusion

### Fuel Database UI Updates (COMPLETED - Mar 6, 2026)
- [x] Renamed "Emission Factor Basis (Alternative)" to **"Emission Factor (Quantity Basis)"**
- [x] Removed explanatory text: "If emission factor is based on energy consumption..."

### Fuel Database Bulk Import (COMPLETED - Mar 5, 2026)
- [x] Imported 200 fuels from user-provided Excel file
- [x] Total fuels in database: 205
- [x] Duplicate check considers: fuel_name + category + industry_sector + region

### New Emissions Entry Form (COMPLETED - Mar 6, 2026)
- [x] **Multi-step wizard form** - 4 steps: Selection → Process → Monthly Data → Notes
- [x] **Step 1:** Facility, Scope (Scope 1/2/Biogenic), Category, Fuel Type selection
- [x] **Step 2:** Process names (multiple entries), Person responsible
- [x] **Step 3:** Reporting year selection, Monthly accordion for data entry
- [x] **Step 4:** Notes and summary view before save
- [x] Monthly data accordion shows all 12 months with fill status indicator
- [x] Each month supports: Quantity, Unit, Evidence uploads (multiple), Override options
- [x] Scope 1: Override calorific value and density with justification
- [x] Scope 2: Override emission factor with justification
- [x] Form creates separate emission records for each month with data

### Emission Calculation Bug Fix (FIXED - Mar 6, 2026)
- [x] **Issue:** Emission summary cards showed 0.00 for all values after saving
- [x] **Root Cause:** Frontend calculation in `EmissionEntryForm.js` had incorrect unit conversion
  - Was dividing by 1,000,000 when CV is already in TJ/kg
  - Was not converting quantity units (t → kg) before calculation
- [x] **Fix Applied:**
  - Added proper unit conversion (t, g, kL, L, mL → kg) before calculation
  - Fixed formula: Energy(TJ) = Quantity(kg) × CV(TJ/kg), CO2(kg) = Energy × EF, CO2(t) = CO2(kg)/1000
  - Store original quantity value, not converted quantity in database
- [x] **Status:** VERIFIED - New emissions display correct calculated values
  - Example: 100t Diesel → 318.63 tCO2 ✓
  - Example: 10t Ethane → 28.58 tCO2 ✓
- [x] **Note:** Old emissions created with incorrect calculations still show 0.00 - need recalculation or re-entry

## Upcoming Tasks (Prioritized)

### P0 (Immediate)
- [COMPLETED] Emission summary card display bug - VERIFIED FIXED

### P1 (High)
- Beautify the tool (UI/UX improvements beyond dashboard)
- Make energy units configurable by SuperAdmin
- Implement "Forgot Password" feature

### P2 (Medium)
- Refactor monolithic `server.py` into packages
- Refactor large `Emissions.js` component (clean up old form code)
- Full SMTP integration for notifications
- Provide explanation of dashboard calculation logic to users

## Dashboard Analysis Types (6 Total)
1. **Emissions by Scope** - Pie chart (Scope 1, Scope 2, Biogenic)
2. **Emissions Trend** - Line chart showing scope trends over time
3. **Emissions by Facility** - Bar chart comparing facilities
4. **Emissions by Category** - Pie chart (Stationary/Mobile/Fugitive/Process)
5. **Emissions by Fuel Type** - Horizontal bar chart by fuel source
6. **Year-wise Fuel Emissions** - Annual fuel breakdown
7. **Year-wise Facility Emissions** - Annual facility comparison
8. **Month-over-Month Comparison** - Change tracking with % indicator

## Test Credentials
- **Super Admin:** superadmin@ecotrack.com / SuperAdmin123!
- **Test Admin:** testadmin@test.com / Test123!
- **User:** test@user.com / user123
