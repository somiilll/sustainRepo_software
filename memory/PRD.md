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

### P0 - Critical (COMPLETED)
- [x] ~~Fix "Failed to load" notification on empty data~~ ✅ Fixed Feb 13, 2026
- [x] ~~Prevent duplicate facility/emission factor names~~ ✅ Fixed Feb 13, 2026
- [x] ~~Fix page lengths - standardize all pages~~ ✅ Fixed Feb 13, 2026
- [x] ~~Fix logout button position (sticky at bottom)~~ ✅ Fixed Feb 13, 2026
- [x] ~~Remove "Recent Emission Records" from dashboards~~ ✅ Fixed Feb 13, 2026

### P0 - Super Admin Fixes (COMPLETED)
- [x] ~~Fix logo preview (showing "url invalid")~~ ✅ Fixed Feb 13, 2026
- [x] ~~Add dropdowns for Category, Subcategory, Units~~ ✅ Fixed Feb 13, 2026
- [x] ~~Add search by organization name feature~~ ✅ Fixed Feb 13, 2026
- [x] ~~Fix: Admins not showing after creation~~ ✅ Fixed Feb 13, 2026 (new /super-admin/admins endpoint)
- [x] ~~Show Standard Emission Factors list with filters~~ ✅ Fixed Feb 13, 2026
- [x] ~~Show Custom Emission Factors with filters + Region/Country field~~ ✅ Fixed Feb 13, 2026

### P1 - Admin Fixes (Next)
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
