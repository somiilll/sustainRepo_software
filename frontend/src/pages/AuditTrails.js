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

const AUDIT_FIELD_LABELS = {
  organization_id: 'Organization', org_id: 'Organization', facility_id: 'Facility', facility_ids: 'Facilities',
  reporting_period: 'Reporting period', dynamic_field_values: 'Emission inputs', old_values: 'Previous values',
  new_values: 'New values', user_agent: 'Browser', ip_address: 'IP address', custom_ef: 'Custom emission factor',
  ef_quantity: 'Emission factor', qty: 'Quantity', cv: 'Calorific value', fuel_type: 'Fuel type',
};

const humanizeAuditField = (key = '') => AUDIT_FIELD_LABELS[key]
  || key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const resolveAuditReference = (key, value, resolvedEntities = {}) => {
  const organizationKeys = ['organization_id', 'org_id'];
  if (organizationKeys.includes(key)) return resolvedEntities.organizations?.[String(value)] || 'Unavailable organization';
  if (key === 'facility_id') return resolvedEntities.facilities?.[String(value)] || 'Unavailable facility';
  if (key === 'facility_ids' && Array.isArray(value)) {
    return value.map((id) => resolvedEntities.facilities?.[String(id)] || 'Unavailable facility').join(', ');
  }
  return null;
};

const formatAuditValue = (value, key, resolvedEntities) => {
  const resolvedReference = resolveAuditReference(key, value, resolvedEntities);
  if (resolvedReference) return resolvedReference;
  if (value === null || value === undefined || value === '') return 'Not set';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.map((item) => String(item)).join(', ') : 'None';
  if (typeof value === 'object' && 'value' in value) return `${value.value ?? 'Not set'}${value.unit ? ` ${value.unit}` : ''}`;
  return String(value);
};

const flattenAuditValues = (value, resolvedEntities, prefix = '', result = {}) => {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value) || ('value' in value)) {
    if (prefix) result[prefix] = formatAuditValue(value, prefix.split('.').pop(), resolvedEntities);
    return result;
  }
  Object.entries(value).forEach(([key, childValue]) => {
    if (['password', 'password_hash', 'token', 'secret', '_id'].includes(key.toLowerCase())) return;
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    flattenAuditValues(childValue, resolvedEntities, nextPrefix, result);
  });
  return result;
};

const AuditValueList = ({ values, resolvedEntities, testId }) => {
  const rows = Object.entries(flattenAuditValues(values, resolvedEntities));
  if (!rows.length) return <p className="text-sm text-stone-500" data-testid={`${testId}-empty`}>No additional details.</p>;
  return <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2" data-testid={testId}>{rows.map(([key, value]) => <div key={key} className="min-w-0 border-b border-stone-100 pb-2"><dt className="text-xs font-medium text-stone-500">{humanizeAuditField(key.split('.').pop())}</dt><dd className="mt-1 break-words text-sm font-medium text-stone-800">{value}</dd></div>)}</dl>;
};

