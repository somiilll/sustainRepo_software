# SustainRepo - GHG Calculation Platform PRD

## Original Problem Statement
Multi-tenant Greenhouse Gas (GHG) calculation platform with dynamic, configuration-driven emissions calculation engine managed by SuperAdmin.

## Core Architecture
- **Frontend:** React + Tailwind CSS + Shadcn UI
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **File Storage:** Cloudflare R2 (S3-compatible)
- **3rd Party:** Anthropic (AI summaries), Resend (emails), ReportLab (PDF), Matplotlib (charts)

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

## Completed Fixes (2026-03-17)
- **P0 FIX:** "Failed to save emissions" ReferenceError in EmissionEntryForm.js - `co2Formula`, `ch4Formula`, `n2oFormula` were scoped inside `else` block but referenced outside. Fixed by hoisting to `let` declarations before if/else.
- **P0 FIX:** GWP property name mismatch in Emissions.js `computeFreshEmissions` - used `gwp_co2` instead of correct `co2_gwp`, `gwp_ch4_fossil` instead of `ch4_fossil_gwp`, `gwp_n2o` instead of `n2o_gwp`.
- **P1 FIX:** Mobile Combustion CH4/N2O now correctly stored as 0 when no formula defined. Cards always show all 4 gas columns (CO₂, CH₄, N₂O, CO₂e) with 0 values when no formula exists.
- **UI FIX:** Emission cards always display consistent 4-column gas breakdown layout.

## Completed Fixes (2026-03-19)
- **UI FIX:** Renamed "No N2O formula defined", "No formula defined", "No CO₂e formula defined" to "Not Applicable" in Edit Emission dialog
- **UI FIX:** Updated default output units from 'kg CO₂' to 'tCO₂' and 'kg CO₂e' to 'tCO₂e' for cleaner display in Scope 1 calculations
- **UI FIX:** Added more bottom margin (mb-8) below "Fuel Type *" in Create GHG emissions form to fix overlapping issue

## Completed Fixes (2026-03-20)
- **UI FIX (Issue 1):** Aligned Quantity and Person Responsible fields on same row with `items-end` in Edit GHG dialog (both Process Emissions and regular sections)
- **UI FIX (Issue 2):** Fixed Scope 2 unit display - normalized "tco2/mW" to "tCO₂" for CO₂ and "tCO₂e" for CO₂e in Calculated Emissions section
- **UI FIX (Issue 3):** Added bottom padding and border separator below Fuel Type dropdown in Create Emission form (Step 1)
- **UI FIX (Issue 4):** Changed override options spacing from `space-y-4` to `space-y-3` for consistent vertical gaps between Calorific Value, Density Value, and Custom CO2 Emission Factor
- **UI FIX (Issue 5):** Changed all number inputs from restrictive `step` values to `step="any"` to fix browser validation messages
- **UI FIX:** Dashboard Emissions Trend chart Y-axis now starts from 0 (using `domain={[0, 'auto']}`)
- **UI FIX:** Scope 2 Custom Emission Factor justification text updated to "Justification/Comments"
- **UI FIX:** Added "(Values rounded to 2 decimal places)" note in Calculated Emissions section header
- **VALIDATION FIX:** Generate Report - Production Quantity and Unit must both be filled or both empty
- **REPORT FIX:** Internal Performance Tracking and GHG Reduction Initiatives sections now show "NA" if admin hasn't provided data
- **UX FIX:** Added calculation loading state - Save button is disabled and shows "Calculating..." spinner while emissions recalculate after changing override values (Calorific Value, Density, Custom CO₂ EF). Prevents race condition errors.

## Completed Fixes (2026-03-21)
- **INFRASTRUCTURE:** Migrated file storage from local `/app/uploads` to Cloudflare R2
  - Created `/app/backend/r2_storage.py` - R2 utility class with upload, download, delete, presigned URL generation
  - Updated all upload endpoints to accept `bucket_type` parameter
  - Files are now served via presigned URLs (1 hour expiry)
  - Legacy local files still supported for backward compatibility
  - Frontend updated to pass correct bucket_type for each upload context

