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
import { Plus, TreeDeciduous, Trash2, Edit2, Calendar, Loader2, Upload, FileText, X, Download, Eye, Filter, ChevronUp, ChevronDown, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { ModulePageHeader } from '../components/ModulePageHeader';
import { validateFileSize, getUploadErrorMessage } from '../lib/uploadUtils';
import { useGHGAccess } from '../hooks/useKPIAccess';

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

const getCurrentReportingYear = (yearType = 'calendar', fiscalStartMonth = 4) => {
  const now = new Date();
  const startsLaterThisYear = yearType === 'financial' && (now.getMonth() + 1) < Number(fiscalStartMonth || 4);
  return String(startsLaterThisYear ? now.getFullYear() - 1 : now.getFullYear());
};

const getCurrentReportingMonthRange = (yearType = 'calendar', fiscalStartMonth = 4) => {
  const reportingYear = Number(getCurrentReportingYear(yearType, fiscalStartMonth));
  if (yearType !== 'financial') {
    return { start: `${reportingYear}-01`, end: `${reportingYear}-12` };
  }

  const startMonth = Math.min(12, Math.max(1, Number(fiscalStartMonth || 4)));
  const endMonth = startMonth === 1 ? 12 : startMonth - 1;
  const endYear = startMonth === 1 ? reportingYear : reportingYear + 1;
  return {
    start: `${reportingYear}-${String(startMonth).padStart(2, '0')}`,
    end: `${endYear}-${String(endMonth).padStart(2, '0')}`,
  };
};

const getMonthlyReportingPeriod = (monthIndex, reportingYear, yearType, fiscalStartMonth = 4) => {
  const month = Number(monthIndex) + 1;
  const baseYear = Number(reportingYear);
  const actualYear = yearType === 'financial' && month < Number(fiscalStartMonth || 4)
    ? baseYear + 1
    : baseYear;
  return `${actualYear}-${String(month).padStart(2, '0')}`;
};

const getYearlyReportingPeriod = (reportingYear, yearType) => (
  yearType === 'financial'
    ? `FY ${reportingYear}-${Number(reportingYear) + 1}`
    : `CY${reportingYear}`
);

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

const getSinkMonthRange = (sink, reportingYearType, fiscalStartMonth) => {
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(sink.reporting_period || '')) {
    return { start: sink.reporting_period, end: sink.reporting_period };
  }
  if (/^CY\d{4}$/.test(sink.reporting_period || '')) {
    const year = sink.reporting_period.slice(2);
    return { start: `${year}-01`, end: `${year}-12` };
  }
  if (/^FY \d{4}-\d{4}$/.test(sink.reporting_period || '')) {
    const startYear = Number(sink.reporting_period.slice(3, 7));
    const startMonth = Math.min(12, Math.max(1, Number(fiscalStartMonth || 4)));
    const endMonth = startMonth === 1 ? 12 : startMonth - 1;
    return {
      start: `${startYear}-${String(startMonth).padStart(2, '0')}`,
      end: `${startMonth === 1 ? startYear : startYear + 1}-${String(endMonth).padStart(2, '0')}`,
    };
  }

  const reportingYear = Number(sink.reporting_year || sink.start_date?.slice(0, 4));
  if (!reportingYear) return { start: '', end: '' };

  if (sink.frequency_type === 'yearly' || sink.reporting_month === null) {
    if (reportingYearType !== 'financial') {
      return { start: `${reportingYear}-01`, end: `${reportingYear}-12` };
    }
    const startMonth = Math.min(12, Math.max(1, Number(fiscalStartMonth || 4)));
    const endMonth = startMonth === 1 ? 12 : startMonth - 1;
    return {
      start: `${reportingYear}-${String(startMonth).padStart(2, '0')}`,
      end: `${startMonth === 1 ? reportingYear : reportingYear + 1}-${String(endMonth).padStart(2, '0')}`,
    };
  }

  if (sink.reporting_month !== null && sink.reporting_month !== undefined) {
    const month = Number(sink.reporting_month) + 1;
    const year = reportingYearType === 'financial' && month < Number(fiscalStartMonth || 4)
      ? reportingYear + 1
      : reportingYear;
    const period = `${year}-${String(month).padStart(2, '0')}`;
    return { start: period, end: period };
  }

  const start = sink.start_date?.slice(0, 7) || '';
  return { start, end: sink.end_date?.slice(0, 7) || start };
};

