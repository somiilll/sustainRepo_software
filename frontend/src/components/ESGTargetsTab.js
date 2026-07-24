/**
 * ESGTargetsTab - Main targets management component
 * 
 * Features:
 * - List targets with search and filters
 * - Create/Edit/Duplicate/Archive/Delete targets
 * - Version history viewing
 * - Admin-only write access
 */
import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { 
  Target, Plus, Search, Filter, History, Copy, Archive, Trash2, 
  Edit2, ChevronDown, ChevronUp, Building2, Calendar, TrendingUp, MoreVertical,
  CheckCircle2, Clock, XCircle, AlertCircle
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { isAdmin } from '../utils/roleUtils';
import ESGTargetForm from './ESGTargetForm';
import ESGTargetVersionHistory from './ESGTargetVersionHistory';

const TargetProgressChart = lazy(() => import('./TargetProgressChart'));

const API = process.env.REACT_APP_BACKEND_URL;

const STATUS_CONFIG = {
  draft: { label: 'Draft', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  active: { label: 'Active', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  completed: { label: 'Completed', color: 'bg-blue-100 text-blue-700', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700', icon: XCircle },
  archived: { label: 'Archived', color: 'bg-stone-100 text-stone-500', icon: Archive },
  expired: { label: 'Expired', color: 'bg-stone-100 text-stone-500', icon: AlertCircle },
};

const TARGET_TYPE_LABELS = {
  absolute: 'Absolute',
  percentage: 'Percentage',
  intensity: 'Intensity',
  intensity_revenue: 'Intensity (Revenue)',
  intensity_production: 'Intensity (Production)',
};

const TRACKING_MODE_LABELS = {
  static: 'Static',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_yearly: 'Half Yearly',
  yearly: 'Yearly',
};

export default function ESGTargetsTab({ section = 'environment', reportingPeriod }) {
  const { token, user } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };
  const userIsAdmin = isAdmin(user);
  
  // State
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    category: '',
    subcategory: '',
    status: '',
    facility_id: '',
    reporting_period: '',
  });
  const [showFilters, setShowFilters] = useState(false);
  
  // Modal states
  const [showForm, setShowForm] = useState(false);
  const [editingTarget, setEditingTarget] = useState(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [expandedTargets, setExpandedTargets] = useState({});
  
  // Categories for filters
  const [categories, setCategories] = useState([]);
  const [facilities, setFacilities] = useState([]);

  // Fetch targets
  const fetchTargets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('section', section);
      if (search) params.append('search', search);
      if (filters.category) params.append('category', filters.category);
      if (filters.subcategory) params.append('subcategory', filters.subcategory);
      if (filters.status) params.append('status', filters.status);
      if (filters.facility_id) params.append('facility_id', filters.facility_id);
      // Don't filter by reporting period by default - show all targets
      if (filters.reporting_period) params.append('reporting_period', filters.reporting_period);
      
      // Use with-progress endpoint to get calculated progress
      const res = await axios.get(`${API}/api/esg-targets/with-progress?${params.toString()}`, { headers });
      console.log("res.data", res.data)
      setTargets(res.data || []);
    } catch (error) {
      console.error('Failed to fetch targets:', error);
      toast.error('Failed to load targets');
    } finally {
      setLoading(false);
    }
  }, [section, search, filters, reportingPeriod, token]);

  // Fetch categories for filters
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await axios.get(`${API}/api/esg-records/categories/${section}`, { headers });
        const cats = res.data || [];
        const uniqueCats = [...new Set(cats.map(c => c.category))];
        setCategories(uniqueCats);
      } catch (error) {
        console.error('Failed to fetch categories:', error);
      }
    };
    fetchCategories();
  }, [section, token]);

  // Fetch facilities
  useEffect(() => {
    const fetchFacilities = async () => {
      try {
        const res = await axios.get(`${API}/api/facilities`, { headers });
        setFacilities(res.data || []);
      } catch (error) {
        console.error('Failed to fetch facilities:', error);
      }
    };
    fetchFacilities();
  }, [token]);

  // Initial fetch
  useEffect(() => {
    fetchTargets();
  }, [fetchTargets]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTargets();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Handlers
  const handleCreate = () => {
    setEditingTarget(null);
    setShowForm(true);
  };

  const handleEdit = (target) => {
    setEditingTarget(target);
    setShowForm(true);
  };

  const handleDuplicate = async (target) => {
    setBusy(true);
    try {
      const res = await axios.post(`${API}/api/esg-targets/${target.id}/duplicate`, {}, { headers });
      toast.success('Target duplicated');
      // Open edit form for the duplicate
      setEditingTarget(res.data);
      setShowForm(true);
      fetchTargets();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to duplicate target');
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async (target) => {
    setBusy(true);
    try {
      await axios.put(`${API}/api/esg-targets/${target.id}`, { status: 'archived' }, { headers });
      toast.success('Target archived');
      fetchTargets();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to archive target');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setBusy(true);
    try {
      await axios.delete(`${API}/api/esg-targets/${deleteConfirm.id}`, { headers });
      toast.success('Target deleted');
      setDeleteConfirm(null);
      fetchTargets();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete target');
    } finally {
      setBusy(false);
    }
  };

  const handleViewHistory = (target) => {
    setSelectedTargetId(target.id);
    setShowVersionHistory(true);
  };

  const handleFormSubmit = async (data) => {
    setBusy(true);
    try {
      if (editingTarget?.id) {
        await axios.put(`${API}/api/esg-targets/${editingTarget.id}`, data, { headers });
        toast.success('Target updated');
      } else {
        await axios.post(`${API}/api/esg-targets`, { ...data, section }, { headers });
        toast.success('Target created');
      }
      setShowForm(false);
      setEditingTarget(null);
      fetchTargets();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save target');
    } finally {
      setBusy(false);
    }
  };

  const getStatusBadge = (status) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
    const Icon = config.icon;
    return (
      <Badge className={`${config.color} gap-1`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const formatTargetValue = (target) => {
    const { goal_type, target_value, minimum_value, maximum_value, unit } = target;
    
    if (goal_type === 'range') {
      return `${minimum_value} - ${maximum_value} ${unit || ''}`;
    }
    
    const prefix = goal_type === 'upper_limit' ? '≤ ' : goal_type === 'lower_limit' ? '≥ ' : '';
    return `${prefix}${target_value} ${unit || ''}`;
  };

  const getProgressBadge = (target) => {
    const { progress_percentage, actual_value, kpi_id, over_target, under_target } = target;
    
    // No KPI linked - can't calculate progress
    if (!kpi_id) {
      return (
        <Badge variant="outline" className="text-xs text-stone-400">
          No KPI
        </Badge>
      );
    }
    
    // No progress calculated yet
    if (progress_percentage === null || progress_percentage === undefined) {
      // Check for intensity error
      if (target.intensity_error) {
        return (
          <div className="flex flex-col items-start gap-0.5">
            <Badge className="bg-amber-100 text-amber-700 text-xs font-semibold" data-testid="progress-badge">
              Data Missing
            </Badge>
            <span className="text-[10px] text-amber-600">{target.intensity_error}</span>
          </div>
        );
      }
      return (
        <Badge variant="outline" className="text-xs text-stone-400">
          N/A
        </Badge>
      );
    }
    
    const ratio = target.progress_ratio;
    const goalType = target.goal_type;
    const trackingMode = target.tracking_mode;
    const isPeriodicTarget = trackingMode === 'monthly' || trackingMode === 'yearly';

    // Monthly/Yearly targets — color by ratio + goal_type
    if (isPeriodicTarget && ratio != null) {
      let colorClass = 'bg-orange-100 text-orange-700'; // close to 1
      const absRatio = Math.abs(ratio);
      const displayRatio = absRatio.toFixed(2);

      if (goalType === 'lower_limit') {
        // Higher is better
        if (ratio > 1.1) colorClass = 'bg-green-100 text-green-700';
        else if (ratio >= 0.9) colorClass = 'bg-orange-100 text-orange-700';
        else colorClass = 'bg-red-100 text-red-700';
      } else {
        // upper_limit — lower is better
        if (ratio > 1.1) colorClass = 'bg-red-100 text-red-700';
        else if (ratio >= 0.9) colorClass = 'bg-orange-100 text-orange-700';
        else colorClass = 'bg-green-100 text-green-700';
      }

      const label = over_target ? `${displayRatio}x over` : `${displayRatio}x`;

      return (
        <div className="flex flex-col items-start gap-0.5">
          <Badge className={`${colorClass} text-xs font-semibold`} data-testid="progress-badge">
            {label}
          </Badge>
          {actual_value !== null && (
            <span className="text-[10px] text-text-muted">
              Actual: {actual_value.toLocaleString()}
            </span>
          )}
        </div>
      );
    }

    // Over target (static/other) — red
    if (over_target) {
      const displayRatio = ratio != null ? Math.abs(ratio).toFixed(2) : Math.abs(progress_percentage).toFixed(0);
      return (
        <div className="flex flex-col items-start gap-0.5">
          <Badge className="bg-red-100 text-red-700 text-xs font-semibold" data-testid="progress-badge">
            {displayRatio}x over
          </Badge>
          {actual_value !== null && (
            <span className="text-[10px] text-text-muted">
              Actual: {actual_value.toLocaleString()}
            </span>
          )}
        </div>
      );
    }

    // Static targets — percentage-based coloring
    let colorClass = 'bg-red-100 text-red-700';
    if (progress_percentage >= 100) {
      colorClass = 'bg-green-100 text-green-700';
    } else if (progress_percentage >= 75) {
      colorClass = 'bg-emerald-100 text-emerald-700';
    } else if (progress_percentage >= 50) {
      colorClass = 'bg-yellow-100 text-yellow-700';
    } else if (progress_percentage >= 25) {
      colorClass = 'bg-orange-100 text-orange-700';
    }
    
    return (
      <div className="flex flex-col items-start gap-0.5">
        <Badge className={`${colorClass} text-xs font-semibold`} data-testid="progress-badge">
          {progress_percentage.toFixed(0)}%
        </Badge>
        {actual_value !== null && (
          <span className="text-[10px] text-text-muted">
            Actual: {actual_value.toLocaleString()}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6" data-testid="esg-targets-tab">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <Target className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-heading font-bold text-text-primary">ESG Targets</h2>
            <p className="text-sm text-text-muted">Manage KPI targets and goals</p>
          </div>
        </div>
        
        {userIsAdmin && (
          <Button 
            onClick={handleCreate}
            className="bg-emerald-600 hover:bg-emerald-700 gap-2"
            data-testid="create-target-btn"
          >
            <Plus className="w-4 h-4" />
            Add Target
          </Button>
        )}
      </div>

      {/* Search and Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <Input
              placeholder="Search targets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              data-testid="target-search-input"
            />
          </div>
          
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-2"
          >
            <Filter className="w-4 h-4" />
            Filters
            <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </Button>
        </div>
        
        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 pt-4 border-t border-stone-200">
            <Select value={filters.category || "all"} onValueChange={(v) => setFilters(f => ({ ...f, category: v === "all" ? "" : v }))}>
              <SelectTrigger>
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={filters.status || "all"} onValueChange={(v) => setFilters(f => ({ ...f, status: v === "all" ? "" : v }))}>
              <SelectTrigger>
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={filters.facility_id || "all"} onValueChange={(v) => setFilters(f => ({ ...f, facility_id: v === "all" ? "" : v }))}>
              <SelectTrigger>
                <SelectValue placeholder="All Facilities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Facilities</SelectItem>
                {facilities.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button 
              variant="ghost" 
              onClick={() => setFilters({ category: '', subcategory: '', status: '', facility_id: '', reporting_period: '' })}
              className="text-stone-500"
            >
              Clear Filters
            </Button>
          </div>
        )}
      </Card>

      {/* Targets Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
          </div>
        ) : targets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Target className="w-16 h-16 text-stone-300 mb-4" />
            <h3 className="text-lg font-semibold text-text-primary mb-2">No targets found</h3>
            <p className="text-text-muted max-w-md mb-4">
              {search || Object.values(filters).some(v => v) 
                ? 'Try adjusting your search or filters'
                : 'Create your first ESG target to track KPI performance'}
            </p>
            {userIsAdmin && !search && (
              <Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                <Plus className="w-4 h-4" />
                Add Target
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">KPI / Metric</th>
                  <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Target</th>
                  <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Progress</th>
                  <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Type</th>
                  <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Tracking</th>
                  <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Scope</th>
                  <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Period</th>
                  <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Status</th>
                  <th className="text-right text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {targets.map(target => {
                  const isExpanded = expandedTargets[target.id];
                  return (
                  <React.Fragment key={target.id}>
                  <tr className="hover:bg-stone-50/50 cursor-pointer" data-testid={`target-row-${target.id}`}
                    onClick={() => setExpandedTargets(prev => ({ ...prev, [target.id]: !prev[target.id] }))}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-stone-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-stone-400 shrink-0" />}
                        <div>
                          <p className="font-medium text-text-primary text-sm">{target.kpi_name || target.metric_label || target.metric_key}</p>
                          <p className="text-xs text-text-muted">{target.category} → {target.subcategory}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-text-primary text-sm">{target.target_name}</p>
                    </td>
                    <td className="px-4 py-3">
                      {getProgressBadge(target)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">
                        {TARGET_TYPE_LABELS[target.target_type] || target.target_type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-secondary">
                        {TRACKING_MODE_LABELS[target.tracking_mode] || target.tracking_mode}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm text-text-secondary">
                        <Building2 className="w-3 h-3" />
                        {target.scope_type === 'organization' ? 'Organization' : 
                          target.facility_names?.join(', ') || `${target.facility_ids?.length || 0} facilities`}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm text-text-secondary">
                        <Calendar className="w-3 h-3" />
                        {target.reporting_period}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(target.status)}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleViewHistory(target)}>
                            <History className="w-4 h-4 mr-2" />
                            View History
                          </DropdownMenuItem>
                          {userIsAdmin && (
                            <>
                              <DropdownMenuItem onClick={() => handleEdit(target)}>
                                <Edit2 className="w-4 h-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDuplicate(target)}>
                                <Copy className="w-4 h-4 mr-2" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleArchive(target)}>
                                <Archive className="w-4 h-4 mr-2" />
                                Archive
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => setDeleteConfirm(target)}
                                className="text-red-600 focus:text-red-600"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={9} className="px-4 py-4 bg-stone-50/30">
                        <Suspense fallback={<div className="flex justify-center py-6"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" /></div>}>
                          <TargetProgressChart targetId={target.id} />
                        </Suspense>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create/Edit Form Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => !open && setShowForm(false)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-emerald-600" />
              {editingTarget ? 'Edit Target' : 'Create New Target'}
            </DialogTitle>
          </DialogHeader>
          <ESGTargetForm
            section={section}
            initialData={editingTarget}
            onSubmit={handleFormSubmit}
            onCancel={() => setShowForm(false)}
            busy={busy}
          />
        </DialogContent>
      </Dialog>

      {/* Version History Dialog */}
      <Dialog open={showVersionHistory} onOpenChange={setShowVersionHistory}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-emerald-600" />
              Version History
            </DialogTitle>
          </DialogHeader>
          {selectedTargetId && (
            <ESGTargetVersionHistory targetId={selectedTargetId} />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Target?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteConfirm?.target_name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={busy}
              className="bg-red-600 hover:bg-red-700"
            >
              {busy ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
