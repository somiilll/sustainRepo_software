/**
 * Role Badge Component
 * Displays user's role for a task assignment
 */

import React from 'react';
import { Badge } from '../ui/badge';
import { ROLE_CONFIG, ASSIGNEE_ROLE } from './constants';
import { User, Shield, Eye, Edit3, CheckCircle } from 'lucide-react';

const ROLE_ICONS = {
  [ASSIGNEE_ROLE.OWNER]: Shield,
  [ASSIGNEE_ROLE.EDITOR]: Edit3,
  [ASSIGNEE_ROLE.REVIEWER]: Eye,
  [ASSIGNEE_ROLE.APPROVER]: CheckCircle,
  [ASSIGNEE_ROLE.VIEWER]: Eye,
};

export default function RoleBadge({ role, showIcon = true, size = 'default' }) {
  const config = ROLE_CONFIG[role] || ROLE_CONFIG[ASSIGNEE_ROLE.EDITOR];
  const Icon = ROLE_ICONS[role] || User;
  
  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    default: 'text-xs',
    lg: 'text-sm px-2.5 py-1',
  };
  
  return (
    <Badge className={`${config.className} ${sizeClasses[size]} gap-1`}>
      {showIcon && <Icon className="w-3 h-3" />}
      {config.label}
    </Badge>
  );
}
