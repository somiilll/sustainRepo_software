import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Plus, Edit, Trash2, Activity } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Emissions() {
  const [emissions, setEmissions] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [standardFactors, setStandardFactors] = useState({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeScope, setActiveScope] = useState('scope1');
  const { getAuthHeader } = useAuth();

  const [formData, setFormData] = useState({
    facility_id: '',
    reporting_period: '',
    scope: 'scope1',
    category: '',
    sub_category: '',
    fuel_type: '',
    quantity: '',
    emission_factor: '',
    unit: '',
    source_of_information: '',
    notes: '',
    is_custom_factor: false
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [emissionsRes, facilitiesRes, factorsRes] = await Promise.all([
        axios.get(`${API}/emissions`, { headers: getAuthHeader() }),
        axios.get(`${API}/facilities`, { headers: getAuthHeader() }),
        axios.get(`${API}/emission-factors/standard`)
      ]);
      setEmissions(emissionsRes.data);
      setFacilities(facilitiesRes.data);
      setStandardFactors(factorsRes.data);
    } catch (error) {
      toast.error('Failed to load data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryChange = (category, subcategory) => {
    const factor = standardFactors[formData.scope]?.[category]?.[subcategory];
    if (factor) {
      setFormData(prev => ({
        ...prev,
        category,
        sub_category: subcategory,
        emission_factor: factor.factor,
        unit: factor.unit,
        is_custom_factor: false
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/emissions`, {
        ...formData,
        quantity: parseFloat(formData.quantity),
        emission_factor: parseFloat(formData.emission_factor)
      }, {
        headers: getAuthHeader()
      });
      toast.success('Emission record created successfully');
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this emission record?')) return;
    
    try {
      await axios.delete(`${API}/emissions/${id}`, {
        headers: getAuthHeader()
      });
      toast.success('Emission record deleted successfully');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Delete failed');
    }
  };

  const resetForm = () => {
    setFormData({
      facility_id: '',
      reporting_period: '',
      scope: activeScope,
      category: '',
      sub_category: '',
      fuel_type: '',
      quantity: '',
      emission_factor: '',
      unit: '',
      source_of_information: '',
      notes: '',
      is_custom_factor: false
    });
  };

  const handleDialogChange = (open) => {
    setDialogOpen(open);
    if (!open) resetForm();
  };

  const scope1Categories = standardFactors.scope1 || {};
  const scope2Categories = standardFactors.scope2 || {};
  const biogenicCategories = standardFactors.biogenic || {};

  const filteredEmissions = emissions.filter(e => e.scope === activeScope);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="emissions-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Emissions</h1>
          <p className="text-text-secondary">Track and manage GHG emissions</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-white rounded-full px-6 transition-all active:scale-95" data-testid="add-emission-button">
              <Plus className="w-4 h-4 mr-2" />
              Add Emission
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Emission Record</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4" data-testid="emission-form">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="facility">Facility *</Label>
                  <select
                    id="facility"
                    value={formData.facility_id}
                    onChange={(e) => setFormData({ ...formData, facility_id: e.target.value })}
                    required
                    className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="emission-facility-select"
                  >
                    <option value="">Select Facility</option>
                    {facilities.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reporting_period">Reporting Period *</Label>
                  <Input
                    id="reporting_period"
                    type="month"
                    value={formData.reporting_period}
                    onChange={(e) => setFormData({ ...formData, reporting_period: e.target.value })}
                    required
                    data-testid="emission-period-input"
                    className="bg-stone-50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Scope *</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      value="scope1"
                      checked={formData.scope === 'scope1'}
                      onChange={(e) => setFormData({ ...formData, scope: e.target.value, category: '', sub_category: '' })}
                      className="text-primary"
                    />
                    Scope 1
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      value="scope2"
                      checked={formData.scope === 'scope2'}
                      onChange={(e) => setFormData({ ...formData, scope: e.target.value, category: '', sub_category: '' })}
                      className="text-primary"
                    />
                    Scope 2
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      value="biogenic"
                      checked={formData.scope === 'biogenic'}
                      onChange={(e) => setFormData({ ...formData, scope: e.target.value, category: '', sub_category: '' })}
                      className="text-primary"
                    />
                    Biogenic
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
                  <select
                    id="category"
                    value={formData.category}
                    onChange={(e) => {
                      setFormData({ ...formData, category: e.target.value, sub_category: '' });
                    }}
                    required
                    className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="emission-category-select"
                  >
                    <option value="">Select Category</option>
                    {Object.keys(formData.scope === 'scope1' ? scope1Categories : scope2Categories).map(cat => (
                      <option key={cat} value={cat}>{cat.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sub_category">Sub-category *</Label>
                  <select
                    id="sub_category"
                    value={formData.sub_category}
                    onChange={(e) => handleCategoryChange(formData.category, e.target.value)}
                    required
                    disabled={!formData.category}
                    className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                    data-testid="emission-subcategory-select"
                  >
                    <option value="">Select Sub-category</option>
                    {formData.category && Object.keys((formData.scope === 'scope1' ? scope1Categories : scope2Categories)[formData.category] || {}).map(sub => (
                      <option key={sub} value={sub}>{sub.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="0.01"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    required
                    data-testid="emission-quantity-input"
                    className="bg-stone-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emission_factor">Emission Factor *</Label>
                  <Input
                    id="emission_factor"
                    type="number"
                    step="0.0001"
                    value={formData.emission_factor}
                    onChange={(e) => setFormData({ ...formData, emission_factor: e.target.value, is_custom_factor: true })}
                    required
                    data-testid="emission-factor-input"
                    className="bg-stone-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit">Unit</Label>
                  <Input
                    id="unit"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    placeholder="kg CO2e/unit"
                    data-testid="emission-unit-input"
                    className="bg-stone-50"
                  />
                </div>
              </div>

              {formData.quantity && formData.emission_factor && (
                <div className="p-4 bg-secondary/10 rounded-lg">
                  <p className="text-sm font-medium text-text-secondary mb-1">Calculated Emissions:</p>
                  <p className="text-2xl font-heading font-bold text-primary">
                    {(parseFloat(formData.quantity) * parseFloat(formData.emission_factor)).toFixed(2)} kg CO₂e
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="source">Source of Information</Label>
                <Input
                  id="source"
                  value={formData.source_of_information}
                  onChange={(e) => setFormData({ ...formData, source_of_information: e.target.value })}
                  data-testid="emission-source-input"
                  className="bg-stone-50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="emission-notes-input"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => handleDialogChange(false)} data-testid="cancel-button">
                  Cancel
                </Button>
                <Button type="submit" className="bg-primary hover:bg-primary/90 text-white" data-testid="submit-emission-button">
                  Add Emission
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeScope} onValueChange={setActiveScope} className="w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="scope1" data-testid="scope1-tab">Scope 1</TabsTrigger>
          <TabsTrigger value="scope2" data-testid="scope2-tab">Scope 2</TabsTrigger>
          <TabsTrigger value="biogenic" data-testid="biogenic-tab">Biogenic</TabsTrigger>
        </TabsList>

        <TabsContent value={activeScope} className="mt-6">
          <div className="space-y-4">
            {filteredEmissions.map((emission) => {
              const facility = facilities.find(f => f.id === emission.facility_id);
              return (
                <Card key={emission.id} className="p-6 border border-stone-200 rounded-xl bg-white hover:shadow-lg transition-shadow" data-testid={`emission-card-${emission.id}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="bg-primary/10 p-2 rounded-lg">
                          <Activity className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-lg font-heading font-bold text-text-primary">{facility?.name || 'Unknown Facility'}</h3>
                          <p className="text-sm text-text-muted">{emission.reporting_period}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                        <div>
                          <p className="text-xs text-text-muted mb-1">Category</p>
                          <p className="text-sm font-medium text-text-primary">{emission.category}</p>
                        </div>
                        <div>
                          <p className="text-xs text-text-muted mb-1">Sub-category</p>
                          <p className="text-sm font-medium text-text-primary">{emission.sub_category}</p>
                        </div>
                        <div>
                          <p className="text-xs text-text-muted mb-1">Quantity</p>
                          <p className="text-sm font-medium text-text-primary">{emission.quantity}</p>
                        </div>
                        <div>
                          <p className="text-xs text-text-muted mb-1">Total Emissions</p>
                          <p className="text-lg font-heading font-bold text-primary">{emission.total_emissions.toFixed(2)} kg CO₂e</p>
                        </div>
                      </div>
                      {emission.is_custom_factor && (
                        <div className="mt-3">
                          <span className="inline-block px-3 py-1 bg-accent/10 text-accent text-xs font-medium rounded-full">
                            Custom Factor
                          </span>
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(emission.id)}
                      className="text-accent hover:text-accent"
                      data-testid={`delete-emission-${emission.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              );
            })}

            {filteredEmissions.length === 0 && (
              <div className="text-center py-12">
                <Activity className="w-16 h-16 mx-auto text-text-muted mb-4" />
                <h3 className="text-xl font-heading font-bold text-text-primary mb-2">No {activeScope.toUpperCase().replace('SCOPE', 'Scope ')} emissions yet</h3>
                <p className="text-text-secondary mb-4">Get started by adding your first emission record</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}