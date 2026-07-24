/**
 * Task Ledger Component
 * Displays tasks in a table/ledger format with columns:
 * Category, Subcategory, Facility, Period, Due, Status, Approval, Action
 */

import React from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ArrowRight, Eye, ClipboardList, Pencil } from 'lucide-react';
import { OperationalStatusBadge, ApprovalStatusBadge } from './StatusBadge';
import { formatDueDate, categorizeTask } from './utils';
import { TASK_TYPE } from './constants';

/**
 * Format period to show like "June '26" if it's a full month
 */
function formatPeriodDisplay(task) {
  if (!task.period_start) return task.period_label || '-';
  
  const start = new Date(task.period_start);
  const end = task.period_end ? new Date(task.period_end) : start;
  
  // Check if it spans a full month (1st to last day)
  const startDay = start.getDate();
  const endDay = end.getDate();
  const startMonth = start.getMonth();
  const endMonth = end.getMonth();
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  
  // Get last day of the end month
  const lastDayOfMonth = new Date(endYear, endMonth + 1, 0).getDate();
  
  // If same month and spans 1st to last day, show "Month 'YY"
  if (startMonth === endMonth && startYear === endYear && startDay === 1 && endDay === lastDayOfMonth) {
    const monthName = start.toLocaleDateString('en-US', { month: 'long' });
    const shortYear = startYear.toString().slice(-2);
    return `${monthName} '${shortYear}`;
  }
  
  // Otherwise show date range
  const formatOpts = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', formatOpts)} - ${end.toLocaleDateString('en-US', formatOpts)}`;
}

export default function TaskLedger({ 
  tasks, 
  filters,
  onFillTask, 
  onViewTask,
  onEditTask,
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
          <div className="col-span-2">Category</div>
          <div className="col-span-2">Subcategory</div>
          <div className="col-span-1">Facility</div>
          <div className="col-span-1">Period</div>
          <div className="col-span-2">Due</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-1">Approval Status</div>
          <div className="col-span-2 text-right">Action</div>
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
            onEdit={onEditTask || onFillTask}
          />
        ))}
      </div>
    </Card>
  );
}

function TaskLedgerRow({ task, onFill, onView, onEdit }) {
  const dueInfo = formatDueDate(task, { showTime: true, showRelative: false });
  const periodDisplay = formatPeriodDisplay(task);
  const taskType = categorizeTask(task);
  
  // Determine if task is completed or approved
  const isCompleted = task.status === 'completed';
  const isApproved = task.approval_status === 'approved';
  
  // Check if approval status should be shown (has a meaningful value, not null/not_required)
  const hasApprovalStatus = task.approval_status && 
    task.approval_status !== 'not_required' && 
    task.approval_status !== 'none';
  
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
      {/* Category with Tags */}
      <div className="col-span-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-text-primary">
            {task.category || '-'}
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

      {/* Subcategory */}
      <div className="col-span-2">
        <span className="text-sm text-text-primary">
          {task.subcategory || '-'}
        </span>
      </div>

      {/* Facility */}
      <div className="col-span-1">
        <span className="text-sm text-text-primary">
          {task.facility_name || 'Org-level'}
        </span>
      </div>

      {/* Period */}
      <div className="col-span-1">
        <span className="text-sm text-text-primary">{periodDisplay}</span>
      </div>

      {/* Due Date */}
      <div className="col-span-2">
        <span className={`text-sm ${
          dueInfo.isOverdue ? 'text-red-600 font-medium' : 
          dueInfo.isUrgent ? 'text-orange-600' : 'text-text-primary'
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
      <div className="col-span-1">
        <OperationalStatusBadge status={task.status} />
      </div>

      {/* Approval Status */}
      <div className="col-span-1">
        {hasApprovalStatus ? (
          <ApprovalStatusBadge approvalStatus={task.approval_status} />
        ) : (
          <span className="text-sm text-stone-400">-</span>
        )}
      </div>

      {/* Action */}
      <div className="col-span-2 text-right flex items-center justify-end gap-2">
        {isCompleted ? (
          <>
            {/* View button for completed tasks */}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onView?.(task)}
              className="gap-1 text-stone-600 h-7 text-xs"
              data-testid={`task-view-btn-${task.id}`}
            >
              <Eye className="w-3 h-3" />
              View
            </Button>
            {/* Edit button for completed tasks (if can edit and not approved) */}
            {canEdit && !isApproved && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onEdit?.(task)}
                className="gap-1 h-7 text-xs"
                data-testid={`task-edit-btn-${task.id}`}
              >
                <Pencil className="w-3 h-3" />
                Edit
              </Button>
            )}
          </>
        ) : canEdit ? (
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
