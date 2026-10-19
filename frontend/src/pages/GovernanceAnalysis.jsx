import React from 'react';
import { useDashboardData } from './dashboard/useDashboardData';
import DashboardGovernance from '../modules/dashboard/DashboardGovernance';

export default function GovernanceAnalysis() {
  const data = useDashboardData();

  const enhancedData = {
    ...data,
    dashboardType: 'esg',
    esgSection: 'governance',
    showDashboardToggle: false,
  };

  return <DashboardGovernance data={enhancedData} />;
}
