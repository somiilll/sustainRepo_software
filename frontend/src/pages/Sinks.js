import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { Plus, TreeDeciduous, Trash2, Edit2, Calendar, Loader2, Upload, FileText, X, Download, Eye, Filter, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { validateFileSize, getUploadErrorMessage } from '../lib/uploadUtils';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Helper function to download files
const downloadFileHelper = (url, filename) => {
  window.location.href = url;
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Helper to check if a month/year combination is in the future
const isFutureMonth = (monthIndex, year, yearType = 'calendar') => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-11
  
  let selectedYear = parseInt(year);
  const selectedMonth = monthIndex; // 0-11
  
  // For financial year: Jan-Mar (0-2) belong to next calendar year
  if (yearType === 'financial' && selectedMonth >= 0 && selectedMonth <= 2) {
    selectedYear = selectedYear + 1;
  }
  
  if (selectedYear > currentYear) return true;
  if (selectedYear === currentYear && selectedMonth > currentMonth) return true;
  return false;
};

export default function Sinks() {
  const [sinks, setSinks] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSink, setEditingSink] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingMonth, setUploadingMonth] = useState(null);
  const { getAuthHeader, user } = useAuth();

  // Filter and Sort states
  const [showFilters, setShowFilters] = useState(false);
  const [filterFacility, setFilterFacility] = useState('all');
  const [filterYear, setFilterYear] = useState('all');
  const [sortBy, setSortBy] = useState('date'); // 'date', 'facility', 'emissions'
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc', 'desc'

  const [formData, setFormData] = useState({
    facility_id: '',
    reporting_year: new Date().getFullYear().toString(),
    description: ''
  });

  // Frequency type state - 'monthly' or 'yearly'
  const [frequencyType, setFrequencyType] = useState('monthly');

  // monthlyData: { [monthIndex]: { value: '', evidence: [{name, url, file_id}] } }
  const [monthlyData, setMonthlyData] = useState({});
  
  // yearlyData: { value: '', evidence: [{name, url, file_id}] }
  const [yearlyData, setYearlyData] = useState({ value: '', evidence: [] });
  const [uploadingYearly, setUploadingYearly] = useState(false);

  useEffect(() => {
    fetchSinks();
    fetchFacilities();
    fetchOrganization();
  }, []);

  const fetchOrganization = async () => {
    try {
      const response = await axios.get(`${API}/organizations/my`, { headers: getAuthHeader() });
      setOrganization(response.data);
    } catch (error) {
      console.error('Error fetching organization:', error);
    }
  };

  // Check if organization has sink access
  // If enabled_access is null/undefined, default to having access. If it's an empty array, no access.
  const enabledAccess = organization?.enabled_access;
  const hasSinkAccess = enabledAccess === null || enabledAccess === undefined 
    ? true  // Default access if not set
    : enabledAccess.some(access => ['scope1_2', 'scope1_2_3'].includes(access));

  // Determine reporting year type from organization settings
  const orgReportingYearType = organization?.reporting_year_type; // 'financial_year' or 'calendar_year'
  const reportingYearType = orgReportingYearType === 'financial_year' ? 'financial' : 'calendar';

  // Helper function to format reporting year display
  const formatReportingYear = (year) => {
    if (reportingYearType === 'financial') {
      return `FY ${year}-${(parseInt(year) + 1).toString().slice(-2)}`;
    }
    return `CY ${year}`;
  };

  // Get ordered month indices based on year type
  // Financial year: April (3) to March (2)
  // Calendar year: January (0) to December (11)
  const getOrderedMonthIndices = () => {
    if (reportingYearType === 'financial') {
      // April (3) through December (11), then January (0) through March (2)
      return [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2];
    }
    return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  };

  // Get month label with year for display
  const getMonthLabelWithYear = (monthIndex, baseYear) => {
    const year = parseInt(baseYear);
    if (reportingYearType === 'financial') {
      // For financial year: Jan-Mar belong to next calendar year
      if (monthIndex >= 0 && monthIndex <= 2) {
        return `${MONTHS[monthIndex]} - ${year + 1}`;
      }
      return `${MONTHS[monthIndex]} - ${year}`;
    }
    // Calendar year: all months are same year
    return `${MONTHS[monthIndex]} - ${year}`;
  };

  const fetchSinks = async () => {
    try {
      const response = await axios.get(`${API}/sinks`, { headers: getAuthHeader() });
      setSinks(response.data);
    } catch (error) {
      console.error('Error fetching sinks:', error);
      // Only show error if it's not a "no data" situation
      if (error.response?.status !== 404) {
        // Don't show error toast for empty data - it's normal for new orgs
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchFacilities = async () => {
    try {
      const response = await axios.get(`${API}/facilities`, { headers: getAuthHeader() });
      setFacilities(response.data.filter(f => f.is_active !== false));
    } catch (error) {
      console.error('Error fetching facilities:', error);
    }
  };

  const totalFromMonthly = useMemo(() => {
    return Object.values(monthlyData).reduce((sum, entry) => {
      const val = typeof entry === 'object' && entry !== null ? entry.value : entry;
      return sum + (parseFloat(val) || 0);
    }, 0);
  }, [monthlyData]);

  // Total for yearly mode
  const totalFromYearly = useMemo(() => {
    return parseFloat(yearlyData.value) || 0;
  }, [yearlyData]);

  // Combined total based on frequency type
  const totalValue = frequencyType === 'yearly' ? totalFromYearly : totalFromMonthly;

  const getMonthValue = (index) => {
    const entry = monthlyData[index];
    if (!entry) return '';
    return typeof entry === 'object' && entry !== null ? (entry.value || '') : String(entry);
  };

  const getMonthEvidence = (index) => {
    const entry = monthlyData[index];
    if (!entry || typeof entry !== 'object') return [];
    return entry.evidence || [];
  };

  const updateMonthValue = (monthIndex, value) => {
    setMonthlyData(prev => {
      const existing = prev[monthIndex];
      const evidence = (typeof existing === 'object' && existing !== null) ? (existing.evidence || []) : [];
      return { ...prev, [monthIndex]: { value, evidence } };
    });
  };

  const handleMonthFileUpload = async (e, monthIndex) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadingMonth(monthIndex);
    let uploadedCount = 0;
    const newFiles = [];

    for (const file of files) {
      const sizeErr = validateFileSize(file);
      if (sizeErr) {
        toast.error(sizeErr);
        continue;
      }

      const uploadFormData = new FormData();
      uploadFormData.append('file', file);

      try {
        const response = await axios.post(`${API}/upload/evidence?bucket_type=sinks_evidence`, uploadFormData, {
          headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' }
        });

        newFiles.push({ name: file.name, url: response.data.url, file_id: response.data.file_id });
        uploadedCount++;
      } catch (error) {
        console.error('Error uploading file:', error);
        toast.error(getUploadErrorMessage(error, file));
      }
    }

    if (newFiles.length > 0) {
      setMonthlyData(prev => {
        const existing = prev[monthIndex];
        const currentValue = (typeof existing === 'object' && existing !== null) ? (existing.value || '') : (existing || '');
        const currentEvidence = (typeof existing === 'object' && existing !== null) ? (existing.evidence || []) : [];
        return { ...prev, [monthIndex]: { value: currentValue, evidence: [...currentEvidence, ...newFiles] } };
      });
      toast.success(`${uploadedCount} file(s) uploaded for ${MONTHS[monthIndex]}`);
    }
    
    e.target.value = '';
    setUploadingMonth(null);
  };

  const removeMonthEvidence = (monthIndex, fileIndex) => {
    setMonthlyData(prev => {
      const existing = prev[monthIndex];
      if (!existing || typeof existing !== 'object') return prev;
      return { ...prev, [monthIndex]: { ...existing, evidence: existing.evidence.filter((_, i) => i !== fileIndex) } };
    });
  };

  // Yearly data handlers
  const handleYearlyFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadingYearly(true);
    let uploadedCount = 0;
    const newFiles = [];

    for (const file of files) {
      const sizeErr = validateFileSize(file);
      if (sizeErr) {
        toast.error(sizeErr);
        continue;
      }

      const uploadFormData = new FormData();
      uploadFormData.append('file', file);

      try {
        const response = await axios.post(`${API}/upload/evidence?bucket_type=sinks_evidence`, uploadFormData, {
          headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' }
        });

        newFiles.push({ name: file.name, url: response.data.url, file_id: response.data.file_id });
        uploadedCount++;
      } catch (error) {
        console.error('Error uploading file:', error);
        toast.error(getUploadErrorMessage(error, file));
      }
    }

    if (newFiles.length > 0) {
      setYearlyData(prev => ({
        ...prev,
        evidence: [...(prev.evidence || []), ...newFiles]
      }));
      toast.success(`${uploadedCount} file(s) uploaded`);
    }
    
    e.target.value = '';
    setUploadingYearly(false);
  };

  const removeYearlyEvidence = (fileIndex) => {
    setYearlyData(prev => ({
      ...prev,
      evidence: prev.evidence.filter((_, i) => i !== fileIndex)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.facility_id || !formData.reporting_year) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Validation based on frequency type
    if (frequencyType === 'yearly') {
      // Yearly mode validation
      if (!yearlyData.value || parseFloat(yearlyData.value) <= 0) {
        toast.error('Please enter the annual offset value');
        return;
      }
    } else {
      // Monthly mode validation
      const monthsWithData = Object.entries(monthlyData).filter(([, entry]) => {
        const val = typeof entry === 'object' && entry !== null ? entry.value : entry;
        return parseFloat(val) > 0;
      });

      if (monthsWithData.length === 0) {
        toast.error('Please enter at least one monthly value');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (editingSink) {
        // Editing: update single record
        if (frequencyType === 'yearly' || editingSink.frequency_type === 'yearly') {
          // Yearly record edit
          const payload = {
            facility_id: formData.facility_id,
            reporting_year: formData.reporting_year,
            reporting_month: null, // null indicates yearly
            total_emissions_reduced: parseFloat(yearlyData.value) || 0,
            description: formData.description,
            evidence_urls: (yearlyData.evidence || []).map(f => f.url),
            evidence_files: yearlyData.evidence || [],
            frequency_type: 'yearly',
            start_date: `${formData.reporting_year}-01-01`,
            end_date: `${formData.reporting_year}-12-31`
          };

          await axios.put(`${API}/sinks/${editingSink.id}`, payload, {
            headers: { ...getAuthHeader(), 'Content-Type': 'application/json' }
          });
        } else {
          // Monthly record edit
          const monthIndex = editingSink.reporting_month ?? 0;
          const entry = monthlyData[monthIndex];
          const value = typeof entry === 'object' ? entry.value : entry;
          const evidence = typeof entry === 'object' ? (entry.evidence || []) : [];

          const payload = {
            facility_id: formData.facility_id,
            reporting_year: formData.reporting_year,
            reporting_month: monthIndex,
            total_emissions_reduced: parseFloat(value) || 0,
            description: formData.description,
            evidence_urls: evidence.map(f => f.url),
            evidence_files: evidence,
            frequency_type: 'monthly',
            start_date: `${formData.reporting_year}-${String(monthIndex + 1).padStart(2, '0')}-01`,
            end_date: `${formData.reporting_year}-${String(monthIndex + 1).padStart(2, '0')}-28`
          };

          await axios.put(`${API}/sinks/${editingSink.id}`, payload, {
            headers: { ...getAuthHeader(), 'Content-Type': 'application/json' }
          });
        }
        toast.success('Sink record updated successfully');
      } else {
        // Creating new records
        const year = formData.reporting_year;
        
        if (frequencyType === 'yearly') {
          // Create single yearly record
          const payload = {
            facility_id: formData.facility_id,
            reporting_year: year,
            reporting_month: null, // null indicates yearly
            total_emissions_reduced: parseFloat(yearlyData.value) || 0,
            description: formData.description,
            evidence_urls: (yearlyData.evidence || []).map(f => f.url),
            evidence_files: yearlyData.evidence || [],
            frequency_type: 'yearly',
            start_date: `${year}-01-01`,
            end_date: `${year}-12-31`
          };

          await axios.post(`${API}/sinks`, payload, {
            headers: { ...getAuthHeader(), 'Content-Type': 'application/json' }
          });
          toast.success('Yearly sink record added successfully');
        } else {
          // Create monthly records
          const monthsWithData = Object.entries(monthlyData).filter(([, entry]) => {
            const val = typeof entry === 'object' && entry !== null ? entry.value : entry;
            return parseFloat(val) > 0;
          });

          let created = 0;
          for (const [monthIdx, entry] of monthsWithData) {
            const mi = parseInt(monthIdx);
            const value = typeof entry === 'object' ? entry.value : entry;
            const evidence = typeof entry === 'object' ? (entry.evidence || []) : [];

            const payload = {
              facility_id: formData.facility_id,
              reporting_year: year,
              reporting_month: mi,
              total_emissions_reduced: parseFloat(value) || 0,
              description: formData.description,
              evidence_urls: evidence.map(f => f.url),
              evidence_files: evidence,
              frequency_type: 'monthly',
              start_date: `${year}-${String(mi + 1).padStart(2, '0')}-01`,
              end_date: `${year}-${String(mi + 1).padStart(2, '0')}-28`
            };

            await axios.post(`${API}/sinks`, payload, {
              headers: { ...getAuthHeader(), 'Content-Type': 'application/json' }
            });
            created++;
          }
          toast.success(`${created} sink record${created > 1 ? 's' : ''} added successfully`);
        }
      }

      setDialogOpen(false);
      resetForm();
      fetchSinks();
    } catch (error) {
      console.error('Error saving sink:', error);
      toast.error(error.response?.data?.detail || 'Failed to save sink record');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (sinkId) => {
    if (!window.confirm('Are you sure you want to delete this sink record?')) return;
    try {
      await axios.delete(`${API}/sinks/${sinkId}`, { headers: getAuthHeader() });
      toast.success('Sink record deleted');
      fetchSinks();
    } catch (error) {
      console.error('Error deleting sink:', error);
      toast.error('Failed to delete sink record');
    }
  };

  const handleEdit = (sink) => {
    setEditingSink(sink);

    const year = sink.reporting_year || (sink.start_date ? sink.start_date.split('-')[0] : new Date().getFullYear().toString());
    const month = sink.reporting_month ?? (sink.start_date ? new Date(sink.start_date).getMonth() : 0);
    const freq = sink.frequency_type || (sink.reporting_month === null ? 'yearly' : 'monthly');

    setFormData({
      facility_id: sink.facility_id,
      reporting_year: year,
      description: sink.description || ''
    });

    // Set frequency type
    setFrequencyType(freq);

    // Restore evidence files
    const evidenceFiles = sink.evidence_files || (sink.evidence_urls || []).map((url, i) => ({
      name: `Evidence ${i + 1}`,
      url: url
    }));

    if (freq === 'yearly') {
      // Restore yearly data
      setYearlyData({
        value: String(sink.total_emissions_reduced || ''),
        evidence: evidenceFiles
      });
      setMonthlyData({});
    } else {
      // Restore monthly data
      setMonthlyData({ [month]: { value: String(sink.total_emissions_reduced || ''), evidence: evidenceFiles } });
      setYearlyData({ value: '', evidence: [] });
    }
    
    setDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({ facility_id: '', reporting_year: new Date().getFullYear().toString(), description: '' });
    setMonthlyData({});
    setYearlyData({ value: '', evidence: [] });
    setFrequencyType('monthly');
    setEditingSink(null);
  };

  const getFacilityName = (facilityId) => {
    const facility = facilities.find(f => f.id === facilityId);
    return facility ? facility.name : 'Unknown Facility';
  };

  const getSinkPeriod = (sink) => {
    // Check if it's a yearly record (frequency_type === 'yearly' or reporting_month is null)
    if (sink.frequency_type === 'yearly' || sink.reporting_month === null) {
      return `FY ${sink.reporting_year}`;
    }
    if (sink.reporting_month !== null && sink.reporting_month !== undefined && sink.reporting_year) {
      return `${SHORT_MONTHS[sink.reporting_month]}'${sink.reporting_year}`;
    }
    if (sink.start_date) {
      try {
        const d = new Date(sink.start_date);
        return `${SHORT_MONTHS[d.getMonth()]}'${d.getFullYear()}`;
      } catch { return sink.reporting_year || '-'; }
    }
    return sink.reporting_year || '-';
  };

  const getEvidenceCount = (sink) => {
    if (sink.evidence_files && sink.evidence_files.length > 0) return sink.evidence_files.length;
    if (sink.evidence_urls && sink.evidence_urls.length > 0) return sink.evidence_urls.length;
    return 0;
  };

  const totalSinksReduction = sinks.reduce((sum, s) => sum + s.total_emissions_reduced, 0);

  // Get unique years from sinks data
  const availableYears = useMemo(() => {
    const years = new Set();
    sinks.forEach(sink => {
      if (sink.reporting_year) {
        years.add(sink.reporting_year.toString());
      } else if (sink.start_date) {
        years.add(new Date(sink.start_date).getFullYear().toString());
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [sinks]);

  // Filtered and sorted sinks
  const filteredSinks = useMemo(() => {
    let result = [...sinks];

    // Filter by facility
    if (filterFacility !== 'all') {
      result = result.filter(sink => sink.facility_id === filterFacility);
    }

    // Filter by year
    if (filterYear !== 'all') {
      result = result.filter(sink => {
        const sinkYear = sink.reporting_year?.toString() || 
          (sink.start_date ? new Date(sink.start_date).getFullYear().toString() : null);
        return sinkYear === filterYear;
      });
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'date':
          const dateA = a.start_date ? new Date(a.start_date) : new Date(`${a.reporting_year}-${(a.reporting_month || 0) + 1}-01`);
          const dateB = b.start_date ? new Date(b.start_date) : new Date(`${b.reporting_year}-${(b.reporting_month || 0) + 1}-01`);
          comparison = dateA - dateB;
          break;
        case 'facility':
          const facilityA = getFacilityName(a.facility_id) || '';
          const facilityB = getFacilityName(b.facility_id) || '';
          comparison = facilityA.localeCompare(facilityB);
          break;
        case 'emissions':
          comparison = (a.total_emissions_reduced || 0) - (b.total_emissions_reduced || 0);
          break;
        default:
          comparison = 0;
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });

    return result;
  }, [sinks, filterFacility, filterYear, sortBy, sortOrder, facilities]);

  // Filtered total
  const filteredTotalReduction = useMemo(() => {
    return filteredSinks.reduce((sum, s) => sum + s.total_emissions_reduced, 0);
  }, [filteredSinks]);

  // Determine which months to show in form
  const isEditMode = !!editingSink;
  const isEditingYearly = isEditMode && (editingSink?.frequency_type === 'yearly' || editingSink?.reporting_month === null);
  const editMonth = isEditingYearly ? null : (editingSink?.reporting_month ?? (editingSink?.start_date ? new Date(editingSink.start_date).getMonth() : null));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="sinks-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">GHG Sinks</h1>
          <p className="text-text-secondary">Track emissions reduced or captured through carbon removal activities</p>
        </div>
        {hasSinkAccess ? (
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 text-white" data-testid="add-sink-btn">
                <Plus className="w-4 h-4 mr-2" />
                Add Sink Record
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-xl font-heading">
                  {editingSink ? 'Edit Sink Record' : 'Add New Sink Record'}
                </DialogTitle>
              </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Facility *</Label>
                  <Select
                    value={formData.facility_id}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, facility_id: value }))}
                    disabled={isEditMode}
                  >
                    <SelectTrigger className="bg-stone-50" data-testid="sink-facility-select">
                      <SelectValue placeholder="Select a facility" />
                    </SelectTrigger>
                    <SelectContent>
                      {facilities.map((facility) => (
                        <SelectItem key={facility.id} value={facility.id}>{facility.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{reportingYearType === 'financial' ? 'Financial Year *' : 'Reporting Year *'}</Label>
                  <Select
                    value={formData.reporting_year}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, reporting_year: value }))}
                    disabled={isEditMode}
                  >
                    <SelectTrigger className="bg-stone-50" data-testid="sink-year-select">
                      <SelectValue placeholder="Select year" />
                    </SelectTrigger>
                    <SelectContent>
                      {[...Array(5)].map((_, i) => {
                        const year = new Date().getFullYear() - i;
                        return (
                          <SelectItem key={year} value={year.toString()}>
                            {reportingYearType === 'financial' 
                              ? `FY ${year}-${(year + 1).toString().slice(-2)}` 
                              : year}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Data Entry Frequency Selection */}
              <div className="space-y-2">
                <Label>Data Entry Frequency *</Label>
                <select
                  value={frequencyType}
                  onChange={(e) => {
                    const newFreq = e.target.value;
                    setFrequencyType(newFreq);
                    if (newFreq === 'monthly') {
                      setYearlyData({ value: '', evidence: [] });
                    } else {
                      setMonthlyData({});
                    }
                  }}
                  disabled={isEditMode}
                  className={`w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 ${isEditMode ? 'opacity-50 cursor-not-allowed' : ''}`}
                  data-testid="sink-frequency-select"
                >
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly (Annual Total)</option>
                </select>
                {isEditMode && (
                  <p className="text-xs text-amber-600">Frequency is locked when editing</p>
                )}
              </div>

              {/* Frequency Badge */}
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  frequencyType === 'yearly' 
                    ? 'bg-purple-100 text-purple-700' 
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {frequencyType === 'yearly' ? 'Annual Entry' : 'Monthly Entry'}
                </span>
                <span className="text-sm text-stone-600">
                  {formatReportingYear(formData.reporting_year)}
                </span>
              </div>

              {/* Data Entry Section - Conditional based on frequency */}
              {frequencyType === 'yearly' ? (
                /* Yearly Data Entry */
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Annual Carbon Offset (tCO2e) *</Label>
                  </div>
                  <div className="bg-purple-50 rounded-lg border border-purple-200 p-4 space-y-4">
                    <div>
                      <Label className="text-xs text-purple-700 mb-1">Offset Value (tCO2e)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={yearlyData.value}
                        onChange={(e) => setYearlyData(prev => ({ ...prev, value: e.target.value }))}
                        placeholder={`Enter ${formatReportingYear(formData.reporting_year)} annual offset`}
                        className="bg-white"
                        data-testid="yearly-value-input"
                      />
                    </div>

                    {/* Yearly Evidence Files */}
                    {yearlyData.evidence && yearlyData.evidence.length > 0 && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-purple-700">Evidence Files</Label>
                        {yearlyData.evidence.map((file, fileIdx) => (
                          <div key={fileIdx} className="flex items-center gap-2 p-2 bg-green-50 rounded border border-green-200" data-testid={`yearly-evidence-file-${fileIdx}`}>
                            <FileText className="w-4 h-4 text-green-600 flex-shrink-0" />
                            <span className="flex-1 text-xs text-green-800 truncate" title={file.name}>{file.name}</span>
                            <a href={`${BACKEND_URL}${file.url}/view`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50" title="View">
                              <Eye className="w-3.5 h-3.5" />
                            </a>
                            <button 
                              type="button"
                              onClick={async () => {
                                const downloadUrl = `${BACKEND_URL}${file.url}/download`;
                                window.location.href = downloadUrl;
                              }}
                              className="text-stone-600 hover:text-stone-800 p-1 rounded hover:bg-stone-100" 
                              title="Download"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button type="button" onClick={() => removeYearlyEvidence(fileIdx)} className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50" title="Remove">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Yearly File Upload */}
                    <div className="relative">
                      <input
                        type="file"
                        onChange={handleYearlyFileUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.csv"
                        disabled={uploadingYearly}
                        multiple
                        data-testid="yearly-upload-evidence"
                      />
                      <div className="flex items-center justify-center gap-2 p-2.5 border border-dashed border-purple-300 rounded hover:border-purple-500 hover:bg-white transition-colors">
                        {uploadingYearly ? (
                          <><Loader2 className="w-4 h-4 animate-spin text-purple-600" /><span className="text-xs text-purple-600">Uploading...</span></>
                        ) : (
                          <><Upload className="w-4 h-4 text-purple-400" /><span className="text-xs text-purple-600">Upload Evidence</span></>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-text-muted">Enter the total annual carbon offset for {formatReportingYear(formData.reporting_year)}. Supported files: PDF, DOC, DOCX, XLS, XLSX, CSV, PNG, JPG (max 5MB)</p>
                </div>
              ) : (
                /* Monthly Data Entry */
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>{isEditMode ? `${MONTHS[editMonth]} Offset (tCO2e) *` : 'Monthly Carbon Offset (tCO2e) *'}</Label>
                    {!isEditMode && (
                      <span className="text-sm font-medium text-green-600" data-testid="sink-total-value">
                        Total: {totalFromMonthly.toFixed(2)} tCO2e
                      </span>
                    )}
                  </div>
                  <div className="bg-stone-50 rounded-lg border border-stone-200 p-3">
                    {isEditMode && editMonth !== null ? (
                      // Edit mode: show single month
                      <MonthEntry
                        monthIndex={editMonth}
                        monthLabel={getMonthLabelWithYear(editMonth, formData.reporting_year)}
                        value={getMonthValue(editMonth)}
                        evidence={getMonthEvidence(editMonth)}
                        onValueChange={(val) => updateMonthValue(editMonth, val)}
                        onFileUpload={(e) => handleMonthFileUpload(e, editMonth)}
                        onRemoveEvidence={(fileIdx) => removeMonthEvidence(editMonth, fileIdx)}
                        uploading={uploadingMonth === editMonth}
                        defaultOpen
                        isFuture={isFutureMonth(editMonth, formData.reporting_year, reportingYearType)}
                      />
                    ) : (
                      // Create mode: show all 12 months in correct order
                      <Accordion type="multiple" className="space-y-1">
                        {getOrderedMonthIndices().map((monthIndex) => (
                          <MonthEntry
                            key={monthIndex}
                            monthIndex={monthIndex}
                            monthLabel={getMonthLabelWithYear(monthIndex, formData.reporting_year)}
                            value={getMonthValue(monthIndex)}
                            evidence={getMonthEvidence(monthIndex)}
                            onValueChange={(val) => updateMonthValue(monthIndex, val)}
                            onFileUpload={(e) => handleMonthFileUpload(e, monthIndex)}
                            onRemoveEvidence={(fileIdx) => removeMonthEvidence(monthIndex, fileIdx)}
                            uploading={uploadingMonth === monthIndex}
                            isFuture={isFutureMonth(monthIndex, formData.reporting_year, reportingYearType)}
                          />
                        ))}
                      </Accordion>
                    )}
                  </div>
                  {!isEditMode && (
                    <p className="text-xs text-text-muted">Each month with data will create a separate sink record. Supported files: PDF, DOC, DOCX, XLS, XLSX, CSV, PNG, JPG (max 5MB)</p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Description (Optional)</Label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="e.g., Tree plantation, Carbon capture project"
                  className="bg-stone-50"
                  data-testid="sink-description"
                />
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }} className="flex-1" data-testid="sink-cancel-btn">
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting} className="flex-1 bg-primary hover:bg-primary/90 text-white" data-testid="sink-save-btn">
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
                  ) : (
                    editingSink ? 'Update Record' : 'Add Record'
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button 
                    className="bg-stone-300 text-stone-500 cursor-not-allowed" 
                    disabled
                    data-testid="add-sink-btn-disabled"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Sink Record
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Your organization does not have sink access. Contact your administrator.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Summary Card */}
      <Card className="p-6 border-2 border-green-200 rounded-xl bg-gradient-to-br from-green-50 to-white">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-green-100 rounded-xl">
            <TreeDeciduous className="w-10 h-10 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-text-muted">Total Carbon Offset {(filterFacility !== 'all' || filterYear !== 'all') && '(Filtered)'}</p>
            <h2 className="text-3xl font-heading font-bold text-green-600" data-testid="total-offset-value">
              {filteredTotalReduction.toFixed(2)} <span className="text-lg font-normal">tCO2e</span>
            </h2>
            <p className="text-xs text-text-muted mt-1">
              {filteredSinks.length} sink record(s)
              {(filterFacility !== 'all' || filterYear !== 'all') && ` of ${sinks.length} total`}
            </p>
          </div>
        </div>
      </Card>

      {/* Filters Section */}
      {sinks.length > 0 && (
        <Card className="p-4 border border-stone-200 rounded-xl bg-white">
          <div className="flex items-center justify-between mb-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2"
            >
              <Filter className="w-4 h-4" />
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </Button>
            {(filterFacility !== 'all' || filterYear !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterFacility('all');
                  setFilterYear('all');
                }}
                className="text-primary"
              >
                Clear Filters
              </Button>
            )}
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-3 border-t border-stone-100">
              {/* Filter by Facility */}
              <div className="space-y-1">
                <Label className="text-xs text-stone-500">Filter by Facility</Label>
                <select
                  value={filterFacility}
                  onChange={(e) => setFilterFacility(e.target.value)}
                  className="w-full h-9 bg-stone-50 border border-stone-200 rounded-lg px-3 text-sm"
                >
                  <option value="all">All Facilities</option>
                  {facilities.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              {/* Filter by Year */}
              <div className="space-y-1">
                <Label className="text-xs text-stone-500">Filter by Year</Label>
                <select
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value)}
                  className="w-full h-9 bg-stone-50 border border-stone-200 rounded-lg px-3 text-sm"
                >
                  <option value="all">All Years</option>
                  {availableYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>

              {/* Sort By */}
              <div className="space-y-1">
                <Label className="text-xs text-stone-500">Sort By</Label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full h-9 bg-stone-50 border border-stone-200 rounded-lg px-3 text-sm"
                >
                  <option value="date">Date</option>
                  <option value="facility">Facility</option>
                  <option value="emissions">Emissions Reduced</option>
                </select>
              </div>

              {/* Sort Order */}
              <div className="space-y-1">
                <Label className="text-xs text-stone-500">Sort Order</Label>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className="w-full h-9 bg-stone-50 border border-stone-200 rounded-lg px-3 text-sm"
                >
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Sinks Table */}
      {filteredSinks.length > 0 ? (
        <Card className="border border-stone-200 rounded-xl bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full" data-testid="sinks-table">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-text-primary">
                    <button 
                      onClick={() => { setSortBy('facility'); setSortOrder(sortBy === 'facility' && sortOrder === 'asc' ? 'desc' : 'asc'); }}
                      className="flex items-center gap-1 hover:text-primary transition-colors"
                    >
                      Facility
                      {sortBy === 'facility' && (sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                    </button>
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-text-primary">
                    <button 
                      onClick={() => { setSortBy('date'); setSortOrder(sortBy === 'date' && sortOrder === 'asc' ? 'desc' : 'asc'); }}
                      className="flex items-center gap-1 hover:text-primary transition-colors"
                    >
                      Period
                      {sortBy === 'date' && (sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                    </button>
                  </th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-text-primary">
                    <button 
                      onClick={() => { setSortBy('emissions'); setSortOrder(sortBy === 'emissions' && sortOrder === 'asc' ? 'desc' : 'asc'); }}
                      className="flex items-center gap-1 justify-end hover:text-primary transition-colors"
                    >
                      Emissions Reduced (tCO2e)
                      {sortBy === 'emissions' && (sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                    </button>
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-text-primary">Description</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-text-primary">Evidence</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-text-primary">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredSinks.map((sink) => {
                  const evidenceCount = getEvidenceCount(sink);
                  return (
                    <tr key={sink.id} className="hover:bg-stone-50 transition-colors" data-testid={`sink-row-${sink.id}`}>
                      <td className="px-6 py-4">
                        <p className="font-medium text-text-primary">{getFacilityName(sink.facility_id)}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-text-muted" />
                          <span className="text-text-secondary">{getSinkPeriod(sink)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-lg font-semibold text-green-600">{sink.total_emissions_reduced.toFixed(2)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-text-secondary">{sink.description || '-'}</p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {evidenceCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full" data-testid={`evidence-count-${sink.id}`}>
                            <FileText className="w-3 h-3" />
                            {evidenceCount}
                          </span>
                        ) : (
                          <span className="text-xs text-stone-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(sink)} className="text-primary hover:text-primary/80" data-testid={`edit-sink-${sink.id}`}>
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(sink.id)} className="text-red-500 hover:text-red-600" data-testid={`delete-sink-${sink.id}`}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : sinks.length > 0 ? (
        <Card className="p-12 border border-stone-200 rounded-xl bg-white text-center">
          <Filter className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <h3 className="text-xl font-heading font-bold text-text-primary mb-2">No Matching Records</h3>
          <p className="text-text-secondary mb-4">No sink records match your current filters.</p>
          <Button 
            onClick={() => { setFilterFacility('all'); setFilterYear('all'); }} 
            className="bg-primary hover:bg-primary/90 text-white"
          >
            Clear Filters
          </Button>
        </Card>
      ) : (
        <Card className="p-12 border border-stone-200 rounded-xl bg-white text-center">
          <TreeDeciduous className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <h3 className="text-xl font-heading font-bold text-text-primary mb-2">No Sink Records</h3>
          <p className="text-text-secondary mb-4">Start tracking your carbon offset activities by adding sink records.</p>
          <Button onClick={() => setDialogOpen(true)} className="bg-primary hover:bg-primary/90 text-white" data-testid="add-first-sink-btn">
            <Plus className="w-4 h-4 mr-2" />
            Add First Sink Record
          </Button>
        </Card>
      )}

      {/* Info Card */}
      <Card className="p-6 border border-stone-200 rounded-xl bg-white">
        <h3 className="text-lg font-heading font-bold text-text-primary mb-3">About Carbon Sinks</h3>
        <ul className="space-y-2 text-sm text-text-secondary">
          <li className="flex items-start gap-2"><span className="text-green-600 mt-0.5">*</span><span>Carbon sinks are natural or artificial reservoirs that absorb and store carbon dioxide from the atmosphere</span></li>
          <li className="flex items-start gap-2"><span className="text-green-600 mt-0.5">*</span><span>Examples include forests, soil carbon sequestration, and carbon capture technologies</span></li>
          <li className="flex items-start gap-2"><span className="text-green-600 mt-0.5">*</span><span>Sink records will be automatically deducted from your total emissions in GHG reports</span></li>
          <li className="flex items-start gap-2"><span className="text-green-600 mt-0.5">*</span><span>Each month with data creates a separate sink record for granular tracking</span></li>
        </ul>
      </Card>
    </div>
  );
}

// Sub-component for a single month's entry (value + evidence)
function MonthEntry({ monthIndex, monthLabel, value, evidence, onValueChange, onFileUpload, onRemoveEvidence, uploading, defaultOpen, isFuture }) {
  // Use monthLabel if provided, otherwise fall back to MONTHS[monthIndex]
  const displayLabel = monthLabel || MONTHS[monthIndex];
  
  // If future month, show disabled state
  if (isFuture && !defaultOpen) {
    return (
      <AccordionItem value={`month-${monthIndex}`} className="border-none" disabled>
        <div className="py-2 px-3 bg-stone-100 rounded-lg text-sm opacity-60 cursor-not-allowed">
          <div className="flex items-center justify-between w-full">
            <span className="flex items-center gap-2 text-stone-500">
              {displayLabel}
              <span className="text-xs bg-stone-200 text-stone-500 px-1.5 py-0.5 rounded-full">
                Future
              </span>
            </span>
            <span className="font-medium text-stone-400">
              —
            </span>
          </div>
        </div>
      </AccordionItem>
    );
  }

  const content = (
    <div className="space-y-3">
      <div>
        <Label className="text-xs text-stone-500 mb-1">Offset Value (tCO2e)</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={`Enter ${displayLabel} offset`}
          className="bg-white"
          data-testid={`month-value-${monthIndex}`}
          disabled={isFuture}
        />
      </div>

      {evidence.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs text-stone-500">Evidence Files</Label>
          {evidence.map((file, fileIdx) => (
            <div key={fileIdx} className="flex items-center gap-2 p-2 bg-green-50 rounded border border-green-200" data-testid={`evidence-file-${monthIndex}-${fileIdx}`}>
              <FileText className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="flex-1 text-xs text-green-800 truncate" title={file.name}>{file.name}</span>
              <a href={`${BACKEND_URL}${file.url}/view`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50" title="View" data-testid={`view-evidence-${monthIndex}-${fileIdx}`}>
                <Eye className="w-3.5 h-3.5" />
              </a>
              <button 
                type="button"
                onClick={async () => {
                  const downloadUrl = `${BACKEND_URL}${file.url}/download`;
                  await downloadFileHelper(downloadUrl, file.name);
                }}
                className="text-stone-600 hover:text-stone-800 p-1 rounded hover:bg-stone-100" 
                title="Download" 
                data-testid={`download-evidence-${monthIndex}-${fileIdx}`}
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => onRemoveEvidence(fileIdx)} className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50" title="Remove" data-testid={`remove-evidence-${monthIndex}-${fileIdx}`}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {!isFuture && (
        <div className="relative">
          <input
            type="file"
            onChange={onFileUpload}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.csv"
            disabled={uploading}
            multiple
            data-testid={`upload-evidence-${monthIndex}`}
          />
          <div className="flex items-center justify-center gap-2 p-2.5 border border-dashed border-stone-300 rounded hover:border-primary hover:bg-white transition-colors">
            {uploading ? (
              <><Loader2 className="w-4 h-4 animate-spin text-primary" /><span className="text-xs text-text-muted">Uploading...</span></>
            ) : (
              <><Upload className="w-4 h-4 text-stone-400" /><span className="text-xs text-stone-500">Upload Evidence</span></>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // If defaultOpen (edit mode), render directly without accordion
  if (defaultOpen) {
    return <div className="px-1 py-2">{content}</div>;
  }

  // In create mode, render inside accordion
  const hasData = parseFloat(value) > 0 || evidence.length > 0;
  return (
    <AccordionItem value={`month-${monthIndex}`} className="border-none">
      <AccordionTrigger className="py-2 px-3 bg-white rounded-lg hover:bg-stone-100 text-sm" data-testid={`month-trigger-${monthIndex}`}>
        <div className="flex items-center justify-between w-full pr-2">
          <span className="flex items-center gap-2">
            {displayLabel}
            {evidence.length > 0 && (
              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                {evidence.length} file{evidence.length > 1 ? 's' : ''}
              </span>
            )}
          </span>
          <span className={`font-medium ${hasData ? 'text-green-600' : 'text-stone-400'}`}>
            {parseFloat(value) ? `${parseFloat(value).toFixed(2)} tCO2e` : '0.00 tCO2e'}
          </span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pt-2 pb-2 px-3">
        {content}
      </AccordionContent>
    </AccordionItem>
  );
}
