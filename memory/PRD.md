# GHG Calculation Platform - Product Requirements Document

## Original Problem Statement
Build a Greenhouse Gas (GHG) calculation platform with the following capabilities:
- Calculate Scope 1 and Scope 2 emissions on a per-facility basis
- CRUD operations for facilities
- Analytics dashboard comparing Scope 1 vs Scope 2 emissions
- Generate and download reports in Word format
- Use standard GHG protocol emission factors with custom factor support
- 3-tier role hierarchy: Super Admin, Admin, User
- Custom authentication with forgot password feature
- Email notifications for new users
- Version history/logs for emission data changes
- File uploads for evidence/justification for custom emission factors

## User Roles

### Super Admin
- Manages organizations, admins, and STANDARD emission factors
- Has global analytics dashboard
- Can create/edit/delete standard emission factors (is_custom=false)
- Manages Fuel Database with comprehensive fuel parameters
- Credentials: superadmin@ecotrack.com / SuperAdmin123!

### Admin
- Manages organization details, facilities, and users
- Can VIEW standard emission factors but cannot edit/delete them
- Can create/edit/delete CUSTOM emission factors (is_custom=true) for their organization
- Organization-level dashboard
- Responsible for historical data and base year

### User
- Manages emission data for assigned facilities
- Can VIEW standard emission factors but cannot edit/delete them
- Can create/edit/delete CUSTOM emission factors (is_custom=true) for their organization
- Can VIEW organization details (read-only)
- Can EDIT facility data (but not delete or create new facilities)
- Facility-level dashboard

## Emission Calculation System (Updated Feb 19, 2026)

### Canonical Unit Normalization Engine (COMPLETED Feb 19, 2026)
The backend now uses a strict unit normalization system to ensure consistent calculations:

**Canonical Formula:**
```
Base Emissions (kg gas) = quantity_kg × NCV_TJ_per_kg × EF_kg_gas_per_TJ
```

**Step 1: Quantity to kg**
- Mass units (kg, g, tonne) → direct conversion
- Volume liquid units (L, kL, mL) → requires density (kg/L)
- Volume cubic units (m³, ft³) → requires density (kg/m³)

**Step 2: NCV to TJ/kg**
- TJ/Gg → multiply by 0.001 (since 1 Gg = 1,000,000 kg)
- MJ/kg → multiply by 0.000001
- GJ/t → multiply by 0.001

**Step 3: Gas-wise Calculation**
```
CO2 (kg) = quantity_kg × NCV_TJ/kg × EF_CO2_kg/TJ
CH4 (kg) = quantity_kg × NCV_TJ/kg × EF_CH4_kg/TJ
N2O (kg) = quantity_kg × NCV_TJ/kg × EF_N2O_kg/TJ
```

**Step 4: CO₂e (Post-Processing with GWP)**
```
CO2e (kg) = CO2 + (CH4 × 28) + (N2O × 273)
```

### GWP Values (IPCC AR5 - Fixed)
- CO2: 1
- CH4: 28
- N2O: 273

### Fuel Database (Super Admin)
The Super Admin manages a comprehensive Fuel Database with the following parameters:
- **Basic Info:** Fuel name, Category (Stationary/Mobile Combustion, etc.), Industry/Sector, Scope
- **Physical Properties:** Calorific Value (NCV in TJ/Gg, MJ/kg, etc.), Density (kg/L, optional)
- **Emission Factors:** CO2 (kg CO2/TJ), CH4 (kg CH4/TJ, optional), N2O (kg N2O/TJ, optional)
- **Metadata:** Region, Source (IPCC, EPA, etc.), References, Notes

### User Override Options
When adding emissions, users can optionally override:
- Calorific Value (use their own measured value)
- Density (use their own measured value)

## Tech Stack
- **Backend:** FastAPI + MongoDB + Pydantic
- **Frontend:** React + TailwindCSS + Shadcn/UI
- **Reporting:** python-docx for Word reports
- **File Upload:** python-multipart for handling file uploads

## What's Been Implemented

### Fuel Database Integration (COMPLETED Feb 19, 2026)
- [x] New Fuel Database collection with comprehensive fuel parameters
- [x] Super Admin CRUD for Fuel Database (/api/super-admin/fuel-database)
- [x] Admin/User read access to Fuel Database (/api/fuel-database)
- [x] Emissions form updated to select fuels from database
- [x] Fuel dropdown grouped by category (Mobile Combustion, Stationary Combustion, etc.)
- [x] Auto-populate parameters (calorific value, emission factors, source) on fuel selection
- [x] Real-time emission calculation using new formula
- [x] Show Breakdown button revealing step-by-step calculation
- [x] Override checkboxes for Calorific Value and Density
- [x] Backend calculate_total_emissions() function with CO2/CH4/N2O and GWP
- [x] Custom fuel type option for fuels not in database (requires justification)

