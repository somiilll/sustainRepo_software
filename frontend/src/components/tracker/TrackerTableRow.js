/**
 * Tracker Table Row Component
 * Renders a single category/subcategory row with assignees and actions
 */

import React from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { TableCell, TableRow } from '../ui/table';
import { 
  ChevronRight, 
  ChevronDown, 
  Layers, 
  UserPlus, 
  Bell 
} from 'lucide-react';
import AssigneeDisplay from './AssigneeDisplay';
import CategoryStatusBadge from './CategoryStatusBadge';
import { getAssignmentInfo, getCategoryStatus } from './utils';

export default function TrackerTableRow({
  item,
  level = 0, // 0 = category, 1 = subcategory, 2 = sub-subcategory
  isExpanded,
  onToggle,
  assignments,
  categories,
  completionStats,
  onAssign,
  onRemind,
  showExpander = true,
}) {
  const { category, subcategory, sub_subcategory, assignment } = item;
  
  // Get completion stats key
  const completionKey = [category, subcategory, sub_subcategory].filter(Boolean).join('|');
  const completion = completionStats[completionKey] || {};
  const completionPct = Math.round(completion.completion_pct || 0);
  const totalTasks = completion.total || 0;
  const completedTasks = completion.completed || 0;
  
  // Get assignment info
  const assignmentInfo = getAssignmentInfo(assignments, categories, category, subcategory);
  const status = getCategoryStatus(assignmentInfo, { completed: completedTasks, total: totalTasks });
  
  // Display name
  const displayName = sub_subcategory || subcategory || category;
  
  // Indentation based on level
  const paddingLeft = level === 0 ? '' : level === 1 ? 'pl-12' : 'pl-20';
  const bgClass = level === 0 ? 'bg-stone-50 hover:bg-stone-100' : level === 2 ? 'bg-stone-25' : 'bg-white hover:bg-stone-50';
  
  return (
    <TableRow className={bgClass}>
      {/* Category Name */}
      <TableCell className={paddingLeft}>
        <div className="flex items-center gap-2">
          {showExpander && level < 2 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              className="p-1 h-6 w-6"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </Button>
          )}
          {level === 0 && <Layers className="w-4 h-4 text-emerald-600" />}
          <span className={level === 0 ? 'font-medium' : level === 2 ? 'text-sm text-text-muted' : 'text-text-secondary'}>
            {displayName}
          </span>
        </div>
      </TableCell>
      
      {/* Level */}
      <TableCell>
        <Badge variant="outline" className="text-xs">
          {assignment?.assignment_level === 'facility' ? 'Facility' : 'Org'}
        </Badge>
      </TableCell>
      
      {/* Facility */}
      <TableCell>
        {assignment?.facility_name || '-'}
      </TableCell>
      
      {/* Assigned To */}
      <TableCell>
        <AssigneeDisplay 
          assignees={assignmentInfo.assignees}
          isPartiallyAssigned={assignmentInfo.isPartiallyAssigned && level === 0}
          showRoles={true}
        />
      </TableCell>
      
      {/* Frequency */}
      <TableCell>
        {assignment?.filling_frequency || '-'}
      </TableCell>
      
      {/* Completion */}
      <TableCell>
        {totalTasks > 0 ? (
          <div className="flex items-center gap-2 min-w-[120px]">
            <Progress value={completionPct} className="h-2 flex-1" />
            <span className="text-xs text-text-muted whitespace-nowrap">
              {completedTasks}/{totalTasks}
            </span>
          </div>
        ) : (
          <span className="text-xs text-text-muted">-</span>
        )}
      </TableCell>
      
      {/* Status */}
      <TableCell>
        <CategoryStatusBadge status={status} />
      </TableCell>
      
      {/* Actions */}
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAssign(item)}
            title={assignment ? "Edit Assignment" : "Assign"}
          >
            <UserPlus className="w-4 h-4" />
          </Button>
          {assignment && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemind(assignment.id)}
              title="Send Reminder"
            >
              <Bell className="w-4 h-4" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
