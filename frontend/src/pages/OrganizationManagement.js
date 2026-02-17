import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Plus, Edit, Trash2, Building, Search, ImageOff, MapPin, Upload, Power, PowerOff } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const COUNTRIES = [
  'India', 'United States', 'United Kingdom', 'Germany', 'France', 'Australia', 
  'Canada', 'Japan', 'China', 'Brazil', 'European Union', 'Other'
];

// Separate component for Org Card to handle image errors properly
function OrgCard({ org, onEdit, onDelete, onToggleActive }) {
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
            onClick={() => onToggleActive(org.id, isActive)} 
            className={isActive ? "text-yellow-600" : "text-green-600"}
            title={isActive ? "Deactivate" : "Reactivate"}
            data-testid={`toggle-org-${org.id}`}
          >
            {isActive ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onEdit(org)} data-testid={`edit-org-${org.id}`}>
            <Edit className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDelete(org.id)} className="text-accent" data-testid={`delete-org-${org.id}`}>
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
    max_users: 20
  });
  
  const [pincodeError, setPincodeError] = useState('');

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    try {
      const response = await axios.get(`${API}/super-admin/organizations`, {
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

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to deactivate this organization? All admins and users will be blocked from logging in.')) return;
    
    try {
      await axios.delete(`${API}/super-admin/organizations/${id}`, {
        headers: getAuthHeader()
      });
      toast.success('Organization deactivated successfully');
      fetchOrganizations();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Deactivation failed');
    }
  };

  const handleToggleActive = async (id, currentlyActive) => {
    const action = currentlyActive ? 'deactivate' : 'reactivate';
    const confirmMsg = currentlyActive 
      ? 'Are you sure you want to deactivate this organization? All admins and users will be blocked from logging in.'
      : 'Are you sure you want to reactivate this organization? All admins and users will be able to log in again.';
    
    if (!window.confirm(confirmMsg)) return;
    
    try {
      if (currentlyActive) {
        await axios.delete(`${API}/super-admin/organizations/${id}`, {
          headers: getAuthHeader()
        });
        toast.success('Organization deactivated successfully');
      } else {
        await axios.put(`${API}/super-admin/organizations/${id}/reactivate`, {}, {
          headers: getAuthHeader()
        });
        toast.success('Organization reactivated successfully');
      }
      fetchOrganizations();
    } catch (error) {
      toast.error(error.response?.data?.detail || `${action} failed`);
    }
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
      max_users: org.max_users || 20
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
      max_users: 20
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
                            const uploadFormData = new FormData();
                            uploadFormData.append('file', file);
                            try {
                              const response = await axios.post(`${API}/upload/evidence`, uploadFormData, {
                                headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' }
                              });
                              // Use /view endpoint for public access (for img tags)
                              handleLogoChange(`${BACKEND_URL}${response.data.url}/view`);
                              toast.success('Logo uploaded successfully');
                            } catch (error) {
                              toast.error('Failed to upload logo');
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
            onDelete={handleDelete} 
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
    </div>
  );
}
