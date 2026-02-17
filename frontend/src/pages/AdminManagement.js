import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { Plus, UserCog, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function AdminManagement() {
  const [admins, setAdmins] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    adminId: null,
    adminEmail: ''
  });
  const { getAuthHeader } = useAuth();

  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    organization_id: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [orgsRes, adminsRes] = await Promise.all([
        axios.get(`${API}/super-admin/organizations`, { headers: getAuthHeader() }),
        axios.get(`${API}/super-admin/admins`, { headers: getAuthHeader() })
      ]);
      setOrganizations(orgsRes.data);
      setAdmins(adminsRes.data);
    } catch (error) {
      console.error('Admin management fetch error:', error);
      setOrganizations([]);
      setAdmins([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${API}/super-admin/admins`, null, {
        headers: getAuthHeader(),
        params: formData
      });
      toast.success(`Admin created! Temporary password: ${response.data.temp_password}`, { duration: 10000 });
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create admin');
    }
  };

  const handleDelete = async (userId, email) => {
    setConfirmDialog({
      open: true,
      adminId: userId,
      adminEmail: email
    });
  };

  const confirmDelete = async () => {
    try {
      await axios.delete(`${API}/super-admin/admins/${confirmDialog.adminId}`, {
        headers: getAuthHeader()
      });
      toast.success('Admin deleted successfully');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Delete failed');
    }
    setConfirmDialog({ open: false, adminId: null, adminEmail: '' });
  };

  const resetForm = () => {
    setFormData({
      email: '',
      full_name: '',
      organization_id: ''
    });
  };

  const getOrgName = (orgId) => {
    const org = organizations.find(o => o.id === orgId);
    return org ? org.name : 'N/A';
  };

  // Filter admins based on search
  const filteredAdmins = useMemo(() => {
    if (!searchTerm) return admins;
    const term = searchTerm.toLowerCase();
    return admins.filter(admin => 
      admin.full_name?.toLowerCase().includes(term) ||
      admin.email?.toLowerCase().includes(term) ||
      getOrgName(admin.organization_id).toLowerCase().includes(term)
    );
  }, [admins, searchTerm, organizations]);

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
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Admin Management</h1>
          <p className="text-text-secondary">Create and manage admins ({admins.length} total)</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-white rounded-full px-6" data-testid="add-admin-btn">
              <Plus className="w-4 h-4 mr-2" />
              Add Admin
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Admin</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name *</Label>
                <Input
                  id="full_name"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  required
                  className="bg-stone-50"
                  data-testid="admin-name-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="bg-stone-50"
                  data-testid="admin-email-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="organization">Organization *</Label>
                <select
                  id="organization"
                  value={formData.organization_id}
                  onChange={(e) => setFormData({ ...formData, organization_id: e.target.value })}
                  required
                  className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                  data-testid="admin-org-select"
                >
                  <option value="">Select Organization</option>
                  {organizations.map(org => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              </div>

              <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800">
                <p className="font-medium mb-1">Note:</p>
                <ul className="text-xs space-y-1 ml-4 list-disc">
                  <li>A temporary password will be generated</li>
                  <li>Admin must change password on first login</li>
                </ul>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-primary hover:bg-primary/90 text-white" data-testid="create-admin-btn">
                  Create Admin
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
          placeholder="Search by name, email, or organization..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 bg-white"
          data-testid="admin-search-input"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredAdmins.map((admin) => (
          <Card key={admin.id} className="p-6 border border-stone-200 rounded-xl bg-white hover:shadow-lg transition-shadow" data-testid={`admin-card-${admin.id}`}>
            <div className="flex items-start justify-between mb-4">
              <div className="bg-primary/10 p-3 rounded-lg">
                <UserCog className="w-6 h-6 text-primary" />
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDelete(admin.id)}
                className="text-accent hover:text-accent"
                data-testid={`delete-admin-${admin.id}`}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
            <h3 className="text-xl font-heading font-bold text-text-primary mb-1">{admin.full_name}</h3>
            <p className="text-sm text-text-muted mb-2">{admin.email}</p>
            <div className="space-y-2">
              <div className="inline-block px-3 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full">
                Admin
              </div>
              {admin.organization_id && (
                <p className="text-xs text-text-secondary mt-2">
                  <span className="font-medium">Organization:</span> {getOrgName(admin.organization_id)}
                </p>
              )}
              {admin.requires_password_change && (
                <div className="mt-2">
                  <span className="inline-block px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                    Pending password change
                  </span>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {filteredAdmins.length === 0 && admins.length > 0 && (
        <div className="text-center py-12">
          <Search className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <h3 className="text-xl font-heading font-bold text-text-primary mb-2">No results found</h3>
          <p className="text-text-secondary">Try adjusting your search term</p>
        </div>
      )}

      {admins.length === 0 && (
        <div className="text-center py-12">
          <UserCog className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <h3 className="text-xl font-heading font-bold text-text-primary mb-2">No admins yet</h3>
          <p className="text-text-secondary mb-4">Create your first admin to get started</p>
        </div>
      )}
    </div>
  );
}
