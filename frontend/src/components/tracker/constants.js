/**
 * Tracker Module Constants
 * 
 * NEW ARCHITECTURE: Uses status (operational) + approval_status (governance)
 */

// Operational status colors
export const STATUS_COLORS = {
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  in_progress: 'bg-blue-100 text-blue-700 border-blue-200',
  pending: 'bg-stone-100 text-stone-600 border-stone-200',
  reopened: 'bg-amber-100 text-amber-700 border-amber-200',
  overdue: 'bg-red-100 text-red-700 border-red-200',
  skipped: 'bg-stone-200 text-stone-600 border-stone-300',
};

// Approval status colors
export const APPROVAL_STATUS_COLORS = {
  not_required: '',  // No badge needed
  pending_approval: 'bg-amber-100 text-amber-700 border-amber-200',
  approved: 'bg-green-100 text-green-700 border-green-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
};

export const STALENESS_COLORS = {
  fresh: 'bg-emerald-100 text-emerald-700',
  aging: 'bg-yellow-100 text-yellow-700',
  stale: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

export const CATEGORY_STATUS = {
  UNASSIGNED: 'unassigned',
  PARTIALLY_ASSIGNED: 'partially_assigned',
  ASSIGNED: 'assigned',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
};

export const CATEGORY_STATUS_CONFIG = {
  [CATEGORY_STATUS.UNASSIGNED]: { 
    class: 'bg-stone-100 text-stone-500', 
    label: 'Unassigned' 
  },
  [CATEGORY_STATUS.PARTIALLY_ASSIGNED]: { 
    class: 'bg-amber-100 text-amber-700', 
    label: 'Partially Assigned' 
  },
  [CATEGORY_STATUS.ASSIGNED]: { 
    class: 'bg-blue-100 text-blue-700', 
    label: 'Assigned' 
  },
  [CATEGORY_STATUS.IN_PROGRESS]: { 
    class: 'bg-purple-100 text-purple-700', 
    label: 'In Progress' 
  },
  [CATEGORY_STATUS.COMPLETED]: { 
    class: 'bg-green-100 text-green-700', 
    label: 'Completed' 
  },
};

export const FILLING_FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half Yearly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'event_based', label: 'Event Based' },
];

export const TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'IST (India)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'EST (US Eastern)' },
  { value: 'America/Los_Angeles', label: 'PST (US Pacific)' },
  { value: 'Europe/London', label: 'GMT (UK)' },
  { value: 'Europe/Berlin', label: 'CET (Central Europe)' },
  { value: 'Asia/Singapore', label: 'SGT (Singapore)' },
  { value: 'Asia/Tokyo', label: 'JST (Japan)' },
  { value: 'Australia/Sydney', label: 'AEST (Sydney)' },
  { value: 'Asia/Dubai', label: 'GST (Dubai)' },
];
