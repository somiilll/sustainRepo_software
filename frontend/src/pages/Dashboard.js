/**
 * Dashboard — thin router that dispatches to the appropriate variant
 * based on the organization's module configuration.
 *
 * Priority order:
 *   1. has_ghg + has_esg  →  DashboardBRSRGHG (combined BRSR + GHG dashboard)
 *   2. scope1_2_3 access  →  DashboardScope123 (full GHG with Scope 3)
 *   3. otherwise          →  DashboardScope12 (Scope 1 & 2 only)
 *
 * Future: ESG-only dashboard when has_esg && !has_ghg
 */
import React from 'react';
import { useDashboardData } from './dashboard/useDashboardData';
import DashboardScope12 from '../modules/dashboard/DashboardScope12';
import DashboardScope123 from '../modules/dashboard/DashboardScope123';
import DashboardBRSRGHG from '../modules/dashboard/DashboardBRSRGHG';

export default function Dashboard() {
  const data = useDashboardData();
  const { organization, hasScope3Access } = data;
  
  const hasGhg = organization?.has_ghg !== false;
  const hasEsg = organization?.has_esg === true;

  // Combined BRSR + GHG dashboard
  if (hasGhg && hasEsg) {
    return <DashboardBRSRGHG data={data} />;
  }
  
  // GHG-only dashboards
  if (hasScope3Access) {
    return <DashboardScope123 data={data} />;
  }
  return <DashboardScope12 data={data} />;
}
