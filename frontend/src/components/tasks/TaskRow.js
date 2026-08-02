/**
 * Task Row Component
 * Compact task display for grouped/collapsible view
 */

import React from 'react';
import { Badge } from '../ui/badge';
import { Building2 } from 'lucide-react';
import { TaskStatusBadges } from './StatusBadge';
import RoleBadge from './RoleBadge';
import { formatDueDate } from './utils';
import { useDateFormatter } from '../../hooks/useDateFormatter';

export default function TaskRow({ task }) {
  const { formatDateTime } = useDateFormatter();
  const dueInfo = formatDueDate(task);
  const isCompleted = task.status === 'completed';
  
  return (
    <div 
      className={`px-4 py-3 flex items-center justify-between hover:bg-stone-50 ${
        dueInfo.isOverdue && !isCompleted ? 'bg-red-50/50' : ''
      }`}
      data-testid={`task-row-${task.id}`}
    >
      <div className="flex items-center gap-4">
        {/* Period Label */}
        <div className="min-w-[100px]">
          <span className="text-sm font-medium">{task.period_label || 'N/A'}</span>
        </div>
        
        {/* Facility Badge */}
        {task.facility_name && (
          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 gap-1">
            <Building2 className="w-3 h-3" />
            {task.facility_name}
          </Badge>
        )}
        
        {/* Due Date */}
        <div className={`text-sm ${dueInfo.isOverdue && !isCompleted ? 'text-red-600' : dueInfo.isUrgent ? 'text-orange-600' : 'text-text-muted'}`}>
          Due: {task.due_at ? formatDateTime(task.due_at) : '-'}
        </div>
        
        {/* Overdue Badge - only show if NOT completed */}
        {dueInfo.isOverdue && !isCompleted && (
          <Badge className="bg-red-100 text-red-700 text-xs">Overdue</Badge>
        )}
        
        {/* User Role Badge */}
        {task.user_role && task.user_role !== 'editor' && (
          <RoleBadge role={task.user_role} size="sm" />
        )}
      </div>
      
      <div className="flex items-center gap-3">
        {/* Status Badges (operational + approval) */}
        <TaskStatusBadges task={task} />
        
        {/* Action buttons temporarily hidden - will be re-enabled with module redirect functionality */}
      </div>
    </div>
  );
}
