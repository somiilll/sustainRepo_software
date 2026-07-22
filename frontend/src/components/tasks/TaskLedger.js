/**
 * Task Ledger Component
 * Displays tasks in a table/ledger format with columns:
 * Category, Subcategory, Period, Due, Status, Action
 */

import React from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ArrowRight, Eye, ClipboardList, Building2 } from 'lucide-react';
import { TaskStatusBadges } from './StatusBadge';
import { formatDueDate, formatPeriodRange, categorizeTask } from './utils';
import { TASK_TYPE } from './constants';

export default function TaskLedger({ 
  tasks, 
  filters,
  onFillTask, 
  onViewTask,
  emptyMessage = 'No tasks found',
  hasAssignments = false,
}) {
  // Filter tasks based on current filters
  const filteredTasks = tasks.filter(task => {
    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchesSearch = 
        task.category?.toLowerCase().includes(searchLower) ||
        task.subcategory?.toLowerCase().includes(searchLower) ||
        task.period_label?.toLowerCase().includes(searchLower) ||
        task.facility_name?.toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }
    
    // Status filter
    if (filters.status !== 'all') {
      if (filters.status === 'overdue') {
        const dueInfo = formatDueDate(task);
        if (!dueInfo.isOverdue) return false;
      } else if (task.status !== filters.status) {
        return false;
      }
    }
    
    // Task type filter
    if (filters.taskType !== 'all') {
      const taskType = categorizeTask(task);
      if (taskType !== filters.taskType) return false;
    }
    
    return true;
  });

  // Sort tasks: backfill first, then current, then future
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    const typeOrder = { [TASK_TYPE.BACKFILL]: 0, [TASK_TYPE.CURRENT]: 1, [TASK_TYPE.FUTURE]: 2 };
    const aType = categorizeTask(a);
    const bType = categorizeTask(b);
    if (typeOrder[aType] !== typeOrder[bType]) {
      return typeOrder[aType] - typeOrder[bType];
    }
    // Within same type, sort by due date
    return new Date(a.due_at || 0) - new Date(b.due_at || 0);
  });

  if (sortedTasks.length === 0) {
    return (
      <Card className="p-8 text-center">
        <ClipboardList className="w-12 h-12 text-stone-300 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-text-primary">{emptyMessage}</h3>
        <p className="text-text-muted">
          {hasAssignments 
            ? 'Tasks will be generated once a schedule (start date & frequency) is set by admin.'
            : 'You do not have any tasks assigned.'}
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden" data-testid="task-ledger">
      {/* Table Header */}
      <div className="bg-stone-50 border-b border-stone-200">
        <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-medium text-stone-600 uppercase tracking-wider">
          <div className="col-span-3">Category / Subcategory</div>
          <div className="col-span-2">Facility</div>
          <div className="col-span-2">Period</div>
          <div className="col-span-2">Due</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1 text-right">Action</div>
        </div>
      </div>

      {/* Table Body */}
      <div className="divide-y divide-stone-100">
        {sortedTasks.map(task => (
          <TaskLedgerRow 
            key={task.id} 
            task={task} 
            onFill={onFillTask}
            onView={onViewTask}
          />
        ))}
      </div>
    </Card>
  );
}

function TaskLedgerRow({ task, onFill, onView }) {
  const dueInfo = formatDueDate(task, { showTime: true, showRelative: false });
  const periodRange = formatPeriodRange(task);
  const taskType = categorizeTask(task);
  
  // Determine if task is completed or approved (no fill button)
  const isCompleted = task.status === 'completed';
  const isApproved = task.approval_status === 'approved';
  const showFillButton = !isCompleted && !isApproved;
  
  // Check if user can edit
  const role = task.user_role || 'editor';
  const canEdit = ['owner', 'editor'].includes(role);

  return (
    <div 
      className={`grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-stone-50 transition-colors ${
        dueInfo.isOverdue ? 'bg-red-50/50' : ''
      }`}
      data-testid={`task-ledger-row-${task.id}`}
    >
      {/* Category / Subcategory with Tags */}
      <div className="col-span-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-text-primary">
            {task.category}
            {task.subcategory && (
              <span className="text-stone-400 font-normal"> › {task.subcategory}</span>
            )}
          </span>
          {/* Backfill/Future Tags */}
          {taskType === TASK_TYPE.BACKFILL && (
            <Badge className="bg-amber-100 text-amber-700 text-xs px-1.5 py-0">
              Backfill
            </Badge>
          )}
          {taskType === TASK_TYPE.FUTURE && (
            <Badge className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0">
              Future
            </Badge>
          )}
        </div>
      </div>

      {/* Facility */}
      <div className="col-span-2">
        {task.facility_name ? (
          <div className="flex items-center gap-1 text-sm text-blue-600">
            <Building2 className="w-3.5 h-3.5" />
            <span>{task.facility_name}</span>
          </div>
        ) : (
          <span className="text-sm text-stone-400">Org-level</span>
        )}
      </div>

      {/* Period */}
      <div className="col-span-2">
        <span className="text-sm text-text-primary">{periodRange || task.period_label || '-'}</span>
      </div>

      {/* Due Date */}
      <div className="col-span-2">
        <span className={`text-sm ${
          dueInfo.isOverdue ? 'text-red-600 font-medium' : 
          dueInfo.isUrgent ? 'text-orange-600' : 'text-text-muted'
        }`}>
          {task.due_at 
            ? new Date(task.due_at).toLocaleString('en-US', { 
                month: 'short', 
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              }) 
            : '-'}
        </span>
        {dueInfo.isOverdue && (
          <Badge className="ml-2 bg-red-100 text-red-700 text-xs px-1.5 py-0">
            Overdue
          </Badge>
        )}
      </div>

      {/* Status */}
      <div className="col-span-2">
        <TaskStatusBadges task={task} />
      </div>

      {/* Action */}
      <div className="col-span-1 text-right">
        {showFillButton && canEdit ? (
          <Button
            size="sm"
            onClick={() => onFill(task)}
            className="bg-emerald-600 hover:bg-emerald-700 gap-1 h-7 text-xs"
            data-testid={`task-fill-btn-${task.id}`}
          >
            Fill
            <ArrowRight className="w-3 h-3" />
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onView?.(task)}
            className="gap-1 text-stone-500 h-7 text-xs"
            data-testid={`task-view-btn-${task.id}`}
          >
            <Eye className="w-3 h-3" />
            View
          </Button>
        )}
      </div>
    </div>
  );
}
