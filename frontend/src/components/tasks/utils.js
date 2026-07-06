/**
 * Task Module Utility Functions
 */

import { TASK_STATUS, TASK_TYPE } from './constants';

/**
 * Determine if a task is overdue
 */
export const isTaskOverdue = (task) => {
  const dueAt = task.due_at || task.due_date;
  if (!dueAt) return false;
  const now = new Date();
  return new Date(dueAt) < now && 
    ![TASK_STATUS.SUBMITTED, TASK_STATUS.APPROVED].includes(task.status);
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
  
  if (showRelative) {
    if (diffDays < 0) {
      suffix = ' (Overdue)';
    } else if (diffDays <= 7) {
      suffix = ` (${diffDays}d left)`;
    }
  }
  
  return {
    text: text + suffix,
    isOverdue: diffDays < 0,
    isUrgent: diffDays >= 0 && diffDays <= 7,
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
  const now = new Date();
  
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
      };
    }
    
    // Categorize by task type
    const taskType = categorizeTask(task);
    groups[key][taskType].push(task);
    
    groups[key].total++;
    
    if ([TASK_STATUS.SUBMITTED, TASK_STATUS.APPROVED].includes(task.status)) {
      groups[key].completed++;
    } else if (isTaskOverdue(task)) {
      groups[key].overdue++;
    }
  }
  
  return Object.values(groups);
};

/**
 * Calculate stats from tasks
 */
export const calculateTaskStats = (tasks, questions = []) => {
  const pending = tasks.filter(t => 
    t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.BACKFILL_PENDING
  ).length;
  
  const overdue = tasks.filter(t => isTaskOverdue(t)).length;
  const inProgress = tasks.filter(t => t.status === TASK_STATUS.IN_PROGRESS).length;
  const submitted = tasks.filter(t => t.status === TASK_STATUS.SUBMITTED).length;
  const completed = tasks.filter(t => t.status === TASK_STATUS.APPROVED).length;
  
  return {
    total_tasks: tasks.length,
    total_questions: questions.length,
    pending_count: pending,
    overdue_count: overdue,
    in_progress_count: inProgress,
    submitted_count: submitted,
    completed_count: completed,
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
