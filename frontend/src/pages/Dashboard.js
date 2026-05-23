/**
 * Dashboard — thin router that dispatches to the appropriate variant
 * based on the organization's `enabled_access` configuration.
 *
 *   - `enabled_access` includes 'scope1_2_3'  →  DashboardScope123 (full GHG dashboard)
 *   - otherwise                               →  DashboardScope12  (Scope 1 & 2 only)
 *
 * Both variants share `useDashboardData` (this file calls the hook ONCE
 * and passes the result down), so there is no double-fetching when the
 * router determines which dashboard to render.
 *
 * The variant files live under `/app/frontend/src/pages/dashboard/`:
 *   - DashboardScope12.jsx
 *   - DashboardScope123.jsx
 *   - useDashboardData.js
 *   - dashboardConstants.js
 *   - components/*.jsx (DashboardHeader, DashboardFilters, KpiCards,
 *     EmissionsByScopeCard, Scope3VisualizationsCard,
 *     BaseYearComparisonCard, CategoryAndFuelAnalysis)
 */
import React from 'react';
import { useDashboardData } from './dashboard/useDashboardData';
import DashboardScope12 from '../modules/dashboard/DashboardScope12';
import DashboardScope123 from '../modules/dashboard/DashboardScope123';

export default function Dashboard() {
  const data = useDashboardData();

  if (data.hasScope3Access) {
    return <DashboardScope123 data={data} />;
  }
  return <DashboardScope12 data={data} />;
}
