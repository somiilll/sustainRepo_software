import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { Plus, Trash2, Edit, Calculator, Settings, ArrowRight, Check, X, Grip, Play, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Predefined categories and industries
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

// Operation symbols for formula expression
const OPERATION_SYMBOLS = {
  multiply: '×',
  divide: '÷',
  add: '+',
  subtract: '−'
};

export default function Formulas() {
  const [activeTab, setActiveTab] = useState('formulas');
  const [parameters, setParameters] = useState([]);
  const [formulas, setFormulas] = useState([]);
  const [units, setUnits] = useState([]); // Centralized units from Unit Management
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formulaDialogOpen, setFormulaDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [deleteType, setDeleteType] = useState(''); // 'parameter' or 'formula'
  const [editingParameter, setEditingParameter] = useState(null);
  const [editingFormula, setEditingFormula] = useState(null);
  const { getAuthHeader } = useAuth();

  // Parameter form data - "is_user_input" determines if value comes from user or is predefined
  const [paramFormData, setParamFormData] = useState({
    parameter_name: '',
    parameter_key: '',
    description: '',
    unit_conversions: [],
    is_user_input: true,  // true = user provides value, false = predefined value (from fuel DB)
    predefined_source: '', // Where predefined value comes from (e.g., "fuel_database.calorific_value")
    is_optional: false,
    display_order: 0,
    applicable_categories: [],
    applicable_industries: []
  });

  // Formula form data
  const [formulaFormData, setFormulaFormData] = useState({
    formula_name: '',
    formula_key: '',
    description: '',
    output_name: '',
    output_unit: '',
    components: [],  // Each component can have: {parameter_key, parameter_name, operation, condition}
    formula_expression: '',
    applies_gwp: false,
    gwp_gas: '',
    applicable_categories: [],
    applicable_industries: [],
    is_active: true,
    display_order: 0,
    mass_units: ['kg', 'g', 'tonne', 'lb'],  // Units classified as mass
    volume_units: ['L', 'mL', 'kL', 'm3', 'gal', 'ft3']  // Units classified as volume
  });

  const [newUnit, setNewUnit] = useState('');
  const [newConversion, setNewConversion] = useState({ from_unit: '', multiplier: '', to_unit: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [paramsRes, formulasRes, unitsRes] = await Promise.all([
        axios.get(`${API}/super-admin/formula-parameters`, { headers: getAuthHeader() }),
        axios.get(`${API}/super-admin/formula-definitions`, { headers: getAuthHeader() }),
        axios.get(`${API}/units`, { headers: getAuthHeader() })
      ]);
      setParameters(paramsRes.data || []);
      setFormulas(formulasRes.data || []);
      setUnits(unitsRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      setParameters([]);
      setFormulas([]);
      setUnits([]);
    } finally {
      setLoading(false);
    }
  };

  const resetParamForm = () => {
    setParamFormData({
      parameter_name: '',
      parameter_key: '',
      description: '',
      unit_conversions: [],
      is_user_input: true,
      predefined_source: '',
      is_optional: false,
      display_order: 0,
      applicable_categories: [],
      applicable_industries: []
    });
    setEditingParameter(null);
    setNewUnit('');
    setNewConversion({ from_unit: '', multiplier: '' });
  };

  const resetFormulaForm = () => {
    setFormulaFormData({
      formula_name: '',
      formula_key: '',
      description: '',
      output_name: '',
      output_unit: '',
      components: [],
      formula_expression: '',
      applies_gwp: false,
      gwp_gas: '',
      applicable_categories: [],
      applicable_industries: [],
      is_active: true,
      display_order: 0
    });
    setEditingFormula(null);
  };

  // Parameter handlers
  const handleParamSubmit = async (e) => {
    e.preventDefault();
    
    if (!paramFormData.parameter_name || !paramFormData.parameter_key) {
      toast.error('Please fill in parameter name and key');
      return;
    }

    // Validate predefined source if not user input
    if (!paramFormData.is_user_input && !paramFormData.predefined_source) {
      toast.error('Please select a predefined value source');
      return;
    }

    try {
      const payload = {
        ...paramFormData,
        requires_user_input: paramFormData.is_user_input, // Map to backend field
        display_order: parseInt(paramFormData.display_order) || 0,
        applicable_categories: paramFormData.applicable_categories.length > 0 ? paramFormData.applicable_categories : null,
        applicable_industries: paramFormData.applicable_industries.length > 0 ? paramFormData.applicable_industries : null
      };

      if (editingParameter) {
        await axios.put(`${API}/super-admin/formula-parameters/${editingParameter.id}`, payload, { headers: getAuthHeader() });
        toast.success('Parameter updated successfully');
      } else {
        await axios.post(`${API}/super-admin/formula-parameters`, payload, { headers: getAuthHeader() });
        toast.success('Parameter created successfully');
      }

      setDialogOpen(false);
      resetParamForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const handleEditParam = (param) => {
    setEditingParameter(param);
    setParamFormData({
      parameter_name: param.parameter_name,
      parameter_key: param.parameter_key,
      description: param.description || '',
      unit_conversions: param.unit_conversions || [],
      is_user_input: param.requires_user_input !== false, // Map from backend field
      predefined_source: param.predefined_source || '',
      is_optional: param.is_optional || false,
      display_order: param.display_order || 0,
      applicable_categories: param.applicable_categories || [],
      applicable_industries: param.applicable_industries || []
    });
    setDialogOpen(true);
  };

  // Formula handlers
  const handleFormulaSubmit = async (e) => {
    e.preventDefault();
    
    if (!formulaFormData.formula_name || !formulaFormData.formula_key || !formulaFormData.output_name) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (formulaFormData.components.length === 0) {
      toast.error('Please add at least one component to the formula');
      return;
    }

    try {
      const payload = {
        ...formulaFormData,
        display_order: parseInt(formulaFormData.display_order) || 0,
        applicable_categories: formulaFormData.applicable_categories.length > 0 ? formulaFormData.applicable_categories : null,
        applicable_industries: formulaFormData.applicable_industries.length > 0 ? formulaFormData.applicable_industries : null
      };

      if (editingFormula) {
        await axios.put(`${API}/super-admin/formula-definitions/${editingFormula.id}`, payload, { headers: getAuthHeader() });
        toast.success('Formula updated successfully');
      } else {
        await axios.post(`${API}/super-admin/formula-definitions`, payload, { headers: getAuthHeader() });
        toast.success('Formula created successfully');
      }

      setFormulaDialogOpen(false);
      resetFormulaForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const handleEditFormula = (formula) => {
    setEditingFormula(formula);
    setFormulaFormData({
      formula_name: formula.formula_name,
      formula_key: formula.formula_key,
      description: formula.description || '',
      output_name: formula.output_name,
      output_unit: formula.output_unit,
      components: formula.components || [],
      formula_expression: formula.formula_expression || '',
      applies_gwp: formula.applies_gwp || false,
      gwp_gas: formula.gwp_gas || '',
      applicable_categories: formula.applicable_categories || [],
      applicable_industries: formula.applicable_industries || [],
      is_active: formula.is_active !== false,
      display_order: formula.display_order || 0
    });
    setFormulaDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    
    try {
      if (deleteType === 'parameter') {
        await axios.delete(`${API}/super-admin/formula-parameters/${itemToDelete.id}`, { headers: getAuthHeader() });
        toast.success('Parameter deleted successfully');
      } else {
        await axios.delete(`${API}/super-admin/formula-definitions/${itemToDelete.id}`, { headers: getAuthHeader() });
        toast.success('Formula deleted successfully');
      }
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Delete failed');
    } finally {
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      setDeleteType('');
    }
  };

  // Unit helpers
  const addUnit = () => {
    if (newUnit && !paramFormData.available_units.includes(newUnit)) {
      setParamFormData({
        ...paramFormData,
        available_units: [...paramFormData.available_units, newUnit]
      });
      setNewUnit('');
    }
  };

  const removeUnit = (unit) => {
    setParamFormData({
      ...paramFormData,
      available_units: paramFormData.available_units.filter(u => u !== unit),
      unit_conversions: paramFormData.unit_conversions.filter(c => c.from_unit !== unit)
    });
  };

  const addConversion = () => {
    if (newConversion.from_unit && newConversion.multiplier && newConversion.to_unit) {
      const newConv = {
        from_unit: newConversion.from_unit,
        to_unit: newConversion.to_unit,
        multiplier: parseFloat(newConversion.multiplier)
      };
      
      // Check if this conversion already exists
      const existingIndex = paramFormData.unit_conversions.findIndex(
        c => c.from_unit === newConversion.from_unit && c.to_unit === newConversion.to_unit
      );
      
      let updatedConversions;
      if (existingIndex >= 0) {
        // Update existing
        updatedConversions = [...paramFormData.unit_conversions];
        updatedConversions[existingIndex] = newConv;
      } else {
        // Add new
        updatedConversions = [...paramFormData.unit_conversions, newConv];
      }
      
      setParamFormData({ ...paramFormData, unit_conversions: updatedConversions });
      setNewConversion({ from_unit: '', multiplier: '', to_unit: '' });
    }
  };

  // Formula component helpers - now with operation selection and conditions
  const addFormulaComponent = (param) => {
    if (!formulaFormData.components.find(c => c.parameter_key === param.parameter_key)) {
      const newComponents = [...formulaFormData.components, {
        parameter_key: param.parameter_key,
        parameter_name: param.parameter_name,
        operation: formulaFormData.components.length === 0 ? 'base' : 'multiply', // First component is base
        condition: 'always' // Default: always apply. Options: 'always', 'volume_units', 'mass_units'
      }];
      updateFormulaExpression(newComponents);
    }
  };

  const removeFormulaComponent = (key) => {
    let newComponents = formulaFormData.components.filter(c => c.parameter_key !== key);
    // First remaining component should be 'base'
    if (newComponents.length > 0 && newComponents[0].operation !== 'base') {
      newComponents[0] = { ...newComponents[0], operation: 'base' };
    }
    updateFormulaExpression(newComponents);
  };

  const updateComponentOperation = (key, operation) => {
    const newComponents = formulaFormData.components.map(c => 
      c.parameter_key === key ? { ...c, operation } : c
    );
    updateFormulaExpression(newComponents);
  };

  const updateComponentCondition = (key, condition) => {
    const newComponents = formulaFormData.components.map(c => 
      c.parameter_key === key ? { ...c, condition } : c
    );
    updateFormulaExpression(newComponents);
  };

  const updateFormulaExpression = (components) => {
    let expression = '';
    components.forEach((c, index) => {
      const conditionSuffix = c.condition && c.condition !== 'always' 
        ? ` (if ${c.condition === 'volume_units' ? 'volume' : 'mass'})` 
        : '';
      if (index === 0) {
        expression = c.parameter_name + conditionSuffix;
      } else {
        const symbol = OPERATION_SYMBOLS[c.operation] || '×';
        expression += ` ${symbol} ${c.parameter_name}${conditionSuffix}`;
      }
    });
    setFormulaFormData({
      ...formulaFormData,
      components,
      formula_expression: expression
    });
  };

  const moveComponent = (index, direction) => {
    const newComponents = [...formulaFormData.components];
    const newIndex = index + direction;
    if (newIndex >= 0 && newIndex < newComponents.length) {
      [newComponents[index], newComponents[newIndex]] = [newComponents[newIndex], newComponents[index]];
      updateFormulaExpression(newComponents);
    }
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
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Formula Management</h1>
          <p className="text-text-secondary">Define formulas and parameters for emission calculations</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="formulas" className="flex items-center gap-2">
            <Calculator className="w-4 h-4" />
            Formulas
          </TabsTrigger>
          <TabsTrigger value="parameters" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Parameters
          </TabsTrigger>
        </TabsList>

        {/* FORMULAS TAB */}
        <TabsContent value="formulas" className="space-y-6">
          <div className="flex justify-between items-center">
            <div className="grid grid-cols-3 gap-4">
              <Card className="p-4 border border-stone-200 rounded-xl bg-gradient-to-br from-primary/5 to-primary/10">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/20 p-2 rounded-lg">
                    <Calculator className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-text-primary">{formulas.length}</p>
                    <p className="text-sm text-text-muted">Total Formulas</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4 border border-stone-200 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="bg-green-100 p-2 rounded-lg">
                    <Check className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-text-primary">{formulas.filter(f => f.is_active).length}</p>
                    <p className="text-sm text-text-muted">Active</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4 border border-stone-200 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 p-2 rounded-lg">
                    <Play className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-text-primary">{formulas.filter(f => f.applies_gwp).length}</p>
                    <p className="text-sm text-text-muted">With GWP</p>
                  </div>
                </div>
              </Card>
            </div>

            <Dialog open={formulaDialogOpen} onOpenChange={(open) => { setFormulaDialogOpen(open); if (!open) resetFormulaForm(); }}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90 text-white rounded-full px-6" data-testid="add-formula-btn">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Formula
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Calculator className="w-5 h-5 text-primary" />
                    {editingFormula ? 'Edit Formula' : 'Create New Formula'}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleFormulaSubmit} className="space-y-6">
                  {/* Basic Info */}
                  <div className="space-y-4">
                    <h3 className="font-medium text-text-primary border-b pb-2">Basic Information</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="formula_name">Formula Name *</Label>
                        <Input
                          id="formula_name"
                          value={formulaFormData.formula_name}
                          onChange={(e) => setFormulaFormData({ ...formulaFormData, formula_name: e.target.value })}
                          required
                          placeholder="e.g., CO₂ Emission Calculation"
                          className="bg-stone-50"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="formula_key">Formula Key *</Label>
                        <Input
                          id="formula_key"
                          value={formulaFormData.formula_key}
                          onChange={(e) => setFormulaFormData({ ...formulaFormData, formula_key: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                          required
                          placeholder="e.g., co2_emission"
                          className="bg-stone-50 font-mono"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="formula_description">Description</Label>
                      <textarea
                        id="formula_description"
                        value={formulaFormData.description}
                        onChange={(e) => setFormulaFormData({ ...formulaFormData, description: e.target.value })}
                        rows={2}
                        placeholder="Brief description of this formula..."
                        className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="output_name">Output Name *</Label>
                        <Input
                          id="output_name"
                          value={formulaFormData.output_name}
                          onChange={(e) => setFormulaFormData({ ...formulaFormData, output_name: e.target.value })}
                          required
                          placeholder="e.g., CO₂ Emissions"
                          className="bg-stone-50"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="output_unit">Output Unit *</Label>
                        <Input
                          id="output_unit"
                          value={formulaFormData.output_unit}
                          onChange={(e) => setFormulaFormData({ ...formulaFormData, output_unit: e.target.value })}
                          required
                          placeholder="e.g., kg CO₂"
                          className="bg-stone-50"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Formula Builder */}
                  <div className="space-y-4">
                    <h3 className="font-medium text-text-primary border-b pb-2">Formula Builder</h3>
                    <p className="text-sm text-text-muted">Click on parameters to add them, then select operations (×, ÷, +, −) between components.</p>
                    
                    {/* Available Parameters - from database */}
                    <div className="space-y-2">
                      <Label>Available Parameters</Label>
                      {parameters.length === 0 ? (
                        <div className="p-4 bg-amber-50 rounded-lg text-amber-800 text-sm">
                          <AlertCircle className="w-4 h-4 inline mr-2" />
                          No parameters defined yet. Go to the Parameters tab to create parameters first.
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2 p-3 bg-stone-50 rounded-lg">
                          {parameters.map(param => (
                            <button
                              key={param.parameter_key}
                              type="button"
                              onClick={() => addFormulaComponent(param)}
                              disabled={formulaFormData.components.find(c => c.parameter_key === param.parameter_key)}
                              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                                formulaFormData.components.find(c => c.parameter_key === param.parameter_key)
                                  ? 'bg-primary text-white cursor-not-allowed'
                                  : 'bg-white border border-stone-200 hover:bg-primary hover:text-white hover:border-primary'
                              }`}
                              title={param.description || param.parameter_name}
                            >
                              + {param.parameter_name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Formula Components with Operation Selection */}
                    <div className="space-y-2">
                      <Label>Formula Components</Label>
                      {formulaFormData.components.length === 0 ? (
                        <div className="p-8 bg-stone-50 rounded-lg text-center text-text-muted">
                          Click on parameters above to build your formula
                        </div>
                      ) : (
                        <div className="p-4 bg-stone-50 rounded-lg space-y-3">
                          {formulaFormData.components.map((comp, index) => (
                            <div key={comp.parameter_key} className="flex items-center gap-2">
                              {/* Operation selector for non-first components */}
                              {index > 0 && (
                                <select
                                  value={comp.operation}
                                  onChange={(e) => updateComponentOperation(comp.parameter_key, e.target.value)}
                                  className="w-16 px-2 py-2 bg-white border border-primary rounded-lg text-lg font-bold text-primary text-center cursor-pointer"
                                >
                                  <option value="multiply">×</option>
                                  <option value="divide">÷</option>
                                  <option value="add">+</option>
                                  <option value="subtract">−</option>
                                </select>
                              )}
                              {index === 0 && (
                                <div className="w-16 text-center text-sm text-text-muted font-medium">Base</div>
                              )}
                              <div className="flex items-center gap-2 flex-1 bg-white p-2 rounded-lg border border-stone-200">
                                <Grip className="w-4 h-4 text-text-muted cursor-move" />
                                <span className="flex-1 font-medium">{comp.parameter_name}</span>
                                {/* Condition selector */}
                                <select
                                  value={comp.condition || 'always'}
                                  onChange={(e) => updateComponentCondition(comp.parameter_key, e.target.value)}
                                  className={`px-2 py-1 text-xs border rounded cursor-pointer ${
                                    comp.condition === 'volume_units' ? 'bg-green-50 border-green-300 text-green-700' :
                                    comp.condition === 'mass_units' ? 'bg-blue-50 border-blue-300 text-blue-700' :
                                    'bg-stone-50 border-stone-200 text-text-muted'
                                  }`}
                                  title="When to apply this component"
                                >
                                  <option value="always">Always</option>
                                  <option value="volume_units">If Volume Unit</option>
                                  <option value="mass_units">If Mass Unit</option>
                                </select>
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => moveComponent(index, -1)}
                                    disabled={index === 0}
                                    className="p-1 hover:bg-stone-100 rounded disabled:opacity-30"
                                  >
                                    ↑
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moveComponent(index, 1)}
                                    disabled={index === formulaFormData.components.length - 1}
                                    className="p-1 hover:bg-stone-100 rounded disabled:opacity-30"
                                  >
                                    ↓
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeFormulaComponent(comp.parameter_key)}
                                    className="p-1 hover:bg-red-100 text-red-500 rounded"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                          <p className="text-xs text-text-muted mt-2">
                            Tip: Use "If Volume Unit" for Density to skip it when users enter mass units (kg, g, tonne)
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Formula Expression Preview */}
                    {formulaFormData.formula_expression && (
                      <div className="p-4 bg-primary/10 rounded-lg">
                        <Label className="text-primary">Formula Expression</Label>
                        <p className="text-lg font-mono font-medium text-text-primary mt-1">
                          {formulaFormData.output_name || 'Output'} = {formulaFormData.formula_expression}
                          {formulaFormData.applies_gwp && ` × GWP(${formulaFormData.gwp_gas})`}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* GWP Settings */}
                  <div className="space-y-4">
                    <h3 className="font-medium text-text-primary border-b pb-2">GWP Settings</h3>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formulaFormData.applies_gwp}
                          onChange={(e) => setFormulaFormData({ ...formulaFormData, applies_gwp: e.target.checked })}
                          className="w-5 h-5 text-primary"
                        />
                        <div>
                          <p className="font-medium">Apply GWP Multiplier</p>
                          <p className="text-xs text-text-muted">Multiply result by Global Warming Potential</p>
                        </div>
                      </label>
                      {formulaFormData.applies_gwp && (
                        <select
                          value={formulaFormData.gwp_gas}
                          onChange={(e) => setFormulaFormData({ ...formulaFormData, gwp_gas: e.target.value })}
                          className="h-10 bg-white border border-stone-200 rounded-lg px-3"
                        >
                          <option value="">Select Gas</option>
                          <option value="CO2">CO₂ (GWP = 1)</option>
                          <option value="CH4">CH₄ (GWP = 28)</option>
                          <option value="N2O">N₂O (GWP = 273)</option>
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Active Status */}
                  <div className="space-y-4">
                    <label className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formulaFormData.is_active}
                        onChange={(e) => setFormulaFormData({ ...formulaFormData, is_active: e.target.checked })}
                        className="w-5 h-5 text-primary"
                      />
                      <div>
                        <p className="font-medium">Active Formula</p>
                        <p className="text-xs text-text-muted">Only active formulas are available for calculations</p>
                      </div>
                    </label>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => { setFormulaDialogOpen(false); resetFormulaForm(); }}>
                      Cancel
                    </Button>
                    <Button type="submit" className="bg-primary hover:bg-primary/90 text-white">
                      {editingFormula ? 'Update Formula' : 'Create Formula'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Formula List */}
          {formulas.length === 0 ? (
            <Card className="p-12 border border-stone-200 rounded-xl bg-white text-center">
              <Calculator className="w-16 h-16 mx-auto text-text-muted mb-4" />
              <h3 className="text-xl font-medium text-text-primary mb-2">No formulas defined</h3>
              <p className="text-text-muted mb-4">Create formulas to define how emissions are calculated</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {formulas.sort((a, b) => (a.display_order || 0) - (b.display_order || 0)).map((formula) => (
                <Card key={formula.id} className="p-4 border border-stone-200 rounded-xl bg-white hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-text-primary">{formula.formula_name}</h3>
                        <code className="px-2 py-0.5 bg-stone-100 text-text-secondary text-xs rounded font-mono">
                          {formula.formula_key}
                        </code>
                        {formula.is_active ? (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">Active</span>
                        ) : (
                          <span className="px-2 py-0.5 bg-stone-100 text-text-muted text-xs rounded">Inactive</span>
                        )}
                        {formula.applies_gwp && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">GWP: {formula.gwp_gas}</span>
                        )}
                      </div>
                      {formula.description && (
                        <p className="text-sm text-text-muted mb-3">{formula.description}</p>
                      )}
                      <div className="p-3 bg-primary/5 rounded-lg mb-3">
                        <p className="text-sm font-mono">
                          <span className="font-bold text-primary">{formula.output_name}</span> = {formula.formula_expression}
                          {formula.applies_gwp && <span className="text-blue-600"> × GWP({formula.gwp_gas})</span>}
                        </p>
                        <p className="text-xs text-text-muted mt-1">Output Unit: {formula.output_unit}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {formula.components?.map((comp, idx) => (
                          <span key={comp.parameter_key} className="inline-flex items-center gap-1 px-2 py-1 bg-stone-100 rounded text-xs">
                            {idx > 0 && <span className="text-primary font-bold mr-1">×</span>}
                            {comp.parameter_name}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEditFormula(formula)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-red-500 hover:text-red-700"
                        onClick={() => { setItemToDelete(formula); setDeleteType('formula'); setDeleteDialogOpen(true); }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* PARAMETERS TAB */}
        <TabsContent value="parameters" className="space-y-6">
          <div className="flex justify-between items-center">
            <div className="grid grid-cols-4 gap-4">
              <Card className="p-4 border border-stone-200 rounded-xl bg-gradient-to-br from-primary/5 to-primary/10">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/20 p-2 rounded-lg">
                    <Settings className="w-5 h-5 text-primary" />
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
                    <p className="text-2xl font-bold text-text-primary">{parameters.filter(p => p.requires_user_input).length}</p>
                    <p className="text-sm text-text-muted">User Input</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4 border border-stone-200 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="bg-green-100 p-2 rounded-lg">
                    <Check className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-text-primary">{parameters.filter(p => !p.requires_user_input).length}</p>
                    <p className="text-sm text-text-muted">Predefined</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4 border border-stone-200 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="bg-orange-100 p-2 rounded-lg">
                    <ArrowRight className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-text-primary">{parameters.reduce((sum, p) => sum + (p.unit_conversions?.length || 0), 0)}</p>
                    <p className="text-sm text-text-muted">Conversions</p>
                  </div>
                </div>
              </Card>
            </div>

            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetParamForm(); }}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90 text-white rounded-full px-6" data-testid="add-parameter-btn">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Parameter
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Settings className="w-5 h-5 text-primary" />
                    {editingParameter ? 'Edit Parameter' : 'Add New Parameter'}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleParamSubmit} className="space-y-6">
                  {/* Basic Info */}
                  <div className="space-y-4">
                    <h3 className="font-medium text-text-primary border-b pb-2">Basic Information</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="parameter_name">Parameter Name *</Label>
                        <Input
                          id="parameter_name"
                          value={paramFormData.parameter_name}
                          onChange={(e) => setParamFormData({ ...paramFormData, parameter_name: e.target.value })}
                          required
                          placeholder="e.g., Calorific Value, Density"
                          className="bg-stone-50"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="parameter_key">Parameter Key *</Label>
                        <Input
                          id="parameter_key"
                          value={paramFormData.parameter_key}
                          onChange={(e) => setParamFormData({ ...paramFormData, parameter_key: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                          required
                          placeholder="e.g., calorific_value"
                          className="bg-stone-50 font-mono"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <textarea
                        id="description"
                        value={paramFormData.description}
                        onChange={(e) => setParamFormData({ ...paramFormData, description: e.target.value })}
                        rows={2}
                        placeholder="Brief description..."
                        className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2"
                      />
                    </div>
                  </div>

                  {/* Unit Conversions - Using Centralized Units */}
                  <div className="space-y-4">
                    <h3 className="font-medium text-text-primary border-b pb-2">Unit Conversions</h3>
                    <p className="text-xs text-text-muted">Define how to convert between different units when user inputs quantity in different formats. Units are fetched from the centralized Unit Management module.</p>
                    
                    {/* Add Conversion */}
                    <div className="p-4 bg-stone-50 rounded-lg space-y-3">
                      <Label>Add Conversion Rule</Label>
                      <div className="flex gap-2 items-center flex-wrap">
                        <span className="text-sm text-text-muted">1</span>
                        <Select 
                          value={newConversion.from_unit} 
                          onValueChange={(value) => setNewConversion({ ...newConversion, from_unit: value })}
                        >
                          <SelectTrigger className="w-40 bg-white" data-testid="from-unit-select">
                            <SelectValue placeholder="From unit" />
                          </SelectTrigger>
                          <SelectContent>
                            {units.map(unit => (
                              <SelectItem key={unit.symbol} value={unit.symbol}>
                                {unit.symbol} ({unit.name})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="text-lg font-bold text-primary">×</span>
                        <Input 
                          type="number" 
                          step="any" 
                          value={newConversion.multiplier} 
                          onChange={(e) => setNewConversion({ ...newConversion, multiplier: e.target.value })} 
                          placeholder="Multiplier" 
                          className="bg-white w-32" 
                          data-testid="conversion-multiplier-input"
                        />
                        <span className="text-lg font-bold text-primary">=</span>
                        <Select 
                          value={newConversion.to_unit || ''} 
                          onValueChange={(value) => setNewConversion({ ...newConversion, to_unit: value })}
                        >
                          <SelectTrigger className="w-40 bg-white" data-testid="to-unit-select">
                            <SelectValue placeholder="To unit" />
                          </SelectTrigger>
                          <SelectContent>
                            {units.map(unit => (
                              <SelectItem key={unit.symbol} value={unit.symbol}>
                                {unit.symbol} ({unit.name})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button type="button" onClick={addConversion} variant="outline" className="shrink-0" data-testid="add-conversion-btn">
                          <Plus className="w-4 h-4 mr-1" /> Add
                        </Button>
                      </div>
                      <p className="text-xs text-text-muted">Example: 1 L × 0.85 = 0.85 kg (for diesel density conversion)</p>
                    </div>

                    {/* Conversion List */}
                    {paramFormData.unit_conversions.length > 0 && (
                      <div className="space-y-2">
                        <Label>Defined Conversions</Label>
                        <div className="space-y-1">
                          {paramFormData.unit_conversions.map((conv, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-lg">
                              <span className="text-sm font-mono">
                                1 <strong className="text-primary">{conv.from_unit}</strong> × {conv.multiplier} = {conv.multiplier} <strong className="text-primary">{conv.to_unit || 'base'}</strong>
                              </span>
                              <button 
                                type="button" 
                                onClick={() => setParamFormData({ 
                                  ...paramFormData, 
                                  unit_conversions: paramFormData.unit_conversions.filter((_, i) => i !== idx) 
                                })} 
                                className="text-red-500 hover:text-red-700 p-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {paramFormData.unit_conversions.length === 0 && (
                      <div className="text-center py-4 text-text-muted text-sm">
                        No conversions defined yet. Add conversions above if users may input values in different units.
                      </div>
                    )}
                  </div>

                  {/* Input Settings */}
                  <div className="space-y-4">
                    <h3 className="font-medium text-text-primary border-b pb-2">Value Source</h3>
                    <p className="text-xs text-text-muted mb-2">Choose whether this parameter value comes from user input or is predefined in the system.</p>
                    
                    <div className="grid grid-cols-2 gap-4">
                      {/* User Input Option */}
                      <label className={`flex items-start gap-3 p-4 rounded-lg cursor-pointer border-2 transition-all ${
                        paramFormData.is_user_input 
                          ? 'border-primary bg-primary/5' 
                          : 'border-stone-200 bg-stone-50 hover:border-stone-300'
                      }`}>
                        <input 
                          type="radio" 
                          name="value_source" 
                          checked={paramFormData.is_user_input} 
                          onChange={() => setParamFormData({ ...paramFormData, is_user_input: true, predefined_source: '' })} 
                          className="mt-1 w-5 h-5 text-primary" 
                        />
                        <div>
                          <p className="font-medium text-text-primary">User Input</p>
                          <p className="text-xs text-text-muted mt-1">User must enter this value when recording emissions (e.g., Quantity consumed)</p>
                        </div>
                      </label>
                      
                      {/* Predefined Option */}
                      <label className={`flex items-start gap-3 p-4 rounded-lg cursor-pointer border-2 transition-all ${
                        !paramFormData.is_user_input 
                          ? 'border-primary bg-primary/5' 
                          : 'border-stone-200 bg-stone-50 hover:border-stone-300'
                      }`}>
                        <input 
                          type="radio" 
                          name="value_source" 
                          checked={!paramFormData.is_user_input} 
                          onChange={() => setParamFormData({ ...paramFormData, is_user_input: false })} 
                          className="mt-1 w-5 h-5 text-primary" 
                        />
                        <div>
                          <p className="font-medium text-text-primary">Predefined Value</p>
                          <p className="text-xs text-text-muted mt-1">Value is auto-filled from Fuel Database (e.g., Calorific Value, Emission Factor)</p>
                        </div>
                      </label>
                    </div>
                    
                    {/* Predefined Source Selection */}
                    {!paramFormData.is_user_input && (
                      <div className="space-y-2 p-4 bg-stone-50 rounded-lg">
                        <Label htmlFor="predefined_source">Predefined Value Source</Label>
                        <select 
                          id="predefined_source"
                          value={paramFormData.predefined_source}
                          onChange={(e) => setParamFormData({ ...paramFormData, predefined_source: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-sm"
                        >
                          <option value="">Select source...</option>
                          <option value="fuel_database.calorific_value">Fuel Database → Calorific Value</option>
                          <option value="fuel_database.co2_emission_factor">Fuel Database → CO₂ Emission Factor</option>
                          <option value="fuel_database.ch4_emission_factor">Fuel Database → CH₄ Emission Factor</option>
                          <option value="fuel_database.n2o_emission_factor">Fuel Database → N₂O Emission Factor</option>
                          <option value="fuel_database.density">Fuel Database → Density</option>
                          <option value="gwp.co2">GWP → CO₂ (1)</option>
                          <option value="gwp.ch4">GWP → CH₄ (28)</option>
                          <option value="gwp.n2o">GWP → N₂O (273)</option>
                        </select>
                        <p className="text-xs text-text-muted">The value will be automatically fetched from this source during calculation.</p>
                      </div>
                    )}
                    
                    {/* Optional Parameter */}
                    <label className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={paramFormData.is_optional} 
                        onChange={(e) => setParamFormData({ ...paramFormData, is_optional: e.target.checked })} 
                        className="w-5 h-5 text-primary" 
                      />
                      <div>
                        <p className="font-medium">Optional Parameter</p>
                        <p className="text-xs text-text-muted">Can be skipped if not applicable (e.g., Density for mass-based fuels)</p>
                      </div>
                    </label>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetParamForm(); }}>Cancel</Button>
                    <Button type="submit" className="bg-primary hover:bg-primary/90 text-white">{editingParameter ? 'Update' : 'Create'}</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Parameter List */}
          {parameters.length === 0 ? (
            <Card className="p-12 border border-stone-200 rounded-xl bg-white text-center">
              <Settings className="w-16 h-16 mx-auto text-text-muted mb-4" />
              <h3 className="text-xl font-medium text-text-primary mb-2">No parameters defined</h3>
              <p className="text-text-muted">Add parameters to use in your formulas</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {parameters.sort((a, b) => (a.display_order || 0) - (b.display_order || 0)).map((param) => (
                <Card key={param.id} className="p-4 border border-stone-200 rounded-xl bg-white hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-text-primary">{param.parameter_name}</h3>
                        <code className="px-2 py-0.5 bg-stone-100 text-text-secondary text-xs rounded font-mono">{param.parameter_key}</code>
                        {param.requires_user_input ? (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">User Input</span>
                        ) : (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">Predefined</span>
                        )}
                        {param.is_optional && <span className="px-2 py-0.5 bg-stone-100 text-text-muted text-xs rounded">Optional</span>}
                      </div>
                      {param.description && <p className="text-sm text-text-muted mb-2">{param.description}</p>}
                      <div className="flex flex-wrap gap-4 text-sm">
                        <div><span className="text-text-muted">Standard:</span> <strong className="text-primary">{param.standard_unit}</strong></div>
                        <div><span className="text-text-muted">Units:</span> {param.available_units?.join(', ') || 'None'}</div>
                        {!param.requires_user_input && param.default_value != null && (
                          <div><span className="text-text-muted">Default:</span> <strong>{param.default_value}</strong></div>
                        )}
                      </div>
                      {param.unit_conversions?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {param.unit_conversions.map(conv => (
                            <span key={conv.from_unit} className="text-xs bg-stone-50 px-2 py-1 rounded">{conv.from_unit} × {conv.multiplier} → {param.standard_unit}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEditParam(param)}><Edit className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700" onClick={() => { setItemToDelete(param); setDeleteType('parameter'); setDeleteDialogOpen(true); }}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteType === 'parameter' ? 'Parameter' : 'Formula'}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{itemToDelete?.parameter_name || itemToDelete?.formula_name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
