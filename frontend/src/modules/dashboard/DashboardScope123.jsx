/**
 * DashboardScope123 — wrapper config for orgs WITH Scope 3 access.
 */
import React from 'react';
import BaseExecutiveDashboard from './BaseExecutiveDashboard';

export default function DashboardScope123({ data }) {
  return <BaseExecutiveDashboard data={data} hasScope3={true} />;
}
