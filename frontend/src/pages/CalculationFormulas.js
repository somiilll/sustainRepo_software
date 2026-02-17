import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Plus, Edit, Trash2, Calculator, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const SCOPES = [
  { value: 'scope1', label: 'Scope 1 (Direct Emissions)' },
  { value: 'scope2', label: 'Scope 2 (Indirect Emissions)' },
  { value: 'biogenic', label: 'Biogenic Emissions' }
];

const OUTPUT_UNITS = [
  'kg CO2e',
  'tonnes CO2e',
  'kg CO2e/kWh',
  'kg CO2e/kg',
  'kg CO2e/liter',
  'kg CO2e/m³'
];

const INPUT_FIELD_TYPES = [
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Dropdown Select' }
];

const DEFAULT_CONVERSION_RULES = [
  { unit: 'liters', multiplier: 1, formula: 'quantity * emission_factor', description: 'Direct calculation for liters' },
  { unit: 'kiloliters', multiplier: 1000, formula: 'quantity * 1000 * emission_factor', description: 'Convert kiloliters to liters' },
  { unit: 'cubic_meters', multiplier: null, formula: 'quantity * conversion_factor * emission_factor', description: 'Requires conversion factor for cubic meters' }
];

export default function CalculationFormulas() {
  const [formulas, setFormulas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFormula, setEditingFormula] = useState(null);
  const [expandedFormula, setExpandedFormula] = useState(null);
  const { getAuthHeader } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    scope: 'scope1',
    description: '',
    formula_expression: 'quantity * emission_factor',
    input_fields: [
      { name: 'quantity', label: 'Quantity', type: 'number', unit: '', required: true },
      { name: 'unit', label: 'Unit', type: 'select', options: ['kg', 'liter', 'm³', 'kWh'], required: true },
      { name: 'emission_factor', label: 'Emission Factor', type: 'number', unit: 'kg CO2e/unit', required: true }
    ],
    output_unit: 'kg CO2e',
    is_active: true,
    conversion_rules: []
  });

  useEffect(() => {
    fetchFormulas();
  }, []);

  const fetchFormulas = async () => {
    try {
      const response = await axios.get(`${API}/calculation-formulas?active_only=false`, {
        headers: getAuthHeader()
      });
      setFormulas(response.data);
    } catch (error) {
      console.error('Formulas fetch error:', error);
      toast.error('Failed to fetch formulas');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('Formula name is required');
      return;
    }
    
    try {
      if (editingFormula) {
        await axios.put(`${API}/calculation-formulas/${editingFormula.id}`, formData, {
          headers: getAuthHeader()
        });
        toast.success('Formula updated successfully');
      } else {
        await axios.post(`${API}/calculation-formulas`, formData, {
          headers: getAuthHeader()
        });
        toast.success('Formula created successfully');
      }
      setDialogOpen(false);
      resetForm();
      fetchFormulas();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this formula?')) return;
    
    try {
      await axios.delete(`${API}/calculation-formulas/${id}`, {
        headers: getAuthHeader()
      });
      toast.success('Formula deleted successfully');
      fetchFormulas();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Delete failed');
    }
  };

  const openEditDialog = (formula) => {
    setEditingFormula(formula);
    setFormData({
      name: formula.name,
      scope: formula.scope,
      description: formula.description || '',
      formula_expression: formula.formula_expression,
      input_fields: formula.input_fields || [],
      output_unit: formula.output_unit,
      is_active: formula.is_active,
      conversion_rules: formula.conversion_rules || []
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingFormula(null);
    setFormData({
      name: '',
      scope: 'scope1',
      description: '',
      formula_expression: 'quantity * emission_factor',
      input_fields: [
        { name: 'quantity', label: 'Quantity', type: 'number', unit: '', required: true },
        { name: 'unit', label: 'Unit', type: 'select', options: ['kg', 'liter', 'm³', 'kWh'], required: true },
        { name: 'emission_factor', label: 'Emission Factor', type: 'number', unit: 'kg CO2e/unit', required: true }
      ],
      output_unit: 'kg CO2e',
      is_active: true,
      conversion_rules: []
    });
  };

  const addInputField = () => {
    setFormData({
      ...formData,
      input_fields: [
        ...formData.input_fields,
        { name: '', label: '', type: 'number', unit: '', required: true }
      ]
    });
  };

  const updateInputField = (index, field, value) => {
    const newFields = [...formData.input_fields];
    newFields[index] = { ...newFields[index], [field]: value };
    setFormData({ ...formData, input_fields: newFields });
  };

  const removeInputField = (index) => {
    const newFields = formData.input_fields.filter((_, i) => i !== index);
    setFormData({ ...formData, input_fields: newFields });
  };

  const addConversionRule = () => {
    setFormData({
      ...formData,
      conversion_rules: [
        ...formData.conversion_rules,
        { unit: '', multiplier: 1, formula: 'quantity * emission_factor', description: '' }
      ]
    });
  };

  const updateConversionRule = (index, field, value) => {
    const newRules = [...formData.conversion_rules];
    newRules[index] = { ...newRules[index], [field]: value };
    setFormData({ ...formData, conversion_rules: newRules });
  };

  const removeConversionRule = (index) => {
    const newRules = formData.conversion_rules.filter((_, i) => i !== index);
    setFormData({ ...formData, conversion_rules: newRules });
  };

  const applyDefaultConversionRules = () => {
    setFormData({
      ...formData,
      conversion_rules: [...DEFAULT_CONVERSION_RULES]
    });
  };

  const getScopeLabel = (scope) => {
    const found = SCOPES.find(s => s.value === scope);
    return found ? found.label : scope;
  };

  const getScopeBadgeColor = (scope) => {
    switch (scope) {
      case 'scope1': return 'bg-orange-100 text-orange-700';
      case 'scope2': return 'bg-blue-100 text-blue-700';
      case 'biogenic': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="calculation-formulas-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-text-primary">Calculation Formulas</h1>
          <p className="text-text-muted mt-1">Manage emission calculation formulas for Scope 1, 2, and Biogenic</p>
        </div>
        <Button 
          onClick={() => { resetForm(); setDialogOpen(true); }}
          className="bg-primary hover:bg-primary/90 text-white rounded-full"
          data-testid="add-formula-btn"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Formula
        </Button>
      </div>

      {formulas.length === 0 ? (
        <Card className="p-12 text-center border border-stone-200">
          <Calculator className="w-12 h-12 text-stone-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">No Formulas Yet</h3>
          <p className="text-text-muted mb-4">Create your first calculation formula to get started.</p>
          <Button 
            onClick={() => { resetForm(); setDialogOpen(true); }}
            className="bg-primary hover:bg-primary/90 text-white rounded-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Formula
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {formulas.map((formula) => (
            <Card 
              key={formula.id} 
              className={`border ${formula.is_active ? 'border-stone-200' : 'border-stone-300 bg-stone-50 opacity-75'}`}
              data-testid={`formula-card-${formula.id}`}
            >
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="bg-primary/10 p-2 rounded-lg">
                      <Calculator className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-text-primary">{formula.name}</h3>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getScopeBadgeColor(formula.scope)}`}>
                          {getScopeLabel(formula.scope)}
                        </span>
                        {!formula.is_active && (
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">
                            Inactive
                          </span>
                        )}
                      </div>
                      {formula.description && (
                        <p className="text-sm text-text-muted mt-1">{formula.description}</p>
                      )}
                      <p className="text-sm text-primary font-mono mt-2 bg-stone-50 px-2 py-1 rounded inline-block">
                        {formula.formula_expression} → {formula.output_unit}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => setExpandedFormula(expandedFormula === formula.id ? null : formula.id)}
                    >
                      {expandedFormula === formula.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEditDialog(formula)} data-testid={`edit-formula-${formula.id}`}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(formula.id)} className="text-red-500" data-testid={`delete-formula-${formula.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                
                {expandedFormula === formula.id && (
                  <div className="mt-4 pt-4 border-t border-stone-200">
                    <h4 className="text-sm font-medium text-text-primary mb-2">Input Fields:</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {formula.input_fields?.map((field, idx) => (
                        <div key={idx} className="bg-stone-50 p-3 rounded-lg">
                          <p className="font-medium text-sm">{field.label}</p>
                          <p className="text-xs text-text-muted">
                            Field: {field.name} • Type: {field.type}
                            {field.unit && ` • Unit: ${field.unit}`}
                            {field.required && ' • Required'}
                          </p>
                          {field.options && (
                            <p className="text-xs text-text-muted mt-1">
                              Options: {field.options.join(', ')}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingFormula ? 'Edit Formula' : 'Add New Formula'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4" data-testid="formula-form">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Formula Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Fuel Combustion"
                  required
                  className="bg-stone-50"
                  data-testid="formula-name-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scope">Scope *</Label>
                <select
                  id="scope"
                  value={formData.scope}
                  onChange={(e) => setFormData({ ...formData, scope: e.target.value })}
                  className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                  data-testid="formula-scope-select"
                >
                  {SCOPES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of the formula"
                className="bg-stone-50"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="formula_expression">Formula Expression *</Label>
                <Input
                  id="formula_expression"
                  value={formData.formula_expression}
                  onChange={(e) => setFormData({ ...formData, formula_expression: e.target.value })}
                  placeholder="e.g., quantity * emission_factor"
                  required
                  className="bg-stone-50 font-mono"
                  data-testid="formula-expression-input"
                />
                <p className="text-xs text-text-muted">Use field names like: quantity, emission_factor, calorific_value</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="output_unit">Output Unit *</Label>
                <select
                  id="output_unit"
                  value={formData.output_unit}
                  onChange={(e) => setFormData({ ...formData, output_unit: e.target.value })}
                  className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                  data-testid="formula-output-unit-select"
                >
                  {OUTPUT_UNITS.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Input Fields</Label>
                <Button type="button" size="sm" variant="outline" onClick={addInputField}>
                  <Plus className="w-3 h-3 mr-1" /> Add Field
                </Button>
              </div>
              <div className="space-y-3">
                {formData.input_fields.map((field, idx) => (
                  <div key={idx} className="p-3 bg-stone-50 rounded-lg border border-stone-200">
                    <div className="grid grid-cols-4 gap-3 items-end">
                      <div className="space-y-1">
                        <Label className="text-xs">Field Name</Label>
                        <Input
                          value={field.name}
                          onChange={(e) => updateInputField(idx, 'name', e.target.value)}
                          placeholder="quantity"
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Label</Label>
                        <Input
                          value={field.label}
                          onChange={(e) => updateInputField(idx, 'label', e.target.value)}
                          placeholder="Quantity"
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Type</Label>
                        <select
                          value={field.type}
                          onChange={(e) => updateInputField(idx, 'type', e.target.value)}
                          className="w-full h-9 bg-white border border-stone-200 rounded-lg px-2 text-sm"
                        >
                          {INPUT_FIELD_TYPES.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs">Unit</Label>
                          <Input
                            value={field.unit || ''}
                            onChange={(e) => updateInputField(idx, 'unit', e.target.value)}
                            placeholder="kg"
                            className="text-sm"
                          />
                        </div>
                        <Button 
                          type="button" 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => removeInputField(idx)}
                          className="text-red-500 mt-5"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    {field.type === 'select' && (
                      <div className="mt-2 space-y-1">
                        <Label className="text-xs">Options (comma-separated)</Label>
                        <Input
                          value={field.options?.join(', ') || ''}
                          onChange={(e) => updateInputField(idx, 'options', e.target.value.split(',').map(o => o.trim()).filter(o => o))}
                          placeholder="kg, liter, m³"
                          className="text-sm"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="rounded border-stone-300"
              />
              <Label htmlFor="is_active" className="cursor-pointer">Active (formula can be used in calculations)</Label>
            </div>

            {/* Conversion Rules Section */}
            <div className="space-y-2 border-t border-stone-200 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-semibold">Unit Conversion Rules</Label>
                  <p className="text-xs text-text-muted mt-1">Define different calculation formulas based on input units</p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={applyDefaultConversionRules}>
                    Apply Defaults
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={addConversionRule}>
                    <Plus className="w-3 h-3 mr-1" /> Add Rule
                  </Button>
                </div>
              </div>
              <div className="space-y-3">
                {formData.conversion_rules.map((rule, idx) => (
                  <div key={idx} className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="grid grid-cols-4 gap-3 items-end">
                      <div className="space-y-1">
                        <Label className="text-xs">When Unit Is</Label>
                        <Input
                          value={rule.unit}
                          onChange={(e) => updateConversionRule(idx, 'unit', e.target.value)}
                          placeholder="e.g., liters"
                          className="text-sm bg-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Multiplier</Label>
                        <Input
                          type="number"
                          value={rule.multiplier || ''}
                          onChange={(e) => updateConversionRule(idx, 'multiplier', e.target.value ? parseFloat(e.target.value) : null)}
                          placeholder="e.g., 1000"
                          className="text-sm bg-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Formula Expression</Label>
                        <Input
                          value={rule.formula}
                          onChange={(e) => updateConversionRule(idx, 'formula', e.target.value)}
                          placeholder="quantity * emission_factor"
                          className="text-sm font-mono bg-white"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          type="button" 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => removeConversionRule(idx)}
                          className="text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2">
                      <Input
                        value={rule.description || ''}
                        onChange={(e) => updateConversionRule(idx, 'description', e.target.value)}
                        placeholder="Description (e.g., Convert kiloliters to liters)"
                        className="text-sm bg-white"
                      />
                    </div>
                  </div>
                ))}
                {formData.conversion_rules.length === 0 && (
                  <p className="text-sm text-text-muted text-center py-4 bg-stone-50 rounded-lg">
                    No conversion rules defined. Click "Apply Defaults" or "Add Rule" to add unit-specific calculation logic.
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90 text-white" data-testid="save-formula-btn">
                {editingFormula ? 'Update Formula' : 'Create Formula'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