export default function Sinks() {
  const [sinks, setSinks] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSink, setEditingSink] = useState(null);
  const [selectedEditMonth, setSelectedEditMonth] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingMonth, setUploadingMonth] = useState(null);
  const { getAuthHeader, user } = useAuth();
  
  // KPI Assignment-based access control for sinks
  const {
    accessInfo: kpiAccessInfo,
    loading: kpiAccessLoading,
    canAccessSinks,
    filterFacilitiesByScope,
    hasFullAccess: hasFullKPIAccess,
  } = useGHGAccess();

  // Filter and Sort states
  const [filterFacility, setFilterFacility] = useState('all');
  const [filterStartMonth, setFilterStartMonth] = useState(() => getCurrentReportingMonthRange().start);
  const [filterEndMonth, setFilterEndMonth] = useState(() => getCurrentReportingMonthRange().end);
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('date'); // 'date', 'facility', 'emissions'
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc', 'desc'
  const [formErrors, setFormErrors] = useState({});

  const [formData, setFormData] = useState({
    facility_id: '',
    reporting_year: getCurrentReportingYear(),
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
  
  // KPI assignment-based sinks access (combines org-level and assignment-level)
  const hasKPISinksAccess = useMemo(() => {
    // Admins always have full access
    if (user?.role === 'admin' || user?.role === 'super_admin') return true;
    // Check KPI assignment for sinks
    return canAccessSinks;
  }, [user?.role, canAccessSinks]);
  
  // Filter facilities based on KPI assignment for sinks
  const kpiFilteredFacilities = useMemo(() => {
    if (user?.role === 'admin' || user?.role === 'super_admin') return facilities;
    // Filter facilities based on sinks access
    return filterFacilitiesByScope(facilities, 'sinks');
  }, [facilities, filterFacilitiesByScope, user?.role]);

  // Determine reporting year type from organization settings
  const orgReportingYearType = organization?.reporting_year_type; // 'financial_year' or 'calendar_year'
  const reportingYearType = orgReportingYearType === 'financial_year' ? 'financial' : 'calendar';
  const currentReportingYear = getCurrentReportingYear(reportingYearType, organization?.financial_year_start_month);
  const currentReportingMonthRange = useMemo(
    () => getCurrentReportingMonthRange(reportingYearType, organization?.financial_year_start_month),
    [reportingYearType, organization?.financial_year_start_month]
  );

  useEffect(() => {
    if (!organization || editingSink) return;
    setFilterStartMonth(currentReportingMonthRange.start);
    setFilterEndMonth(currentReportingMonthRange.end);
    setFormData(prev => ({ ...prev, reporting_year: currentReportingYear }));
  }, [organization, editingSink, currentReportingYear, currentReportingMonthRange]);

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

  const clearFormError = (field) => {
    setFormErrors(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const updateMonthValue = (monthIndex, value) => {
    setMonthlyData(prev => {
      const existing = prev[monthIndex];
      const evidence = (typeof existing === 'object' && existing !== null) ? (existing.evidence || []) : [];
      return { ...prev, [monthIndex]: { value, evidence } };
    });
    clearFormError('monthly_value');
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

  const removeMonthEvidence = async (monthIndex, fileIndex) => {
    const evidence = monthlyData[monthIndex]?.evidence?.[fileIndex];
    if (!editingSink && evidence?.file_id) {
      try {
        await axios.delete(`${API}/files/${evidence.file_id}`, { headers: getAuthHeader() });
      } catch (error) {
        toast.error(error.response?.data?.detail || 'Could not remove evidence from storage');
        return;
      }
    }
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

  const removeYearlyEvidence = async (fileIndex) => {
    const evidence = yearlyData.evidence?.[fileIndex];
    if (!editingSink && evidence?.file_id) {
      try {
        await axios.delete(`${API}/files/${evidence.file_id}`, { headers: getAuthHeader() });
      } catch (error) {
        toast.error(error.response?.data?.detail || 'Could not remove evidence from storage');
        return;
      }
    }
    setYearlyData(prev => ({
      ...prev,
      evidence: prev.evidence.filter((_, i) => i !== fileIndex)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const errors = {};
    if (!formData.facility_id) errors.facility_id = 'Select the facility for this sink record.';
    if (!formData.reporting_year) errors.reporting_year = 'Select the reporting year.';

    if (frequencyType === 'yearly') {
      if (!yearlyData.value || parseFloat(yearlyData.value) <= 0) {
        errors.yearly_value = 'Enter an annual carbon offset greater than zero.';
      }
    } else {
      const monthsWithData = Object.entries(monthlyData).filter(([, entry]) => {
        const val = typeof entry === 'object' && entry !== null ? entry.value : entry;
        return parseFloat(val) > 0;
      });

      const editedMonthValue = isEditMode ? parseFloat(getMonthValue(editMonth)) : null;
      if ((isEditMode && !(editedMonthValue > 0)) || (!isEditMode && monthsWithData.length === 0)) {
        errors.monthly_value = 'Enter a carbon offset greater than zero for at least one month.';
      }
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast.error(Object.values(errors)[0]);
      return;
    }

    setFormErrors({});
    setSubmitting(true);
    try {
      if (editingSink) {
        // Editing: update single record
        if (frequencyType === 'yearly' || editingSink.frequency_type === 'yearly') {
          // Yearly record edit
          const payload = {
            facility_id: formData.facility_id,
            reporting_period: getYearlyReportingPeriod(formData.reporting_year, reportingYearType),
            total_emissions_reduced: parseFloat(yearlyData.value) || 0,
            description: formData.description,
            evidence_urls: (yearlyData.evidence || []).map(f => f.url),
            evidence_files: yearlyData.evidence || [],
            frequency_type: 'yearly',
          };

          await axios.put(`${API}/sinks/${editingSink.id}`, payload, {
            headers: { ...getAuthHeader(), 'Content-Type': 'application/json' }
          });
        } else {
          // Monthly record edit
          const monthIndex = editMonth ?? 0;
          const entry = monthlyData[monthIndex];
          const value = typeof entry === 'object' ? entry.value : entry;
          const evidence = typeof entry === 'object' ? (entry.evidence || []) : [];

          const payload = {
            facility_id: formData.facility_id,
            reporting_period: getMonthlyReportingPeriod(monthIndex, formData.reporting_year, reportingYearType, organization?.financial_year_start_month),
            total_emissions_reduced: parseFloat(value) || 0,
            description: formData.description,
            evidence_urls: evidence.map(f => f.url),
            evidence_files: evidence,
            frequency_type: 'monthly',
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
            reporting_period: getYearlyReportingPeriod(year, reportingYearType),
            total_emissions_reduced: parseFloat(yearlyData.value) || 0,
            description: formData.description,
            evidence_urls: (yearlyData.evidence || []).map(f => f.url),
            evidence_files: yearlyData.evidence || [],
            frequency_type: 'yearly',
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
              reporting_period: getMonthlyReportingPeriod(mi, year, reportingYearType, organization?.financial_year_start_month),
              total_emissions_reduced: parseFloat(value) || 0,
              description: formData.description,
              evidence_urls: evidence.map(f => f.url),
              evidence_files: evidence,
              frequency_type: 'monthly',
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
    setFormErrors({});

    const freq = sink.frequency_type || (sink.reporting_month === null ? 'yearly' : 'monthly');
    let year = sink.reporting_year || (sink.start_date ? sink.start_date.split('-')[0] : currentReportingYear);
    let month = sink.reporting_month ?? (sink.start_date ? new Date(sink.start_date).getMonth() : 0);

    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(sink.reporting_period || '')) {
      const [actualYear, actualMonth] = sink.reporting_period.split('-').map(Number);
      month = actualMonth - 1;
      year = String(reportingYearType === 'financial' && actualMonth < Number(organization?.financial_year_start_month || 4)
        ? actualYear - 1
        : actualYear);
    } else if (/^(?:FY )?\d{4}-\d{4}$/.test(sink.reporting_period || '') || /^CY\d{4}$/.test(sink.reporting_period || '')) {
      year = sink.reporting_period.match(/\d{4}/)?.[0] || year;
    }

    setFormData({
      facility_id: sink.facility_id,
      reporting_year: year,
      description: sink.description || ''
    });

    // Set frequency type
    setFrequencyType(freq);
    setSelectedEditMonth(freq === 'yearly' ? null : month);

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
    setFormData({ facility_id: '', reporting_year: currentReportingYear, description: '' });
    setMonthlyData({});
    setYearlyData({ value: '', evidence: [] });
    setFrequencyType('monthly');
    setEditingSink(null);
    setSelectedEditMonth(null);
    setFormErrors({});
  };

  const getFacilityName = (facilityId) => {
    const facility = facilities.find(f => f.id === facilityId);
    return facility ? facility.name : 'Unknown Facility';
  };

  const getSinkPeriod = (sink) => {
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(sink.reporting_period || '')) {
      const [year, month] = sink.reporting_period.split('-');
      return `${SHORT_MONTHS[Number(month) - 1]} ${year}`;
    }
    if (/^CY\d{4}$/.test(sink.reporting_period || '')) return `CY ${sink.reporting_period.slice(2)}`;
    if (/^FY \d{4}-\d{4}$/.test(sink.reporting_period || '')) return sink.reporting_period;

    if (sink.frequency_type === 'yearly' || sink.reporting_month === null) {
      return formatReportingYear(sink.reporting_year);
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

  // Filtered and sorted sinks
  const filteredSinks = useMemo(() => {
    let result = [...sinks];
    
    // KPI assignment-based filtering: only show sinks for allowed facilities
    if (user?.role !== 'admin' && user?.role !== 'super_admin') {
      const allowedFacilityIds = kpiFilteredFacilities.map(f => f.id);
      result = result.filter(sink => allowedFacilityIds.includes(sink.facility_id));
    }

    // Filter by facility
    if (filterFacility !== 'all') {
      result = result.filter(sink => sink.facility_id === filterFacility);
    }

    // Filter by inclusive reporting month range
    if (filterStartMonth || filterEndMonth) {
      result = result.filter(sink => {
        const period = getSinkMonthRange(sink, reportingYearType, organization?.financial_year_start_month);
        return (!filterStartMonth || period.end >= filterStartMonth)
          && (!filterEndMonth || period.start <= filterEndMonth);
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
  }, [sinks, filterFacility, filterStartMonth, filterEndMonth, sortBy, sortOrder, facilities, kpiFilteredFacilities, user?.role, reportingYearType, organization?.financial_year_start_month]);

  // Filtered total
  const filteredTotalReduction = useMemo(() => {
    return filteredSinks.reduce((sum, s) => sum + s.total_emissions_reduced, 0);
  }, [filteredSinks]);

  const hasCustomFilters = filterFacility !== 'all'
    || filterStartMonth !== currentReportingMonthRange.start
    || filterEndMonth !== currentReportingMonthRange.end;

  // Determine which months to show in form
  const isEditMode = !!editingSink;
  const isEditingYearly = isEditMode && (editingSink?.frequency_type === 'yearly' || editingSink?.reporting_month === null);
  const editMonth = isEditingYearly ? null : (selectedEditMonth ?? editingSink?.reporting_month ?? (editingSink?.start_date ? new Date(editingSink.start_date).getMonth() : null));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-7" data-testid="sinks-page">
      <ModulePageHeader
        title="GHG Sinks"
        icon={TreeDeciduous}
        iconClassName="border-emerald-200 bg-emerald-50 text-emerald-800"
        testId="ghg-sinks"
        aside={hasSinkAccess ? (
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 text-white" data-testid="add-sink-btn">
                <Plus className="w-4 h-4 mr-2" />
                Add Sink Record
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[calc(100%-2rem)] max-w-4xl max-h-[calc(100dvh-2rem)] overflow-y-auto" data-testid="sink-record-dialog">
              <DialogHeader>
                <DialogTitle className="text-xl font-heading">
                  {editingSink ? 'Edit Sink Record' : 'Add New Sink Record'}
                </DialogTitle>
              </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-5 py-4" noValidate data-testid="sink-record-form">
              {Object.keys(formErrors).length > 0 && (
                <div className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert" data-testid="sink-form-validation-summary">
                  Please correct the highlighted field{Object.keys(formErrors).length > 1 ? 's' : ''} before saving.
                </div>
              )}
              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Facility <span className="text-red-600">*</span></Label>
                  <Select
                    value={formData.facility_id}
                    onValueChange={(value) => {
                      setFormData(prev => ({ ...prev, facility_id: value }));
                      clearFormError('facility_id');
                    }}
                  >
                    <SelectTrigger className={`bg-stone-50 ${formErrors.facility_id ? 'border-red-500 ring-1 ring-red-200' : ''}`} aria-invalid={Boolean(formErrors.facility_id)} data-testid="sink-facility-select">
                      <SelectValue placeholder="Select a facility" />
                    </SelectTrigger>
                    <SelectContent>
                      {kpiFilteredFacilities.map((facility) => (
                        <SelectItem key={facility.id} value={facility.id}>{facility.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formErrors.facility_id && <p className="text-xs font-medium text-red-600" data-testid="sink-facility-error">{formErrors.facility_id}</p>}
                </div>
                <div className="space-y-2">
                  <Label>{reportingYearType === 'financial' ? 'Financial Year' : 'Reporting Year'} <span className="text-red-600">*</span></Label>
                  <Select
                    value={formData.reporting_year}
                    onValueChange={(value) => {
                      setFormData(prev => ({ ...prev, reporting_year: value }));
                      clearFormError('reporting_year');
                    }}
                    disabled={isEditMode}
                  >
                    <SelectTrigger className={`bg-stone-50 ${formErrors.reporting_year ? 'border-red-500 ring-1 ring-red-200' : ''}`} aria-invalid={Boolean(formErrors.reporting_year)} data-testid="sink-year-select">
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
                  {formErrors.reporting_year && <p className="text-xs font-medium text-red-600" data-testid="sink-year-error">{formErrors.reporting_year}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Data Entry Frequency <span className="text-red-600">*</span></Label>
                  <select
                    value={frequencyType}
                    onChange={(e) => {
                      const newFreq = e.target.value;
                      setFrequencyType(newFreq);
                      clearFormError('yearly_value');
                      clearFormError('monthly_value');
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
                  {isEditMode && <p className="text-xs text-amber-600">Frequency is locked when editing</p>}
                </div>
              </div>

              {/* Frequency Badge */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-stone-600">
                  {formatReportingYear(formData.reporting_year)}
                </span>
              </div>

              {/* Data Entry Section - Conditional based on frequency */}
              {frequencyType === 'yearly' ? (
                /* Yearly Data Entry */
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Annual Carbon Offset (tCO2e) <span className="text-red-600">*</span></Label>
                  </div>
                  <div className="bg-stone-50 rounded-lg border border-stone-200 p-3 space-y-4">
                    <div>
                      <Label className="text-xs text-stone-500 mb-1">Offset Value (tCO2e)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={yearlyData.value}
                        onChange={(e) => {
                          setYearlyData(prev => ({ ...prev, value: e.target.value }));
                          clearFormError('yearly_value');
                        }}
                        placeholder={`Enter ${formatReportingYear(formData.reporting_year)} annual offset`}
                        className={`bg-white ${formErrors.yearly_value ? 'border-red-500 ring-1 ring-red-200' : ''}`}
                        aria-invalid={Boolean(formErrors.yearly_value)}
                        data-testid="yearly-value-input"
                      />
                      {formErrors.yearly_value && <p className="mt-2 text-xs font-medium text-red-600" data-testid="sink-yearly-value-error">{formErrors.yearly_value}</p>}
                    </div>

                    {/* Yearly Evidence Files */}
                    {yearlyData.evidence && yearlyData.evidence.length > 0 && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-stone-500">Evidence Files</Label>
                        {yearlyData.evidence.map((file, fileIdx) => (
                          <div key={fileIdx} className="flex items-center gap-2 p-2 bg-green-50 rounded border border-green-200" data-testid={`yearly-evidence-file-${fileIdx}`}>
                            <FileText className="w-4 h-4 text-green-600 flex-shrink-0" />
                            <span className="flex-1 text-xs text-green-800 truncate" title={file.name}>{file.name}</span>
                            <a href={`${BACKEND_URL}${file.url}/view`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50" title="View" data-testid={`view-yearly-evidence-${fileIdx}`}>
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
                              data-testid={`download-yearly-evidence-${fileIdx}`}
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button type="button" onClick={() => removeYearlyEvidence(fileIdx)} className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50" title="Remove" data-testid={`remove-yearly-evidence-${fileIdx}`}>
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
                      <div className="flex items-center justify-center gap-2 p-2.5 border border-dashed border-stone-300 rounded hover:border-primary hover:bg-white transition-colors">
                        {uploadingYearly ? (
                          <><Loader2 className="w-4 h-4 animate-spin text-primary" /><span className="text-xs text-text-muted">Uploading...</span></>
                        ) : (
                          <><Upload className="w-4 h-4 text-stone-400" /><span className="text-xs text-stone-500">Upload Evidence</span></>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Monthly Data Entry */
                <div className="space-y-2">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    {isEditMode ? (
                      <div className="space-y-2">
                        <Label>Month <span className="text-red-600">*</span></Label>
                        <Select value={String(editMonth ?? '')} onValueChange={(value) => {
                          const nextMonth = Number(value);
                          setMonthlyData((current) => {
                            if (current[nextMonth]) return current;
                            const currentEntry = current[editMonth];
                            return {
                              ...current,
                              [nextMonth]: currentEntry
                                ? { ...currentEntry, evidence: [...(currentEntry.evidence || [])] }
                                : { value: '', evidence: [] },
                            };
                          });
                          setSelectedEditMonth(nextMonth);
                          clearFormError('monthly_value');
                        }}>
                          <SelectTrigger className="w-full bg-stone-50 sm:w-52" data-testid="sink-edit-month-select">
                            <SelectValue placeholder="Select month" />
                          </SelectTrigger>
                          <SelectContent>
                            {getOrderedMonthIndices().map((monthIndex) => (
                              <SelectItem key={monthIndex} value={String(monthIndex)}>{getMonthLabelWithYear(monthIndex, formData.reporting_year)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <Label>Monthly Carbon Offset (tCO2e) <span className="text-red-600">*</span></Label>
                    )}
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
                  {formErrors.monthly_value && <p className="text-xs font-medium text-red-600" data-testid="sink-monthly-value-error">{formErrors.monthly_value}</p>}
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
      />
      
      {/* KPI Access Warning */}
      {!hasKPISinksAccess && user?.role !== 'admin' && user?.role !== 'super_admin' && (
        <Card className="p-4 border-2 border-amber-200 rounded-xl bg-amber-50">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div>
              <p className="font-medium text-amber-800">Limited Access</p>
              <p className="text-sm text-amber-700">
                You don&apos;t have KPI assignments for Carbon Sinks. Contact your admin if you need access to add or manage sink records.
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card className="border-2 border-green-200 bg-gradient-to-br from-green-50 to-white p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-green-100 p-3">
              <TreeDeciduous className="h-10 w-10 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-text-muted">Total Carbon Offset {hasCustomFilters && '(Filtered)'}</p>
              <h2 className="text-3xl font-heading font-bold text-green-600" data-testid="total-offset-value">
                {filteredTotalReduction.toFixed(2)} <span className="text-lg font-normal">tCO2e</span>
              </h2>
              <p className="mt-1 text-xs text-text-muted" data-testid="sink-record-count">
                {filteredSinks.length} sink record(s)
                {hasCustomFilters && ` of ${sinks.length} total`}
              </p>
            </div>
          </div>

          {sinks.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={() => setShowFilters(current => !current)} className="shrink-0 gap-2 self-start sm:self-auto" data-testid="toggle-sink-filters-button">
              <Filter className="h-4 w-4" />
              {showFilters ? 'Hide filters' : 'Show filters'}
            </Button>
          )}
        </div>
        {sinks.length > 0 && showFilters && (
          <div className="mt-5 grid gap-4 border-t border-green-200 pt-5 sm:grid-cols-2 xl:grid-cols-5" data-testid="sink-filter-controls">
            <div className="space-y-1">
              <Label htmlFor="sink-facility-filter" className="text-xs text-stone-600">Facility</Label>
              <select id="sink-facility-filter" value={filterFacility} onChange={(e) => setFilterFacility(e.target.value)} className="h-9 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm" data-testid="sink-facility-filter">
                <option value="all">All facilities</option>
                {kpiFilteredFacilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sink-start-month-filter" className="text-xs text-stone-600">Start month</Label>
              <Input id="sink-start-month-filter" type="month" value={filterStartMonth} max={filterEndMonth || undefined} onChange={(e) => setFilterStartMonth(e.target.value)} className="h-9 bg-white" data-testid="sink-start-month-filter" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sink-end-month-filter" className="text-xs text-stone-600">End month</Label>
              <Input id="sink-end-month-filter" type="month" value={filterEndMonth} min={filterStartMonth || undefined} onChange={(e) => setFilterEndMonth(e.target.value)} className="h-9 bg-white" data-testid="sink-end-month-filter" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sink-sort-filter" className="text-xs text-stone-600">Sort by</Label>
              <select id="sink-sort-filter" value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="h-9 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm" data-testid="sink-sort-filter">
                <option value="date">Date</option>
                <option value="facility">Facility</option>
                <option value="emissions">Offset value</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor="sink-order-filter" className="text-xs text-stone-600">Order</Label>
                <select id="sink-order-filter" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="h-9 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm" data-testid="sink-order-filter">
                  <option value="desc">Newest first</option>
                  <option value="asc">Oldest first</option>
                </select>
              </div>
              {hasCustomFilters && (
                <Button type="button" variant="ghost" size="icon" onClick={() => { setFilterFacility('all'); setFilterStartMonth(currentReportingMonthRange.start); setFilterEndMonth(currentReportingMonthRange.end); }} className="h-9 w-9 shrink-0 text-primary" title="Reset filters" data-testid="reset-sink-filters-button">
                  <Filter className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Sinks Table */}
      {filteredSinks.length > 0 ? (
        <Card className="max-w-full overflow-hidden border border-stone-200 rounded-xl bg-white">
          <div className="max-w-full overflow-x-auto" data-testid="sinks-table-scroll-area">
            <table className="w-full min-w-[760px]" data-testid="sinks-table">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-text-primary">
                    <button 
                      onClick={() => { setSortBy('facility'); setSortOrder(sortBy === 'facility' && sortOrder === 'asc' ? 'desc' : 'asc'); }}
                      className="flex w-full items-center justify-center gap-1 hover:text-primary transition-colors"
                      data-testid="sort-sinks-by-facility"
                    >
                      Facility
                      {sortBy === 'facility' && (sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                    </button>
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-text-primary">
                    <button 
                      onClick={() => { setSortBy('date'); setSortOrder(sortBy === 'date' && sortOrder === 'asc' ? 'desc' : 'asc'); }}
                      className="flex w-full items-center justify-center gap-1 hover:text-primary transition-colors"
                      data-testid="sort-sinks-by-date"
                    >
                      Period
                      {sortBy === 'date' && (sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                    </button>
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-text-primary">
                    <button 
                      onClick={() => { setSortBy('emissions'); setSortOrder(sortBy === 'emissions' && sortOrder === 'asc' ? 'desc' : 'asc'); }}
                      className="flex w-full items-center justify-center gap-1 hover:text-primary transition-colors"
                      data-testid="sort-sinks-by-offset"
                    >
                      Emissions Reduced (tCO2e)
                      {sortBy === 'emissions' && (sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                    </button>
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-text-primary">Description</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-text-primary">Evidence</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-text-primary">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredSinks.map((sink) => {
                  const evidenceCount = getEvidenceCount(sink);
                  return (
                    <tr key={sink.id} className="hover:bg-stone-50 transition-colors" data-testid={`sink-row-${sink.id}`}>
                      <td className="px-6 py-4 text-center">
                        <p className="font-medium text-text-primary">{getFacilityName(sink.facility_id)}</p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Calendar className="w-4 h-4 text-text-muted" />
                          <span className="text-text-secondary">{getSinkPeriod(sink)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-lg font-semibold text-green-600">{sink.total_emissions_reduced.toFixed(2)}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
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
            onClick={() => { setFilterFacility('all'); setFilterYear(currentReportingYear); }} 
            className="bg-primary hover:bg-primary/90 text-white"
            data-testid="clear-sink-empty-state-filters-button"
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
