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
import { ImportedRecordModal, DynamicFieldRenderer } from './ESGRecords';
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
 * @param {string} preFilterCategory - Pre-selected category from URL
 * @param {string} preFilterSubcategory - Pre-selected subcategory from URL
 */
export default function ESGRecordsDataEntry({ 
  section, 
  framework = 'BRSR', 
  mode = 'list', 
  onRecordAdded,
  preFilterCategory = '',
  preFilterSubcategory = '',
  preFilterFrequency = '',
  preFilterPeriodStart = ''
}) {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [stats, setStats] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, total_pages: 0 });
  
  // Filters - Initialize from URL params if provided
  const [filters, setFilters] = useState({
    category: preFilterCategory || '',
    status: '',
    facility_id: '',
    search: ''
  });
  
  // Modal states
  const [showVersionsModal, setShowVersionsModal] = useState(false);
  const [showImportedModal, setShowImportedModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [editData, setEditData] = useState({});
  const [versions, setVersions] = useState([]);
  const [saving, setSaving] = useState({});
  
  // Add/Edit form state
  // Map filling_frequency to reporting_type
  const getReportingTypeFromFrequency = (freq) => {
    const map = {
      'daily': 'daily',
      'weekly': 'weekly', 
      'monthly': 'monthly',
      'quarterly': 'quarterly',
      'annually': 'yearly',
      'yearly': 'yearly'
    };
    return map[freq?.toLowerCase()] || 'monthly';
  };

  // Parse period_start to extract date components based on frequency
  const getPeriodFieldsFromDate = (periodStart, frequency) => {
    if (!periodStart) return {};
    
    const date = new Date(periodStart);
    if (isNaN(date.getTime())) return {};
    
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-indexed
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    
    const freq = frequency?.toLowerCase();
    
    if (freq === 'daily' || freq === 'weekly') {
      // Format as YYYY-MM-DD for date input
      const dateStr = date.toISOString().split('T')[0];
      return { reporting_date: dateStr };
    } else if (freq === 'monthly') {
      return { reporting_year: year, reporting_month: monthNames[month] };
    } else if (freq === 'quarterly') {
      const quarter = Math.floor(month / 3) + 1;
      return { reporting_year: year, reporting_quarter: `Q${quarter}` };
    } else if (freq === 'yearly' || freq === 'annually') {
      return { reporting_year: year };
    }
    
    return { reporting_year: year };
  };

  const initialPeriodFields = getPeriodFieldsFromDate(preFilterPeriodStart, preFilterFrequency);

  const [formData, setFormData] = useState({
    category: preFilterCategory || '',
    subcategory: preFilterSubcategory || '',
    facility_id: '',
    reporting_type: preFilterFrequency ? getReportingTypeFromFrequency(preFilterFrequency) : 'monthly',
    reporting_year: initialPeriodFields.reporting_year || new Date().getFullYear(),
    reporting_month: initialPeriodFields.reporting_month || '',
    reporting_quarter: initialPeriodFields.reporting_quarter || '',
    reporting_date: initialPeriodFields.reporting_date || '',
    field_values: {},
    source_of_information: '',
    notes: '',
  });
  const [formErrors, setFormErrors] = useState({});
  const [addFormCategory, setAddFormCategory] = useState(null);

  const headers = { Authorization: `Bearer ${token}` };

  // Update filters when preFilter props change (from URL) - ONLY for add mode
  useEffect(() => {
    if (mode === 'add' && preFilterCategory) {
      const periodFields = getPeriodFieldsFromDate(preFilterPeriodStart, preFilterFrequency);
      setFormData(prev => ({
        ...prev,
        category: preFilterCategory,
        subcategory: preFilterSubcategory || '',
        reporting_type: preFilterFrequency ? getReportingTypeFromFrequency(preFilterFrequency) : prev.reporting_type,
        ...periodFields,
      }));
    }
  }, [preFilterCategory, preFilterSubcategory, preFilterFrequency, preFilterPeriodStart, mode]);

  // Fetch category config when categories are loaded and preFilter is set (for add mode)
  useEffect(() => {
    if (mode === 'add' && preFilterCategory && categories.length > 0) {
      fetchAddFormCategory(preFilterCategory, preFilterSubcategory || '');
    }
  }, [preFilterCategory, preFilterSubcategory, categories, mode]);

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

  // Fetch category config for add form when category+subcategory selected
  const fetchAddFormCategory = async (category, subcategory) => {
    const cat = categories.find(c => c.category === category && (!subcategory || c.subcategory === subcategory));
    if (cat?.id) {
      try {
        const res = await axios.get(`${API}/api/esg-records/categories/${section}/${cat.id}`, { headers });
        setAddFormCategory(res.data);
      } catch (err) {
        console.error('Failed to fetch category config:', err);
        setAddFormCategory(null);
      }
    } else {
      setAddFormCategory(null);
    }
  };

  // Save record (final save)
  const handleSaveRecord = async (asDraft = false) => {
    // Validate
    const errors = {};
    if (!formData.category) errors.category = 'Required';
    
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setSaving(prev => ({ ...prev, form: true }));
    try {
      // Find category_id
      const cat = categories.find(c => c.category === formData.category && (!formData.subcategory || c.subcategory === formData.subcategory));
      
      // Build reporting_period object based on type
      const reportingPeriod = {
        reporting_type: formData.reporting_type,
      };
      
      if (formData.reporting_type === 'daily' || formData.reporting_type === 'weekly') {
        reportingPeriod.date = formData.reporting_date;
      } else if (formData.reporting_type === 'monthly') {
        reportingPeriod.year = formData.reporting_year;
        reportingPeriod.month = formData.reporting_month;
      } else if (formData.reporting_type === 'quarterly') {
        reportingPeriod.year = formData.reporting_year;
        reportingPeriod.quarter = formData.reporting_quarter;
      } else if (formData.reporting_type === 'yearly') {
        reportingPeriod.year = formData.reporting_year;
      }
      
      const payload = {
        category: formData.category,
        subcategory: formData.subcategory,
        category_id: cat?.id,
        facility_id: formData.facility_id === 'org_level' ? null : (formData.facility_id || null),
        record_level: formData.facility_id && formData.facility_id !== 'org_level' ? 'facility' : 'organization',
        reporting_period: reportingPeriod,
        field_values: formData.field_values,
        source_of_information: formData.source_of_information,
        notes: formData.notes,
      };

      await axios.post(`${API}/api/esg-records/records/${section}`, payload, { headers });
      
      toast.success(asDraft ? 'Saved as draft' : 'Metric saved');
      
      // Reset form
      setFormData({
        category: '',
        subcategory: '',
        facility_id: '',
        reporting_type: 'monthly',
        reporting_year: new Date().getFullYear(),
        reporting_month: '',
        field_values: {},
        source_of_information: '',
        notes: '',
      });
      setFormErrors({});
      setAddFormCategory(null);
      
      if (onRecordAdded) onRecordAdded();
    } catch (error) {
      console.error('Failed to save record:', error);
      // Handle Pydantic validation errors (array of objects) or string detail
      const detail = error.response?.data?.detail;
      let errorMsg = 'Failed to save metric';
      if (typeof detail === 'string') {
        errorMsg = detail;
      } else if (Array.isArray(detail) && detail.length > 0) {
        errorMsg = detail.map(e => e.msg || e.message || JSON.stringify(e)).join(', ');
      }
      toast.error(errorMsg);
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
  const openEditModal = async (record) => {
    setSelectedRecord(record);
    setEditData({
      field_values: record.field_values || {},
      notes: record.notes || '',
      source_of_information: record.source_of_information || '',
      reporting_month: record.reporting_month || '',
      reporting_year: record.reporting_year || new Date().getFullYear(),
    });
    
    // Fetch category config for dynamic fields
    if (record.category_id) {
      try {
        const res = await axios.get(
          `${API}/api/esg-records/categories/${section}/${record.category_id}`,
          { headers }
        );
        setSelectedCategory(res.data);
      } catch (err) {
        console.error('Failed to fetch category config:', err);
        setSelectedCategory(null);
      }
    }
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
          field_values: editData.field_values,
          notes: editData.notes,
          source_of_information: editData.source_of_information,
          status: asDraft ? 'draft' : 'submitted',
        },
        { headers }
      );
      
      toast.success(asDraft ? 'Saved as draft' : 'Metric updated');
      setShowEditModal(false);
      setSelectedRecord(null);
      setSelectedCategory(null);
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
    setSelectedCategory(null);
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
      draft: { class: 'bg-yellow-100 text-yellow-700', icon: FileEdit, label: 'Draft' },
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

  // Render Add Metric Form
  if (mode === 'add') {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-emerald-600" />
          Add New Metric
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Category */}
          <div className="space-y-2">
            <Label>Category *</Label>
            <Select 
              value={formData.category} 
              onValueChange={(v) => {
                setFormData(prev => ({ ...prev, category: v, subcategory: '', field_values: {} }));
                fetchAddFormCategory(v, '');
              }}
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
              onValueChange={(v) => {
                setFormData(prev => ({ ...prev, subcategory: v, field_values: {} }));
                fetchAddFormCategory(formData.category, v);
              }}
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
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Year (for monthly, quarterly, yearly) */}
          {['monthly', 'quarterly', 'yearly'].includes(formData.reporting_type) && (
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
          )}

          {/* Date picker for daily/weekly */}
          {['daily', 'weekly'].includes(formData.reporting_type) && (
            <div className="space-y-2">
              <Label>Date</Label>
              <Input 
                type="date" 
                value={formData.reporting_date || ''} 
                onChange={(e) => setFormData(prev => ({ ...prev, reporting_date: e.target.value }))}
              />
            </div>
          )}

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
        </div>

        {/* Dynamic Category Fields */}
        {addFormCategory?.fields?.length > 0 && (
          <div className="mt-6 pt-4 border-t space-y-4">
            <p className="text-sm font-medium text-text-primary">Category Fields</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {addFormCategory.fields.map(field => (
                <DynamicFieldRenderer
                  key={field.field_key}
                  field={field}
                  value={formData.field_values?.[field.field_key]}
                  onChange={(val) => setFormData(prev => ({
                    ...prev,
                    field_values: { ...prev.field_values, [field.field_key]: val }
                  }))}
                />
              ))}
            </div>
          </div>
        )}

        {/* Common Fields */}
        <div className="mt-6 pt-4 border-t grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Source of Information */}
          <div className="space-y-2">
            <Label>Source of Information</Label>
            <Input
              value={formData.source_of_information}
              onChange={(e) => setFormData(prev => ({ ...prev, source_of_information: e.target.value }))}
              placeholder="e.g., Utility Bill, Vendor Invoice..."
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
            Save Metric
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
            <div className="text-sm text-text-muted">Total Metrics</div>
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
                  No metrics found
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
                      ) : record.status === 'rejected' ? (
                        /* Rejected record - show Edit & Resubmit */
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => openEditModal(record)}
                            className="bg-amber-600 hover:bg-amber-700 gap-1"
                            title="Edit & Resubmit"
                          >
                            <Edit2 className="w-4 h-4" />
                            Resubmit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => viewVersions(record)}
                            title="Version History"
                          >
                            <History className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        /* Editable record */
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(record)}
                            title="Edit Metric"
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

      {/* Edit Metric Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-emerald-600" />
              Edit Metric
            </DialogTitle>
            <DialogDescription>
              {selectedRecord?.category}
              {selectedRecord?.subcategory && ` → ${selectedRecord.subcategory}`}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Dynamic Category Fields */}
            {selectedCategory?.fields?.length > 0 ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-text-primary">Category Fields</p>
                {selectedCategory.fields.map(field => (
                  <DynamicFieldRenderer
                    key={field.field_key}
                    field={field}
                    value={editData.field_values?.[field.field_key]}
                    onChange={(val) => setEditData(prev => ({
                      ...prev,
                      field_values: { ...prev.field_values, [field.field_key]: val }
                    }))}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-stone-500 italic">No configured fields for this category.</p>
            )}

            {/* Source of Information */}
            <div className="space-y-2 pt-3 border-t">
              <Label>Source of Information</Label>
              <Input
                value={editData.source_of_information || ''}
                onChange={(e) => setEditData(prev => ({ ...prev, source_of_information: e.target.value }))}
                placeholder="e.g., Utility Bill, Vendor Invoice..."
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={editData.notes || ''}
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
              disabled={saving.edit}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving.edit ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Imported Record Modal (from ESGRecords) */}
      <ImportedRecordModal
        open={showImportedModal}
        onClose={() => setShowImportedModal(false)}
        record={selectedRecord}
      />
    </div>
  );
}
