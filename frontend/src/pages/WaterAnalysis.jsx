import React from 'react';
import { useDashboardData } from './dashboard/useDashboardData';
import DashboardWater from '../modules/dashboard/DashboardWater';

export default function WaterAnalysis() {
  const data = useDashboardData();

  const enhancedData = {
    ...data,
    dashboardType: 'esg',
    esgSection: 'environment',
    showDashboardToggle: false,
  };

  return <DashboardWater data={enhancedData} />;
}
