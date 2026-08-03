/**
 * Task Ledger Component
 * Displays tasks in a table/ledger format
 * - For Questions (BRSR/GRI): Question, Due, Status, Approval
 * - For Metrics (ESG): Category, Subcategory, Facility, Period, Due, Status, Approval
 */

import React from 'react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { ClipboardList } from 'lucide-react';
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

/**
 * Format question key to readable title
 * e.g., "policy_extend_to_value_chain" -> "Policy Extend To Value Chain"
 */
function formatQuestionTitle(key) {
  if (!key) return '-';
  return key
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get display values for a task based on its type
 * For questions (BRSR/GRI): show question name from backend
 * For records (metrics): show category and subcategory
 */
function getTaskDisplayInfo(task) {
  if (task.entity_type === 'question') {
    // For disclosure questions, use the question_name from backend (fetched from esg_question_configs)
    const questionName = task.question_name || formatQuestionTitle(task.entity_id || task.sub_subcategory);
    return {
      primary: questionName,
      secondary: null, // No subcategory for questions
      isQuestion: true,
    };
  }
  // For regular metric records
  return {
    primary: task.category || '-',
    secondary: task.subcategory || '-',
    isQuestion: false,
  };
}

/**
 * Determine if we have any questions vs metrics in the task list
 */
function getTaskListType(tasks) {
  const hasQuestions = tasks.some(t => t.entity_type === 'question');
  const hasMetrics = tasks.some(t => t.entity_type !== 'question');
  return { hasQuestions, hasMetrics };
}

export default function TaskLedger({ 
  tasks, 
  filters,
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
        task.entity_id?.toLowerCase().includes(searchLower) ||
        task.question_name?.toLowerCase().includes(searchLower) ||
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

  // Determine task list type for header rendering
  const { hasQuestions, hasMetrics } = getTaskListType(sortedTasks);
  const isQuestionsOnly = hasQuestions && !hasMetrics;
  const isMetricsOnly = hasMetrics && !hasQuestions;

  return (
    <Card className="overflow-hidden" data-testid="task-ledger">
      {/* Table Header - Different layouts for Questions vs Metrics */}
      <div className="bg-stone-50 border-b border-stone-200">
        {isQuestionsOnly ? (
          // Questions header (BRSR/GRI): Question, Due, Status, Approval
          <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-medium text-stone-600 uppercase tracking-wider">
            <div className="col-span-6">Question</div>
            <div className="col-span-2">Due</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Approval Status</div>
          </div>
        ) : isMetricsOnly ? (
          // Metrics header (ESG): Category, Subcategory, Facility, Period, Due, Status, Approval
          <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-medium text-stone-600 uppercase tracking-wider">
            <div className="col-span-2">Category</div>
            <div className="col-span-2">Subcategory</div>
            <div className="col-span-1">Facility</div>
            <div className="col-span-1">Period</div>
            <div className="col-span-2">Due</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Approval Status</div>
          </div>
        ) : (
          // Mixed: Show flexible header
          <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-medium text-stone-600 uppercase tracking-wider">
            <div className="col-span-3">Category / Question</div>
            <div className="col-span-2">Subcategory</div>
            <div className="col-span-1">Facility</div>
            <div className="col-span-1">Period</div>
            <div className="col-span-2">Due</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-2">Approval Status</div>
          </div>
        )}
      </div>

      {/* Table Body */}
      <div className="divide-y divide-stone-100">
        {sortedTasks.map(task => (
          <TaskLedgerRow 
            key={task.id} 
            task={task}
            isQuestionsOnly={isQuestionsOnly}
            isMetricsOnly={isMetricsOnly}
          />
        ))}
      </div>
    </Card>
  );
}

function TaskLedgerRow({ task, isQuestionsOnly, isMetricsOnly }) {
  const dueInfo = formatDueDate(task, { showTime: true, showRelative: false });
  const periodDisplay = formatPeriodDisplay(task);
  const taskType = categorizeTask(task);
  const displayInfo = getTaskDisplayInfo(task);
  
  // Check if approval status should be shown (has a meaningful value, not null/not_required)
  const hasApprovalStatus = task.approval_status && 
    task.approval_status !== 'not_required' && 
    task.approval_status !== 'none';

  // Questions layout (BRSR/GRI): Question, Due, Status, Approval
  if (isQuestionsOnly || displayInfo.isQuestion) {
    return (
      <div 
        className={`grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-stone-50 transition-colors ${
          dueInfo.isOverdue ? 'bg-red-50/50' : ''
        }`}
        data-testid={`task-ledger-row-${task.id}`}
      >
        {/* Question Name */}
        <div className="col-span-6">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-text-primary" title={displayInfo.primary}>
              {displayInfo.primary.length > 80 
                ? displayInfo.primary.substring(0, 80) + '...' 
                : displayInfo.primary}
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
            <Badge className="ml-1 bg-red-100 text-red-700 text-xs px-1.5 py-0">
              Overdue
            </Badge>
          )}
        </div>

        {/* Status */}
        <div className="col-span-2">
          <OperationalStatusBadge status={task.status} />
        </div>

        {/* Approval Status */}
        <div className="col-span-2">
          {hasApprovalStatus ? (
            <div className="flex flex-col gap-1">
              <ApprovalStatusBadge approvalStatus={task.approval_status} />
              {task.approval_status === 'rejected' && task.rejection_reason && (
                <span className="text-xs text-red-600 truncate max-w-[150px]" title={task.rejection_reason}>
                  {task.rejection_reason}
                </span>
              )}
            </div>
          ) : (
            <span className="text-sm text-stone-400">-</span>
          )}
        </div>
      </div>
    );
  }

  // Metrics layout (ESG): Category, Subcategory, Facility, Period, Due, Status, Approval
  return (
    <div 
      className={`grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-stone-50 transition-colors ${
        dueInfo.isOverdue ? 'bg-red-50/50' : ''
      }`}
      data-testid={`task-ledger-row-${task.id}`}
    >
      {/* Category */}
      <div className="col-span-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-text-primary" title={displayInfo.primary}>
            {displayInfo.primary}
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
          {displayInfo.secondary}
        </span>
      </div>

      {/* Facility */}
      <div className="col-span-1">
        <span className="text-sm text-text-primary truncate" title={task.facility_name || 'Org-level'}>
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
          <Badge className="ml-1 bg-red-100 text-red-700 text-xs px-1.5 py-0">
            Overdue
          </Badge>
        )}
      </div>

      {/* Status */}
      <div className="col-span-2">
        <OperationalStatusBadge status={task.status} />
      </div>

      {/* Approval Status */}
      <div className="col-span-2">
        {hasApprovalStatus ? (
          <div className="flex flex-col gap-1">
            <ApprovalStatusBadge approvalStatus={task.approval_status} />
            {task.approval_status === 'rejected' && task.rejection_reason && (
              <span className="text-xs text-red-600 truncate max-w-[150px]" title={task.rejection_reason}>
                {task.rejection_reason}
              </span>
            )}
          </div>
        ) : (
          <span className="text-sm text-stone-400">-</span>
        )}
      </div>
    </div>
  );
}
