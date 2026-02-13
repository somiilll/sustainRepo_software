import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Plus, Edit, Trash2, Building, Search, ImageOff } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Separate component for Org Card to handle image errors properly
function OrgCard({ org, onEdit, onDelete }) {
  const [imgError, setImgError] = useState(false);
  
  return (
    <Card className="p-6 border border-stone-200 rounded-xl bg-white hover:shadow-lg transition-shadow" data-testid={`org-card-${org.id}`}>
      <div className="flex items-start justify-between mb-4">
        {org.logo && !imgError ? (
          <img 
            src={org.logo} 
            alt={`${org.name} logo`}
            className="w-12 h-12 object-contain rounded-lg border border-stone-100"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="bg-primary/10 p-3 rounded-lg">
            <Building className="w-6 h-6 text-primary" />
          </div>
        )}
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => onEdit(org)} data-testid={`edit-org-${org.id}`}>
            <Edit className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDelete(org.id)} className="text-accent" data-testid={`delete-org-${org.id}`}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <h3 className="text-xl font-heading font-bold text-text-primary mb-2">{org.name}</h3>
      <p className="text-sm text-text-muted mb-3">{org.corporate_address}</p>
      {org.reporting_frequency && (
        <div className="inline-block px-3 py-1 bg-secondary/10 text-secondary text-xs font-medium rounded-full">
          {org.reporting_frequency}
        </div>
      )}
    </Card>
  );
}

export default function OrganizationManagement() {
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [logoError, setLogoError] = useState(false);
  const { getAuthHeader } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    corporate_address: '',
    logo: ''
  });

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
    if (!window.confirm('Are you sure you want to delete this organization?')) return;
    
    try {
      await axios.delete(`${API}/super-admin/organizations/${id}`, {
        headers: getAuthHeader()
      });
      toast.success('Organization deleted successfully');
      fetchOrganizations();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Delete failed');
    }
  };

  const openEditDialog = (org) => {
    setEditingOrg(org);
    setFormData({
      name: org.name,
      corporate_address: org.corporate_address,
      logo: org.logo || ''
    });
    setLogoError(false);
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingOrg(null);
    setFormData({
      name: '',
      corporate_address: '',
      logo: ''
    });
    setLogoError(false);
  };

  const handleLogoChange = (url) => {
    setFormData({ ...formData, logo: url });
    setLogoError(false);
  };

  // Filter organizations based on search
  const filteredOrganizations = useMemo(() => {
    if (!searchTerm) return organizations;
    const term = searchTerm.toLowerCase();
    return organizations.filter(org =>
      org.name?.toLowerCase().includes(term) ||
      org.corporate_address?.toLowerCase().includes(term)
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

              <div className="space-y-2">
                <Label htmlFor="corporate_address">Corporate Address *</Label>
                <Input
                  id="corporate_address"
                  value={formData.corporate_address}
                  onChange={(e) => setFormData({ ...formData, corporate_address: e.target.value })}
                  required
                  className="bg-stone-50"
                  data-testid="org-address-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="logo">Logo URL (Optional)</Label>
                <Input
                  id="logo"
                  type="url"
                  value={formData.logo}
                  onChange={(e) => handleLogoChange(e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className="bg-stone-50"
                  data-testid="org-logo-input"
                />
                {formData.logo && (
                  <div className="mt-2 p-3 bg-stone-50 rounded-lg">
                    <p className="text-xs text-text-muted mb-2">Logo Preview:</p>
                    {logoError ? (
                      <div className="w-32 h-32 flex flex-col items-center justify-center border border-stone-200 rounded-lg bg-stone-100">
                        <ImageOff className="w-8 h-8 text-stone-400 mb-2" />
                        <p className="text-xs text-stone-500">Invalid image URL</p>
                      </div>
                    ) : (
                      <img 
                        src={formData.logo} 
                        alt="Organization logo preview" 
                        className="w-32 h-32 object-contain border border-stone-200 rounded-lg"
                        onError={() => setLogoError(true)}
                        onLoad={() => setLogoError(false)}
                      />
                    )}
                  </div>
                )}
              </div>

              <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800">
                <p className="font-medium mb-1">Note:</p>
                <p className="text-xs">Additional organization details (mission, vision, etc.) can be filled by the admin after organization creation.</p>
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
          placeholder="Search organizations by name..."
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
