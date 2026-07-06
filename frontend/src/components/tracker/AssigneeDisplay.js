/**
 * Assignee Display Component
 * Shows assignees with role badges and multi-user support
 */

import React from 'react';
import { Badge } from '../ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Users } from 'lucide-react';
import { RoleBadge } from '../tasks';

export default function AssigneeDisplay({ 
  assignees = [], 
  isPartiallyAssigned = false,
  showRoles = true,
  maxDisplay = 1,
  compact = false 
}) {
  // Partially assigned parent category
  if (isPartiallyAssigned) {
    return (
      <span className="text-amber-600 italic text-sm">Partially Assigned</span>
    );
  }
  
  // No assignees
  if (assignees.length === 0) {
    return (
      <span className="text-text-muted italic text-sm">Unassigned</span>
    );
  }
  
  // Single assignee
  if (assignees.length === 1) {
    const assignee = assignees[0];
    return (
      <div className={`flex ${compact ? 'items-center gap-2' : 'flex-col'}`}>
        <span className={compact ? 'text-sm' : ''}>{assignee.name || assignee.email || 'Unknown'}</span>
        {!compact && assignee.email && (
          <span className="text-xs text-text-muted">{assignee.email}</span>
        )}
        {showRoles && assignee.role && assignee.role !== 'editor' && (
          <RoleBadge role={assignee.role} size="sm" showIcon={false} />
        )}
      </div>
    );
  }
  
  // Multiple assignees
  const displayedAssignees = assignees.slice(0, maxDisplay);
  const remainingCount = assignees.length - maxDisplay;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 cursor-pointer">
            <Users className="w-4 h-4 text-text-muted" />
            <div className="flex flex-col">
              <span className="text-sm">
                {displayedAssignees[0].name || displayedAssignees[0].email}
                {remainingCount > 0 && (
                  <span className="text-text-muted ml-1">
                    + {remainingCount} other{remainingCount > 1 ? 's' : ''}
                  </span>
                )}
              </span>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="p-0">
          <div className="py-2 px-1 max-w-[250px]">
            <div className="text-xs font-medium text-text-muted px-2 pb-1 border-b mb-1">
              {assignees.length} Assignee{assignees.length > 1 ? 's' : ''}
            </div>
            {assignees.map((assignee, idx) => (
              <div 
                key={assignee.id || idx} 
                className="flex items-center justify-between gap-3 px-2 py-1.5 hover:bg-stone-50"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {assignee.name || 'Unknown'}
                  </span>
                  {assignee.email && (
                    <span className="text-xs text-text-muted">{assignee.email}</span>
                  )}
                </div>
                {showRoles && assignee.role && (
                  <RoleBadge role={assignee.role} size="sm" showIcon={false} />
                )}
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
