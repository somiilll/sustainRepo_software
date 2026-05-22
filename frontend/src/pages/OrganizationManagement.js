import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion';
import { Plus, Edit, Trash2, Building, Search, ImageOff, MapPin, Upload, Power, PowerOff, Users, CreditCard, FileText, Phone, Mail, Calendar, DollarSign, ChevronDown, Download, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { validateFileSize, getUploadErrorMessage } from '../lib/uploadUtils';
import OrgEmissionsDialog from '../components/OrgEmissionsDialog';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Helper function to download files
const downloadFileHelper = (url, filename) => {
  window.location.href = url;
};

const COUNTRIES = [
  'India', 'United States', 'United Kingdom', 'Germany', 'France', 'Australia', 
  'Canada', 'Japan', 'China', 'Brazil', 'European Union', 'Other'
];

// Separate component for Org Card to handle image errors properly
function OrgCard({ org, onEdit, onToggleActive, onPermanentDelete, onViewEmissions }) {
  const [imgError, setImgError] = useState(false);
  const isActive = org.is_active !== false && !org.is_deleted;
  
  return (
    <Card className={`p-6 border rounded-xl hover:shadow-lg transition-shadow ${isActive ? 'border-stone-200 bg-white' : 'border-red-200 bg-red-50'}`} data-testid={`org-card-${org.id}`}>
      <div className="flex items-start justify-between mb-4">
        {org.logo && !imgError ? (
          <img 
            src={org.logo} 
            alt={`${org.name} logo`}
            className="w-12 h-12 object-contain rounded-lg border border-stone-100"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className={`p-3 rounded-lg ${isActive ? 'bg-primary/10' : 'bg-red-100'}`}>
            <Building className={`w-6 h-6 ${isActive ? 'text-primary' : 'text-red-500'}`} />
          </div>
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onViewEmissions(org)}
            className="text-blue-600 hover:text-blue-700"
            title="View Emissions Distribution"
            data-testid={`view-emissions-${org.id}`}
          >
            <BarChart3 className="w-4 h-4" />
          </Button>
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => onToggleActive(org.id, isActive)} 
            className={isActive ? "text-yellow-600" : "text-green-600"}
            title={isActive ? "Deactivate" : "Reactivate"}
            data-testid={`toggle-org-${org.id}`}
          >
            {isActive ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onEdit(org)} title="Edit" data-testid={`edit-org-${org.id}`}>
            <Edit className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onPermanentDelete(org)} className="text-red-600 hover:text-red-700 hover:bg-red-50" title="Delete" data-testid={`delete-org-${org.id}`}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-xl font-heading font-bold text-text-primary">{org.name}</h3>
        {!isActive && (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">Inactive</span>
        )}
      </div>
      <div className="flex items-start gap-1 text-sm text-text-muted mb-2">
        <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>
          {org.corporate_address}
          {org.city && `, ${org.city}`}
          {org.state && `, ${org.state}`}
          {org.country && ` - ${org.country}`}
          {org.pincode && ` (${org.pincode})`}
        </span>
      </div>
      {/* Report Access Badges */}
      <div className="flex flex-wrap gap-1 mt-2">
        {(org.enabled_access || ['scope1_2']).map(access => (
          <span key={access} className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">
            {access === 'scope1_2' ? 'Scope 1 & 2' : 
             access === 'scope1_2_3' ? 'Scope 1, 2 & 3' : access}
          </span>
        ))}
      </div>
    </Card>
  );
}

