/**
 * Status Badge Component
 * Displays task status with appropriate styling
 */

import React from 'react';
import { Badge } from '../ui/badge';
import { STATUS_CONFIG, TASK_STATUS } from './constants';
import { CheckCircle2, AlertTriangle, Clock, Circle } from 'lucide-react';

const STATUS_ICONS = {
  [TASK_STATUS.SUBMITTED]: CheckCircle2,
  [TASK_STATUS.APPROVED]: CheckCircle2,
  [TASK_STATUS.REJECTED]: AlertTriangle,
  [TASK_STATUS.OVERDUE]: AlertTriangle,
  [TASK_STATUS.IN_PROGRESS]: Clock,
};

export default function StatusBadge({ status, showIcon = true }) {
  const config = STATUS_CONFIG[status];
  
  // Don't show badge for pending/backfill_pending
  if (!config) return null;
  
  const Icon = STATUS_ICONS[status] || Circle;
  
  return (
    <Badge className={`${config.className} gap-1`}>
      {showIcon && <Icon className="w-3 h-3" />}
      {config.label}
    </Badge>
  );
}
