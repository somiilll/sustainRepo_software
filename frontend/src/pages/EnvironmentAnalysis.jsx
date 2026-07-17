import React from 'react';
import { useDashboardData } from './dashboard/useDashboardData';
import DashboardEnvironment from '../modules/dashboard/DashboardEnvironment';

export default function EnvironmentAnalysis() {
  const data = useDashboardData();

  const enhancedData = {
    ...data,
    dashboardType: 'esg',
    esgSection: 'environment',
    showDashboardToggle: false,
  };

  return <DashboardEnvironment data={enhancedData} />;
}
