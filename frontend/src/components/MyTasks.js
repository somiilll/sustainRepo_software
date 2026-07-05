/**
 * My Tasks Component
 * 
 * Shows current user's (admin or regular user) pending assignments.
 * Can filter by entity type: 'record' (Metrics) or 'question' (Disclosures)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Progress } from './ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { 
  ClipboardList, 
  Search, 
  Calendar, 
  Clock, 
  AlertTriangle,
  CheckCircle2,
  Circle,
  ArrowRight,
  Loader2,
  FileText,
  BarChart3,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Layers
} from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * @param {string} entityType - 'record' for Metrics, 'question' for Disclosures, 'all' for both
 * @param {string} reportingPeriod - Current reporting period
 * @param {string} domain - 'environment' | 'social' | 'governance'
 * @param {string} framework - Optional framework filter (e.g., 'BRSR', 'GRI')
 */
export default function MyTasks({ entityType = 'all', reportingPeriod, domain, framework = null }) {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState({ questions: [], records: [] });
  const [stats, setStats] = useState({});
  const [expandedCategories, setExpandedCategories] = useState({});
  const [viewMode, setViewMode] = useState('grouped'); // 'grouped' or 'flat'
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    taskType: 'all' // 'all', 'backfill', 'current', 'future'
  });

  const headers = { Authorization: `Bearer ${token}` };

  // Group records by category with task type subgroups
  const groupedRecords = useMemo(() => {
    const groups = {};
    const now = new Date();
    
    for (const record of (assignments.records || [])) {
      const key = [record.category, record.subcategory].filter(Boolean).join(' › ');
      if (!groups[key]) {
        groups[key] = {
          category: record.category,
          subcategory: record.subcategory,
          backfill: [],
          current: [],
          future: [],
          total: 0,
          completed: 0,
          overdue: 0,
        };
      }
      
      // Categorize by task type
      if (record.is_backfill || record.task_type === 'backfill') {
        groups[key].backfill.push(record);
      } else if (record.task_type === 'future' || (record.period_start && new Date(record.period_start) > now)) {
        groups[key].future.push(record);
      } else {
        groups[key].current.push(record);
      }
      
      groups[key].total++;
      if (record.status === 'submitted' || record.status === 'approved') {
        groups[key].completed++;
      } else if (record.due_at && new Date(record.due_at) < now && !['submitted', 'approved'].includes(record.status)) {
        groups[key].overdue++;
      }
    }
    return Object.values(groups);
  }, [assignments.records]);

  const toggleCategory = (key) => {
    setExpandedCategories(prev => ({ ...prev, [key]: !prev[key] }))
  };

  // Fetch tasks (metric tasks from task engine)
  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch metric tasks
      const tasksRes = await axios.get(`${API}/api/esg-records/tasks/my-tasks`, {
        headers,
        params: { domain, include_backfill: true }
      });
      
      // Fetch question assignments (disclosures)
      let questions = [];
      if (entityType === 'question' || entityType === 'all') {
        try {
          const params = { reporting_period: reportingPeriod };
          if (domain && domain !== 'all') params.domain = domain;
          if (framework) params.framework = framework;
          
          const disclosuresRes = await axios.get(`${API}/api/tracking/my-disclosures`, {
            headers, params
          });
          questions = disclosuresRes.data.questions || [];
          if (framework && questions.length > 0) {
            questions = questions.filter(
              q => q.framework?.toLowerCase() === framework.toLowerCase()
            );
          }
        } catch (e) {
          console.error('Failed to fetch disclosures:', e);
        }
      }
      
      const tasks = tasksRes.data.tasks || [];
      
      setAssignments({
        questions,
        records: tasks
      });
      
      // Calculate stats from tasks
      const pending = tasks.filter(t => t.status === 'pending' || t.status === 'backfill_pending').length;
      const overdue = tasks.filter(t => t.due_at && new Date(t.due_at) < new Date() && !['submitted', 'approved'].includes(t.status)).length;
      const inProgress = tasks.filter(t => t.status === 'in_progress').length;
      
      setStats({
        total_questions: questions.length,
        total_records: tasks.length,
        overdue_count: overdue,
        pending_count: pending,
        in_progress_count: inProgress
      });
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [domain, framework, entityType, reportingPeriod, token]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  // Get items based on entityType filter
  const getFilteredItems = () => {
    let items = [];
    if (entityType === 'record' || entityType === 'all') {
      items = [...items, ...assignments.records];
    }
    if (entityType === 'question' || entityType === 'all') {
      items = [...items, ...assignments.questions];
    }
    
    const now = new Date();
    
    // Apply search and status filters
    return items.filter(item => {
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch = 
          item.category?.toLowerCase().includes(searchLower) ||
          item.subcategory?.toLowerCase().includes(searchLower) ||
          item.entity_id?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }
      
      if (filters.status !== 'all' && item.status !== filters.status) {
        return false;
      }
      
      // Task type filter
      if (filters.taskType !== 'all') {
        const isBackfill = item.is_backfill || item.task_type === 'backfill';
        const isFuture = item.task_type === 'future' || (item.period_start && new Date(item.period_start) > now);
        
        if (filters.taskType === 'backfill' && !isBackfill) return false;
        if (filters.taskType === 'future' && !isFuture) return false;
        if (filters.taskType === 'current' && (isBackfill || isFuture)) return false;
      }
      
      return true;
    });
  };

  const filteredItems = getFilteredItems();
  const now = new Date();
  
  // Count stats for display
  const displayStats = {
    total: entityType === 'record' ? stats.total_records : 
           entityType === 'question' ? stats.total_questions :
           (stats.total_records || 0) + (stats.total_questions || 0),
    pending: stats.pending_count || 0,
    in_progress: stats.in_progress_count || 0,
    overdue: stats.overdue_count || 0
  };

  // Status badge - only show for non-pending statuses
  const getStatusBadge = (status) => {
    const config = {
      submitted: { class: 'bg-purple-100 text-purple-700', icon: CheckCircle2, label: 'Submitted' },
      approved: { class: 'bg-green-100 text-green-700', icon: CheckCircle2, label: 'Completed' },
      rejected: { class: 'bg-red-100 text-red-700', icon: AlertTriangle, label: 'Rejected' },
      overdue: { class: 'bg-red-100 text-red-700', icon: AlertTriangle, label: 'Overdue' },
    };
    const cfg = config[status];
    if (!cfg) return null; // Don't show badge for pending/backfill_pending
    const Icon = cfg.icon;
    return (
      <Badge className={`${cfg.class} gap-1`}>
        <Icon className="w-3 h-3" />
        {cfg.label}
      </Badge>
    );
  };

  // Priority badge
  const getPriorityBadge = (priority) => {
    const config = {
      high: 'bg-red-100 text-red-700',
      medium: 'bg-orange-100 text-orange-700',
      low: 'bg-stone-100 text-stone-700',
    };
    return (
      <Badge className={config[priority] || config.medium}>
        {priority || 'Medium'}
      </Badge>
    );
  };

  // Navigate to fill the item
  const handleFillItem = (assignment) => {
    const itemDomain = assignment.domain || domain || 'environment';
    const framework = assignment.framework || 'BRSR';
    
    if (assignment.entity_type === 'question') {
      // Navigate to questionnaire
      navigate(`/esg/${itemDomain}?framework=${framework}&question=${assignment.entity_id}`);
    } else {
      // Navigate to Add Metric form within the domain page
      const params = new URLSearchParams();
      params.set('tab', 'metrics');
      params.set('subtab', 'add-metric');
      if (assignment.category) params.set('category', assignment.category);
      if (assignment.subcategory) params.set('subcategory', assignment.subcategory);
      if (assignment.filling_frequency) params.set('frequency', assignment.filling_frequency);
      // Pass period info for pre-filling the date - extract just YYYY-MM-DD
      if (assignment.period_start) {
        const dateOnly = assignment.period_start.split('T')[0].split(' ')[0];
        params.set('period_start', dateOnly);
      }
      navigate(`/${itemDomain}?${params.toString()}`);
    }
  };

  // Format due date - handles both due_date and due_at fields
  const formatDueDate = (assignment) => {
    const dateStr = assignment.due_at || assignment.due_date;
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
    
    const formatted = date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
    
    // Add time if available
    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const fullFormatted = `${formatted}, ${time}`;
    
    if (diffDays < 0) {
      return <span className="text-red-600 font-medium">{fullFormatted} (Overdue)</span>;
    } else if (diffDays <= 7) {
      return <span className="text-orange-600 font-medium">{fullFormatted} ({diffDays}d left)</span>;
    }
    return fullFormatted;
  };

  // Format period range for display
  const formatPeriodRange = (assignment) => {
    if (!assignment.period_start) return null;
    const start = new Date(assignment.period_start);
    const end = assignment.period_end ? new Date(assignment.period_end) : start;
    
    const formatOpts = { month: 'short', day: 'numeric' };
    if (start.getTime() === end.getTime()) {
      return start.toLocaleDateString('en-US', formatOpts);
    }
    return `${start.toLocaleDateString('en-US', formatOpts)} - ${end.toLocaleDateString('en-US', formatOpts)}`;
  };

  // Render assignment card
  const renderAssignmentCard = (assignment) => {
    const dueAt = assignment.due_at || assignment.due_date;
    const isOverdue = dueAt && new Date(dueAt) < now && 
                      !['approved', 'submitted'].includes(assignment.status);
    const periodRange = formatPeriodRange(assignment);
    
    return (
      <Card 
        key={assignment.id} 
        className={`p-4 hover:shadow-md transition-shadow ${isOverdue ? 'border-red-200 bg-red-50/30' : ''}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Header - Badges */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {assignment.entity_type === 'question' ? (
                <>
                  <Badge variant="outline" className="text-xs">
                    {assignment.framework || 'BRSR'}
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
              {/* Backfill badge */}
              {assignment.is_backfill && (
                <Badge className="text-xs bg-amber-100 text-amber-700">
                  Backfill
                </Badge>
              )}
              {/* Frequency badge */}
              {assignment.filling_frequency && (
                <Badge variant="outline" className="text-xs">
                  {assignment.filling_frequency}
                </Badge>
              )}
            </div>
            
            {/* Category/Subcategory or Question Key */}
            <h4 className="font-medium text-text-primary mb-1">
              {assignment.category ? (
                <span>{assignment.category} {assignment.subcategory && `› ${assignment.subcategory}`}</span>
              ) : (
                assignment.entity_id
              )}
            </h4>
            
            {/* Period info */}
            {periodRange && (
              <div className="text-sm text-text-muted mb-1">
                <span className="font-medium">Period:</span> {periodRange}
              </div>
            )}
            
            {/* Meta info - Due date */}
            <div className="flex flex-wrap items-center gap-3 text-sm text-text-muted">
              <div className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>Due: {formatDueDate(assignment)}</span>
              </div>
            </div>
            
            {/* Assignment duration info */}
            {(assignment.assignment_start_date || assignment.assignment_end_date) && (
              <div className="text-xs text-text-muted mt-1">
                Assignment: {assignment.assignment_start_date ? new Date(assignment.assignment_start_date).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}) : '?'} 
                {' → '} 
                {assignment.assignment_end_date ? new Date(assignment.assignment_end_date).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}) : 'Ongoing'}
              </div>
            )}
          </div>
          
          {/* Right side - Status & Actions */}
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              {getStatusBadge(assignment.status)}
            </div>
            
            <Button
              size="sm"
              onClick={() => handleFillItem(assignment)}
              className="bg-emerald-600 hover:bg-emerald-700 gap-1"
              data-testid={`fill-${assignment.id}`}
            >
              Fill Now
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    );
  };

  // Compact task row for collapsible grouped view
  const renderCompactTaskRow = (task) => {
    const dueAt = task.due_at;
    const isOverdue = dueAt && new Date(dueAt) < now && !['submitted', 'approved'].includes(task.status);
    
    return (
      <div 
        key={task.id} 
        className={`px-4 py-3 flex items-center justify-between hover:bg-stone-50 ${isOverdue ? 'bg-red-50/50' : ''}`}
      >
        <div className="flex items-center gap-4">
          <div className="min-w-[100px]">
            <span className="text-sm font-medium">{task.period_label || 'N/A'}</span>
          </div>
          <div className="text-sm text-text-muted">
            Due: {dueAt ? new Date(dueAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-'}
          </div>
          {isOverdue && (
            <Badge className="bg-red-100 text-red-700 text-xs">Overdue</Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          {getStatusBadge(task.status)}
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleFillItem(task)}
            className="gap-1"
          >
            Fill
            <ArrowRight className="w-3 h-3" />
          </Button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-2xl font-bold text-text-primary">{displayStats.total}</div>
          <div className="text-sm text-text-muted">
            {entityType === 'record' ? 'Metrics' : entityType === 'question' ? 'Disclosures' : 'Total Tasks'}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-yellow-600">{displayStats.pending}</div>
          <div className="text-sm text-text-muted">Pending</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-blue-600">{displayStats.in_progress}</div>
          <div className="text-sm text-text-muted">In Progress</div>
        </Card>
        <Card className="p-4 border-red-200">
          <div className="text-2xl font-bold text-red-600">{displayStats.overdue}</div>
          <div className="text-sm text-text-muted">Overdue</div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <Input
                placeholder="Search tasks..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                className="pl-10"
              />
            </div>
          </div>
          
          <Select value={filters.status} onValueChange={(v) => setFilters(prev => ({ ...prev, status: v }))}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="approved">Completed</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={filters.taskType} onValueChange={(v) => setFilters(prev => ({ ...prev, taskType: v }))}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Task Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tasks</SelectItem>
              <SelectItem value="current">Current</SelectItem>
              <SelectItem value="backfill">Backfill</SelectItem>
              <SelectItem value="future">Future</SelectItem>
            </SelectContent>
          </Select>
          
          <Button 
            variant="outline" 
            size="icon"
            onClick={fetchAssignments}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </Card>

      {/* Grouped View - Collapsible Categories */}
      {viewMode === 'grouped' && entityType === 'record' && (
        <div className="space-y-3">
          {groupedRecords.length === 0 ? (
            <Card className="p-8 text-center">
              <ClipboardList className="w-12 h-12 text-stone-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-text-primary">No metric tasks found</h3>
              <p className="text-text-muted">You do not have any metric tasks assigned.</p>
            </Card>
          ) : (
            groupedRecords.map((group) => {
              const key = [group.category, group.subcategory].filter(Boolean).join(' › ');
              const isExpanded = expandedCategories[key];
              const progress = group.total > 0 ? Math.round((group.completed / group.total) * 100) : 0;
              
              // Filter tasks based on taskType filter
              let tasksToShow = [];
              if (filters.taskType === 'all') {
                tasksToShow = [...group.backfill, ...group.current, ...group.future];
              } else if (filters.taskType === 'backfill') {
                tasksToShow = group.backfill;
              } else if (filters.taskType === 'current') {
                tasksToShow = group.current;
              } else if (filters.taskType === 'future') {
                tasksToShow = group.future;
              }
              
              // Apply search filter
              if (filters.search) {
                const searchLower = filters.search.toLowerCase();
                if (!group.category?.toLowerCase().includes(searchLower) && 
                    !group.subcategory?.toLowerCase().includes(searchLower)) {
                  tasksToShow = tasksToShow.filter(t => 
                    t.period_label?.toLowerCase().includes(searchLower)
                  );
                  if (tasksToShow.length === 0) return null;
                }
              }
              
              if (tasksToShow.length === 0) return null;
              
              return (
                <Card key={key} className="overflow-hidden">
                  {/* Category Header - Collapsible */}
                  <div 
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-stone-50 transition-colors"
                    onClick={() => toggleCategory(key)}
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-stone-400" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-stone-400" />
                      )}
                      <div>
                        <h3 className="font-medium text-text-primary">{key}</h3>
                        <div className="flex items-center gap-3 text-sm text-text-muted mt-1">
                          <span>{tasksToShow.length} tasks</span>
                          {group.backfill.length > 0 && (
                            <Badge className="bg-amber-100 text-amber-700 text-xs">{group.backfill.length} backfill</Badge>
                          )}
                          {group.overdue > 0 && (
                            <Badge className="bg-red-100 text-red-700 text-xs">{group.overdue} overdue</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-32">
                        <div className="flex justify-between text-xs text-text-muted mb-1">
                          <span>Progress</span>
                          <span>{progress}%</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                      </div>
                    </div>
                  </div>
                  
                  {/* Expanded Tasks */}
                  {isExpanded && (
                    <div className="border-t border-stone-100">
                      {/* Backfill Tasks */}
                      {group.backfill.length > 0 && (filters.taskType === 'all' || filters.taskType === 'backfill') && (
                        <div className="bg-amber-50/50">
                          <div className="px-4 py-2 text-xs font-medium text-amber-700 border-b border-amber-100">
                            Backfill Tasks ({group.backfill.length})
                          </div>
                          <div className="divide-y divide-stone-100">
                            {group.backfill.map(task => renderCompactTaskRow(task))}
                          </div>
                        </div>
                      )}
                      
                      {/* Current Tasks */}
                      {group.current.length > 0 && (filters.taskType === 'all' || filters.taskType === 'current') && (
                        <div>
                          <div className="px-4 py-2 text-xs font-medium text-emerald-700 border-b border-stone-100 bg-emerald-50/50">
                            Current Tasks ({group.current.length})
                          </div>
                          <div className="divide-y divide-stone-100">
                            {group.current.map(task => renderCompactTaskRow(task))}
                          </div>
                        </div>
                      )}
                      
                      {/* Future Tasks */}
                      {group.future.length > 0 && (filters.taskType === 'all' || filters.taskType === 'future') && (
                        <div className="bg-blue-50/30">
                          <div className="px-4 py-2 text-xs font-medium text-blue-700 border-b border-blue-100">
                            Future Tasks ({group.future.length})
                          </div>
                          <div className="divide-y divide-stone-100">
                            {group.future.map(task => renderCompactTaskRow(task))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Flat View - Original Card Layout */}
      {(viewMode === 'flat' || entityType !== 'record') && (
      <div className="space-y-3">
        {filteredItems.length === 0 ? (
          <Card className="p-8 text-center">
            <ClipboardList className="w-12 h-12 text-stone-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-text-primary">No tasks found</h3>
            <p className="text-text-muted">
              {entityType === 'record' 
                ? 'You do not have any metric tasks assigned.' 
                : entityType === 'question'
                ? 'You do not have any disclosure tasks assigned.'
                : 'You do not have any tasks assigned for this period.'}
            </p>
          </Card>
        ) : (
          filteredItems.map(renderAssignmentCard)
        )}
      </div>
      )}
    </div>
  );
}
