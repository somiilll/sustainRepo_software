/**
 * Task Module Utility Functions
 * 
 * NEW ARCHITECTURE: Uses separate status (operational) and approval_status (governance)
 */

import { TASK_STATUS, TASK_TYPE, APPROVAL_STATUS } from './constants';

/**
 * Check if task is operationally complete
 */
export const isTaskCompleted = (task) => {
  return task.status === TASK_STATUS.COMPLETED;
};

/**
 * Check if task needs approval action
 */
export const isAwaitingApproval = (task) => {
  return task.approval_status === APPROVAL_STATUS.PENDING_APPROVAL;
};

/**
 * Determine if a task is overdue (not completed and past due date)
 */
export const isTaskOverdue = (task) => {
  const dueAt = task.due_at || task.due_date;
  if (!dueAt) return false;
  const now = new Date();
  // Task is overdue only if not completed and past due
  return new Date(dueAt) < now && task.status !== TASK_STATUS.COMPLETED;
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
  const { showTime = true, showRelative = true } = options;
  const dateStr = task.due_at || task.due_date;
  if (!dateStr) return { text: '-', isOverdue: false, isUrgent: false };
  
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
  
  const formatted = date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
  
  const time = showTime 
    ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null;
  
  let text = time ? `${formatted}, ${time}` : formatted;
  let suffix = '';
  
  // Check if task is completed - completed tasks are never overdue
  const isCompleted = task.status === TASK_STATUS.COMPLETED;
  
  // Determine overdue status (only if not completed)
  const isPastDue = diffDays < 0;
  const isOverdue = isPastDue && !isCompleted;
  
  if (showRelative && !isCompleted) {
    if (isPastDue) {
      suffix = ' (Overdue)';
    } else if (diffDays <= 7) {
      suffix = ` (${diffDays}d left)`;
    }
  }
  
  return {
    text: text + suffix,
    isOverdue,
    isUrgent: !isCompleted && diffDays >= 0 && diffDays <= 7,
    diffDays,
  };
};

/**
 * Format period range for display
 */
export const formatPeriodRange = (task) => {
  if (!task.period_start) return null;
  
  const start = new Date(task.period_start);
  const end = task.period_end ? new Date(task.period_end) : start;
  
  const formatOpts = { month: 'short', day: 'numeric' };
  
  if (start.getTime() === end.getTime()) {
    return start.toLocaleDateString('en-US', formatOpts);
  }
  
  return `${start.toLocaleDateString('en-US', formatOpts)} - ${end.toLocaleDateString('en-US', formatOpts)}`;
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
