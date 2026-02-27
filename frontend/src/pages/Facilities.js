import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Plus, Edit, Building2, MapPin, Paperclip, X, Link, FileText, Eye, Download, Power, PowerOff } from 'lucide-react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Helper function to download files using fetch + blob
const downloadFile = async (url, filename, authToken) => {
  try {
    toast.info('Starting download...');
    const headers = {};
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    const response = await fetch(url, {
      method: 'GET',
      headers: headers
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Download failed: ${response.status} - ${errorText}`);
    }
    
    // Get filename from header if not provided
    if (!filename) {
      const contentDisposition = response.headers.get('content-disposition');
      if (contentDisposition) {
        const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match && match[1]) filename = match[1].replace(/['"]/g, '');
      }
    }
    
    // Add extension based on content-type if missing
    const contentType = response.headers.get('content-type');
    if (!filename) filename = 'download';
    if (contentType && !filename.includes('.')) {
      if (contentType.includes('pdf')) filename += '.pdf';
      else if (contentType.includes('image/png')) filename += '.png';
      else if (contentType.includes('image/jpeg')) filename += '.jpg';
      else if (contentType.includes('excel') || contentType.includes('spreadsheet')) filename += '.xlsx';
      else if (contentType.includes('word') || contentType.includes('document')) filename += '.docx';
    }
    
    const blob = await response.blob();
    if (blob.size === 0) {
      throw new Error('Empty file received');
    }
    
    // Use FileSaver approach - more reliable across browsers
    const blobUrl = window.URL.createObjectURL(blob);
    
    // Create and trigger download
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    link.style.display = 'none';
    
    // Append to body, click, then cleanup
    document.body.appendChild(link);
    
    // Use timeout to ensure DOM is ready
    await new Promise(resolve => setTimeout(resolve, 100));
    link.click();
    
    // Cleanup after a delay
    setTimeout(() => {
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    }, 1000);
    
    toast.success(`Downloaded: ${filename}`);
  } catch (error) {
    console.error('Download error:', error);
    toast.error('Failed to download: ' + error.message);
  }
};

const COUNTRIES = [
  'India', 'United States', 'United Kingdom', 'Germany', 'France', 'Australia', 
  'Canada', 'Japan', 'China', 'Brazil', 'Other'
];

export default function Facilities() {
  const [facilities, setFacilities] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFacility, setEditingFacility] = useState(null);
  const [pincodeError, setPincodeError] = useState('');
  const [showInactive, setShowInactive] = useState(false); // Show inactive facilities toggle
  const [toggleConfirmOpen, setToggleConfirmOpen] = useState(false);
  const [facilityToToggle, setFacilityToToggle] = useState(null);
  const { getAuthHeader, user } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    country: '',
    pincode: '',
    products_manufactured: '',
    product_quantity: '',
    machinery_used: '',
    process_description: '',
    sector: '',
    responsible_person: '',
    monitoring_frequency: 'monthly',
    reporting_frequency: 'monthly',
    attachments: [],
    remarks: ''
  });
  const [showCustomSector, setShowCustomSector] = useState(false);
  const [customSector, setCustomSector] = useState('');
  
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const duplicate = facilities.find(f => 
      f.name.toLowerCase() === formData.name.toLowerCase() && 
      (!editingFacility || f.id !== editingFacility.id)
    );
    
    if (duplicate) {
      toast.error('A facility with this name already exists');
      return;
    }
    
    try {
      if (editingFacility) {
        await axios.put(`${API}/facilities/${editingFacility.id}`, formData, {
          headers: getAuthHeader()
        });
        toast.success('Facility updated successfully');
      } else {
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

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this facility?')) return;
    
    try {
      await axios.delete(`${API}/facilities/${id}`, {
        headers: getAuthHeader()
      });
      toast.success('Facility deleted successfully');
      fetchFacilities();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Delete failed');
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
      products_manufactured: facility.products_manufactured || '',
      product_quantity: facility.product_quantity || '',
      machinery_used: facility.machinery_used || '',
      process_description: facility.process_description || '',
      sector: facility.sector || '',
      responsible_person: facility.responsible_person || '',
      monitoring_frequency: facility.monitoring_frequency || 'monthly',
      reporting_frequency: facility.reporting_frequency || 'monthly',
      attachments: facility.attachments || [],
      remarks: facility.remarks || ''
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingFacility(null);
    setFormData({
      name: '',
      address: '',
      city: '',
      state: '',
      country: '',
      pincode: '',
      products_manufactured: '',
      product_quantity: '',
      machinery_used: '',
      sector: '',
      responsible_person: '',
      monitoring_frequency: 'monthly',
      reporting_frequency: 'monthly',
      attachments: [],
      remarks: ''
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
              onClick={() => { resetForm(); setDialogOpen(true); }}
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
                    {!showCustomSector ? (
                      <div className="space-y-2">
                        <select
                          id="sector"
                          value={formData.sector}
                          onChange={(e) => {
                            if (e.target.value === '__custom__') {
                              setShowCustomSector(true);
                              setFormData({ ...formData, sector: '' });
                            } else {
                              setFormData({ ...formData, sector: e.target.value });
                            }
                          }}
                          required={!showCustomSector}
                          className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                        >
                          <option value="">Select Sector</option>
                          {sectors.map(s => (
                            <option key={s.id} value={s.name}>{s.name}</option>
                          ))}
                          <option value="__custom__">+ Add Custom Sector</option>
                        </select>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          id="sector"
                          value={formData.sector}
                          onChange={(e) => setFormData({ ...formData, sector: e.target.value })}
                          placeholder="Enter custom sector"
                          required
                          className="bg-stone-50 flex-1"
                        />
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setShowCustomSector(false);
                            setFormData({ ...formData, sector: '' });
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="products_manufactured">Products Manufactured</Label>
                    <Input
                      id="products_manufactured"
                      value={formData.products_manufactured}
                      onChange={(e) => setFormData({ ...formData, products_manufactured: e.target.value })}
                      className="bg-stone-50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="product_quantity">Production Capacity</Label>
                    <Input
                      id="product_quantity"
                      value={formData.product_quantity}
                      onChange={(e) => setFormData({ ...formData, product_quantity: e.target.value })}
                      placeholder="e.g., 1000 units/day"
                      className="bg-stone-50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="machinery_used">Machinery Used</Label>
                    <Input
                      id="machinery_used"
                      value={formData.machinery_used}
                      onChange={(e) => setFormData({ ...formData, machinery_used: e.target.value })}
                      className="bg-stone-50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="responsible_person">Responsible Person</Label>
                    <Input
                      id="responsible_person"
                      value={formData.responsible_person}
                      onChange={(e) => setFormData({ ...formData, responsible_person: e.target.value })}
                      className="bg-stone-50"
                    />
                  </div>
                </div>

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
                                  const authHeader = getAuthHeader();
                                  const token = authHeader?.Authorization?.replace('Bearer ', '');
                                  downloadFile(downloadUrl, att.name, token); 
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
                    <Label className="text-sm">Or Upload File</Label>
                    <div 
                      className="border-2 border-dashed border-stone-300 rounded-lg p-4 text-center hover:border-primary transition-colors cursor-pointer"
                      onClick={() => document.getElementById('facility-file-upload')?.click()}
                    >
                      <input
                        id="facility-file-upload"
                        type="file"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const uploadFormData = new FormData();
                            uploadFormData.append('file', file);
                            try {
                              const response = await axios.post(`${API}/upload/evidence`, uploadFormData, {
                                headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' }
                              });
                              // Store the API URL path - view/download will be constructed when displaying
                              setFormData({
                                ...formData,
                                attachments: [...formData.attachments, { 
                                  type: 'file', 
                                  name: file.name, 
                                  url: response.data.url,  // Store relative URL like /api/files/{id}
                                  file_id: response.data.file_id
                                }]
                              });
                              toast.success('File uploaded successfully');
                            } catch (error) {
                              toast.error('Failed to upload file');
                            }
                          }
                        }}
                      />
                      <FileText className="w-8 h-8 mx-auto text-stone-400 mb-2" />
                      <p className="text-sm text-text-muted">Drop file here or click to upload</p>
                      <p className="text-xs text-text-muted mt-1">PDF, Images, Excel, Word (Max 10MB)</p>
                    </div>
                  </div>
                </div>

                {/* Remarks/Notes Section */}
                <div className="space-y-2">
                  <Label htmlFor="remarks">Remarks / Notes</Label>
                  <textarea
                    id="remarks"
                    value={formData.remarks || ''}
                    onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                    rows={3}
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2"
                    placeholder="Add any additional notes or remarks about this facility..."
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => handleDialogChange(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-primary hover:bg-primary/90 text-white">
                    {editingFacility ? 'Update' : 'Create'} Facility
                  </Button>
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
                  {/* Only show edit for active facilities */}
                  {facility.is_active !== false && (
                    <Button size="sm" variant="ghost" onClick={() => openEditDialog(facility)} data-testid={`edit-facility-${facility.id}`}>
                      <Edit className="w-4 h-4" />
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
    </div>
  );
}
