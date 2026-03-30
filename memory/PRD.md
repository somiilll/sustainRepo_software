# SustainRepo - GHG Calculation Platform PRD

## Original Problem Statement
Multi-tenant Greenhouse Gas (GHG) calculation platform with dynamic, configuration-driven emissions calculation engine managed by SuperAdmin.

## Core Architecture
- **Frontend:** React + Tailwind CSS + Shadcn UI
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **File Storage:** Cloudflare R2 (S3-compatible)
- **3rd Party:** Anthropic (AI summaries), Resend (emails), ReportLab (reports), Matplotlib (charts), Playwright + mammoth (PDF generation)

## What's Been Implemented (Latest Session - 2026-03-29)

### Feature Additions
1. **Responsible Person - Designation & Contact Fields**
   - Added to Emissions module (EmissionEntryForm.js + Emissions.js)
   - Added to Facilities module
   - Added to Organization Details
   - Updated all backend schemas

2. **Heat Basis Field Hidden**
   - "Custom CO₂ Emission Factor (Heat Basis)" now hidden in Emissions UI
   - Functionality preserved for existing data

3. **Base Year Sinks Display & Input**
   - Sinks now shown in Base Year Emissions view dialog
   - When base year < oldest reporting year and sinks exist, prompts for sink inputs
   - Added `sinks_data` field to BaseYearEmissions models

4. **Sink Delete R2 Cleanup**
   - Enhanced `delete_sink` endpoint to delete associated R2 files
   - Returns "Sink record and associated files deleted successfully"

5. **PDF Generation with Playwright (Async)**
   - Replaced LibreOffice with Playwright + mammoth
   - DOCX → HTML → PDF conversion using async API
   - Fixed "Sync API inside asyncio loop" error

### Bug Fixes
- Scope 1→Scope 2 filter reset
- Scope 2 Renewable Electricity custom EF reset (using `??` for 0 handling)
- Password Eye icons with upfront requirements
- Email password display
- User hard delete
- Monitoring/Reporting frequency validation
- "Last Updated" sorting option
- Fuel type search filter

### UI Updates
- Login page: "Haven't registered yet? Contact us to sign up here." with link
- Password requirements shown upfront with progressive validation

## Completed Fixes (Previous Sessions)
- Base Year Edit Logic
- Financial Year Mapping
- Report Structure Overhaul (ISO 14064-1 compliance)
- Branding updates (Logo, Favicon, Login background)
- PDF generation system package install

## Database Collections
| Collection | Purpose |
|------------|---------|
| users | User accounts with roles and auth |
| organizations | Companies with subscription details |
| facilities | Physical sites with responsible person details |
| emission_records | Individual emissions with responsible person |
| base_year_emissions | Baseline with sinks_data support |
| sinks | Carbon sinks with evidence files |
| uploaded_files | R2 file metadata |

## Pending Issues
- **P2:** GHG Inventory report may show extraneous text when no charts
- **P3:** CH₄ GWP doesn't differentiate fossil vs non-fossil
- **P3:** Frontend dropdowns hardcoded

## Upcoming Tasks
- **P1:** Public-facing landing page
- **P1:** Scope 3 emissions module
- **P2:** Formula breakdown in emissions UI
- **P2:** CBAM module and report template

## Future/Backlog
- AWS Lambda migration for report generation
- Refactor backend/server.py into package structure
- Consolidate emission form logic
- Dynamic frontend dropdowns

## Key API Endpoints
- `POST/PUT /api/base-year-emissions` - Now supports sinks_data
- `DELETE /api/sinks/{sink_id}` - Deletes R2 files
- `POST /api/reports/ghg-inventory` - PDF via Playwright

## Credentials
- SuperAdmin: superadmin@ecotrack.com / SuperAdmin123!
- Admin: testadmin@test.com / Test123!
