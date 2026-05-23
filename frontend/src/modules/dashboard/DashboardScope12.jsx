/**
 * DashboardScope12 — wrapper config for orgs WITHOUT Scope 3 access.
 */
import React from 'react';
import BaseExecutiveDashboard from './BaseExecutiveDashboard';

export default function DashboardScope12({ data }) {
  return <BaseExecutiveDashboard data={data} hasScope3={false} />;
}
