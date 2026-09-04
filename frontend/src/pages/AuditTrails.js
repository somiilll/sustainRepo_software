import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useDateFormatter } from '../hooks/useDateFormatter';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { 
  History, 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight,
  User,
  Calendar,
  FileText,
  Settings,
  AlertCircle,
  CheckCircle,
  XCircle,
  Eye,
  Download,
  RefreshCw,
  Clock,
  Activity,
  ArrowUpDown,
  Building2,
  Leaf,
  Users,
  Database,
  Calculator
} from 'lucide-react';
import { ModulePageHeader } from '../components/ModulePageHeader';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Module icons mapping
const MODULE_ICONS = {
  authentication: User,
  organization: Building2,
  facility: Building2,
  user: Users,
  ghg_emission: Leaf,
  ghg_sink: Leaf,
  fuel_database: Database,
  emission_factor: Calculator,
  formula: Calculator,
  scope_category: Settings,
  sector: Settings,
  unit: Settings,
  gwp_config: Settings,
  report: FileText,
  calculation_engine: Calculator,
  file: FileText,
  subscription: Settings,
  settings: Settings
};

// Action colors mapping
const ACTION_COLORS = {
  create: 'bg-green-100 text-green-800',
  update: 'bg-blue-100 text-blue-800',
  delete: 'bg-red-100 text-red-800',
  view: 'bg-gray-100 text-gray-800',
  login: 'bg-purple-100 text-purple-800',
  logout: 'bg-purple-100 text-purple-800',
  calculate: 'bg-amber-100 text-amber-800',
  recalculate: 'bg-amber-100 text-amber-800',
  activate: 'bg-green-100 text-green-800',
  deactivate: 'bg-orange-100 text-orange-800',
  upload: 'bg-blue-100 text-blue-800',
  download: 'bg-blue-100 text-blue-800',
  import: 'bg-indigo-100 text-indigo-800',
  export: 'bg-indigo-100 text-indigo-800'
};

// Module labels mapping
const MODULE_LABELS = {
  authentication: 'Authentication',
  organization: 'Organization',
  facility: 'Facility',
  user: 'User Management',
  ghg_emission: 'GHG Emissions',
  ghg_sink: 'GHG Sinks',
  fuel_database: 'Fuel Database',
  emission_factor: 'Emission Factors',
  formula: 'Formulas',
  scope_category: 'Scopes & Categories',
  sector: 'Sectors',
  unit: 'Units',
  gwp_config: 'GWP Configuration',
  report: 'Reports',
  calculation_engine: 'Calculation Engine',
  file: 'File Operations',
  subscription: 'Subscription',
  settings: 'Settings'
};

