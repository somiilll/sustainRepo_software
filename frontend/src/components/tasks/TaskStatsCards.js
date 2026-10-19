/**
 * Task Stats Cards Component
 * Displays summary statistics for tasks
 */

import React from 'react';
import { Card } from '../ui/card';
import { ENTITY_TYPE } from './constants';

export default function TaskStatsCards({ stats, entityType = ENTITY_TYPE.ALL }) {
  const displayStats = {
    total: entityType === ENTITY_TYPE.RECORD 
      ? stats.total_tasks 
      : entityType === ENTITY_TYPE.QUESTION 
        ? stats.total_questions
        : (stats.total_tasks || 0) + (stats.total_questions || 0),
    pending: stats.pending_count || 0,
    inProgress: stats.in_progress_count || 0,
    overdue: stats.overdue_count || 0,
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card className="p-4">
        <div className="text-2xl font-bold text-text-primary">{displayStats.total}</div>
        <div className="text-sm text-text-muted">
          {entityType === ENTITY_TYPE.RECORD 
            ? 'Metrics' 
            : entityType === ENTITY_TYPE.QUESTION 
              ? 'Disclosures' 
              : 'Total Tasks'}
        </div>
      </Card>
      
      <Card className="p-4">
        <div className="text-2xl font-bold text-yellow-600">{displayStats.pending}</div>
        <div className="text-sm text-text-muted">Pending</div>
      </Card>
      
      <Card className="p-4">
        <div className="text-2xl font-bold text-blue-600">{displayStats.inProgress}</div>
        <div className="text-sm text-text-muted">In Progress</div>
      </Card>
      
      <Card className="p-4 border-red-200">
        <div className="text-2xl font-bold text-red-600">{displayStats.overdue}</div>
        <div className="text-sm text-text-muted">Overdue</div>
      </Card>
    </div>
  );
}
