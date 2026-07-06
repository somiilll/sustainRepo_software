/**
 * Tracker Stats Cards Component
 */

import React from 'react';
import { Card } from '../ui/card';

export default function TrackerStatsCards({ stats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
      <Card className="p-4">
        <div className="text-2xl font-bold text-text-primary">{stats?.total_categories || 0}</div>
        <div className="text-sm text-text-muted">Total Categories</div>
      </Card>
      <Card className="p-4">
        <div className="text-2xl font-bold text-emerald-600">{stats?.assigned || 0}</div>
        <div className="text-sm text-text-muted">Assigned</div>
      </Card>
      <Card className="p-4">
        <div className="text-2xl font-bold text-stone-500">{stats?.unassigned || 0}</div>
        <div className="text-sm text-text-muted">Unassigned</div>
      </Card>
      <Card className="p-4">
        <div className="text-2xl font-bold text-green-600">{stats?.completed || 0}</div>
        <div className="text-sm text-text-muted">Completed</div>
      </Card>
      <Card className="p-4">
        <div className="text-2xl font-bold text-red-600">{stats?.overdue || 0}</div>
        <div className="text-sm text-text-muted">Overdue</div>
      </Card>
      <Card className="p-4">
        <div className="text-2xl font-bold text-orange-600">{stats?.stale || 0}</div>
        <div className="text-sm text-text-muted">Stale</div>
      </Card>
    </div>
  );
}