### Core Features (Complete)
- [x] User authentication (JWT-based)
- [x] 3-tier role system (Super Admin, Admin, User)
- [x] Organization management (CRUD)
- [x] Facility management (CRUD)
- [x] Emission records (CRUD with version history)
- [x] Dashboard with charts and statistics
- [x] Report generation (Word format with year-wise breakdown)
- [x] Standard GHG emission factors (from DB, not hardcoded)
- [x] Custom emission factors with justification
- [x] **Fuel Database integration for accurate emission calculations**

### V3 Updates (Complete - Feb 14, 2026)

#### Emission Factor Overhaul
- [x] Removed all hardcoded STANDARD_EMISSION_FACTORS from backend
- [x] All emission factors now come from database via /api/emission-factors
- [x] Super Admin creates standard factors (is_custom=false)
- [x] Admin/User create custom factors (is_custom=true) with justification required
- [x] Custom factor API endpoints: POST/PUT/DELETE /api/custom-emission-factors

#### Super Admin Changes
- [x] Emission Factors page shows only DB standard factors (no default tab)
- [x] Company logo: File upload ONLY (removed URL input option)
- [x] Can edit/delete standard factors without creating duplicates

#### Admin Changes
- [x] Cannot edit/delete standard emission factors
- [x] Can create/edit/delete custom emission factors for organization
- [x] Logo upload: File upload only (no URL option)
- [x] Remarks/Notes field added to Organization and Facilities
- [x] File upload fixed (uses /api/upload/evidence endpoint)

#### User Changes
- [x] Organization menu added to sidebar (read-only view)
- [x] Can edit facility data (but not delete or create)
- [x] Can create/edit/delete custom emission factors
- [x] Combined report generation available

#### Common Fixes
- [x] Evidence file download works correctly
- [x] Version history simplified: Shows only timestamp + user email (no detailed changes)
- [x] Remarks/Notes field saves correctly in Organization and Facilities
- [x] Removed calendar popovers in Emissions (uses native month input)

### V2 Updates (Complete - Feb 14, 2026)
- [x] Address fields mandatory (City, State, Country, PIN/ZIP)
- [x] Facility sector is mandatory
- [x] Emission Factor references are mandatory
- [x] Super Admin emission factors page unified (removed tabs)
- [x] Evidence download fixed for both internal files and external URLs

## Pending Tasks (Priority Order)

### P0 - Critical (COMPLETED Feb 15-17, 2026)
- [x] Logo Preview Broken (Super Admin & Admin) - FIXED: Added public /api/files/{id}/view endpoint
- [x] Evidence File Download Failed - FIXED: Unicode filename sanitization in Content-Disposition header
- [x] Version History Incorrect - FIXED: Backend now populates changed_by_email from user lookup
- [x] Remarks/Notes Not Saving - VERIFIED WORKING: Field saves correctly in Organizations and Facilities
- [x] PDF Attachments Not Viewable - FIXED: Extended /api/files/{id}/view to allow PDF files (not just images)
- [x] Version History Not Updating on Edits - FIXED: Added creation history entry on POST, update history entries on PUT with action field
- [x] Country-Specific Emission Factors - FIXED: Frontend now prioritizes factors matching facility country before falling back to global factors
- [x] User Organization View Missing Fields - FIXED: Added reporting_frequency and base_year to User's read-only organization view
- [x] Reports Button Text - FIXED: Changed "Download Combined Report" to "Download Report"
- [x] Organization Update Failing - FIXED: Convert empty base_year to null before sending to API
- [x] Max Limits Not Enforced - FIXED: Added validation in create_admin, create_facility, create_user to check max_admins, max_facilities, max_users limits
- [x] Calendar Removed from Emissions Form - FIXED: Changed Calendar component to CalendarIcon in reporting period labels

### Super Admin Features (COMPLETED Feb 17, 2026)
- [x] Delete Admin - Added DELETE /api/super-admin/admins/{admin_id} endpoint
- [x] Dashboard User/Admin Counts - Updated dashboard to show Total Admins, Total Users, plus per-org counts with progress bars
- [x] Deactivate Organization - DELETE marks org as inactive, blocks all users from login
- [x] Reactivate Organization - PUT /api/super-admin/organizations/{id}/reactivate reverses deactivation
- [x] Login Blocking for Inactive Orgs - Login endpoint checks org.is_active and returns 403 for inactive orgs
- [x] Predefined Sectors - Added Sectors CRUD with 10 default sectors (Manufacturing, Transportation, Energy, etc.)
- [x] Facility Sector Dropdown - Facilities page now fetches sectors from API
- [x] Conversion Rules in Formulas - Added conversion_rules field to calculation formulas for unit-specific calculations

### Admin/User Features (COMPLETED Feb 17, 2026)
- [x] Admin Delete User - DELETE /api/admin/users/{user_id} soft deletes user, blocks login (uses AlertDialog confirmation)
- [x] Custom Fuel Type in Emissions - Added "+ Add Custom Fuel Type" option in emission form with custom factor input
- [x] Sectors Dropdown with Custom Option - Facility form shows predefined sectors with "+ Add Custom Sector" option
- [x] Remove base_year from Organization Details - Admin's org edit form no longer shows base_year field
- [x] PDF/File Download - Added /api/files/{id}/download endpoint for all file types
- [x] View + Download Buttons - All attachments in Org/Facilities/Emissions now have both View and Download options
- [x] Removed Custom Factors Module - Removed the separate Custom Factors page (custom fuel types now in Emissions form)
- [x] Removed Duplicate Org Panel - User sidebar no longer has expandable org details (uses /organization page instead)

