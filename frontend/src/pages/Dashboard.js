/**
 * Dashboard — thin router that dispatches to the appropriate variant
 * based on the organization's module configuration and user selection.
 *
 * Toggle options:
 *   - GHG: Shows DashboardScope123 or DashboardScope12 based on org scopes
 *   - ESG: Shows section-specific dashboards
 *     - All: DashboardBRSRGHG (combined)
 *     - Environment: DashboardEnvironment
 *     - Social: DashboardSocial
 *     - Governance: Placeholder (shows BRSR for now)
 */
import React, { useState } from 'react';
import { useDashboardData } from './dashboard/useDashboardData';
import DashboardScope12 from '../modules/dashboard/DashboardScope12';
import DashboardScope123 from '../modules/dashboard/DashboardScope123';
import DashboardBRSRGHG from '../modules/dashboard/DashboardBRSRGHG';
import DashboardEnvironment from '../modules/dashboard/DashboardEnvironment';
import DashboardSocial from '../modules/dashboard/DashboardSocial';

export default function Dashboard() {
  const data = useDashboardData();
  const { organization, hasScope3Access } = data;
  
  const hasGhg = organization?.has_ghg !== false;
  const hasEsg = organization?.has_esg === true;
  
  // Default to ESG if both modules enabled, else GHG
  const [dashboardType, setDashboardType] = useState(hasEsg ? 'esg' : 'ghg');
  const [esgSection, setEsgSection] = useState('all');
  
  // Only show toggle if org has both modules
  const showToggle = hasGhg && hasEsg;
  
  // Pass toggle state to data for StickyFilterBar
  const enhancedData = {
    ...data,
    dashboardType,
    setDashboardType,
    esgSection,
    setEsgSection,
    showDashboardToggle: showToggle,
  };

  // GHG Dashboard selection
  if (dashboardType === 'ghg' || !hasEsg) {
    if (hasScope3Access) {
      return <DashboardScope123 data={enhancedData} />;
    }
    return <DashboardScope12 data={enhancedData} />;
  }
  
  // ESG Dashboard selection
  if (esgSection === 'all') {
    return <DashboardBRSRGHG data={enhancedData} />;
  }
  
  if (esgSection === 'environment') {
    return <DashboardEnvironment data={enhancedData} />;
  }
  
  if (esgSection === 'social') {
    return <DashboardSocial data={enhancedData} />;
  }
  
  // Governance dashboard (placeholder - shows BRSR for now)
  return <DashboardBRSRGHG data={enhancedData} />;
}
