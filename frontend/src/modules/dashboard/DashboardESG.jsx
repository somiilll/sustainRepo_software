/**
 * DashboardESG — Thin wrapper that renders the Executive Analytics Dashboard.
 */
import React from 'react';
import ExecutiveAnalyticsDashboard from './ExecutiveAnalyticsDashboard';

export default function DashboardESG({ data }) {
  return <ExecutiveAnalyticsDashboard data={data} />;
}
