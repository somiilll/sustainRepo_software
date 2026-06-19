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
  Trash2, Edit2, Eye, X
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
  const [showVersionsModal, setShowVersionsModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [versions, setVersions] = useState([]);

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

  const handleViewVersions = async (record) => {
    setSelectedRecord(record);
    await fetchVersions(record.id);
    setShowVersionsModal(true);
  };

  const formatReportingPeriod = (period) => {
    if (!period) return '-';
    switch (period.reporting_type) {
      case 'daily':
        return period.date + (period.time ? ` ${period.time}` : '');
      case 'monthly':
        return `${period.month} ${period.year}`;
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
          <Select value={filters.category} onValueChange={(v) => setFilters(prev => ({ ...prev, category: v }))}>
            <SelectTrigger className="w-36" data-testid="filter-category">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Categories</SelectItem>
              {uniqueCategories.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {/* Reporting Type Filter */}
          <Select value={filters.reporting_type} onValueChange={(v) => setFilters(prev => ({ ...prev, reporting_type: v }))}>
            <SelectTrigger className="w-32" data-testid="filter-reporting-type">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Types</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
          
          {/* Facility Filter */}
          <Select value={filters.facility_id} onValueChange={(v) => setFilters(prev => ({ ...prev, facility_id: v }))}>
            <SelectTrigger className="w-40" data-testid="filter-facility">
              <SelectValue placeholder="Facility" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Facilities</SelectItem>
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
              <TableHead className="text-xs font-medium">Period</TableHead>
              <TableHead className="text-xs font-medium">Level</TableHead>
              <TableHead className="text-xs font-medium">Evidence</TableHead>
              <TableHead className="text-xs font-medium">Version</TableHead>
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
            ) : records.map(record => (
              <TableRow key={record.id} className="hover:bg-stone-50">
                <TableCell className="text-sm font-medium">{record.category}</TableCell>
                <TableCell className="text-sm text-text-muted">{record.subcategory || '-'}</TableCell>
                <TableCell className="text-sm">
                  <Badge variant="outline" className="text-xs">
                    {formatReportingPeriod(record.reporting_period)}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">
                  <Badge variant={record.record_level === 'facility' ? 'default' : 'secondary'} className="text-xs">
                    {record.record_level === 'facility' ? <Building2 className="w-3 h-3 mr-1" /> : null}
                    {record.record_level}
                  </Badge>
                </TableCell>
                <TableCell>
                  {record.evidence_files?.length > 0 ? (
                    <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700">
                      <FileText className="w-3 h-3 mr-1" /> {record.evidence_files.length}
                    </Badge>
                  ) : (
                    <span className="text-xs text-stone-400">-</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">v{record.version}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => handleViewVersions(record)} className="h-7 px-2">
                    <History className="w-3 h-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
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

      {/* Version History Modal */}
      <VersionHistoryModal
        open={showVersionsModal}
        onClose={() => setShowVersionsModal(false)}
        record={selectedRecord}
        versions={versions}
      />
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
    notes: ''
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
        evidence_files: []
      };

      await axios.post(`${BACKEND_URL}/api/esg-records/records/${section}`, payload, { headers });
      
      // Reset form
      setStep(1);
      setFormData({
        record_level: '', facility_id: '', reporting_type: '', year_type: '',
        date: '', time: '', year: new Date().getFullYear(), month: '', quarter: '',
        financial_year: '', calendar_year: '', category_id: '', category: '',
        subcategory: '', field_values: {}, source_of_information: '', notes: ''
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
              <div className="mt-1 p-4 border-2 border-dashed rounded-lg text-center">
                <Upload className="w-6 h-6 mx-auto text-stone-400" />
                <p className="text-xs text-text-muted mt-2">Evidence upload coming soon</p>
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
