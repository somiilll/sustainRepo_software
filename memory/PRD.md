# ESG Platform - Product Requirements Document

## Original Problem Statement
Build an enterprise ESG (Environmental, Social, Governance) data management platform with comprehensive reporting, analytics, workflow management, and compliance features.

## What's Been Implemented

### Core Platform
- Multi-org architecture with role-based access (Admin, User)
- JWT authentication with secure login/registration
- Organization management with module access controls
- Facility management (CRUD)
- User management with role assignment

### Data Modules
- GHG Module (Logs, Sinks, Base Year)
- Environment (Energy, Water, Waste, Biodiversity, Climate Change, Material)
- Social metrics data entry
- Governance metrics data entry
- ESG Records module with add/edit forms

### Dashboard & Analytics
- **Executive GHG Dashboard** with KPI summary cards, GHG Emissions Trend
- **Executive ESG Dashboard** with section selector (All/Environment/Social/Governance)
- **Environment Dashboard** (NEW - July 2026): Premium 6-row environment performance dashboard
  - Row 1: 7 KPI Cards (Total Emissions, Net Emissions, Energy Consumed, Water Withdrawal, Water Recycled %, Waste Generated, Waste Recovered %)
  - Row 2: Scope Contribution (stacked horizontal bars S1/S2/S3) + Emission Hotspots (Treemap)
  - Row 3: Scope Explorer with tabs (Scope 1/2/3 horizontal bar breakdowns)
  - Row 4: Energy (Stacked column + Renewable% area + Intensity line)
  - Row 5: Water (Balance flow + Sources bar + Recycling% line)
  - Row 6: Waste (Overview + Hazardous + Non-Hazardous stacked bars)
  - Backend: `/api/dashboard/environment-detail` endpoint for scope breakdowns, hotspots, water sources, waste types
- Semantic data spreading (snapshot vs flow metrics)
- Unit conversion utilities, Date utilities for FY alignment
- Default view: Current Financial Year

### Sidebar & Navigation
- 3-level hierarchical config-driven sidebar (sidebarConfig.js)
- Environment sub-modules with GHG nesting
- Reporting (BRSR, GRI)
- Workflow (Tracker, My Task, Approver Queue)
- Uploads (Bulk Uploads)
- Targets (Voluntary: GHG/Env/Social/Gov, SBTi)

### Materiality Assessment (July 2026)
- Premium 5x5 scatter matrix using Recharts
- 23 GRI topics with hardcoded data across 4 categories
- Interactive colored dots, hover tooltips, side drawer
- Framer Motion animations

### Reporting
- BRSR report generation
- GRI report generation
- Report tracking in Workflow modules

### Other Features
- Repo-Pilot (RAG document processing)
- Audit Trails, Profile management, Bulk uploads

## Architecture
- Frontend: React + Tailwind CSS + Shadcn UI + Recharts + Framer Motion
- Backend: FastAPI + MongoDB (Motor)
- Storage: Cloudflare R2
- Email: Resend
- AI: OpenAI (embeddings/RAG), LlamaParse

## Prioritized Backlog

### P0 (Critical)
- Fix missing filters on seeded Water Withdrawal KPIs (esg_kpi_definitions DB update)

### P1 (High)
- Dashboard Scope 1 & 3 Emissions deduplication bug
- Carbon Intensity calculation discrepancy
- Cron job for marking tasks as "overdue"
- Phase 2 Executive Dashboard enhancements (PDF export, fullscreen charts, drill-down)
- Test Repo Pilot with actual PDF uploads (end-to-end RAG)

### P2 (Medium)
- Dynamic ESG Disclosure Engine
- Sentry Error Monitoring
- MFA for admin users
- SBTi target validation rules
- Dark mode support fine-tuning
