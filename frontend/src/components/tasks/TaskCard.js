/**
 * Task Card Component
 * Full task display with all details
 */

import React from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Calendar, ArrowRight, FileText, BarChart3, Eye } from 'lucide-react';
import { TaskStatusBadges } from './StatusBadge';
import RoleBadge from './RoleBadge';
import { formatDueDate, formatPeriodRange, canUserEdit } from './utils';
import { ENTITY_TYPE } from './constants';

export default function TaskCard({ task, onFill, onView }) {
  const dueInfo = formatDueDate(task);
  const periodRange = formatPeriodRange(task);
  const userCanEdit = canUserEdit(task);
  const isQuestion = task.entity_type === 'question';
  
  return (
    <Card 
      className={`p-4 hover:shadow-md transition-shadow ${
        dueInfo.isOverdue ? 'border-red-200 bg-red-50/30' : ''
      }`}
      data-testid={`task-card-${task.id}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Header Badges */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {isQuestion ? (
              <>
                <Badge variant="outline" className="text-xs">
                  {task.framework || 'BRSR'}
                </Badge>
                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700">
                  <FileText className="w-3 h-3 mr-1" /> Disclosure
                </Badge>
              </>
            ) : (
              <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700">
                <BarChart3 className="w-3 h-3 mr-1" /> Metric
              </Badge>
            )}
            
            {/* Backfill Badge */}
            {task.is_backfill && (
              <Badge className="text-xs bg-amber-100 text-amber-700">
                Backfill
              </Badge>
            )}
            
            {/* Frequency Badge */}
            {task.filling_frequency && (
              <Badge variant="outline" className="text-xs">
                {task.filling_frequency}
              </Badge>
            )}
            
            {/* User Role Badge */}
            {task.user_role && (
              <RoleBadge role={task.user_role} size="sm" />
            )}
          </div>
          
          {/* Category/Subcategory */}
          <h4 className="font-medium text-text-primary mb-1">
            {task.category ? (
              <span>
                {task.category} 
                {task.subcategory && ` › ${task.subcategory}`}
              </span>
            ) : (
              task.entity_id
            )}
          </h4>
          
          {/* Period Info */}
          {periodRange && (
            <div className="text-sm text-text-muted mb-1">
              <span className="font-medium">Period:</span> {periodRange}
            </div>
          )}
          
          {/* Due Date */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-text-muted">
            <div className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <span className={dueInfo.isOverdue ? 'text-red-600 font-medium' : dueInfo.isUrgent ? 'text-orange-600 font-medium' : ''}>
                Due: {dueInfo.text}
              </span>
            </div>
          </div>
          
          {/* Assignment Duration */}
          {(task.assignment_start_date || task.assignment_end_date) && (
            <div className="text-xs text-text-muted mt-1">
              Assignment: {task.assignment_start_date 
                ? new Date(task.assignment_start_date).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric'
                  }) 
                : '?'} 
              {' → '} 
              {task.assignment_end_date 
                ? new Date(task.assignment_end_date).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric'
                  }) 
                : 'Ongoing'}
            </div>
          )}
        </div>
        
        {/* Right Side - Status & Actions */}
        <div className="flex flex-col items-end gap-2">
          <TaskStatusBadges task={task} />
          
          {userCanEdit ? (
            <Button
              size="sm"
              onClick={() => onFill(task)}
              className="bg-emerald-600 hover:bg-emerald-700 gap-1"
              data-testid={`task-fill-btn-${task.id}`}
            >
              Fill Now
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onView?.(task)}
              className="gap-1"
              data-testid={`task-view-btn-${task.id}`}
            >
              <Eye className="w-4 h-4" />
              View
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
