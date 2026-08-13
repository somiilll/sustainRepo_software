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

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from './ui/card';
import WorkforceDataTable from './WorkforceDataTable';
import {
  EMPLOYEE_DIVERSITY_CONFIG,
  WORKER_DIVERSITY_CONFIG,
  BOD_DIVERSITY_CONFIG,
  KMP_DIVERSITY_CONFIG,
  EMPLOYEE_TURNOVER_CONFIG,
  WORKER_TURNOVER_CONFIG,
  EMPLOYEE_PARENTAL_LEAVE_CONFIG,
  WORKER_PARENTAL_LEAVE_CONFIG,
  GENERAL_TRAINING_CONFIG,
} from '../config/workforceTableConfigs';

const WORKFORCE_TABLE_MAP = {
  'Employee Diversity': EMPLOYEE_DIVERSITY_CONFIG,
  'Workers Diversity': WORKER_DIVERSITY_CONFIG,
  'Board of Directors Diversity': BOD_DIVERSITY_CONFIG,
  'Key Management Personnel Diversity': KMP_DIVERSITY_CONFIG,
  'Employee Turnover': EMPLOYEE_TURNOVER_CONFIG,
  'Workers Turnover': WORKER_TURNOVER_CONFIG,
  'Employees Parental Leave': EMPLOYEE_PARENTAL_LEAVE_CONFIG,
  'Workers Parental Leave': WORKER_PARENTAL_LEAVE_CONFIG,
  'General Training': GENERAL_TRAINING_CONFIG,
};
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { toast } from 'sonner';
import { ImportedRecordModal, DynamicFieldRenderer } from './ESGRecords';
import { OperationalStatusBadge, ApprovalStatusBadge } from './tasks/StatusBadge';
import { 
  Plus, Search, Filter, History, FileText, Upload, 
  ChevronLeft, ChevronRight, Loader2, Building2, Calendar,
  Trash2, Edit2, Eye, X, Save, FileEdit, RefreshCw,
  CheckCircle2, Clock, AlertTriangle, Lock, Link2, Paperclip, Download,
  ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = BACKEND_URL;

// Months for monthly reporting
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Sortable header component for table columns
const SortableTableHead = ({ label, sortKey, currentSort, onSort, className = '' }) => {
  const isActive = currentSort.key === sortKey;
  const Icon = isActive ? (currentSort.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  
  return (
    <TableHead className={className}>
      <button
        onClick={() => onSort(sortKey)}
        className="flex items-center gap-1 hover:text-stone-900 transition-colors"
      >
        <span>{label}</span>
        <Icon className={`w-3 h-3 ${isActive ? 'text-emerald-600' : 'text-stone-400'}`} />
      </button>
    </TableHead>
  );
};

// "Others" is a virtual category that groups: Climate Change, Material, Other Emissions
const OTHERS_CATEGORIES = ['Climate Change', 'Material', 'Other Emissions'];
const isOthersCategory = (category) => category === 'Others';

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
    subcategory: preFilterSubcategory || '',
    status: '',
    facility_id: '',
    search: ''
  });
  
  // Sorting state
  const [sort, setSort] = useState({ key: null, direction: 'desc' });
  
  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  
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
    
    // Extract date parts directly from string to avoid timezone issues
    // period_start can be "2026-01-02" or "2026-01-02T00:00:00" or "2026-01-02 00:00:00"
    const dateStr = periodStart.split('T')[0].split(' ')[0]; // Get just YYYY-MM-DD
    const parts = dateStr.split('-');
    if (parts.length < 3) return {};
    
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10); // 1-indexed (1=Jan, 2=Feb, etc.)
    const day = parseInt(parts[2], 10);
    
    if (isNaN(year) || isNaN(month) || isNaN(day)) return {};
    
    const freq = frequency?.toLowerCase();
    
    if (freq === 'daily' || freq === 'weekly') {
      // Return the date string directly in YYYY-MM-DD format
      return { reporting_date: dateStr };
    } else if (freq === 'monthly') {
      // Return month as string number to match dropdown value
      return { reporting_year: year, reporting_month: String(month) };
    } else if (freq === 'quarterly') {
      const quarter = Math.ceil(month / 3);
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

  // Evidence file states
  const [formEvidences, setFormEvidences] = useState([]);
  const [editEvidences, setEditEvidences] = useState([]);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);

  const handleEvidenceUpload = async (files, isEdit = false) => {
    if (!files || files.length === 0) return;
    setUploadingEvidence(true);
    const newEvidences = [];

    for (const file of Array.from(files)) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} exceeds 5MB limit`);
        continue;
      }
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);
      try {
        const res = await axios.post(
          `${API}/api/upload/evidence?bucket_type=esg_metrics&folder=${section}`,
          uploadFormData,
          { headers: { ...headers, 'Content-Type': 'multipart/form-data' } }
        );
        newEvidences.push({
          id: res.data.file_id,
          filename: file.name,
          file_type: file.name.split('.').pop() || 'unknown',
          file_size: file.size,
          upload_url: `/api/files/${res.data.file_id}`,
          uploaded_at: new Date().toISOString(),
          uploaded_by: user?.id || '',
        });
      } catch (err) {
        toast.error(`Failed to upload ${file.name}`);
      }
    }
    if (newEvidences.length > 0) {
      if (isEdit) {
        setEditEvidences(prev => [...prev, ...newEvidences]);
      } else {
        setFormEvidences(prev => [...prev, ...newEvidences]);
      }
      toast.success(`${newEvidences.length} file(s) uploaded`);
    }
    setUploadingEvidence(false);
  };

  const removeEvidence = async (evidenceId, isEdit = false) => {
    try {
      await axios.delete(`${API}/api/files/${evidenceId}`, { headers });
    } catch (e) { /* ignore */ }
    if (isEdit) {
      setEditEvidences(prev => prev.filter(e => e.id !== evidenceId));
    } else {
      setFormEvidences(prev => prev.filter(e => e.id !== evidenceId));
    }
  };
  const [reportingYearType, setReportingYearType] = useState('financial_year');

  const headers = { Authorization: `Bearer ${token}` };

  // Update filters when preFilter props change (from URL) - ONLY for add mode
  useEffect(() => {
    if (mode === 'add' && preFilterCategory) {
      const periodFields = getPeriodFieldsFromDate(preFilterPeriodStart, preFilterFrequency);
      console.log('ESGRecordsDataEntry - preFilterPeriodStart:', preFilterPeriodStart, 'preFilterFrequency:', preFilterFrequency, 'periodFields:', periodFields);
      
      // Don't pre-set category for "Others" - let user choose from Climate Change, Material, Other Emissions
      const categoryToSet = isOthersCategory(preFilterCategory) ? '' : preFilterCategory;
      
      setFormData(prev => ({
        ...prev,
        category: categoryToSet,
        subcategory: preFilterSubcategory || '',
        reporting_type: preFilterFrequency ? getReportingTypeFromFrequency(preFilterFrequency) : prev.reporting_type,
        ...periodFields,
      }));
    }
  }, [preFilterCategory, preFilterSubcategory, preFilterFrequency, preFilterPeriodStart, mode]);

  // Fetch category config when categories are loaded and preFilter is set (for add mode)
  useEffect(() => {
    // Skip fetching category config for "Others" since it's a virtual category
    if (mode === 'add' && preFilterCategory && categories.length > 0 && !isOthersCategory(preFilterCategory)) {
      fetchAddFormCategory(preFilterCategory, preFilterSubcategory || '');
    }
  }, [preFilterCategory, preFilterSubcategory, categories, mode]);

  // Fetch base data
  useEffect(() => {
    fetchCategories();
    fetchFacilities();
    fetchReportingYearType();
  }, [section]);

  const fetchReportingYearType = async () => {
    try {
      const res = await axios.get(`${API}/api/organizations/my`, { headers });
      setReportingYearType(res.data.reporting_year_type || 'financial_year');
    } catch (error) {
      console.error('Failed to fetch reporting year type:', error);
    }
  };

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

  // Handle sort toggle
  const handleSort = (key) => {
    setSort(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Get period string for sorting
  const getPeriodSortValue = (record) => {
    const rp = record.reporting_period || {};
    const year = rp.year || rp.financial_year || rp.calendar_year || 0;
    const month = rp.month || '00';
    const quarter = rp.quarter || '';
    // Create sortable string: YYYY-MM or YYYY-QQ
    if (quarter) {
      const qNum = quarter.replace('Q', '');
      return `${year}-Q${qNum}`;
    }
    return `${year}-${String(month).padStart(2, '0')}`;
  };

  // Sorted records
  const sortedRecords = useMemo(() => {
    if (!sort.key) return records;
    
    return [...records].sort((a, b) => {
      let aVal, bVal;
      
      switch (sort.key) {
        case 'category':
          aVal = `${a.category || ''} ${a.subcategory || ''}`.toLowerCase();
          bVal = `${b.category || ''} ${b.subcategory || ''}`.toLowerCase();
          break;
        case 'facility':
          aVal = (a.facility_name || 'zzz').toLowerCase(); // 'zzz' puts Org Level at end
          bVal = (b.facility_name || 'zzz').toLowerCase();
          break;
        case 'period':
          aVal = getPeriodSortValue(a);
          bVal = getPeriodSortValue(b);
          break;
        case 'status':
          aVal = (a.operational_status || a.status || '').toLowerCase();
          bVal = (b.operational_status || b.status || '').toLowerCase();
          break;
        case 'updated':
          aVal = a.updated_at || a.created_at || '';
          bVal = b.updated_at || b.created_at || '';
          break;
        default:
          return 0;
      }
      
      if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [records, sort]);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        framework
      };
      
      // Handle "Others" as a virtual category that maps to multiple real categories
      if (isOthersCategory(filters.category) || isOthersCategory(preFilterCategory)) {
        params.categories = OTHERS_CATEGORIES.join(',');
      } else if (filters.category) {
        params.category = filters.category;
      }
      
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
      const params = {};
      // Handle "Others" as a virtual category
      if (isOthersCategory(filters.category) || isOthersCategory(preFilterCategory)) {
        params.categories = OTHERS_CATEGORIES.join(',');
      } else if (filters.category) {
        params.category = filters.category;
      }
      if (filters.subcategory) params.subcategory = filters.subcategory;
      const res = await axios.get(`${API}/api/esg-records/stats/${section}`, { params, headers });
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
    if (!asDraft && formData.reporting_type === 'monthly' && !formData.reporting_month) errors.reporting_month = 'Month is required';
    if (!asDraft && formData.reporting_type === 'quarterly' && !formData.reporting_quarter) errors.reporting_quarter = 'Quarter is required';
    if (!asDraft && ['daily', 'weekly'].includes(formData.reporting_type) && !formData.reporting_date) errors.reporting_date = 'Date is required';
    
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
        // For financial year, calculate actual calendar year based on month
        // FY runs Apr-Mar, so Jan/Feb/Mar belong to the next calendar year
        let actualYear = formData.reporting_year;
        if (reportingYearType === 'financial_year') {
          const monthNum = typeof formData.reporting_month === 'number' 
            ? formData.reporting_month 
            : MONTHS.indexOf(formData.reporting_month) + 1;
          // Jan (1), Feb (2), Mar (3) belong to next calendar year in FY
          if (monthNum >= 1 && monthNum <= 3) {
            actualYear = formData.reporting_year + 1;
          }
        }
        reportingPeriod.year = actualYear;
        reportingPeriod.month = formData.reporting_month;
      } else if (formData.reporting_type === 'quarterly') {
        reportingPeriod.year = formData.reporting_year;
        reportingPeriod.quarter = formData.reporting_quarter;
      } else if (formData.reporting_type === 'yearly') {
        reportingPeriod.year = formData.reporting_year;
        reportingPeriod.year_type = reportingYearType === 'calendar_year' ? 'calendar' : 'financial';
        if (reportingPeriod.year_type === 'financial') {
          reportingPeriod.financial_year = `FY ${formData.reporting_year}-${formData.reporting_year + 1}`;
        } else {
          reportingPeriod.calendar_year = `CY ${formData.reporting_year}`;
        }
      }
      
      const payload = {
        category: formData.category,
        subcategory: formData.subcategory,
        category_id: cat?.id,
        facility_id: formData.facility_id === 'org_level' ? null : (formData.facility_id || null),
        record_level: formData.facility_id && formData.facility_id !== 'org_level' ? 'facility' : 'organization',
        reporting_period: reportingPeriod,
        field_values: formData.field_values,
        evidence_files: formEvidences,
        source_of_information: formData.source_of_information,
        notes: formData.notes,
        status: asDraft ? 'draft' : 'completed',  // Send status to backend
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
        reporting_quarter: '',
        reporting_date: '',
        field_values: {},
        source_of_information: '',
        notes: '',
      });
      setFormErrors({});
      setAddFormCategory(null);
      setFormEvidences([]);
      
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

  // Bulk selection handlers
  const handleSelectRecord = (id) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === sortedRecords.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedRecords.map(r => r.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    
    if (!window.confirm(`Delete ${selectedIds.size} record(s)? This action cannot be undone.`)) {
      return;
    }
    
    setBulkDeleting(true);
    try {
      // Track results for each delete request to handle approval workflows
      let deletedCount = 0;
      let queuedForApprovalCount = 0;
      let failedCount = 0;
      
      // Process each delete individually to handle approval workflow responses
      for (const id of Array.from(selectedIds)) {
        try {
          const response = await axios.delete(`${API}/api/esg-records/records/${section}/${id}`, { headers });
          // Check if queued for approval vs direct delete
          if (response.data?.message?.toLowerCase().includes('submitted for approval')) {
            queuedForApprovalCount++;
          } else {
            deletedCount++;
          }
        } catch (error) {
          failedCount++;
        }
      }
      
      // Show appropriate toast messages based on results
      if (deletedCount > 0) {
        toast.success(`${deletedCount} record(s) deleted`);
      }
      if (queuedForApprovalCount > 0) {
        toast.info(`${queuedForApprovalCount} record(s) submitted for approval`);
      }
      if (failedCount > 0) {
        toast.error(`${failedCount} record(s) could not be deleted`);
      }
      
      setSelectedIds(new Set());
      fetchRecords();
      fetchStats();
    } catch (error) {
      toast.error('Failed to delete some records');
    } finally {
      setBulkDeleting(false);
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
    
    // Extract reporting period info
    const reportingPeriod = record.reporting_period || {};
    
    // Normalize month value - could be number (8), string number ("8"), or month name ("August")
    let normalizedMonth = reportingPeriod.month || '';
    if (normalizedMonth) {
      // If it's a number or numeric string, keep as string number for dropdown
      if (typeof normalizedMonth === 'number') {
        normalizedMonth = String(normalizedMonth);
      } else if (typeof normalizedMonth === 'string') {
        // Check if it's a month name and convert to number
        const monthIndex = MONTHS.indexOf(normalizedMonth);
        if (monthIndex !== -1) {
          normalizedMonth = String(monthIndex + 1); // Convert to 1-indexed string
        }
        // If it's already a numeric string like "8", keep it as is
      }
    }
    
    // If user has a pending proposal, show their proposed values instead of record values
    const hasPendingProposal = !!record._user_pending_proposal;
    const fieldValues = hasPendingProposal 
      ? (record._user_pending_proposal.proposed_values || record.field_values || {})
      : (record.field_values || {});
    
    setEditData({
      field_values: fieldValues,
      subcategory: record.subcategory || '',
      notes: record.notes || '',
      source_of_information: record.source_of_information || '',
      // Reporting period fields
      reporting_type: reportingPeriod.reporting_type || 'monthly',
      reporting_year: reportingPeriod.year || new Date().getFullYear(),
      reporting_month: normalizedMonth,
      reporting_quarter: reportingPeriod.quarter || '',
      reporting_date: reportingPeriod.date || '',
      // Facility/org level
      facility_id: record.facility_id || '',
      record_level: record.record_level || 'organization',
      // Track if viewing pending proposal
      _viewing_pending_proposal: hasPendingProposal,
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
    // Load existing evidences
    setEditEvidences(record.evidence_files || []);
    
    setShowEditModal(true);
  };

  // Save edited record
  const handleSaveEdit = async (asDraft = false) => {
    if (!selectedRecord) return;
    const yearlyType = reportingYearType === 'calendar_year' ? 'calendar' : 'financial';
    
    setSaving(prev => ({ ...prev, edit: true }));
    try {
      // Build reporting_period object based on type
      const reportingPeriod = {
        reporting_type: editData.reporting_type,
      };
      
      if (editData.reporting_type === 'daily' || editData.reporting_type === 'weekly') {
        reportingPeriod.date = editData.reporting_date;
      } else if (editData.reporting_type === 'monthly') {
        // For financial year, calculate actual calendar year based on month
        // FY runs Apr-Mar, so Jan/Feb/Mar belong to the next calendar year
        let actualYear = editData.reporting_year;
        if (reportingYearType === 'financial_year') {
          const monthNum = typeof editData.reporting_month === 'number' 
            ? editData.reporting_month 
            : MONTHS.indexOf(editData.reporting_month) + 1;
          // Jan (1), Feb (2), Mar (3) belong to next calendar year in FY
          if (monthNum >= 1 && monthNum <= 3) {
            actualYear = editData.reporting_year + 1;
          }
        }
        reportingPeriod.year = actualYear;
        reportingPeriod.month = editData.reporting_month;
      } else if (editData.reporting_type === 'quarterly') {
        reportingPeriod.year = editData.reporting_year;
        reportingPeriod.quarter = editData.reporting_quarter;
      } else if (editData.reporting_type === 'yearly') {
        reportingPeriod.year = editData.reporting_year;
        reportingPeriod.year_type = yearlyType;
        if (yearlyType === 'financial') {
          reportingPeriod.financial_year = `FY ${editData.reporting_year}-${editData.reporting_year + 1}`;
        } else {
          reportingPeriod.calendar_year = `CY ${editData.reporting_year}`;
        }
      }
      
      await axios.put(
        `${API}/api/esg-records/records/${section}/${selectedRecord.id}`,
        {
          field_values: editData.field_values,
          notes: editData.notes,
          source_of_information: editData.source_of_information,
          evidence_files: editEvidences,
          status: asDraft ? 'draft' : 'completed',
          // Include reporting period and facility changes
          reporting_period: reportingPeriod,
          facility_id: editData.facility_id === 'org_level' ? null : (editData.facility_id || null),
          record_level: editData.facility_id && editData.facility_id !== 'org_level' ? 'facility' : 'organization',
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
      const errorDetail = error.response?.data?.detail;
      
      // Handle structured error response (object with error/message)
      if (errorDetail && typeof errorDetail === 'object') {
        // Show the message, and if rejection reason exists, show it too
        const message = errorDetail.message || 'Failed to update record';
        if (errorDetail.rejection_reason) {
          toast.error(`${message}\n\nRejection reason: ${errorDetail.rejection_reason}`);
        } else {
          toast.error(message);
        }
      } else {
        toast.error(errorDetail || 'Failed to update record');
      }
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

  /**
   * Render dual status badges for a record using the new architecture:
   * - status: operational completion (completed, draft, reopened, etc.)
   * - approval_status: governance state (not_required, pending_approval, approved, rejected)
   * 
   * Legacy status mapping:
   * - 'saved' → completed (no approval needed)
   * - 'submitted' → completed (check approval_status for whether approval is needed)
   * - null/undefined → pending
   * 
   * Multi-proposal workflow:
   * - If user has a pending proposal (_user_pending_proposal), show "Awaiting Approval"
   */
  const renderRecordStatusBadges = (record, isLocked = false) => {
    if (isLocked) {
      return (
        <Badge className="bg-emerald-100 text-emerald-700 gap-1">
          <CheckCircle2 className="w-3 h-3" />
          Imported from GHG Module
        </Badge>
      );
    }
    
    const operationalStatus = record.status;
    const approvalStatus = record.approval_status;
    const hasPendingProposal = !!record._user_pending_proposal;
    
    // Draft status - show draft badge
    if (operationalStatus === 'draft') {
      return (
        <Badge className="bg-yellow-100 text-yellow-700 gap-1">
          <FileEdit className="w-3 h-3" />
          Draft
        </Badge>
      );
    }
    
    // Map legacy statuses to new dual-status architecture
    let displayStatus = operationalStatus;
    let displayApprovalStatus = approvalStatus;
    
    // If user has a pending proposal, show "pending_approval" regardless of record status
    if (hasPendingProposal) {
      displayApprovalStatus = 'pending_approval';
    }
    // Legacy 'saved' status = completed with no approval needed
    else if (operationalStatus === 'saved') {
      displayStatus = 'completed';
      displayApprovalStatus = 'not_required';
    }
    // Legacy 'submitted' status - only show approval if approval_status explicitly says so
    else if (operationalStatus === 'submitted') {
      displayStatus = 'completed';
      // If approval_status is not set, assume no approval workflow (legacy data)
      displayApprovalStatus = approvalStatus || 'not_required';
    }
    // No status (pending/null)
    else if (!operationalStatus || operationalStatus === 'pending') {
      displayStatus = 'pending';
      displayApprovalStatus = 'not_required';
    }
    // For new dual-status records, use approval_status as-is
    else {
      displayApprovalStatus = approvalStatus || 'not_required';
    }
    
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <OperationalStatusBadge status={displayStatus} showIcon={true} />
        <ApprovalStatusBadge approvalStatus={displayApprovalStatus} showIcon={true} />
      </div>
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
    const hasFields = WORKFORCE_TABLE_MAP[formData.subcategory] || addFormCategory?.fields?.length > 0;
    const yearLabel = reportingYearType === 'financial_year' ? 'Financial Year' : (formData.reporting_type === 'yearly' && reportingYearType === 'calendar_year' ? 'Calendar Year' : 'Year');

    return (
      <div className="flex gap-6 items-start" data-testid="add-metric-layout">
        {/* ── Left Panel: Selection ── */}
        <Card className="w-[320px] shrink-0 p-5 sticky top-4 space-y-4 bg-stone-50/70" data-testid="add-metric-left-panel">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-600" />
            Add Metric
          </h3>

          <div className="space-y-2">
            <Label className="text-xs">Category *</Label>
            <Select 
              value={formData.category} 
              onValueChange={(v) => {
                setFormData(prev => ({ ...prev, category: v, subcategory: '', field_values: {} }));
                fetchAddFormCategory(v, '');
              }}
              disabled={!!preFilterCategory && !isOthersCategory(preFilterCategory)}
            >
              <SelectTrigger className={`h-9 ${formErrors.category ? 'border-red-500' : ''}`}>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {isOthersCategory(preFilterCategory)
                  ? OTHERS_CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)
                  : [...new Set(categories.map(c => c.category))].map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)
                }
              </SelectContent>
            </Select>
            {formErrors.category && <p className="text-xs text-red-500">{formErrors.category}</p>}
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Subcategory</Label>
            <Select 
              value={formData.subcategory} 
              onValueChange={(v) => {
                setFormData(prev => ({ ...prev, subcategory: v, field_values: {} }));
                fetchAddFormCategory(formData.category, v);
              }}
              disabled={!formData.category}
            >
              <SelectTrigger className="h-9"><SelectValue placeholder="Select subcategory" /></SelectTrigger>
              <SelectContent>
                {getSubcategories().map(sub => <SelectItem key={sub} value={sub}>{sub}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Facility</Label>
            <Select 
              value={formData.facility_id} 
              onValueChange={(v) => setFormData(prev => ({ ...prev, facility_id: v }))}
            >
              <SelectTrigger className="h-9"><SelectValue placeholder="Organization level" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="org_level">Organization Level</SelectItem>
                {facilities.map(fac => <SelectItem key={fac.id} value={fac.id}>{fac.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Reporting Period</Label>
            <Select 
              value={formData.reporting_type} 
              onValueChange={(v) => setFormData(prev => ({ ...prev, reporting_type: v }))}
            >
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {['monthly', 'quarterly', 'yearly'].includes(formData.reporting_type) && (
            <div className="space-y-2">
              <Label className="text-xs">{yearLabel}</Label>
              <Select 
                key={`year-${reportingYearType}-${formData.reporting_type}`}
                value={String(formData.reporting_year)} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, reporting_year: parseInt(v) }))}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i + 1).map(year => (
                    <SelectItem key={year} value={String(year)}>
                      {reportingYearType === 'financial_year' ? `FY ${year}-${year + 1}` : (formData.reporting_type === 'yearly' ? `CY ${year}` : year)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {['daily', 'weekly'].includes(formData.reporting_type) && (
            <div className="space-y-2">
              <Label className="text-xs">Date</Label>
              <Input 
                className="h-9"
                type="date" 
                value={formData.reporting_date || ''} 
                onChange={(e) => setFormData(prev => ({ ...prev, reporting_date: e.target.value }))}
              />
            </div>
          )}

          {formData.reporting_type === 'monthly' && (
            <div className="space-y-2">
              <Label className="text-xs">Month *</Label>
              <Select 
                value={formData.reporting_month} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, reporting_month: v }))}
              >
                <SelectTrigger className="h-9"><SelectValue placeholder="Select month" /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month, idx) => <SelectItem key={month} value={String(idx + 1)}>{month}</SelectItem>)}
                </SelectContent>
              </Select>
              {formErrors.reporting_month && <p className="text-xs text-red-500">{formErrors.reporting_month}</p>}
            </div>
          )}

          {/* Quarter (if quarterly) */}
          {formData.reporting_type === 'quarterly' && (
            <div className="space-y-2">
              <Label className="text-xs">Quarter *</Label>
              <Select 
                value={formData.reporting_quarter} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, reporting_quarter: v }))}
              >
                <SelectTrigger className="h-9"><SelectValue placeholder="Select quarter" /></SelectTrigger>
                <SelectContent>
                  {['Q1', 'Q2', 'Q3', 'Q4'].map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </Card>

        {/* ── Right Panel: Data Entry ── */}
        <div className="flex-1 min-w-0" data-testid="add-metric-right-panel">
          {!hasFields ? (
            <Card className="p-10 text-center border-dashed">
              <div className="text-stone-400 space-y-2">
                <FileText className="w-10 h-10 mx-auto opacity-50" />
                <p className="font-medium text-stone-500">Select a category to begin</p>
                <p className="text-sm">Choose a category and subcategory from the left panel to load the data entry fields.</p>
              </div>
            </Card>
          ) : (
            <Card className="p-5 space-y-5">
              {/* Dynamic Category Fields */}
              {WORKFORCE_TABLE_MAP[formData.subcategory] ? (
                <WorkforceDataTable
                  config={WORKFORCE_TABLE_MAP[formData.subcategory]}
                  fieldValues={formData.field_values}
                  onChange={(fv) => setFormData(prev => ({ ...prev, field_values: fv }))}
                  isEditing={true}
                />
              ) : (
                <div className="space-y-4">
                  <p className="text-sm font-medium text-stone-700">
                    {formData.subcategory || formData.category} Fields
                  </p>
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
                        unitValue={formData.field_values?.[`${field.field_key}_unit`]}
                        onUnitChange={(unit) => setFormData(prev => ({
                          ...prev,
                          field_values: { ...prev.field_values, [`${field.field_key}_unit`]: unit }
                        }))}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Source & Notes */}
              <div className="pt-4 border-t space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">Source of Information</Label>
                  <Input
                    value={formData.source_of_information}
                    onChange={(e) => setFormData(prev => ({ ...prev, source_of_information: e.target.value }))}
                    placeholder="e.g., Utility Bill, Vendor Invoice..."
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Notes</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Additional notes or comments..."
                    rows={3}
                  />
                </div>
              </div>

              {/* Evidence */}
              <div className="pt-4 border-t space-y-3">
                <Label className="text-xs flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5" /> Evidence Files
                </Label>
                {formEvidences.length > 0 && (
                  <div className="space-y-1.5">
                    {formEvidences.map(ev => (
                      <div key={ev.id} className="flex items-center gap-2 p-2 bg-stone-50 rounded text-sm">
                        <FileText className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                        <span className="flex-1 truncate">{ev.filename}</span>
                        <span className="text-xs text-stone-400">{(ev.file_size / 1024).toFixed(0)}KB</span>
                        <a href={`${BACKEND_URL}${ev.upload_url}/view`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">View</a>
                        <button type="button" onClick={() => removeEvidence(ev.id, false)} className="text-red-400 hover:text-red-600">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div
                  className="border-2 border-dashed border-stone-300 rounded-lg p-3 text-center hover:border-emerald-400 transition-colors cursor-pointer"
                  onClick={() => document.getElementById('add-evidence-upload')?.click()}
                >
                  <input id="add-evidence-upload" type="file" className="hidden" multiple
                    onChange={(e) => { handleEvidenceUpload(e.target.files, false); e.target.value = ''; }}
                  />
                  {uploadingEvidence
                    ? <Loader2 className="w-4 h-4 animate-spin mx-auto text-emerald-600" />
                    : <>
                        <Upload className="w-4 h-4 mx-auto text-stone-400 mb-1" />
                        <p className="text-xs text-stone-500">Drop files or click to upload (max 5MB each)</p>
                      </>
                  }
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => handleSaveRecord(true)} disabled={saving.form}
                  className="border-yellow-300 text-yellow-700 hover:bg-yellow-50">
                  {saving.form ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileEdit className="w-4 h-4 mr-2" />}
                  Save as Draft
                </Button>
                <Button onClick={() => handleSaveRecord(false)} disabled={saving.form}
                  className="bg-emerald-600 hover:bg-emerald-700">
                  {saving.form ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  Save Metric
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
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
            <div className="text-2xl font-bold text-yellow-600">{stats.drafts || 0}</div>
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

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <Card className="p-3 bg-amber-50 border-amber-200 flex items-center justify-between">
          <span className="text-sm text-amber-800">
            {selectedIds.size} record{selectedIds.size > 1 ? 's' : ''} selected
          </span>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="bg-red-600 hover:bg-red-700"
          >
            {bulkDeleting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4 mr-2" />
            )}
            Delete Selected
          </Button>
        </Card>
      )}

      {/* Records Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={sortedRecords.length > 0 && selectedIds.size === sortedRecords.length}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <SortableTableHead label="Category" sortKey="category" currentSort={sort} onSort={handleSort} />
              <SortableTableHead label="Facility" sortKey="facility" currentSort={sort} onSort={handleSort} />
              <SortableTableHead label="Period" sortKey="period" currentSort={sort} onSort={handleSort} />
              <SortableTableHead label="Status" sortKey="status" currentSort={sort} onSort={handleSort} />
              <SortableTableHead label="Updated" sortKey="updated" currentSort={sort} onSort={handleSort} />
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
              sortedRecords.map(record => {
                const hasDraft = drafts.some(d => d.record_id === record.id);
                const isImported = record.source_type === 'ghg_import';
                const isLocked = record.is_locked || isImported;
                const reportingPeriod = record.reporting_period || {};
                const reportingMonth = reportingPeriod.month;
                const reportingYear = reportingPeriod.year;
                
                // For monthly/quarterly: show simple "Month Year" or "Q1 Year" format
                // For yearly: show "FY XXXX-XX" or "CY XXXX"
                let periodLabel = '-';
                if (reportingPeriod.reporting_type === 'yearly') {
                  periodLabel = reportingPeriod.financial_year || reportingPeriod.calendar_year || `FY ${reportingYear}-${reportingYear + 1}`;
                } else if (reportingPeriod.reporting_type === 'quarterly') {
                  periodLabel = `${reportingPeriod.quarter || ''} ${reportingYear || ''}`.trim();
                } else if (reportingPeriod.reporting_type === 'monthly' || reportingPeriod.reporting_type === 'daily') {
                  // Simple format: "June 2026" or "Feb 2027"
                  const monthDisplay = reportingMonth 
                    ? (MONTHS[Number(reportingMonth) - 1] || reportingMonth)
                    : '';
                  periodLabel = `${monthDisplay} ${reportingYear || ''}`.trim() || '-';
                }
                
                return (
                  <TableRow key={record.id} className={`${hasDraft ? 'bg-yellow-50' : ''} ${isImported ? 'bg-emerald-50/30' : ''} ${selectedIds.has(record.id) ? 'bg-amber-50' : ''}`}>
                    <TableCell className="w-10">
                      <Checkbox
                        checked={selectedIds.has(record.id)}
                        onCheckedChange={() => handleSelectRecord(record.id)}
                      />
                    </TableCell>
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
                      {periodLabel}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {renderRecordStatusBadges(record, isLocked)}
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
                      ) : record.approval_status === 'rejected' ? (
                        /* Rejected record - show rejection reason, no edit allowed */
                        <div className="flex items-center justify-end gap-2">
                          <div className="text-right">
                            <div className="text-xs text-red-600 font-medium">Rejected</div>
                            {record.rejection_reason && (
                              <div className="text-xs text-gray-500 max-w-[200px] truncate" title={record.rejection_reason}>
                                {record.rejection_reason}
                              </div>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => viewVersions(record)}
                            title="View History"
                          >
                            <History className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : record.status === 'rejected' ? (
                        /* Legacy rejected status - same treatment */
                        <div className="flex items-center justify-end gap-2">
                          <div className="text-right">
                            <div className="text-xs text-red-600 font-medium">Rejected</div>
                            {record.rejection_reason && (
                              <div className="text-xs text-gray-500 max-w-[200px] truncate" title={record.rejection_reason}>
                                {record.rejection_reason}
                              </div>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => viewVersions(record)}
                            title="View History"
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
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-emerald-600" />
              Version History
            </DialogTitle>
            <DialogDescription>
              {selectedRecord?.category} - {selectedRecord?.subcategory}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {versions.length === 0 ? (
              <p className="text-center py-8 text-text-muted">No version history available</p>
            ) : (
              versions.map((version, idx) => {
                const approvalDiff = version.field_diffs?.find(diff => diff.field === 'approval_status');
                const isApproved = version.change_type === 'approved' || approvalDiff?.new_value === 'approved';
                const isRejected = version.change_type === 'rejected' || approvalDiff?.new_value === 'rejected';
                const eventTitle = isRejected ? 'Update Rejected' : isApproved ? 'Update Approved' : version.change_type === 'created' ? 'Created' : 'Updated';
                const hasApproverOverride = isApproved && version.approver_edited && (version.submitted_field_diffs || []).length > 0;
                const visibleDiffs = hasApproverOverride ? [] : (version.field_diffs || []).filter(diff => diff.field !== 'approval_status');
                return (
                <Card key={version.id} className="p-4 border border-stone-200">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${isRejected ? 'bg-red-100' : isApproved || version.change_type === 'created' ? 'bg-green-100' : 'bg-blue-100'}`}>
                      <History className={`w-4 h-4 ${isRejected ? 'text-red-600' : isApproved || version.change_type === 'created' ? 'text-green-600' : 'text-blue-600'}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <Badge className={isRejected ? 'bg-red-100 text-red-700' : isApproved || version.change_type === 'created' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}>
                          {eventTitle}
                        </Badge>
                        <span className="text-xs text-text-muted">
                          {new Date(version.created_at).toLocaleString()}
                        </span>
                      </div>
                      {isRejected ? (
                        <div className="text-sm text-text-secondary space-y-1">
                          <p>Rejected by: <span className="font-medium">{version.rejected_by_name || version.changed_by_name || 'Unknown'}</span></p>
                          {version.requested_by_name && <p>Requested by: <span className="font-medium">{version.requested_by_name}</span></p>}
                        </div>
                      ) : isApproved ? (
                        <div className="text-sm text-text-secondary space-y-1">
                          <p>Approved by: <span className="font-medium">{version.approved_by_name || version.changed_by_name || 'Unknown'}</span></p>
                          {version.requested_by_name && <p>Requested by: <span className="font-medium">{version.requested_by_name}</span></p>}
                        </div>
                      ) : <p className="text-sm text-text-secondary">By: <span className="font-medium">{version.changed_by_name || 'Unknown'}</span></p>}
                      {version.change_reason && (
                        <p className="text-sm text-text-muted mt-1">Reason: {version.change_reason}</p>
                      )}
                      
                      {/* Field Diffs - computed on API, not stored */}
                      {visibleDiffs.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-stone-200">
                          <p className="text-xs font-semibold text-text-muted uppercase mb-2">{isRejected ? 'Rejected Changes' : isApproved ? 'Approved Changes' : 'Changes Made'}</p>
                          <div className="space-y-2">
                            {visibleDiffs.map((change, cIdx) => (
                              <div key={cIdx} className="bg-stone-50 rounded-lg p-2 text-sm">
                                <p className="font-medium text-text-primary mb-1">{change.display_name}</p>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div className="bg-red-50 p-2 rounded border border-red-100">
                                    <span className="text-red-600 font-medium block mb-1">{isRejected ? 'Current Approved Value' : 'Old'}</span>
                                    <span className="text-red-800 break-words">
                                      {change.old_value === null || change.old_value === undefined ? '(empty)' : 
                                       typeof change.old_value === 'object' ? JSON.stringify(change.old_value) : String(change.old_value)}
                                    </span>
                                  </div>
                                  <div className="bg-green-50 p-2 rounded border border-green-100">
                                    <span className="text-green-600 font-medium block mb-1">{isRejected ? 'Rejected Proposed Value' : isApproved ? 'New Approved Value' : 'New'}</span>
                                    <span className="text-green-800 break-words">
                                      {change.new_value === null || change.new_value === undefined ? '(empty)' : 
                                       typeof change.new_value === 'object' ? JSON.stringify(change.new_value) : String(change.new_value)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {hasApproverOverride && (
                        <div className="mt-3 pt-3 border-t border-stone-200 space-y-3">
                          <div>
                            <p className="text-xs font-semibold text-text-muted uppercase mb-2">Submitted Changes</p>
                            {(version.submitted_field_diffs || []).map((change, cIdx) => (
                              <div key={`submitted-${cIdx}`} className="text-sm bg-blue-50 rounded p-2 mb-2">
                                <p className="font-medium text-text-primary mb-1">{change.display_name}</p>
                                <span className="text-red-600">Previous: {String(change.old_value ?? '(empty)')}</span>
                                <span className="mx-2 text-text-muted">→</span>
                                <span className="text-blue-700">Submitted by requester: {String(change.new_value ?? '(empty)')}</span>
                              </div>
                            ))}
                          </div>
                          {(version.approver_field_diffs || []).length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-text-muted uppercase mb-2">Approver Modifications</p>
                              {version.approver_field_diffs.map((change, cIdx) => (
                                <div key={`approver-${cIdx}`} className="text-sm bg-green-50 rounded p-2 mb-2">
                                  <p className="font-medium text-text-primary mb-1">{change.display_name}</p>
                                  <span className="text-blue-700">Submitted: {String(change.old_value ?? '(empty)')}</span>
                                  <span className="mx-2 text-text-muted">→</span>
                                  <span className="text-green-700">Final approved by approver: {String(change.new_value ?? '(empty)')}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              )})
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Metric Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
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
            {/* Pending Proposal Banner */}
            {editData._viewing_pending_proposal && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-3">
                <Clock className="w-5 h-5 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800">Your Pending Proposal</p>
                  <p className="text-sm text-amber-700">
                    You are viewing your proposed changes that are awaiting approval. 
                    The original record values will remain unchanged until your proposal is approved.
                  </p>
                </div>
              </div>
            )}
            
            {/* Reporting Period Section */}
            <div className="space-y-3 pb-3 border-b">
              <p className="text-sm font-medium text-text-primary flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Reporting Period
              </p>
              
              <div className="grid grid-cols-2 gap-3">
                {/* Reporting Type */}
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Select
                    value={editData.reporting_type || 'monthly'}
                    onValueChange={(val) => setEditData(prev => ({ ...prev, reporting_type: val }))}
                  >
                    <SelectTrigger className="h-9">
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
                {['monthly', 'quarterly', 'yearly'].includes(editData.reporting_type) && (
                  <div className="space-y-1">
                    <Label className="text-xs">{reportingYearType === 'financial_year' ? 'Financial Year' : 'Year'}</Label>
                    <Select
                      key={`edit-year-${reportingYearType}-${editData.reporting_type}`}
                      value={String(editData.reporting_year || new Date().getFullYear())}
                      onValueChange={(val) => setEditData(prev => ({ ...prev, reporting_year: parseInt(val) }))}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(year => (
                          <SelectItem key={year} value={String(year)}>{reportingYearType === 'financial_year' ? `FY ${year}-${year + 1}` : year}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                {/* Month (for monthly) */}
                {editData.reporting_type === 'monthly' && (
                  <div className="space-y-1">
                    <Label className="text-xs">Month</Label>
                    <Select
                      value={editData.reporting_month || ''}
                      onValueChange={(val) => setEditData(prev => ({ ...prev, reporting_month: val }))}
                    >
                      <SelectTrigger className="h-9">
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
                
                {/* Quarter (for quarterly) */}
                {editData.reporting_type === 'quarterly' && (
                  <div className="space-y-1">
                    <Label className="text-xs">Quarter</Label>
                    <Select
                      value={editData.reporting_quarter || ''}
                      onValueChange={(val) => setEditData(prev => ({ ...prev, reporting_quarter: val }))}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select quarter" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Q1">Q1 (Jan-Mar)</SelectItem>
                        <SelectItem value="Q2">Q2 (Apr-Jun)</SelectItem>
                        <SelectItem value="Q3">Q3 (Jul-Sep)</SelectItem>
                        <SelectItem value="Q4">Q4 (Oct-Dec)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                {/* Date (for daily/weekly) */}
                {['daily', 'weekly'].includes(editData.reporting_type) && (
                  <div className="space-y-1">
                    <Label className="text-xs">Date</Label>
                    <Input
                      type="date"
                      className="h-9"
                      value={editData.reporting_date || ''}
                      onChange={(e) => setEditData(prev => ({ ...prev, reporting_date: e.target.value }))}
                    />
                  </div>
                )}
              </div>
            </div>
            
            {/* Facility / Organization Level */}
            <div className="space-y-2 pb-3 border-b">
              <Label className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Data Level
              </Label>
              <Select
                value={editData.facility_id || 'org_level'}
                onValueChange={(val) => setEditData(prev => ({ 
                  ...prev, 
                  facility_id: val,
                  record_level: val === 'org_level' ? 'organization' : 'facility'
                }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="org_level">Organization Level</SelectItem>
                  {facilities.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Dynamic Category Fields — table for workforce, individual fields for others */}
            {WORKFORCE_TABLE_MAP[editData.subcategory] ? (
              <WorkforceDataTable
                config={WORKFORCE_TABLE_MAP[editData.subcategory]}
                fieldValues={editData.field_values}
                onChange={(fv) => setEditData(prev => ({ ...prev, field_values: fv }))}
                isEditing={true}
              />
            ) : selectedCategory?.fields?.length > 0 ? (
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

            {/* Evidences */}
            <div className="space-y-3 pt-3 border-t">
              <Label className="flex items-center gap-2">
                <Paperclip className="w-4 h-4" />
                Evidence Files
              </Label>
              {editEvidences.length > 0 && (
                <div className="space-y-2">
                  {editEvidences.map(ev => (
                    <div key={ev.id} className="flex items-center gap-2 p-2 bg-stone-50 rounded-lg text-sm">
                      <FileText className="w-4 h-4 text-stone-400 flex-shrink-0" />
                      <span className="flex-1 truncate">{ev.filename}</span>
                      <span className="text-xs text-stone-400">{(ev.file_size / 1024).toFixed(0)}KB</span>
                      <a href={`${BACKEND_URL}${ev.upload_url}/view`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">View</a>
                      <button type="button" onClick={() => removeEvidence(ev.id, true)} className="text-red-400 hover:text-red-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div
                className="border-2 border-dashed border-stone-300 rounded-lg p-3 text-center hover:border-emerald-400 transition-colors cursor-pointer"
                onClick={() => document.getElementById('edit-evidence-upload')?.click()}
              >
                <input
                  id="edit-evidence-upload"
                  type="file"
                  className="hidden"
                  multiple
                  onChange={(e) => { handleEvidenceUpload(e.target.files, true); e.target.value = ''; }}
                />
                {uploadingEvidence ? (
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-emerald-600" />
                ) : (
                  <>
                    <Upload className="w-5 h-5 mx-auto text-stone-400 mb-1" />
                    <p className="text-xs text-stone-500">Drop files or click to upload (max 5MB each)</p>
                  </>
                )}
              </div>
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
