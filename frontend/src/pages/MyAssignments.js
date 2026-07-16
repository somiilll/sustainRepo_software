import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  ClipboardList, 
  Search, 
  Filter, 
  Calendar, 
  Clock, 
  AlertTriangle,
  CheckCircle2,
  Circle,
  ArrowRight,
  Loader2,
  FileText,
  BarChart3,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { getCurrentReportingYear, generateReportingYears } from '../utils/reportingYearUtils';

const API = process.env.REACT_APP_BACKEND_URL;

export default function MyAssignments() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState({ questions: [], records: [] });
  const [stats, setStats] = useState({});
  const [activeTab, setActiveTab] = useState('all');
  const [reportingPeriod, setReportingPeriod] = useState('');
  const [reportingYears, setReportingYears] = useState([]);
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    priority: 'all',
    domain: 'all'
  });

  const headers = { Authorization: `Bearer ${token}` };

  // Initialize reporting years
  useEffect(() => {
    const fetchOrgAndSetYears = async () => {
      try {
        const res = await axios.get(`${API}/api/organizations/my`, { headers });
        const yearType = res.data.reporting_year_type || 'financial_year';
        const years = generateReportingYears(yearType, 5);
        setReportingYears(years);
        setReportingPeriod(getCurrentReportingYear(yearType));
      } catch (error) {
        // Fallback
        const years = generateReportingYears('financial_year', 5);
        setReportingYears(years);
        setReportingPeriod(getCurrentReportingYear('financial_year'));
      }
    };
    fetchOrgAndSetYears();
  }, [token]);

  // Fetch assignments
  const fetchAssignments = useCallback(async () => {
    if (!reportingPeriod) return;
    
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/tracking/my-disclosures`, {
        headers,
        params: { reporting_period: reportingPeriod }
      });
      
      setAssignments({
        questions: res.data.questions || [],
        records: res.data.records || []
      });
      setStats({
        total_questions: res.data.total_questions || 0,
        total_records: res.data.total_records || 0,
        overdue_count: res.data.overdue_count || 0,
        pending_count: res.data.pending_count || 0,
        in_progress_count: res.data.in_progress_count || 0
      });
    } catch (error) {
      console.error('Failed to fetch assignments:', error);
      toast.error('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, [reportingPeriod, token]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  // Filter assignments
  const filterAssignments = (items) => {
    return items.filter(item => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch = 
          item.entity_id?.toLowerCase().includes(searchLower) ||
          item.framework?.toLowerCase().includes(searchLower) ||
          item.domain?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }
      
      // Status filter
      if (filters.status !== 'all' && item.status !== filters.status) {
        return false;
      }
      
      // Priority filter
      if (filters.priority !== 'all' && item.priority !== filters.priority) {
        return false;
      }
      
      // Domain filter
      if (filters.domain !== 'all' && item.domain !== filters.domain) {
        return false;
      }
      
      return true;
    });
  };

  // Get all combined and filtered
  const allAssignments = [...assignments.questions, ...assignments.records];
  const filteredAll = filterAssignments(allAssignments);
  const filteredQuestions = filterAssignments(assignments.questions);
  const filteredRecords = filterAssignments(assignments.records);

  // Get overdue items
  const now = new Date();
  const overdueItems = filteredAll.filter(item => {
    if (!item.due_date) return false;
    const dueDate = new Date(item.due_date);
    return dueDate < now && !['approved', 'submitted'].includes(item.status);
  });

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

  // Navigate to fill the question
  const handleFillQuestion = (assignment) => {
    const domain = (assignment.domain || 'environment').toLowerCase();
    const category = assignment.category || '';
    const subcategory = assignment.subcategory || '';

    // Map domain + category to the correct route
    const routeMap = {
      environment: '/environment',
      social: '/social',
      governance: '/governance',
    };

    // Environment subcategory routes
    const envCategoryRoutes = {
      energy: '/environment/energy',
      water: '/environment/water',
      waste: '/environment/waste',
      biodiversity: '/environment/biodiversity',
      'climate change': '/environment/climate-change',
      material: '/environment/material',
    };

    let path = routeMap[domain] || '/environment';
    if (domain === 'environment' && category) {
      const catKey = category.toLowerCase();
      path = envCategoryRoutes[catKey] || path;
    }

    const params = new URLSearchParams({ tab: 'add-metric' });
    if (category) params.set('category', category);
    if (subcategory) params.set('subcategory', subcategory);

    navigate(`${path}?${params.toString()}`);
  };

  // Format due date
  const formatDueDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const now = new Date();
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
              <Badge variant="outline" className="text-xs">
                {assignment.framework || 'BRSR'}
              </Badge>
              <Badge variant="outline" className="text-xs capitalize">
                {assignment.domain || 'environment'}
              </Badge>
              {assignment.entity_type === 'question' ? (
                <FileText className="w-4 h-4 text-blue-500" />
              ) : (
                <BarChart3 className="w-4 h-4 text-emerald-500" />
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
              {assignment.reminder_frequency && (
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{assignment.reminder_frequency}</span>
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
            
            {assignment.entity_type === 'question' && (
              <Button
                size="sm"
                onClick={() => handleFillQuestion(assignment)}
                className="bg-emerald-600 hover:bg-emerald-700 gap-1"
                data-testid={`fill-${assignment.id}`}
              >
                Fill Now
                <ArrowRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <ClipboardList className="w-7 h-7 text-emerald-600" />
            My Assignments
          </h1>
          <p className="text-text-muted mt-1">
            Track and complete your assigned ESG disclosures and metrics
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Reporting Period Selector */}
          <Select value={reportingPeriod} onValueChange={setReportingPeriod}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {reportingYears.map(year => (
                <SelectItem key={year} value={year}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button 
            variant="outline" 
            size="icon"
            onClick={fetchAssignments}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="p-4">
          <div className="text-2xl font-bold text-text-primary">{stats.total_questions || 0}</div>
          <div className="text-sm text-text-muted">Disclosures</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-text-primary">{stats.total_records || 0}</div>
          <div className="text-sm text-text-muted">Metrics</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-yellow-600">{stats.pending_count || 0}</div>
          <div className="text-sm text-text-muted">Pending</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-blue-600">{stats.in_progress_count || 0}</div>
          <div className="text-sm text-text-muted">In Progress</div>
        </Card>
        <Card className="p-4 border-red-200">
          <div className="text-2xl font-bold text-red-600">{stats.overdue_count || 0}</div>
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
                placeholder="Search assignments..."
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
          
          <Select value={filters.domain} onValueChange={(v) => setFilters(prev => ({ ...prev, domain: v }))}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Domain" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Domains</SelectItem>
              <SelectItem value="environment">Environment</SelectItem>
              <SelectItem value="social">Social</SelectItem>
              <SelectItem value="governance">Governance</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Tabs & Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all" className="gap-2">
            All
            <Badge variant="secondary" className="ml-1">{filteredAll.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="disclosures" className="gap-2">
            Disclosures
            <Badge variant="secondary" className="ml-1">{filteredQuestions.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="metrics" className="gap-2">
            Metrics
            <Badge variant="secondary" className="ml-1">{filteredRecords.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="overdue" className="gap-2">
            Overdue
            <Badge variant="destructive" className="ml-1">{overdueItems.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          </div>
        ) : (
          <>
            <TabsContent value="all" className="mt-6 space-y-3">
              {filteredAll.length === 0 ? (
                <Card className="p-8 text-center">
                  <ClipboardList className="w-12 h-12 text-stone-300 mx-auto mb-3" />
                  <h3 className="text-lg font-medium text-text-primary">No assignments found</h3>
                  <p className="text-text-muted">You do not have any assignments for this period.</p>
                </Card>
              ) : (
                filteredAll.map(renderAssignmentCard)
              )}
            </TabsContent>
            
            <TabsContent value="disclosures" className="mt-6 space-y-3">
              {filteredQuestions.length === 0 ? (
                <Card className="p-8 text-center">
                  <FileText className="w-12 h-12 text-stone-300 mx-auto mb-3" />
                  <h3 className="text-lg font-medium text-text-primary">No disclosure assignments</h3>
                  <p className="text-text-muted">You do not have any disclosure assignments.</p>
                </Card>
              ) : (
                filteredQuestions.map(renderAssignmentCard)
              )}
            </TabsContent>
            
            <TabsContent value="metrics" className="mt-6 space-y-3">
              {filteredRecords.length === 0 ? (
                <Card className="p-8 text-center">
                  <BarChart3 className="w-12 h-12 text-stone-300 mx-auto mb-3" />
                  <h3 className="text-lg font-medium text-text-primary">No metric assignments</h3>
                  <p className="text-text-muted">You do not have any metric assignments.</p>
                </Card>
              ) : (
                filteredRecords.map(renderAssignmentCard)
              )}
            </TabsContent>
            
            <TabsContent value="overdue" className="mt-6 space-y-3">
              {overdueItems.length === 0 ? (
                <Card className="p-8 text-center">
                  <CheckCircle2 className="w-12 h-12 text-green-300 mx-auto mb-3" />
                  <h3 className="text-lg font-medium text-text-primary">All caught up!</h3>
                  <p className="text-text-muted">You do not have any overdue assignments.</p>
                </Card>
              ) : (
                overdueItems.map(renderAssignmentCard)
              )}
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
