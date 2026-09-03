import React, { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Building, MapPin, ImageOff, Paperclip, Link, X, Plus, FileText, Upload, Download, Info, TrendingUp, Loader2, Factory, Target, BarChart3, FileBarChart, Leaf, Users, Mail, Phone, Globe, Calendar, Clock, ChevronDown, ChevronUp, ArrowRight, Briefcase, Eye, Shield, Zap } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { validateFileSize, getUploadErrorMessage } from '../lib/uploadUtils';
import { useAutoSave, AutoSaveStatus } from '../hooks/useAutoSave';
import { ModulePageHeader } from '../components/ModulePageHeader';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Helper function to ensure URL has proper protocol for external links
const ensureProtocol = (url) => {
  if (!url) return url;
  // If it's an internal API URL or already has a protocol, return as-is
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/api/')) {
    return url;
  }
  // Add https:// to external URLs
  return `https://${url}`;
};

const COUNTRIES = [
  'India', 'United States', 'United Kingdom', 'Germany', 'France', 'Australia', 
  'Canada', 'Japan', 'China', 'Brazil', 'European Union', 'Other'
];

// Helper function to delete file from R2 storage
const deleteFileFromR2 = async (fileUrl, authHeader) => {
  const fileIdMatch = fileUrl?.match(/\/api\/files\/([a-f0-9-]+)/i);
  if (fileIdMatch) {
    try {
      await axios.delete(`${API}/files/${fileIdMatch[1]}`, {
        headers: authHeader
      });
      return true;
    } catch (error) {
      console.error('Failed to delete file from storage:', error);
      return false;
    }
  }
  return false;
};

