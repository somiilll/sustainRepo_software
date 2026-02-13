import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Plus, Edit, Trash2, Building2 } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Facilities() {
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFacility, setEditingFacility] = useState(null);
  const { getAuthHeader, user } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    address: '',
    products_manufactured: '',
    product_quantity: '',
    machinery_used: '',
    sector: '',
    responsible_person: '',
    monitoring_frequency: 'monthly',
    reporting_frequency: 'monthly'
  });

  useEffect(() => {
    fetchFacilities();
  }, []);

  const fetchFacilities = async () => {
    try {
      const response = await axios.get(`${API}/facilities`, {
        headers: getAuthHeader()
      });
      setFacilities(response.data);
    } catch (error) {
      toast.error('Failed to load facilities');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Check for duplicate names
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
      products_manufactured: facility.products_manufactured || '',
      product_quantity: facility.product_quantity || '',
      machinery_used: facility.machinery_used || '',
      sector: facility.sector || '',
      responsible_person: facility.responsible_person || '',
      monitoring_frequency: facility.monitoring_frequency || 'monthly',
      reporting_frequency: facility.reporting_frequency
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingFacility(null);
    setFormData({
      name: '',
      address: '',
      products_manufactured: '',
      product_quantity: '',
      machinery_used: '',
      sector: '',
      responsible_person: '',
      monitoring_frequency: 'monthly',
      reporting_frequency: 'monthly'
    });
  };

  const handleDialogChange = (open) => {
    setDialogOpen(open);
    if (!open) {
      resetForm();
    }
  };

  const canEdit = user?.role === 'admin' || user?.role === 'super_admin';

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
          <p className="text-text-secondary">Manage your organization's facilities</p>
        </div>
        {canEdit && (
          <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 text-white rounded-full px-6 transition-all active:scale-95" data-testid="add-facility-button">
                <Plus className="w-4 h-4 mr-2" />
                Add Facility
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingFacility ? 'Edit Facility' : 'Add New Facility'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4" data-testid="facility-form">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Facility Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      data-testid="facility-name-input"
                      className="bg-stone-50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sector">Sector *</Label>
                    <Input
                      id="sector"
                      value={formData.sector}
                      onChange={(e) => setFormData({ ...formData, sector: e.target.value })}
                      required
                      data-testid="facility-sector-input"
                      className="bg-stone-50"
                      placeholder="e.g., Manufacturing, Energy"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Address *</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    required
                    data-testid="facility-address-input"
                    className="bg-stone-50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="products_manufactured">Products Manufactured</Label>
                    <Input
                      id="products_manufactured"
                      value={formData.products_manufactured}
                      onChange={(e) => setFormData({ ...formData, products_manufactured: e.target.value })}
                      data-testid="facility-products-input"
                      className="bg-stone-50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="product_quantity">Product Quantity</Label>
                    <Input
                      id="product_quantity"
                      value={formData.product_quantity}
                      onChange={(e) => setFormData({ ...formData, product_quantity: e.target.value })}
                      placeholder="e.g., 1000 units/month"
                      className="bg-stone-50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="machinery_used">Machinery Used</Label>
                  <Input
                    id="machinery_used"
                    value={formData.machinery_used}
                    onChange={(e) => setFormData({ ...formData, machinery_used: e.target.value })}
                    data-testid="facility-machinery-input"
                    className="bg-stone-50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="responsible_person">Responsible Person</Label>
                    <Input
                      id="responsible_person"
                      value={formData.responsible_person}
                      onChange={(e) => setFormData({ ...formData, responsible_person: e.target.value })}
                      data-testid="facility-responsible-input"
                      className="bg-stone-50"
                    />
                  </div>
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
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reporting_frequency">Reporting Frequency</Label>
                  <select
                    id="reporting_frequency"
                    value={formData.reporting_frequency}
                    onChange={(e) => setFormData({ ...formData, reporting_frequency: e.target.value })}
                    className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                    data-testid="facility-frequency-select"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => handleDialogChange(false)} data-testid="cancel-button">
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-primary hover:bg-primary/90 text-white" data-testid="submit-facility-button">
                    {editingFacility ? 'Update' : 'Create'} Facility
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {facilities.map((facility) => (
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
                    onClick={() => openEditDialog(facility)}
                    data-testid={`edit-facility-${facility.id}`}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  {user?.role === 'admin' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(facility.id)}
                      className="text-accent hover:text-accent"
                      data-testid={`delete-facility-${facility.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>
            <h3 className="text-xl font-heading font-bold text-text-primary mb-2">{facility.name}</h3>
            <p className="text-sm text-text-muted mb-3">{facility.address}</p>
            {facility.sector && (
              <div className="inline-block px-3 py-1 bg-secondary/10 text-secondary text-xs font-medium rounded-full mb-3">
                {facility.sector}
              </div>
            )}
            <div className="pt-3 border-t border-stone-200 space-y-1">
              {facility.products_manufactured && (
                <p className="text-xs text-text-secondary">
                  <span className="font-medium">Products:</span> {facility.products_manufactured}
                </p>
              )}
              {facility.product_quantity && (
                <p className="text-xs text-text-secondary">
                  <span className="font-medium">Quantity:</span> {facility.product_quantity}
                </p>
              )}
              {facility.machinery_used && (
                <p className="text-xs text-text-secondary">
                  <span className="font-medium">Machinery:</span> {facility.machinery_used}
                </p>
              )}
              {facility.responsible_person && (
                <p className="text-xs text-text-secondary">
                  <span className="font-medium">Responsible:</span> {facility.responsible_person}
                </p>
              )}
              <p className="text-xs text-text-secondary">
                <span className="font-medium">Monitoring:</span> {facility.monitoring_frequency}
              </p>
              <p className="text-xs text-text-secondary">
                <span className="font-medium">Reporting:</span> {facility.reporting_frequency}
              </p>
            </div>
          </Card>
        ))}
      </div>

      {facilities.length === 0 && (
        <div className="text-center py-12">
          <Building2 className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <h3 className="text-xl font-heading font-bold text-text-primary mb-2">No facilities yet</h3>
          <p className="text-text-secondary mb-4">Get started by adding your first facility</p>
        </div>
      )}
    </div>
  );
}