# SustainRepo - GHG Calculation Platform PRD

## Original Problem Statement
Multi-tenant Greenhouse Gas (GHG) calculation platform with dynamic, configuration-driven emissions calculation engine managed by SuperAdmin.

## Core Architecture
- **Frontend:** React + Tailwind CSS + Shadcn UI
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **File Storage:** Cloudflare R2 (S3-compatible)
- **3rd Party:** Anthropic (AI summaries), Resend (emails), ReportLab (PDF), Matplotlib (charts), Playwright (PDF generation)

## R2 Storage Buckets
| Bucket | Purpose | Used By |
|--------|---------|---------|
| `ghg-emissions-evidence` | GHG Emission evidence files | EmissionEntryForm.js, Emissions.js |
| `sinks-evidence` | Carbon sinks evidence files | Sinks.js |
| `organization-facility-data` | Org/Facility attachments, logos | OrganizationDetails.js, Facilities.js, OrganizationManagement.js (logo) |
| `superadmin-data` | SuperAdmin uploads (invoices) | OrganizationManagement.js (invoice history) |

**File Upload Limits:** Max 5MB per file, multiple files supported

## What's Been Implemented
- Dashboard with emission data visualization
- Emissions, GHG Sinks, Facilities, Organization modules
- PDF report generation (AI Executive Summary + GHG Inventory Report)
- SuperAdmin panel for managing organizations, formulas, GWP config
- Role-based access control
- User invitation and password reset via Resend
- Multi-step emission entry form (EmissionEntryForm.js) and inline edit form (Emissions.js)
- Equity Share Approach
- Process Template module
- MonthYearPicker component
- Dismissible subscription warning banner

## Completed Fixes (2026-03-29)

### Feature Additions
1. **Responsible Person - Designation & Contact Fields**
   - Added `responsible_person_designation` and `responsible_person_contact` fields to emissions
   - Updated both EmissionEntryForm.js (add form) and Emissions.js (edit form)
   - Updated backend schemas: EmissionRecordCreate and EmissionRecordResponse

2. **Heat Basis Field Hidden**
   - Hid "Custom CO₂ Emission Factor (Heat Basis)" checkbox and input in Emissions.js
   - Functionality preserved for existing data, UI simply hidden per user request

3. **Base Year Sinks Display**
   - Added sinks display in Base Year Emissions module view dialog
   - New `getSinksForBaseYear()` function to match sinks with base year
   - Shows sink description, month, and total reductions with green styling

4. **Sink Delete R2 Cleanup**
   - Enhanced `delete_sink` endpoint to delete associated R2 files
   - Deletes all evidence files from R2 storage before removing sink record
   - Returns "Sink record and associated files deleted successfully"

5. **PDF Generation with Playwright**
   - Replaced LibreOffice-based PDF conversion with Playwright + mammoth
   - DOCX → HTML (via mammoth) → PDF (via Playwright)
   - Better styling and more reliable cross-platform generation

### Bug Fixes
1. **Scope 1→Scope 2 Filter Glitch**
   - Fixed: Category filter now resets when switching between scopes
   - Prevents showing no emissions when categories don't match

2. **Scope 2 Custom Emission Factor Reset**
   - Fixed: When unchecking custom EF, now properly resets `emission_factor_basis_quantity`
   - Fixed: Using `??` instead of `||` to handle 0 as valid emission factor (Renewable Electricity)

3. **Password Visibility Eye Icons**
   - Added Eye/EyeOff toggle icons to all password fields in Profile.js
   - Added password requirements shown upfront with real-time validation checkmarks

4. **Dashboard Chart Negative Values**
   - Fixed: Y-axis domain now starts from 0 (no negative values)

5. **Email Password Display**
   - Fixed: Password now visible with white background, black text, green border
   - Removed misleading "click to select & copy" text

6. **User Hard Delete**
   - Changed from soft delete to hard delete for users/admins
   - Deleted users' emails can be immediately reused

7. **Monitoring/Reporting Frequency Validation**
   - Added validation: monitoring frequency must be ≤ reporting frequency

8. **Emissions Sorting - Last Updated**
   - Added "Last Updated" option to emissions sorting dropdown

9. **Fuel Type Search**
   - Added search filter input above fuel type dropdown in EmissionEntryForm.js

### UI Updates
1. **Login Page** - "Haven't registered yet? Contact us to sign up here." with link to sustainrepo.com/about#contact
2. **Password Requirements** - Shown upfront with progressive validation checkmarks

## Completed Fixes (2026-03-17 through 2026-03-28)
[Previous fixes preserved - see version history]

## Pending Issues
- **P2:** GHG Inventory report may show extraneous text when no charts generated
- **P3:** CH₄ GWP doesn't differentiate fossil vs non-fossil fuel types
- **P3:** Frontend dropdowns have hardcoded values (scopes, categories, units)

## Upcoming Tasks
- **P1:** Public-facing landing page
- **P1:** Scope 3 emissions module
- **P2:** Formula breakdown in emissions UI
- **P2:** CBAM module and report template

## Future/Backlog
- AWS Lambda migration with async job queue for report generation
- Refactor backend/server.py into proper package structure
- Consolidate duplicated emission form logic (EmissionEntryForm.js + Emissions.js)
- Hardcoded frontend dropdowns → dynamic from backend

## Credentials
- SuperAdmin: superadmin@ecotrack.com / SuperAdmin123!
- Admin: testadmin@test.com / Test123!