### P1 - High Priority (COMPLETED Feb 15, 2026)
- [x] Filters Overlapping in Emissions Module - FIXED: Changed to 2x2 responsive grid layout
- [x] Combined Report for Users - FIXED: Removed role restriction, Users can now download combined reports
- [x] Organization Limits - Super Admin can define max_facilities, max_admins, max_users per organization
- [x] Calculation Formulas - Super Admin can CRUD formulas for Scope 1, 2, Biogenic with expression, input fields, output unit
- [x] Pincode Validation - 6-digit numeric validation on Organization and Facility forms

### P2 - Medium Priority (In Progress)
- [ ] Implement "Forgot Password" feature (backend endpoints + frontend forms)
- [ ] Full SMTP integration for forgot password and new user emails
- [ ] Refactor monolithic backend/server.py into routes/models/services structure
- [ ] Refactor large frontend components into smaller reusable components

### Future/Backlog
- [ ] Display unit (kgCO2e) next to quantity in emission cards
- [ ] Add export functionality for emission data (CSV/Excel)
- [ ] Advanced filtering on dashboards

## API Endpoints

### Authentication
- POST /api/auth/login - User login
- POST /api/auth/register - User registration
- PUT /api/auth/change-password - Change password

### Super Admin
- POST /api/super-admin/emission-factors - Create standard factor
- PUT /api/super-admin/emission-factors/{id} - Update standard factor  
- DELETE /api/super-admin/emission-factors/{id} - Delete standard factor
- GET /api/super-admin/organizations - List all organizations
- POST /api/super-admin/organizations - Create organization
- GET /api/super-admin/stats - Global statistics
- **GET /api/super-admin/fuel-database - List all fuels**
- **POST /api/super-admin/fuel-database - Create fuel**
- **PUT /api/super-admin/fuel-database/{id} - Update fuel**
- **DELETE /api/super-admin/fuel-database/{id} - Delete fuel**

### Fuel Database (Admin/User Read Access)
- **GET /api/fuel-database - List all fuels for selection in emissions**
- **GET /api/fuel-database/{id} - Get specific fuel details**
- **GET /api/gwp-values - Get GWP constants (CO2=1, CH4=28, N2O=265)**

### Emission Factors
- GET /api/emission-factors - Get all factors (standard + custom for user's org)
- GET /api/emission-factors/standard - Get standard factors only
- POST /api/custom-emission-factors - Create custom factor (Admin/User)
- PUT /api/custom-emission-factors/{id} - Update custom factor (Admin/User)
- DELETE /api/custom-emission-factors/{id} - Delete custom factor (Admin/User)

### Organizations
- GET /api/organizations/my - Get current user's organization (Admin & User)
- PUT /api/organizations/my - Update organization (Admin only)

### Facilities
- GET /api/facilities - List facilities
- POST /api/facilities - Create facility (Admin only)
- PUT /api/facilities/{id} - Update facility (Admin & User)
- DELETE /api/facilities/{id} - Delete facility (Admin only)

### Emissions
- GET /api/emissions - List emission records
- POST /api/emissions - Create emission record
- PUT /api/emissions/{id} - Update emission record
- DELETE /api/emissions/{id} - Delete emission record
- GET /api/emissions/{id}/history - Get version history

### Reports
- GET /api/reports/facility/{id} - Generate facility report
- POST /api/reports - Generate combined report (multiple facilities)

### Calculation Formulas (Super Admin)
- GET /api/calculation-formulas - List all formulas
- POST /api/calculation-formulas - Create formula
- GET /api/calculation-formulas/{id} - Get single formula
- PUT /api/calculation-formulas/{id} - Update formula
- DELETE /api/calculation-formulas/{id} - Delete formula

### Files
- POST /api/upload/evidence - Upload evidence file
- GET /api/files/{file_id} - Download file (requires authentication)
- GET /api/files/{file_id}/view - View file publicly (images and PDFs, for previews)

## Database Schema

### emission_factors
```json
{
  "id": "uuid",
  "name": "string",
  "scope": "scope1|scope2|biogenic",
  "category": "string",
  "sub_category": "string",
  "factor": "float",
  "unit": "string",
  "source": "string",
  "references": "string",
  "region": "string",
  "is_custom": "boolean",
  "organization_id": "string|null",  // null for standard factors
  "justification": "string|null",    // required for custom factors
  "created_by": "string",
  "created_at": "datetime",
  "updated_by": "string",
  "updated_at": "datetime"
}
```

## Test Credentials
- **Super Admin:** superadmin@ecotrack.com / SuperAdmin123!
- **Admin (no org):** admin@ghg.com / admin123
