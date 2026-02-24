import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Plus, Trash2, Edit, Settings, Link, ArrowRight, Check, X, AlertCircle, Zap, Database, FileInput } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Available scopes
const SCOPES = [
  { value: 'scope1', label: 'Scope 1' },
  { value: 'scope2', label: 'Scope 2' },
  { value: 'scope3', label: 'Scope 3' },
  { value: 'biogenic', label: 'Biogenic' }
];

// Available categories
const CATEGORIES = [
  'Stationary Combustion',
  'Mobile Combustion',
  'Fugitive Emissions',
  'Process Emissions',
  'Purchased Electricity',
  'Purchased Heat/Steam',
  'Other'
];

// Source types for input mappings
const SOURCE_TYPES = [
  { value: 'user_input', label: 'User Input', description: 'Admin enters this value manually' },
  { value: 'fuel_database', label: 'Fuel Database', description: 'Auto-populated from selected fuel' },
  { value: 'formula_parameter', label: 'Formula Parameter', description: 'From parameter definitions (e.g., GWP)' },
  { value: 'constant', label: 'Constant Value', description: 'Fixed value defined here' }
];

// Available form fields that can be mapped to parameters
const FORM_FIELDS = [
  { value: 'quantity', label: 'Quantity', description: 'User-entered quantity' },
  { value: 'quantity_unit', label: 'Quantity Unit', description: 'Selected unit for quantity' },
  { value: 'emission_factor_co2', label: 'CO2 Emission Factor', description: 'From fuel or manual' },
  { value: 'emission_factor_ch4', label: 'CH4 Emission Factor', description: 'From fuel or manual' },
  { value: 'emission_factor_n2o', label: 'N2O Emission Factor', description: 'From fuel or manual' },
  { value: 'emission_factor_basis_quantity', label: 'Emission Factor Basis', description: 'Basis quantity (e.g., tCO2/MWh)' },
  { value: 'calorific_value', label: 'Calorific Value (NCV)', description: 'Net calorific value' },
  { value: 'density', label: 'Density', description: 'For volume to mass conversion' },
  { value: 'conversion_factor', label: 'Conversion Factor', description: 'Unit conversion multiplier' }
];

// Fuel database fields
const FUEL_DATABASE_FIELDS = [
  { value: 'emission_factor_co2', label: 'CO2 Emission Factor' },
  { value: 'emission_factor_ch4', label: 'CH4 Emission Factor' },
  { value: 'emission_factor_n2o', label: 'N2O Emission Factor' },
  { value: 'emission_factor_basis_quantity', label: 'Emission Factor Basis Quantity' },
  { value: 'emission_factor_basis_unit', label: 'Emission Factor Basis Unit' },
  { value: 'calorific_value', label: 'Calorific Value' },
  { value: 'density', label: 'Density' }
];

