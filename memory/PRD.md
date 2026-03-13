# SustainRepo - GHG Calculation Platform PRD

## Original Problem Statement
Building a multi-tenant Greenhouse Gas (GHG) calculation platform named "SustainRepo". Core requirements:
- Fully dynamic, configuration-driven emissions calculation engine managed by SuperAdmin
- "Equity Share Approach" where emissions are adjusted based on facility-level ownership percentages
- Role-based access control system for modules and report templates (Scope 1 & 2, Scope 3, CBAM)
- Organization-level access permissions

## User Personas
1. **SuperAdmin**: Manages system configuration, formula definitions, GWP values, fuel database, access controls
2. **Admin**: Organization administrators who manage facilities, emissions data, and reports
3. **User**: Standard users with view/entry permissions

## Core Requirements
- Dynamic formula engine for emission calculations
- Multi-tenant architecture with organization isolation
- Equity share-based emission adjustments
- Comprehensive report generation (Scope 1 & 2, with Scope 3 and CBAM planned)
- Version history for audit trails
- Evidence/document upload support

---

## What's Been Implemented

### December 2025

#### Completed Features
- **Equity Share Calculation & Reporting**: Backend dashboard API and report generator now adjust emissions based on facility equity percentage
- **Organization Access Control (Phase 1)**:
  - Added `enabled_access` to Organization model
  - SuperAdmin UI for setting access levels
  - Dynamic UI on Reports, Emissions, and Sinks pages based on permissions
  - Backend validation blocks unauthorized data entry
- **Report Generator Enhancements**: Uncertainty Assessment section, historical data fixes, improved carbon sinks reporting
- **UI/UX Improvements**:
  - Renamed "Emissions Module" to "GHG Emissions" and "Sinks Module" to "GHG Sinks"
  - Fixed filter layout on Emissions page
  - Added date validation (end date > start date) to Emissions and Reports modules
  - Added filters to SuperAdmin Fuel DB
- **Scope 3 Tab Placeholder**: Added "Coming Soon" badge on GHG Emissions page

#### Bug Fixes
- Fixed Uncertainty Assessment not saving (Pydantic model validation)
- Fixed Control Approach Selection display bug
- Fixed access control enforcement for unauthorized module access

---

## Prioritized Backlog

### P0 (Immediate) - DONE
- ✅ Scope 3 "Coming Soon" badge UI adjustments

### P1 (High Priority)
- [ ] Full Scope 3 module implementation with separate report generator files
- [ ] "Forgot Password" feature
- [ ] GWP calculation fix for CH₄ (fossil vs. non-fossil fuel type differentiation)

### P2 (Medium Priority)
- [ ] Full CBAM (Carbon Border Adjustment Mechanism) module and report template
- [ ] Refactor `backend/server.py` into structured packages (routes, models, services)
- [ ] Make frontend hardcoded values dynamic (scopes, categories, units)
- [ ] Full SMTP integration for user notifications
- [ ] Refactor duplicated formula engine logic into reusable hook

---

## Technical Architecture

### Backend (`/app/backend/`)
- `server.py`: Main FastAPI application (needs refactoring)
- `report_generator.py`: DOCX report generation with conditional sections

### Frontend (`/app/frontend/src/`)
- `/pages/`: Admin pages (Emissions.js, Sinks.js, Reports.js, etc.)
- `/pages/superadmin/`: SuperAdmin pages (Organizations.js, FuelDB.js)
- `/components/`: Reusable components

### Database
- MongoDB with collections: organizations, facilities, emissions, sinks, fuels, users

### Key API Endpoints
- `/api/organizations`: Organization CRUD with access control
- `/api/emissions` & `/api/sinks`: Emissions data with validation
- `/api/dashboard-data`: Dashboard metrics with equity share calculations

### Third-Party Integrations
- `python-docx`: Report generation
- `matplotlib`: Charts in reports
- `libreoffice`: DOCX to PDF conversion
- `pandas`, `openpyxl`: Excel data imports

---

## Test Credentials
- **SuperAdmin**: superadmin@ecotrack.com / SuperAdmin123!
- **Admin**: testadmin@test.com / Test123!

---

## Known Issues (Carried Over)
1. GWP calculation for CH₄ only uses scope, not fuel type (fossil vs. non-fossil)
2. Several frontend components have hardcoded values needing backend integration
