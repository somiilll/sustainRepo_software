import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Building, MapPin, ImageOff, Paperclip, Link, X, Plus, FileText, Upload } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const COUNTRIES = [
  'India', 'United States', 'United Kingdom', 'Germany', 'France', 'Australia', 
  'Canada', 'Japan', 'China', 'Brazil', 'European Union', 'Other'
];

export default function OrganizationDetails() {
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [pincodeError, setPincodeError] = useState('');
  const { getAuthHeader, user } = useAuth();

  // Check if user is Admin (can edit) or User (read-only)
  const canEdit = user?.role === 'admin';
  
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

  const [formData, setFormData] = useState({
    name: '',
    corporate_address: '',
    city: '',
    state: '',
    country: '',
    pincode: '',
    logo: '',
    general_description: '',
    mission: '',
    vision: '',
    process_description: '',
    org_boundaries: '',
    remarks: '',
    reporting_frequency: 'yearly',
    attachments: []
  });

  const [newAttachment, setNewAttachment] = useState({ name: '', url: '' });

  useEffect(() => {
    fetchOrganization();
  }, []);

  const fetchOrganization = async () => {
    try {
      const response = await axios.get(`${API}/organizations/my`, {
        headers: getAuthHeader()
      });
      setOrganization(response.data);
      setFormData({
        name: response.data.name,
        corporate_address: response.data.corporate_address,
        city: response.data.city || '',
        state: response.data.state || '',
        country: response.data.country || '',
        pincode: response.data.pincode || '',
        logo: response.data.logo || '',
        general_description: response.data.general_description || '',
        mission: response.data.mission || '',
        vision: response.data.vision || '',
        process_description: response.data.process_description || '',
        org_boundaries: response.data.org_boundaries || '',
        remarks: response.data.remarks || '',
        reporting_frequency: response.data.reporting_frequency || 'yearly',
        attachments: response.data.attachments || []
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
    const uploadFormData = new FormData();
    uploadFormData.append('file', file);

    try {
      const response = await axios.post(`${API}/upload/evidence`, uploadFormData, {
        headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' }
      });
      
      // Use /view endpoint for public access (for img tags)
      const logoUrl = `${BACKEND_URL}${response.data.url}/view`;
      setFormData({ ...formData, logo: logoUrl });
      setLogoError(false);
      toast.success('Logo uploaded successfully');
    } catch (error) {
      toast.error('Failed to upload logo');
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
    const file = e.target.files?.[0];
    if (!file) return;

    const uploadFormData = new FormData();
    uploadFormData.append('file', file);

    try {
      const response = await axios.post(`${API}/upload/evidence`, uploadFormData, {
        headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' }
      });
      
      // Use /view endpoint for images, regular for other files
      const fileUrl = file.type.startsWith('image/') 
        ? `${BACKEND_URL}${response.data.url}/view`
        : `${BACKEND_URL}${response.data.url}`;
      
      setFormData({
        ...formData,
        attachments: [...formData.attachments, { 
          name: file.name, 
          url: fileUrl 
        }]
      });
      toast.success('File uploaded successfully');
    } catch (error) {
      toast.error('Failed to upload file');
    }
  };

  const removeAttachment = (index) => {
    setFormData({
      ...formData,
      attachments: formData.attachments.filter((_, i) => i !== index)
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Prepare data, converting empty strings to null for optional fields
      const submitData = {
        ...formData,
        reporting_frequency: formData.reporting_frequency || 'yearly'
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Organization Details</h1>
          <p className="text-text-secondary">
            {canEdit ? 'Manage your organization information' : 'View organization information (read-only)'}
          </p>
        </div>
        {canEdit && !editing && (
          <Button onClick={() => setEditing(true)} className="bg-primary hover:bg-primary/90 text-white rounded-full px-6" data-testid="edit-org-btn">
            Edit Details
          </Button>
        )}
      </div>

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
                      src={formData.logo} 
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
                Address Details
              </div>
              <div className="space-y-2">
                <Label>Street Address (Read-only)</Label>
                <Input value={formData.corporate_address} disabled className="bg-stone-100" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className="bg-stone-50" />
                </div>
                <div className="space-y-2">
                  <Label>State/Province</Label>
                  <Input value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} className="bg-stone-50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Country</Label>
                  <select value={formData.country} onChange={(e) => setFormData({ ...formData, country: e.target.value })} className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3">
                    <option value="">Select Country</option>
                    {COUNTRIES.map(c => (<option key={c} value={c}>{c}</option>))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>PIN/ZIP Code</Label>
                  <Input 
                    value={formData.pincode} 
                    onChange={(e) => handlePincodeChange(e.target.value)} 
                    maxLength={6}
                    placeholder="6-digit pincode"
                    className={`bg-stone-50 ${pincodeError ? 'border-red-500' : ''}`} 
                  />
                  {pincodeError && <p className="text-xs text-red-500">{pincodeError}</p>}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>General Description</Label>
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

            <div className="space-y-2">
              <Label>Organizational Boundaries</Label>
              <textarea value={formData.org_boundaries} onChange={(e) => setFormData({ ...formData, org_boundaries: e.target.value })} rows={2} className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2" placeholder="Define the operational and organizational boundaries" />
            </div>

            <div className="space-y-2">
              <Label>Reporting Frequency</Label>
              <select value={formData.reporting_frequency} onChange={(e) => setFormData({ ...formData, reporting_frequency: e.target.value })} className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3">
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
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
                    // Construct proper view and download URLs for uploaded files
                    const isUploadedFile = att.url && (att.url.includes('/api/files/') || att.type === 'file');
                    let viewUrl = att.url;
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
                        <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 hover:underline">Download</a>
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
                <Label className="text-sm">Or Upload File</Label>
                <div 
                  className="border-2 border-dashed border-stone-300 rounded-lg p-4 text-center hover:border-primary transition-colors cursor-pointer"
                  onClick={() => document.getElementById('org-file-upload')?.click()}
                >
                  <input
                    id="org-file-upload"
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <FileText className="w-8 h-8 mx-auto text-stone-400 mb-2" />
                  <p className="text-sm text-text-muted">Drop file here or click to upload</p>
                </div>
              </div>
            </div>

            {/* Remarks/Notes Section */}
            <div className="space-y-2">
              <Label>Remarks / Notes</Label>
              <textarea 
                value={formData.remarks} 
                onChange={(e) => setFormData({ ...formData, remarks: e.target.value })} 
                rows={3} 
                className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2" 
                placeholder="Add any additional notes or remarks about this organization..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90 text-white" data-testid="save-org-btn">Save Changes</Button>
            </div>
          </form>
        </Card>
      ) : (
        <Card className="p-6 border border-stone-200 rounded-xl bg-white">
          <div className="space-y-6">
            <div className="flex items-start gap-4 mb-4">
              {organization?.logo && !logoError && (
                <img src={organization.logo} alt={organization.name} className="w-20 h-20 object-contain rounded-lg border border-stone-200" onError={() => setLogoError(true)} />
              )}
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-3 rounded-lg"><Building className="w-6 h-6 text-primary" /></div>
                <div>
                  <h2 className="text-2xl font-heading font-bold text-text-primary">{organization?.name}</h2>
                  <div className="flex items-start gap-1 text-sm text-text-muted">
                    <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>
                      {organization?.corporate_address}
                      {organization?.city && `, ${organization.city}`}
                      {organization?.state && `, ${organization.state}`}
                      {organization?.country && ` - ${organization.country}`}
                      {organization?.pincode && ` (${organization.pincode})`}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {organization?.general_description && (
              <div>
                <h3 className="text-sm font-medium text-text-muted mb-1">General Description</h3>
                <p className="text-text-primary">{organization.general_description}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-6">
              {organization?.mission && (
                <div>
                  <h3 className="text-sm font-medium text-text-muted mb-1">Mission</h3>
                  <p className="text-text-primary">{organization.mission}</p>
                </div>
              )}
              {organization?.vision && (
                <div>
                  <h3 className="text-sm font-medium text-text-muted mb-1">Vision</h3>
                  <p className="text-text-primary">{organization.vision}</p>
                </div>
              )}
            </div>

            {organization?.process_description && (
              <div>
                <h3 className="text-sm font-medium text-text-muted mb-1">Process Description</h3>
                <p className="text-text-primary">{organization.process_description}</p>
              </div>
            )}

            {organization?.org_boundaries && (
              <div>
                <h3 className="text-sm font-medium text-text-muted mb-1">Organizational Boundaries</h3>
                <p className="text-text-primary">{organization.org_boundaries}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-6">
              {organization?.reporting_frequency && (
                <div>
                  <h3 className="text-sm font-medium text-text-muted mb-1">Reporting Frequency</h3>
                  <p className="text-text-primary capitalize">{organization.reporting_frequency}</p>
                </div>
              )}
            </div>

            {organization?.attachments?.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-text-muted mb-2 flex items-center gap-1">
                  <Paperclip className="w-4 h-4" /> Attachments
                </h3>
                <div className="space-y-2">
                  {organization.attachments.map((att, idx) => {
                    // Construct proper view and download URLs for uploaded files
                    const isUploadedFile = att.url && (att.url.includes('/api/files/') || att.type === 'file');
                    let viewUrl = att.url;
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
                        <span className="flex-1 text-sm">{att.name}</span>
                        <a href={viewUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">View</a>
                        <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 hover:underline">Download</a>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {organization?.remarks && (
              <div>
                <h3 className="text-sm font-medium text-text-muted mb-1">Remarks / Notes</h3>
                <p className="text-text-primary">{organization.remarks}</p>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
