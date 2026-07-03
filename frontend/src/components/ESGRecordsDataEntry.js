/**
 * ESG Records Data Entry Component
 * 
 * Operational ESG data management with draft support.
 * Wraps existing ESGRecords functionality with enhanced features:
 * - Save as draft
 * - Version history
 * - Draft indicator
 * - Discard draft option
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { toast } from 'sonner';
import { 
  Plus, Search, Filter, History, FileText, Upload, 
  ChevronLeft, ChevronRight, Loader2, Building2, Calendar,
  Trash2, Edit2, Eye, X, Save, FileEdit, RefreshCw,
  CheckCircle2, Clock, AlertTriangle, Lock, Link2
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

// Months for monthly reporting
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * ESG Records Data Entry
 * 
 * @param {string} section - 'environment' | 'social' | 'governance'
 * @param {string} framework - 'BRSR' | 'GRI' etc.
 * @param {string} mode - 'list' | 'add'
 * @param {function} onRecordAdded - Callback when record is added
 */
export default function ESGRecordsDataEntry({ section, framework = 'BRSR', mode = 'list', onRecordAdded }) {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [stats, setStats] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, total_pages: 0 });
  
  // Filters
  const [filters, setFilters] = useState({
    category: '',
    status: '',
    facility_id: '',
    search: ''
  });
  
  // Modal states
  const [showVersionsModal, setShowVersionsModal] = useState(false);
  const [showImportedModal, setShowImportedModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [editData, setEditData] = useState({});
  const [versions, setVersions] = useState([]);
  const [saving, setSaving] = useState({});
  
  // Add/Edit form state
  const [formData, setFormData] = useState({
    category: '',
    subcategory: '',
    facility_id: '',
    reporting_type: 'monthly',
    reporting_year: new Date().getFullYear(),
    reporting_month: '',
    value: '',
    unit: '',
    notes: '',
  });
  const [formErrors, setFormErrors] = useState({});

  const headers = { Authorization: `Bearer ${token}` };

  // Fetch base data
  useEffect(() => {
    fetchCategories();
    fetchFacilities();
  }, [section]);

  useEffect(() => {
    if (mode === 'list') {
      fetchRecords();
      fetchDrafts();
      fetchStats();
    }
  }, [section, filters, pagination.page, mode]);

  const fetchCategories = async () => {
    try {
      const res = await axios.get(`${API}/api/esg-records/categories/${section}`, {
        params: { framework },
        headers
      });
      setCategories(res.data.categories || []);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  };

  const fetchFacilities = async () => {
    try {
      const res = await axios.get(`${API}/api/facilities`, { headers });
      setFacilities(res.data.facilities || res.data || []);
    } catch (error) {
      console.error('Failed to fetch facilities:', error);
    } finally {
      if (mode === 'add') setLoading(false);
    }
  };

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        framework
      };
      if (filters.category) params.category = filters.category;
      if (filters.status) params.status = filters.status;
      if (filters.facility_id) params.facility_id = filters.facility_id;
      if (filters.search) params.search = filters.search;

      const res = await axios.get(`${API}/api/esg-records/records/${section}`, {
        params,
        headers
      });
      setRecords(res.data.records || []);
      setPagination(prev => ({
        ...prev,
        total: res.data.total || 0,
        total_pages: res.data.total_pages || 0
      }));
    } catch (error) {
      console.error('Failed to fetch records:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDrafts = async () => {
    try {
      const res = await axios.get(`${API}/api/esg-records/drafts/${section}`, { headers });
      setDrafts(res.data.drafts || []);
    } catch (error) {
      console.error('Failed to fetch drafts:', error);
      setDrafts([]);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await axios.get(`${API}/api/esg-records/stats/${section}`, { headers });
      setStats(res.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const fetchVersions = async (recordId) => {
    try {
      const res = await axios.get(`${API}/api/esg-records/records/${section}/${recordId}/versions`, { headers });
      setVersions(res.data.versions || []);
    } catch (error) {
      console.error('Failed to fetch versions:', error);
      setVersions([]);
    }
  };

  // Save record (final save)
  const handleSaveRecord = async (asDraft = false) => {
    // Validate
    const errors = {};
    if (!formData.category) errors.category = 'Required';
    if (!formData.value) errors.value = 'Required';
    
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setSaving(prev => ({ ...prev, form: true }));
    try {
      const payload = {
        ...formData,
        status: asDraft ? 'draft' : 'submitted',
        section,
        framework,
      };

      await axios.post(`${API}/api/esg-records/records/${section}`, payload, { headers });
      
      toast.success(asDraft ? 'Saved as draft' : 'Record saved');
      
      // Reset form
      setFormData({
        category: '',
        subcategory: '',
        facility_id: '',
        reporting_type: 'monthly',
        reporting_year: new Date().getFullYear(),
        reporting_month: '',
        value: '',
        unit: '',
        notes: '',
      });
      setFormErrors({});
      
      if (onRecordAdded) onRecordAdded();
    } catch (error) {
      console.error('Failed to save record:', error);
      toast.error(error.response?.data?.detail || 'Failed to save record');
    } finally {
      setSaving(prev => ({ ...prev, form: false }));
    }
  };

  // Save existing record as draft
  const saveAsDraft = async (record) => {
    setSaving(prev => ({ ...prev, [record.id]: true }));
    try {
      await axios.post(
        `${API}/api/esg-records/records/${section}/${record.id}/draft`,
        { status: 'draft' },
        { headers }
      );
      toast.success('Saved as draft');
      fetchRecords();
      fetchDrafts();
    } catch (error) {
      toast.error('Failed to save as draft');
    } finally {
      setSaving(prev => ({ ...prev, [record.id]: false }));
    }
  };

  // Discard draft
  const discardDraft = async (recordId) => {
    setSaving(prev => ({ ...prev, [`discard_${recordId}`]: true }));
    try {
      await axios.delete(`${API}/api/esg-records/drafts/${section}/${recordId}`, { headers });
      toast.success('Draft discarded');
      fetchRecords();
      fetchDrafts();
    } catch (error) {
      toast.error('Failed to discard draft');
    } finally {
      setSaving(prev => ({ ...prev, [`discard_${recordId}`]: false }));
    }
  };

  // Delete record
  const handleDelete = async (record) => {
    if (!window.confirm(`Delete this ${record.category} record?`)) return;
    
    setSaving(prev => ({ ...prev, [`delete_${record.id}`]: true }));
    try {
      await axios.delete(`${API}/api/esg-records/records/${section}/${record.id}`, { headers });
      toast.success('Record deleted');
      fetchRecords();
      fetchStats();
    } catch (error) {
      toast.error('Failed to delete record');
    } finally {
      setSaving(prev => ({ ...prev, [`delete_${record.id}`]: false }));
    }
  };

  // View version history
  const viewVersions = async (record) => {
    setSelectedRecord(record);
    await fetchVersions(record.id);
    setShowVersionsModal(true);
  };

  // View imported record details
  const viewImportedRecord = (record) => {
    setSelectedRecord(record);
    setShowImportedModal(true);
  };

  // Open edit modal
  const openEditModal = (record) => {
    setSelectedRecord(record);
    setEditData({
      value: record.value || '',
      unit: record.unit || '',
      notes: record.notes || '',
      reporting_month: record.reporting_month || '',
      reporting_year: record.reporting_year || new Date().getFullYear(),
    });
    setShowEditModal(true);
  };

  // Save edited record
  const handleSaveEdit = async (asDraft = false) => {
    if (!selectedRecord) return;
    
    setSaving(prev => ({ ...prev, edit: true }));
    try {
      await axios.put(
        `${API}/api/esg-records/records/${section}/${selectedRecord.id}`,
        {
          ...editData,
          status: asDraft ? 'draft' : 'submitted',
        },
        { headers }
      );
      
      toast.success(asDraft ? 'Saved as draft' : 'Record updated');
      setShowEditModal(false);
      setSelectedRecord(null);
      fetchRecords();
      fetchDrafts();
    } catch (error) {
      console.error('Failed to update record:', error);
      toast.error(error.response?.data?.detail || 'Failed to update record');
    } finally {
      setSaving(prev => ({ ...prev, edit: false }));
    }
  };

  // Discard edit (close modal without saving)
  const discardEdit = () => {
    setShowEditModal(false);
    setSelectedRecord(null);
    setEditData({});
  };

  // Get status badge
  const getStatusBadge = (status, isLocked = false) => {
    if (isLocked) {
      return (
        <Badge className="bg-emerald-100 text-emerald-700 gap-1">
          <CheckCircle2 className="w-3 h-3" />
          Imported from GHG Module
        </Badge>
      );
    }
    const config = {
      draft: { class: 'bg-yellow-100 text-yellow-700', icon: FileEdit, label: 'Saved as Draft' },
      submitted: { class: 'bg-blue-100 text-blue-700', icon: Clock, label: 'Pending for Approval' },
      rejected: { class: 'bg-red-100 text-red-700', icon: X, label: 'Rejected' },
      approved: { class: 'bg-green-100 text-green-700', icon: CheckCircle2, label: 'Approved' },
      saved: { class: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2, label: 'Saved' },
    };
    const cfg = config[status] || config.draft;
    const Icon = cfg.icon;
    return (
      <Badge className={`${cfg.class} gap-1`}>
        <Icon className="w-3 h-3" />
        {cfg.label}
      </Badge>
    );
  };

  // Get subcategories for selected category
  const getSubcategories = () => {
    if (!formData.category) return [];
    return [...new Set(
      categories
        .filter(c => c.category === formData.category && c.subcategory)
        .map(c => c.subcategory)
    )];
  };

  // Render Add Record Form
  if (mode === 'add') {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-emerald-600" />
          Add New Record
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Category */}
          <div className="space-y-2">
            <Label>Category *</Label>
            <Select 
              value={formData.category} 
              onValueChange={(v) => setFormData(prev => ({ ...prev, category: v, subcategory: '' }))}
            >
              <SelectTrigger className={formErrors.category ? 'border-red-500' : ''}>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {[...new Set(categories.map(c => c.category))].map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {formErrors.category && <p className="text-xs text-red-500">{formErrors.category}</p>}
          </div>

          {/* Subcategory */}
          <div className="space-y-2">
            <Label>Subcategory</Label>
            <Select 
              value={formData.subcategory} 
              onValueChange={(v) => setFormData(prev => ({ ...prev, subcategory: v }))}
              disabled={!formData.category}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select subcategory" />
              </SelectTrigger>
              <SelectContent>
                {getSubcategories().map(sub => (
                  <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Facility */}
          <div className="space-y-2">
            <Label>Facility</Label>
            <Select 
              value={formData.facility_id} 
              onValueChange={(v) => setFormData(prev => ({ ...prev, facility_id: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Organization level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="org_level">Organization Level</SelectItem>
                {facilities.map(fac => (
                  <SelectItem key={fac.id} value={fac.id}>{fac.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reporting Type */}
          <div className="space-y-2">
            <Label>Reporting Period</Label>
            <Select 
              value={formData.reporting_type} 
              onValueChange={(v) => setFormData(prev => ({ ...prev, reporting_type: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Year */}
          <div className="space-y-2">
            <Label>Year</Label>
            <Select 
              value={String(formData.reporting_year)} 
              onValueChange={(v) => setFormData(prev => ({ ...prev, reporting_year: parseInt(v) }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i + 1).map(year => (
                  <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Month (if monthly) */}
          {formData.reporting_type === 'monthly' && (
            <div className="space-y-2">
              <Label>Month</Label>
              <Select 
                value={formData.reporting_month} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, reporting_month: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month, idx) => (
                    <SelectItem key={month} value={String(idx + 1)}>{month}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Value */}
          <div className="space-y-2">
            <Label>Value *</Label>
            <Input
              type="number"
              value={formData.value}
              onChange={(e) => setFormData(prev => ({ ...prev, value: e.target.value }))}
              placeholder="Enter value"
              className={formErrors.value ? 'border-red-500' : ''}
            />
            {formErrors.value && <p className="text-xs text-red-500">{formErrors.value}</p>}
          </div>

          {/* Unit */}
          <div className="space-y-2">
            <Label>Unit</Label>
            <Input
              value={formData.unit}
              onChange={(e) => setFormData(prev => ({ ...prev, unit: e.target.value }))}
              placeholder="e.g., kWh, kg, liters"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2 md:col-span-2">
            <Label>Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Additional notes or comments..."
              rows={3}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => handleSaveRecord(true)}
            disabled={saving.form}
            className="border-yellow-300 text-yellow-700 hover:bg-yellow-50"
          >
            {saving.form ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileEdit className="w-4 h-4 mr-2" />}
            Save as Draft
          </Button>
          <Button
            onClick={() => handleSaveRecord(false)}
            disabled={saving.form}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saving.form ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Record
          </Button>
        </div>
      </Card>
    );
  }

  // Render List View
  return (
    <div className="space-y-6">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="text-2xl font-bold text-text-primary">{stats.total || 0}</div>
            <div className="text-sm text-text-muted">Total Records</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-yellow-600">{drafts.length}</div>
            <div className="text-sm text-text-muted">Drafts</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-blue-600">{stats.submitted || 0}</div>
            <div className="text-sm text-text-muted">Submitted</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-green-600">{stats.approved || 0}</div>
            <div className="text-sm text-text-muted">Approved</div>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-text-muted" />
            <span className="text-sm font-medium">Filters:</span>
          </div>
          
          <Select value={filters.category} onValueChange={(v) => setFilters(prev => ({ ...prev, category: v }))}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {[...new Set(categories.map(c => c.category))].map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.status} onValueChange={(v) => setFilters(prev => ({ ...prev, status: v }))}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.facility_id} onValueChange={(v) => setFilters(prev => ({ ...prev, facility_id: v }))}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Facility" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Facilities</SelectItem>
              {facilities.map(fac => (
                <SelectItem key={fac.id} value={fac.id}>{fac.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex-1 max-w-xs">
            <Input
              placeholder="Search..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              className="h-9"
            />
          </div>

          <Button variant="outline" size="sm" onClick={() => { fetchRecords(); fetchDrafts(); }}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </Card>

      {/* Records Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Facility</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-600" />
                </TableCell>
              </TableRow>
            ) : records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-text-muted">
                  No records found
                </TableCell>
              </TableRow>
            ) : (
              records.map(record => {
                const hasDraft = drafts.some(d => d.record_id === record.id);
                const isImported = record.source_type === 'ghg_import';
                const isLocked = record.is_locked || isImported;
                
                return (
                  <TableRow key={record.id} className={`${hasDraft ? 'bg-yellow-50' : ''} ${isImported ? 'bg-emerald-50/30' : ''}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {isImported && (
                          <Badge className="bg-emerald-100 text-emerald-700 text-xs flex items-center gap-1">
                            <Link2 className="w-3 h-3" />
                            GHG
                          </Badge>
                        )}
                        <div>
                          <div className="font-medium">{record.category}</div>
                          {record.subcategory && (
                            <div className="text-xs text-text-muted">{record.subcategory}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {record.facility_name || (
                        <span className="text-text-muted">Org Level</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {record.reporting_month && `${MONTHS[record.reporting_month - 1]} `}
                      {record.reporting_year}
                    </TableCell>
                    <TableCell>
                      <span className={`font-mono ${isImported ? 'text-emerald-700' : ''}`}>{record.value}</span>
                      {record.unit && <span className="text-text-muted ml-1">{record.unit}</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(record.status, isLocked)}
                        {hasDraft && (
                          <Badge className="bg-yellow-100 text-yellow-700 text-xs">
                            Has Draft
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-text-muted">
                      {record.updated_at ? new Date(record.updated_at).toLocaleDateString() : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {isLocked ? (
                        /* Locked record - only view allowed */
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => viewImportedRecord(record)}
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <div className="flex items-center text-emerald-600 px-2" title="Record locked - imported from GHG module">
                            <Lock className="w-4 h-4" />
                          </div>
                        </div>
                      ) : (
                        /* Editable record */
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(record)}
                            title="Edit Record"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => viewVersions(record)}
                            title="Version History"
                          >
                            <History className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(record)}
                            disabled={saving[`delete_${record.id}`]}
                            title="Delete"
                            className="text-red-600 hover:text-red-700"
                          >
                            {saving[`delete_${record.id}`] ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {pagination.total_pages > 1 && (
          <div className="flex items-center justify-between p-4 border-t">
            <span className="text-sm text-text-muted">
              Page {pagination.page} of {pagination.total_pages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page <= 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page >= pagination.total_pages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Version History Modal */}
      <Dialog open={showVersionsModal} onOpenChange={setShowVersionsModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-emerald-600" />
              Version History
            </DialogTitle>
            <DialogDescription>
              {selectedRecord?.category} - {selectedRecord?.reporting_year}
            </DialogDescription>
          </DialogHeader>
          
          <div className="max-h-[400px] overflow-y-auto">
            {versions.length === 0 ? (
              <p className="text-center py-8 text-text-muted">No version history available</p>
            ) : (
              <div className="space-y-4">
                {versions.map((version, idx) => (
                  <Card key={version.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <Badge className={
                          version.change_type === 'created' ? 'bg-green-100 text-green-700' :
                          version.change_type === 'updated' ? 'bg-blue-100 text-blue-700' :
                          version.change_type === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                          'bg-red-100 text-red-700'
                        }>
                          {version.change_type}
                        </Badge>
                        <p className="text-sm mt-2">
                          <span className="text-text-muted">By:</span>{' '}
                          <span className="font-medium">{version.changed_by_name || 'Unknown'}</span>
                        </p>
                        {version.change_type === 'updated' && (
                          <p className="text-sm text-text-muted mt-1">
                            Value changed from <span className="font-mono">{version.previous_value}</span> to{' '}
                            <span className="font-mono">{version.new_value}</span>
                          </p>
                        )}
                        {version.change_reason && (
                          <p className="text-sm text-text-muted mt-1">
                            Reason: {version.change_reason}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-text-muted">
                        {new Date(version.created_at).toLocaleString()}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Record Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-emerald-600" />
              Edit Record
            </DialogTitle>
            <DialogDescription>
              {selectedRecord?.category}
              {selectedRecord?.subcategory && ` → ${selectedRecord.subcategory}`}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Value */}
            <div className="space-y-2">
              <Label>Value *</Label>
              <Input
                type="number"
                value={editData.value}
                onChange={(e) => setEditData(prev => ({ ...prev, value: e.target.value }))}
                placeholder="Enter value"
              />
            </div>

            {/* Unit */}
            <div className="space-y-2">
              <Label>Unit</Label>
              <Input
                value={editData.unit}
                onChange={(e) => setEditData(prev => ({ ...prev, unit: e.target.value }))}
                placeholder="e.g., kWh, kg, liters"
              />
            </div>

            {/* Year */}
            <div className="space-y-2">
              <Label>Year</Label>
              <Select 
                value={String(editData.reporting_year)} 
                onValueChange={(v) => setEditData(prev => ({ ...prev, reporting_year: parseInt(v) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i + 1).map(year => (
                    <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Month */}
            <div className="space-y-2">
              <Label>Month</Label>
              <Select 
                value={String(editData.reporting_month || '')} 
                onValueChange={(v) => setEditData(prev => ({ ...prev, reporting_month: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month, idx) => (
                    <SelectItem key={month} value={String(idx + 1)}>{month}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={editData.notes}
                onChange={(e) => setEditData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={discardEdit}
              className="border-red-200 text-red-600 hover:bg-red-50"
            >
              <X className="w-4 h-4 mr-2" />
              Discard
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSaveEdit(true)}
              disabled={saving.edit}
              className="border-yellow-300 text-yellow-700 hover:bg-yellow-50"
            >
              {saving.edit ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileEdit className="w-4 h-4 mr-2" />}
              Save as Draft
            </Button>
            <Button
              onClick={() => handleSaveEdit(false)}
              disabled={saving.edit || !editData.value}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving.edit ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Imported Record View Modal */}
      <Dialog open={showImportedModal} onOpenChange={setShowImportedModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-emerald-600" />
              Imported Record Details
            </DialogTitle>
            <DialogDescription>
              This record was imported from the GHG module and is read-only.
            </DialogDescription>
          </DialogHeader>
          {selectedRecord && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-stone-500">Category</Label>
                  <p className="font-medium">{selectedRecord.category}</p>
                </div>
                <div>
                  <Label className="text-xs text-stone-500">Subcategory</Label>
                  <p className="font-medium">{selectedRecord.subcategory || '-'}</p>
                </div>
                <div>
                  <Label className="text-xs text-stone-500">Value</Label>
                  <p className="font-medium">{selectedRecord.value} {selectedRecord.unit}</p>
                </div>
                <div>
                  <Label className="text-xs text-stone-500">Period</Label>
                  <p className="font-medium">{selectedRecord.reporting_month || ''} {selectedRecord.reporting_year}</p>
                </div>
                <div>
                  <Label className="text-xs text-stone-500">Source</Label>
                  <p className="font-medium text-emerald-600">{selectedRecord.source || 'GHG Module'}</p>
                </div>
                <div>
                  <Label className="text-xs text-stone-500">Status</Label>
                  {getStatusBadge(selectedRecord.status)}
                </div>
              </div>
              {selectedRecord.notes && (
                <div>
                  <Label className="text-xs text-stone-500">Notes</Label>
                  <p className="text-sm text-stone-600 bg-stone-50 p-2 rounded">{selectedRecord.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportedModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
