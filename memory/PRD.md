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
  - `Dashboard.js` - Admin dashboard with charts
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

## Completed Work (Feb-Mar 2025)

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
- [x] Footer with Date of Report and SustainRepo platform statement
- [x] ISO compliance statement in conclusion

### P0 - Report Generator Rewrite (COMPLETED)
- [x] Company logo on cover page
- [x] Remove Table of Contents
- [x] Fix image attachments (filesystem access for internal URLs)
- [x] Correct organization details display
- [x] Emission list format: `PROCESS_NAME - FUEL_USED`
- [x] Summary table by Scope > Category
- [x] All charts: category-wise, fuel-wise, fuel quantity distributions
- [x] Fixed self-referential HTTP request blocking (single-threaded uvicorn)

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

### Previous Session Fixes
- [x] Token-based download system for sandboxed environments
- [x] Reporting period selector (single month or 12-month flexible)
- [x] Scope-based form field visibility
- [x] Scope 2 custom emission factor editing
- [x] Unit display: tCO2/MWh for Scope 2
- [x] Process description saving in Facilities
- [x] Dashboard tCO₂e calculation

## Upcoming Tasks (Prioritized)

### P0 (Critical)
- Make GWP values (CH₄, N₂O) configurable in SuperAdmin UI

### P1 (High)
- Make energy units configurable by SuperAdmin
- Implement "Forgot Password" feature

### P2 (Medium)
- Refactor monolithic `server.py` into packages
- Refactor large `Emissions.js` component
- Full SMTP integration for notifications

## Dashboard Calculation Logic

### Data Flow
1. **Backend API** (`/api/dashboard/stats`):
   - Fetches all emissions based on user role:
     - SuperAdmin: All facilities
     - Admin: Organization's facilities
     - User: Assigned facilities only
   - Calculates totals by summing `total_emissions` field
   - Groups by scope (scope1, scope2, biogenic)
   - Creates trend data by reporting period

2. **Frontend Calculation** (`Dashboard.js`):
   ```javascript
   // Total emissions = Scope1 + Scope2 + Biogenic
   totals.total = totals.scope1 + totals.scope2 + totals.biogenic;
   
   // Values from emissions_by_facility or emissions_trend (if date filtered)
   scope1 = facilities.reduce((sum, f) => sum + f.scope1_emissions, 0)
   scope2 = facilities.reduce((sum, f) => sum + f.scope2_emissions, 0)
   biogenic = facilities.reduce((sum, f) => sum + f.biogenic_emissions, 0)
   ```

3. **Display Units**:
   - Cards: tCO₂e (tonnes)
   - Charts: kg CO₂e (shown in tooltips)

## Test Credentials
- **Super Admin:** superadmin@ecotrack.com / SuperAdmin123!
- **Admin:** Various per organization
- **User:** test@user.com / user123
