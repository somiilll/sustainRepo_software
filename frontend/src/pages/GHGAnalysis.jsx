import React from 'react';
import { useDashboardData } from './dashboard/useDashboardData';
import DashboardScope12 from '../modules/dashboard/DashboardScope12';
import DashboardScope123 from '../modules/dashboard/DashboardScope123';

export default function GHGAnalysis() {
  const data = useDashboardData();
  const { hasScope3Access } = data;

  const enhancedData = {
    ...data,
    dashboardType: 'ghg',
    esgSection: null,
    showDashboardToggle: false,
  };

  if (hasScope3Access) {
    return <DashboardScope123 data={enhancedData} />;
  }
  return <DashboardScope12 data={enhancedData} />;
}
