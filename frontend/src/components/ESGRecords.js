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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { 
  Plus, Search, Filter, History, FileText, Upload, 
  ChevronLeft, ChevronRight, Loader2, Building2, Calendar,
  Trash2, Edit2, Eye, X, Lock, Link2, RefreshCw
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Months for monthly reporting
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Generate year options
const generateYears = () => {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: 10 }, (_, i) => currentYear - i + 1);
};

// Generate FY options
const generateFYOptions = () => {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: 10 }, (_, i) => {
    const startYear = currentYear - i + 1;
    return `FY ${startYear}-${String(startYear + 1).slice(-2)}`;
  });
};

// Generate CY options
const generateCYOptions = () => {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: 10 }, (_, i) => `CY ${currentYear - i + 1}`);
};

/**
 * Reusable ESG Records Component
 * 
 * @param {string} section - 'environment' | 'social' | 'governance'
 * @param {string} framework - 'BRSR' | 'GRI' etc.
 */
export default function ESGRecords({ section, framework = 'BRSR' }) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState([]);
  const [categories, setCategories] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [stats, setStats] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, total_pages: 0 });
  
  // Filters
  const [filters, setFilters] = useState({
    category: '',
    reporting_type: '',
    facility_id: '',
    search: ''
  });
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showVersionsModal, setShowVersionsModal] = useState(false);
  const [showImportedModal, setShowImportedModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [versions, setVersions] = useState([]);
  const [deleting, setDeleting] = useState(null);

  const headers = { Authorization: `Bearer ${token}` };

  // Fetch data on mount and filter change
  useEffect(() => {
    fetchCategories();
    fetchFacilities();
  }, [section]);

  useEffect(() => {
    fetchRecords();
    fetchStats();
  }, [section, filters, pagination.page]);

  const fetchCategories = async () => {
    try {
      const res = await axios.get(`${BACKEND_URL}/api/esg-records/categories/${section}`, {
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
      const res = await axios.get(`${BACKEND_URL}/api/facilities`, { headers });
      setFacilities(res.data.facilities || res.data || []);
    } catch (error) {
      console.error('Failed to fetch facilities:', error);
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
      if (filters.reporting_type) params.reporting_type = filters.reporting_type;
      if (filters.facility_id) params.facility_id = filters.facility_id;
      if (filters.search) params.search = filters.search;

      const res = await axios.get(`${BACKEND_URL}/api/esg-records/records/${section}`, {
        params,
        headers
      });
      setRecords(res.data.records || []);
      setPagination(prev => ({
        ...prev,
        total: res.data.total,
        total_pages: res.data.total_pages
      }));
    } catch (error) {
      console.error('Failed to fetch records:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await axios.get(`${BACKEND_URL}/api/esg-records/stats/${section}`, { headers });
      setStats(res.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const fetchVersions = async (recordId) => {
    try {
      const res = await axios.get(`${BACKEND_URL}/api/esg-records/records/${section}/${recordId}/versions`, { headers });
      setVersions(res.data.versions || []);
    } catch (error) {
      console.error('Failed to fetch versions:', error);
    }
  };

  const handleRecordCreated = () => {
    setShowAddModal(false);
    fetchRecords();
    fetchStats();
  };

  const handleEditRecord = (record) => {
    setSelectedRecord(record);
    setShowEditModal(true);
  };

  const handleRecordUpdated = () => {
    setShowEditModal(false);
    setSelectedRecord(null);
    fetchRecords();
    fetchStats();
  };

  const handleDeleteRecord = async (record) => {
    if (!window.confirm(`Are you sure you want to delete this ${record.category} record?`)) {
      return;
    }
    setDeleting(record.id);
    try {
      await axios.delete(`${BACKEND_URL}/api/esg-records/records/${section}/${record.id}`, { headers });
      fetchRecords();
      fetchStats();
    } catch (error) {
      console.error('Failed to delete record:', error);
      alert('Failed to delete record. Please try again.');
    } finally {
      setDeleting(null);
    }
  };

  const handleViewVersions = async (record) => {
    setSelectedRecord(record);
    await fetchVersions(record.id);
    setShowVersionsModal(true);
  };

  const handleViewImportedRecord = (record) => {
    setSelectedRecord(record);
    setShowImportedModal(true);
  };

  // Month names for formatting
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];

  const formatReportingPeriod = (period) => {
    if (!period) return '-';
    switch (period.reporting_type) {
      case 'daily':
        return period.date + (period.time ? ` ${period.time}` : '');
      case 'monthly':
        // Handle both string month names and numeric months
        let monthDisplay = period.month;
        if (typeof period.month === 'number') {
          monthDisplay = MONTH_NAMES[period.month - 1] || period.month;
        }
        return `${monthDisplay}-${period.year}`;
      case 'quarterly':
        return `${period.quarter} ${period.year}`;
      case 'yearly':
        return period.financial_year || period.calendar_year || period.year;
      default:
        return '-';
    }
  };

  // Get unique categories from records for filter
  const uniqueCategories = [...new Set(categories.map(c => c.category))];

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-3">
            <p className="text-xs text-text-muted">Total Records</p>
            <p className="text-2xl font-bold text-text-primary">{stats.total}</p>
          </Card>
          {Object.entries(stats.by_category || {}).slice(0, 3).map(([cat, count]) => (
            <Card key={cat} className="p-3">
              <p className="text-xs text-text-muted">{cat}</p>
              <p className="text-2xl font-bold text-text-primary">{count}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Actions & Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setShowAddModal(true)} className="bg-emerald-600 hover:bg-emerald-700" data-testid="add-record-btn">
            <Plus className="w-4 h-4 mr-2" /> Add Record
          </Button>
          
          <div className="flex-1" />
          
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <Input
              placeholder="Search records..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              className="pl-9 w-48"
              data-testid="search-records"
            />
          </div>
          
          {/* Category Filter */}
          <Select value={filters.category || 'all'} onValueChange={(v) => setFilters(prev => ({ ...prev, category: v === 'all' ? '' : v }))}>
            <SelectTrigger className="w-36" data-testid="filter-category">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {uniqueCategories.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {/* Reporting Type Filter */}
          <Select value={filters.reporting_type || 'all'} onValueChange={(v) => setFilters(prev => ({ ...prev, reporting_type: v === 'all' ? '' : v }))}>
            <SelectTrigger className="w-32" data-testid="filter-reporting-type">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
          
          {/* Facility Filter */}
          <Select value={filters.facility_id || 'all'} onValueChange={(v) => setFilters(prev => ({ ...prev, facility_id: v === 'all' ? '' : v }))}>
            <SelectTrigger className="w-40" data-testid="filter-facility">
              <SelectValue placeholder="Facility" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Facilities</SelectItem>
              {facilities.map(f => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Records Table */}
      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-stone-50">
              <TableHead className="text-xs font-medium">Category</TableHead>
              <TableHead className="text-xs font-medium">Subcategory</TableHead>
              <TableHead className="text-xs font-medium">Sub-Subcategory</TableHead>
              <TableHead className="text-xs font-medium">Period</TableHead>
              <TableHead className="text-xs font-medium">Level</TableHead>
              <TableHead className="text-xs font-medium">Quantity</TableHead>
              <TableHead className="text-xs font-medium text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-stone-400" />
                </TableCell>
              </TableRow>
            ) : records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-stone-400">
                  No records found. Click "Add Record" to create one.
                </TableCell>
              </TableRow>
            ) : records.map(record => {
              const isImported = record.source_type === 'ghg_import';
              const isLocked = record.is_locked;
              const fieldValues = record.field_values || {};
              
              // Get quantity display - works for both imported and native records
              let quantityDisplay = '-';
              if (fieldValues.total_emission) {
                quantityDisplay = `${Number(fieldValues.total_emission).toLocaleString()} ${fieldValues.emission_unit || 'tCO2e'}`;
              } else if (fieldValues.total_energy) {
                quantityDisplay = `${Number(fieldValues.total_energy).toLocaleString()} ${fieldValues.energy_unit || 'TJ'}`;
              } else if (fieldValues.quantity) {
                quantityDisplay = `${Number(fieldValues.quantity).toLocaleString()} ${fieldValues.unit || fieldValues.quantity_unit || ''}`;
              } else if (fieldValues.value) {
                quantityDisplay = `${Number(fieldValues.value).toLocaleString()} ${fieldValues.unit || ''}`;
              } else {
                // Try to find first numeric field
                const numericFields = Object.entries(fieldValues).find(([k, v]) => typeof v === 'number' && !k.includes('count'));
                if (numericFields) {
                  quantityDisplay = `${Number(numericFields[1]).toLocaleString()}`;
                }
              }
              
              return (
              <TableRow key={record.id} className={`hover:bg-stone-50 ${isImported ? 'bg-emerald-50/30' : ''}`}>
                <TableCell className="text-sm font-medium">
                  <div className="flex items-center gap-2">
                    {record.category}
                    {isImported && (
                      <Badge className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5">
                        <Link2 className="w-2.5 h-2.5 mr-0.5" />
                        GHG
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-text-muted">{record.subcategory || '-'}</TableCell>
                <TableCell className="text-sm text-text-muted">
                  {record.sub_subcategory || fieldValues.scope || '-'}
                </TableCell>
                <TableCell className="text-sm">
                  <Badge variant="outline" className="text-xs">
                    {formatReportingPeriod(record.reporting_period)}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">
                  <div className="flex items-center gap-1">
                    <Badge variant={record.record_level === 'facility' ? 'default' : 'secondary'} className="text-xs">
                      {record.record_level === 'facility' ? <Building2 className="w-3 h-3 mr-1" /> : null}
                      {record.record_level}
                    </Badge>
                    {record.facility_name && record.record_level === 'facility' && (
                      <span className="text-xs text-text-muted truncate max-w-[80px]" title={record.facility_name}>
                        {record.facility_name}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  <span className={isImported ? "font-medium text-emerald-700" : "text-text-primary"}>
                    {quantityDisplay}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  {isLocked ? (
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleViewImportedRecord(record)} className="h-7 px-2" title="View Details">
                        <Eye className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleEditRecord(record)} className="h-7 px-2" title="Edit">
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleViewVersions(record)} className="h-7 px-2" title="Version History">
                        <History className="w-3 h-3" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleDeleteRecord(record)} 
                        className="h-7 px-2 text-red-500 hover:text-red-700"
                        disabled={deleting === record.id}
                        title="Delete"
                      >
                        {deleting === record.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );})}
          </TableBody>
        </Table>
        
        {/* Pagination */}
        {pagination.total_pages > 1 && (
          <div className="flex items-center justify-between p-3 border-t">
            <p className="text-xs text-text-muted">
              Showing {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm">Page {pagination.page} of {pagination.total_pages}</span>
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

      {/* Add Record Modal */}
      <AddRecordModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleRecordCreated}
        section={section}
        framework={framework}
        categories={categories}
        facilities={facilities}
      />

      {/* Edit Record Modal */}
      {selectedRecord && showEditModal && (
        <EditRecordModal
          open={showEditModal}
          onClose={() => { setShowEditModal(false); setSelectedRecord(null); }}
          onSuccess={handleRecordUpdated}
          section={section}
          record={selectedRecord}
          categories={categories}
          facilities={facilities}
        />
      )}

      {/* Version History Modal */}
      <VersionHistoryModal
        open={showVersionsModal}
        onClose={() => setShowVersionsModal(false)}
        record={selectedRecord}
        versions={versions}
      />

      {/* Imported Record View Modal */}
      {selectedRecord && showImportedModal && (
        <ImportedRecordModal
          open={showImportedModal}
          onClose={() => { setShowImportedModal(false); setSelectedRecord(null); }}
          record={selectedRecord}
        />
      )}
    </div>
  );
}

// =============================================================================
// Add Record Modal Component
// =============================================================================

function AddRecordModal({ open, onClose, onSuccess, section, framework, categories, facilities }) {
  const { token } = useAuth();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  const [formData, setFormData] = useState({
    record_level: '',
    facility_id: '',
    reporting_type: '',
    year_type: '',
    // Period fields
    date: '',
    time: '',
    year: new Date().getFullYear(),
    month: '',
    quarter: '',
    financial_year: '',
    calendar_year: '',
    // Category
    category_id: '',
    category: '',
    subcategory: '',
    // Dynamic fields
    field_values: {},
    // Common fields
    source_of_information: '',
    notes: '',
    // Evidence
    evidence_files: []
  });

  const [selectedCategory, setSelectedCategory] = useState(null);

  const headers = { Authorization: `Bearer ${token}` };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFieldChange = (fieldKey, value) => {
    setFormData(prev => ({
      ...prev,
      field_values: { ...prev.field_values, [fieldKey]: value }
    }));
  };

  // Evidence upload handler
  const handleEvidenceUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const newFiles = [];

    for (const file of files) {
      try {
        const formDataUpload = new FormData();
        formDataUpload.append('file', file);

        const res = await axios.post(
          `${BACKEND_URL}/api/upload/evidence?bucket_type=esg_records_evidence&folder=${section}`,
          formDataUpload,
          { headers: { ...headers, 'Content-Type': 'multipart/form-data' } }
        );

        if (res.data.url) {
          newFiles.push({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            filename: file.name,
            file_type: file.type.split('/')[1] || 'unknown',
            file_size: file.size,
            upload_url: res.data.url,
            uploaded_at: new Date().toISOString(),
            uploaded_by: 'current_user'
          });
        }
      } catch (error) {
        console.error('Failed to upload file:', error);
      }
    }

    setFormData(prev => ({
      ...prev,
      evidence_files: [...prev.evidence_files, ...newFiles]
    }));
    setUploading(false);
  };

  const removeEvidence = (fileId) => {
    setFormData(prev => ({
      ...prev,
      evidence_files: prev.evidence_files.filter(f => f.id !== fileId)
    }));
  };

  const handleCategorySelect = (categoryId) => {
    const cat = categories.find(c => c.id === categoryId);
    if (cat) {
      setSelectedCategory(cat);
      setFormData(prev => ({
        ...prev,
        category_id: cat.id,
        category: cat.category,
        subcategory: cat.subcategory || '',
        field_values: {}
      }));
    }
  };

  const buildReportingPeriod = () => {
    const period = { reporting_type: formData.reporting_type };
    switch (formData.reporting_type) {
      case 'daily':
        period.date = formData.date;
        period.time = formData.time || null;
        break;
      case 'monthly':
        period.year = formData.year;
        period.month = formData.month;
        break;
      case 'quarterly':
        period.year = formData.year;
        period.quarter = formData.quarter;
        break;
      case 'yearly':
        period.year_type = formData.year_type;
        if (formData.year_type === 'financial') {
          period.financial_year = formData.financial_year;
        } else {
          period.calendar_year = formData.calendar_year;
        }
        break;
    }
    return period;
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const payload = {
        record_level: formData.record_level,
        facility_id: formData.record_level === 'facility' ? formData.facility_id : null,
        category_id: formData.category_id,
        category: formData.category,
        subcategory: formData.subcategory || null,
        frameworks: [framework],
        reporting_period: buildReportingPeriod(),
        field_values: formData.field_values,
        source_of_information: formData.source_of_information || null,
        notes: formData.notes || null,
        evidence_files: formData.evidence_files
      };

      await axios.post(`${BACKEND_URL}/api/esg-records/records/${section}`, payload, { headers });
      
      // Reset form
      setStep(1);
      setFormData({
        record_level: '', facility_id: '', reporting_type: '', year_type: '',
        date: '', time: '', year: new Date().getFullYear(), month: '', quarter: '',
        financial_year: '', calendar_year: '', category_id: '', category: '',
        subcategory: '', field_values: {}, source_of_information: '', notes: '',
        evidence_files: []
      });
      setSelectedCategory(null);
      
      onSuccess();
    } catch (error) {
      console.error('Failed to create record:', error);
      alert('Failed to create record. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1: return formData.record_level && (formData.record_level === 'organization' || formData.facility_id);
      case 2: return formData.reporting_type && isReportingPeriodValid();
      case 3: return formData.category_id;
      case 4: return true; // Optional fields
      default: return false;
    }
  };

  const isReportingPeriodValid = () => {
    switch (formData.reporting_type) {
      case 'daily': return !!formData.date;
      case 'monthly': return !!formData.month;
      case 'quarterly': return !!formData.quarter;
      case 'yearly': return formData.year_type && (formData.financial_year || formData.calendar_year);
      default: return false;
    }
  };

  // Get unique categories
  const uniqueCategories = [...new Set(categories.map(c => c.category))];
  const subcategories = formData.category 
    ? categories.filter(c => c.category === formData.category)
    : [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-emerald-600" />
            Add {section.charAt(0).toUpperCase() + section.slice(1)} Record
          </DialogTitle>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mb-4">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className={`flex-1 h-1 rounded ${s <= step ? 'bg-emerald-500' : 'bg-stone-200'}`} />
          ))}
        </div>

        {/* Step 1: Record Level */}
        {step === 1 && (
          <div className="space-y-4">
            <Label>Record Level</Label>
            <RadioGroup value={formData.record_level} onValueChange={(v) => handleChange('record_level', v)}>
              <div className="flex items-center gap-2 p-3 border rounded hover:bg-stone-50 cursor-pointer">
                <RadioGroupItem value="organization" id="org-level" />
                <Label htmlFor="org-level" className="cursor-pointer flex-1">
                  <span className="font-medium">Organization Level</span>
                  <p className="text-xs text-text-muted">Record applies to entire organization</p>
                </Label>
              </div>
              <div className="flex items-center gap-2 p-3 border rounded hover:bg-stone-50 cursor-pointer">
                <RadioGroupItem value="facility" id="facility-level" />
                <Label htmlFor="facility-level" className="cursor-pointer flex-1">
                  <span className="font-medium">Facility Level</span>
                  <p className="text-xs text-text-muted">Record applies to specific facility</p>
                </Label>
              </div>
            </RadioGroup>

            {formData.record_level === 'facility' && (
              <div className="mt-4">
                <Label>Select Facility *</Label>
                <Select value={formData.facility_id} onValueChange={(v) => handleChange('facility_id', v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Choose facility..." />
                  </SelectTrigger>
                  <SelectContent>
                    {facilities.map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Reporting Period */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <Label>Reporting Type</Label>
              <Select value={formData.reporting_type} onValueChange={(v) => handleChange('reporting_type', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select reporting type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Dynamic Period Fields */}
            {formData.reporting_type === 'daily' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Date *</Label>
                  <Input type="date" value={formData.date} onChange={(e) => handleChange('date', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Time (optional)</Label>
                  <Input type="time" value={formData.time} onChange={(e) => handleChange('time', e.target.value)} className="mt-1" />
                </div>
              </div>
            )}

            {formData.reporting_type === 'monthly' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Year</Label>
                  <Select value={String(formData.year)} onValueChange={(v) => handleChange('year', parseInt(v))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {generateYears().map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Month</Label>
                  <Select value={formData.month} onValueChange={(v) => handleChange('month', v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select month..." /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {formData.reporting_type === 'quarterly' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Year</Label>
                  <Select value={String(formData.year)} onValueChange={(v) => handleChange('year', parseInt(v))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {generateYears().map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Quarter</Label>
                  <Select value={formData.quarter} onValueChange={(v) => handleChange('quarter', v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select quarter..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Q1">Q1</SelectItem>
                      <SelectItem value="Q2">Q2</SelectItem>
                      <SelectItem value="Q3">Q3</SelectItem>
                      <SelectItem value="Q4">Q4</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {formData.reporting_type === 'yearly' && (
              <div className="space-y-3">
                <div>
                  <Label>Year Type</Label>
                  <Select value={formData.year_type} onValueChange={(v) => handleChange('year_type', v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select year type..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="financial">Financial Year</SelectItem>
                      <SelectItem value="calendar">Calendar Year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formData.year_type === 'financial' && (
                  <div>
                    <Label>Financial Year</Label>
                    <Select value={formData.financial_year} onValueChange={(v) => handleChange('financial_year', v)}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Select FY..." /></SelectTrigger>
                      <SelectContent>
                        {generateFYOptions().map(fy => <SelectItem key={fy} value={fy}>{fy}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {formData.year_type === 'calendar' && (
                  <div>
                    <Label>Calendar Year</Label>
                    <Select value={formData.calendar_year} onValueChange={(v) => handleChange('calendar_year', v)}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Select CY..." /></SelectTrigger>
                      <SelectContent>
                        {generateCYOptions().map(cy => <SelectItem key={cy} value={cy}>{cy}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Category */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <Label>Category</Label>
              <Select value={formData.category} onValueChange={(v) => {
                handleChange('category', v);
                handleChange('category_id', '');
                handleChange('subcategory', '');
                setSelectedCategory(null);
              }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select category..." /></SelectTrigger>
                <SelectContent>
                  {uniqueCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {formData.category && subcategories.length > 0 && (
              <div>
                <Label>Subcategory</Label>
                <Select value={formData.category_id} onValueChange={handleCategorySelect}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select subcategory..." /></SelectTrigger>
                  <SelectContent>
                    {subcategories.map(sub => (
                      <SelectItem key={sub.id} value={sub.id}>{sub.subcategory || 'General'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Dynamic Fields based on category config */}
            {selectedCategory?.fields?.length > 0 && (
              <div className="space-y-3 pt-3 border-t">
                <p className="text-sm font-medium text-text-primary">Category Fields</p>
                {selectedCategory.fields.map(field => (
                  <DynamicFieldRenderer
                    key={field.field_key}
                    field={field}
                    value={formData.field_values[field.field_key]}
                    onChange={(val) => handleFieldChange(field.field_key, val)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Common Fields */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <Label>Source of Information</Label>
              <Input
                value={formData.source_of_information}
                onChange={(e) => handleChange('source_of_information', e.target.value)}
                placeholder="e.g., Utility Bill, Vendor Invoice, Internal Meter..."
                className="mt-1"
              />
            </div>
            <div>
              <Label>Notes / Description</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                placeholder="Add any additional notes..."
                rows={3}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Evidence Upload</Label>
              <div className="mt-1">
                {formData.evidence_files.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {formData.evidence_files.map(file => (
                      <div key={file.id} className="flex items-center justify-between p-2 bg-stone-50 rounded text-xs">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-blue-600" />
                          <span className="truncate max-w-[200px]">{file.filename}</span>
                          <Badge variant="outline" className="text-[10px]">{Math.round(file.file_size / 1024)} KB</Badge>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => removeEvidence(file.id)} className="h-6 w-6 p-0 text-red-500">
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <label className="block p-4 border-2 border-dashed rounded-lg text-center cursor-pointer hover:bg-stone-50 transition-colors">
                  <input
                    type="file"
                    multiple
                    onChange={handleEvidenceUpload}
                    className="hidden"
                    accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv,.doc,.docx"
                  />
                  {uploading ? (
                    <Loader2 className="w-6 h-6 mx-auto text-emerald-600 animate-spin" />
                  ) : (
                    <Upload className="w-6 h-6 mx-auto text-stone-400" />
                  )}
                  <p className="text-xs text-text-muted mt-2">
                    {uploading ? 'Uploading...' : 'Click to upload PDF, Images, Excel, CSV'}
                  </p>
                </label>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex justify-between mt-4">
          <div>
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep(s => s - 1)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            {step < 4 ? (
              <Button onClick={() => setStep(s => s + 1)} disabled={!canProceed()}>
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Create Record
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Edit Record Modal Component
// =============================================================================

function EditRecordModal({ open, onClose, onSuccess, section, record, categories, facilities }) {
  const { token } = useAuth();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  const [formData, setFormData] = useState({
    record_level: '',
    facility_id: '',
    reporting_type: '',
    year_type: '',
    date: '',
    time: '',
    year: new Date().getFullYear(),
    month: '',
    quarter: '',
    financial_year: '',
    calendar_year: '',
    field_values: {},
    source_of_information: '',
    notes: '',
    evidence_files: [],
    change_reason: ''
  });

  const [selectedCategory, setSelectedCategory] = useState(null);

  const headers = { Authorization: `Bearer ${token}` };

  // Initialize form with record data
  useEffect(() => {
    if (record) {
      const rp = record.reporting_period || {};
      setFormData({
        record_level: record.record_level || 'organization',
        facility_id: record.facility_id || '',
        reporting_type: rp.reporting_type || 'monthly',
        year_type: rp.year_type || '',
        date: rp.date || '',
        time: rp.time || '',
        year: rp.year || new Date().getFullYear(),
        month: rp.month || '',
        quarter: rp.quarter || '',
        financial_year: rp.financial_year || '',
        calendar_year: rp.calendar_year || '',
        field_values: record.field_values || {},
        source_of_information: record.source_of_information || '',
        notes: record.notes || '',
        evidence_files: record.evidence_files || [],
        change_reason: ''
      });
      const cat = categories.find(c => c.id === record.category_id);
      setSelectedCategory(cat || null);
    }
  }, [record, categories]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFieldChange = (fieldKey, value) => {
    setFormData(prev => ({
      ...prev,
      field_values: { ...prev.field_values, [fieldKey]: value }
    }));
  };

  const handleEvidenceUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    const newFiles = [];
    for (const file of files) {
      try {
        const formDataUpload = new FormData();
        formDataUpload.append('file', file);
        const res = await axios.post(
          `${BACKEND_URL}/api/upload/evidence?bucket_type=esg_records_evidence&folder=${section}`,
          formDataUpload,
          { headers: { ...headers, 'Content-Type': 'multipart/form-data' } }
        );
        if (res.data.url) {
          newFiles.push({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            filename: file.name,
            file_type: file.type.split('/')[1] || 'unknown',
            file_size: file.size,
            upload_url: res.data.url,
            uploaded_at: new Date().toISOString(),
            uploaded_by: 'current_user'
          });
        }
      } catch (error) {
        console.error('Failed to upload file:', error);
      }
    }
    setFormData(prev => ({ ...prev, evidence_files: [...prev.evidence_files, ...newFiles] }));
    setUploading(false);
  };

  const removeEvidence = (fileId) => {
    setFormData(prev => ({ ...prev, evidence_files: prev.evidence_files.filter(f => f.id !== fileId) }));
  };

  const buildReportingPeriod = () => {
    const period = { reporting_type: formData.reporting_type };
    switch (formData.reporting_type) {
      case 'daily':
        period.date = formData.date;
        period.time = formData.time || null;
        break;
      case 'monthly':
        period.year = formData.year;
        period.month = formData.month;
        break;
      case 'quarterly':
        period.year = formData.year;
        period.quarter = formData.quarter;
        break;
      case 'yearly':
        period.year_type = formData.year_type;
        if (formData.year_type === 'financial') {
          period.financial_year = formData.financial_year;
        } else {
          period.calendar_year = formData.calendar_year;
        }
        break;
    }
    return period;
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const payload = {
        record_level: formData.record_level,
        facility_id: formData.record_level === 'facility' ? formData.facility_id : null,
        reporting_period: buildReportingPeriod(),
        field_values: formData.field_values,
        source_of_information: formData.source_of_information || null,
        notes: formData.notes || null,
        evidence_files: formData.evidence_files,
        change_reason: formData.change_reason || null
      };
      await axios.put(`${BACKEND_URL}/api/esg-records/records/${section}/${record.id}`, payload, { headers });
      onSuccess();
    } catch (error) {
      console.error('Failed to update record:', error);
      alert('Failed to update record. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit2 className="w-5 h-5 text-blue-600" />
            Edit Record
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Record Info Header */}
          <div className="p-4 bg-stone-50 rounded-lg">
            <p className="text-base font-medium">{record.category} - {record.subcategory || 'General'}</p>
            <p className="text-sm text-text-muted mt-1">Version {record.version}</p>
          </div>

          {/* Record Level & Reporting Type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Record Level */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Record Level</Label>
              <Select value={formData.record_level} onValueChange={(v) => handleChange('record_level', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="organization">Organization Level</SelectItem>
                  <SelectItem value="facility">Facility Level</SelectItem>
                </SelectContent>
              </Select>
              {formData.record_level === 'facility' && (
                <Select value={formData.facility_id} onValueChange={(v) => handleChange('facility_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Select facility..." /></SelectTrigger>
                  <SelectContent>
                    {(facilities || []).map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Reporting Type */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Reporting Type</Label>
              <Select value={formData.reporting_type} onValueChange={(v) => handleChange('reporting_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Reporting Period Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {formData.reporting_type === 'daily' && (
              <>
                <div>
                  <Label className="text-sm font-medium">Date</Label>
                  <Input type="date" value={formData.date} onChange={(e) => handleChange('date', e.target.value)} className="mt-2" />
                </div>
                <div>
                  <Label className="text-sm font-medium">Time (Optional)</Label>
                  <Input type="time" value={formData.time} onChange={(e) => handleChange('time', e.target.value)} className="mt-2" />
                </div>
              </>
            )}
            {formData.reporting_type === 'monthly' && (
              <>
                <div>
                  <Label className="text-sm font-medium">Year</Label>
                  <Select value={String(formData.year)} onValueChange={(v) => handleChange('year', parseInt(v))}>
                    <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {generateYears().map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium">Month</Label>
                  <Select value={formData.month} onValueChange={(v) => handleChange('month', v)}>
                    <SelectTrigger className="mt-2"><SelectValue placeholder="Select month..." /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            {formData.reporting_type === 'quarterly' && (
              <>
                <div>
                  <Label className="text-sm font-medium">Year</Label>
                  <Select value={String(formData.year)} onValueChange={(v) => handleChange('year', parseInt(v))}>
                    <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {generateYears().map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium">Quarter</Label>
                  <Select value={formData.quarter} onValueChange={(v) => handleChange('quarter', v)}>
                    <SelectTrigger className="mt-2"><SelectValue placeholder="Select quarter..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Q1">Q1</SelectItem>
                      <SelectItem value="Q2">Q2</SelectItem>
                      <SelectItem value="Q3">Q3</SelectItem>
                      <SelectItem value="Q4">Q4</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            {formData.reporting_type === 'yearly' && (
              <>
                <div>
                  <Label className="text-sm font-medium">Year Type</Label>
                  <Select value={formData.year_type} onValueChange={(v) => handleChange('year_type', v)}>
                    <SelectTrigger className="mt-2"><SelectValue placeholder="Select type..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="financial">Financial Year</SelectItem>
                      <SelectItem value="calendar">Calendar Year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  {formData.year_type === 'financial' && (
                    <>
                      <Label className="text-sm font-medium">Financial Year</Label>
                      <Select value={formData.financial_year} onValueChange={(v) => handleChange('financial_year', v)}>
                        <SelectTrigger className="mt-2"><SelectValue placeholder="Select FY..." /></SelectTrigger>
                        <SelectContent>
                          {generateFYOptions().map(fy => <SelectItem key={fy} value={fy}>{fy}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </>
                  )}
                  {formData.year_type === 'calendar' && (
                    <>
                      <Label className="text-sm font-medium">Calendar Year</Label>
                      <Select value={formData.calendar_year} onValueChange={(v) => handleChange('calendar_year', v)}>
                        <SelectTrigger className="mt-2"><SelectValue placeholder="Select CY..." /></SelectTrigger>
                        <SelectContent>
                          {generateCYOptions().map(cy => <SelectItem key={cy} value={cy}>{cy}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Dynamic Category Fields */}
          {selectedCategory?.fields?.length > 0 && (
            <div className="space-y-4 pt-2 border-t">
              <p className="text-sm font-medium text-text-primary">Data Fields</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {selectedCategory.fields.map(field => (
                  <div key={field.field_key} className={field.type === 'textarea' || field.type === 'table' ? 'md:col-span-2' : ''}>
                    <DynamicFieldRenderer
                      field={field}
                      value={formData.field_values[field.field_key]}
                      onChange={(val) => handleFieldChange(field.field_key, val)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Source & Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t">
            <div>
              <Label className="text-sm font-medium">Source of Information</Label>
              <Input
                value={formData.source_of_information}
                onChange={(e) => handleChange('source_of_information', e.target.value)}
                placeholder="e.g., Utility Bill, Vendor Invoice..."
                className="mt-2"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Reason for Change</Label>
              <Input
                value={formData.change_reason}
                onChange={(e) => handleChange('change_reason', e.target.value)}
                placeholder="Why are you making this change?"
                className="mt-2"
              />
              <p className="text-xs text-text-muted mt-1">Recorded in version history</p>
            </div>
          </div>

          {/* Notes - Full Width */}
          <div>
            <Label className="text-sm font-medium">Notes / Description</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Add any additional notes..."
              rows={3}
              className="mt-2"
            />
          </div>

          {/* Evidence Files */}
          <div className="pt-2 border-t">
            <Label className="text-sm font-medium">Evidence Files</Label>
            <div className="mt-3">
              {formData.evidence_files.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
                  {formData.evidence_files.map(file => (
                    <div key={file.id} className="flex items-center justify-between p-3 bg-stone-50 rounded-lg text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                        <span className="truncate">{file.filename}</span>
                        <Badge variant="outline" className="text-xs flex-shrink-0">{Math.round(file.file_size / 1024)} KB</Badge>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => removeEvidence(file.id)} className="h-7 w-7 p-0 text-red-500 flex-shrink-0">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <label className="block p-4 border-2 border-dashed rounded-lg text-center cursor-pointer hover:bg-stone-50 transition-colors">
                <input type="file" multiple onChange={handleEvidenceUpload} className="hidden" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv,.doc,.docx" />
                {uploading ? <Loader2 className="w-6 h-6 mx-auto text-emerald-600 animate-spin" /> : <Upload className="w-6 h-6 mx-auto text-stone-400" />}
                <p className="text-sm text-text-muted mt-2">{uploading ? 'Uploading...' : 'Click to upload PDF, Images, Excel, CSV'}</p>
              </label>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-6 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Dynamic Field Renderer
// =============================================================================

function DynamicFieldRenderer({ field, value, onChange }) {
  const { field_key, type, label, required, options, placeholder } = field;

  switch (type) {
    case 'text':
      return (
        <div>
          <Label>{label}{required && ' *'}</Label>
          <Input
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="mt-1"
          />
        </div>
      );

    case 'textarea':
      return (
        <div>
          <Label>{label}{required && ' *'}</Label>
          <Textarea
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={2}
            className="mt-1"
          />
        </div>
      );

    case 'number':
      return (
        <div>
          <Label>{label}{required && ' *'}</Label>
          <Input
            type="number"
            value={value ?? ''}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            className="mt-1"
            min={field.validation?.min}
            max={field.validation?.max}
          />
        </div>
      );

    case 'dropdown':
    case 'unit_selector':
      return (
        <div>
          <Label>{label}{required && ' *'}</Label>
          <Select value={value || ''} onValueChange={onChange}>
            <SelectTrigger className="mt-1"><SelectValue placeholder={`Select ${label.toLowerCase()}...`} /></SelectTrigger>
            <SelectContent>
              {(options || []).map(opt => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case 'yes_no':
      return (
        <div>
          <Label>{label}{required && ' *'}</Label>
          <Select value={value || ''} onValueChange={onChange}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );

    case 'date':
      return (
        <div>
          <Label>{label}{required && ' *'}</Label>
          <Input
            type="date"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="mt-1"
          />
        </div>
      );

    default:
      return null;
  }
}

// =============================================================================
// Version History Modal
// =============================================================================

function VersionHistoryModal({ open, onClose, record, versions }) {
  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-blue-600" />
            Version History
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="p-3 bg-stone-50 rounded">
            <p className="text-sm font-medium">{record.category} - {record.subcategory || 'General'}</p>
            <p className="text-xs text-text-muted">Current Version: v{record.version}</p>
          </div>

          {versions.length === 0 ? (
            <p className="text-center text-text-muted py-4">No version history available</p>
          ) : (
            <div className="space-y-2">
              {versions.map(v => (
                <div key={v.id} className="p-3 border rounded hover:bg-stone-50">
                  <div className="flex items-center justify-between">
                    <Badge variant={v.version === record.version ? 'default' : 'outline'}>v{v.version}</Badge>
                    <span className="text-xs text-text-muted">
                      {new Date(v.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {v.changed_fields?.length > 0 && (
                    <p className="text-xs text-text-muted mt-1">
                      Changed: {v.changed_fields.join(', ')}
                    </p>
                  )}
                  {v.change_reason && (
                    <p className="text-xs text-text-muted mt-1">Reason: {v.change_reason}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// =============================================================================
// Imported Record View Modal
// =============================================================================

function ImportedRecordModal({ open, onClose, record }) {
  if (!record) return null;

  const fieldValues = record.field_values || {};

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-emerald-600" />
            Imported Record Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Import Status Banner */}
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-800">Imported from GHG Module</span>
            </div>
            <p className="text-xs text-emerald-700 mt-1">
              This record is auto-synced and read-only. Changes must be made in the GHG Module.
            </p>
          </div>

          {/* Record Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-text-muted">Category</Label>
              <p className="text-sm font-medium">{record.category}</p>
            </div>
            <div>
              <Label className="text-xs text-text-muted">Subcategory</Label>
              <p className="text-sm font-medium">{record.subcategory || '-'}</p>
            </div>
            <div>
              <Label className="text-xs text-text-muted">Reporting Period</Label>
              <p className="text-sm font-medium">
                {record.reporting_period?.financial_year || record.reporting_period?.calendar_year || '-'}
              </p>
            </div>
            <div>
              <Label className="text-xs text-text-muted">Facility</Label>
              <p className="text-sm font-medium">{record.facility_name || 'Organization'}</p>
            </div>
          </div>

          {/* Field Values */}
          <div className="border-t pt-4">
            <Label className="text-xs text-text-muted mb-2 block">Aggregated Data</Label>
            <div className="grid grid-cols-2 gap-3">
              {record.category === 'Emissions' ? (
                <>
                  <div className="p-3 bg-stone-50 rounded">
                    <p className="text-xs text-text-muted">Total Emissions</p>
                    <p className="text-lg font-bold text-emerald-700">
                      {fieldValues.total_emission?.toLocaleString() || '0'}
                    </p>
                    <p className="text-xs text-text-muted">{fieldValues.emission_unit || 'tCO2e'}</p>
                  </div>
                  <div className="p-3 bg-stone-50 rounded">
                    <p className="text-xs text-text-muted">Source Records</p>
                    <p className="text-lg font-bold">{fieldValues.source_records_count || 0}</p>
                    <p className="text-xs text-text-muted">GHG emission entries</p>
                  </div>
                </>
              ) : record.category === 'Energy' ? (
                <>
                  <div className="p-3 bg-stone-50 rounded">
                    <p className="text-xs text-text-muted">Total Energy</p>
                    <p className="text-lg font-bold text-blue-700">
                      {fieldValues.total_energy?.toLocaleString() || '0'}
                    </p>
                    <p className="text-xs text-text-muted">{fieldValues.energy_unit || 'TJ'}</p>
                  </div>
                  <div className="p-3 bg-stone-50 rounded">
                    <p className="text-xs text-text-muted">Source Records</p>
                    <p className="text-lg font-bold">{fieldValues.source_records_count || 0}</p>
                    <p className="text-xs text-text-muted">
                      {record.subcategory === 'Fuel' ? 'Scope 1 fuel entries' : 'Scope 2 electricity entries'}
                    </p>
                  </div>
                </>
              ) : (
                Object.entries(fieldValues).map(([key, value]) => (
                  <div key={key} className="p-3 bg-stone-50 rounded">
                    <p className="text-xs text-text-muted capitalize">{key.replace(/_/g, ' ')}</p>
                    <p className="text-sm font-medium">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Categories Included (for Emissions) */}
          {fieldValues.categories_included?.length > 0 && (
            <div>
              <Label className="text-xs text-text-muted mb-2 block">Categories Included</Label>
              <div className="flex flex-wrap gap-1">
                {fieldValues.categories_included.map((cat, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs">{cat}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Fuels Included (for Energy - Fuel) */}
          {fieldValues.fuels_included?.length > 0 && (
            <div>
              <Label className="text-xs text-text-muted mb-2 block">Fuels Included</Label>
              <div className="flex flex-wrap gap-1">
                {fieldValues.fuels_included.map((fuel, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs">{fuel}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {record.notes && (
            <div>
              <Label className="text-xs text-text-muted">Notes</Label>
              <p className="text-xs text-text-muted mt-1">{record.notes}</p>
            </div>
          )}

          {/* Sync Info */}
          <div className="flex items-center gap-2 text-xs text-text-muted border-t pt-3">
            <RefreshCw className="w-3 h-3" />
            <span>Auto-synced with GHG Module data</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
