/**
 * Task Module Constants
 */

export const TASK_STATUS = {
  PENDING: 'pending',
  BACKFILL_PENDING: 'backfill_pending',
  IN_PROGRESS: 'in_progress',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  OVERDUE: 'overdue',
  SKIPPED: 'skipped',
};

export const TASK_TYPE = {
  CURRENT: 'current',
  BACKFILL: 'backfill',
  FUTURE: 'future',
  HISTORICAL: 'historical',
};

export const ASSIGNEE_ROLE = {
  OWNER: 'owner',
  EDITOR: 'editor',
  REVIEWER: 'reviewer',
  APPROVER: 'approver',
  VIEWER: 'viewer',
};

export const ROLE_CONFIG = {
  [ASSIGNEE_ROLE.OWNER]: {
    label: 'Owner',
    className: 'bg-purple-100 text-purple-700',
    canEdit: true,
    canApprove: false,
  },
  [ASSIGNEE_ROLE.EDITOR]: {
    label: 'Editor',
    className: 'bg-blue-100 text-blue-700',
    canEdit: true,
    canApprove: false,
  },
  [ASSIGNEE_ROLE.REVIEWER]: {
    label: 'Reviewer',
    className: 'bg-amber-100 text-amber-700',
    canEdit: false,
    canApprove: false,
  },
  [ASSIGNEE_ROLE.APPROVER]: {
    label: 'Approver',
    className: 'bg-green-100 text-green-700',
    canEdit: false,
    canApprove: true,
  },
  [ASSIGNEE_ROLE.VIEWER]: {
    label: 'Viewer',
    className: 'bg-stone-100 text-stone-600',
    canEdit: false,
    canApprove: false,
  },
};

export const STATUS_CONFIG = {
  [TASK_STATUS.SUBMITTED]: {
    label: 'Submitted',
    className: 'bg-purple-100 text-purple-700',
  },
  [TASK_STATUS.APPROVED]: {
    label: 'Completed',
    className: 'bg-green-100 text-green-700',
  },
  [TASK_STATUS.REJECTED]: {
    label: 'Rejected',
    className: 'bg-red-100 text-red-700',
  },
  [TASK_STATUS.OVERDUE]: {
    label: 'Overdue',
    className: 'bg-red-100 text-red-700',
  },
  [TASK_STATUS.IN_PROGRESS]: {
    label: 'In Progress',
    className: 'bg-blue-100 text-blue-700',
  },
};

export const ENTITY_TYPE = {
  RECORD: 'record',
  QUESTION: 'question',
  ALL: 'all',
};