export default function OrganizationDetails() {
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [pincodeError, setPincodeError] = useState('');
  const [activeTab, setActiveTab] = useState('organization');
  
  // Yearly Data State (Turnover & Production Quantity)
  const [yearlyDataYear, setYearlyDataYear] = useState('');
  // Will be set after org loads
  const [yearlyData, setYearlyData] = useState({ 
    turnover: '', turnover_frequency: 'yearly', turnover_monthly: {}, turnover_currency: 'INR',
    production_quantity: '', production_quantity_frequency: 'yearly', production_quantity_monthly: {},
    production_unit: 'MT' 
  });
  const [yearlyDataLoading, setYearlyDataLoading] = useState(false);
  const [yearlyDataSaving, setYearlyDataSaving] = useState(false);
  
  // Module summary counts for quick navigation cards
  const [moduleCounts, setModuleCounts] = useState({
    facilities: 0,
    targets: 0,
    ghgRecords: 0,
    esgRecords: 0
  });
  
  // Collapsible text states
  const [expandedSections, setExpandedSections] = useState({});
  const toggleSection = (section) => setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  
  const { getAuthHeader, user, subscriptionExpired } = useAuth();

  // Check if user is Admin (can edit) or User (read-only)
  // Also block editing if subscription is expired
  const canEdit = user?.role === 'admin' && !subscriptionExpired;
  
  const validatePincode = (value) => {
    if (value && (!/^\d{6}$/.test(value))) {
      setPincodeError('Pincode must be exactly 6 digits');
      return false;
    }
    setPincodeError('');
    return true;
  };
  
  const handlePincodeChange = (value) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 6);
    setFormData({ ...formData, pincode: cleaned });
    if (cleaned) validatePincode(cleaned);
    else setPincodeError('');
  };

  // Helper to get full logo URL
  const getFullLogoUrl = (logoPath) => {
    if (!logoPath) return null;
    if (logoPath.startsWith('http') || logoPath.startsWith('data:')) return logoPath;
    return `${BACKEND_URL}${logoPath.startsWith('/') ? '' : '/'}${logoPath}`;
  };

  const [formData, setFormData] = useState({
    name: '',
    corporate_address: '',
    city: '',
    state: '',
    country: '',
    timezone: '',  // IANA timezone string
    pincode: '',
    logo: '',
    general_description: '',
    mission: '',
    vision: '',
    process_description: '',
    org_boundaries_approach: '',
    org_boundaries_equity_percentage: '',  // Legacy field - kept for backward compatibility
    org_boundaries: '',
    equity_share_reported_data_type: '',  // "org_share" or "total_facility"
    control_types: [],  // Array for multiple control types: ["operational", "financial"]
    uncertainty_assessment: [],  // Array of selected uncertainty assessment options
    other_information: '',
    reporting_frequency: 'yearly',
    reporting_year_type: '',  // "financial_year" or "calendar_year"
    attachments: [],
    // New fields
    person_responsible: '',
    person_responsible_designation: '',
    person_responsible_contact: '',
    report_purpose: '',
    ghg_reduction_initiatives: '',
    internal_performance_tracking: ''
  });
  
  const [timezones, setTimezones] = useState([]);  // Available timezone options

  const [newAttachment, setNewAttachment] = useState({ name: '', url: '' });

  // Helper function to download files
  const downloadFile = (url, filename) => {
    window.location.href = url;
  };

  // Validation function for auto-save - checks all mandatory fields
  const validateOrganizationForm = useCallback((data) => {
    // Check all mandatory fields
    if (!data.corporate_address || data.corporate_address.trim() === '') return false;
    if (!data.city || data.city.trim() === '') return false;
    if (!data.state || data.state.trim() === '') return false;
    if (!data.country || data.country.trim() === '') return false;
    if (!data.pincode || data.pincode.trim() === '') return false;
    if (data.pincode && !/^\d{6}$/.test(data.pincode)) return false;
    if (!data.org_boundaries_approach || data.org_boundaries_approach.trim() === '') return false;
    if (!data.person_responsible || data.person_responsible.trim() === '') return false;
    if (!data.reporting_year_type) return false;
    
    // If control approach selected, must specify at least one control type
    if (data.org_boundaries_approach === 'control' && (!data.control_types || data.control_types.length === 0)) {
      return false;
    }
    
    return true;
  }, []);

  // Auto-save handler for organization
  const handleAutoSave = useCallback(async (data) => {
    // Prepare data, converting empty strings to null for optional fields
    const submitData = {
      ...data,
      reporting_frequency: data.reporting_frequency || 'yearly',
      reporting_year_type: data.reporting_year_type,
      org_boundaries_equity_percentage: data.org_boundaries_equity_percentage 
        ? parseFloat(data.org_boundaries_equity_percentage) 
        : null,
      org_boundaries_approach: data.org_boundaries_approach || null,
      org_boundaries: data.org_boundaries || null,
      equity_share_reported_data_type: data.equity_share_reported_data_type || null,
      control_types: data.control_types || [],
      uncertainty_assessment: data.uncertainty_assessment || [],
      other_information: data.other_information || null,
      person_responsible: data.person_responsible || null,
      person_responsible_designation: data.person_responsible_designation || null,
      person_responsible_contact: data.person_responsible_contact || null,
      report_purpose: data.report_purpose || null,
      ghg_reduction_initiatives: data.ghg_reduction_initiatives || null,
      internal_performance_tracking: data.internal_performance_tracking || null,
      general_description: data.general_description || null,
      mission: data.mission || null,
      vision: data.vision || null,
      process_description: data.process_description || null,
      city: data.city || null,
      state: data.state || null,
      country: data.country || null,
      timezone: data.timezone || null,
      pincode: data.pincode || null,
      logo: data.logo || null
    };
    
    await axios.put(`${API}/organizations/my`, submitData, {
      headers: getAuthHeader()
    });
    
    // Silently refresh
    fetchOrganization();
    
    return { id: organization?.id };
  }, [getAuthHeader, organization?.id]);

  // Auto-save hook
  const { 
    saveStatus, 
    lastSavedAt, 
    errorMessage,
    triggerSave: triggerAutoSave,
    resetAutoSave 
  } = useAutoSave({
    onSave: handleAutoSave,
    validate: validateOrganizationForm,
    formData,
    enabled: editing && canEdit,
    inactivityMs: 5 * 60 * 1000, // 5 minutes
    isEditing: true, // Organization always exists
    existingId: organization?.id
  });

  useEffect(() => {
    fetchOrganization();
  }, []);

  // Fetch available timezones on component mount
  useEffect(() => {
    const fetchTimezones = async () => {
      try {
        const response = await axios.get(`${API}/timezones`, { headers: getAuthHeader() });
        setTimezones(response.data || []);
      } catch (error) {
        console.error('Failed to fetch timezones:', error);
      }
    };
    fetchTimezones();
  }, [getAuthHeader]);

  // Update timezone when country changes (suggest default)
  const handleCountryChange = async (country) => {
    setFormData(prev => ({ ...prev, country }));
    
    // If no timezone set yet, fetch the default for this country
    if (country && !formData.timezone) {
      try {
        const response = await axios.get(`${API}/timezones/default/${encodeURIComponent(country)}`, { headers: getAuthHeader() });
        if (response.data?.timezone) {
          setFormData(prev => ({ ...prev, timezone: response.data.timezone }));
        }
      } catch (error) {
        console.error('Failed to get default timezone:', error);
      }
    }
  };

  // Fetch yearly data when year changes
  const fetchYearlyData = useCallback(async () => {
    if (!yearlyDataYear) return;
    setYearlyDataLoading(true);
    try {
      const response = await axios.get(
        `${process.env.REACT_APP_BACKEND_URL}/api/organization/yearly-data/${yearlyDataYear}`,
        { headers: getAuthHeader() }
      );
      if (response.data) {
        setYearlyData({
          turnover: response.data.turnover || '',
          turnover_frequency: response.data.turnover_frequency || 'yearly',
          turnover_monthly: response.data.turnover_monthly || {},
          turnover_currency: response.data.turnover_currency || 'INR',
          production_quantity: response.data.production_quantity || '',
          production_quantity_frequency: response.data.production_quantity_frequency || 'yearly',
          production_quantity_monthly: response.data.production_quantity_monthly || {},
          production_unit: response.data.production_unit || 'MT'
        });
      } else {
        setYearlyData({ turnover: '', turnover_frequency: 'yearly', turnover_monthly: {}, turnover_currency: 'INR', production_quantity: '', production_quantity_frequency: 'yearly', production_quantity_monthly: {}, production_unit: 'MT' });
      }
    } catch (error) {
      console.log('No yearly data found for', yearlyDataYear);
      setYearlyData({ turnover: '', turnover_frequency: 'yearly', turnover_monthly: {}, turnover_currency: 'INR', production_quantity: '', production_quantity_frequency: 'yearly', production_quantity_monthly: {}, production_unit: 'MT' });
    } finally {
      setYearlyDataLoading(false);
    }
  }, [yearlyDataYear, getAuthHeader]);

  useEffect(() => {
    fetchYearlyData();
  }, [fetchYearlyData]);

  const saveYearlyData = async () => {
    if (subscriptionExpired) {
      toast.error('Subscription expired. Cannot save data.');
      return;
    }
    setYearlyDataSaving(true);
    try {
      await axios.post(
        `${process.env.REACT_APP_BACKEND_URL}/api/organization/yearly-data/${yearlyDataYear}`,
        yearlyData,
        { headers: getAuthHeader() }
      );
      toast.success(`Saved data for ${organization?.reporting_year_type === 'calendar_year' ? 'CY' : 'FY'} ${yearlyDataYear}`);
    } catch (error) {
      toast.error('Failed to save yearly data');
    } finally {
      setYearlyDataSaving(false);
    }
  };

  const fetchOrganization = async () => {
    try {
      const response = await axios.get(`${API}/organizations/my`, {
        headers: getAuthHeader()
      });
      setOrganization(response.data);
      
      // Set default yearly data year based on org reporting type
      if (!yearlyDataYear) {
        const now = new Date();
        const isCY = response.data.reporting_year_type === 'calendar_year';
        if (isCY) {
          setYearlyDataYear(String(now.getFullYear()));
        } else {
          const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
          setYearlyDataYear(`${fyStart}-${String(fyStart + 1).slice(-2)}`);
        }
      }
      
      // Reconstruct control_types from org_boundaries_approach
      let controlTypes = response.data.control_types || [];
      if (controlTypes.length === 0 && response.data.org_boundaries_approach) {
        if (response.data.org_boundaries_approach === 'control_both') {
          controlTypes = ['operational', 'financial'];
        } else if (response.data.org_boundaries_approach === 'control_operational') {
          controlTypes = ['operational'];
        } else if (response.data.org_boundaries_approach === 'control_financial') {
          controlTypes = ['financial'];
        }
      }
      
      // Keep logo URL as stored in DB (relative path) - use getFullLogoUrl() for display only
      const logoUrl = response.data.logo || '';
      
      setFormData({
        name: response.data.name,
        corporate_address: response.data.corporate_address,
        city: response.data.city || '',
        state: response.data.state || '',
        country: response.data.country || '',
        timezone: response.data.timezone || '',
        pincode: response.data.pincode || '',
        logo: logoUrl,
        general_description: response.data.general_description || '',
        mission: response.data.mission || '',
        vision: response.data.vision || '',
        process_description: response.data.process_description || '',
        org_boundaries_approach: response.data.org_boundaries_approach || '',
        org_boundaries_equity_percentage: response.data.org_boundaries_equity_percentage || '',
        org_boundaries: response.data.org_boundaries || '',
        equity_share_reported_data_type: response.data.equity_share_reported_data_type || '',
        control_types: controlTypes,
        uncertainty_assessment: response.data.uncertainty_assessment || [],
        other_information: response.data.other_information || response.data.remarks || '',
        reporting_frequency: response.data.reporting_frequency || 'yearly',
        reporting_year_type: response.data.reporting_year_type || '',
        attachments: response.data.attachments || [],
        // New fields
        person_responsible: response.data.person_responsible || '',
        person_responsible_designation: response.data.person_responsible_designation || '',
        person_responsible_contact: response.data.person_responsible_contact || '',
        report_purpose: response.data.report_purpose || '',
        ghg_reduction_initiatives: response.data.ghg_reduction_initiatives || '',
        internal_performance_tracking: response.data.internal_performance_tracking || ''
      });
    } catch (error) {
      console.error('Organization fetch error:', error);
      if (error.response?.status === 404) {
        toast.error('No organization assigned to your account');
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch module counts for quick navigation cards
  const fetchModuleCounts = useCallback(async () => {
    try {
      const headers = getAuthHeader();
      const [facilitiesRes, targetsRes] = await Promise.all([
        axios.get(`${API}/facilities`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/targets`, { headers }).catch(() => ({ data: [] }))
      ]);
      
      setModuleCounts({
        facilities: Array.isArray(facilitiesRes.data) ? facilitiesRes.data.length : 0,
        targets: Array.isArray(targetsRes.data) ? targetsRes.data.length : 0,
        ghgRecords: 0, // Will be populated if needed
        esgRecords: 0
      });
    } catch (error) {
      console.error('Error fetching module counts:', error);
    }
  }, [getAuthHeader]);

  useEffect(() => {
    if (organization && !editing) {
      fetchModuleCounts();
    }
  }, [organization, editing, fetchModuleCounts]);

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Logo file size should be less than 5MB');
      return;
    }

    setUploadingLogo(true);
    
    const sizeErr = validateFileSize(file);
    if (sizeErr) {
      toast.error(sizeErr);
      setUploadingLogo(false);
      return;
    }
    
    // Delete old logo from R2 if it exists (before uploading new one)
    if (formData.logo) {
      const deleted = await deleteFileFromR2(formData.logo, getAuthHeader());
      if (!deleted) {
        toast.error('Could not replace logo because the old file is still in storage');
        setUploadingLogo(false);
        return;
      }
    }
    
    const uploadFormData = new FormData();
    uploadFormData.append('file', file);

    try {
      // Pass organization_id for proper file path structure
      const orgId = organization?.id || '';
      const response = await axios.post(`${API}/upload/evidence?bucket_type=org_facility&organization_id=${orgId}`, uploadFormData, {
        headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' }
      });
      
      // Store relative path (like evidences) - frontend will prepend BACKEND_URL at display time
      const logoUrl = `${response.data.url}/view`;
      setFormData({ ...formData, logo: logoUrl });
      setLogoError(false);
      toast.success('Logo uploaded successfully');
    } catch (error) {
      toast.error(getUploadErrorMessage(error, file));
    } finally {
      setUploadingLogo(false);
    }
  };

  const addAttachment = () => {
    if (!newAttachment.name || !newAttachment.url) {
      toast.error('Please provide both name and URL');
      return;
    }
    setFormData({
      ...formData,
      attachments: [...formData.attachments, { ...newAttachment }]
    });
    setNewAttachment({ name: '', url: '' });
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    let uploadedCount = 0;
    const newAttachments = [];

    for (const file of files) {
      const sizeErr = validateFileSize(file);
      if (sizeErr) {
        toast.error(sizeErr);
        continue;
      }

      const uploadFormData = new FormData();
      uploadFormData.append('file', file);

      try {
        // Pass organization_id for proper file path structure
        const orgId = organization?.id || '';
        const response = await axios.post(`${API}/upload/evidence?bucket_type=org_facility&organization_id=${orgId}`, uploadFormData, {
          headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' }
        });
        
        // Store relative path (like evidences) - frontend will prepend BACKEND_URL at display time
        const fileUrl = file.type.startsWith('image/') 
          ? `${response.data.url}/view`
          : response.data.url;
        
        newAttachments.push({ 
          name: file.name, 
          url: fileUrl 
        });
        uploadedCount++;
      } catch (error) {
        toast.error(getUploadErrorMessage(error, file));
      }
    }

    if (newAttachments.length > 0) {
      setFormData({
        ...formData,
        attachments: [...formData.attachments, ...newAttachments]
      });
      toast.success(`${uploadedCount} file(s) uploaded successfully`);
    }
    
    e.target.value = '';
  };

  const removeAttachment = async (index) => {
    const attachment = formData.attachments[index];
    
    // Delete from R2 storage if it's an uploaded file
    if (attachment?.url) {
      const deleted = await deleteFileFromR2(attachment.url, getAuthHeader());
      if (!deleted) {
        toast.error('Could not remove attachment from storage');
        return;
      }
    }
    
    setFormData({
      ...formData,
      attachments: formData.attachments.filter((_, i) => i !== index)
    });
    toast.success('Attachment removed');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation: Address Details are mandatory
    if (!formData.corporate_address || formData.corporate_address.trim() === '') {
      toast.error('Corporate Address is mandatory');
      return;
    }
    if (!formData.city || formData.city.trim() === '') {
      toast.error('City is mandatory');
      return;
    }
    if (!formData.state || formData.state.trim() === '') {
      toast.error('State is mandatory');
      return;
    }
    if (!formData.country || formData.country.trim() === '') {
      toast.error('Country is mandatory');
      return;
    }
    if (!formData.pincode || formData.pincode.trim() === '') {
      toast.error('Pincode is mandatory');
      return;
    }
    
    // Validation: Organizational Boundary is mandatory
    if (!formData.org_boundaries_approach || formData.org_boundaries_approach.trim() === '') {
      toast.error('Organizational Boundary Approach is mandatory');
      return;
    }
    
    // Validation: Person Responsible is mandatory
    if (!formData.person_responsible || formData.person_responsible.trim() === '') {
      toast.error('Person Responsible is mandatory');
      return;
    }
    
    // Validation: If control approach selected, must specify at least one control type
    if (formData.org_boundaries_approach === 'control' && (!formData.control_types || formData.control_types.length === 0)) {
      toast.error('Please select at least one control type (Operational or Financial)');
      return;
    }
    
    // Validate Reporting Year Type is selected
    if (!formData.reporting_year_type) {
      toast.error('Please select a Reporting Year Type');
      return;
    }
    
    try {
      // Prepare data, converting empty strings to null for optional fields
      const submitData = {
        ...formData,
        reporting_frequency: formData.reporting_frequency || 'yearly',
        reporting_year_type: formData.reporting_year_type,
        // Convert empty strings to null for optional numeric fields
        org_boundaries_equity_percentage: formData.org_boundaries_equity_percentage 
          ? parseFloat(formData.org_boundaries_equity_percentage) 
          : null,
        // Convert empty strings to null for optional text fields
        org_boundaries_approach: formData.org_boundaries_approach || null,
        org_boundaries: formData.org_boundaries || null,
        equity_share_reported_data_type: formData.equity_share_reported_data_type || null,
        control_types: formData.control_types || [],
        uncertainty_assessment: formData.uncertainty_assessment || [],
        other_information: formData.other_information || null,
        person_responsible: formData.person_responsible || null,
        person_responsible_designation: formData.person_responsible_designation || null,
        person_responsible_contact: formData.person_responsible_contact || null,
        report_purpose: formData.report_purpose || null,
        ghg_reduction_initiatives: formData.ghg_reduction_initiatives || null,
        internal_performance_tracking: formData.internal_performance_tracking || null,
        general_description: formData.general_description || null,
        mission: formData.mission || null,
        vision: formData.vision || null,
        process_description: formData.process_description || null,
        city: formData.city || null,
        state: formData.state || null,
        country: formData.country || null,
        pincode: formData.pincode || null,
        logo: formData.logo || null
      };
      
      await axios.put(`${API}/organizations/my`, submitData, {
        headers: getAuthHeader()
      });
      toast.success('Organization updated successfully');
      setEditing(false);
      fetchOrganization();
    } catch (error) {
      console.error('Organization update error:', error);
      toast.error(error.response?.data?.detail || 'Failed to update organization');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
  }

  if (!organization) {
    return (
      <div className="text-center py-12">
        <Building className="w-16 h-16 mx-auto text-text-muted mb-4" />
        <h2 className="text-xl font-medium text-text-primary mb-2">No Organization Assigned</h2>
        <p className="text-text-muted">Please contact your administrator to be assigned to an organization.</p>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <ModulePageHeader
        title="Organization"
        icon={Building}
        iconClassName="border-blue-200 bg-blue-50 text-blue-700"
        testId="organization"
        aside={user?.role === 'admin' && !editing && activeTab === 'organization' && (
          <Button 
            onClick={() => {
              if (subscriptionExpired) {
                toast.error('Your subscription has expired. Please contact your administrator to renew.');
                return;
              }
              setLogoError(false); // Reset logo error when entering edit mode
              setEditing(true);
            }} 
            className="bg-primary hover:bg-primary/90 text-white rounded-full px-6" 
            data-testid="edit-org-btn"
            disabled={subscriptionExpired}
          >
            Edit Details
          </Button>
        )}
      />

      {/* ========== PERSISTENT ORGANIZATION SUMMARY HEADER ========== */}
      {!editing && (
        <Card className="p-0 border border-stone-200 rounded-xl bg-white overflow-hidden">
          {/* Top gradient accent bar */}
          <div className="h-2 bg-gradient-to-r from-primary via-emerald-500 to-teal-500" />
          
          <div className="p-6">
            <div className="flex flex-col lg:flex-row lg:items-start gap-6">
              {/* Logo & Name */}
              <div className="flex items-start gap-4 flex-1">
                {organization?.logo && !logoError ? (
                  <img 
                    src={getFullLogoUrl(organization.logo)} 
                    alt={organization.name} 
                    className="w-20 h-20 object-contain rounded-xl border-2 border-stone-100 shadow-sm bg-white"
                    onError={() => setLogoError(true)} 
                  />
                ) : (
                  <div className="w-20 h-20 flex items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-emerald-50 border border-stone-100">
                    <Building className="w-10 h-10 text-primary" />
                  </div>
                )}
                <div className="flex-1">
                  <h1 className="text-2xl lg:text-3xl font-heading font-bold text-text-primary mb-2">
                    {organization?.name}
                  </h1>
                  <div className="flex flex-wrap gap-2">
                    {organization?.country && (
                      <Badge variant="outline" className="bg-stone-50 text-stone-700 border-stone-200">
                        <Globe className="w-3 h-3 mr-1" />
                        {organization.country}
                      </Badge>
                    )}
                    {organization?.timezone && (
                      <Badge variant="outline" className="bg-stone-50 text-stone-700 border-stone-200">
                        <Clock className="w-3 h-3 mr-1" />
                        {timezones.find(tz => tz.value === organization.timezone)?.label || organization.timezone}
                      </Badge>
                    )}
                    {organization?.esg_frameworks_enabled?.map((framework) => (
                      <Badge key={framework} className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100">
                        <Shield className="w-3 h-3 mr-1" />
                        {framework}
                      </Badge>
                    ))}
                    {organization?.reporting_year_type && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        <Calendar className="w-3 h-3 mr-1" />
                        {organization.reporting_year_type === 'financial_year' ? 'Financial Year' : 'Calendar Year'}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="flex flex-wrap lg:flex-nowrap gap-4 lg:gap-6">
                <div className="text-center px-4 py-2 rounded-lg bg-stone-50">
                  <div className="text-2xl font-bold text-primary">{moduleCounts.facilities}</div>
                  <div className="text-xs text-text-muted">Facilities</div>
                </div>
                <div className="text-center px-4 py-2 rounded-lg bg-stone-50">
                  <div className="text-2xl font-bold text-emerald-600">{moduleCounts.targets}</div>
                  <div className="text-xs text-text-muted">Targets</div>
                </div>
                {organization?.reporting_frequency && (
                  <div className="text-center px-4 py-2 rounded-lg bg-stone-50">
                    <div className="text-lg font-semibold text-text-primary capitalize">{organization.reporting_frequency}</div>
                    <div className="text-xs text-text-muted">Reporting</div>
                  </div>
                )}
              </div>
            </div>

            {/* Last Updated */}
            {organization?.created_at && (
              <div className="mt-4 pt-4 border-t border-stone-100 flex items-center gap-2 text-xs text-text-muted">
                <Clock className="w-3 h-3" />
                <span>Last updated: {new Date(organization.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Framework Tabs - with increased top spacing */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-stone-100 p-1 rounded-lg">
          <TabsTrigger 
            value="organization" 
            className="data-[state=active]:bg-white data-[state=active]:text-primary px-6"
          >
            Organization Details
          </TabsTrigger>
        </TabsList>

        {/* Organization Details Tab */}
        <TabsContent value="organization" className="mt-2">
          {editing ? (
            <Card className="p-6 border border-stone-200 rounded-xl bg-white">
              <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Organization Name (Read-only)</Label>
                <Input value={formData.name} disabled className="bg-stone-100" />
              </div>
              <div className="space-y-2">
                <Label>Logo (Upload)</Label>
                <div className="flex items-center gap-4">
                  {formData.logo && !logoError ? (
                    <img 
                      src={getFullLogoUrl(formData.logo)} 
                      alt="Logo preview" 
                      className="w-16 h-16 object-contain border border-stone-200 rounded-lg"
                      onError={() => setLogoError(true)}
                      onLoad={() => setLogoError(false)}
                    />
                  ) : (
                    <div className="w-16 h-16 flex items-center justify-center border border-stone-200 rounded-lg bg-stone-100">
                      <ImageOff className="w-6 h-6 text-stone-400" />
                    </div>
                  )}
                  <div className="flex-1">
                    <input
                      id="logo-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoUpload}
                    />
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => document.getElementById('logo-upload')?.click()}
                      disabled={uploadingLogo}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                    </Button>
                    {formData.logo && (
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm"
                        className="ml-2 text-accent"
                        onClick={() => setFormData({ ...formData, logo: '' })}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Address Section */}
            <div className="p-4 border border-stone-200 rounded-lg space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <MapPin className="w-4 h-4" />
                Corporate Address Details <span className="text-red-500">*</span>
              </div>
              <div className="space-y-2">
                <Label>Street Address <span className="text-red-500">*</span></Label>
                <Input 
                  value={formData.corporate_address} 
                  onChange={(e) => setFormData({ ...formData, corporate_address: e.target.value })} 
                  className="bg-stone-50" 
                  placeholder="Enter street address"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>City <span className="text-red-500">*</span></Label>
                  <Input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className="bg-stone-50" required />
                </div>
                <div className="space-y-2">
                  <Label>State/Province <span className="text-red-500">*</span></Label>
                  <Input value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} className="bg-stone-50" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Country <span className="text-red-500">*</span></Label>
                  <select value={formData.country} onChange={(e) => handleCountryChange(e.target.value)} className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3" required>
                    <option value="">Select Country</option>
                    {COUNTRIES.map(c => (<option key={c} value={c}>{c}</option>))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <select 
                    value={formData.timezone} 
                    onChange={(e) => setFormData({ ...formData, timezone: e.target.value })} 
                    className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                  >
                    <option value="">Select Timezone</option>
                    {timezones.map(tz => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>PIN/ZIP Code <span className="text-red-500">*</span></Label>
                  <Input 
                    value={formData.pincode} 
                    onChange={(e) => handlePincodeChange(e.target.value)} 
                    maxLength={6}
                    placeholder="6-digit pincode"
                    className={`bg-stone-50 ${pincodeError ? 'border-red-500' : ''}`}
                    required
                  />
                  {pincodeError && <p className="text-xs text-red-500">{pincodeError}</p>}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Organization Description</Label>
              <textarea value={formData.general_description} onChange={(e) => setFormData({ ...formData, general_description: e.target.value })} rows={3} className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Mission</Label>
                <textarea value={formData.mission} onChange={(e) => setFormData({ ...formData, mission: e.target.value })} rows={2} className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2" />
              </div>
              <div className="space-y-2">
                <Label>Vision</Label>
                <textarea value={formData.vision} onChange={(e) => setFormData({ ...formData, vision: e.target.value })} rows={2} className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Process Description</Label>
              <textarea value={formData.process_description} onChange={(e) => setFormData({ ...formData, process_description: e.target.value })} rows={3} className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2" />
            </div>

            {/* Person Responsible */}
            <div className="space-y-2">
              <Label>Person Responsible <span className="text-red-500">*</span></Label>
              <Input 
                value={formData.person_responsible} 
                onChange={(e) => setFormData({ ...formData, person_responsible: e.target.value })} 
                className="bg-stone-50"
                placeholder="Name of person responsible for GHG reporting"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Designation</Label>
                <Input 
                  value={formData.person_responsible_designation || ''} 
                  onChange={(e) => setFormData({ ...formData, person_responsible_designation: e.target.value })} 
                  className="bg-stone-50"
                  placeholder="e.g., Sustainability Director"
                />
              </div>
              <div className="space-y-2">
                <Label>Contact Details</Label>
                <Input 
                  value={formData.person_responsible_contact || ''} 
                  onChange={(e) => setFormData({ ...formData, person_responsible_contact: e.target.value })} 
                  className="bg-stone-50"
                  placeholder="Email or phone number"
                />
              </div>
            </div>

            {/* Purpose of the Report */}
            <div className="space-y-2">
              <Label>Purpose of the Report</Label>
              <textarea 
                value={formData.report_purpose} 
                onChange={(e) => setFormData({ ...formData, report_purpose: e.target.value })} 
                rows={2} 
                className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2" 
                placeholder="Describe the purpose of the GHG inventory report"
              />
            </div>

            {/* Organizational Boundaries */}
            <div className="p-4 border border-stone-200 rounded-lg space-y-4">
              <div className="flex items-center gap-2">
                <Label className="text-base font-semibold">Organizational Boundaries <span className="text-red-500">*</span></Label>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">
                        <Info className="w-4 h-4 text-text-muted hover:text-primary transition-colors" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs bg-stone-800 text-white p-3 text-sm">
                      <p>It defines which operations and facilities are included in the GHG inventory based on the selected consolidation approach (Equity Share or Control Approach). This helps clarify how emissions are attributed and accounted for within the organization.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <input 
                    type="radio" 
                    id="control_approach" 
                    name="org_boundaries_approach" 
                    value="control"
                    checked={formData.org_boundaries_approach === 'control' || formData.org_boundaries_approach === 'control_operational' || formData.org_boundaries_approach === 'control_financial' || formData.org_boundaries_approach === 'control_both'}
                    onChange={(e) => setFormData({ ...formData, org_boundaries_approach: e.target.value, org_boundaries_equity_percentage: '' })}
                    className="mt-1"
                  />
                  <label htmlFor="control_approach" className="text-sm">
                    <span className="font-medium">Control Approach</span>
                    <p className="text-text-muted mt-1">Under this approach, a company considers and accounts for 100% of the greenhouse gas emissions from operations over which it has either operational or financial control. It does not report the GHG emissions from those operations in which it has no control.</p>
                  </label>
                </div>

                {/* Sub-options for Control Approach - Now allows multiple selection */}
                {(formData.org_boundaries_approach === 'control' || formData.org_boundaries_approach === 'control_operational' || formData.org_boundaries_approach === 'control_financial' || formData.org_boundaries_approach === 'control_both') && (
                  <div className="ml-8 space-y-2 p-3 bg-stone-50 rounded-lg border border-stone-200">
                    <Label className="text-sm font-medium">Select Control Type(s) <span className="text-red-500">*</span></Label>
                    <p className="text-xs text-text-muted mb-2">You can select one or both options</p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input 
                          type="checkbox" 
                          id="control_operational" 
                          checked={formData.control_types?.includes('operational')}
                          onChange={(e) => {
                            const newTypes = e.target.checked 
                              ? [...(formData.control_types || []), 'operational']
                              : (formData.control_types || []).filter(t => t !== 'operational');
                            setFormData({ 
                              ...formData, 
                              control_types: newTypes,
                              org_boundaries_approach: newTypes.length === 2 ? 'control_both' : 
                                newTypes.includes('operational') ? 'control_operational' : 
                                newTypes.includes('financial') ? 'control_financial' : 'control'
                            });
                          }}
                          className="h-4 w-4 rounded border-stone-300"
                        />
                        <label htmlFor="control_operational" className="text-sm cursor-pointer">
                          <span className="font-medium">Operational Control</span>
                          <span className="text-text-muted ml-1">- Full authority to implement operating policies</span>
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input 
                          type="checkbox" 
                          id="control_financial" 
                          checked={formData.control_types?.includes('financial')}
                          onChange={(e) => {
                            const newTypes = e.target.checked 
                              ? [...(formData.control_types || []), 'financial']
                              : (formData.control_types || []).filter(t => t !== 'financial');
                            setFormData({ 
                              ...formData, 
                              control_types: newTypes,
                              org_boundaries_approach: newTypes.length === 2 ? 'control_both' : 
                                newTypes.includes('operational') ? 'control_operational' : 
                                newTypes.includes('financial') ? 'control_financial' : 'control'
                            });
                          }}
                          className="h-4 w-4 rounded border-stone-300"
                        />
                        <label htmlFor="control_financial" className="text-sm cursor-pointer">
                          <span className="font-medium">Financial Control</span>
                          <span className="text-text-muted ml-1">- Ability to direct financial and operating policies</span>
                        </label>
                      </div>
                    </div>
                    {(formData.control_types?.length === 0 || !formData.control_types) && formData.org_boundaries_approach?.startsWith('control') && (
                      <p className="text-xs text-amber-600 mt-2">Please select at least one control type</p>
                    )}
                  </div>
                )}
                
                <div className="flex items-start gap-3">
                  <input 
                    type="radio" 
                    id="equity_share_approach" 
                    name="org_boundaries_approach" 
                    value="equity_share"
                    checked={formData.org_boundaries_approach === 'equity_share'}
                    onChange={(e) => setFormData({ ...formData, org_boundaries_approach: e.target.value })}
                    className="mt-1"
                  />
                  <label htmlFor="equity_share_approach" className="text-sm">
                    <span className="font-medium">Equity Share Approach</span>
                    <p className="text-text-muted mt-1">A company considers and accounts for greenhouse gas emissions from various operations according to its share of equity in those operations.</p>
                  </label>
                </div>

                {formData.org_boundaries_approach === 'equity_share' && (
                  <div className="ml-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-800">
                      <strong>Disclaimer:</strong> It is assumed that the data provided corresponds to emissions from the whole facility.
                    </p>
                    <p className="text-xs text-amber-700 mt-2">
                      You can specify the equity share percentage for each facility in the Facilities page.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2 pt-2 border-t border-stone-100">
                <Label className="text-sm">Additional Boundary Notes</Label>
                <textarea 
                  value={formData.org_boundaries} 
                  onChange={(e) => setFormData({ ...formData, org_boundaries: e.target.value })} 
                  rows={2} 
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2" 
                  placeholder="Any additional notes on organizational boundaries"
                />
              </div>
            </div>

            {/* Uncertainty Assessment */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Uncertainty Assessment</Label>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">
                        <Info className="w-4 h-4 text-text-muted hover:text-primary transition-colors" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs bg-stone-800 text-white p-3 text-sm">
                      <p>Select the measures taken to minimize uncertainty in your GHG inventory.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="space-y-3 p-4 bg-stone-50 rounded-lg border border-stone-200">
                <div className="flex items-start gap-3">
                  <input 
                    type="checkbox" 
                    id="ua_activity_data"
                    checked={formData.uncertainty_assessment?.includes('activity_data_checked')}
                    onChange={(e) => {
                      const newOptions = e.target.checked 
                        ? [...(formData.uncertainty_assessment || []), 'activity_data_checked']
                        : (formData.uncertainty_assessment || []).filter(o => o !== 'activity_data_checked');
                      setFormData({ ...formData, uncertainty_assessment: newOptions });
                    }}
                    className="mt-1 h-4 w-4 rounded border-stone-300"
                  />
                  <label htmlFor="ua_activity_data" className="text-sm cursor-pointer">
                    The input data has been verified using source documents to avoid errors during entry.
                  </label>
                </div>
                <div className="flex items-start gap-3">
                  <input 
                    type="checkbox" 
                    id="ua_inventory_calculations"
                    checked={formData.uncertainty_assessment?.includes('inventory_calculations_checked')}
                    onChange={(e) => {
                      const newOptions = e.target.checked 
                        ? [...(formData.uncertainty_assessment || []), 'inventory_calculations_checked']
                        : (formData.uncertainty_assessment || []).filter(o => o !== 'inventory_calculations_checked');
                      setFormData({ ...formData, uncertainty_assessment: newOptions });
                    }}
                    className="mt-1 h-4 w-4 rounded border-stone-300"
                  />
                  <label htmlFor="ua_inventory_calculations" className="text-sm cursor-pointer">
                    Emission calculations have been checked to ensure data accuracy and consistency across all categories.
                  </label>
                </div>
                <div className="flex items-start gap-3">
                  <input 
                    type="checkbox" 
                    id="ua_emission_factors"
                    checked={formData.uncertainty_assessment?.includes('emission_factors_reliable')}
                    onChange={(e) => {
                      const newOptions = e.target.checked 
                        ? [...(formData.uncertainty_assessment || []), 'emission_factors_reliable']
                        : (formData.uncertainty_assessment || []).filter(o => o !== 'emission_factors_reliable');
                      setFormData({ ...formData, uncertainty_assessment: newOptions });
                    }}
                    className="mt-1 h-4 w-4 rounded border-stone-300"
                  />
                  <label htmlFor="ua_emission_factors" className="text-sm cursor-pointer">
                    Emission factors are taken from reliable sources to reduce uncertainty.
                  </label>
                </div>
                <div className="flex items-start gap-3">
                  <input 
                    type="checkbox" 
                    id="ua_instruments_calibrated"
                    checked={formData.uncertainty_assessment?.includes('instruments_calibrated')}
                    onChange={(e) => {
                      const newOptions = e.target.checked 
                        ? [...(formData.uncertainty_assessment || []), 'instruments_calibrated']
                        : (formData.uncertainty_assessment || []).filter(o => o !== 'instruments_calibrated');
                      setFormData({ ...formData, uncertainty_assessment: newOptions });
                    }}
                    className="mt-1 h-4 w-4 rounded border-stone-300"
                  />
                  <label htmlFor="ua_instruments_calibrated" className="text-sm cursor-pointer">
                    Measurement instruments and lab equipment are regularly calibrated to ensure accurate results.
                  </label>
                </div>
              </div>
            </div>

            {/* GHG Reduction Initiatives */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>GHG Reduction Initiatives</Label>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">
                        <Info className="w-4 h-4 text-text-muted hover:text-primary transition-colors" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs bg-stone-800 text-white p-3 text-sm">
                      <p>It refers to specific activities or initiatives carried out by the organization, either as one-time actions or ongoing efforts, to reduce or prevent direct and indirect GHG emissions, or to increase the removal of greenhouse gases.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <textarea 
                value={formData.ghg_reduction_initiatives} 
                onChange={(e) => setFormData({ ...formData, ghg_reduction_initiatives: e.target.value })} 
                rows={3} 
                className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2" 
                placeholder="Describe any GHG reduction initiatives undertaken or planned"
              />
            </div>

            {/* Internal Performance Tracking */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Internal Performance Tracking Description</Label>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">
                        <Info className="w-4 h-4 text-text-muted hover:text-primary transition-colors" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs bg-stone-800 text-white p-3 text-sm">
                      <p>It refers to the process of monitoring, measuring, and reviewing greenhouse gas emissions and reduction progress to ensure continuous improvement and effective climate management.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <textarea 
                value={formData.internal_performance_tracking} 
                onChange={(e) => setFormData({ ...formData, internal_performance_tracking: e.target.value })} 
                rows={3} 
                className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2" 
                placeholder="Describe how internal GHG performance is tracked and monitored"
              />
            </div>

            <div className="space-y-2">
              <Label>Reporting Frequency</Label>
              <select value={formData.reporting_frequency} onChange={(e) => setFormData({ ...formData, reporting_frequency: e.target.value })} className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3">
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label>Reporting Year Type <span className="text-red-500">*</span></Label>
              <select 
                value={formData.reporting_year_type} 
                onChange={(e) => setFormData({ ...formData, reporting_year_type: e.target.value })} 
                className={`w-full h-10 bg-stone-50 border rounded-lg px-3 ${!formData.reporting_year_type ? 'border-red-300' : 'border-stone-200'}`}
              >
                <option value="">Select Year Type</option>
                <option value="financial_year">Financial Year</option>
                <option value="calendar_year">Calendar Year</option>
              </select>
              {!formData.reporting_year_type && (
                <p className="text-xs text-red-500">This field is required</p>
              )}
            </div>

            {/* Attachments Section */}
            <div className="p-4 border border-stone-200 rounded-lg space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <Paperclip className="w-4 h-4" />
                Attachments
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">
                        <Info className="w-4 h-4 text-text-muted hover:text-primary transition-colors" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs bg-stone-800 text-white p-3 text-sm">
                      <p>You can add organization pictures, satellite images, company policy, website link of the company and any other details related to organization boundary.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              
              {formData.attachments.length > 0 && (
                <div className="space-y-2">
                  {formData.attachments.map((att, idx) => {
                    // Construct proper view and download URLs for uploaded files
                    const isUploadedFile = att.url && (att.url.includes('/api/files/') || att.type === 'file');
                    let viewUrl = isUploadedFile ? att.url : ensureProtocol(att.url);
                    let downloadUrl = att.url;
                    if (isUploadedFile) {
                      const fileIdMatch = att.url.match(/\/api\/files\/([^\/]+)/);
                      if (fileIdMatch) {
                        viewUrl = `${process.env.REACT_APP_BACKEND_URL}/api/files/${fileIdMatch[1]}/view`;
                        downloadUrl = `${process.env.REACT_APP_BACKEND_URL}/api/files/${fileIdMatch[1]}/download`;
                      }
                    }
                    return (
                      <div key={idx} className="flex items-center gap-2 p-2 bg-stone-50 rounded-lg">
                        <Link className="w-4 h-4 text-blue-500" />
                        <span className="flex-1 text-sm truncate">{att.name}</span>
                        <a href={viewUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">View</a>
                        {/* Only show Download for uploaded files, not external links */}
                        {isUploadedFile && (
                          <button 
                            type="button"
                            onClick={(e) => { e.preventDefault(); downloadFile(downloadUrl, att.name); }}
                            className="text-xs text-green-600 hover:underline flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" /> 
                            Download
                          </button>
                        )}
                        <Button type="button" size="sm" variant="ghost" onClick={() => removeAttachment(idx)}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add Link */}
              <div className="space-y-2">
                <Label className="text-sm">Add Link</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    placeholder="Link Name"
                    value={newAttachment.name}
                    onChange={(e) => setNewAttachment({ ...newAttachment, name: e.target.value })}
                    className="bg-stone-50"
                  />
                  <Input
                    placeholder="URL"
                    value={newAttachment.url}
                    onChange={(e) => setNewAttachment({ ...newAttachment, url: e.target.value })}
                    className="bg-stone-50"
                  />
                  <Button type="button" variant="outline" onClick={addAttachment}>
                    <Plus className="w-4 h-4 mr-1" /> Add
                  </Button>
                </div>
              </div>

              {/* Upload File */}
              <div className="space-y-2">
                <Label className="text-sm">Or Upload Files</Label>
                <div 
                  className="border-2 border-dashed border-stone-300 rounded-lg p-4 text-center hover:border-primary transition-colors cursor-pointer"
                  onClick={() => document.getElementById('org-file-upload')?.click()}
                >
                  <input
                    id="org-file-upload"
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                    multiple
                  />
                  <FileText className="w-8 h-8 mx-auto text-stone-400 mb-2" />
                  <p className="text-sm text-text-muted">Drop files here or click to upload</p>
                  <p className="text-xs text-text-muted mt-1">You can select multiple files</p>
                </div>
              </div>
            </div>

            {/* Other Information Section (renamed from Remarks/Notes) */}
            <div className="space-y-2">
              <Label>Other Information</Label>
              <textarea 
                value={formData.other_information} 
                onChange={(e) => setFormData({ ...formData, other_information: e.target.value })} 
                rows={3} 
                className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2" 
                placeholder="Add any additional information about this organization..."
              />
            </div>

            <div className="flex justify-between items-center gap-3 pt-4 border-t border-stone-200">
              <AutoSaveStatus 
                status={saveStatus} 
                lastSavedAt={lastSavedAt} 
                errorMessage={errorMessage}
              />
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => { setEditing(false); resetAutoSave(); }}>Cancel</Button>
                <Button type="submit" className="bg-primary hover:bg-primary/90 text-white" data-testid="save-org-btn">Save Changes</Button>
              </div>
            </div>
          </form>
        </Card>
      ) : (
        /* ========== PREMIUM VIEW-ONLY ORGANIZATION PROFILE ========== */
        <div className="flex flex-col gap-4" data-testid="org-view-mode">

          {/* === QUICK INFO GRID - 2 columns === */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Corporate Address Card */}
            <Card className="p-6 border border-stone-200 rounded-xl bg-white hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 rounded-lg bg-blue-50">
                  <MapPin className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="font-semibold text-text-primary">Corporate Address</h3>
              </div>
              <div className="space-y-3 text-sm">
                {organization?.corporate_address && (
                  <div className="flex justify-between">
                    <span className="text-text-muted">Street</span>
                    <span className="text-text-primary text-right max-w-[60%]">{organization.corporate_address}</span>
                  </div>
                )}
                {organization?.city && (
                  <div className="flex justify-between">
                    <span className="text-text-muted">City</span>
                    <span className="text-text-primary">{organization.city}</span>
                  </div>
                )}
                {organization?.state && (
                  <div className="flex justify-between">
                    <span className="text-text-muted">State</span>
                    <span className="text-text-primary">{organization.state}</span>
                  </div>
                )}
                {organization?.country && (
                  <div className="flex justify-between">
                    <span className="text-text-muted">Country</span>
                    <span className="text-text-primary">{organization.country}</span>
                  </div>
                )}
                {organization?.timezone && (
                  <div className="flex justify-between">
                    <span className="text-text-muted">Timezone</span>
                    <span className="text-text-primary">
                      {timezones.find(tz => tz.value === organization.timezone)?.label || organization.timezone}
                    </span>
                  </div>
                )}
                {organization?.pincode && (
                  <div className="flex justify-between">
                    <span className="text-text-muted">PIN Code</span>
                    <span className="text-text-primary font-mono">{organization.pincode}</span>
                  </div>
                )}
              </div>
            </Card>

            {/* Person Responsible Card */}
            {organization?.person_responsible && (
              <Card className="p-6 border border-stone-200 rounded-xl bg-white hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2 rounded-lg bg-purple-50">
                    <Users className="w-5 h-5 text-purple-600" />
                  </div>
                  <h3 className="font-semibold text-text-primary">Person Responsible</h3>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-lg font-medium text-text-primary">{organization.person_responsible}</p>
                    {organization.person_responsible_designation && (
                      <p className="text-sm text-text-muted flex items-center gap-1 mt-1">
                        <Briefcase className="w-3 h-3" />
                        {organization.person_responsible_designation}
                      </p>
                    )}
                  </div>
                  {organization.person_responsible_contact && (
                    <p className="text-sm text-text-muted flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      {organization.person_responsible_contact}
                    </p>
                  )}
                </div>
              </Card>
            )}
          </div>

          {/* === ORGANIZATION OVERVIEW === */}
          {organization?.general_description && (
            <Card className="p-6 border border-stone-200 rounded-xl bg-white">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-stone-100">
                  <Building className="w-5 h-5 text-stone-600" />
                </div>
                <h3 className="font-semibold text-text-primary">Organization Overview</h3>
              </div>
              <div className="text-text-secondary leading-relaxed">
                {organization.general_description.length > 400 && !expandedSections.description ? (
                  <>
                    <p>{organization.general_description.slice(0, 400)}...</p>
                    <button 
                      onClick={() => toggleSection('description')} 
                      className="mt-2 text-primary text-sm font-medium flex items-center gap-1 hover:underline"
                    >
                      Read More <ChevronDown className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <p>{organization.general_description}</p>
                    {organization.general_description.length > 400 && (
                      <button 
                        onClick={() => toggleSection('description')} 
                        className="mt-2 text-primary text-sm font-medium flex items-center gap-1 hover:underline"
                      >
                        Show Less <ChevronUp className="w-4 h-4" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </Card>
          )}

          {/* === MISSION & VISION SIDE BY SIDE === */}
          {(organization?.mission || organization?.vision) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {organization?.mission && (
                <Card className="p-6 border border-stone-200 rounded-xl bg-gradient-to-br from-white to-emerald-50/30">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-emerald-100">
                      <Target className="w-5 h-5 text-emerald-600" />
                    </div>
                    <h3 className="font-semibold text-text-primary">Mission</h3>
                  </div>
                  <p className="text-text-secondary leading-relaxed">{organization.mission}</p>
                </Card>
              )}
              {organization?.vision && (
                <Card className="p-6 border border-stone-200 rounded-xl bg-gradient-to-br from-white to-blue-50/30">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-blue-100">
                      <Eye className="w-5 h-5 text-blue-600" />
                    </div>
                    <h3 className="font-semibold text-text-primary">Vision</h3>
                  </div>
                  <p className="text-text-secondary leading-relaxed">{organization.vision}</p>
                </Card>
              )}
            </div>
          )}

          {/* === PROCESS DESCRIPTION === */}
          {organization?.process_description && (
            <Card className="p-6 border border-stone-200 rounded-xl bg-white">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-orange-50">
                  <Zap className="w-5 h-5 text-orange-600" />
                </div>
                <h3 className="font-semibold text-text-primary">Operations & Process</h3>
              </div>
              <div className="text-text-secondary leading-relaxed">
                {organization.process_description.length > 400 && !expandedSections.process ? (
                  <>
                    <p>{organization.process_description.slice(0, 400)}...</p>
                    <button 
                      onClick={() => toggleSection('process')} 
                      className="mt-2 text-primary text-sm font-medium flex items-center gap-1 hover:underline"
                    >
                      Read More <ChevronDown className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <p>{organization.process_description}</p>
                    {organization.process_description.length > 400 && (
                      <button 
                        onClick={() => toggleSection('process')} 
                        className="mt-2 text-primary text-sm font-medium flex items-center gap-1 hover:underline"
                      >
                        Show Less <ChevronUp className="w-4 h-4" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </Card>
          )}

          {/* === PURPOSE OF REPORT === */}
          {organization?.report_purpose && (
            <Card className="p-6 border border-stone-200 rounded-xl bg-white">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-indigo-50">
                  <FileText className="w-5 h-5 text-indigo-600" />
                </div>
                <h3 className="font-semibold text-text-primary">Purpose of the Report</h3>
              </div>
              <p className="text-text-secondary leading-relaxed">{organization.report_purpose}</p>
            </Card>
          )}

          {/* === ORGANIZATIONAL BOUNDARIES === */}
          {(organization?.org_boundaries_approach || organization?.org_boundaries) && (
            <Card className="p-6 border border-stone-200 rounded-xl bg-white">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-teal-50">
                  <Shield className="w-5 h-5 text-teal-600" />
                </div>
                <h3 className="font-semibold text-text-primary">Organizational Boundaries</h3>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">
                        <Info className="w-4 h-4 text-text-muted hover:text-primary transition-colors" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs bg-stone-800 text-white p-3 text-sm">
                      <p>Defines which operations and facilities are included in the GHG inventory based on the selected consolidation approach.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="space-y-3">
                {organization.org_boundaries_approach === 'control_operational' && (
                  <div className="p-3 bg-teal-50 rounded-lg border border-teal-100">
                    <Badge className="bg-teal-100 text-teal-800 mb-2">Operational Control</Badge>
                    <p className="text-sm text-text-secondary">The organization accounts for 100% of GHG emissions from operations over which it exercises operational control.</p>
                  </div>
                )}
                {organization.org_boundaries_approach === 'control_financial' && (
                  <div className="p-3 bg-teal-50 rounded-lg border border-teal-100">
                    <Badge className="bg-teal-100 text-teal-800 mb-2">Financial Control</Badge>
                    <p className="text-sm text-text-secondary">The organization accounts for 100% of GHG emissions from operations over which it exercises financial control.</p>
                  </div>
                )}
                {organization.org_boundaries_approach === 'control_both' && (
                  <div className="p-3 bg-teal-50 rounded-lg border border-teal-100">
                    <Badge className="bg-teal-100 text-teal-800 mb-2">Operational & Financial Control</Badge>
                    <p className="text-sm text-text-secondary">The organization accounts for 100% of GHG emissions from operations over which it has both operational and financial control.</p>
                  </div>
                )}
                {organization.org_boundaries_approach === 'control' && (
                  <div className="p-3 bg-teal-50 rounded-lg border border-teal-100">
                    <Badge className="bg-teal-100 text-teal-800 mb-2">Control Approach</Badge>
                    <p className="text-sm text-text-secondary">The organization accounts for 100% of GHG emissions from operations over which it has operational or financial control.</p>
                  </div>
                )}
                {organization.org_boundaries_approach === 'equity_share' && (
                  <div className="space-y-2">
                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                      <Badge className="bg-amber-100 text-amber-800 mb-2">Equity Share Approach</Badge>
                      <p className="text-sm text-text-secondary">The organization accounts for GHG emissions according to its equity share in each facility.</p>
                    </div>
                    {/* <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded flex items-start gap-2">
                      <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span><strong>Disclaimer:</strong> It is assumed that the data provided corresponds to emissions from the whole facility.</span>
                    </p> */}
                  </div>
                )}
                {organization.org_boundaries && (
                  <p className="text-sm text-text-secondary mt-2 pt-2 border-t border-stone-100">{organization.org_boundaries}</p>
                )}
              </div>
            </Card>
          )}

          {/* === GHG REDUCTION INITIATIVES - FULL WIDTH === */}
          {organization?.ghg_reduction_initiatives && (
            <Card className="p-6 border border-stone-200 rounded-xl bg-white">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-green-50">
                  <Leaf className="w-5 h-5 text-green-600" />
                </div>
                <h3 className="font-semibold text-text-primary">GHG Reduction Initiatives</h3>
              </div>
              <p className="text-text-secondary leading-relaxed">{organization.ghg_reduction_initiatives}</p>
            </Card>
          )}

          {/* === INTERNAL PERFORMANCE TRACKING - FULL WIDTH === */}
          {organization?.internal_performance_tracking && (
            <Card className="p-6 border border-stone-200 rounded-xl bg-white">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-cyan-50">
                  <BarChart3 className="w-5 h-5 text-cyan-600" />
                </div>
                <h3 className="font-semibold text-text-primary">Internal Performance Tracking</h3>
              </div>
              <p className="text-text-secondary leading-relaxed">{organization.internal_performance_tracking}</p>
            </Card>
          )}

          {/* === ATTACHMENTS === */}
          {organization?.attachments?.length > 0 && (
            <Card className="p-6 border border-stone-200 rounded-xl bg-white">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-stone-100">
                  <Paperclip className="w-5 h-5 text-stone-600" />
                </div>
                <h3 className="font-semibold text-text-primary">Attachments</h3>
                <Badge variant="outline" className="ml-auto">{organization.attachments.length} files</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {organization.attachments.map((att, idx) => {
                  const isUploadedFile = att.url && (att.url.includes('/api/files/') || att.type === 'file');
                  let viewUrl = isUploadedFile ? att.url : ensureProtocol(att.url);
                  let downloadUrl = att.url;
                  if (isUploadedFile) {
                    const fileIdMatch = att.url.match(/\/api\/files\/([^\/]+)/);
                    if (fileIdMatch) {
                      viewUrl = `${process.env.REACT_APP_BACKEND_URL}/api/files/${fileIdMatch[1]}/view`;
                      downloadUrl = `${process.env.REACT_APP_BACKEND_URL}/api/files/${fileIdMatch[1]}/download`;
                    }
                  }
                  return (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg hover:bg-stone-100 transition-colors group">
                      <div className="p-2 rounded bg-white border border-stone-200">
                        <FileText className="w-4 h-4 text-stone-500" />
                      </div>
                      <span className="flex-1 text-sm font-medium text-text-primary truncate">{att.name}</span>
                      <div className="flex gap-2 opacity-70 group-hover:opacity-100 transition-opacity">
                        <a href={viewUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">View</a>
                        {isUploadedFile && (
                          <button 
                            onClick={(e) => { e.preventDefault(); downloadFile(downloadUrl, att.name); }}
                            className="text-xs text-emerald-600 hover:underline"
                          >
                            Download
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* === OTHER INFORMATION === */}
          {(organization?.other_information || organization?.remarks) && (
            <Card className="p-6 border border-stone-200 rounded-xl bg-white">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-stone-100">
                  <Info className="w-5 h-5 text-stone-600" />
                </div>
                <h3 className="font-semibold text-text-primary">Other Information</h3>
              </div>
              <p className="text-text-secondary leading-relaxed">{organization.other_information || organization.remarks}</p>
            </Card>
          )}

          {/* === RELATED MODULES QUICK NAVIGATION === */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-4">Related Modules</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {/* Facilities */}
              <a href="/facilities" className="block">
                <Card className="p-4 border border-stone-200 rounded-xl bg-white hover:shadow-lg hover:border-primary/30 transition-all cursor-pointer group">
                  <div className="flex flex-col items-center text-center">
                    <div className="p-3 rounded-full bg-blue-50 group-hover:bg-blue-100 transition-colors mb-3">
                      <Factory className="w-6 h-6 text-blue-600" />
                    </div>
                    <h4 className="font-semibold text-text-primary text-sm">Facilities</h4>
                    {moduleCounts.facilities > 0 && (
                      <p className="text-xs text-text-muted mt-1">{moduleCounts.facilities} Facilities</p>
                    )}
                    <ArrowRight className="w-4 h-4 text-text-muted mt-2 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                  </div>
                </Card>
              </a>

              {/* GHG */}
              {organization?.has_ghg !== false && (
                <a href="/ghg" className="block">
                  <Card className="p-4 border border-stone-200 rounded-xl bg-white hover:shadow-lg hover:border-primary/30 transition-all cursor-pointer group">
                    <div className="flex flex-col items-center text-center">
                      <div className="p-3 rounded-full bg-emerald-50 group-hover:bg-emerald-100 transition-colors mb-3">
                        <Leaf className="w-6 h-6 text-emerald-600" />
                      </div>
                      <h4 className="font-semibold text-text-primary text-sm">GHG</h4>
                      <p className="text-xs text-text-muted mt-1">Emissions Data</p>
                      <ArrowRight className="w-4 h-4 text-text-muted mt-2 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </div>
                  </Card>
                </a>
              )}

              {/* Dashboard */}
              <a href="/dashboard" className="block">
                <Card className="p-4 border border-stone-200 rounded-xl bg-white hover:shadow-lg hover:border-primary/30 transition-all cursor-pointer group">
                  <div className="flex flex-col items-center text-center">
                    <div className="p-3 rounded-full bg-teal-50 group-hover:bg-teal-100 transition-colors mb-3">
                      <BarChart3 className="w-6 h-6 text-teal-600" />
                    </div>
                    <h4 className="font-semibold text-text-primary text-sm">Dashboard</h4>
                    <p className="text-xs text-text-muted mt-1">Analytics & Insights</p>
                    <ArrowRight className="w-4 h-4 text-text-muted mt-2 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                  </div>
                </Card>
              </a>

              {/* Targets */}
              <a href="/targets/voluntary/ghg" className="block">
                <Card className="p-4 border border-stone-200 rounded-xl bg-white hover:shadow-lg hover:border-primary/30 transition-all cursor-pointer group">
                  <div className="flex flex-col items-center text-center">
                    <div className="p-3 rounded-full bg-amber-50 group-hover:bg-amber-100 transition-colors mb-3">
                      <Target className="w-6 h-6 text-amber-600" />
                    </div>
                    <h4 className="font-semibold text-text-primary text-sm">Targets</h4>
                    {moduleCounts.targets > 0 ? (
                      <p className="text-xs text-text-muted mt-1">{moduleCounts.targets} Targets</p>
                    ) : (
                      <p className="text-xs text-text-muted mt-1">Set Goals</p>
                    )}
                    <ArrowRight className="w-4 h-4 text-text-muted mt-2 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                  </div>
                </Card>
              </a>

              {/* Reports */}
              <a href="/reports" className="block">
                <Card className="p-4 border border-stone-200 rounded-xl bg-white hover:shadow-lg hover:border-primary/30 transition-all cursor-pointer group">
                  <div className="flex flex-col items-center text-center">
                    <div className="p-3 rounded-full bg-purple-50 group-hover:bg-purple-100 transition-colors mb-3">
                      <FileBarChart className="w-6 h-6 text-purple-600" />
                    </div>
                    <h4 className="font-semibold text-text-primary text-sm">Reports</h4>
                    <p className="text-xs text-text-muted mt-1">Generate Reports</p>
                    <ArrowRight className="w-4 h-4 text-text-muted mt-2 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                  </div>
                </Card>
              </a>
            </div>
          </div>
        </div>
      )}

        {/* Yearly Data Section - Turnover & Production Quantity */}
        <Card className="p-6 border border-stone-200 rounded-xl bg-white mt-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-text-primary">Organization Data</h3>
                <p className="text-xs text-text-muted">Financial turnover and production quantity</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {(() => {
                const isCY = organization?.reporting_year_type === 'calendar_year';
                return (
                  <Select value={yearlyDataYear} onValueChange={setYearlyDataYear}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder={isCY ? "Select CY" : "Select FY"} />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 5 }, (_, i) => {
                        const year = new Date().getFullYear() - i;
                        if (isCY) {
                          return (
                            <SelectItem key={year} value={String(year)}>
                              CY {year}
                            </SelectItem>
                          );
                        }
                        return (
                          <SelectItem key={year} value={`${year}-${String(year + 1).slice(-2)}`}>
                            FY {year}-{String(year + 1).slice(-2)}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                );
              })()}
            </div>
          </div>

          {yearlyDataLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Turnover / Revenue */}
              <div className="space-y-3 p-4 border border-stone-100 rounded-lg">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">
                    Turnover / Revenue
                    <span className="text-text-muted font-normal ml-1">for {organization?.reporting_year_type === 'calendar_year' ? 'CY' : 'FY'} {yearlyDataYear}</span>
                  </Label>
                  <div className="flex items-center gap-2">
                    <Select value={yearlyData.turnover_currency} onValueChange={(v) => setYearlyData(prev => ({ ...prev, turnover_currency: v }))} disabled={subscriptionExpired}>
                      <SelectTrigger className="w-24 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['INR','USD','EUR','GBP','JPY','AUD','CAD','SGD','AED','CHF'].map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={yearlyData.turnover_frequency} onValueChange={(v) => setYearlyData(prev => ({ ...prev, turnover_frequency: v }))} disabled={subscriptionExpired}>
                      <SelectTrigger className="w-28 h-8 text-xs" data-testid="turnover-frequency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yearly">Yearly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {yearlyData.turnover_frequency === 'yearly' ? (
                  <div>
                    <Input type="number" value={yearlyData.turnover} onChange={(e) => setYearlyData(prev => ({ ...prev, turnover: e.target.value }))} placeholder="Enter turnover / revenue" disabled={subscriptionExpired} />
                    {yearlyData.turnover && <p className="text-xs text-text-muted">{yearlyData.turnover_currency} {Number(yearlyData.turnover).toLocaleString()}</p>}
                  </div>
                ) : (
                  <div>
                    <div className="grid grid-cols-4 gap-2">
                      {(organization?.reporting_year_type === 'calendar_year'
                        ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
                        : ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']
                      ).map(m => (
                        <div key={m}>
                          <Label className="text-[10px] text-text-muted">{m}</Label>
                          <Input type="number" className="h-8 text-xs" placeholder="0" disabled={subscriptionExpired}
                            value={yearlyData.turnover_monthly?.[m] || ''}
                            onChange={(e) => setYearlyData(prev => ({ ...prev, turnover_monthly: { ...prev.turnover_monthly, [m]: e.target.value } }))}
                          />
                        </div>
                      ))}
                    </div>
                    {Object.values(yearlyData.turnover_monthly || {}).some(v => v) && (
                      <p className="text-xs text-text-muted mt-1">Total: {yearlyData.turnover_currency} {Object.values(yearlyData.turnover_monthly || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0).toLocaleString()}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Production Quantity */}
              <div className="space-y-3 p-4 border border-stone-100 rounded-lg">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">
                    Production Quantity
                    <span className="text-text-muted font-normal ml-1">for {organization?.reporting_year_type === 'calendar_year' ? 'CY' : 'FY'} {yearlyDataYear}</span>
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input type="text" value={yearlyData.production_unit} onChange={(e) => setYearlyData(prev => ({ ...prev, production_unit: e.target.value }))} placeholder="Unit" className="w-20 h-8 text-xs" disabled={subscriptionExpired} />
                    <Select value={yearlyData.production_quantity_frequency} onValueChange={(v) => setYearlyData(prev => ({ ...prev, production_quantity_frequency: v }))} disabled={subscriptionExpired}>
                      <SelectTrigger className="w-28 h-8 text-xs" data-testid="production-frequency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yearly">Yearly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {yearlyData.production_quantity_frequency === 'yearly' ? (
                  <Input type="number" value={yearlyData.production_quantity} onChange={(e) => setYearlyData(prev => ({ ...prev, production_quantity: e.target.value }))} placeholder="Enter quantity" disabled={subscriptionExpired} />
                ) : (
                  <div>
                    <div className="grid grid-cols-4 gap-2">
                      {(organization?.reporting_year_type === 'calendar_year'
                        ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
                        : ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']
                      ).map(m => (
                        <div key={m}>
                          <Label className="text-[10px] text-text-muted">{m}</Label>
                          <Input type="number" className="h-8 text-xs" placeholder="0" disabled={subscriptionExpired}
                            value={yearlyData.production_quantity_monthly?.[m] || ''}
                            onChange={(e) => setYearlyData(prev => ({ ...prev, production_quantity_monthly: { ...prev.production_quantity_monthly, [m]: e.target.value } }))}
                          />
                        </div>
                      ))}
                    </div>
                    {Object.values(yearlyData.production_quantity_monthly || {}).some(v => v) && (
                      <p className="text-xs text-text-muted mt-1">Total: {Object.values(yearlyData.production_quantity_monthly || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0).toLocaleString()} {yearlyData.production_unit}</p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button onClick={saveYearlyData} disabled={yearlyDataSaving || subscriptionExpired} className="bg-primary hover:bg-primary/90">
                  {yearlyDataSaving ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>) : 'Save Data'}
                </Button>
              </div>
            </div>
          )}
        </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}
