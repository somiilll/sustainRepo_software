/**
 * ESGTargetsTab - Main targets management component
 * 
 * Features:
 * - List targets with search and filters
 * - Create/Edit/Duplicate/Archive/Delete targets
 * - Version history viewing
 * - Admin-only write access
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { Target, Plus, Search, Filter, History, ChevronDown } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
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
import { ModulePageHeader } from './ModulePageHeader';
import { TargetCard } from './esg-targets/TargetCard';
import { TargetDetailsSheet } from './esg-targets/TargetDetailsSheet';
import { TargetSummaryCards, summarize } from './esg-targets/TargetSummaryCards';


const API = process.env.REACT_APP_BACKEND_URL;

const SECTION_HEADERS = {
  environment: { title: 'Environment Targets', iconClassName: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  social: { title: 'Social Targets', iconClassName: 'border-rose-200 bg-rose-50 text-rose-700' },
  governance: { title: 'Governance Targets', iconClassName: 'border-blue-200 bg-blue-50 text-blue-700' },
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
  const [detailsTarget, setDetailsTarget] = useState(null);
  const sectionHeader = SECTION_HEADERS[section] || { title: 'ESG Target', iconClassName: 'border-stone-200 bg-stone-50 text-stone-700' };
  
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
        const res = await axios.get(`${API}/api/esg-targets/lookup/categories?section=${section}`, { headers });
        setCategories(Object.keys(res.data?.hierarchy || {}));
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

  return (
    <div className="space-y-7" data-testid="esg-targets-tab">
      <ModulePageHeader
        title={sectionHeader.title}
        icon={Target}
        iconClassName={sectionHeader.iconClassName}
        testId={`${section}-target`}
        aside={userIsAdmin && (
          <Button 
            onClick={handleCreate}
            className="bg-primary hover:bg-primary/90 text-white rounded-full px-6"
            data-testid="create-target-btn"
          >
            <Plus className="w-4 h-4" />
            Add Target
          </Button>
        )}
      />

      {!loading && <div className="pt-4"><TargetSummaryCards counts={summarize(targets)} /></div>}

      {/* Search and Filters */}
      <Card className="bg-white p-4" data-testid="target-search-card">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <Input
              placeholder="Search targets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-white pl-10"
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

      {loading ? (
        <div className="flex items-center justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" /></div>
      ) : targets.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <Target className="mb-4 h-16 w-16 text-stone-300" />
          <h3 className="mb-2 text-lg font-semibold text-text-primary">No targets found</h3>
          <p className="mb-4 max-w-md text-text-muted">
            {search || Object.values(filters).some(v => v) ? 'Try adjusting your search or filters' : 'Create your first ESG target to track KPI performance'}
          </p>
          {userIsAdmin && !search && (
            <Button onClick={handleCreate} className="rounded-full bg-primary px-6 text-white hover:bg-primary/90" data-testid="esg-empty-add-target-button">
              <Plus className="h-4 w-4" />Add Target
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-5 pt-4 lg:grid-cols-2" data-testid="target-card-list">
          {targets.map(target => (
            <TargetCard
              key={target.id}
              target={target}
              onOpen={setDetailsTarget}
              isAdmin={userIsAdmin}
              actions={{ history: handleViewHistory, edit: handleEdit, duplicate: handleDuplicate, archive: handleArchive, remove: setDeleteConfirm }}
            />
          ))}
        </div>
      )}

      <TargetDetailsSheet target={detailsTarget && (targets.find(t => t.id === detailsTarget.id) || detailsTarget)} onClose={() => setDetailsTarget(null)} />

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
