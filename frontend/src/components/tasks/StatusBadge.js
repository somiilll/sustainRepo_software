/**
 * Status Badge Components
 * Displays task operational status and approval status separately
 */

import React from 'react';
import { Badge } from '../ui/badge';
import { 
  STATUS_CONFIG, 
  APPROVAL_STATUS_CONFIG, 
  TASK_STATUS, 
  APPROVAL_STATUS 
} from './constants';
import { CheckCircle2, AlertTriangle, Clock, RefreshCw, BadgeCheck, XCircle } from 'lucide-react';

const ICONS = {
  CheckCircle: CheckCircle2,
  AlertTriangle: AlertTriangle,
  Clock: Clock,
  RefreshCw: RefreshCw,
  BadgeCheck: BadgeCheck,
  XCircle: XCircle,
};

/**
 * Operational Status Badge - shows if work is completed
 */
export function OperationalStatusBadge({ status, showIcon = true }) {
  const config = STATUS_CONFIG[status];
  
  // Don't show badge for pending/backfill_pending (default states)
  if (!config) return null;
  
  const Icon = showIcon && config.icon ? ICONS[config.icon] : null;
  
  return (
    <Badge className={`${config.className} gap-1`}>
      {Icon && <Icon className="w-3 h-3" />}
      {config.label}
    </Badge>
  );
}

/**
 * Approval Status Badge - shows governance/review state
 */
export function ApprovalStatusBadge({ approvalStatus, showIcon = true }) {
  // Don't show if not_required or missing
  if (!approvalStatus || approvalStatus === APPROVAL_STATUS.NOT_REQUIRED) {
    return null;
  }
  
  const config = APPROVAL_STATUS_CONFIG[approvalStatus];
  if (!config || !config.label) return null;
  
  const Icon = showIcon && config.icon ? ICONS[config.icon] : null;
  
  return (
    <Badge className={`${config.className} gap-1`}>
      {Icon && <Icon className="w-3 h-3" />}
      {config.label}
    </Badge>
  );
}

/**
 * Combined Task Status Display - shows both operational + approval status
 */
export function TaskStatusBadges({ task, showIcon = true }) {
  const { status, approval_status } = task;
  
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <OperationalStatusBadge status={status} showIcon={showIcon} />
      <ApprovalStatusBadge approvalStatus={approval_status} showIcon={showIcon} />
    </div>
  );
}

// Default export for backwards compatibility
export default function StatusBadge({ status, showIcon = true }) {
  return <OperationalStatusBadge status={status} showIcon={showIcon} />;
}