export default function AuditTrails() {
  const { getAuthHeader, user } = useAuth();
  const { formatDateTime } = useDateFormatter();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [filterOptions, setFilterOptions] = useState({ modules: [], actions: [], users: [] });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [summary, setSummary] = useState(null);
  
  // Filters
  const [filters, setFilters] = useState({
    module: '',
    action: '',
    user_id: '',
    search: '',
    start_date: '',
    end_date: '',
    status: ''
  });
  
  const [sortBy, setSortBy] = useState('timestamp');
  const [sortOrder, setSortOrder] = useState('desc');
  
  useEffect(() => {
    fetchLogs();
    fetchFilterOptions();
    fetchSummary();
  }, [page, filters, sortBy, sortOrder]);
  
  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('skip', ((page - 1) * limit).toString());
      params.append('limit', limit.toString());
      params.append('sort_by', sortBy);
      params.append('sort_order', sortOrder);
      
      if (filters.module) params.append('module', filters.module);
      if (filters.action) params.append('action', filters.action);
      if (filters.user_id) params.append('user_id', filters.user_id);
      if (filters.search) params.append('search', filters.search);
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      if (filters.status) params.append('status', filters.status);
      
      const response = await axios.get(`${API}/audit-logs?${params.toString()}`, {
        headers: getAuthHeader()
      });
      
      setLogs(response.data.logs || []);
      setTotal(response.data.total || 0);
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
      toast.error('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };
  
  const fetchFilterOptions = async () => {
    try {
      const response = await axios.get(`${API}/audit-logs/filters/options`, {
        headers: getAuthHeader()
      });
      setFilterOptions(response.data);
    } catch (error) {
      console.error('Failed to fetch filter options:', error);
    }
  };
  
  const fetchSummary = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      
      const response = await axios.get(`${API}/audit-logs/summary?${params.toString()}`, {
        headers: getAuthHeader()
      });
      setSummary(response.data);
    } catch (error) {
      console.error('Failed to fetch summary:', error);
    }
  };
  
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };
  
  const clearFilters = () => {
    setFilters({
      module: '',
      action: '',
      user_id: '',
      search: '',
      start_date: '',
      end_date: '',
      status: ''
    });
    setPage(1);
  };
  
  const openLogDetail = async (log) => {
    setSelectedLog(log);
    setDetailDialogOpen(true);
  };
  
  const formatTimestamp = (timestamp) => {
    return formatDateTime(timestamp);
  };
  
  const formatTimeAgo = (timestamp) => {
    const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 120) return '1 minute ago';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 7200) return '1 hour ago';
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    if (seconds < 172800) return '1 day ago';
    return `${Math.floor(seconds / 86400)} days ago`;
  };
  
  const totalPages = Math.ceil(total / limit);
  
  const hasActiveFilters = Object.values(filters).some(v => v !== '');
  
  const ModuleIcon = ({ module }) => {
    const Icon = MODULE_ICONS[module] || Activity;
    return <Icon className="w-4 h-4" />;
  };

  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-7" data-testid="audit-trails-page">
      <ModulePageHeader
        title="Audit Trails"
        icon={History}
        iconClassName="border-amber-200 bg-amber-50 text-amber-700"
        testId="audit-trails"
        aside={<div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            onClick={() => { fetchLogs(); fetchSummary(); }}
            className="gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <Button 
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className={`gap-2 ${hasActiveFilters ? 'border-primary text-primary' : ''}`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {hasActiveFilters && (
              <span className="bg-primary text-white text-xs px-1.5 py-0.5 rounded-full">
                {Object.values(filters).filter(v => v !== '').length}
              </span>
            )}
          </Button>
        </div>}
      />
      
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4 border border-stone-200">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-3 rounded-lg">
                <Activity className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">{summary.total_events?.toLocaleString() || 0}</p>
                <p className="text-sm text-text-muted">Total Events</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4 border border-stone-200">
            <div className="flex items-center gap-3">
              <div className="bg-green-100 p-3 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">{summary.by_action?.create || 0}</p>
                <p className="text-sm text-text-muted">Creates</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4 border border-stone-200">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-3 rounded-lg">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">{summary.by_action?.update || 0}</p>
                <p className="text-sm text-text-muted">Updates</p>
              </div>
            </div>
          </Card>
        </div>
      )}
      
      {/* Filters Panel */}
      {showFilters && (
        <Card className="p-4 border border-stone-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-text-primary">Filters</h3>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear All
              </Button>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {/* Search */}
            <div className="space-y-1">
              <Label className="text-xs text-text-muted">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text-muted" />
                <Input
                  placeholder="Search..."
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  className="pl-9 bg-stone-50"
                />
              </div>
            </div>
            
            {/* Module Filter */}
            <div className="space-y-1">
              <Label className="text-xs text-text-muted">Module</Label>
              <select
                value={filters.module}
                onChange={(e) => handleFilterChange('module', e.target.value)}
                className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
              >
                <option value="">All Modules</option>
                {filterOptions.modules.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            
            {/* Action Filter */}
            <div className="space-y-1">
              <Label className="text-xs text-text-muted">Action</Label>
              <select
                value={filters.action}
                onChange={(e) => handleFilterChange('action', e.target.value)}
                className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
              >
                <option value="">All Actions</option>
                {filterOptions.actions.map(a => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
            
            {/* User Filter */}
            <div className="space-y-1">
              <Label className="text-xs text-text-muted">User</Label>
              <select
                value={filters.user_id}
                onChange={(e) => handleFilterChange('user_id', e.target.value)}
                className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
              >
                <option value="">All Users</option>
                {filterOptions.users.map(u => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
            
            {/* Date Range */}
            <div className="space-y-1">
              <Label className="text-xs text-text-muted">From Date</Label>
              <Input
                type="date"
                value={filters.start_date}
                onChange={(e) => handleFilterChange('start_date', e.target.value)}
                className="bg-stone-50"
              />
            </div>
            
            <div className="space-y-1">
              <Label className="text-xs text-text-muted">To Date</Label>
              <Input
                type="date"
                value={filters.end_date}
                onChange={(e) => handleFilterChange('end_date', e.target.value)}
                className="bg-stone-50"
              />
            </div>
          </div>
        </Card>
      )}
      
      {/* Logs Table */}
      <Card className="border border-stone-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="text-left py-3 px-4 text-xs font-medium text-text-muted uppercase">
                  <button 
                    onClick={() => {
                      if (sortBy === 'timestamp') {
                        setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                      } else {
                        setSortBy('timestamp');
                        setSortOrder('desc');
                      }
                    }}
                    className="flex items-center gap-1 hover:text-text-primary"
                  >
                    Time
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="text-left py-3 px-4 text-xs font-medium text-text-muted uppercase">User</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-text-muted uppercase">Action</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-text-muted uppercase">Module</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-text-muted uppercase">Description</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-text-muted uppercase">Status</th>
                <th className="text-center py-3 px-4 text-xs font-medium text-text-muted uppercase">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <History className="w-12 h-12 mx-auto text-text-muted mb-3 opacity-50" />
                    <p className="text-text-muted">No audit logs found</p>
                    {hasActiveFilters && (
                      <Button variant="link" onClick={clearFilters} className="mt-2">
                        Clear filters
                      </Button>
                    )}
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-stone-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-text-muted" />
                        <div>
                          <p className="text-sm text-text-primary">{formatTimeAgo(log.timestamp)}</p>
                          <p className="text-xs text-text-muted">{formatTimestamp(log.timestamp)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-text-primary">{log.user?.email || 'Unknown'}</p>
                          <p className="text-xs text-text-muted capitalize">{log.user?.role || 'user'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium capitalize ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-800'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <ModuleIcon module={log.module} />
                        <span className="text-sm text-text-primary">
                          {MODULE_LABELS[log.module] || log.module}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-sm text-text-primary truncate max-w-xs" title={log.description}>
                        {log.description || '-'}
                      </p>
                      {log.resource?.name && (
                        <p className="text-xs text-text-muted truncate">{log.resource.name}</p>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {log.status === 'success' ? (
                        <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                          <CheckCircle className="w-3 h-3" />
                          Success
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-600 text-xs">
                          <XCircle className="w-3 h-3" />
                          Failed
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openLogDetail(log)}
                        data-testid={`view-log-${log.id}`}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-stone-200 bg-stone-50">
            <p className="text-sm text-text-muted">
              Showing {((page - 1) * limit) + 1} - {Math.min(page * limit, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-text-primary">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
      
      {/* Log Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Audit Log Details</DialogTitle>
          </DialogHeader>
          
          {selectedLog && (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-text-muted">Timestamp</Label>
                  <p className="text-sm font-medium">{formatTimestamp(selectedLog.timestamp)}</p>
                </div>
                <div>
                  <Label className="text-xs text-text-muted">Status</Label>
                  <p className={`text-sm font-medium ${selectedLog.status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                    {selectedLog.status === 'success' ? 'Success' : 'Failed'}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-text-muted">Action</Label>
                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium capitalize ${ACTION_COLORS[selectedLog.action] || 'bg-gray-100'}`}>
                    {selectedLog.action}
                  </span>
                </div>
                <div>
                  <Label className="text-xs text-text-muted">Module</Label>
                  <p className="text-sm font-medium">{MODULE_LABELS[selectedLog.module] || selectedLog.module}</p>
                </div>
              </div>
              
              {/* User Info */}
              <div className="p-4 bg-stone-50 rounded-lg">
                <h4 className="text-xs font-medium text-text-muted uppercase mb-2">User Information</h4>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{selectedLog.user?.email}</p>
                    <p className="text-xs text-text-muted capitalize">Role: {selectedLog.user?.role}</p>
                  </div>
                </div>
              </div>
              
              {/* Description */}
              {selectedLog.description && (
                <div>
                  <Label className="text-xs text-text-muted">Description</Label>
                  <p className="text-sm mt-1">{selectedLog.description}</p>
                </div>
              )}
              
              {/* Resource */}
              {selectedLog.resource && (
                <div className="p-4 bg-stone-50 rounded-lg">
                  <h4 className="text-xs font-medium text-text-muted uppercase mb-2">Resource</h4>
                  <p className="text-sm"><strong>ID:</strong> {selectedLog.resource.id}</p>
                  {selectedLog.resource.name && (
                    <p className="text-sm"><strong>Name:</strong> {selectedLog.resource.name}</p>
                  )}
                </div>
              )}
              
              {/* Changes (Old/New Values) */}
              {selectedLog.changes && (
                <div className="space-y-4">
                  <h4 className="text-xs font-medium text-text-muted uppercase">Changes</h4>
                  
                  {selectedLog.changes.old_values && (
                    <div className="p-4 bg-red-50 rounded-lg border border-red-100">
                      <h5 className="text-xs font-medium text-red-700 mb-2">Previous Values</h5>
                      <pre className="text-xs text-red-800 overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(selectedLog.changes.old_values, null, 2)}
                      </pre>
                    </div>
                  )}
                  
                  {selectedLog.changes.new_values && (
                    <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                      <h5 className="text-xs font-medium text-green-700 mb-2">New Values</h5>
                      <pre className="text-xs text-green-800 overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(selectedLog.changes.new_values, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
              
              {/* Metadata */}
              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                <div className="p-4 bg-stone-50 rounded-lg">
                  <h4 className="text-xs font-medium text-text-muted uppercase mb-2">Additional Metadata</h4>
                  <pre className="text-xs text-text-primary overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
              
              {/* Client Info */}
              {selectedLog.client && (
                <div className="p-4 bg-stone-50 rounded-lg">
                  <h4 className="text-xs font-medium text-text-muted uppercase mb-2">Client Information</h4>
                  {selectedLog.client.ip_address && (
                    <p className="text-sm"><strong>IP Address:</strong> {selectedLog.client.ip_address}</p>
                  )}
                  {selectedLog.client.user_agent && (
                    <p className="text-sm"><strong>User Agent:</strong> {selectedLog.client.user_agent}</p>
                  )}
                </div>
              )}
              
              {/* Error Message */}
              {selectedLog.error_message && (
                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <h4 className="text-xs font-medium text-red-700 uppercase mb-2">Error Message</h4>
                  <p className="text-sm text-red-800">{selectedLog.error_message}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
