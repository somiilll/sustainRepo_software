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
- Manages organizations, admins, and standard emission factors
- Has global analytics dashboard
- Credentials: superadmin@ecotrack.com / SuperAdmin123!

### Admin
- Manages organization details, facilities, and users
- Manages organization-specific emission factors
- Organization-level dashboard
- Responsible for historical data and base year

### User
- Manages emission data for assigned facilities
- Facility-level dashboard

## Tech Stack
- **Backend:** FastAPI + MongoDB + Pydantic
- **Frontend:** React + TailwindCSS + Shadcn/UI
- **Reporting:** python-docx for Word reports
- **File Upload:** python-multipart for handling file uploads

## What's Been Implemented

### Core Features (Complete)
- [x] User authentication (JWT-based)
- [x] 3-tier role system (Super Admin, Admin, User)
- [x] Organization management (CRUD)
- [x] Facility management (CRUD)
- [x] Emission records (CRUD with version history)
- [x] Dashboard with charts and statistics
- [x] Report generation (Word format with year-wise breakdown)
- [x] Standard GHG emission factors
- [x] Custom emission factors with justification

### File Upload Feature (Complete - Feb 13, 2026)
- [x] Backend endpoints for file upload, download, list, delete
- [x] Supported file types: PDF, JPG, PNG, XLSX, XLS, CSV, DOC, DOCX
- [x] File size limit: 10MB
- [x] FileUpload UI component with drag-and-drop
- [x] Integration with Emissions page
- [x] Evidence document linking to emission records

## API Endpoints

### Authentication
- POST /api/auth/login - User login
- POST /api/auth/signup - User registration
- POST /api/auth/change-password - Change password
- GET /api/auth/me - Get current user

### File Management (NEW)
- POST /api/upload/evidence - Upload evidence file
- GET /api/files - List uploaded files
- GET /api/files/{file_id} - Download file
- DELETE /api/files/{file_id} - Delete file

### Organizations
- GET/POST /api/super-admin/organizations
- PUT/DELETE /api/super-admin/organizations/{id}

### Facilities
- GET/POST /api/facilities
- GET/PUT/DELETE /api/facilities/{id}

### Emissions
- GET/POST /api/emissions
- PUT/DELETE /api/emissions/{id}
- GET /api/emissions/{id}/history

### Reports
- GET /api/reports/facility/{id} - Generate facility report

## Pending Tasks (Priority Order)

### P0 - Critical (COMPLETED - Feb 14, 2026)
- [x] ~~Fix "Failed to load" notification on empty data~~ ✅ Fixed Feb 13, 2026
- [x] ~~Prevent duplicate facility/emission factor names~~ ✅ Fixed Feb 13, 2026
- [x] ~~Fix page lengths - standardize all pages~~ ✅ Fixed Feb 13, 2026
- [x] ~~Fix logout button position (sticky at bottom)~~ ✅ Fixed Feb 13, 2026
- [x] ~~Remove "Recent Emission Records" from dashboards~~ ✅ Fixed Feb 13, 2026
- [x] ~~Fix Super Admin redirect to wrong dashboard~~ ✅ Fixed Feb 14, 2026
- [x] ~~Fix backend crashes for admin without organization~~ ✅ Fixed Feb 14, 2026
- [x] ~~Fix evidence file download URL path~~ ✅ Fixed Feb 14, 2026

### P0 - Super Admin Fixes (COMPLETED)
- [x] ~~Fix logo preview (showing "url invalid")~~ ✅ Fixed Feb 13, 2026
- [x] ~~Add dropdowns for Category, Subcategory, Units~~ ✅ Fixed Feb 13, 2026
- [x] ~~Add search by organization name feature~~ ✅ Fixed Feb 13, 2026
- [x] ~~Fix: Admins not showing after creation~~ ✅ Fixed Feb 13, 2026 (new /super-admin/admins endpoint)
- [x] ~~Show Standard Emission Factors list with filters~~ ✅ Fixed Feb 13, 2026
- [x] ~~Show Custom Emission Factors with filters + Region/Country field~~ ✅ Fixed Feb 13, 2026

