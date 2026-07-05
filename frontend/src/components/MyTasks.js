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
    priority: 'all'
  });

  const headers = { Authorization: `Bearer ${token}` };

  // Group records by category for grouped view
  const groupedRecords = useMemo(() => {
    const groups = {};
    for (const record of (assignments.records || [])) {
      const key = [record.category, record.subcategory, record.sub_subcategory].filter(Boolean).join(' / ');
      if (!groups[key]) {
        groups[key] = {
          category: record.category,
          subcategory: record.subcategory,
          sub_subcategory: record.sub_subcategory,
          items: [],
          total: 0,
          completed: 0,
          overdue: 0,
          pending: 0,
        };
      }
      groups[key].items.push(record);
      groups[key].total++;
      if (record.status === 'submitted' || record.status === 'approved') {
        groups[key].completed++;
      } else if (record.status === 'overdue') {
        groups[key].overdue++;
      } else {
        groups[key].pending++;
      }
    }
    return Object.values(groups);
  }, [assignments.records]);

  const toggleCategory = (key) => {
    setExpandedCategories(prev => ({ ...prev, [key]: !prev[key] }))
  };

  // Fetch assignments
  const fetchAssignments = useCallback(async () => {
    if (!reportingPeriod) return;
    
    setLoading(true);
    try {
      const params = { reporting_period: reportingPeriod };
      if (domain && domain !== 'all') {
        params.domain = domain;
      }
      if (framework) {
        params.framework = framework;
      }
      
      const res = await axios.get(`${API}/api/tracking/my-disclosures`, {
        headers,
        params
      });
      
      // Apply framework filter client-side if needed (backup)
      let questions = res.data.questions || [];
      if (framework && questions.length > 0) {
        questions = questions.filter(
          q => q.framework?.toLowerCase() === framework.toLowerCase()
        );
      }
      
      setAssignments({
        questions,
        records: res.data.records || []
      });
      setStats({
        total_questions: framework ? questions.length : (res.data.total_questions || 0),
        total_records: res.data.total_records || 0,
        overdue_count: res.data.overdue_count || 0,
        pending_count: res.data.pending_count || 0,
        in_progress_count: res.data.in_progress_count || 0
      });
    } catch (error) {
      console.error('Failed to fetch assignments:', error);
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [reportingPeriod, domain, framework, token]);

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
    
    // Apply search and status filters
    return items.filter(item => {
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch = 
          item.entity_id?.toLowerCase().includes(searchLower) ||
          item.framework?.toLowerCase().includes(searchLower) ||
          item.domain?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }
      
      if (filters.status !== 'all' && item.status !== filters.status) {
        return false;
      }
      
      if (filters.priority !== 'all' && item.priority !== filters.priority) {
        return false;
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

  // Status badge
  const getStatusBadge = (status) => {
    const config = {
      pending: { class: 'bg-yellow-100 text-yellow-700', icon: Circle, label: 'Pending' },
      in_progress: { class: 'bg-blue-100 text-blue-700', icon: Clock, label: 'In Progress' },
      submitted: { class: 'bg-purple-100 text-purple-700', icon: CheckCircle2, label: 'Submitted' },
      approved: { class: 'bg-green-100 text-green-700', icon: CheckCircle2, label: 'Approved' },
      rejected: { class: 'bg-red-100 text-red-700', icon: AlertTriangle, label: 'Rejected' },
    };
    const cfg = config[status] || config.pending;
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
      navigate(`/${itemDomain}?${params.toString()}`);
    }
  };

  // Format due date
  const formatDueDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
    
    const formatted = date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
    
    if (diffDays < 0) {
      return <span className="text-red-600 font-medium">{formatted} (Overdue)</span>;
    } else if (diffDays <= 7) {
      return <span className="text-orange-600 font-medium">{formatted} ({diffDays}d left)</span>;
    }
    return formatted;
  };

  // Render assignment card
  const renderAssignmentCard = (assignment) => {
    const isOverdue = assignment.due_date && new Date(assignment.due_date) < now && 
                      !['approved', 'submitted'].includes(assignment.status);
    
    return (
      <Card 
        key={assignment.id} 
        className={`p-4 hover:shadow-md transition-shadow ${isOverdue ? 'border-red-200 bg-red-50/30' : ''}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 mb-2">
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
            </div>
            
            {/* Entity ID / Question Key */}
            <h4 className="font-medium text-text-primary truncate mb-1">
              {assignment.entity_id}
            </h4>
            
            {/* Meta info */}
            <div className="flex flex-wrap items-center gap-3 text-sm text-text-muted">
              <div className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>Due: {formatDueDate(assignment.due_date)}</span>
              </div>
              {assignment.filling_frequency && (
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{assignment.filling_frequency}</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Right side - Status & Actions */}
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              {getPriorityBadge(assignment.priority)}
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
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={filters.priority} onValueChange={(v) => setFilters(prev => ({ ...prev, priority: v }))}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
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

      {/* Task List */}
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
    </div>
  );
}