## Completed Fixes (2026-03-22)
- **BUG FIX (Issue 1):** SuperAdmin invoice upload failing - Fixed role check from `'superadmin'` to `'super_admin'` in backend server.py line 5117
- **BUG FIX (Issue 2):** File deletion from R2 - Already implemented, verified working (backend logs R2 deletions)
- **BUG FIX (Issue 3):** Facility module download failing with "Failed to fetch" - Fixed `downloadFile` function in Facilities.js to use `window.open()` instead of `fetch()` for R2 redirect handling
- **BUG FIX (Issue 4):** Edit dialog only saving last file - Removed `setUploadedEvidence()` call in `handleFileUpload` so upload zone stays active for multiple files
- **UI FIX (Issue 5):** File size text showing "10 MB" instead of "5 MB" - Updated Facilities.js line 734 and Sinks.js line 491
- **UX FIX (Issue 6):** No longer need to click cross icon to upload additional files - Upload zone stays active after each upload
- **BUG FIX (Issue 7):** Original filenames preserved and displayed correctly - Using `file.name` and server response `filename` field
- **VALIDATION (Issue 8):** Clear error message for oversized files already exists in file-upload.jsx line 39: "File size exceeds 5MB limit."
- **FEATURE (Issue 9):** Excel files (.xls/.xlsx) already allowed - Backend supports MIME types and frontend accept attribute includes them
- **BUG FIX (Issue 10):** SuperAdmin Invoice History download "Not Authenticated" - Fixed URL construction to include `/download` suffix
- **BUG FIX (Issue 11):** Invoice History delete doesn't delete from R2 - Added `handleDeleteFile()` to call DELETE API before state removal
- **BUG FIX (Issue 12):** Logo replacement doesn't delete old logo - Updated `handleLogoUpload()` to delete old logo first
- **BUG FIX (Issue 13):** Attachment deletion doesn't delete from R2 - Updated `removeAttachment()` to call `deleteFileFromR2()` first
- **FEATURE (Issue 14):** Added GET `/api/files/{file_id}/info` endpoint - Returns file metadata including original filename
- **BUG FIX (Issue 15):** Evidence showing "Evidence 1/2/3" instead of original names - Updated `handleEdit()` to fetch actual filenames from `/info` endpoint
- **UX FIX (Issue 16):** Better error message for oversized invoice uploads - Shows "Failed to upload – file size exceeds the maximum limit of 5 MB"

## Completed Fixes (2026-03-26 - Report Generation)
- **P0 BUG FIX:** GHG Report Generation crashing with `KeyError: 'scope1_by_category'`
  - Root cause: When equity share was applied (equity_factor < 1.0), the `totals` dictionary was rebuilt without `scope1_by_category` and `scope1_by_fuel` keys
  - Fixed `/app/backend/report_generator.py` lines 1737-1757 to include the missing keys with proper equity factor multiplication
  - Added defensive `.get()` access in `_add_facility_analysis()` method for extra safety

## Completed Features (2026-03-28 - Report Generation Bug Fixes)

### Issue Fixes
1. **Chapter 4 intro paragraph placement:** Moved "This chapter includes quantified data results…" to appear BEFORE Section 4.1 heading (was incorrectly under it)
2. **Logo download from R2:** Enhanced `_download_image()` to properly handle R2 file URLs by following the redirect from `/api/files/{id}/view` endpoint
3. **Base Year section for facilities without current emissions:** Now shows Base Year Emissions section even when facility has no current reporting period data (if base year data exists)
4. **Organization total in Base Year comparison:** Fixed org_totals calculation - now correctly sums scope1+scope2 when 'total' key is not present

## Completed Features (2026-03-28 - Report Generation Major Updates)

### General Fixes
- **Cover Page:** Company logo now displays below company name (was above)
- **Reporting Period Format:** Changed from "March 2023 – April 2024" to "1st March 2023 – 30th April 2024" with ordinal suffixes
- **Footer:** Added "Report generated by SustainRepo" to all pages

### Chapter 1 Updates (Section 1.1)
- Added new sections after Process Description:
  - **Section 6:** Importance of GHG Reporting
  - **Section 7:** Introduction to ISO 14064
  - **Section 8:** Importance of GHG Management Systems
- Renumbered subsequent sections (Person Responsible → 9, Purpose of Reporting → 10, etc.)
- Added **GHG Accounting Principles** after "Other Information" (Relevance, Completeness, Consistency, Transparency, Accuracy)

### Chapter 3 Update
- Changed heading from "Direct GHG Emissions (Scope 1)" to "Direct GHG Emissions/Removals (Scope 1)"

### Chapter 4 Updates
- Added introductory paragraph before Section 4.1 describing chapter contents
- Removed sentence about "internationally recognized standards" from methodology section
- **Base Year Emissions for Facilities:** New section after "Emissions of Previous Years" showing:
  - Base year emissions table
  - Comparison table (Base Year vs Current Period with % change)
  - Analysis of increase/decrease with explanations
- **Base Year Emissions for Organization:** New section after organization emissions with same structure
- Base year sections only appear when data is available (skipped if no base year set)

