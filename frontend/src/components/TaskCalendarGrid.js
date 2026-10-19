/**
 * Task Calendar Grid Component
 * 
 * Displays generated reporting tasks in a visual calendar/grid format.
 * Shows task status, backfill indicators, and allows status updates.
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle,
  Calendar,
  Loader2,
  ChevronDown,
  ChevronUp,
  History,
  Play,
  Send,
  ThumbsUp,
  SkipForward,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

// Task status configuration
const STATUS_CONFIG = {
  backfill_pending: {
    bg: 'bg-amber-50',
    border: 'border-amber-300',
    text: 'text-amber-700',
    icon: History,
    label: 'Backfill Required',
    description: 'Historical period - data entry pending'
  },
  pending: {
    bg: 'bg-stone-50',
    border: 'border-stone-300',
    text: 'text-stone-600',
    icon: Clock,
    label: 'Pending',
    description: 'Awaiting data submission'
  },
  in_progress: {
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    text: 'text-blue-700',
    icon: Play,
    label: 'In Progress',
    description: 'Data entry in progress'
  },
  submitted: {
    bg: 'bg-purple-50',
    border: 'border-purple-300',
    text: 'text-purple-700',
    icon: Send,
    label: 'Submitted',
    description: 'Submitted for approval'
  },
  approved: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-300',
    text: 'text-emerald-700',
    icon: CheckCircle2,
    label: 'Approved',
    description: 'Data approved and finalized'
  },
  overdue: {
    bg: 'bg-red-50',
    border: 'border-red-400',
    text: 'text-red-700',
    icon: AlertTriangle,
    label: 'Overdue',
    description: 'Past due date - immediate action required'
  },
  skipped: {
    bg: 'bg-stone-100',
    border: 'border-stone-300',
    text: 'text-stone-500',
    icon: SkipForward,
    label: 'Skipped',
    description: 'Intentionally skipped'
  },
};

// Status transition options based on current status
const STATUS_TRANSITIONS = {
  backfill_pending: ['in_progress', 'submitted', 'skipped'],
  pending: ['in_progress', 'submitted', 'skipped'],
  in_progress: ['submitted', 'pending'],
  submitted: ['approved', 'in_progress'],
  approved: [],
  overdue: ['in_progress', 'submitted', 'skipped'],
  skipped: ['pending', 'in_progress'],
};

export default function TaskCalendarGrid({ 
  assignmentId,
  category,
  subcategory,
  onTaskUpdate,
  expanded = false,
  onToggle
}) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [summary, setSummary] = useState(null);
  const [isExpanded, setIsExpanded] = useState(expanded);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [skipReason, setSkipReason] = useState('');
  const [updating, setUpdating] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  // Fetch tasks for assignment
  const fetchTasks = useCallback(async () => {
    if (!assignmentId || !isExpanded) return;
    
    setLoading(true);
    try {
      const res = await axios.get(
        `${API}/api/esg-records/assignments/${assignmentId}/tasks`,
        { headers }
      );
      setTasks(res.data.tasks || []);
      
      // Calculate summary from tasks
      const taskList = res.data.tasks || [];
      const summaryData = {
        total: taskList.length,
        backfill_pending: taskList.filter(t => t.status === 'backfill_pending').length,
        pending: taskList.filter(t => t.status === 'pending').length,
        in_progress: taskList.filter(t => t.status === 'in_progress').length,
        submitted: taskList.filter(t => t.status === 'submitted').length,
        approved: taskList.filter(t => t.status === 'approved').length,
        overdue: taskList.filter(t => t.status === 'overdue').length,
        skipped: taskList.filter(t => t.status === 'skipped').length,
      };
      setSummary(summaryData);
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [assignmentId, isExpanded, token]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
    if (onToggle) onToggle(!isExpanded);
  };

  const openStatusModal = (task) => {
    setSelectedTask(task);
    setNewStatus('');
    setSkipReason('');
    setShowStatusModal(true);
  };

  const handleStatusUpdate = async () => {
    if (!selectedTask || !newStatus) return;
    
    setUpdating(true);
    try {
      const params = new URLSearchParams({ status: newStatus });
      if (newStatus === 'skipped' && skipReason) {
        params.append('reason', skipReason);
      }
      
      await axios.patch(
        `${API}/api/esg-records/tasks/${selectedTask.id}/status?${params}`,
        {},
        { headers }
      );
      
      toast.success(`Task updated to ${STATUS_CONFIG[newStatus]?.label || newStatus}`);
      setShowStatusModal(false);
      fetchTasks();
      if (onTaskUpdate) onTaskUpdate();
    } catch (error) {
      console.error('Failed to update task:', error);
      toast.error('Failed to update task status');
    } finally {
      setUpdating(false);
    }
  };

  const formatDueDate = (dueAt) => {
    if (!dueAt) return '-';
    try {
      const date = new Date(dueAt);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '-';
    }
  };

  if (!assignmentId) {
    return null;
  }

  return (
    <div className="mt-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggle}
        className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1"
      >
        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {isExpanded ? 'Hide Tasks' : 'Show Tasks'}
        {summary && (
          <span className="ml-2 text-stone-400">
            ({summary.total} tasks)
          </span>
        )}
      </Button>

      {isExpanded && (
        <div className="mt-3 p-4 bg-white border rounded-lg shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              <span className="ml-2 text-text-muted">Loading tasks...</span>
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-8 text-text-muted">
              <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No tasks generated yet</p>
              <p className="text-xs mt-1">Tasks are generated when you set a start date and frequency</p>
            </div>
          ) : (
            <>
              {/* Summary Stats */}
              {summary && (
                <div className="flex flex-wrap gap-2 mb-4 pb-3 border-b">
                  <Badge variant="outline" className="text-xs">
                    Total: {summary.total}
                  </Badge>
                  {summary.backfill_pending > 0 && (
                    <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-300">
                      <History className="w-3 h-3 mr-1" />
                      Backfill: {summary.backfill_pending}
                    </Badge>
                  )}
                  {summary.overdue > 0 && (
                    <Badge className="text-xs bg-red-100 text-red-700 border-red-300">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Overdue: {summary.overdue}
                    </Badge>
                  )}
                  {summary.pending > 0 && (
                    <Badge className="text-xs bg-stone-100 text-stone-600">
                      Pending: {summary.pending}
                    </Badge>
                  )}
                  {summary.in_progress > 0 && (
                    <Badge className="text-xs bg-blue-100 text-blue-700">
                      In Progress: {summary.in_progress}
                    </Badge>
                  )}
                  {summary.submitted > 0 && (
                    <Badge className="text-xs bg-purple-100 text-purple-700">
                      Submitted: {summary.submitted}
                    </Badge>
                  )}
                  {summary.approved > 0 && (
                    <Badge className="text-xs bg-emerald-100 text-emerald-700">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Approved: {summary.approved}
                    </Badge>
                  )}
                </div>
              )}

              {/* Task Grid */}
              <div className="grid grid-cols-7 sm:grid-cols-10 md:grid-cols-12 lg:grid-cols-14 xl:grid-cols-16 gap-1">
                <TooltipProvider>
                  {tasks.map((task) => {
                    const config = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
                    const Icon = config.icon;
                    
                    return (
                      <Tooltip key={task.id}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => openStatusModal(task)}
                            className={`
                              relative p-2 rounded-md border-2 transition-all
                              hover:shadow-md hover:scale-105 cursor-pointer
                              ${config.bg} ${config.border} ${config.text}
                              ${task.is_backfill ? 'opacity-80' : ''}
                            `}
                          >
                            <div className="text-center">
                              <Icon className="w-4 h-4 mx-auto mb-0.5" />
                              <div className="text-[10px] font-medium leading-tight truncate">
                                {task.period_label}
                              </div>
                            </div>
                            {task.is_backfill && (
                              <div className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full flex items-center justify-center">
                                <History className="w-2 h-2 text-white" />
                              </div>
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <div className="text-sm">
                            <p className="font-medium">{task.period_label}</p>
                            <p className="text-xs text-stone-500 mt-1">
                              Status: <span className={config.text}>{config.label}</span>
                            </p>
                            <p className="text-xs text-stone-500">
                              Due: {formatDueDate(task.due_at)}
                            </p>
                            {task.is_backfill && (
                              <p className="text-xs text-amber-600 mt-1">
                                ⚠️ Historical backfill required
                              </p>
                            )}
                            <p className="text-xs text-stone-400 mt-2">
                              Click to update status
                            </p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </TooltipProvider>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t">
                {Object.entries(STATUS_CONFIG).map(([status, config]) => {
                  const Icon = config.icon;
                  return (
                    <div key={status} className="flex items-center gap-1 text-xs">
                      <div className={`w-4 h-4 rounded ${config.bg} ${config.border} border flex items-center justify-center`}>
                        <Icon className={`w-2.5 h-2.5 ${config.text}`} />
                      </div>
                      <span className="text-stone-500">{config.label}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Status Update Modal */}
      <Dialog open={showStatusModal} onOpenChange={setShowStatusModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-600" />
              Update Task Status
            </DialogTitle>
            <DialogDescription>
              {selectedTask && (
                <div className="mt-2 p-3 bg-stone-50 rounded-lg">
                  <p className="font-medium text-text-primary">{selectedTask.period_label}</p>
                  <p className="text-sm text-stone-500 mt-1">
                    {category}{subcategory ? ` → ${subcategory}` : ''}
                  </p>
                  <p className="text-sm text-stone-500">
                    Due: {formatDueDate(selectedTask?.due_at)}
                  </p>
                  <div className="mt-2">
                    <Badge className={`text-xs ${STATUS_CONFIG[selectedTask.status]?.bg} ${STATUS_CONFIG[selectedTask.status]?.text}`}>
                      Current: {STATUS_CONFIG[selectedTask.status]?.label}
                    </Badge>
                  </div>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>New Status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Select new status" />
                </SelectTrigger>
                <SelectContent>
                  {selectedTask && STATUS_TRANSITIONS[selectedTask.status]?.map(status => {
                    const config = STATUS_CONFIG[status];
                    const Icon = config?.icon;
                    return (
                      <SelectItem key={status} value={status}>
                        <div className="flex items-center gap-2">
                          {Icon && <Icon className={`w-4 h-4 ${config.text}`} />}
                          <span>{config?.label || status}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {selectedTask && STATUS_TRANSITIONS[selectedTask.status]?.length === 0 && (
                <p className="text-xs text-stone-500">
                  This task cannot be updated (status is final)
                </p>
              )}
            </div>

            {newStatus === 'skipped' && (
              <div className="space-y-2">
                <Label>Reason for Skipping</Label>
                <Textarea
                  value={skipReason}
                  onChange={(e) => setSkipReason(e.target.value)}
                  placeholder="Enter reason for skipping this task..."
                  rows={3}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStatusModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleStatusUpdate}
              disabled={!newStatus || updating}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {updating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Status'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
