import React from 'react';
import { useDashboardData } from './dashboard/useDashboardData';
import DashboardSocial from '../modules/dashboard/DashboardSocial';

export default function SocialAnalysis() {
  const data = useDashboardData();

  const enhancedData = {
    ...data,
    dashboardType: 'esg',
    esgSection: 'social',
    showDashboardToggle: false,
  };

  return <DashboardSocial data={enhancedData} />;
}