### P1 - Admin Fixes (Mostly Complete)
- [x] ~~Fix logo preview in Organization details~~ ✅ Fixed Feb 14, 2026
- [x] ~~Remove Base Year and Reporting Frequency fields~~ ✅ Fixed Feb 14, 2026
- [x] ~~Add "Yearly" to Monitoring Frequency dropdown~~ ✅ Fixed Feb 14, 2026
- [x] ~~Fix: Custom emission factors from Super Admin not showing~~ ✅ Fixed Feb 14, 2026
- [ ] Calendar/multi-year selection for period filters
- [x] ~~Reporting period: Start month + End month everywhere~~ ✅ Fixed Feb 14, 2026
- [x] ~~Remove version history for users (keep createdBy, updatedBy, createdAt, updatedAt)~~ ✅ Fixed Feb 14, 2026
- [x] ~~Report generation: Combine multiple facilities + include org details~~ ✅ Fixed Feb 14, 2026
- [x] ~~Fix: Dashboard filters not applying to charts~~ ✅ Fixed Feb 14, 2026
- [x] ~~Update emission data option (Edit button)~~ ✅ Fixed Feb 14, 2026

### Super Admin Fixes (Complete)
- [x] ~~Fix logo preview "url invalid" in add/edit org~~ ✅ Fixed Feb 14, 2026
- [x] ~~Add address fields (City, State, Country, Pincode)~~ ✅ Fixed Feb 14, 2026
- [x] ~~Add search by source in emission factors~~ ✅ Fixed Feb 14, 2026
- [x] ~~Fix custom category/subcategory input~~ ✅ Fixed Feb 14, 2026

### User Fixes (Complete)
- [x] ~~Remove version history for regular users~~ ✅ Fixed Feb 14, 2026
- [x] ~~Show createdBy/updatedBy emails on emissions~~ ✅ Fixed Feb 14, 2026

### Report Generation (Complete)
- [x] ~~Combined report for multiple facilities~~ ✅ Fixed Feb 14, 2026
- [x] ~~Include organization details in reports~~ ✅ Fixed Feb 14, 2026
- [x] ~~Year-wise breakdown structure~~ ✅ Fixed Feb 14, 2026

### Changes Made (Feb 14, 2026 - Session 2)
- Login: Fixed Super Admin redirect to /super-admin instead of /dashboard
- Login: Fixed App.js route redirects based on user role
- Backend: Fixed KeyError crashes when admin has no organization_id
  - get_facilities endpoint now returns empty array gracefully
  - get_emissions endpoint now returns empty array gracefully
  - get_dashboard_stats endpoint now returns empty stats object gracefully
  - list_files endpoint now returns empty array gracefully
  - get_all_users endpoint now returns empty array gracefully
  - create_user endpoint now validates organization_id before creating
- Frontend: Fixed evidence download URL construction (was double-prefixing /api)
- Testing: All P0 fixes verified by testing_agent (12/12 backend tests passed)

### Changes Made (Feb 14, 2026 - Session 1)
- Dashboard: Fixed pie chart label overlapping with legend at bottom
- Dashboard: Filters now apply to all charts and stats cards
- Emissions: Added Edit button to update emission records
- Emissions: Reporting period now has Start and End month fields
- Emissions: Shows createdBy/updatedBy emails and timestamps
- Emissions: Version history hidden for regular users
- Facilities: Added address fields (City, State, Country, Pincode)
- Facilities: Added Yearly option to monitoring frequency
- Facilities: Added attachments section for files/links/notes
- Backend: Updated models for address fields and attachments (Next)
- [ ] Complete Forgot Password flow (blocked on SMTP)
- [ ] Profile management page connection
- [ ] Custom emission factors not appearing in list after creation
- [ ] Add filters for emission factors (search/sort)
- [ ] Version history with username (currently shows user ID)

### P2 - Nice to Have
- [ ] User-level facility read-only view
- [ ] Report generation filter refinements
- [ ] Backend refactoring (server.py is 1000+ lines)

## Known Issues
- Sidebar logout visibility was a recurring issue, appears fixed
- Admin users created with temp password need to change on first login
- Some legacy data in DB may have missing fields (handled with Optional defaults)

## Test Credentials
- **Super Admin:** superadmin@ecotrack.com / SuperAdmin123!
- **Admin Test 1:** admin@greenenergy.com / H^CT_&o6"g]M (requires password change)
- **Admin Test 2:** admin@ghg.com / admin123

## Files of Reference
- /app/backend/server.py - Main backend API
- /app/frontend/src/pages/Emissions.js - Emissions page with file upload
- /app/frontend/src/components/ui/file-upload.jsx - FileUpload component
- /app/backend/tests/test_file_upload.py - File upload tests
