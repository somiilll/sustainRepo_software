/**
 * My Tasks Component
 * 
 * Shows current user's assigned tasks (metrics and disclosures).
 * Refactored to use modular task components.
 */

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Card } from './ui/card';
import { Loader2, ClipboardList } from 'lucide-react';

// Task module imports
import {
  TaskCard,
  TaskFilters,
  TaskStatsCards,
  TaskGroupedView,
  useMyTasks,
  ENTITY_TYPE,
  categorizeTask,
  isTaskOverdue,
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
    groupedTasks, 
    refresh 
  } = useMyTasks({
    token,
    domain,
    framework,
    entityType,
    reportingPeriod,
    includeBackfill: true,
  });

  // Filter items for flat view
  const filteredItems = useMemo(() => {
    let items = [];
    
    if (entityType === ENTITY_TYPE.RECORD || entityType === ENTITY_TYPE.ALL) {
      items = [...items, ...tasks];
    }
    if (entityType === ENTITY_TYPE.QUESTION || entityType === ENTITY_TYPE.ALL) {
      items = [...items, ...questions];
    }
    
    return items.filter(item => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch = 
          item.category?.toLowerCase().includes(searchLower) ||
          item.subcategory?.toLowerCase().includes(searchLower) ||
          item.entity_id?.toLowerCase().includes(searchLower) ||
          item.period_label?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }
      
      // Status filter
      if (filters.status !== 'all') {
        if (filters.status === 'overdue') {
          if (!isTaskOverdue(item)) return false;
        } else if (item.status !== filters.status) {
          return false;
        }
      }
      
      // Task type filter
      if (filters.taskType !== 'all') {
        const taskType = categorizeTask(item);
        if (taskType !== filters.taskType) return false;
      }
      
      return true;
    });
  }, [tasks, questions, entityType, filters]);

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

      {/* Grouped View - For Metrics */}
      {entityType === ENTITY_TYPE.RECORD && (
        <TaskGroupedView
          groups={groupedTasks}
          filters={filters}
          onFillTask={handleFillTask}
          onViewTask={handleViewTask}
          emptyMessage="No metric tasks found"
        />
      )}

      {/* Flat View - For Questions or Mixed */}
      {entityType !== ENTITY_TYPE.RECORD && (
        <div className="space-y-3">
          {filteredItems.length === 0 ? (
            <Card className="p-8 text-center">
              <ClipboardList className="w-12 h-12 text-stone-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-text-primary">No tasks found</h3>
              <p className="text-text-muted">
                {entityType === ENTITY_TYPE.QUESTION
                  ? 'You do not have any disclosure tasks assigned.'
                  : 'You do not have any tasks assigned for this period.'}
              </p>
            </Card>
          ) : (
            filteredItems.map(item => (
              <TaskCard 
                key={item.id} 
                task={item} 
                onFill={handleFillTask}
                onView={handleViewTask}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