## Completed Features (2026-03-27 - UI/Validation Improvements)
- **Production Quantity Validation:** Cannot be negative; shows specific error if negative value entered
- **Production Unit/Quantity Pairing:** Both fields must be filled or both empty; improved error messages specify which field is missing and for which facility
- **Reporting Period Validation:** Separate error messages for missing Start Period vs End Period
- **Label Rename:** "General Description" → "Organization Description" in Organization module (view and report)
- **Calendar Year Order:** Most recent year now appears at top in MonthYearPicker component (used in Reports, Dashboard, Emissions)

## Completed Features (2026-03-27 - Financial Year Mapping Fix)
- **Bug Fix:** January-March emissions now correctly map to the previous financial year
  - Example: `2026-01` (January 2026) → **FY 2025-2026** (not FY 2026-2027)
  - Financial year runs April to March (e.g., FY 2025-2026 = April 2025 to March 2026)
- **Backend Changes:**
  - Fixed `get_oldest_reporting_year` endpoint to calculate fiscal year correctly for Jan-Mar periods
  - Fixed `change_base_year` endpoint to properly filter emissions by fiscal year range
  - Added `get_fiscal_year_from_period()` helper function that accounts for FY boundaries

## Completed Features (2026-03-27 - Base Year Emissions Edit Logic Fix)
- **Always Editable When Base Year < Oldest Reporting Year:** Users can now always edit base year emissions directly (not just via "Change Base Year") when the selected base year is earlier than the oldest reporting period
- **Pre-fetched Oldest Year Data:** Page now pre-fetches oldest year info for all entities with base year records on load, enabling synchronous editability determination without additional API calls
- **Improved `canEditRecordSync` Function:** Uses cached `entityOldestYears` map to determine if records are editable based on: `base_year < oldest_reporting_year`

## Completed Features (2026-03-26 - Base Year Emissions Enhancements)
- **Read-Only View for Oldest Year Emissions:** When base year is set to oldest reporting year (or later), emissions values are read-only and cannot be edited
- **Separate View and Edit Actions:**
  - Clicking on a card with existing base year now opens a read-only View Dialog
  - Edit Emissions button (with Edit2 icon) is shown for records where base_year < oldest_reporting_year
  - Users must explicitly click Edit button to modify values
- **Deletion History Tracking:**
  - All deletions are recorded in `base_year_emissions_deletions` collection
  - New endpoint: `GET /api/base-year-emissions/deletion-history/{entity_type}/{entity_id}`
  - Version History dialog now shows both deletion records and version changes
- **Removed Delete Option:** Delete buttons removed from Base Year Emissions cards (deletion prevented)
- **Notes/Justification Field:** Added text field for non-oldest year base year records
  - Required during setup when selecting a different year than oldest
  - Editable in Edit dialog for non-oldest year records
  - Displayed in View dialog when notes exist
- **Auto-populate Emission Combinations:** When selecting non-oldest year, system now fetches ALL available Scope+Category+Subcategory combinations with editable tCO₂e fields
- **UI Improvements:**
  - "Oldest year" label shown on cards with oldest year set
  - CalendarClock icon for "Change Year" button (was Edit2 before)
  - View Dialog shows total emissions summary and notes (if present)

## Pending Issues
- **P0:** Live calculation preview in Edit Dialog uses fuel's default value instead of Custom CO₂ Emission Factor (Heat Basis) override - RECURRING ISSUE (3 times)
- **P2:** GHG Inventory report may show extraneous text when no charts generated
- **P3:** CH₄ GWP doesn't differentiate fossil vs non-fossil fuel types
- **P3:** Frontend dropdowns have hardcoded values (scopes, categories, units)

## Completed Features (2026-03-26 - Earlier)
- **Reporting Year Type Field:** Added mandatory "Reporting Year Type" dropdown to Organization Details (Financial Year / Calendar Year)
- **Base Year Emissions Module:** New module for tracking base year GHG emissions
  - Sidebar item below GHG Sinks (for Admin and User roles)
  - Organization and Facility cards showing base year setup status
  - Base year selection flow with oldest year detection
  - Emissions data entry for Scope + Category + Subcategory + tCO2e
  - Version history tracking for all changes
  - Data dependency validation (requires emissions data before setup)
  - Report validation endpoint for blocking reports without base year data

## Base Year Emissions Database Schema
```javascript
{
  id: "uuid",
  organization_id: "uuid",
  facility_id: "uuid" | null,  // null for org-level
  base_year: "FY 2023-2024" or "2024",
  base_year_type: "financial_year" | "calendar_year",
  is_oldest_year: boolean,
  emissions_data: [
    { scope, category, subcategory, tco2e }
  ],
  version: number,
  version_history: [...],
  created_by, created_at, updated_by, updated_at
}
```

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
