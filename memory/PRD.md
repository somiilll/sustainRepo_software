# ESG Platform - Product Requirements Document

## Original Problem Statement
Build an enterprise ESG (Environmental, Social, Governance) data management platform with comprehensive reporting, analytics, workflow management, and compliance features.

## What's Been Implemented

### Core Platform
- Multi-org architecture with role-based access (Admin, User, Super Admin)
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
- **Environment Dashboard** (July 2026): Premium 6-row dashboard
  - Row 1: 7 KPI Cards
  - Row 2: Scope Contribution (stacked horizontal bars) + Emission Hotspots (Treemap)
  - Row 3: Scope Explorer with tabs (S1/S2/S3)
  - Row 4: Energy (Stacked column + Renewable% + Intensity)
  - Row 5: Water (Balance flow + Sources bar + Recycling%)
  - Row 6: Waste (Overview + Hazardous + Non-Hazardous)
  - Backend: `/api/dashboard/environment-detail` with scope breakdowns, hotspots, water sources (withdrawal/discharge/consumption), waste types
- Semantic data spreading, unit/date utilities

### Sidebar & Navigation
- **Admin/User**: 3-level hierarchical config-driven sidebar (sidebarConfig.js)
- **Super Admin**: Full sidebar restored (superAdminSidebarConfig.js) with Dashboard, Organizations, Admins, Sectors, ESG Config, KPI Definitions, GHG (Scopes & Categories, GHG Data [7 items], GHG Calculation [6 items], Process Templates)

### Materiality Assessment (July 2026)
- 5x5 scatter matrix using Recharts, 23 GRI topics, side drawer

### Reporting
- BRSR/GRI report generation, Workflow tracking

### Other Features
- Repo-Pilot (RAG), Audit Trails, Profile, Bulk uploads

## Architecture
- Frontend: React + Tailwind CSS + Shadcn UI + Recharts + Framer Motion
- Backend: FastAPI + MongoDB (Motor)
- Storage: Cloudflare R2 | Email: Resend | AI: OpenAI, LlamaParse

## Prioritized Backlog

### P0 (Critical)
- Fix missing filters on seeded Water Withdrawal KPIs

### P1 (High)
- Dashboard Scope 1 & 3 Emissions deduplication bug
- Carbon Intensity calculation discrepancy
- Cron job for marking tasks as "overdue"
- Phase 2 Executive Dashboard enhancements
- Test Repo Pilot with actual PDF uploads

### P2 (Medium)
- Dynamic ESG Disclosure Engine, Sentry, MFA, SBTi validation, Dark mode
