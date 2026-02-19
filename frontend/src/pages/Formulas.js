import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { Plus, Trash2, Edit, Calculator, Settings, ArrowRight, Check, X } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Predefined categories and industries for filtering
const CATEGORIES = [
  'Stationary Combustion',
  'Mobile Combustion',
  'Fugitive Emissions',
  'Process Emissions',
  'Purchased Electricity',
  'Purchased Heat/Steam',
  'Other'
];

const INDUSTRIES = [
  'Energy',
  'Manufacturing',
  'Transportation',
  'Commercial',
  'Residential',
  'Agriculture',
  'Waste',
  'Other'
];

// Common unit groups
const UNIT_PRESETS = {
  mass: ['kg', 'g', 't', 'lb', 'ton'],
  volume: ['L', 'mL', 'm³', 'gal', 'ft³'],
  energy: ['MJ', 'kJ', 'GJ', 'TJ', 'kWh', 'MWh', 'BTU'],
  density: ['kg/L', 'kg/m³', 'g/mL', 'lb/gal', 't/m³'],
  emission_factor: ['kg/TJ', 'kg/GJ', 'g/MJ', 't/TJ'],
  calorific: ['TJ/Gg', 'MJ/kg', 'MJ/L', 'GJ/t', 'kJ/kg', 'BTU/lb']
};

