import React from 'react';
import { useDashboardData } from './dashboard/useDashboardData';
import DashboardWaste from '../modules/dashboard/DashboardWaste';

export default function WasteAnalysis() {
  const data = useDashboardData();

  const enhancedData = {
    ...data,
    dashboardType: 'esg',
    esgSection: 'environment',
    showDashboardToggle: false,
  };

  return <DashboardWaste data={enhancedData} />;
}
