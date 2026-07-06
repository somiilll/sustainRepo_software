/**
 * Task Row Component
 * Compact task display for grouped/collapsible view
 */

import React from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ArrowRight, Eye } from 'lucide-react';
import { TaskStatusBadges } from './StatusBadge';
import RoleBadge from './RoleBadge';
import { formatDueDate, canUserEdit } from './utils';

export default function TaskRow({ task, onFill, onView }) {
  const dueInfo = formatDueDate(task);
  const userCanEdit = canUserEdit(task);
  
  return (
    <div 
      className={`px-4 py-3 flex items-center justify-between hover:bg-stone-50 ${
        dueInfo.isOverdue ? 'bg-red-50/50' : ''
      }`}
      data-testid={`task-row-${task.id}`}
    >
      <div className="flex items-center gap-4">
        {/* Period Label */}
        <div className="min-w-[100px]">
          <span className="text-sm font-medium">{task.period_label || 'N/A'}</span>
        </div>
        
        {/* Due Date */}
        <div className={`text-sm ${dueInfo.isOverdue ? 'text-red-600' : dueInfo.isUrgent ? 'text-orange-600' : 'text-text-muted'}`}>
          Due: {task.due_at 
            ? new Date(task.due_at).toLocaleString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                hour: 'numeric', 
                minute: '2-digit' 
              }) 
            : '-'}
        </div>
        
        {/* Overdue Badge */}
        {dueInfo.isOverdue && (
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
        
        {/* Action Button */}
        {userCanEdit ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onFill(task)}
            className="gap-1"
            data-testid={`task-fill-btn-${task.id}`}
          >
            Fill
            <ArrowRight className="w-3 h-3" />
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onView?.(task)}
            className="gap-1 text-stone-500"
            data-testid={`task-view-btn-${task.id}`}
          >
            <Eye className="w-3 h-3" />
            View
          </Button>
        )}
      </div>
    </div>
  );
}