export default function OrganizationManagement() {
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [logoPreviewError, setLogoPreviewError] = useState(false);
  const [emissionsDialogOrg, setEmissionsDialogOrg] = useState(null);
  const { getAuthHeader } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    corporate_address: '',
    city: '',
    state: '',
    country: '',
    pincode: '',
    logo: '',
    max_facilities: 10,
    max_admins: 5,
    max_users: 20,
    subscription_expires_at: '',
    enabled_access: ['scope1_2'],
    approval_workflow_enabled: false,
    // SuperAdmin Internal Fields
    date_of_joining: '',
    selected_plan: '',
    trial_period_end_date: '',
    organization_size: '',
    payment_status: '',
    internal_notes: '',
    lead_source: '',
    poc_name: '',
    poc_designation: '',
    poc_phone: '',
    poc_email: '',
    secondary_contact_name: '',
    secondary_contact_phone: '',
    secondary_contact_email: '',
    payment_ledger: [],
    invoice_history: []
  });
  
  const [pincodeError, setPincodeError] = useState('');
  
  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: '',
    description: '',
    action: null,
    actionLabel: 'Confirm',
    variant: 'default' // 'default' or 'destructive'
  });

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    try {
      // Include deleted/inactive organizations so they can be reactivated
      const response = await axios.get(`${API}/super-admin/organizations?include_deleted=true`, {
        headers: getAuthHeader()
      });
      setOrganizations(response.data);
    } catch (error) {
      console.error('Organizations fetch error:', error);
      setOrganizations([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate subscription expiry date is mandatory
    if (!formData.subscription_expires_at) {
      toast.error('Subscription expiry date is mandatory');
      return;
    }
    
    // Validate pincode
    if (formData.pincode && !validatePincode(formData.pincode)) {
      toast.error('Please enter a valid 6-digit pincode');
      return;
    }
    
    try {
      if (editingOrg) {
        await axios.put(`${API}/super-admin/organizations/${editingOrg.id}`, formData, {
          headers: getAuthHeader()
        });
        toast.success('Organization updated successfully');
      } else {
        await axios.post(`${API}/super-admin/organizations`, formData, {
          headers: getAuthHeader()
        });
        toast.success('Organization created successfully');
      }
      setDialogOpen(false);
      resetForm();
      fetchOrganizations();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  // Download file with authentication
  const handleDownloadFile = async (fileUrl, filename) => {
    // If URL doesn't already have /download suffix, add it
    let downloadUrl = fileUrl;
    if (!downloadUrl.endsWith('/download')) {
      // Extract file ID from URL like /api/files/{file_id}
      const fileIdMatch = fileUrl.match(/\/api\/files\/([a-f0-9-]+)/i);
      if (fileIdMatch) {
        downloadUrl = `${BACKEND_URL}/api/files/${fileIdMatch[1]}/download`;
      }
    }
    // Use fetch + blob for proper download
    await downloadFileHelper(downloadUrl, filename || 'file');
  };
  
  // Delete file from R2 storage
  const handleDeleteFile = async (fileUrl) => {
    const fileIdMatch = fileUrl.match(/\/api\/files\/([a-f0-9-]+)/i);
    if (fileIdMatch) {
      try {
        await axios.delete(`${API}/files/${fileIdMatch[1]}`, {
          headers: getAuthHeader()
        });
      } catch (error) {
        console.error('Failed to delete file from storage:', error);
        // Continue even if R2 delete fails
      }
    }
  };

  const handleToggleActive = async (id, currentlyActive) => {
    if (currentlyActive) {
      // Deactivate
      setConfirmDialog({
        open: true,
        title: 'Deactivate Organization',
        description: 'Are you sure you want to deactivate this organization? All admins and users will be blocked from logging in.',
        actionLabel: 'Deactivate',
        variant: 'destructive',
        action: async () => {
          try {
            await axios.delete(`${API}/super-admin/organizations/${id}`, {
              headers: getAuthHeader()
            });
            toast.success('Organization deactivated successfully');
            fetchOrganizations();
          } catch (error) {
            toast.error(error.response?.data?.detail || 'Deactivation failed');
          }
          setConfirmDialog(prev => ({ ...prev, open: false }));
        }
      });
    } else {
      // Reactivate
      setConfirmDialog({
        open: true,
        title: 'Reactivate Organization',
        description: 'Are you sure you want to reactivate this organization? All admins and users will be able to log in again.',
        actionLabel: 'Reactivate',
        variant: 'default',
        action: async () => {
          try {
            await axios.put(`${API}/super-admin/organizations/${id}/reactivate`, {}, {
              headers: getAuthHeader()
            });
            toast.success('Organization reactivated successfully');
            fetchOrganizations();
          } catch (error) {
            toast.error(error.response?.data?.detail || 'Reactivation failed');
          }
          setConfirmDialog(prev => ({ ...prev, open: false }));
        }
      });
    }
  };

  const handlePermanentDelete = async (org) => {
    setConfirmDialog({
      open: true,
      title: 'PERMANENTLY DELETE ORGANIZATION',
      description: `⚠️ WARNING: This action is IRREVERSIBLE!\n\nYou are about to permanently delete "${org.name}" and ALL associated data including:\n• All facilities\n• All emission records\n• All carbon sinks\n• All users and admins\n\nThis data CANNOT be recovered. Are you absolutely sure?`,
      actionLabel: 'Yes, Delete Permanently',
      variant: 'destructive',
      action: async () => {
        try {
          const response = await axios.delete(`${API}/super-admin/organizations/${org.id}/permanent`, {
            headers: getAuthHeader()
          });
          toast.success(`Organization "${org.name}" and all data permanently deleted`);
          fetchOrganizations();
        } catch (error) {
          toast.error(error.response?.data?.detail || 'Permanent deletion failed');
        }
        setConfirmDialog(prev => ({ ...prev, open: false }));
      }
    });
  };

  const openEditDialog = (org) => {
    setEditingOrg(org);
    setFormData({
      name: org.name,
      corporate_address: org.corporate_address,
      city: org.city || '',
      state: org.state || '',
      country: org.country || '',
      pincode: org.pincode || '',
      logo: org.logo || '',
      max_facilities: org.max_facilities || 10,
      max_admins: org.max_admins || 5,
      max_users: org.max_users || 20,
      subscription_expires_at: org.subscription_expires_at ? org.subscription_expires_at.split('T')[0] : '',
      enabled_access: org.enabled_access || ['scope1_2'],
      approval_workflow_enabled: !!org.approval_workflow_enabled,
      // SuperAdmin Internal Fields
      date_of_joining: org.date_of_joining ? org.date_of_joining.split('T')[0] : '',
      selected_plan: org.selected_plan || '',
      trial_period_end_date: org.trial_period_end_date ? org.trial_period_end_date.split('T')[0] : '',
      organization_size: org.organization_size || '',
      payment_status: org.payment_status || '',
      internal_notes: org.internal_notes || '',
      lead_source: org.lead_source || '',
      poc_name: org.poc_name || '',
      poc_designation: org.poc_designation || '',
      poc_phone: org.poc_phone || '',
      poc_email: org.poc_email || '',
      secondary_contact_name: org.secondary_contact_name || '',
      secondary_contact_phone: org.secondary_contact_phone || '',
      secondary_contact_email: org.secondary_contact_email || '',
      payment_ledger: org.payment_ledger || [],
      invoice_history: org.invoice_history || []
    });
    setLogoPreviewError(false);
    setPincodeError('');
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingOrg(null);
    setFormData({
      name: '',
      corporate_address: '',
      city: '',
      state: '',
      country: '',
      pincode: '',
      logo: '',
      max_facilities: 10,
      max_admins: 5,
      max_users: 20,
      subscription_expires_at: '',
      enabled_access: ['scope1_2'],
      approval_workflow_enabled: false,
      // SuperAdmin Internal Fields
      date_of_joining: '',
      selected_plan: '',
      trial_period_end_date: '',
      organization_size: '',
      payment_status: '',
      internal_notes: '',
      lead_source: '',
      poc_name: '',
      poc_designation: '',
      poc_phone: '',
      poc_email: '',
      secondary_contact_name: '',
      secondary_contact_phone: '',
      secondary_contact_email: '',
      payment_ledger: [],
      invoice_history: []
    });
    setLogoPreviewError(false);
    setPincodeError('');
  };
  
  const validatePincode = (value) => {
    if (value && (!/^\d{6}$/.test(value))) {
      setPincodeError('Pincode must be exactly 6 digits');
      return false;
    }
    setPincodeError('');
    return true;
  };
  
  const handlePincodeChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setFormData({ ...formData, pincode: value });
    if (value) validatePincode(value);
    else setPincodeError('');
  };

  const handleLogoChange = (url) => {
    setFormData({ ...formData, logo: url });
    setLogoPreviewError(false);
  };

  // Filter organizations based on search
  const filteredOrganizations = useMemo(() => {
    if (!searchTerm) return organizations;
    const term = searchTerm.toLowerCase();
    return organizations.filter(org =>
      org.name?.toLowerCase().includes(term) ||
      org.corporate_address?.toLowerCase().includes(term) ||
      org.city?.toLowerCase().includes(term) ||
      org.country?.toLowerCase().includes(term)
    );
  }, [organizations, searchTerm]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Organizations</h1>
          <p className="text-text-secondary">Manage all organizations ({organizations.length} total)</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-white rounded-full px-6" data-testid="add-org-button">
              <Plus className="w-4 h-4 mr-2" />
              Add Organization
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingOrg ? 'Edit Organization' : 'Add New Organization'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Organization Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="bg-stone-50"
                  data-testid="org-name-input"
                />
              </div>

              {/* Address Section */}
              <div className="p-4 border border-stone-200 rounded-lg space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                  <MapPin className="w-4 h-4" />
                  Address Details
                </div>
                <div className="space-y-2">
                  <Label htmlFor="corporate_address">Street Address *</Label>
                  <Input
                    id="corporate_address"
                    value={formData.corporate_address}
                    onChange={(e) => setFormData({ ...formData, corporate_address: e.target.value })}
                    required
                    className="bg-stone-50"
                    data-testid="org-address-input"
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
                      onChange={handlePincodeChange}
                      required
                      maxLength={6}
                      placeholder="6-digit pincode"
                      className={`bg-stone-50 ${pincodeError ? 'border-red-500' : ''}`}
                    />
                    {pincodeError && <p className="text-xs text-red-500">{pincodeError}</p>}
                  </div>
                </div>
                
                {/* Organization Limits */}
                <div className="pt-4 border-t border-stone-200">
                  <Label className="text-base font-semibold mb-3 block">Organization Limits</Label>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="max_facilities" className="text-sm">Max Facilities</Label>
                      <Input
                        id="max_facilities"
                        type="number"
                        min="1"
                        max="100"
                        value={formData.max_facilities}
                        onChange={(e) => setFormData({ ...formData, max_facilities: parseInt(e.target.value) || 1 })}
                        className="bg-stone-50"
                        data-testid="max-facilities-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="max_admins" className="text-sm">Max Admins</Label>
                      <Input
                        id="max_admins"
                        type="number"
                        min="1"
                        max="50"
                        value={formData.max_admins}
                        onChange={(e) => setFormData({ ...formData, max_admins: parseInt(e.target.value) || 1 })}
                        className="bg-stone-50"
                        data-testid="max-admins-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="max_users" className="text-sm">Max Users</Label>
                      <Input
                        id="max_users"
                        type="number"
                        min="1"
                        max="200"
                        value={formData.max_users}
                        onChange={(e) => setFormData({ ...formData, max_users: parseInt(e.target.value) || 1 })}
                        className="bg-stone-50"
                        data-testid="max-users-input"
                      />
                    </div>
                  </div>
                  
                  {/* Subscription Expiry */}
                  <div className="pt-4 border-t border-stone-200">
                    <Label className="text-sm font-medium">Subscription Expiry *</Label>
                    <p className="text-xs text-text-muted mb-2">Organization will be automatically deactivated after this date (Required)</p>
                    <Input
                      id="subscription_expires_at"
                      type="date"
                      value={formData.subscription_expires_at}
                      onChange={(e) => setFormData({ ...formData, subscription_expires_at: e.target.value })}
                      className="bg-stone-50 w-48"
                      required
                      data-testid="subscription-expires-input"
                    />
                  </div>
                  
                  {/* Report Access Control */}
                  <div className="pt-4 border-t border-stone-200">
                    <Label className="text-sm font-medium">Report Access</Label>
                    <p className="text-xs text-text-muted mb-3">Select which report templates this organization can access</p>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.enabled_access?.includes('scope1_2')}
                          onChange={(e) => {
                            const newAccess = e.target.checked
                              ? [...(formData.enabled_access || []), 'scope1_2']
                              : (formData.enabled_access || []).filter(a => a !== 'scope1_2');
                            setFormData({ ...formData, enabled_access: newAccess });
                          }}
                          className="w-4 h-4 rounded border-stone-300 text-primary focus:ring-primary"
                          data-testid="access-scope1-2"
                        />
                        <span className="text-sm font-medium">Scope 1 & 2 Report</span>
                        <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded">Available</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.enabled_access?.includes('scope1_2_3')}
                          onChange={(e) => {
                            const newAccess = e.target.checked
                              ? [...(formData.enabled_access || []), 'scope1_2_3']
                              : (formData.enabled_access || []).filter(a => a !== 'scope1_2_3');
                            setFormData({ ...formData, enabled_access: newAccess });
                          }}
                          className="w-4 h-4 rounded border-stone-300 text-primary focus:ring-primary"
                          data-testid="access-scope1-2-3"
                        />
                        <span className="text-sm font-medium">Scope 1, 2 & 3 Report</span>
                        <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded">Available</span>
                      </label>
                    </div>
                  </div>

                  {/* Approval Workflow Toggle */}
                  <div className="pt-4 border-t border-stone-200">
                    <Label className="text-sm font-medium">Approval Workflow</Label>
                    <p className="text-xs text-text-muted mb-3">
                      When enabled, every emission record submitted by a user (create, edit, delete) is held for admin review before it appears in dashboards or reports.
                    </p>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!formData.approval_workflow_enabled}
                        onChange={(e) => setFormData({ ...formData, approval_workflow_enabled: e.target.checked })}
                        className="w-4 h-4 rounded border-stone-300 text-primary focus:ring-primary"
                        data-testid="approval-workflow-toggle"
                      />
                      <span className="text-sm font-medium">Enable Approval Workflow</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${formData.approval_workflow_enabled
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-stone-100 text-stone-600'}`}
                      >
                        {formData.approval_workflow_enabled ? 'On' : 'Off'}
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Company Logo</Label>
                <div className="p-4 border border-stone-200 rounded-lg space-y-4 bg-stone-50">
                  {/* Logo Upload Only */}
                  <div className="space-y-2">
                    <Label className="text-sm">Upload Logo Image</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const sizeErr = validateFileSize(file);
                            if (sizeErr) {
                              toast.error(sizeErr);
                              e.target.value = '';
                              return;
                            }
                            const uploadFormData = new FormData();
                            uploadFormData.append('file', file);
                            try {
                              const response = await axios.post(`${API}/upload/evidence?bucket_type=org_facility`, uploadFormData, {
                                headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' }
                              });
                              // Use /view endpoint for public access (for img tags)
                              handleLogoChange(`${BACKEND_URL}${response.data.url}/view`);
                              toast.success('Logo uploaded successfully');
                            } catch (error) {
                              toast.error(getUploadErrorMessage(error, file));
                            }
                          }
                        }}
                        className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                        data-testid="org-logo-input"
                      />
                      {formData.logo && (
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm"
                          className="text-accent"
                          onClick={() => handleLogoChange('')}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {/* Logo Preview */}
                  {formData.logo && (
                    <div className="pt-2 border-t border-stone-200">
                      <p className="text-xs text-text-muted mb-2">Logo Preview:</p>
                      {logoPreviewError ? (
                        <div className="w-24 h-24 flex flex-col items-center justify-center border border-stone-200 rounded-lg bg-stone-100">
                          <ImageOff className="w-6 h-6 text-stone-400 mb-1" />
                          <p className="text-xs text-stone-500">Invalid URL</p>
                        </div>
                      ) : (
                        <img 
                          src={formData.logo} 
                          alt="Logo preview" 
                          className="w-24 h-24 object-contain border border-stone-200 rounded-lg bg-white"
                          onError={() => setLogoPreviewError(true)}
                          onLoad={() => setLogoPreviewError(false)}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* SuperAdmin Internal Fields - Collapsible Section */}
              <Accordion type="single" collapsible className="border border-purple-200 rounded-lg bg-purple-50/50">
                <AccordionItem value="internal-fields" className="border-none">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline">
                    <div className="flex items-center gap-2 text-purple-700">
                      <FileText className="w-5 h-5" />
                      <span className="font-semibold">Internal Management Fields</span>
                      <span className="text-xs bg-purple-200 text-purple-700 px-2 py-0.5 rounded ml-2">SuperAdmin Only</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <div className="space-y-6">
                      {/* Onboarding & Plan Info */}
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label className="flex items-center gap-1">
                            <Calendar className="w-4 h-4 text-purple-600" />
                            Date of Joining
                          </Label>
                          <Input
                            type="date"
                            value={formData.date_of_joining}
                            onChange={(e) => setFormData({ ...formData, date_of_joining: e.target.value })}
                            className="bg-white"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Selected Plan</Label>
                          <Input
                            value={formData.selected_plan}
                            onChange={(e) => setFormData({ ...formData, selected_plan: e.target.value })}
                            placeholder="e.g., Enterprise, Professional, Starter"
                            className="bg-white"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Trial End Date</Label>
                          <Input
                            type="date"
                            value={formData.trial_period_end_date}
                            onChange={(e) => setFormData({ ...formData, trial_period_end_date: e.target.value })}
                            className="bg-white"
                          />
                        </div>
                      </div>

                      {/* Organization Size & Payment Status */}
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label className="flex items-center gap-1">
                            <Users className="w-4 h-4 text-purple-600" />
                            Organization Size
                          </Label>
                          <select
                            value={formData.organization_size}
                            onChange={(e) => setFormData({ ...formData, organization_size: e.target.value })}
                            className="w-full h-10 bg-white border border-stone-200 rounded-lg px-3"
                          >
                            <option value="">Select Size</option>
                            <option value="1-10">1-10 employees</option>
                            <option value="11-50">11-50 employees</option>
                            <option value="51-200">51-200 employees</option>
                            <option value="201-500">201-500 employees</option>
                            <option value="501-1000">501-1000 employees</option>
                            <option value="1000+">1000+ employees</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label className="flex items-center gap-1">
                            <CreditCard className="w-4 h-4 text-purple-600" />
                            Payment Status
                          </Label>
                          <select
                            value={formData.payment_status}
                            onChange={(e) => setFormData({ ...formData, payment_status: e.target.value })}
                            className="w-full h-10 bg-white border border-stone-200 rounded-lg px-3"
                          >
                            <option value="">Select Status</option>
                            <option value="Active">Active</option>
                            <option value="Pending">Pending</option>
                            <option value="Overdue">Overdue</option>
                            <option value="Trial">Trial</option>
                            <option value="Cancelled">Cancelled</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label>Lead Source</Label>
                          <Input
                            value={formData.lead_source}
                            onChange={(e) => setFormData({ ...formData, lead_source: e.target.value })}
                            placeholder="e.g., Referral, Website, Partner"
                            className="bg-white"
                          />
                        </div>
                      </div>

                      {/* Primary Contact (POC) */}
                      <div className="border-t border-purple-200 pt-4">
                        <Label className="text-sm font-semibold text-purple-700 mb-3 block flex items-center gap-2">
                          <Phone className="w-4 h-4" />
                          Primary Contact (POC)
                        </Label>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm">Name</Label>
                            <Input
                              value={formData.poc_name}
                              onChange={(e) => setFormData({ ...formData, poc_name: e.target.value })}
                              placeholder="Contact name"
                              className="bg-white"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm">Designation</Label>
                            <Input
                              value={formData.poc_designation}
                              onChange={(e) => setFormData({ ...formData, poc_designation: e.target.value })}
                              placeholder="e.g., Sustainability Manager"
                              className="bg-white"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm">Phone</Label>
                            <Input
                              type="tel"
                              value={formData.poc_phone}
                              onChange={(e) => setFormData({ ...formData, poc_phone: e.target.value })}
                              placeholder="+91 98765 43210"
                              className="bg-white"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm">Email</Label>
                            <Input
                              type="email"
                              value={formData.poc_email}
                              onChange={(e) => setFormData({ ...formData, poc_email: e.target.value })}
                              placeholder="contact@company.com"
                              className="bg-white"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Secondary Contact */}
                      <div className="border-t border-purple-200 pt-4">
                        <Label className="text-sm font-semibold text-purple-700 mb-3 block">Secondary Contact</Label>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm">Name</Label>
                            <Input
                              value={formData.secondary_contact_name}
                              onChange={(e) => setFormData({ ...formData, secondary_contact_name: e.target.value })}
                              placeholder="Contact name"
                              className="bg-white"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm">Phone</Label>
                            <Input
                              type="tel"
                              value={formData.secondary_contact_phone}
                              onChange={(e) => setFormData({ ...formData, secondary_contact_phone: e.target.value })}
                              placeholder="+91 98765 43210"
                              className="bg-white"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm">Email</Label>
                            <Input
                              type="email"
                              value={formData.secondary_contact_email}
                              onChange={(e) => setFormData({ ...formData, secondary_contact_email: e.target.value })}
                              placeholder="contact@company.com"
                              className="bg-white"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Payment Ledger */}
                      <div className="border-t border-purple-200 pt-4">
                        <div className="flex items-center justify-between mb-3">
                          <Label className="text-sm font-semibold text-purple-700 flex items-center gap-2">
                            <DollarSign className="w-4 h-4" />
                            Payment Ledger
                          </Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setFormData({
                              ...formData,
                              payment_ledger: [...(formData.payment_ledger || []), { date: '', amount: '', description: '', status: 'Pending' }]
                            })}
                            className="text-purple-600 border-purple-300"
                          >
                            <Plus className="w-4 h-4 mr-1" /> Add Entry
                          </Button>
                        </div>
                        {formData.payment_ledger?.length > 0 ? (
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {formData.payment_ledger.map((entry, idx) => (
                              <div key={idx} className="grid grid-cols-5 gap-2 items-center bg-white p-2 rounded border border-stone-200">
                                <Input
                                  type="date"
                                  value={entry.date}
                                  onChange={(e) => {
                                    const updated = [...formData.payment_ledger];
                                    updated[idx].date = e.target.value;
                                    setFormData({ ...formData, payment_ledger: updated });
                                  }}
                                  className="text-sm"
                                />
                                <Input
                                  type="number"
                                  placeholder="Amount"
                                  value={entry.amount}
                                  onChange={(e) => {
                                    const updated = [...formData.payment_ledger];
                                    updated[idx].amount = e.target.value;
                                    setFormData({ ...formData, payment_ledger: updated });
                                  }}
                                  className="text-sm"
                                />
                                <Input
                                  placeholder="Description"
                                  value={entry.description}
                                  onChange={(e) => {
                                    const updated = [...formData.payment_ledger];
                                    updated[idx].description = e.target.value;
                                    setFormData({ ...formData, payment_ledger: updated });
                                  }}
                                  className="text-sm"
                                />
                                <select
                                  value={entry.status}
                                  onChange={(e) => {
                                    const updated = [...formData.payment_ledger];
                                    updated[idx].status = e.target.value;
                                    setFormData({ ...formData, payment_ledger: updated });
                                  }}
                                  className="h-10 bg-white border border-stone-200 rounded-lg px-2 text-sm"
                                >
                                  <option value="Pending">Pending</option>
                                  <option value="Paid">Paid</option>
                                  <option value="Failed">Failed</option>
                                </select>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const updated = formData.payment_ledger.filter((_, i) => i !== idx);
                                    setFormData({ ...formData, payment_ledger: updated });
                                  }}
                                  className="text-red-500"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-stone-500 italic">No payment entries. Click "Add Entry" to start tracking payments.</p>
                        )}
                      </div>

                      {/* Invoice History */}
                      <div className="border-t border-purple-200 pt-4">
                        <div className="flex items-center justify-between mb-3">
                          <Label className="text-sm font-semibold text-purple-700 flex items-center gap-2">
                            <FileText className="w-4 h-4" />
                            Invoice History
                          </Label>
                        </div>
                        <div className="space-y-2">
                          <input
                            type="file"
                            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                            multiple
                            onChange={async (e) => {
                              const files = Array.from(e.target.files || []);
                              for (const file of files) {
                                const sizeErr = validateFileSize(file);
                                if (sizeErr) {
                                  toast.error(sizeErr);
                                  continue;
                                }
                                const uploadFormData = new FormData();
                                uploadFormData.append('file', file);
                                try {
                                  const response = await axios.post(`${API}/upload/evidence?bucket_type=superadmin`, uploadFormData, {
                                    headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' }
                                  });
                                  setFormData(prev => ({
                                    ...prev,
                                    invoice_history: [...(prev.invoice_history || []), {
                                      date: new Date().toISOString().split('T')[0],
                                      filename: file.name,
                                      url: `${BACKEND_URL}${response.data.url}`,
                                      amount: ''
                                    }]
                                  }));
                                  toast.success(`Invoice "${file.name}" uploaded`);
                                } catch (error) {
                                  toast.error(getUploadErrorMessage(error, file));
                                }
                              }
                              e.target.value = '';
                            }}
                            className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-medium file:bg-purple-100 file:text-purple-700 hover:file:bg-purple-200"
                          />
                          {formData.invoice_history?.length > 0 && (
                            <div className="mt-2 space-y-2 max-h-32 overflow-y-auto">
                              {formData.invoice_history.map((invoice, idx) => (
                                <div key={idx} className="flex items-center justify-between bg-white p-2 rounded border border-stone-200">
                                  <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-purple-600" />
                                    <span className="text-sm">{invoice.filename}</span>
                                    <span className="text-xs text-stone-500">{invoice.date}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <a
                                      href={`${invoice.url}/view`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-purple-600 hover:underline"
                                    >
                                      View
                                    </a>
                                    <button
                                      onClick={() => handleDownloadFile(invoice.url, invoice.filename)}
                                      className="text-xs text-green-600 hover:underline flex items-center gap-1"
                                    >
                                      <Download className="w-3 h-3" />
                                      Download
                                    </button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={async () => {
                                        // Delete from R2 storage first
                                        await handleDeleteFile(invoice.url);
                                        // Then remove from form state
                                        const updated = formData.invoice_history.filter((_, i) => i !== idx);
                                        setFormData({ ...formData, invoice_history: updated });
                                        toast.success('Invoice deleted');
                                      }}
                                      className="text-red-500 h-6 w-6 p-0"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Internal Notes */}
                      <div className="border-t border-purple-200 pt-4">
                        <Label className="text-sm font-semibold text-purple-700 mb-2 block">Internal Notes</Label>
                        <textarea
                          value={formData.internal_notes}
                          onChange={(e) => setFormData({ ...formData, internal_notes: e.target.value })}
                          placeholder="Internal remarks, observations, or notes about this organization..."
                          rows={3}
                          className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm resize-none"
                        />
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-primary hover:bg-primary/90 text-white" data-testid="submit-org-btn">
                  {editingOrg ? 'Update' : 'Create'} Organization
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text-muted" />
        <Input
          placeholder="Search organizations by name, city, country..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 bg-white"
          data-testid="org-search-input"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredOrganizations.map((org) => (
          <OrgCard 
            key={org.id} 
            org={org} 
            onEdit={openEditDialog} 
            onToggleActive={handleToggleActive}
            onPermanentDelete={handlePermanentDelete}
            onViewEmissions={setEmissionsDialogOrg}
          />
        ))}
      </div>

      {filteredOrganizations.length === 0 && organizations.length > 0 && (
        <div className="text-center py-12">
          <Search className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <h3 className="text-xl font-heading font-bold text-text-primary mb-2">No results found</h3>
          <p className="text-text-secondary">Try adjusting your search term</p>
        </div>
      )}

      {organizations.length === 0 && (
        <div className="text-center py-12">
          <Building className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <h3 className="text-xl font-heading font-bold text-text-primary mb-2">No organizations yet</h3>
          <p className="text-text-secondary mb-4">Get started by adding your first organization</p>
        </div>
      )}

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDialog.action}
              className={confirmDialog.variant === 'destructive' ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              {confirmDialog.actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <OrgEmissionsDialog
        org={emissionsDialogOrg}
        open={!!emissionsDialogOrg}
        onOpenChange={(open) => { if (!open) setEmissionsDialogOrg(null); }}
      />
    </div>
  );
}