export default function EmissionConfiguration() {
  const [activeTab, setActiveTab] = useState('scope-mapping');
  const [configurations, setConfigurations] = useState([]);
  const [formulas, setFormulas] = useState([]);
  const [parameters, setParameters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mappingDialogOpen, setMappingDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [editingConfig, setEditingConfig] = useState(null);
  const [editingFormula, setEditingFormula] = useState(null);
  const { getAuthHeader } = useAuth();

  // Configuration form data (Scope-to-Formula mapping)
  const [configFormData, setConfigFormData] = useState({
    name: '',
    description: '',
    scope: '',
    category: '',
    formula_id: '',
    is_active: true,
    priority: 0
  });

  // Input mapping form data
  const [mappingFormData, setMappingFormData] = useState({
    parameter_key: '',
    source_type: 'user_input',
    source_field: '',
    label: '',
    required: true,
    default_value: ''
  });

  const fetchData = useCallback(async () => {
    try {
      const [configsRes, formulasRes, paramsRes] = await Promise.all([
        axios.get(`${API}/super-admin/emission-configurations`, { headers: getAuthHeader() }).catch(() => ({ data: [] })),
        axios.get(`${API}/super-admin/formula-definitions`, { headers: getAuthHeader() }).catch(() => ({ data: [] })),
        axios.get(`${API}/super-admin/formula-parameters`, { headers: getAuthHeader() }).catch(() => ({ data: [] }))
      ]);
      
      setConfigurations(configsRes.data || []);
      setFormulas(formulasRes.data || []);
      setParameters(paramsRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load configuration data');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset configuration form
  const resetConfigForm = () => {
    setConfigFormData({
      name: '',
      description: '',
      scope: '',
      category: '',
      formula_id: '',
      is_active: true,
      priority: 0
    });
    setEditingConfig(null);
  };

  // Open dialog for new configuration
  const openNewConfigDialog = () => {
    resetConfigForm();
    setDialogOpen(true);
  };

  // Open dialog for editing configuration
  const openEditConfigDialog = (config) => {
    setConfigFormData({
      name: config.name || '',
      description: config.description || '',
      scope: config.scope || '',
      category: config.category || '',
      formula_id: config.formula_id || '',
      is_active: config.is_active !== false,
      priority: config.priority || 0
    });
    setEditingConfig(config);
    setDialogOpen(true);
  };

  // Save configuration
  const saveConfiguration = async () => {
    if (!configFormData.name || !configFormData.scope || !configFormData.formula_id) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Clean up the category value (convert "__any__" to empty string)
    const dataToSave = {
      ...configFormData,
      category: configFormData.category === '__any__' ? '' : configFormData.category
    };

    try {
      if (editingConfig) {
        await axios.put(
          `${API}/super-admin/emission-configurations/${editingConfig.id}`,
          dataToSave,
          { headers: getAuthHeader() }
        );
        toast.success('Configuration updated successfully');
      } else {
        await axios.post(
          `${API}/super-admin/emission-configurations`,
          dataToSave,
          { headers: getAuthHeader() }
        );
        toast.success('Configuration created successfully');
      }
      setDialogOpen(false);
      resetConfigForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save configuration');
    }
  };

  // Delete configuration
  const confirmDelete = (config) => {
    setItemToDelete(config);
    setDeleteDialogOpen(true);
  };

  const deleteConfiguration = async () => {
    if (!itemToDelete) return;
    
    try {
      await axios.delete(
        `${API}/super-admin/emission-configurations/${itemToDelete.id}`,
        { headers: getAuthHeader() }
      );
      toast.success('Configuration deleted successfully');
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete configuration');
    }
  };

  // Open input mappings dialog for a formula
  const openMappingDialog = (formula) => {
    setEditingFormula(formula);
    setMappingFormData({
      parameter_key: '',
      source_type: 'user_input',
      source_field: '',
      label: '',
      required: true,
      default_value: ''
    });
    setMappingDialogOpen(true);
  };

  // Add new input mapping to formula
  const addInputMapping = () => {
    if (!mappingFormData.parameter_key || !mappingFormData.source_type) {
      toast.error('Please select a parameter and source type');
      return;
    }

    const newMapping = { ...mappingFormData };
    const currentMappings = editingFormula.input_mappings || [];
    
    // Check for duplicate
    if (currentMappings.some(m => m.parameter_key === newMapping.parameter_key)) {
      toast.error('This parameter is already mapped');
      return;
    }

    updateFormulaMappings([...currentMappings, newMapping]);
    setMappingFormData({
      parameter_key: '',
      source_type: 'user_input',
      source_field: '',
      label: '',
      required: true,
      default_value: ''
    });
  };

  // Remove input mapping from formula
  const removeInputMapping = (paramKey) => {
    const currentMappings = editingFormula.input_mappings || [];
    updateFormulaMappings(currentMappings.filter(m => m.parameter_key !== paramKey));
  };

  // Save input mappings to formula
  const updateFormulaMappings = async (newMappings) => {
    try {
      const updateData = {
        formula_name: editingFormula.formula_name,
        formula_key: editingFormula.formula_key,
        output_name: editingFormula.output_name,
        output_unit: editingFormula.output_unit,
        components: editingFormula.components || [],
        formula_expression: editingFormula.formula_expression || '',
        applies_gwp: editingFormula.applies_gwp || false,
        gwp_gas: editingFormula.gwp_gas || null,
        applicable_scopes: editingFormula.applicable_scopes || [],
        applicable_categories: editingFormula.applicable_categories || [],
        applicable_industries: editingFormula.applicable_industries || [],
        is_active: editingFormula.is_active !== false,
        display_order: editingFormula.display_order || 0,
        mass_units: editingFormula.mass_units || [],
        volume_units: editingFormula.volume_units || [],
        input_mappings: newMappings
      };

      await axios.put(
        `${API}/super-admin/formula-definitions/${editingFormula.id}`,
        updateData,
        { headers: getAuthHeader() }
      );
      
      // Update local state
      setEditingFormula({ ...editingFormula, input_mappings: newMappings });
      setFormulas(formulas.map(f => 
        f.id === editingFormula.id ? { ...f, input_mappings: newMappings } : f
      ));
      toast.success('Input mappings updated');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update mappings');
    }
  };

  // Get formula parameters that are used in formula components
  const getFormulaParameters = (formula) => {
    if (!formula.components) return [];
    return formula.components.map(comp => ({
      key: comp.parameter_key,
      name: comp.parameter_name
    }));
  };

  // Get display name for source field
  const getSourceFieldDisplay = (mapping) => {
    if (mapping.source_type === 'user_input') {
      const field = FORM_FIELDS.find(f => f.value === mapping.source_field);
      return field?.label || mapping.source_field;
    } else if (mapping.source_type === 'fuel_database') {
      const field = FUEL_DATABASE_FIELDS.find(f => f.value === mapping.source_field);
      return field?.label || mapping.source_field;
    } else if (mapping.source_type === 'formula_parameter') {
      const param = parameters.find(p => p.parameter_key === mapping.source_field);
      return param?.parameter_name || mapping.source_field;
    } else if (mapping.source_type === 'constant') {
      return `Value: ${mapping.default_value}`;
    }
    return mapping.source_field;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="emission-configuration-page">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Emission Configuration</h1>
          <p className="text-slate-600 mt-1">Configure dynamic formula mappings and input sources for emission calculations</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
          <TabsTrigger value="scope-mapping" className="flex items-center gap-2">
            <Link className="h-4 w-4" />
            Scope-Formula Mapping
          </TabsTrigger>
          <TabsTrigger value="input-mappings" className="flex items-center gap-2">
            <FileInput className="h-4 w-4" />
            Input Field Mappings
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Scope-to-Formula Mapping */}
        <TabsContent value="scope-mapping" className="space-y-4">
          <Card className="p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Scope to Formula Mappings</h2>
                <p className="text-sm text-slate-500">Define which formula applies to each scope and category</p>
              </div>
              <Button onClick={openNewConfigDialog} className="bg-emerald-600 hover:bg-emerald-700" data-testid="add-scope-mapping-btn">
                <Plus className="h-4 w-4 mr-2" />
                Add Mapping
              </Button>
            </div>

            {configurations.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Settings className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No scope-formula mappings configured yet.</p>
                <p className="text-sm">Click "Add Mapping" to define which formula applies to each scope.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {configurations.map((config) => (
                  <div 
                    key={config.id} 
                    className={`border rounded-lg p-4 ${config.is_active ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200 opacity-60'}`}
                    data-testid={`scope-mapping-${config.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                          config.scope === 'scope1' ? 'bg-blue-100 text-blue-700' :
                          config.scope === 'scope2' ? 'bg-green-100 text-green-700' :
                          config.scope === 'scope3' ? 'bg-purple-100 text-purple-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {SCOPES.find(s => s.value === config.scope)?.label || config.scope}
                        </div>
                        {config.category && (
                          <>
                            <ArrowRight className="h-4 w-4 text-slate-400" />
                            <span className="text-sm text-slate-600">{config.category}</span>
                          </>
                        )}
                        <ArrowRight className="h-4 w-4 text-slate-400" />
                        <div className="flex items-center gap-2">
                          <Zap className="h-4 w-4 text-emerald-600" />
                          <span className="font-medium text-slate-800">{config.formula_name}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Priority: {config.priority}</span>
                        {!config.is_active && (
                          <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-xs rounded">Inactive</span>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => openEditConfigDialog(config)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => confirmDelete(config)} className="text-red-500 hover:text-red-700">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {config.description && (
                      <p className="text-sm text-slate-500 mt-2 ml-1">{config.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Tab 2: Input Field Mappings per Formula */}
        <TabsContent value="input-mappings" className="space-y-4">
          <Card className="p-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-800">Input Field Mappings</h2>
              <p className="text-sm text-slate-500">
                Define where each formula parameter gets its value from (user input, fuel database, etc.)
              </p>
            </div>

            {formulas.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No formulas defined yet.</p>
                <p className="text-sm">Create formulas in the Formulas page first.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {formulas.map((formula) => (
                  <div key={formula.id} className="border rounded-lg p-4 bg-white" data-testid={`formula-mapping-${formula.id}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-medium text-slate-800">{formula.formula_name}</h3>
                        <p className="text-xs text-slate-500">{formula.formula_key} • Output: {formula.output_unit}</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => openMappingDialog(formula)} data-testid={`edit-mapping-${formula.id}`}>
                        <Settings className="h-4 w-4 mr-1" />
                        Configure Mappings
                      </Button>
                    </div>
                    
                    {/* Show current mappings */}
                    {formula.input_mappings && formula.input_mappings.length > 0 ? (
                      <div className="bg-slate-50 rounded-lg p-3">
                        <div className="text-xs font-medium text-slate-500 mb-2">Current Mappings:</div>
                        <div className="flex flex-wrap gap-2">
                          {formula.input_mappings.map((mapping, idx) => (
                            <div key={idx} className="flex items-center gap-1 px-2 py-1 bg-white border rounded text-xs">
                              <span className="font-medium">{mapping.parameter_key}</span>
                              <ArrowRight className="h-3 w-3 text-slate-400" />
                              <span className={`${
                                mapping.source_type === 'user_input' ? 'text-blue-600' :
                                mapping.source_type === 'fuel_database' ? 'text-green-600' :
                                mapping.source_type === 'formula_parameter' ? 'text-purple-600' :
                                'text-amber-600'
                              }`}>
                                {getSourceFieldDisplay(mapping)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-600" />
                        <span className="text-sm text-amber-700">No input mappings configured. Click "Configure Mappings" to set up.</span>
                      </div>
                    )}

                    {/* Show formula components (parameters used) */}
                    <div className="mt-3 text-xs text-slate-500">
                      <span className="font-medium">Formula uses:</span>
                      {formula.components?.map((comp, idx) => (
                        <span key={idx} className="ml-2 px-1.5 py-0.5 bg-slate-100 rounded">
                          {comp.parameter_name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Scope-Formula Mapping Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingConfig ? 'Edit' : 'Add'} Scope-Formula Mapping</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Mapping Name *</Label>
              <Input
                value={configFormData.name}
                onChange={(e) => setConfigFormData({ ...configFormData, name: e.target.value })}
                placeholder="e.g., Scope 1 Stationary Combustion"
                data-testid="mapping-name-input"
              />
            </div>

            <div>
              <Label>Description</Label>
              <Input
                value={configFormData.description}
                onChange={(e) => setConfigFormData({ ...configFormData, description: e.target.value })}
                placeholder="Optional description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Scope *</Label>
                <Select
                  value={configFormData.scope}
                  onValueChange={(value) => setConfigFormData({ ...configFormData, scope: value })}
                >
                  <SelectTrigger data-testid="scope-select">
                    <SelectValue placeholder="Select scope" />
                  </SelectTrigger>
                  <SelectContent>
                    {SCOPES.map((scope) => (
                      <SelectItem key={scope.value} value={scope.value}>
                        {scope.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Category (Optional)</Label>
                <Select
                  value={configFormData.category}
                  onValueChange={(value) => setConfigFormData({ ...configFormData, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Any Category</SelectItem>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Formula *</Label>
              <Select
                value={configFormData.formula_id}
                onValueChange={(value) => setConfigFormData({ ...configFormData, formula_id: value })}
              >
                <SelectTrigger data-testid="formula-select">
                  <SelectValue placeholder="Select formula to apply" />
                </SelectTrigger>
                <SelectContent>
                  {formulas.filter(f => f.is_active).map((formula) => (
                    <SelectItem key={formula.id} value={formula.id}>
                      {formula.formula_name} ({formula.output_unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Priority</Label>
                <Input
                  type="number"
                  value={configFormData.priority}
                  onChange={(e) => setConfigFormData({ ...configFormData, priority: parseInt(e.target.value) || 0 })}
                  placeholder="0"
                />
                <p className="text-xs text-slate-500 mt-1">Higher priority mappings take precedence</p>
              </div>

              <div className="flex items-center space-x-2 pt-6">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={configFormData.is_active}
                  onChange={(e) => setConfigFormData({ ...configFormData, is_active: e.target.checked })}
                  className="h-4 w-4"
                />
                <Label htmlFor="is_active" className="cursor-pointer">Active</Label>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveConfiguration} className="bg-emerald-600 hover:bg-emerald-700" data-testid="save-mapping-btn">
              {editingConfig ? 'Update' : 'Create'} Mapping
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Input Mapping Configuration Dialog */}
      <Dialog open={mappingDialogOpen} onOpenChange={setMappingDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configure Input Mappings - {editingFormula?.formula_name}</DialogTitle>
          </DialogHeader>
          
          {editingFormula && (
            <div className="space-y-6 py-4">
              {/* Formula Info */}
              <div className="bg-slate-50 p-3 rounded-lg text-sm">
                <div className="font-medium text-slate-700">Formula Expression:</div>
                <div className="text-slate-600">{editingFormula.formula_expression || 'Not defined'}</div>
                <div className="mt-2 font-medium text-slate-700">Parameters Used:</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {editingFormula.components?.map((comp, idx) => (
                    <span key={idx} className="px-2 py-0.5 bg-white border rounded text-xs">
                      {comp.parameter_name} ({comp.parameter_key})
                    </span>
                  ))}
                </div>
              </div>

              {/* Current Mappings */}
              <div>
                <h3 className="font-medium text-slate-800 mb-2">Current Mappings</h3>
                {editingFormula.input_mappings && editingFormula.input_mappings.length > 0 ? (
                  <div className="space-y-2">
                    {editingFormula.input_mappings.map((mapping, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-white border rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-slate-800">{mapping.parameter_key}</span>
                          <ArrowRight className="h-4 w-4 text-slate-400" />
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            mapping.source_type === 'user_input' ? 'bg-blue-100 text-blue-700' :
                            mapping.source_type === 'fuel_database' ? 'bg-green-100 text-green-700' :
                            mapping.source_type === 'formula_parameter' ? 'bg-purple-100 text-purple-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {SOURCE_TYPES.find(s => s.value === mapping.source_type)?.label}
                          </span>
                          <span className="text-slate-600">{getSourceFieldDisplay(mapping)}</span>
                          {mapping.required && <Check className="h-4 w-4 text-green-600" />}
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => removeInputMapping(mapping.parameter_key)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 italic">No mappings configured yet</p>
                )}
              </div>

              {/* Add New Mapping */}
              <div className="border-t pt-4">
                <h3 className="font-medium text-slate-800 mb-3">Add New Mapping</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Parameter *</Label>
                    <Select
                      value={mappingFormData.parameter_key}
                      onValueChange={(value) => {
                        const param = parameters.find(p => p.parameter_key === value);
                        setMappingFormData({ 
                          ...mappingFormData, 
                          parameter_key: value,
                          label: param?.parameter_name || value
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select parameter" />
                      </SelectTrigger>
                      <SelectContent>
                        {getFormulaParameters(editingFormula).map((param) => (
                          <SelectItem 
                            key={param.key} 
                            value={param.key}
                            disabled={(editingFormula.input_mappings || []).some(m => m.parameter_key === param.key)}
                          >
                            {param.name} ({param.key})
                          </SelectItem>
                        ))}
                        {/* Also show parameters from formula_parameters */}
                        {parameters.filter(p => !getFormulaParameters(editingFormula).some(fp => fp.key === p.parameter_key)).map((param) => (
                          <SelectItem 
                            key={param.parameter_key} 
                            value={param.parameter_key}
                            disabled={(editingFormula.input_mappings || []).some(m => m.parameter_key === param.parameter_key)}
                          >
                            {param.parameter_name} ({param.parameter_key})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Source Type *</Label>
                    <Select
                      value={mappingFormData.source_type}
                      onValueChange={(value) => setMappingFormData({ ...mappingFormData, source_type: value, source_field: '' })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select source" />
                      </SelectTrigger>
                      <SelectContent>
                        {SOURCE_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            <div>
                              <div>{type.label}</div>
                              <div className="text-xs text-slate-500">{type.description}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Source field selection based on source_type */}
                <div className="mt-4">
                  <Label>Source Field</Label>
                  {mappingFormData.source_type === 'user_input' && (
                    <Select
                      value={mappingFormData.source_field}
                      onValueChange={(value) => setMappingFormData({ ...mappingFormData, source_field: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select form field" />
                      </SelectTrigger>
                      <SelectContent>
                        {FORM_FIELDS.map((field) => (
                          <SelectItem key={field.value} value={field.value}>
                            {field.label} - <span className="text-slate-500">{field.description}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  
                  {mappingFormData.source_type === 'fuel_database' && (
                    <Select
                      value={mappingFormData.source_field}
                      onValueChange={(value) => setMappingFormData({ ...mappingFormData, source_field: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select fuel database field" />
                      </SelectTrigger>
                      <SelectContent>
                        {FUEL_DATABASE_FIELDS.map((field) => (
                          <SelectItem key={field.value} value={field.value}>
                            {field.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {mappingFormData.source_type === 'formula_parameter' && (
                    <Select
                      value={mappingFormData.source_field}
                      onValueChange={(value) => setMappingFormData({ ...mappingFormData, source_field: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select formula parameter" />
                      </SelectTrigger>
                      <SelectContent>
                        {parameters.map((param) => (
                          <SelectItem key={param.parameter_key} value={param.parameter_key}>
                            {param.parameter_name} {param.default_value ? `(Default: ${param.default_value})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {mappingFormData.source_type === 'constant' && (
                    <Input
                      type="number"
                      value={mappingFormData.default_value}
                      onChange={(e) => setMappingFormData({ ...mappingFormData, default_value: e.target.value, source_field: 'constant' })}
                      placeholder="Enter constant value"
                    />
                  )}
                </div>

                <div className="flex items-center gap-4 mt-4">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="required"
                      checked={mappingFormData.required}
                      onChange={(e) => setMappingFormData({ ...mappingFormData, required: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <Label htmlFor="required" className="cursor-pointer">Required</Label>
                  </div>
                  <Button onClick={addInputMapping} size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Mapping
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setMappingDialogOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Configuration</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{itemToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteConfiguration} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