export default function Formulas() {
  const [parameters, setParameters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [parameterToDelete, setParameterToDelete] = useState(null);
  const [editingParameter, setEditingParameter] = useState(null);
  const { getAuthHeader } = useAuth();

  const [formData, setFormData] = useState({
    parameter_name: '',
    parameter_key: '',
    description: '',
    standard_unit: '',
    available_units: [],
    unit_conversions: [],
    requires_user_input: true,
    default_value: '',
    is_optional: false,
    display_order: 0,
    applicable_categories: [],
    applicable_industries: []
  });

  const [newUnit, setNewUnit] = useState('');
  const [newConversion, setNewConversion] = useState({ from_unit: '', multiplier: '' });

  useEffect(() => {
    fetchParameters();
  }, []);

  const fetchParameters = async () => {
    try {
      const response = await axios.get(`${API}/super-admin/formula-parameters`, {
        headers: getAuthHeader()
      });
      setParameters(response.data || []);
    } catch (error) {
      console.error('Error fetching parameters:', error);
      setParameters([]);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      parameter_name: '',
      parameter_key: '',
      description: '',
      standard_unit: '',
      available_units: [],
      unit_conversions: [],
      requires_user_input: true,
      default_value: '',
      is_optional: false,
      display_order: 0,
      applicable_categories: [],
      applicable_industries: []
    });
    setEditingParameter(null);
    setNewUnit('');
    setNewConversion({ from_unit: '', multiplier: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.parameter_name || !formData.parameter_key || !formData.standard_unit) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const payload = {
        ...formData,
        default_value: formData.default_value ? parseFloat(formData.default_value) : null,
        display_order: parseInt(formData.display_order) || 0,
        applicable_categories: formData.applicable_categories.length > 0 ? formData.applicable_categories : null,
        applicable_industries: formData.applicable_industries.length > 0 ? formData.applicable_industries : null
      };

      if (editingParameter) {
        await axios.put(
          `${API}/super-admin/formula-parameters/${editingParameter.id}`,
          payload,
          { headers: getAuthHeader() }
        );
        toast.success('Parameter updated successfully');
      } else {
        await axios.post(
          `${API}/super-admin/formula-parameters`,
          payload,
          { headers: getAuthHeader() }
        );
        toast.success('Parameter created successfully');
      }

      setDialogOpen(false);
      resetForm();
      fetchParameters();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const handleEdit = (param) => {
    setEditingParameter(param);
    setFormData({
      parameter_name: param.parameter_name,
      parameter_key: param.parameter_key,
      description: param.description || '',
      standard_unit: param.standard_unit,
      available_units: param.available_units || [],
      unit_conversions: param.unit_conversions || [],
      requires_user_input: param.requires_user_input,
      default_value: param.default_value?.toString() || '',
      is_optional: param.is_optional,
      display_order: param.display_order || 0,
      applicable_categories: param.applicable_categories || [],
      applicable_industries: param.applicable_industries || []
    });
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!parameterToDelete) return;
    
    try {
      await axios.delete(`${API}/super-admin/formula-parameters/${parameterToDelete.id}`, {
        headers: getAuthHeader()
      });
      toast.success('Parameter deleted successfully');
      fetchParameters();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Delete failed');
    } finally {
      setDeleteDialogOpen(false);
      setParameterToDelete(null);
    }
  };

  const addUnit = () => {
    if (newUnit && !formData.available_units.includes(newUnit)) {
      setFormData({
        ...formData,
        available_units: [...formData.available_units, newUnit]
      });
      setNewUnit('');
    }
  };

  const removeUnit = (unit) => {
    setFormData({
      ...formData,
      available_units: formData.available_units.filter(u => u !== unit),
      unit_conversions: formData.unit_conversions.filter(c => c.from_unit !== unit)
    });
  };

  const addConversion = () => {
    if (newConversion.from_unit && newConversion.multiplier) {
      const existingIndex = formData.unit_conversions.findIndex(c => c.from_unit === newConversion.from_unit);
      let updatedConversions;
      
      if (existingIndex >= 0) {
        updatedConversions = [...formData.unit_conversions];
        updatedConversions[existingIndex] = {
          from_unit: newConversion.from_unit,
          to_unit: formData.standard_unit,
          multiplier: parseFloat(newConversion.multiplier)
        };
      } else {
        updatedConversions = [...formData.unit_conversions, {
          from_unit: newConversion.from_unit,
          to_unit: formData.standard_unit,
          multiplier: parseFloat(newConversion.multiplier)
        }];
      }
      
      setFormData({
        ...formData,
        unit_conversions: updatedConversions
      });
      setNewConversion({ from_unit: '', multiplier: '' });
    }
  };

  const removeConversion = (fromUnit) => {
    setFormData({
      ...formData,
      unit_conversions: formData.unit_conversions.filter(c => c.from_unit !== fromUnit)
    });
  };

  const toggleCategory = (cat) => {
    if (formData.applicable_categories.includes(cat)) {
      setFormData({
        ...formData,
        applicable_categories: formData.applicable_categories.filter(c => c !== cat)
      });
    } else {
      setFormData({
        ...formData,
        applicable_categories: [...formData.applicable_categories, cat]
      });
    }
  };

  const toggleIndustry = (ind) => {
    if (formData.applicable_industries.includes(ind)) {
      setFormData({
        ...formData,
        applicable_industries: formData.applicable_industries.filter(i => i !== ind)
      });
    } else {
      setFormData({
        ...formData,
        applicable_industries: [...formData.applicable_industries, ind]
      });
    }
  };

  const addPresetUnits = (preset) => {
    const units = UNIT_PRESETS[preset] || [];
    const newUnits = units.filter(u => !formData.available_units.includes(u));
    setFormData({
      ...formData,
      available_units: [...formData.available_units, ...newUnits]
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Formula Parameters</h1>
          <p className="text-text-secondary">Define parameters, units, and conversions for emission calculations</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-white rounded-full px-6" data-testid="add-parameter-btn">
              <Plus className="w-4 h-4 mr-2" />
              Add Parameter
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-primary" />
                {editingParameter ? 'Edit Parameter' : 'Add New Parameter'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <h3 className="font-medium text-text-primary border-b pb-2">Basic Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="parameter_name">Parameter Name *</Label>
                    <Input
                      id="parameter_name"
                      value={formData.parameter_name}
                      onChange={(e) => setFormData({ ...formData, parameter_name: e.target.value })}
                      required
                      placeholder="e.g., Calorific Value, Density"
                      className="bg-stone-50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="parameter_key">Parameter Key *</Label>
                    <Input
                      id="parameter_key"
                      value={formData.parameter_key}
                      onChange={(e) => setFormData({ ...formData, parameter_key: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                      required
                      placeholder="e.g., calorific_value, density"
                      className="bg-stone-50 font-mono"
                    />
                    <p className="text-xs text-text-muted">Unique identifier (lowercase, underscores)</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={2}
                    placeholder="Brief description of this parameter..."
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              {/* Units Configuration */}
              <div className="space-y-4">
                <h3 className="font-medium text-text-primary border-b pb-2">Units Configuration</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="standard_unit">Standard Unit *</Label>
                    <Input
                      id="standard_unit"
                      value={formData.standard_unit}
                      onChange={(e) => setFormData({ ...formData, standard_unit: e.target.value })}
                      required
                      placeholder="e.g., TJ/Gg, kg/L"
                      className="bg-stone-50"
                    />
                    <p className="text-xs text-text-muted">All values will be converted to this unit</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="display_order">Display Order</Label>
                    <Input
                      id="display_order"
                      type="number"
                      value={formData.display_order}
                      onChange={(e) => setFormData({ ...formData, display_order: e.target.value })}
                      placeholder="0"
                      className="bg-stone-50"
                    />
                  </div>
                </div>

                {/* Quick add preset units */}
                <div className="space-y-2">
                  <Label>Quick Add Unit Presets</Label>
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(UNIT_PRESETS).map(preset => (
                      <Button
                        key={preset}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addPresetUnits(preset)}
                        className="text-xs"
                      >
                        + {preset}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Available Units */}
                <div className="space-y-2">
                  <Label>Available Units</Label>
                  <div className="flex gap-2">
                    <Input
                      value={newUnit}
                      onChange={(e) => setNewUnit(e.target.value)}
                      placeholder="Add unit..."
                      className="bg-stone-50 flex-1"
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addUnit())}
                    />
                    <Button type="button" onClick={addUnit} variant="outline">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.available_units.map(unit => (
                      <span key={unit} className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-full text-sm">
                        {unit}
                        <button type="button" onClick={() => removeUnit(unit)} className="hover:text-red-500">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Unit Conversions */}
                <div className="space-y-2">
                  <Label>Unit Conversions (to {formData.standard_unit || 'standard unit'})</Label>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <select
                        value={newConversion.from_unit}
                        onChange={(e) => setNewConversion({ ...newConversion, from_unit: e.target.value })}
                        className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                      >
                        <option value="">Select unit...</option>
                        {formData.available_units.filter(u => u !== formData.standard_unit).map(unit => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-text-muted">×</span>
                      <Input
                        type="number"
                        step="any"
                        value={newConversion.multiplier}
                        onChange={(e) => setNewConversion({ ...newConversion, multiplier: e.target.value })}
                        placeholder="Multiplier"
                        className="bg-stone-50 w-32"
                      />
                      <span className="text-text-muted">= {formData.standard_unit || '?'}</span>
                    </div>
                    <Button type="button" onClick={addConversion} variant="outline">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="space-y-1 mt-2">
                    {formData.unit_conversions.map(conv => (
                      <div key={conv.from_unit} className="flex items-center justify-between p-2 bg-stone-50 rounded">
                        <span className="text-sm">
                          1 <strong>{conv.from_unit}</strong> × {conv.multiplier} = 1 <strong>{formData.standard_unit}</strong>
                        </span>
                        <button type="button" onClick={() => removeConversion(conv.from_unit)} className="text-red-500 hover:text-red-700">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Input Settings */}
              <div className="space-y-4">
                <h3 className="font-medium text-text-primary border-b pb-2">Input Settings</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <label className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.requires_user_input}
                        onChange={(e) => setFormData({ ...formData, requires_user_input: e.target.checked })}
                        className="w-5 h-5 text-primary"
                      />
                      <div>
                        <p className="font-medium">Requires User Input</p>
                        <p className="text-xs text-text-muted">User must enter this value during calculation</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.is_optional}
                        onChange={(e) => setFormData({ ...formData, is_optional: e.target.checked })}
                        className="w-5 h-5 text-primary"
                      />
                      <div>
                        <p className="font-medium">Optional Parameter</p>
                        <p className="text-xs text-text-muted">Can be skipped in calculation</p>
                      </div>
                    </label>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="default_value">Default/Predefined Value</Label>
                    <Input
                      id="default_value"
                      type="number"
                      step="any"
                      value={formData.default_value}
                      onChange={(e) => setFormData({ ...formData, default_value: e.target.value })}
                      placeholder="Leave empty if no default"
                      className="bg-stone-50"
                      disabled={formData.requires_user_input}
                    />
                    <p className="text-xs text-text-muted">
                      {formData.requires_user_input 
                        ? 'Disable "Requires User Input" to set a predefined value'
                        : 'Value will be auto-filled in calculations'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Applicability */}
              <div className="space-y-4">
                <h3 className="font-medium text-text-primary border-b pb-2">Applicability (Optional)</h3>
                <p className="text-sm text-text-muted">Leave empty to apply to all categories/industries</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Applicable Categories</Label>
                    <div className="flex flex-wrap gap-2 p-3 bg-stone-50 rounded-lg max-h-32 overflow-y-auto">
                      {CATEGORIES.map(cat => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => toggleCategory(cat)}
                          className={`px-2 py-1 rounded text-xs transition-colors ${
                            formData.applicable_categories.includes(cat)
                              ? 'bg-primary text-white'
                              : 'bg-white border border-stone-200 hover:bg-stone-100'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Applicable Industries</Label>
                    <div className="flex flex-wrap gap-2 p-3 bg-stone-50 rounded-lg max-h-32 overflow-y-auto">
                      {INDUSTRIES.map(ind => (
                        <button
                          key={ind}
                          type="button"
                          onClick={() => toggleIndustry(ind)}
                          className={`px-2 py-1 rounded text-xs transition-colors ${
                            formData.applicable_industries.includes(ind)
                              ? 'bg-primary text-white'
                              : 'bg-white border border-stone-200 hover:bg-stone-100'
                          }`}
                        >
                          {ind}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-primary hover:bg-primary/90 text-white">
                  {editingParameter ? 'Update Parameter' : 'Create Parameter'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4 border border-stone-200 rounded-xl bg-gradient-to-br from-primary/5 to-primary/10">
          <div className="flex items-center gap-3">
            <div className="bg-primary/20 p-2 rounded-lg">
              <Calculator className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary">{parameters.length}</p>
              <p className="text-sm text-text-muted">Total Parameters</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border border-stone-200 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-lg">
              <Settings className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary">
                {parameters.filter(p => p.requires_user_input).length}
              </p>
              <p className="text-sm text-text-muted">User Input Required</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border border-stone-200 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 p-2 rounded-lg">
              <Check className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary">
                {parameters.filter(p => !p.requires_user_input).length}
              </p>
              <p className="text-sm text-text-muted">Predefined Values</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border border-stone-200 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="bg-orange-100 p-2 rounded-lg">
              <ArrowRight className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary">
                {parameters.reduce((sum, p) => sum + (p.unit_conversions?.length || 0), 0)}
              </p>
              <p className="text-sm text-text-muted">Unit Conversions</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Parameter List */}
      {parameters.length === 0 ? (
        <Card className="p-12 border border-stone-200 rounded-xl bg-white text-center">
          <Calculator className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <h3 className="text-xl font-medium text-text-primary mb-2">No parameters defined</h3>
          <p className="text-text-muted mb-4">Start by adding formula parameters for emission calculations</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {parameters.sort((a, b) => (a.display_order || 0) - (b.display_order || 0)).map((param) => (
            <Card key={param.id} className="p-4 border border-stone-200 rounded-xl bg-white hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-bold text-text-primary">{param.parameter_name}</h3>
                    <code className="px-2 py-0.5 bg-stone-100 text-text-secondary text-xs rounded font-mono">
                      {param.parameter_key}
                    </code>
                    {param.requires_user_input ? (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">User Input</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">Predefined</span>
                    )}
                    {param.is_optional && (
                      <span className="px-2 py-0.5 bg-stone-100 text-text-muted text-xs rounded">Optional</span>
                    )}
                  </div>
                  {param.description && (
                    <p className="text-sm text-text-muted mb-3">{param.description}</p>
                  )}
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div>
                      <span className="text-text-muted">Standard Unit:</span>{' '}
                      <strong className="text-primary">{param.standard_unit}</strong>
                    </div>
                    <div>
                      <span className="text-text-muted">Available Units:</span>{' '}
                      {param.available_units?.join(', ') || 'None'}
                    </div>
                    {!param.requires_user_input && param.default_value != null && (
                      <div>
                        <span className="text-text-muted">Default Value:</span>{' '}
                        <strong>{param.default_value} {param.standard_unit}</strong>
                      </div>
                    )}
                  </div>
                  {param.unit_conversions?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {param.unit_conversions.map(conv => (
                        <span key={conv.from_unit} className="text-xs bg-stone-50 px-2 py-1 rounded">
                          {conv.from_unit} × {conv.multiplier} → {param.standard_unit}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(param)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-red-500 hover:text-red-700"
                    onClick={() => { setParameterToDelete(param); setDeleteDialogOpen(true); }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Parameter</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{parameterToDelete?.parameter_name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
