/**
 * Task Module Utility Functions
 * 
 * NEW ARCHITECTURE: Uses separate status (operational) and approval_status (governance)
 */

import { TASK_STATUS, TASK_TYPE, APPROVAL_STATUS } from './constants';
import { formatDateTime as formatDateTimeUtil, formatDate as formatDateUtil } from '../../utils/dateTimeUtils';

/**
 * Check if task is operationally complete (work is done)
 * Includes pending_approval since work IS submitted, just awaiting review
 */
export const isTaskCompleted = (task) => {
  return task.status === TASK_STATUS.COMPLETED || 
         task.status === 'pending_approval' ||
         task.approval_status === APPROVAL_STATUS.PENDING_APPROVAL;
};

/**
 * Check if task needs approval action
 */
export const isAwaitingApproval = (task) => {
  return task.approval_status === APPROVAL_STATUS.PENDING_APPROVAL;
};

/**
 * Determine if a task is overdue (not completed and past due date)
 * Tasks with pending_approval are NOT overdue - work is done, just awaiting review
 */
export const isTaskOverdue = (task) => {
  const dueAt = task.due_at || task.due_date;
  if (!dueAt) return false;
  const now = new Date();
  // Task is overdue only if not completed AND not pending approval AND past due
  const workDone = task.status === TASK_STATUS.COMPLETED || 
                   task.status === 'pending_approval' ||
                   task.approval_status === APPROVAL_STATUS.PENDING_APPROVAL;
  return new Date(dueAt) < now && !workDone;
};

/**
 * Categorize task by type (backfill, current, future)
 */
export const categorizeTask = (task) => {
  if (task.is_backfill || task.status === TASK_STATUS.BACKFILL_PENDING) {
    return TASK_TYPE.BACKFILL;
  }
  
  if (task.task_type === TASK_TYPE.FUTURE) {
    return TASK_TYPE.FUTURE;
  }
  
  const periodStart = task.period_start ? new Date(task.period_start.split('T')[0]) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (periodStart && periodStart > today) {
    return TASK_TYPE.FUTURE;
  }
  
  return TASK_TYPE.CURRENT;
};

/**
 * Format due date with relative indicator
 * Now respects task completion status - completed tasks are NOT marked overdue
 */
export const formatDueDate = (task, options = {}) => {
  const { showTime = true, showRelative = true, timezone = 'UTC' } = options;
  const dateStr = task.due_at || task.due_date;
  if (!dateStr) return { text: '-', isOverdue: false, isUrgent: false };
  
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
  
  // Use the shared formatter with timezone support
  const formatted = showTime 
    ? formatDateTimeUtil(date, timezone)
    : formatDateUtil(date, timezone);
  
  let text = formatted;
  let suffix = '';
  
  // Check if task work is done - completed OR pending_approval (submitted, awaiting review)
  // These tasks should NOT show as overdue since the work IS done
  const isWorkDone = task.status === TASK_STATUS.COMPLETED || 
                     task.status === 'pending_approval' ||
                     task.approval_status === APPROVAL_STATUS.PENDING_APPROVAL;
  
  // Determine overdue status (only if work not done)
  const isPastDue = diffDays < 0;
  const isOverdue = isPastDue && !isWorkDone;
  
  if (showRelative && !isWorkDone) {
    if (isPastDue) {
      suffix = ' (Overdue)';
    } else if (diffDays <= 7) {
      suffix = ` (${diffDays}d left)`;
    }
  }
  
  return {
    text: text + suffix,
    isOverdue,
    isUrgent: !isWorkDone && diffDays >= 0 && diffDays <= 7,
    diffDays,
  };
};

/**
 * Format period range for display
 */
export const formatPeriodRange = (task, timezone = 'UTC') => {
  if (!task.period_start) return null;
  
  const start = new Date(task.period_start);
  const end = task.period_end ? new Date(task.period_end) : start;
  
  if (start.getTime() === end.getTime()) {
    return formatDateUtil(start, timezone, { month: 'short', day: 'numeric' });
  }
  
  const startFormatted = formatDateUtil(start, timezone, { month: 'short', day: 'numeric' });
  const endFormatted = formatDateUtil(end, timezone, { month: 'short', day: 'numeric' });
  return `${startFormatted} - ${endFormatted}`;
};

/**
 * Group tasks by category
 */
export const groupTasksByCategory = (tasks) => {
  const groups = {};
  
  for (const task of tasks) {
    const key = [task.category, task.subcategory].filter(Boolean).join(' › ');
    
    if (!groups[key]) {
      groups[key] = {
        key,
        category: task.category,
        subcategory: task.subcategory,
        backfill: [],
        current: [],
        future: [],
        total: 0,
        completed: 0,
        overdue: 0,
        pendingApproval: 0,
      };
    }
    
    // Categorize by task type
    const taskType = categorizeTask(task);
    groups[key][taskType].push(task);
    
    groups[key].total++;
    
    // Use new status architecture: completed is operational completion
    if (task.status === TASK_STATUS.COMPLETED) {
      groups[key].completed++;
      // Track approval separately
      if (task.approval_status === 'pending_approval') {
        groups[key].pendingApproval++;
      }
    } else if (isTaskOverdue(task)) {
      groups[key].overdue++;
    }
  }
  
  return Object.values(groups);
};

/**
 * Calculate stats from tasks
 * Uses new status architecture: status (operational) + approval_status (governance)
 */
export const calculateTaskStats = (tasks, questions = []) => {
  const pending = tasks.filter(t => 
    t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.BACKFILL_PENDING
  ).length;
  
  const overdue = tasks.filter(t => isTaskOverdue(t)).length;
  const inProgress = tasks.filter(t => t.status === TASK_STATUS.IN_PROGRESS).length;
  const completed = tasks.filter(t => t.status === TASK_STATUS.COMPLETED).length;
  const reopened = tasks.filter(t => t.status === TASK_STATUS.REOPENED).length;
  
  // Approval breakdown (only for completed tasks)
  const pendingApproval = tasks.filter(t => 
    t.status === TASK_STATUS.COMPLETED && t.approval_status === 'pending_approval'
  ).length;
  const approved = tasks.filter(t => t.approval_status === 'approved').length;
  
  return {
    total_tasks: tasks.length,
    total_questions: questions.length,
    pending_count: pending,
    overdue_count: overdue,
    in_progress_count: inProgress,
    completed_count: completed,
    reopened_count: reopened,
    pending_approval_count: pendingApproval,
    approved_count: approved,
  };
};

/**
 * Check if user can edit based on role
 */
export const canUserEdit = (task) => {
  const role = task.user_role || 'editor';
  return ['owner', 'editor'].includes(role);
};

/**
 * Check if user can approve based on role
 */
export const canUserApprove = (task) => {
  const role = task.user_role || 'editor';
  return role === 'approver';
};
