/**
 * My Tasks Component
 * 
 * Shows current user's assigned tasks in a ledger/table format.
 * Refactored to use modular task components.
 */

import React, { useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

// Task module imports
import {
  TaskLedger,
  TaskFilters,
  TaskStatsCards,
  useMyTasks,
  ENTITY_TYPE,
} from './tasks';

/**
 * @param {string} entityType - 'record' for Metrics, 'question' for Disclosures, 'all' for both
 * @param {string} reportingPeriod - Current reporting period
 * @param {string} domain - 'environment' | 'social' | 'governance'
 * @param {string} framework - Optional framework filter (e.g., 'BRSR', 'GRI')
 */
export default function MyTasks({ 
  entityType = ENTITY_TYPE.ALL, 
  reportingPeriod, 
  domain, 
  framework = null 
}) {
  const { token } = useAuth();
  
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    taskType: 'all',
  });

  // Fetch tasks using custom hook
  const { 
    loading, 
    tasks, 
    questions, 
    stats, 
    hasAssignments,
    refresh 
  } = useMyTasks({
    token,
    domain,
    framework,
    entityType,
    reportingPeriod,
    includeBackfill: true,
  });

  // NOTE: Task action handlers (handleFillTask, handleViewTask, handleEditTask) temporarily removed
  // Will be re-implemented with proper module redirect functionality later

  // Determine which items to show based on entityType
  const itemsToShow = useMemo(() => {
    if (entityType === ENTITY_TYPE.RECORD) {
      return tasks; // Only metrics
    } else if (entityType === ENTITY_TYPE.QUESTION) {
      return questions; // Only disclosures
    }
    return [...tasks, ...questions]; // Both
  }, [entityType, tasks, questions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="my-tasks-container">
      {/* Stats Cards */}
      <TaskStatsCards stats={stats} entityType={entityType} />

      {/* Filters */}
      <TaskFilters 
        filters={filters} 
        onChange={setFilters} 
        onRefresh={refresh}
      />

      {/* Ledger View - For all task types */}
      <TaskLedger
        tasks={itemsToShow}
        filters={filters}
        emptyMessage={
          entityType === ENTITY_TYPE.QUESTION
            ? 'No disclosure tasks found'
            : 'No tasks found'
        }
        hasAssignments={hasAssignments}
      />
    </div>
  );
}
