import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Plus, Edit, Trash2, Flame } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function EmissionFactors() {
  const [factors, setFactors] = useState([]);
  const [standardFactors, setStandardFactors] = useState({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFactor, setEditingFactor] = useState(null);
  const [loading, setLoading] = useState(true);
  const { getAuthHeader } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    scope: 'scope1',
    category: '',
    sub_category: '',
    factor: '',
    unit: '',
    source: '',
    references: ''
  });

  useEffect(() => {
    fetchFactors();
  }, []);

  const fetchFactors = async () => {
    try {
      const [customRes, standardRes] = await Promise.all([
        axios.get(`${API}/emission-factors`, { headers: getAuthHeader() }),
        axios.get(`${API}/emission-factors/standard`)
      ]);
      setFactors(customRes.data);
      setStandardFactors(standardRes.data);
    } catch (error) {
      console.error('Error fetching emission factors:', error);
      toast.error('Failed to load emission factors');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.source) {
      toast.error('Source is required for custom emission factors');
      return;
    }
    
    try {
      if (editingFactor) {
        await axios.put(
          `${API}/super-admin/emission-factors/${editingFactor.id}`,
          { ...formData, factor: parseFloat(formData.factor), is_custom: true },
          { headers: getAuthHeader() }
        );
        toast.success('Emission factor updated');
      } else {
        await axios.post(
          `${API}/super-admin/emission-factors`,
          { ...formData, factor: parseFloat(formData.factor), is_custom: true },
          { headers: getAuthHeader() }
        );
        toast.success('Emission factor created');
      }
      setDialogOpen(false);
      resetForm();
      fetchFactors();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this emission factor?')) return;
    try {
      await axios.delete(`${API}/super-admin/emission-factors/${id}`, {
        headers: getAuthHeader()
      });
      toast.success('Emission factor deleted');
      fetchFactors();
    } catch (error) {
      toast.error('Delete failed');
    }
  };

  const openEditDialog = (factor) => {
    setEditingFactor(factor);
    setFormData({
      name: factor.name,
      scope: factor.scope,
      category: factor.category,
      sub_category: factor.sub_category,
      factor: factor.factor.toString(),
      unit: factor.unit,
      source: factor.source || '',
      references: factor.references || ''
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingFactor(null);
    setFormData({
      name: '',
      scope: 'scope1',
      category: '',
      sub_category: '',
      factor: '',
      unit: '',
      source: '',
      references: ''
    });
  };

  const renderStandardFactors = () => {
    const allStandard = [];
    Object.entries(standardFactors).forEach(([scope, categories]) => {
      Object.entries(categories).forEach(([category, subcategories]) => {
        Object.entries(subcategories).forEach(([subcat, data]) => {
          allStandard.push({
            scope,
            category,
            sub_category: subcat,
            ...data,
            isStandard: true
          });
        });
      });
    });
    return allStandard;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
  }

  const allFactors = [...factors, ...renderStandardFactors()];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Emission Factors</h1>
          <p className="text-text-secondary">Manage global emission factors</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-white rounded-full px-6">
              <Plus className="w-4 h-4 mr-2" />
              Add Custom Factor
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingFactor ? 'Edit' : 'Add'} Custom Emission Factor</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required className="bg-stone-50" />
                </div>
                <div className="space-y-2">
                  <Label>Scope *</Label>
                  <select value={formData.scope} onChange={(e) => setFormData({ ...formData, scope: e.target.value })} className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3" required>
                    <option value="scope1">Scope 1</option>
                    <option value="scope2">Scope 2</option>
                    <option value="biogenic">Biogenic</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Input value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} required className="bg-stone-50" />
                </div>
                <div className="space-y-2">
                  <Label>Sub-category *</Label>
                  <Input value={formData.sub_category} onChange={(e) => setFormData({ ...formData, sub_category: e.target.value })} required className="bg-stone-50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Factor *</Label>
                  <Input type="number" step="0.0001" value={formData.factor} onChange={(e) => setFormData({ ...formData, factor: e.target.value })} required className="bg-stone-50" />
                </div>
                <div className="space-y-2">
                  <Label>Unit *</Label>
                  <Input value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} required placeholder="kg CO2e/unit" className="bg-stone-50" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Source * (Required for custom factors)</Label>
                <Input value={formData.source} onChange={(e) => setFormData({ ...formData, source: e.target.value })} required placeholder="e.g., GHG Protocol, IPCC, Company study" className="bg-stone-50" />
              </div>
              <div className="space-y-2">
                <Label>References</Label>
                <textarea value={formData.references} onChange={(e) => setFormData({ ...formData, references: e.target.value })} rows={2} className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2" placeholder="Links or detailed references" />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" className="bg-primary hover:bg-primary/90 text-white">{editingFactor ? 'Update' : 'Create'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-heading font-bold text-text-primary">Custom Emission Factors</h3>
        {factors.map((factor) => (
          <Card key={factor.id} className="p-6 border border-stone-200 rounded-xl bg-white hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="bg-accent/10 p-2 rounded-lg"><Flame className="w-5 h-5 text-accent" /></div>
                  <h3 className="text-lg font-heading font-bold text-text-primary">{factor.name}</h3>
                  <span className="px-3 py-1 bg-accent/10 text-accent text-xs font-medium rounded-full">Custom</span>
                  <span className="px-3 py-1 bg-secondary/10 text-secondary text-xs font-medium rounded-full capitalize">{factor.scope}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
                  <div><p className="text-xs text-text-muted mb-1">Category</p><p className="text-sm font-medium text-text-primary">{factor.category}</p></div>
                  <div><p className="text-xs text-text-muted mb-1">Sub-category</p><p className="text-sm font-medium text-text-primary">{factor.sub_category}</p></div>
                  <div><p className="text-xs text-text-muted mb-1">Factor</p><p className="text-sm font-medium text-text-primary">{factor.factor}</p></div>
                  <div><p className="text-xs text-text-muted mb-1">Unit</p><p className="text-sm font-medium text-text-primary">{factor.unit}</p></div>
                  <div><p className="text-xs text-text-muted mb-1">Source</p><p className="text-sm font-medium text-text-primary">{factor.source || 'N/A'}</p></div>
                </div>
                {factor.references && (
                  <div className="mt-3">
                    <p className="text-xs text-text-muted mb-1">References:</p>
                    <p className="text-sm text-text-secondary">{factor.references}</p>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => openEditDialog(factor)}><Edit className="w-4 h-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => handleDelete(factor.id)} className="text-accent"><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          </Card>
        ))}
        {factors.length === 0 && (
          <div className="text-center py-8 bg-stone-50 rounded-lg">
            <p className="text-text-muted">No custom emission factors yet. Standard factors are shown below.</p>
          </div>
        )}
      </div>

      <div className="space-y-4 pt-6 border-t border-stone-200">
        <h3 className="text-lg font-heading font-bold text-text-primary">Standard Emission Factors (GHG Protocol)</h3>
        {renderStandardFactors().map((factor, idx) => (
          <Card key={idx} className="p-6 border border-stone-200 rounded-xl bg-white">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="bg-primary/10 p-2 rounded-lg"><Flame className="w-5 h-5 text-primary" /></div>
                  <h3 className="text-lg font-heading font-bold text-text-primary capitalize">{factor.sub_category.replace('_', ' ')}</h3>
                  <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full">Standard</span>
                  <span className="px-3 py-1 bg-secondary/10 text-secondary text-xs font-medium rounded-full capitalize">{factor.scope}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
                  <div><p className="text-xs text-text-muted mb-1">Category</p><p className="text-sm font-medium text-text-primary capitalize">{factor.category.replace('_', ' ')}</p></div>
                  <div><p className="text-xs text-text-muted mb-1">Sub-category</p><p className="text-sm font-medium text-text-primary capitalize">{factor.sub_category.replace('_', ' ')}</p></div>
                  <div><p className="text-xs text-text-muted mb-1">Factor</p><p className="text-sm font-medium text-text-primary">{factor.factor}</p></div>
                  <div><p className="text-xs text-text-muted mb-1">Unit</p><p className="text-sm font-medium text-text-primary">{factor.unit}</p></div>
                  <div><p className="text-xs text-text-muted mb-1">Source</p><p className="text-sm font-medium text-text-primary">{factor.source}</p></div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}