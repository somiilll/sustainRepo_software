# ESG Platform - Product Requirements Document

## Original Problem Statement
Build an enterprise ESG (Environmental, Social, Governance) data management platform with comprehensive reporting, analytics, workflow management, and compliance features.

## What's Been Implemented

### Core Platform
- Multi-org architecture with role-based access (Admin, User, Super Admin)
- JWT authentication, Organization management, Facility CRUD, User management

### Dashboard & Analytics
- **Executive GHG Dashboard**: KPI cards, GHG Emissions Trend, Scope Donut, Facility-wise, Scope 3 Hotspots, Emission Categories
- **Executive ESG Dashboard**: Section selector (All/Environment/Social/Governance)
- **Environment Dashboard** (July 2026): 7 KPI cards, Scope Contribution stacked bars, Emission Hotspots treemap, Scope Explorer tabs, Energy charts (consumption/renewable%/intensity), Water charts (balance/sources/trends), Waste charts (overview/hazardous/non-hazardous)
- **Social Dashboard** (July 2026): 9 KPI cards, Workforce Composition stacked bar, Employee Movement combo chart, Employee Diversity nested donut, Board Diversity horizontal bar, Training by Attendee + Trend, Complaint Status/Filed Against/Categories, H&S Incident Trend
- Backend endpoints: `/api/dashboard/esg-analytics`, `/api/dashboard/esg-summary`, `/api/dashboard/environment-detail`, `/api/dashboard/social-detail`

### Sidebar & Navigation
- **Admin/User**: 3-level hierarchical config-driven sidebar
- **Super Admin**: Full sidebar restored with all 20+ routes

### Materiality Assessment
- 5x5 scatter matrix (Recharts), 23 GRI topics, side drawer, Framer Motion

### Data Modules
- GHG (Logs, Sinks, Base Year), Environment (Energy, Water, Waste, etc.), Social, Governance
- Reporting (BRSR/GRI), Workflow (Tracker/My Task/Approver Queue)
- Repo-Pilot (RAG), Audit Trails, Bulk Uploads, Targets

## Architecture
- Frontend: React + Tailwind + Shadcn + Recharts + Framer Motion
- Backend: FastAPI + MongoDB (Motor)
- Storage: Cloudflare R2 | Email: Resend | AI: OpenAI, LlamaParse

## Prioritized Backlog

### P0
- Fix missing filters on seeded Water Withdrawal KPIs

### P1
- Dashboard Scope 1 & 3 Emissions deduplication bug
- Carbon Intensity calculation discrepancy
- Super Admin org module access toggle UI
- Cron job for overdue tasks
- Phase 2 Dashboard enhancements (PDF export, fullscreen, drill-down)
- Repo Pilot end-to-end PDF test

### P2
- Dynamic ESG Disclosure Engine, Sentry, MFA, SBTi validation, Dark mode
