import React from 'react';
import { useDashboardData } from './dashboard/useDashboardData';
import DashboardEnergy from '../modules/dashboard/DashboardEnergy';

export default function EnergyAnalysis() {
  const data = useDashboardData();

  const enhancedData = {
    ...data,
    dashboardType: 'esg',
    esgSection: 'environment',
    showDashboardToggle: false,
  };

  return <DashboardEnergy data={enhancedData} />;
}