const AuditChangeComparison = ({ changes, resolvedEntities }) => {
  const previous = flattenAuditValues(changes?.old_values, resolvedEntities);
  const next = flattenAuditValues(changes?.new_values, resolvedEntities);
  const fields = [...new Set([...Object.keys(previous), ...Object.keys(next)])];
  if (!fields.length) return null;
  return <section className="overflow-hidden rounded-xl border border-stone-200" data-testid="audit-log-change-comparison"><div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] border-b border-stone-200 bg-stone-50 text-xs font-semibold uppercase text-stone-500"><div className="px-4 py-3">Previous</div><div className="border-l border-stone-200 px-4 py-3">New</div></div><div className="divide-y divide-stone-100">{fields.map((field) => <div key={field} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><div className="min-w-0 px-4 py-3"><p className="text-xs font-medium text-stone-500">{humanizeAuditField(field.split('.').pop())}</p><p className="mt-1 break-words text-sm text-rose-800">{previous[field] || 'Not set'}</p></div><div className="min-w-0 border-l border-stone-200 px-4 py-3"><p className="text-xs font-medium text-stone-500">{humanizeAuditField(field.split('.').pop())}</p><p className="mt-1 break-words text-sm text-emerald-800">{next[field] || 'Not set'}</p></div></div>)}</div></section>;
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
        <DialogContent className="max-h-[86vh] max-w-4xl gap-0 overflow-hidden p-0" data-testid="audit-log-detail-dialog">
          {selectedLog && <>
            <DialogHeader className={`border-b px-6 py-5 ${selectedLog.status === 'success' ? 'border-emerald-100 bg-emerald-50/70' : 'border-rose-100 bg-rose-50/70'}`}>
              <div className="flex items-start gap-4 pr-8">
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${selectedLog.status === 'success' ? 'bg-emerald-700 text-white' : 'bg-rose-700 text-white'}`} data-testid="audit-log-event-icon"><ModuleIcon module={selectedLog.module} /></span>
                <div className="min-w-0 flex-1"><DialogTitle className="text-xl font-semibold text-stone-950" data-testid="audit-log-detail-title">{humanizeAuditField(selectedLog.action)} · {MODULE_LABELS[selectedLog.module] || selectedLog.module}</DialogTitle><p className="mt-1 text-sm text-stone-600" data-testid="audit-log-detail-time">{formatTimestamp(selectedLog.timestamp)} · {formatTimeAgo(selectedLog.timestamp)}</p></div>
                <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${selectedLog.status === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`} data-testid="audit-log-status-badge">{selectedLog.status === 'success' ? 'Success' : 'Failed'}</span>
              </div>
            </DialogHeader>
            <div className="max-h-[calc(86vh-104px)] space-y-6 overflow-y-auto p-6">
              {selectedLog.error_message && <section className="rounded-xl border border-rose-200 bg-rose-50 p-4" data-testid="audit-log-error"><p className="text-xs font-semibold uppercase text-rose-700">Error message</p><p className="mt-1 text-sm text-rose-900">{selectedLog.error_message}</p></section>}

              <section className="grid gap-4 sm:grid-cols-2" data-testid="audit-log-event-context">
                <div className="rounded-xl border border-stone-200 bg-white p-4"><p className="text-xs font-semibold uppercase text-stone-500">Action</p><span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${ACTION_COLORS[selectedLog.action] || 'bg-stone-100 text-stone-800'}`} data-testid="audit-log-action-badge">{selectedLog.action}</span></div>
                <div className="rounded-xl border border-stone-200 bg-white p-4"><p className="text-xs font-semibold uppercase text-stone-500">Module</p><p className="mt-2 text-sm font-semibold text-stone-900" data-testid="audit-log-module-name">{MODULE_LABELS[selectedLog.module] || selectedLog.module}</p></div>
              </section>

              <section className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-stone-200 bg-white p-4" data-testid="audit-log-actor"><p className="text-xs font-semibold uppercase text-stone-500">Who</p><div className="mt-3 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><User className="h-5 w-5" aria-hidden="true" /></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-stone-900" data-testid="audit-log-user-email">{selectedLog.user?.email || 'Unknown user'}</p><p className="mt-0.5 text-xs capitalize text-stone-500" data-testid="audit-log-user-role">{selectedLog.user?.role || 'User'}</p></div></div></div>
                <div className="rounded-xl border border-stone-200 bg-white p-4" data-testid="audit-log-resource"><p className="text-xs font-semibold uppercase text-stone-500">Affected resource</p><p className="mt-3 text-sm font-semibold text-stone-900" data-testid="audit-log-resource-name">{selectedLog.resource?.name || (selectedLog.module === 'facility' ? selectedLog.resolved_entities?.facilities?.[String(selectedLog.resource?.id)] : selectedLog.module === 'organization' ? selectedLog.resolved_entities?.organizations?.[String(selectedLog.resource?.id)] : 'Unavailable resource')}</p>{selectedLog.organization_id && <p className="mt-1 text-xs text-stone-500" data-testid="audit-log-organization-name">{formatAuditValue(selectedLog.organization_id, 'organization_id', selectedLog.resolved_entities)}</p>}</div>
              </section>

              {selectedLog.description && <section className="rounded-xl border border-stone-200 bg-stone-50/70 p-4" data-testid="audit-log-description"><p className="text-xs font-semibold uppercase text-stone-500">Description</p><p className="mt-2 text-sm leading-6 text-stone-800">{selectedLog.description}</p></section>}

              {selectedLog.changes && <section className="space-y-3" data-testid="audit-log-changes"><div><p className="text-xs font-semibold uppercase text-stone-500">Changes</p><h3 className="mt-1 text-base font-semibold text-stone-950">Before and after</h3></div><AuditChangeComparison changes={selectedLog.changes} resolvedEntities={selectedLog.resolved_entities} /></section>}

              {(selectedLog.metadata || selectedLog.client) && <details className="rounded-xl border border-stone-200 bg-white" data-testid="audit-log-technical-details"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-stone-700" data-testid="audit-log-technical-details-toggle">Technical details</summary><div className="border-t border-stone-100 p-4"><AuditValueList values={{ ...(selectedLog.metadata || {}), ...(selectedLog.client || {}) }} resolvedEntities={selectedLog.resolved_entities} testId="audit-log-technical-values" /></div></details>}
            </div>
          </>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
