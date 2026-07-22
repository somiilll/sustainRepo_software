/**
 * My Tasks Component
 * 
 * Shows current user's assigned tasks in a ledger/table format.
 * Refactored to use modular task components.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
  
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

  // Navigate to fill the item
  const handleFillTask = (task) => {
    const taskDomain = task.domain || domain || 'environment';
    const taskFramework = task.framework || 'BRSR';
    
    if (task.entity_type === 'question') {
      navigate(`/esg/${taskDomain}?framework=${taskFramework}&question=${task.entity_id}`);
    } else {
      const params = new URLSearchParams();
      params.set('tab', 'metrics');
      params.set('subtab', 'add-metric');
      if (task.category) params.set('category', task.category);
      if (task.subcategory) params.set('subcategory', task.subcategory);
      if (task.filling_frequency) params.set('frequency', task.filling_frequency);
      
      // Pass period info for pre-filling the date
      if (task.period_start) {
        const dateOnly = task.period_start.split('T')[0].split(' ')[0];
        params.set('period_start', dateOnly);
      }
      
      navigate(`/${taskDomain}?${params.toString()}`);
    }
  };

  // View-only handler for non-editable tasks
  const handleViewTask = (task) => {
    const taskDomain = task.domain || domain || 'environment';
    const params = new URLSearchParams();
    params.set('tab', 'metrics');
    params.set('view', 'readonly');
    if (task.category) params.set('category', task.category);
    if (task.subcategory) params.set('subcategory', task.subcategory);
    if (task.period_start) {
      const dateOnly = task.period_start.split('T')[0].split(' ')[0];
      params.set('period_start', dateOnly);
    }
    navigate(`/${taskDomain}?${params.toString()}`);
  };

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
        tasks={[...tasks, ...questions]}
        filters={filters}
        onFillTask={handleFillTask}
        onViewTask={handleViewTask}
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
