import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Plus, Edit, Building2, MapPin, Paperclip, X, Link, FileText, Eye, Download, Power, PowerOff, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { validateFileSize, getUploadErrorMessage } from '../lib/uploadUtils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { useAutoSave, AutoSaveStatus } from '../hooks/useAutoSave';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const COUNTRIES = [
  'India', 'United States', 'United Kingdom', 'Germany', 'France', 'Australia', 
  'Canada', 'Japan', 'China', 'Brazil', 'Other'
];

export default function Facilities() {
  const [facilities, setFacilities] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFacility, setEditingFacility] = useState(null);
  const [pincodeError, setPincodeError] = useState('');
  const [showInactive, setShowInactive] = useState(false); // Show inactive facilities toggle
  const [toggleConfirmOpen, setToggleConfirmOpen] = useState(false);
  const [facilityToToggle, setFacilityToToggle] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [facilityToDelete, setFacilityToDelete] = useState(null);
  const [sameAsOrg, setSameAsOrg] = useState(false);
  const [autoSavedId, setAutoSavedId] = useState(null); // Track ID from auto-save create
  const { getAuthHeader, user, subscriptionExpired } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    country: '',
    pincode: '',
    products_services: '',  // Renamed from products_manufactured
    machinery_equipment: '',  // Renamed from machinery_used
    process_description: '',
    sector: '',
    sub_sector: '',  // New field for sub-sector
    responsible_person: '',
    responsible_person_designation: '',
    responsible_person_contact: '',
    monitoring_frequency: 'monthly',
    reporting_frequency: 'monthly',
    attachments: [],
    other_information: '',  // Renamed from remarks
    equity_share_percentage: 100  // Default to 100%
  });

  // Helper function to download files - use window.open to escape sandbox
  const downloadFile = async (url, filename) => {
    console.log('=== DOWNLOAD DEBUG ===');
    console.log('URL:', url);
    
    window.open(url, '_blank');
    toast.success(`Opening download: ${filename}`);
  };

  // Validation function for auto-save - checks all mandatory fields
  const validateFacilityForm = useCallback((data) => {
    // Check all mandatory fields
    if (!data.name || data.name.trim() === '') return false;
    if (!data.sector || data.sector.trim() === '') return false;
    if (!data.address || data.address.trim() === '') return false;
    if (!data.city || data.city.trim() === '') return false;
    if (!data.state || data.state.trim() === '') return false;
    if (!data.country || data.country.trim() === '') return false;
    if (!data.pincode || data.pincode.trim() === '') return false;
    if (data.pincode && !/^\d{6}$/.test(data.pincode)) return false;
    if (!data.products_services || data.products_services.trim() === '') return false;
    if (!data.responsible_person || data.responsible_person.trim() === '') return false;
    
    // Check frequency validation
    const frequencyOrder = { 'daily': 1, 'weekly': 2, 'monthly': 3, 'quarterly': 4, 'yearly': 5 };
    const monitoringLevel = frequencyOrder[data.monitoring_frequency] || 3;
    const reportingLevel = frequencyOrder[data.reporting_frequency] || 3;
    if (monitoringLevel > reportingLevel) return false;
    
    return true;
  }, []);

  // Auto-save handler
  const handleAutoSave = useCallback(async (data, isUpdate, existingId) => {
    const recordId = isUpdate ? existingId : (editingFacility?.id || autoSavedId);
    
    // Check for duplicate names
    const duplicate = facilities.find(f => 
      f.name.toLowerCase() === data.name.toLowerCase() && 
      (!recordId || f.id !== recordId)
    );
    
    if (duplicate) {
      throw new Error('A facility with this name already exists');
    }
    
    if (recordId) {
      // Update existing
      await axios.put(`${API}/facilities/${recordId}`, data, {
        headers: getAuthHeader()
      });
      fetchFacilities(); // Refresh list silently
      return { id: recordId };
    } else {
      // Create new
      const response = await axios.post(`${API}/facilities`, data, {
        headers: getAuthHeader()
      });
      const newId = response.data?.id;
      setAutoSavedId(newId);
      fetchFacilities(); // Refresh list silently
      return { id: newId };
    }
  }, [editingFacility, autoSavedId, facilities, getAuthHeader]);

  // Auto-save hook
  const { 
    saveStatus, 
    lastSavedAt, 
    errorMessage,
    triggerSave: triggerAutoSave,
    resetAutoSave 
  } = useAutoSave({
    onSave: handleAutoSave,
    validate: validateFacilityForm,
    formData,
    enabled: dialogOpen && !subscriptionExpired,
    inactivityMs: 5 * 60 * 1000, // 5 minutes
    isEditing: !!editingFacility,
    existingId: editingFacility?.id || autoSavedId
  });
  
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

  const [newAttachment, setNewAttachment] = useState({ name: '', url: '' });

  useEffect(() => {
    fetchFacilities();
    fetchSectors();
    fetchOrganization();
  }, []);

  const fetchFacilities = async () => {
    try {
      const response = await axios.get(`${API}/facilities`, {
        headers: getAuthHeader()
      });
      setFacilities(response.data);
    } catch (error) {
      console.error('Facilities fetch error:', error);
      setFacilities([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSectors = async () => {
    try {
      const response = await axios.get(`${API}/sectors`, {
        headers: getAuthHeader()
      });
      setSectors(response.data);
    } catch (error) {
      console.error('Sectors fetch error:', error);
      setSectors([]);
    }
  };

  const fetchOrganization = async () => {
    try {
      const response = await axios.get(`${API}/organizations/my`, {
        headers: getAuthHeader()
      });
      setOrganization(response.data);
    } catch (error) {
      console.error('Organization fetch error:', error);
      setOrganization(null);
    }
  };

  const handleSameAsOrg = (checked) => {
    setSameAsOrg(checked);
    if (checked && organization) {
      // Copy organization details to form
      setFormData(prev => ({
        ...prev,
        name: organization.name || prev.name,
        address: organization.corporate_address || prev.address,
        city: organization.city || prev.city,
        state: organization.state || prev.state,
        country: organization.country || prev.country,
        pincode: organization.pincode || prev.pincode,
        process_description: organization.process_description || prev.process_description,
        responsible_person: organization.person_responsible || prev.responsible_person,
        reporting_frequency: organization.reporting_frequency || prev.reporting_frequency
      }));
    } else if (!checked) {
      // Clear the copied fields when unchecked
      setFormData(prev => ({
        ...prev,
        name: '',
        address: '',
        city: '',
        state: '',
        country: '',
        pincode: '',
        process_description: '',
        responsible_person: '',
        reporting_frequency: ''
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation: Products/Services is mandatory
    if (!formData.products_services || formData.products_services.trim() === '') {
      toast.error('Products/Services is mandatory');
      return;
    }
    
    // Validation: Person Responsible is mandatory
    if (!formData.responsible_person || formData.responsible_person.trim() === '') {
      toast.error('Person Responsible is mandatory');
      return;
    }
    
    // Validation: Monitoring frequency must be shorter than or equal to reporting frequency
    const frequencyOrder = { 'daily': 1, 'weekly': 2, 'monthly': 3, 'quarterly': 4, 'yearly': 5 };
    const monitoringLevel = frequencyOrder[formData.monitoring_frequency] || 3;
    const reportingLevel = frequencyOrder[formData.reporting_frequency] || 3;
    
    if (monitoringLevel > reportingLevel) {
      toast.error('Monitoring frequency must be shorter than or equal to reporting frequency. (e.g., if reporting is monthly, monitoring can be daily, weekly, or monthly)');
      return;
    }
    
    // Get the ID to check - either from editing or from auto-save
    const currentId = editingFacility?.id || autoSavedId;
    
    const duplicate = facilities.find(f => 
      f.name.toLowerCase() === formData.name.toLowerCase() && 
      (!currentId || f.id !== currentId)
    );
    
    if (duplicate) {
      toast.error('A facility with this name already exists');
      return;
    }
    
    try {
      if (currentId) {
        // Update existing (either editing or auto-saved)
        await axios.put(`${API}/facilities/${currentId}`, formData, {
          headers: getAuthHeader()
        });
        toast.success('Facility updated successfully');
      } else {
        // Create new
        await axios.post(`${API}/facilities`, formData, {
          headers: getAuthHeader()
        });
        toast.success('Facility created successfully');
      }
      setDialogOpen(false);
      resetForm();
      fetchFacilities();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const handleToggleActive = async () => {
    if (!facilityToToggle) return;
    
    try {
      const response = await axios.patch(
        `${API}/facilities/${facilityToToggle.id}/toggle-active`,
        {},
        { headers: getAuthHeader() }
      );
      toast.success(response.data.message);
      fetchFacilities();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to toggle facility status');
    } finally {
      setToggleConfirmOpen(false);
      setFacilityToToggle(null);
    }
  };

  const handleDelete = async () => {
    if (!facilityToDelete) return;
    
    try {
      await axios.delete(`${API}/facilities/${facilityToDelete.id}`, {
        headers: getAuthHeader()
      });
      toast.success('Facility and all related data deleted permanently');
      fetchFacilities();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Delete failed');
    } finally {
      setDeleteConfirmOpen(false);
      setFacilityToDelete(null);
    }
  };

  const openEditDialog = (facility) => {
    setEditingFacility(facility);
    setFormData({
      name: facility.name,
      address: facility.address,
      city: facility.city || '',
      state: facility.state || '',
      country: facility.country || '',
      pincode: facility.pincode || '',
      products_services: facility.products_services || facility.products_manufactured || '',
      machinery_equipment: facility.machinery_equipment || facility.machinery_used || '',
      process_description: facility.process_description || '',
      sector: facility.sector || '',
      sub_sector: facility.sub_sector || '',
      responsible_person: facility.responsible_person || '',
      responsible_person_designation: facility.responsible_person_designation || '',
      responsible_person_contact: facility.responsible_person_contact || '',
      monitoring_frequency: facility.monitoring_frequency || 'monthly',
      reporting_frequency: facility.reporting_frequency || 'monthly',
      attachments: facility.attachments || [],
      other_information: facility.other_information || facility.remarks || '',
      equity_share_percentage: facility.equity_share_percentage ?? 100
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingFacility(null);
    setSameAsOrg(false);
    setAutoSavedId(null);
    resetAutoSave();
    setFormData({
      name: '',
      address: '',
      city: '',
      state: '',
      country: '',
      pincode: '',
      products_services: '',
      machinery_equipment: '',
      process_description: '',
      sector: '',
      sub_sector: '',
      responsible_person: '',
      responsible_person_designation: '',
      responsible_person_contact: '',
      monitoring_frequency: 'monthly',
      reporting_frequency: 'monthly',
      attachments: [],
      other_information: '',
      equity_share_percentage: 100
    });
    setNewAttachment({ name: '', url: '' });
  };

  const handleDialogChange = (open) => {
    setDialogOpen(open);
    if (!open) resetForm();
  };

  const addAttachment = () => {
    if (!newAttachment.name || !newAttachment.url) {
      toast.error('Please provide both name and URL for attachment');
      return;
    }
    setFormData({
      ...formData,
      attachments: [...formData.attachments, { ...newAttachment }]
    });
    setNewAttachment({ type: 'link', name: '', url: '' });
  };

  const removeAttachment = (index) => {
    setFormData({
      ...formData,
      attachments: formData.attachments.filter((_, i) => i !== index)
    });
  };

  // Filter facilities based on active status
  const filteredFacilities = showInactive 
    ? facilities 
    : facilities.filter(f => f.is_active !== false);

  const canEdit = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'user';
  const canDelete = user?.role === 'admin' || user?.role === 'super_admin'; // Only Admin can delete
  const canCreate = user?.role === 'admin'; // Only Admin can create new facilities

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="facilities-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Facilities</h1>
          <p className="text-text-secondary">
            Manage your organization's facilities ({filteredFacilities.length} active
            {facilities.length !== filteredFacilities.length && `, ${facilities.length - filteredFacilities.length} inactive`})
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Show Inactive Toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="w-4 h-4 text-primary rounded"
            />
            <span className="text-sm text-text-muted">Show inactive</span>
          </label>
          
          {canCreate && (
            <Button 
              className="bg-primary hover:bg-primary/90 text-white rounded-full px-6" 
              data-testid="add-facility-button"
              onClick={() => {
                if (subscriptionExpired) {
                  toast.error('Your subscription has expired. Please contact your administrator to renew.');
                  return;
                }
                resetForm(); 
                setDialogOpen(true); 
              }}
              disabled={subscriptionExpired}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Facility
            </Button>
          )}
        </div>
        
        {/* Dialog for both Create and Edit - shown when dialogOpen is true */}
        <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingFacility ? 'Edit' : 'Add'} Facility</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Same as Organization Checkbox - only show when adding new facility */}
                {!editingFacility && organization && (
                  <div className="p-4 border border-green-200 rounded-lg bg-green-50">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sameAsOrg}
                        onChange={(e) => handleSameAsOrg(e.target.checked)}
                        className="w-4 h-4 text-green-600 rounded"
                      />
                      <div>
                        <p className="font-medium text-green-800">Same as Organization</p>
                        <p className="text-xs text-green-600">Auto-fill facility details from organization (still editable)</p>
                      </div>
                    </label>
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Facility Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      className="bg-stone-50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sector">Sector/Industry *</Label>
                    <select
                      id="sector"
                      value={formData.sector}
                      onChange={(e) => setFormData({ ...formData, sector: e.target.value })}
                      required
                      className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                    >
                      <option value="">Select Sector</option>
                      {sectors.map(s => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-text-muted">Contact Administrator to add new sectors</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sub_sector">Sub-Sector</Label>
                    <Input
                      id="sub_sector"
                      value={formData.sub_sector}
                      onChange={(e) => setFormData({ ...formData, sub_sector: e.target.value })}
                      placeholder="Enter sub-sector (optional)"
                      className="bg-stone-50"
                    />
                  </div>
                </div>

                {/* Address Section */}
                <div className="p-4 border border-stone-200 rounded-lg space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                    <MapPin className="w-4 h-4" />
                    Address Details
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">Street Address *</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      required
                      className="bg-stone-50"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city">City *</Label>
                      <Input
                        id="city"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        required
                        className="bg-stone-50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">State/Province *</Label>
                      <Input
                        id="state"
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                        required
                        className="bg-stone-50"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="country">Country *</Label>
                      <select
                        id="country"
                        value={formData.country}
                        onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                        required
                        className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                      >
                        <option value="">Select Country</option>
                        {COUNTRIES.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pincode">PIN/ZIP Code *</Label>
                      <Input
                        id="pincode"
                        value={formData.pincode}
                        onChange={(e) => handlePincodeChange(e.target.value)}
                        required
                        maxLength={6}
                        placeholder="6-digit pincode"
                        className={`bg-stone-50 ${pincodeError ? 'border-red-500' : ''}`}
                      />
                      {pincodeError && <p className="text-xs text-red-500">{pincodeError}</p>}
                    </div>
                  </div>
                </div>

                {/* Products/Services - Full width textarea */}
                <div className="space-y-2">
                  <Label htmlFor="products_services">Products/Services <span className="text-red-500">*</span></Label>
                  <textarea
                    id="products_services"
                    value={formData.products_services}
                    onChange={(e) => setFormData({ ...formData, products_services: e.target.value })}
                    className="w-full min-h-[100px] px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg resize-y"
                    placeholder="Describe the products manufactured or services provided by this facility"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="machinery_equipment">Machinery and Equipments</Label>
                  <textarea
                    id="machinery_equipment"
                    value={formData.machinery_equipment}
                    onChange={(e) => setFormData({ ...formData, machinery_equipment: e.target.value })}
                    className="w-full min-h-[100px] px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg resize-y"
                    placeholder="Describe the machinery and equipment used in this facility"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="process_description">Process Description</Label>
                  <textarea
                    id="process_description"
                    value={formData.process_description}
                    onChange={(e) => setFormData({ ...formData, process_description: e.target.value })}
                    className="w-full min-h-[100px] px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg resize-y"
                    placeholder="Describe the manufacturing or operational processes at this facility"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="responsible_person">Person Responsible <span className="text-red-500">*</span></Label>
                  <Input
                    id="responsible_person"
                    value={formData.responsible_person}
                    onChange={(e) => setFormData({ ...formData, responsible_person: e.target.value })}
                    className="bg-stone-50"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="responsible_person_designation">Designation</Label>
                    <Input
                      id="responsible_person_designation"
                      value={formData.responsible_person_designation}
                      onChange={(e) => setFormData({ ...formData, responsible_person_designation: e.target.value })}
                      className="bg-stone-50"
                      placeholder="e.g., Environmental Manager"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="responsible_person_contact">Contact Details</Label>
                    <Input
                      id="responsible_person_contact"
                      value={formData.responsible_person_contact}
                      onChange={(e) => setFormData({ ...formData, responsible_person_contact: e.target.value })}
                      className="bg-stone-50"
                      placeholder="Email or phone"
                    />
                  </div>
                </div>

                {/* Equity Share Percentage - Only show if organization uses equity share approach */}
                {organization?.org_boundaries_approach === 'equity_share' && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="equity_share_percentage" className="text-amber-800 font-medium">
                        Equity Share Percentage (%) <span className="text-red-500">*</span>
                      </Label>
                    </div>
                    <p className="text-xs text-amber-700 mb-2">
                      Your organization uses the Equity Share Approach. Specify what percentage of this facility your organization owns.
                    </p>
                    <Input
                      id="equity_share_percentage"
                      type="number"
                      min="0.01"
                      max="100"
                      step="0.01"
                      value={formData.equity_share_percentage}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '' || (parseFloat(value) > 0 && parseFloat(value) <= 100)) {
                          setFormData({ ...formData, equity_share_percentage: value });
                        }
                      }}
                      className="bg-white w-32"
                      placeholder="e.g., 100"
                    />
                    <p className="text-xs text-amber-600 mt-1">
                      Default is 100%. Enter a value between 0 and 100.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="monitoring_frequency">Monitoring Frequency</Label>
                    <select
                      id="monitoring_frequency"
                      value={formData.monitoring_frequency}
                      onChange={(e) => setFormData({ ...formData, monitoring_frequency: e.target.value })}
                      className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reporting_frequency">Reporting Frequency</Label>
                    <select
                      id="reporting_frequency"
                      value={formData.reporting_frequency}
                      onChange={(e) => setFormData({ ...formData, reporting_frequency: e.target.value })}
                      className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                </div>

                {/* Attachments Section */}
                <div className="p-4 border border-stone-200 rounded-lg space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                    <Paperclip className="w-4 h-4" />
                    Attachments
                  </div>
                  
                  {formData.attachments.length > 0 && (
                    <div className="space-y-2">
                      {formData.attachments.map((att, idx) => {
                        // Determine if this is an uploaded file or external link
                        const isUploadedFile = att.url && (att.url.includes('/api/files/') || att.type === 'file');
                        
                        // For uploaded files, construct proper view/download URLs
                        let viewUrl = att.url;
                        let downloadUrl = att.url;
                        
                        if (isUploadedFile) {
                          // Extract file ID from URL patterns like:
                          // /api/files/{id}/view or /api/files/{id} or full URL with same pattern
                          const fileIdMatch = att.url.match(/\/api\/files\/([^\/]+)/);
                          if (fileIdMatch) {
                            const fileId = fileIdMatch[1];
                            viewUrl = `${BACKEND_URL}/api/files/${fileId}/view`;
                            downloadUrl = `${BACKEND_URL}/api/files/${fileId}/download`;
                          }
                        }
                        
                        return (
                          <div key={idx} className="flex items-center gap-2 p-2 bg-stone-50 rounded-lg">
                            {isUploadedFile ? (
                              <FileText className="w-4 h-4 text-blue-500" />
                            ) : (
                              <Link className="w-4 h-4 text-blue-500" />
                            )}
                            <span className="flex-1 text-sm truncate">{att.name}</span>
                            <a 
                              href={isUploadedFile ? viewUrl : att.url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                              title="View file"
                            >
                              <Eye className="w-3 h-3" />
                              View
                            </a>
                            {/* Only show Download for uploaded files, not external links */}
                            {isUploadedFile && (
                              <button 
                                type="button"
                                onClick={(e) => { 
                                  e.preventDefault(); 
                                  downloadFile(downloadUrl, att.name); 
                                }}
                                className="text-xs text-green-600 hover:underline flex items-center gap-1"
                                title="Download file"
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
                        <Plus className="w-4 h-4 mr-1" /> Add Link
                      </Button>
                    </div>
                  </div>

                  {/* Upload File */}
                  <div className="space-y-2">
                    <Label className="text-sm">Or Upload Files</Label>
                    <div 
                      className="border-2 border-dashed border-stone-300 rounded-lg p-4 text-center hover:border-primary transition-colors cursor-pointer"
                      onClick={() => document.getElementById('facility-file-upload')?.click()}
                    >
                      <input
                        id="facility-file-upload"
                        type="file"
                        className="hidden"
                        multiple
                        onChange={async (e) => {
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
                              const response = await axios.post(`${API}/upload/evidence?bucket_type=org_facility`, uploadFormData, {
                                headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' }
                              });
                              newAttachments.push({ 
                                type: 'file', 
                                name: file.name, 
                                url: response.data.url,
                                file_id: response.data.file_id
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
                        }}
                      />
                      <FileText className="w-8 h-8 mx-auto text-stone-400 mb-2" />
                      <p className="text-sm text-text-muted">Drop files here or click to upload</p>
                      <p className="text-xs text-text-muted mt-1">PDF, Images, Excel, Word (Max 5MB) - Multiple files allowed</p>
                    </div>
                  </div>
                </div>

                {/* Other Information Section (renamed from Remarks/Notes) */}
                <div className="space-y-2">
                  <Label htmlFor="other_information">Other Information</Label>
                  <textarea
                    id="other_information"
                    value={formData.other_information || ''}
                    onChange={(e) => setFormData({ ...formData, other_information: e.target.value })}
                    rows={3}
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2"
                    placeholder="Add any additional information about this facility..."
                  />
                </div>

                <div className="flex justify-between items-center gap-3 pt-4 border-t border-stone-200">
                  <AutoSaveStatus 
                    status={saveStatus} 
                    lastSavedAt={lastSavedAt} 
                    errorMessage={errorMessage}
                  />
                  <div className="flex gap-3">
                    <Button type="button" variant="outline" onClick={() => handleDialogChange(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" className="bg-primary hover:bg-primary/90 text-white">
                      {editingFacility || autoSavedId ? 'Update' : 'Create'} Facility
                    </Button>
                  </div>
                </div>
              </form>
            </DialogContent>
          </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredFacilities.map((facility) => (
          <Card key={facility.id} className="p-6 border border-stone-200 rounded-xl bg-white hover:shadow-lg transition-shadow" data-testid={`facility-card-${facility.id}`}>
            <div className="flex items-start justify-between mb-4">
              <div className="bg-primary/10 p-3 rounded-lg">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  {/* Deactivate/Activate button - Admin only */}
                  {canDelete && (
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => {
                        setFacilityToToggle(facility);
                        setToggleConfirmOpen(true);
                      }}
                      className={facility.is_active === false ? 'text-green-600' : 'text-amber-600'}
                      title={facility.is_active === false ? 'Activate Facility' : 'Deactivate Facility'}
                      data-testid={`toggle-facility-${facility.id}`}
                    >
                      {facility.is_active === false ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                    </Button>
                  )}
                  {/* Only show edit for active facilities */}
                  {facility.is_active !== false && (
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => {
                        if (subscriptionExpired) {
                          toast.error('Your subscription has expired. Please contact your administrator to renew.');
                          return;
                        }
                        openEditDialog(facility);
                      }} 
                      disabled={subscriptionExpired}
                      data-testid={`edit-facility-${facility.id}`}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                  )}
                  {/* Delete button - permanently deletes facility and all data */}
                  {canDelete && (
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => {
                        setFacilityToDelete(facility);
                        setDeleteConfirmOpen(true);
                      }}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      title="Permanently delete facility"
                      data-testid={`delete-facility-${facility.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xl font-heading font-bold text-text-primary">{facility.name}</h3>
              {facility.is_active === false && (
                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded">Inactive</span>
              )}
            </div>
            <div className="flex items-start gap-1 text-sm text-text-muted mb-2">
              <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                {facility.address}
                {facility.city && `, ${facility.city}`}
                {facility.state && `, ${facility.state}`}
                {facility.country && ` - ${facility.country}`}
                {facility.pincode && ` (${facility.pincode})`}
              </span>
            </div>
            {facility.sector && (
              <div className="inline-block px-3 py-1 bg-secondary/10 text-secondary text-xs font-medium rounded-full mb-2">
                {facility.sector}
              </div>
            )}
            {/* Show Equity Share Percentage if org uses equity share approach */}
            {organization?.org_boundaries_approach === 'equity_share' && facility.equity_share_percentage != null && (
              <div className="inline-block ml-2 px-3 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-full mb-2">
                Equity: {facility.equity_share_percentage}%
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="px-2 py-1 bg-stone-100 text-text-muted text-xs rounded">
                Monitor: {facility.monitoring_frequency}
              </span>
              <span className="px-2 py-1 bg-stone-100 text-text-muted text-xs rounded">
                Report: {facility.reporting_frequency}
              </span>
            </div>
            {facility.attachments?.length > 0 && (
              <div className="mt-3 pt-3 border-t border-stone-100">
                <p className="text-xs text-text-muted mb-1">{facility.attachments.length} attachment(s)</p>
              </div>
            )}
          </Card>
        ))}
      </div>

      {filteredFacilities.length === 0 && (
        <div className="text-center py-12">
          <Building2 className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <h3 className="text-xl font-heading font-bold text-text-primary mb-2">No facilities yet</h3>
          <p className="text-text-secondary mb-4">Get started by adding your first facility</p>
        </div>
      )}

      {/* Toggle Active Confirmation Dialog */}
      <AlertDialog open={toggleConfirmOpen} onOpenChange={setToggleConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {facilityToToggle?.is_active === false ? 'Activate Facility' : 'Deactivate Facility'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {facilityToToggle?.is_active === false ? (
                <>Are you sure you want to <strong>activate</strong> "{facilityToToggle?.name}"? This will restore visibility of all emissions from this facility.</>
              ) : (
                <>Are you sure you want to <strong>deactivate</strong> "{facilityToToggle?.name}"? This will hide all emissions from this facility and prevent user assignments.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleToggleActive}
              className={facilityToToggle?.is_active === false ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-600 hover:bg-amber-700'}
            >
              {facilityToToggle?.is_active === false ? 'Activate' : 'Deactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600">
              Permanently Delete Facility
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Are you sure you want to <strong className="text-red-600">permanently delete</strong> "{facilityToDelete?.name}"?</p>
              <p className="text-red-600 font-medium">This action cannot be undone and will delete:</p>
              <ul className="list-disc list-inside text-sm space-y-1 ml-2">
                <li>All emission records for this facility</li>
                <li>All sink records for this facility</li>
                <li>All attachments and files</li>
                <li>The facility itself</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
