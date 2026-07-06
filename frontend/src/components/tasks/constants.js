/**
 * Task Module Constants
 * 
 * NEW ARCHITECTURE: Separates operational status from approval status
 * - status: operational completion (pending → completed)
 * - approval_status: governance state (not_required/pending_approval/approved/rejected)
 */

// Operational status - represents work completion state
export const TASK_STATUS = {
  BACKFILL_PENDING: 'backfill_pending',
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  OVERDUE: 'overdue',
  SKIPPED: 'skipped',
  REOPENED: 'reopened',
};

// Approval/governance status - separate from operational completion
export const APPROVAL_STATUS = {
  NOT_REQUIRED: 'not_required',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
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

// Operational status display config
export const STATUS_CONFIG = {
  [TASK_STATUS.COMPLETED]: {
    label: 'Completed',
    className: 'bg-green-100 text-green-700',
    icon: 'CheckCircle',
  },
  [TASK_STATUS.REOPENED]: {
    label: 'Reopened',
    className: 'bg-amber-100 text-amber-700',
    icon: 'RefreshCw',
  },
  [TASK_STATUS.OVERDUE]: {
    label: 'Overdue',
    className: 'bg-red-100 text-red-700',
    icon: 'AlertTriangle',
  },
  [TASK_STATUS.IN_PROGRESS]: {
    label: 'In Progress',
    className: 'bg-blue-100 text-blue-700',
    icon: 'Clock',
  },
  [TASK_STATUS.SKIPPED]: {
    label: 'Skipped',
    className: 'bg-stone-100 text-stone-600',
    icon: 'SkipForward',
  },
};

// Approval status display config
export const APPROVAL_STATUS_CONFIG = {
  [APPROVAL_STATUS.NOT_REQUIRED]: {
    label: '',  // Don't show badge if not required
    className: '',
  },
  [APPROVAL_STATUS.PENDING_APPROVAL]: {
    label: 'Awaiting Approval',
    className: 'bg-amber-100 text-amber-700',
    icon: 'Clock',
  },
  [APPROVAL_STATUS.APPROVED]: {
    label: 'Approved',
    className: 'bg-emerald-100 text-emerald-700',
    icon: 'BadgeCheck',
  },
  [APPROVAL_STATUS.REJECTED]: {
    label: 'Rejected',
    className: 'bg-red-100 text-red-700',
    icon: 'XCircle',
  },
};

export const ENTITY_TYPE = {
  RECORD: 'record',
  QUESTION: 'question',
  ALL: 'all',
};
