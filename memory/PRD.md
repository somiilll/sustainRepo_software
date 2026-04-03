# SustainRepo - GHG Calculation Platform PRD

## Original Problem Statement
Multi-tenant Greenhouse Gas (GHG) calculation platform with dynamic, configuration-driven emissions calculation engine managed by SuperAdmin.

## Core Architecture
- **Frontend:** React + Tailwind CSS + Shadcn UI
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **File Storage:** Cloudflare R2 (S3-compatible)
- **3rd Party:** Anthropic (AI summaries), Resend (emails), ReportLab (reports), Matplotlib (charts), Playwright + mammoth (PDF generation)

---

## Universal Context-Aware Calculation Engine (NEW - 2026-04-03)

### Overview
A fully dynamic, configuration-driven emissions calculation engine that:
- Does NOT hardcode any formulas or emission factors
- Supports multiple computation models (factor-based, fugitive, process, electricity, direct)
- Dynamically selects calculation methods based on context and rules
- Resolves parameters from multiple sources with priority hierarchy
- Provides full audit trail

### New MongoDB Collections
| Collection | Purpose |
|------------|---------|
| calc_methods | Calculation method definitions (formulas, parameters, outputs) |
| calc_rules | Rules mapping context (scope/category) to methods |
| calc_input_fields | Reusable input field definitions |
| calc_input_templates | Templates grouping fields for emission types |
| calc_parameter_values | Context-aware parameter values with priorities |
| calc_parameter_overrides | Organization/facility level overrides |
| calc_unit_conversions | Unit conversion definitions |

### Seeded Methods
1. **Factor-Based Combustion** - `qty × NCV × EF` (Scope 1)
2. **Fugitive Emissions (GWP-based)** - `charge × leakage_rate × GWP` (Scope 1)
3. **Electricity (Location-Based)** - `consumption × grid_ef` (Scope 2)
4. **Electricity (Market-Based)** - `consumption × supplier_ef` (Scope 2)
5. **Direct CO2e (Simple)** - `qty × ef_co2e` (Scope 1/2)

### Seeded Rules
1. Scope 1 Stationary Combustion → Factor-Based Combustion
2. Scope 1 Mobile Combustion → Factor-Based Combustion
3. Scope 1 Fugitive Emissions → Fugitive GWP
4. Scope 2 Purchased Electricity → Electricity Location

### Parameter Resolution Priority
1. User explicit override (with justification)
2. User direct input
3. Organization-level override
4. Facility-level override
5. Fuel database (context-matched)
6. Regional parameter values
7. Global default values

### Key API Endpoints
- `POST /api/calc-engine/calculate` - Execute calculation
- `POST /api/calc-engine/preview` - Preview method/parameter resolution
- `GET /api/calc-engine/methods` - Get available methods for context
- `GET /api/calc-engine/super-admin/methods` - Manage methods (SuperAdmin)
- `GET /api/calc-engine/super-admin/rules` - Manage rules (SuperAdmin)
- `GET /api/calc-engine/super-admin/unit-conversions` - Manage unit conversions (SuperAdmin)
- `POST /api/calc-engine/super-admin/seed-default-methods` - Seed defaults

### Frontend
- New page: `/super-admin/calculation-engine`
- Tabs: Methods, Rules, Input Fields, Templates, **Unit Conversions**
- Test Calculation dialog with live preview and execute

---

## What's Been Implemented (Latest Session - 2026-04-03)

### Universal Calculation Engine
- Complete backend calculation engine module (`/app/backend/calculation_engine/`)
- Parameter resolver with priority hierarchy
- Dynamic method selection based on rules
- Multi-output formula support (CO2, CH4, N2O, CO2e)
- GWP integration from gwp_config
- Full audit trail in calculation results
- SuperAdmin UI for managing methods, rules, input fields
- Test calculation dialog with preview and execute

### Unit Conversions Management Tab (2026-12-XX)
- New "Unit Conversions" tab in Calculation Engine UI
- Full CRUD operations for unit conversions (Create, Read, Delete)
- Support for 3 conversion types:
  - **Multiply**: value × factor (e.g., gal → L: ×3.78541)
  - **Divide**: value ÷ factor (e.g., kg → tonne: ÷1000)
  - **Formula**: Custom formula with parameter (e.g., L → kg: value × density)
- Optional "Requires Parameter" field for conversions needing fuel properties (e.g., density)
- Help section with common conversion examples
- Stats card showing total unit conversions count

### Previous Feature Additions (2026-03-29)
1. **Responsible Person - Designation & Contact Fields**
2. **Heat Basis Field Hidden**
3. **Base Year Sinks Display & Input**
4. **Sink Delete R2 Cleanup**
5. **PDF Generation with Playwright (Async)**

### Previous Bug Fixes
- Scope 1→Scope 2 filter reset
- Scope 2 Renewable Electricity custom EF reset
- Password Eye icons with upfront requirements
- Email password display
- User hard delete
- Monitoring/Reporting frequency validation
- "Last Updated" sorting option
- Fuel type search filter

---

## Database Collections
| Collection | Purpose |
|------------|---------|
| users | User accounts with roles and auth |
| organizations | Companies with subscription details |
| facilities | Physical sites with responsible person details |
| emission_records | Individual emissions with responsible person |
| base_year_emissions | Baseline with sinks_data support |
| sinks | Carbon sinks with evidence files |
| fuel_database | Fuel properties (CV, EF, density) by region/industry |
| gwp_config | GWP values (IPCC AR5/AR6) |
| calc_methods | Calculation method definitions |
| calc_rules | Method selection rules |
| calc_input_fields | Input field definitions |
| calc_parameter_values | Parameter values with context |
| calc_parameter_overrides | Org/facility parameter overrides |

---

## Pending Issues
- **P0:** Live calculation preview in Edit Dialog uses default values (NOT STARTED)
- **P2:** GHG Inventory report may show extraneous text when no charts
- **P3:** CH4 GWP doesn't differentiate fossil vs non-fossil
- **P3:** Frontend dropdowns hardcoded

## Upcoming Tasks
- **P1:** Integrate calculation engine with emission entry form
- **P1:** Public-facing landing page
- **P1:** Scope 3 emissions module

## Future/Backlog
- AWS Lambda migration for report generation
- Refactor backend/server.py into package structure
- Consolidate emission form logic
- Dynamic frontend dropdowns

---

## Credentials
- SuperAdmin: superadmin@ecotrack.com / SuperAdmin123!
- Admin: testadmin@test.com / Test123!
