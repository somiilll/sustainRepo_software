import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Plus, Edit, Trash2, Layers } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Sectors() {
  const [sectors, setSectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSector, setEditingSector] = useState(null);
  const { getAuthHeader } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    description: ''
  });

  useEffect(() => {
    fetchSectors();
  }, []);

  const fetchSectors = async () => {
    try {
      const response = await axios.get(`${API}/sectors`, {
        headers: getAuthHeader()
      });
      setSectors(response.data);
    } catch (error) {
      console.error('Sectors fetch error:', error);
      toast.error('Failed to load sectors');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingSector) {
        await axios.put(`${API}/super-admin/sectors/${editingSector.id}`, formData, {
          headers: getAuthHeader()
        });
        toast.success('Sector updated successfully');
      } else {
        await axios.post(`${API}/super-admin/sectors`, formData, {
          headers: getAuthHeader()
        });
        toast.success('Sector created successfully');
      }
      setDialogOpen(false);
      resetForm();
      fetchSectors();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this sector?')) {
      try {
        await axios.delete(`${API}/super-admin/sectors/${id}`, {
          headers: getAuthHeader()
        });
        toast.success('Sector deleted successfully');
        fetchSectors();
      } catch (error) {
        toast.error(error.response?.data?.detail || 'Delete failed');
      }
    }
  };

  const openEditDialog = (sector) => {
    setEditingSector(sector);
    setFormData({
      name: sector.name,
      description: sector.description || ''
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingSector(null);
    setFormData({
      name: '',
      description: ''
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="sectors-page">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Sector Management</h1>
          <p className="text-text-secondary">Manage predefined sectors for facilities</p>
        </div>
        <Button
          onClick={() => { resetForm(); setDialogOpen(true); }}
          className="bg-primary hover:bg-primary/90 text-white rounded-full px-6"
          data-testid="add-sector-button"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Sector
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sectors.map((sector) => (
          <Card key={sector.id} className="p-6 border border-stone-200 rounded-xl hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1">
                <div className="bg-primary/10 p-2 rounded-lg">
                  <Layers className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-heading font-bold text-text-primary">{sector.name}</h3>
                  {sector.description && (
                    <p className="text-sm text-text-muted mt-1">{sector.description}</p>
                  )}
                </div>
              </div>
              {!sector.id.startsWith('default-') && (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditDialog(sector)}
                    data-testid={`edit-sector-${sector.id}`}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(sector.id)}
                    className="text-red-500 hover:text-red-700"
                    data-testid={`delete-sector-${sector.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSector ? 'Edit Sector' : 'Add New Sector'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Sector Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Manufacturing"
                required
                className="bg-stone-50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of this sector"
                rows={3}
                className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2"
              />
            </div>
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90 text-white">
                {editingSector ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
