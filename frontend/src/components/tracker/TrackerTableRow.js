/**
 * Tracker Table Row Component
 * Renders a single category/subcategory row with assignees and actions
 */

import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { TableCell, TableRow } from '../ui/table';
import { 
  ChevronRight, 
  ChevronDown, 
  Layers, 
  UserPlus, 
  Bell,
  CalendarCheck
} from 'lucide-react';
import AssigneeDisplay from './AssigneeDisplay';
import CategoryStatusBadge from './CategoryStatusBadge';
import { getAssignmentInfo, getCategoryStatus } from './utils';

const API = process.env.REACT_APP_BACKEND_URL;

const PERIOD_STATUS_COLORS = {
  completed: 'bg-green-500',
  skipped: 'bg-stone-400',
  in_progress: 'bg-blue-400',
  overdue: 'bg-red-500',
  pending: 'bg-stone-200',
  backfill_pending: 'bg-amber-300',
};

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
  const { token } = useAuth();
  const [periodExpanded, setPeriodExpanded] = useState(false);
  const [periodData, setPeriodData] = useState(null);
  const [periodLoading, setPeriodLoading] = useState(false);

  const loadPeriodData = async () => {
    if (!assignment?.id || periodData) { setPeriodExpanded(p => !p); return; }
    setPeriodLoading(true);
    try {
      const res = await axios.get(`${API}/api/esg-records/tasks/period-status/${assignment.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPeriodData(res.data);
    } catch (e) { /* silent */ }
    setPeriodLoading(false);
    setPeriodExpanded(true);
  };
  
  // Get completion stats key (now from progress engine)
  const completionKey = [category, subcategory, sub_subcategory].filter(Boolean).join('|');
  const completion = completionStats[completionKey] || {};
  const completionPct = Math.round(completion.progress_percentage || 0);
  const totalTasks = completion.total_tasks || 0;
  const completedTasks = completion.completed_tasks || 0;
  const pendingTasks = completion.pending_tasks || 0;
  const overdueTasks = completion.overdue_tasks || 0;
  const lastUpdated = completion.last_updated || assignment?.updated_at;
  
  // Get assignment info
  const assignmentInfo = getAssignmentInfo(assignments, categories, category, subcategory);
  const status = getCategoryStatus(assignmentInfo, { completed: completedTasks, total: totalTasks });
  
  // Display name
  const displayName = sub_subcategory || subcategory || category;
  
  // Indentation based on level
  const paddingLeft = level === 0 ? '' : level === 1 ? 'pl-12' : 'pl-20';
  const bgClass = level === 0 ? 'bg-stone-50 hover:bg-stone-100' : level === 2 ? 'bg-stone-25' : 'bg-white hover:bg-stone-50';
  
  return (
    <>
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
      
      {/* Progress Bar */}
      <TableCell>
        {totalTasks > 0 ? (
          <div 
            className="cursor-help"
            title={`Completed: ${completedTasks}\nPending: ${pendingTasks}\nOverdue: ${overdueTasks}`}
          >
            <div className="flex items-center gap-2 min-w-[140px]">
              <Progress value={completionPct} className="h-2 flex-1" />
              <span className="text-xs text-text-muted whitespace-nowrap">
                {completionPct}%
              </span>
            </div>
            <div className="text-xs text-text-muted mt-0.5">
              {completedTasks} / {totalTasks} Tasks
            </div>
          </div>
        ) : (
          <span className="text-xs text-text-muted">-</span>
        )}
      </TableCell>
      
      {/* Last Updated with date and time */}
      <TableCell>
        {lastUpdated ? (
          <span className="text-xs text-text-muted">
            {new Date(lastUpdated).toLocaleDateString('en-IN', { 
              day: '2-digit', 
              month: 'short', 
              year: 'numeric' 
            })}, {new Date(lastUpdated).toLocaleTimeString('en-IN', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            })}
          </span>
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
          {assignment && (
            <Button
              variant="ghost"
              size="sm"
              onClick={loadPeriodData}
              title="View period fill status"
              className={periodExpanded ? 'text-emerald-600' : ''}
            >
              {periodLoading ? <div className="w-4 h-4 animate-spin rounded-full border-2 border-stone-300 border-t-emerald-600" /> : <CalendarCheck className="w-4 h-4" />}
            </Button>
          )}
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
    {/* Period Fill Status Expandable */}
    {periodExpanded && periodData && (
      <TableRow>
        <TableCell colSpan={8} className="bg-stone-50/50 px-8 py-3">
          <div className="space-y-2">
            <div className="flex items-center gap-4 text-xs text-text-muted">
              <span>Filled: <strong className="text-green-600">{periodData.filled}</strong></span>
              <span>Overdue: <strong className="text-red-600">{periodData.overdue}</strong></span>
              <span>Pending: <strong>{periodData.pending}</strong></span>
              <span>Total: {periodData.total_periods}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {(periodData.periods || []).map(p => (
                <div
                  key={p.period_key}
                  title={`${p.period_label}: ${p.status}${p.is_overdue ? ' (overdue)' : ''}`}
                  className={`w-7 h-7 rounded text-[9px] flex items-center justify-center font-medium text-white cursor-default ${
                    p.is_overdue ? PERIOD_STATUS_COLORS.overdue : PERIOD_STATUS_COLORS[p.status] || PERIOD_STATUS_COLORS.pending
                  } ${p.status === 'pending' ? '!text-stone-500' : ''}`}
                >
                  {p.period_label.split(' ')[0]?.substring(0, 3) || p.period_key.slice(-2)}
                </div>
              ))}
            </div>
            <div className="flex gap-3 text-[10px] text-text-muted">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-green-500 inline-block" /> Filled</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-500 inline-block" /> Overdue</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-stone-200 inline-block" /> Pending</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-300 inline-block" /> Backfill</span>
            </div>
          </div>
        </TableCell>
      </TableRow>
    )}
    </>
  );
}
