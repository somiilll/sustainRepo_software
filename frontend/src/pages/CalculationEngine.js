import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Play, Eye, Settings, Layers, Calculator, GitBranch, Gauge, ArrowRight, Check, X, RefreshCw, Database, Scale, HelpCircle, BookOpen, Info } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Parameter source types for mapping
const PARAMETER_SOURCE_TYPES = [
  { value: 'user_input', label: 'User Input', description: 'User enters value directly' },
  { value: 'fuel_database', label: 'Fuel Database', description: 'From fuel database based on selected fuel' },
  { value: 'gwp_config', label: 'GWP Config', description: 'From active GWP configuration' },
  { value: 'constant', label: 'Constant', description: 'Fixed value' },
  { value: 'derived', label: 'Derived', description: 'Calculated from other parameters' }
];

// Common fuel database fields for parameter mapping
const FUEL_DB_FIELDS = [
  { value: 'calorific_value', label: 'Calorific Value (NCV)' },
  { value: 'density', label: 'Density' },
  { value: 'emission_factor_co2', label: 'Emission Factor CO2 (kg CO2/TJ)' },
  { value: 'emission_factor_ch4', label: 'Emission Factor CH4 (kg CH4/TJ)' },
  { value: 'emission_factor_n2o', label: 'Emission Factor N2O (kg N2O/TJ)' },
  { value: 'emission_factor_basis_quantity', label: 'Emission Factor Basis Quantity' },
  { value: 'emission_factor_basis_unit', label: 'Emission Factor Basis Unit' },
  { value: 'gwp_fugitives', label: 'GWP (Fugitives)' },
  { value: 'conversion_factor', label: 'Conversion Factor' }
];

// Common GWP config fields
const GWP_CONFIG_FIELDS = [
  { value: 'ch4_fossil_gwp', label: 'CH4 Fossil GWP' },
  { value: 'ch4_non_fossil_gwp', label: 'CH4 Non-Fossil GWP' },
  { value: 'n2o_gwp', label: 'N2O GWP' },
  { value: 'co2_gwp', label: 'CO2 GWP' }
];

const SCOPES = [
  { value: 'scope1', label: 'Scope 1' },
  { value: 'scope2', label: 'Scope 2' },
  { value: 'biogenic', label: 'Biogenic' }
];

const OUTPUT_GASES = ['co2', 'ch4', 'n2o', 'co2e'];

// Conversion types
const CONVERSION_TYPES = [
  { value: 'multiply', label: 'Multiply', description: 'value × factor' },
  { value: 'divide', label: 'Divide', description: 'value ÷ factor' },
  { value: 'formula', label: 'Formula', description: 'Custom formula (e.g., value * density)' }
];

export default function CalculationEngine() {
  const { getAuthHeader } = useAuth();
  const [activeTab, setActiveTab] = useState('methods');
  const [loading, setLoading] = useState(true);
  
  // Data states
  const [methods, setMethods] = useState([]);
  const [rules, setRules] = useState([]);
  const [inputFields, setInputFields] = useState([]);
  const [inputTemplates, setInputTemplates] = useState([]);
  const [parameterValues, setParameterValues] = useState([]);
  const [emissionConfigs, setEmissionConfigs] = useState([]);
  const [unitConversions, setUnitConversions] = useState([]);
  const [availableUnits, setAvailableUnits] = useState([]);
  const [fuels, setFuels] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [gwpConfigs, setGwpConfigs] = useState([]);
  
  // Walkthrough state
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  
  // Dialog states
  const [methodDialogOpen, setMethodDialogOpen] = useState(false);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [conversionDialogOpen, setConversionDialogOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState(null);
  const [editingRule, setEditingRule] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [editingConversion, setEditingConversion] = useState(null);
  
  // Preview states
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewContext, setPreviewContext] = useState({ scope: 'scope1', category: '' });
  const [previewInputs, setPreviewInputs] = useState({});
  const [previewResult, setPreviewResult] = useState(null);
  
  // Fetch all data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const headers = getAuthHeader();
      
      const [methodsRes, rulesRes, fieldsRes, templatesRes, configsRes, conversionsRes, unitsRes, fuelsRes, sectorsRes, gwpRes] = await Promise.all([
        axios.get(`${API}/calc-engine/super-admin/methods`, { headers }),
        axios.get(`${API}/calc-engine/super-admin/rules`, { headers }),
        axios.get(`${API}/calc-engine/super-admin/input-fields`, { headers }),
        axios.get(`${API}/calc-engine/super-admin/input-templates`, { headers }),
        axios.get(`${API}/super-admin/emission-configurations`, { headers }),
        axios.get(`${API}/calc-engine/super-admin/unit-conversions`, { headers }),
        axios.get(`${API}/calc-engine/units`, { headers }),
        axios.get(`${API}/fuel-database`, { headers }),
        axios.get(`${API}/sectors`, { headers }),
        axios.get(`${API}/super-admin/gwp-configs`, { headers })
      ]);
      
      setMethods(methodsRes.data);
      setRules(rulesRes.data);
      setInputFields(fieldsRes.data);
      setInputTemplates(templatesRes.data);
      setEmissionConfigs(configsRes.data);
      setUnitConversions(conversionsRes.data);
      setAvailableUnits(unitsRes.data);
      setFuels(fuelsRes.data);
      setSectors(sectorsRes.data);
      setGwpConfigs(gwpRes.data);
    } catch (error) {
      console.error('Error fetching calculation engine data:', error);
      toast.error('Failed to load calculation engine data');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);
  
  // Get categories for a given scope from emission configurations
  const getCategoriesForScope = useCallback((scope) => {
    const categories = new Set();
    emissionConfigs.forEach(config => {
      if (config.scope === scope || !scope) {
        (config.categories || []).forEach(cat => categories.add(cat));
      }
    });
    return Array.from(categories).sort();
  }, [emissionConfigs]);
  
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  // Seed default methods
  const handleSeedDefaults = async () => {
    try {
      const response = await axios.post(
        `${API}/calc-engine/super-admin/seed-default-methods`,
        {},
        { headers: getAuthHeader() }
      );
      toast.success(response.data.message);
      fetchData();
    } catch (error) {
      toast.error('Failed to seed default methods');
    }
  };
  
  // ===== METHODS CRUD =====
  const handleSaveMethod = async (methodData) => {
    try {
      const headers = getAuthHeader();
      
      if (editingMethod?.id) {
        await axios.put(`${API}/calc-engine/super-admin/methods/${editingMethod.id}`, methodData, { headers });
        toast.success('Method updated successfully');
      } else {
        await axios.post(`${API}/calc-engine/super-admin/methods`, methodData, { headers });
        toast.success('Method created successfully');
      }
      
      setMethodDialogOpen(false);
      setEditingMethod(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save method');
    }
  };
  
  const handleDeleteMethod = async (methodId) => {
    if (!window.confirm('Are you sure you want to delete this method?')) return;
    
    try {
      await axios.delete(`${API}/calc-engine/super-admin/methods/${methodId}`, { headers: getAuthHeader() });
      toast.success('Method deleted');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete method');
    }
  };
  
  // ===== RULES CRUD =====
  const handleSaveRule = async (ruleData) => {
    try {
      const headers = getAuthHeader();
      
      if (editingRule?.id) {
        await axios.put(`${API}/calc-engine/super-admin/rules/${editingRule.id}`, ruleData, { headers });
        toast.success('Rule updated successfully');
      } else {
        await axios.post(`${API}/calc-engine/super-admin/rules`, ruleData, { headers });
        toast.success('Rule created successfully');
      }
      
      setRuleDialogOpen(false);
      setEditingRule(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save rule');
    }
  };
  
  const handleDeleteRule = async (ruleId) => {
    if (!window.confirm('Are you sure you want to delete this rule?')) return;
    
    try {
      await axios.delete(`${API}/calc-engine/super-admin/rules/${ruleId}`, { headers: getAuthHeader() });
      toast.success('Rule deleted');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete rule');
    }
  };
  
  // ===== INPUT FIELDS CRUD =====
  const handleSaveField = async (fieldData) => {
    try {
      const headers = getAuthHeader();
      
      if (editingField?.id) {
        await axios.put(`${API}/calc-engine/super-admin/input-fields/${editingField.id}`, fieldData, { headers });
        toast.success('Field updated successfully');
      } else {
        await axios.post(`${API}/calc-engine/super-admin/input-fields`, fieldData, { headers });
        toast.success('Field created successfully');
      }
      
      setFieldDialogOpen(false);
      setEditingField(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save field');
    }
  };
  
  const handleDeleteField = async (fieldId) => {
    if (!window.confirm('Are you sure you want to delete this field?')) return;
    
    try {
      await axios.delete(`${API}/calc-engine/super-admin/input-fields/${fieldId}`, { headers: getAuthHeader() });
      toast.success('Field deleted');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete field');
    }
  };
  
  // ===== UNIT CONVERSIONS CRUD =====
  const handleSaveConversion = async (conversionData) => {
    try {
      const headers = getAuthHeader();
      
      if (editingConversion?.id) {
        // Update not implemented in backend, so we delete and recreate
        await axios.delete(`${API}/calc-engine/super-admin/unit-conversions/${editingConversion.id}`, { headers });
        await axios.post(`${API}/calc-engine/super-admin/unit-conversions`, conversionData, { headers });
        toast.success('Conversion updated successfully');
      } else {
        await axios.post(`${API}/calc-engine/super-admin/unit-conversions`, conversionData, { headers });
        toast.success('Conversion created successfully');
      }
      
      setConversionDialogOpen(false);
      setEditingConversion(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save conversion');
    }
  };
  
  const handleDeleteConversion = async (conversionId) => {
    if (!window.confirm('Are you sure you want to delete this conversion?')) return;
    
    try {
      await axios.delete(`${API}/calc-engine/super-admin/unit-conversions/${conversionId}`, { headers: getAuthHeader() });
      toast.success('Conversion deleted');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete conversion');
    }
  };
  
  // ===== TEMPLATES CRUD =====
  const handleSaveTemplate = async (templateData) => {
    try {
      const headers = getAuthHeader();
      
      if (editingTemplate?.id) {
        await axios.put(`${API}/calc-engine/super-admin/input-templates/${editingTemplate.id}`, templateData, { headers });
        toast.success('Template updated successfully');
      } else {
        await axios.post(`${API}/calc-engine/super-admin/input-templates`, templateData, { headers });
        toast.success('Template created successfully');
      }
      
      setTemplateDialogOpen(false);
      setEditingTemplate(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save template');
    }
  };
  
  const handleDeleteTemplate = async (templateId) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    
    try {
      await axios.delete(`${API}/calc-engine/super-admin/input-templates/${templateId}`, { headers: getAuthHeader() });
      toast.success('Template deleted');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete template');
    }
  };
  
  // ===== PREVIEW CALCULATION =====
  const handlePreviewCalculation = async () => {
    try {
      const response = await axios.post(
        `${API}/calc-engine/preview`,
        {
          context: previewContext,
          inputs: previewInputs,
          overrides: {}
        },
        { headers: getAuthHeader() }
      );
      setPreviewResult(response.data);
    } catch (error) {
      toast.error('Preview failed');
    }
  };
  
  // ===== EXECUTE CALCULATION =====
  const handleExecuteCalculation = async () => {
    try {
      const response = await axios.post(
        `${API}/calc-engine/calculate`,
        {
          context: previewContext,
          inputs: previewInputs,
          overrides: {}
        },
        { headers: getAuthHeader() }
      );
      setPreviewResult(response.data);
      toast.success('Calculation executed successfully');
    } catch (error) {
      toast.error('Calculation failed');
    }
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }
  
  return (
    <div className="space-y-6" data-testid="calculation-engine-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Calculation Engine</h1>
          <p className="text-gray-500 mt-1">Configure calculation methods, rules, and parameters</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowWalkthrough(true)}
            data-testid="walkthrough-btn"
          >
            <BookOpen className="w-4 h-4 mr-2" />
            How It Works
          </Button>
          <Button
            variant="outline"
            onClick={() => setPreviewDialogOpen(true)}
            data-testid="preview-calculation-btn"
          >
            <Play className="w-4 h-4 mr-2" />
            Test Calculation
          </Button>
          <Button
            variant="outline"
            onClick={handleSeedDefaults}
            data-testid="seed-defaults-btn"
          >
            <Database className="w-4 h-4 mr-2" />
            Seed Defaults
          </Button>
        </div>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Methods</p>
                <p className="text-2xl font-bold">{methods.length}</p>
              </div>
              <Calculator className="w-8 h-8 text-teal-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Rules</p>
                <p className="text-2xl font-bold">{rules.length}</p>
              </div>
              <GitBranch className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Input Fields</p>
                <p className="text-2xl font-bold">{inputFields.length}</p>
              </div>
              <Layers className="w-8 h-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Templates</p>
                <p className="text-2xl font-bold">{inputTemplates.length}</p>
              </div>
              <Settings className="w-8 h-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Unit Conversions</p>
                <p className="text-2xl font-bold">{unitConversions.length}</p>
              </div>
              <Scale className="w-8 h-8 text-cyan-600" />
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="methods" data-testid="methods-tab">
            <Calculator className="w-4 h-4 mr-2" />
            Methods
          </TabsTrigger>
          <TabsTrigger value="rules" data-testid="rules-tab">
            <GitBranch className="w-4 h-4 mr-2" />
            Rules
          </TabsTrigger>
          <TabsTrigger value="fields" data-testid="fields-tab">
            <Layers className="w-4 h-4 mr-2" />
            Input Fields
          </TabsTrigger>
          <TabsTrigger value="templates" data-testid="templates-tab">
            <Settings className="w-4 h-4 mr-2" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="conversions" data-testid="conversions-tab">
            <Scale className="w-4 h-4 mr-2" />
            Unit Conversions
          </TabsTrigger>
        </TabsList>
        
        {/* Methods Tab */}
        <TabsContent value="methods" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Calculation Methods</h2>
            <Button
              onClick={() => { setEditingMethod(null); setMethodDialogOpen(true); }}
              data-testid="add-method-btn"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Method
            </Button>
          </div>
          
          <div className="grid gap-4">
            {methods.map((method) => (
              <Card key={method.id} data-testid={`method-card-${method.method_key}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-lg">{method.method_name}</CardTitle>
                      <Badge variant={method.is_active ? "success" : "secondary"}>
                        {method.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      {method.supports_gas_split && <Badge variant="outline">Gas Split</Badge>}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setEditingMethod(method); setMethodDialogOpen(true); }}
                        data-testid={`edit-method-${method.method_key}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteMethod(method.id)}
                        data-testid={`delete-method-${method.method_key}`}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  <CardDescription>{method.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="text-sm">
                      <span className="text-gray-500">Formula:</span>
                      <code className="ml-2 bg-gray-100 px-2 py-1 rounded text-xs">
                        {method.formula || 'Multi-step'}
                      </code>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Outputs:</span>
                        <span className="ml-2">{method.outputs?.join(', ') || 'co2e'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Rank:</span>
                        <span className="ml-2">{method.rank}</span>
                      </div>
                    </div>
                    {method.parameter_sources?.length > 0 && (
                      <div className="text-sm">
                        <span className="text-gray-500">Parameter Sources:</span>
                        <div className="mt-1 flex gap-1 flex-wrap">
                          {method.parameter_sources.map((ps, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {ps.parameter_key}: {ps.source_type}
                              {ps.fuel_db_field && ` (${ps.fuel_db_field})`}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      {method.applicable_scopes?.map((scope) => (
                        <Badge key={scope} variant="secondary">{scope}</Badge>
                      ))}
                      {method.applicable_categories?.map((cat) => (
                        <Badge key={cat} variant="outline">{cat}</Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            
            {methods.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-gray-500">
                  No calculation methods defined. Click "Seed Defaults" to create standard methods.
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
        
        {/* Rules Tab */}
        <TabsContent value="rules" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Calculation Rules</h2>
            <Button
              onClick={() => { setEditingRule(null); setRuleDialogOpen(true); }}
              data-testid="add-rule-btn"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Rule
            </Button>
          </div>
          
          <div className="space-y-3">
            {rules.map((rule, index) => (
              <Card key={rule.id} data-testid={`rule-card-${rule.rule_key}`}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant="outline">Priority: {rule.priority}</Badge>
                        <Badge variant={rule.is_active ? "success" : "secondary"}>
                          {rule.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{rule.rule_name}</span>
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                        <Badge>{rule.method_name || 'Unknown Method'}</Badge>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setEditingRule(rule); setRuleDialogOpen(true); }}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteRule(rule.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2 text-sm text-gray-500">
                    {rule.scope && <span>Scope: {rule.scope}</span>}
                    {rule.category && <span>| Category: {rule.category}</span>}
                    {rule.sub_category && <span>| Sub: {rule.sub_category}</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
            
            {rules.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-gray-500">
                  No calculation rules defined. Rules map contexts to methods.
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
        
        {/* Input Fields Tab */}
        <TabsContent value="fields" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Input Field Definitions</h2>
            <Button
              onClick={() => { setEditingField(null); setFieldDialogOpen(true); }}
              data-testid="add-field-btn"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Field
            </Button>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            {inputFields.map((field) => (
              <Card key={field.id} data-testid={`field-card-${field.field_key}`}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{field.field_name}</span>
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">{field.field_key}</code>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setEditingField(field); setFieldDialogOpen(true); }}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteField(field.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-sm text-gray-500">
                    <span>Type: {field.data_type}</span>
                    <span className="mx-2">|</span>
                    <span>{field.is_required ? 'Required' : 'Optional'}</span>
                  </div>
                  {field.standard_units?.length > 0 && (
                    <div className="mt-2">
                      <span className="text-xs text-gray-400 mr-2">Standard Units:</span>
                      <div className="inline-flex gap-1 flex-wrap">
                        {field.standard_units.map((unit) => (
                          <Badge key={unit} variant="outline" className="text-xs">{unit}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            
            {inputFields.length === 0 && (
              <Card className="col-span-2">
                <CardContent className="py-8 text-center text-gray-500">
                  No input fields defined. Fields define what data users can enter.
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
        
        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Input Templates</h2>
            <Button 
              onClick={() => { setEditingTemplate(null); setTemplateDialogOpen(true); }}
              data-testid="add-template-btn"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Template
            </Button>
          </div>
          
          <div className="grid gap-4">
            {inputTemplates.map((template) => (
              <Card key={template.id} data-testid={`template-card-${template.template_key}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{template.template_name}</CardTitle>
                      <CardDescription>{template.description}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setEditingTemplate(template); setTemplateDialogOpen(true); }}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteTemplate(template.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex gap-2 flex-wrap">
                      {template.applicable_scopes?.map((scope) => (
                        <Badge key={scope} variant="secondary">{scope}</Badge>
                      ))}
                    </div>
                    <div className="text-sm text-gray-500">
                      <span className="font-medium">Fields: </span>
                      {template.field_keys?.length > 0 
                        ? template.field_keys.join(', ') 
                        : 'No fields assigned'}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            
            {inputTemplates.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-gray-500">
                  No input templates defined. Templates group fields for specific emission types.
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
        
        {/* Unit Conversions Tab */}
        <TabsContent value="conversions" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold">Unit Conversions</h2>
              <p className="text-sm text-gray-500">Define how to convert between units (e.g., liters to kg using density)</p>
            </div>
            <Button
              onClick={() => { setEditingConversion(null); setConversionDialogOpen(true); }}
              data-testid="add-conversion-btn"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Conversion
            </Button>
          </div>
          
          <div className="grid gap-4">
            {unitConversions.map((conversion) => (
              <Card key={conversion.id} data-testid={`conversion-card-${conversion.from_unit}-${conversion.to_unit}`}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-sm font-mono">{conversion.from_unit}</Badge>
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                        <Badge variant="secondary" className="text-sm font-mono">{conversion.to_unit}</Badge>
                      </div>
                      <Badge variant={conversion.is_active ? "success" : "outline"}>
                        {conversion.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setEditingConversion(conversion); setConversionDialogOpen(true); }}
                        data-testid={`edit-conversion-${conversion.from_unit}-${conversion.to_unit}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteConversion(conversion.id)}
                        data-testid={`delete-conversion-${conversion.from_unit}-${conversion.to_unit}`}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Type:</span>
                      <span className="ml-2 capitalize">{conversion.conversion_type}</span>
                    </div>
                    {conversion.conversion_type !== 'formula' && conversion.factor && (
                      <div>
                        <span className="text-gray-500">Factor:</span>
                        <span className="ml-2 font-mono">{conversion.factor}</span>
                      </div>
                    )}
                    {conversion.conversion_type === 'formula' && conversion.formula && (
                      <div className="col-span-2">
                        <span className="text-gray-500">Formula:</span>
                        <code className="ml-2 bg-gray-100 px-2 py-1 rounded text-xs">{conversion.formula}</code>
                      </div>
                    )}
                    {conversion.requires_parameter && (
                      <div className="col-span-2">
                        <span className="text-gray-500">Requires:</span>
                        <Badge variant="outline" className="ml-2 text-xs">{conversion.requires_parameter}</Badge>
                        <span className="ml-2 text-xs text-gray-400">
                          from {conversion.parameter_source === 'fuel_database' 
                            ? `Fuel DB (${conversion.parameter_source_field || 'auto'})` 
                            : conversion.parameter_source || 'fuel_database'}
                          {conversion.allow_parameter_override && ' • overridable'}
                        </span>
                      </div>
                    )}
                  </div>
                  {conversion.conversion_type === 'multiply' && conversion.factor && (
                    <div className="mt-2 text-xs text-gray-400">
                      Example: 1 {conversion.from_unit} = {conversion.factor} {conversion.to_unit}
                    </div>
                  )}
                  {conversion.conversion_type === 'divide' && conversion.factor && (
                    <div className="mt-2 text-xs text-gray-400">
                      Example: 1 {conversion.from_unit} = {(1 / conversion.factor).toFixed(4)} {conversion.to_unit}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            
            {unitConversions.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-gray-500">
                  <Scale className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p>No unit conversions defined.</p>
                  <p className="text-sm mt-1">Create conversions for volume to mass (using density), or between different unit systems.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
      
      {/* Method Dialog */}
      <MethodDialog
        open={methodDialogOpen}
        onOpenChange={setMethodDialogOpen}
        method={editingMethod}
        onSave={handleSaveMethod}
        inputFields={inputFields}
      />
      
      {/* Rule Dialog */}
      <RuleDialog
        open={ruleDialogOpen}
        onOpenChange={setRuleDialogOpen}
        rule={editingRule}
        methods={methods}
        getCategoriesForScope={getCategoriesForScope}
        onSave={handleSaveRule}
      />
      
      {/* Field Dialog */}
      <FieldDialog
        open={fieldDialogOpen}
        onOpenChange={setFieldDialogOpen}
        field={editingField}
        onSave={handleSaveField}
        availableUnits={availableUnits}
      />
      
      {/* Template Dialog */}
      <TemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        template={editingTemplate}
        inputFields={inputFields}
        getCategoriesForScope={getCategoriesForScope}
        onSave={handleSaveTemplate}
      />
      
      {/* Conversion Dialog */}
      <ConversionDialog
        open={conversionDialogOpen}
        onOpenChange={setConversionDialogOpen}
        conversion={editingConversion}
        onSave={handleSaveConversion}
        availableUnits={availableUnits}
      />
      
      {/* Walkthrough Dialog */}
      <WalkthroughDialog
        open={showWalkthrough}
        onOpenChange={setShowWalkthrough}
      />
      
      {/* Preview Dialog */}
      <PreviewDialog
        open={previewDialogOpen}
        onOpenChange={setPreviewDialogOpen}
        context={previewContext}
        setContext={setPreviewContext}
        inputs={previewInputs}
        setInputs={setPreviewInputs}
        result={previewResult}
        onPreview={handlePreviewCalculation}
        onExecute={handleExecuteCalculation}
        fuels={fuels}
        sectors={sectors}
        gwpConfigs={gwpConfigs}
        availableUnits={availableUnits}
        emissionConfigs={emissionConfigs}
      />
    </div>
  );
}

// ===== METHOD DIALOG =====
function MethodDialog({ open, onOpenChange, method, onSave, inputFields = [] }) {
  const [formData, setFormData] = useState({
    method_key: '',
    method_name: '',
    method_type: 'factor_based',
    description: '',
    required_parameters: [],
    optional_parameters: [],
    formula: '',
    outputs: ['co2e'],
    output_unit: 'kg',
    supports_gas_split: false,
    applicable_scopes: [],
    applicable_categories: [],
    rank: 100,
    is_active: true
  });
  
  const [paramInput, setParamInput] = useState('');
  const [optParamInput, setOptParamInput] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [formulaWarnings, setFormulaWarnings] = useState([]);
  
  // Extract parameters from formula
  const extractFormulaParams = useCallback((formula) => {
    if (!formula) return [];
    // Match variable names (words that are not numbers, operators, or keywords)
    const cleanFormula = formula
      .replace(/\{[^}]*:/g, '') // Remove {co2:, ch4:, etc.
      .replace(/}/g, '')
      .replace(/[×÷]/g, '*');
    
    const matches = cleanFormula.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
    const keywords = ['abs', 'round', 'min', 'max', 'pow', 'sqrt', 'log', 'log10', 'exp', 'co2', 'ch4', 'n2o', 'co2e'];
    return [...new Set(matches.filter(m => !keywords.includes(m.toLowerCase())))];
  }, []);
  
  // Validate formula parameters
  const validateFormulaParams = useCallback(() => {
    const formulaParams = extractFormulaParams(formData.formula);
    const allDefinedParams = [...formData.required_parameters, ...formData.optional_parameters];
    
    const warnings = [];
    formulaParams.forEach(param => {
      if (!allDefinedParams.includes(param)) {
        warnings.push(`Parameter "${param}" in formula is not defined as required or optional`);
      }
    });
    
    setFormulaWarnings(warnings);
    return warnings;
  }, [formData.formula, formData.required_parameters, formData.optional_parameters, extractFormulaParams]);
  
  useEffect(() => {
    if (formData.formula) {
      validateFormulaParams();
    }
  }, [formData.formula, formData.required_parameters, formData.optional_parameters, validateFormulaParams]);
  
  useEffect(() => {
    if (method) {
      setFormData({
        ...method,
        required_parameters: method.required_parameters || [],
        optional_parameters: method.optional_parameters || [],
        parameter_sources: method.parameter_sources || [],
        steps: method.steps || [],
        outputs: method.outputs || ['co2e'],
        applicable_scopes: method.applicable_scopes || [],
        applicable_categories: method.applicable_categories || []
      });
      // Set useSteps based on whether method has steps defined
      setUseSteps(method.steps && method.steps.length > 0);
    } else {
      setFormData({
        method_key: '',
        method_name: '',
        description: '',
        required_parameters: [],
        optional_parameters: [],
        parameter_sources: [],
        formula: '',
        steps: [],
        outputs: ['co2e'],
        output_unit: 'kg',
        supports_gas_split: false,
        applicable_scopes: [],
        applicable_categories: [],
        rank: 100,
        is_active: true
      });
      setFormulaWarnings([]);
      setUseSteps(false);
    }
  }, [method, open]);
  
  // Track if using step-based formulas
  const [useSteps, setUseSteps] = useState(false);
  
  // Add a new step
  const addStep = () => {
    const newOrder = formData.steps.length + 1;
    setFormData({
      ...formData,
      steps: [...formData.steps, {
        step_order: newOrder,
        output_key: '',
        formula: '',
        description: ''
      }]
    });
  };
  
  // Update a step
  const updateStep = (index, field, value) => {
    const newSteps = [...formData.steps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setFormData({ ...formData, steps: newSteps });
  };
  
  // Remove a step
  const removeStep = (index) => {
    const newSteps = formData.steps.filter((_, i) => i !== index);
    // Re-order remaining steps
    newSteps.forEach((step, i) => step.step_order = i + 1);
    setFormData({ ...formData, steps: newSteps });
  };
  
  // Auto-add formula parameters to required if missing and create default parameter sources
  const autoAddMissingParams = () => {
    // Get params from either formula or steps
    let formulaParams = [];
    if (useSteps && formData.steps.length > 0) {
      formData.steps.forEach(step => {
        formulaParams = [...formulaParams, ...extractFormulaParams(step.formula || '')];
      });
      formulaParams = [...new Set(formulaParams)]; // Dedupe
    } else {
      formulaParams = extractFormulaParams(formData.formula);
    }
    
    const allDefinedParams = [...formData.required_parameters, ...formData.optional_parameters];
    const missingParams = formulaParams.filter(p => !allDefinedParams.includes(p));
    
    if (missingParams.length > 0) {
      // Also create default parameter sources
      const existingSourceKeys = formData.parameter_sources.map(ps => ps.parameter_key);
      const newSources = missingParams
        .filter(p => !existingSourceKeys.includes(p))
        .map(p => ({
          parameter_key: p,
          source_type: p === 'quantity' || p === 'consumption' ? 'user_input' : 
                       p.startsWith('gwp_') ? 'gwp_config' : 'fuel_database',
          fuel_db_field: getFuelDbFieldForParam(p),
          allow_override: !p.startsWith('gwp_')
        }));
      
      setFormData({
        ...formData,
        required_parameters: [...formData.required_parameters, ...missingParams],
        parameter_sources: [...formData.parameter_sources, ...newSources]
      });
    }
  };
  
  // Helper to suggest fuel database field for common parameters
  const getFuelDbFieldForParam = (param) => {
    const mapping = {
      'ncv': 'calorific_value',
      'cv': 'calorific_value',
      'density': 'density',
      'ef_co2': 'emission_factor_co2',
      'ef_ch4': 'emission_factor_ch4',
      'ef_n2o': 'emission_factor_n2o',
      'gwp': 'gwp_fugitives'
    };
    return mapping[param] || '';
  };
  
  // Update parameter source
  const updateParameterSource = (paramKey, field, value) => {
    const sources = [...formData.parameter_sources];
    const idx = sources.findIndex(ps => ps.parameter_key === paramKey);
    if (idx >= 0) {
      sources[idx] = { ...sources[idx], [field]: value };
    } else {
      sources.push({ parameter_key: paramKey, [field]: value });
    }
    setFormData({ ...formData, parameter_sources: sources });
  };
  
  // Get parameter source config
  const getParameterSource = (paramKey) => {
    return formData.parameter_sources.find(ps => ps.parameter_key === paramKey) || {
      parameter_key: paramKey,
      source_type: '',
      fuel_db_field: '',
      gwp_field: '',
      constant_value: null,
      default_value: null,
      derived_formula: '',
      allow_override: true
    };
  };
  
  const handleSave = () => {
    const warnings = validateFormulaParams();
    if (warnings.length > 0) {
      toast.error('Please add all formula parameters to required or optional parameters');
      return;
    }
    onSave(formData);
  };
  
  const addRequiredParam = () => {
    if (paramInput && !formData.required_parameters.includes(paramInput)) {
      setFormData({...formData, required_parameters: [...formData.required_parameters, paramInput]});
      setParamInput('');
    }
  };
  
  const addOptionalParam = () => {
    if (optParamInput && !formData.optional_parameters.includes(optParamInput)) {
      setFormData({...formData, optional_parameters: [...formData.optional_parameters, optParamInput]});
      setOptParamInput('');
    }
  };
  
  const addCategory = () => {
    if (categoryInput && !formData.applicable_categories.includes(categoryInput)) {
      setFormData({...formData, applicable_categories: [...formData.applicable_categories, categoryInput]});
      setCategoryInput('');
    }
  };
  
  const toggleScope = (scope) => {
    const scopes = formData.applicable_scopes.includes(scope)
      ? formData.applicable_scopes.filter(s => s !== scope)
      : [...formData.applicable_scopes, scope];
    setFormData({...formData, applicable_scopes: scopes});
  };
  
  const toggleOutput = (output) => {
    const outputs = formData.outputs.includes(output)
      ? formData.outputs.filter(o => o !== output)
      : [...formData.outputs, output];
    setFormData({...formData, outputs: outputs});
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{method ? 'Edit Method' : 'Create Method'}</DialogTitle>
          <DialogDescription>
            Define a calculation method with formula and parameters
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Method Key *</Label>
              <Input
                value={formData.method_key}
                onChange={(e) => setFormData({...formData, method_key: e.target.value})}
                placeholder="e.g., stationary_combustion"
                data-testid="method-key-input"
              />
            </div>
            <div className="space-y-2">
              <Label>Method Name *</Label>
              <Input
                value={formData.method_name}
                onChange={(e) => setFormData({...formData, method_name: e.target.value})}
                placeholder="e.g., Stationary Combustion"
                data-testid="method-name-input"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Rank (Lower = Higher Priority)</Label>
            <Input
              type="number"
              value={formData.rank}
              onChange={(e) => setFormData({...formData, rank: parseInt(e.target.value) || 100})}
              data-testid="method-rank-input"
              className="w-32"
            />
          </div>
          
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="Describe what this method calculates..."
            />
          </div>
          
          {/* Formula Type Toggle */}
          <div className="space-y-4 border rounded-lg p-4 bg-gray-50">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Calculation Formula</Label>
              <div className="flex items-center gap-2">
                <span className={`text-sm ${!useSteps ? 'font-medium' : 'text-gray-500'}`}>Single Formula</span>
                <Switch
                  checked={useSteps}
                  onCheckedChange={(checked) => {
                    setUseSteps(checked);
                    if (checked && formData.steps.length === 0) {
                      // Add default steps for gas split
                      setFormData({
                        ...formData,
                        formula: null,
                        steps: [
                          { step_order: 1, output_key: 'co2', formula: '', description: 'Calculate CO2' },
                          { step_order: 2, output_key: 'ch4', formula: '', description: 'Calculate CH4' },
                          { step_order: 3, output_key: 'n2o', formula: '', description: 'Calculate N2O' },
                          { step_order: 4, output_key: 'co2e', formula: 'co2 * gwp_co2 + ch4 * gwp_ch4 + n2o * gwp_n2o', description: 'Calculate CO2e using GWP' }
                        ]
                      });
                    } else if (!checked) {
                      setFormData({ ...formData, steps: [] });
                    }
                  }}
                />
                <span className={`text-sm ${useSteps ? 'font-medium' : 'text-gray-500'}`}>Step-Based</span>
              </div>
            </div>
            
            {!useSteps ? (
              /* Single Formula Input */
              <div className="space-y-2">
                <Textarea
                  value={formData.formula || ''}
                  onChange={(e) => setFormData({...formData, formula: e.target.value})}
                  placeholder="e.g., quantity * ncv * ef_co2 / 1000000"
                  className="font-mono"
                  data-testid="method-formula-input"
                />
                <div className="text-xs text-gray-500 space-y-1">
                  <p>For multi-output: <code className="bg-gray-100 px-1">{'{co2: qty * ncv * ef_co2, ch4: qty * ncv * ef_ch4}'}</code></p>
                </div>
              </div>
            ) : (
              /* Step-Based Formula Input */
              <div className="space-y-3">
                <p className="text-xs text-gray-500">
                  Define calculation steps in order. Each step's output can be used in subsequent steps.
                </p>
                
                {formData.steps.map((step, index) => (
                  <div key={index} className="flex items-start gap-2 p-3 bg-white rounded border">
                    <div className="w-8 h-8 bg-teal-100 text-teal-700 rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                      {step.step_order}
                    </div>
                    <div className="flex-1 grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">Output Variable</Label>
                        <Input
                          value={step.output_key}
                          onChange={(e) => updateStep(index, 'output_key', e.target.value)}
                          placeholder="co2"
                          className="font-mono text-sm"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Formula</Label>
                        <Input
                          value={step.formula}
                          onChange={(e) => updateStep(index, 'formula', e.target.value)}
                          placeholder="quantity * ncv * ef_co2 / 1000"
                          className="font-mono text-sm"
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeStep(index)}
                      className="shrink-0 text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addStep}
                  className="w-full"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Step
                </Button>
                
                <div className="p-2 bg-teal-50 rounded text-xs text-teal-700">
                  <strong>Tip:</strong> For CO2e, use: <code className="bg-teal-100 px-1">co2 * gwp_co2 + ch4 * gwp_ch4 + n2o * gwp_n2o</code>
                </div>
              </div>
            )}
            
            {formulaWarnings.length > 0 && (
              <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-amber-700">
                    <p className="font-medium">Missing Parameters:</p>
                    <ul className="list-disc ml-4 mt-1">
                      {formulaWarnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={autoAddMissingParams}
                    className="ml-4 shrink-0"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Auto-Add
                  </Button>
                </div>
              </div>
            )}
          </div>
          
          <div className="space-y-2">
            <Label>Required Parameters</Label>
            <div className="flex gap-2">
              <Input
                value={paramInput}
                onChange={(e) => setParamInput(e.target.value)}
                placeholder="e.g., quantity"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRequiredParam())}
              />
              <Button type="button" variant="outline" onClick={addRequiredParam}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {formData.required_parameters.map((param) => (
                <Badge key={param} variant="secondary" className="gap-1">
                  {param}
                  <X
                    className="w-3 h-3 cursor-pointer"
                    onClick={() => setFormData({
                      ...formData,
                      required_parameters: formData.required_parameters.filter(p => p !== param)
                    })}
                  />
                </Badge>
              ))}
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Optional Parameters</Label>
            <div className="flex gap-2">
              <Input
                value={optParamInput}
                onChange={(e) => setOptParamInput(e.target.value)}
                placeholder="e.g., density"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addOptionalParam())}
              />
              <Button type="button" variant="outline" onClick={addOptionalParam}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {formData.optional_parameters.map((param) => (
                <Badge key={param} variant="outline" className="gap-1">
                  {param}
                  <X
                    className="w-3 h-3 cursor-pointer"
                    onClick={() => setFormData({
                      ...formData,
                      optional_parameters: formData.optional_parameters.filter(p => p !== param)
                    })}
                  />
                </Badge>
              ))}
            </div>
          </div>
          
          {/* Parameter Sources Configuration */}
          {(formData.required_parameters.length > 0 || formData.optional_parameters.length > 0) && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Parameter Sources</Label>
                <Info className="w-4 h-4 text-gray-400" />
              </div>
              <p className="text-xs text-gray-500">Define where each parameter value comes from and configure defaults</p>
              <div className="border rounded-md divide-y max-h-96 overflow-y-auto">
                {[...formData.required_parameters, ...formData.optional_parameters].map((param) => {
                  const source = getParameterSource(param);
                  const isRequired = formData.required_parameters.includes(param);
                  return (
                    <div key={param} className="p-3 space-y-3 bg-gray-50/50">
                      {/* Parameter header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{param}</span>
                          <Badge variant={isRequired ? "default" : "outline"} className="text-xs">
                            {isRequired ? 'Required' : 'Optional'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={source.allow_override !== false}
                            onCheckedChange={(checked) => updateParameterSource(param, 'allow_override', checked)}
                            className="scale-75"
                          />
                          <span className="text-xs text-gray-500">Allow Override</span>
                        </div>
                      </div>
                      
                      {/* Source configuration */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-gray-500">Source</Label>
                          <Select
                            value={source.source_type || "fuel_database"}
                            onValueChange={(value) => updateParameterSource(param, 'source_type', value)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Source" />
                            </SelectTrigger>
                            <SelectContent>
                              {PARAMETER_SOURCE_TYPES.map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                  <span>{type.label}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {source.source_type === 'fuel_database' && (
                          <div className="space-y-1">
                            <Label className="text-xs text-gray-500">Fuel Database Field</Label>
                            <Select
                              value={source.fuel_db_field || ""}
                              onValueChange={(value) => updateParameterSource(param, 'fuel_db_field', value)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select field" />
                              </SelectTrigger>
                              <SelectContent>
                                {FUEL_DB_FIELDS.map((field) => (
                                  <SelectItem key={field.value} value={field.value}>{field.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        
                        {source.source_type === 'gwp_config' && (
                          <div className="space-y-1">
                            <Label className="text-xs text-gray-500">GWP Config Field</Label>
                            <Select
                              value={source.gwp_field || ""}
                              onValueChange={(value) => updateParameterSource(param, 'gwp_field', value)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select field" />
                              </SelectTrigger>
                              <SelectContent>
                                {GWP_CONFIG_FIELDS.map((field) => (
                                  <SelectItem key={field.value} value={field.value}>{field.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        
                        {source.source_type === 'constant' && (
                          <div className="space-y-1">
                            <Label className="text-xs text-gray-500">Constant Value</Label>
                            <Input
                              type="number"
                              step="any"
                              value={source.constant_value ?? ''}
                              onChange={(e) => updateParameterSource(param, 'constant_value', e.target.value ? parseFloat(e.target.value) : null)}
                              placeholder="Enter value"
                              className="h-8 text-xs"
                            />
                          </div>
                        )}
                        
                        {source.source_type === 'user_input' && (
                          <div className="space-y-1">
                            <Label className="text-xs text-gray-500">Input Field</Label>
                            <div className="h-8 flex items-center text-xs text-gray-400 bg-gray-100 px-2 rounded">
                              User enters value directly
                            </div>
                          </div>
                        )}
                        
                        {source.source_type === 'derived' && (
                          <div className="space-y-1">
                            <Label className="text-xs text-gray-500">Derived Formula</Label>
                            <Input
                              value={source.derived_formula || ''}
                              onChange={(e) => updateParameterSource(param, 'derived_formula', e.target.value)}
                              placeholder="e.g., quantity * density"
                              className="h-8 text-xs font-mono"
                            />
                          </div>
                        )}
                      </div>
                      
                      {/* Default value row - shown for fuel_database and gwp_config */}
                      {(source.source_type === 'fuel_database' || source.source_type === 'gwp_config') && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-gray-500">Default Value (fallback)</Label>
                            <Input
                              type="number"
                              step="any"
                              value={source.default_value ?? ''}
                              onChange={(e) => updateParameterSource(param, 'default_value', e.target.value ? parseFloat(e.target.value) : null)}
                              placeholder="Used if not found in database"
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="flex items-end pb-1">
                            <p className="text-xs text-gray-400">
                              Used when value not found in {source.source_type === 'fuel_database' ? 'fuel database' : 'GWP config'}
                            </p>
                          </div>
                        </div>
                      )}
                      
                      {/* Input Field Mapping - shown when override is allowed and source is not user_input */}
                      {source.allow_override !== false && source.source_type !== 'user_input' && inputFields.length > 0 && (
                        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-dashed">
                          <div className="space-y-1">
                            <Label className="text-xs text-gray-500">Map to Input Field (for override)</Label>
                            <Select
                              value={source.input_field_key || "__none__"}
                              onValueChange={(value) => updateParameterSource(param, 'input_field_key', value === "__none__" ? null : value)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select input field" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">None (use parameter key)</SelectItem>
                                {inputFields.map((field) => (
                                  <SelectItem key={field.id} value={field.field_key}>
                                    {field.field_name} ({field.field_key})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-end pb-1">
                            <p className="text-xs text-gray-400">
                              Maps frontend input field to this parameter for overrides
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Outputs</Label>
              <div className="flex gap-2 flex-wrap">
                {OUTPUT_GASES.map((gas) => (
                  <Badge
                    key={gas}
                    variant={formData.outputs.includes(gas) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleOutput(gas)}
                  >
                    {gas.toUpperCase()}
                    {formData.outputs.includes(gas) && <Check className="w-3 h-3 ml-1" />}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Output Unit</Label>
              <Input
                value={formData.output_unit}
                onChange={(e) => setFormData({...formData, output_unit: e.target.value})}
                placeholder="e.g., kg, tonne, tCO2e"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Applicable Scopes</Label>
            <div className="flex gap-2">
              {SCOPES.map((scope) => (
                <Badge
                  key={scope.value}
                  variant={formData.applicable_scopes.includes(scope.value) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleScope(scope.value)}
                >
                  {scope.label}
                  {formData.applicable_scopes.includes(scope.value) && <Check className="w-3 h-3 ml-1" />}
                </Badge>
              ))}
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Applicable Categories</Label>
            <div className="flex gap-2">
              <Input
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
                placeholder="e.g., Stationary Combustion"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCategory())}
              />
              <Button type="button" variant="outline" onClick={addCategory}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {formData.applicable_categories.map((cat) => (
                <Badge key={cat} variant="secondary" className="gap-1">
                  {cat}
                  <X
                    className="w-3 h-3 cursor-pointer"
                    onClick={() => setFormData({
                      ...formData,
                      applicable_categories: formData.applicable_categories.filter(c => c !== cat)
                    })}
                  />
                </Badge>
              ))}
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.supports_gas_split}
                onCheckedChange={(checked) => setFormData({...formData, supports_gas_split: checked})}
              />
              <Label>Supports Gas Split (CO2, CH4, N2O)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({...formData, is_active: checked})}
              />
              <Label>Active</Label>
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} data-testid="save-method-btn" disabled={formulaWarnings.length > 0}>
            {method ? 'Update' : 'Create'} Method
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== RULE DIALOG =====
function RuleDialog({ open, onOpenChange, rule, methods, getCategoriesForScope, onSave }) {
  const [formData, setFormData] = useState({
    rule_key: '',
    rule_name: '',
    description: '',
    scope: '',
    category: '',
    sub_category: '',
    industry: '',
    method_id: '',
    priority: 100,
    is_active: true,
    conditions: {}
  });
  
  const [availableCategories, setAvailableCategories] = useState([]);
  
  useEffect(() => {
    if (rule) {
      setFormData({
        ...rule,
        conditions: rule.conditions || {}
      });
    } else {
      setFormData({
        rule_key: '',
        rule_name: '',
        description: '',
        scope: '',
        category: '',
        sub_category: '',
        industry: '',
        method_id: '',
        priority: 100,
        is_active: true,
        conditions: {}
      });
    }
  }, [rule, open]);
  
  // Update available categories when scope changes
  useEffect(() => {
    if (getCategoriesForScope && formData.scope) {
      setAvailableCategories(getCategoriesForScope(formData.scope));
    } else {
      setAvailableCategories([]);
    }
  }, [formData.scope, getCategoriesForScope]);
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{rule ? 'Edit Rule' : 'Create Rule'}</DialogTitle>
          <DialogDescription>
            Define when to use a specific calculation method
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Rule Key *</Label>
              <Input
                value={formData.rule_key}
                onChange={(e) => setFormData({...formData, rule_key: e.target.value})}
                placeholder="e.g., scope1_combustion"
              />
            </div>
            <div className="space-y-2">
              <Label>Rule Name *</Label>
              <Input
                value={formData.rule_name}
                onChange={(e) => setFormData({...formData, rule_name: e.target.value})}
                placeholder="e.g., Scope 1 Combustion"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="When does this rule apply?"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select
                value={formData.scope || "any"}
                onValueChange={(value) => setFormData({...formData, scope: value === "any" ? "" : value, category: ""})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any Scope</SelectItem>
                  {SCOPES.map((scope) => (
                    <SelectItem key={scope.value} value={scope.value}>{scope.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              {availableCategories.length > 0 ? (
                <Select
                  value={formData.category || "any"}
                  onValueChange={(value) => setFormData({...formData, category: value === "any" ? "" : value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any Category</SelectItem>
                    {availableCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value})}
                  placeholder={formData.scope ? "No categories defined for this scope" : "Select a scope first"}
                  disabled={!formData.scope}
                />
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Sub-Category</Label>
              <Input
                value={formData.sub_category}
                onChange={(e) => setFormData({...formData, sub_category: e.target.value})}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label>Industry</Label>
              <Input
                value={formData.industry}
                onChange={(e) => setFormData({...formData, industry: e.target.value})}
                placeholder="Optional"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Method *</Label>
            <Select
              value={formData.method_id}
              onValueChange={(value) => setFormData({...formData, method_id: value})}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select method to use" />
              </SelectTrigger>
              <SelectContent>
                {methods.map((method) => (
                  <SelectItem key={method.id} value={method.id}>
                    {method.method_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Priority (Lower = Evaluated First)</Label>
              <Input
                type="number"
                value={formData.priority}
                onChange={(e) => setFormData({...formData, priority: parseInt(e.target.value) || 100})}
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({...formData, is_active: checked})}
              />
              <Label>Active</Label>
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSave(formData)}>
            {rule ? 'Update' : 'Create'} Rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== FIELD DIALOG =====
function FieldDialog({ open, onOpenChange, field, onSave, availableUnits = [] }) {
  const [formData, setFormData] = useState({
    field_key: '',
    field_name: '',
    description: '',
    data_type: 'number',
    is_required: true,
    validation_min: null,
    validation_max: null,
    display_order: 0,
    applicable_scopes: [],
    applicable_categories: [],
    standard_units: []
  });
  
  const [standardUnitInput, setStandardUnitInput] = useState('');
  
  useEffect(() => {
    if (field) {
      setFormData({
        ...field,
        applicable_scopes: field.applicable_scopes || [],
        applicable_categories: field.applicable_categories || [],
        standard_units: field.standard_units || []
      });
    } else {
      setFormData({
        field_key: '',
        field_name: '',
        description: '',
        data_type: 'number',
        is_required: true,
        validation_min: null,
        validation_max: null,
        display_order: 0,
        applicable_scopes: [],
        applicable_categories: [],
        standard_units: []
      });
    }
  }, [field, open]);
  
  const addStandardUnit = (unitSymbol) => {
    if (unitSymbol && !formData.standard_units.includes(unitSymbol)) {
      setFormData({
        ...formData,
        standard_units: [...formData.standard_units, unitSymbol]
      });
    }
    setStandardUnitInput('');
  };
  
  const removeStandardUnit = (unitSymbol) => {
    setFormData({
      ...formData,
      standard_units: formData.standard_units.filter(u => u !== unitSymbol)
    });
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{field ? 'Edit Field' : 'Create Field'}</DialogTitle>
          <DialogDescription>
            Define an input field for emission calculations
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Field Key *</Label>
              <Input
                value={formData.field_key}
                onChange={(e) => setFormData({...formData, field_key: e.target.value})}
                placeholder="e.g., quantity"
              />
            </div>
            <div className="space-y-2">
              <Label>Field Name *</Label>
              <Input
                value={formData.field_name}
                onChange={(e) => setFormData({...formData, field_name: e.target.value})}
                placeholder="e.g., Quantity"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="Help text for users"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data Type</Label>
              <Select
                value={formData.data_type}
                onValueChange={(value) => setFormData({...formData, data_type: value})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="select">Select</SelectItem>
                  <SelectItem value="percentage">Percentage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch
                checked={formData.is_required}
                onCheckedChange={(checked) => setFormData({...formData, is_required: checked})}
              />
              <Label>Required Field</Label>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Min Value</Label>
              <Input
                type="number"
                value={formData.validation_min ?? ''}
                onChange={(e) => setFormData({...formData, validation_min: e.target.value ? parseFloat(e.target.value) : null})}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label>Max Value</Label>
              <Input
                type="number"
                value={formData.validation_max ?? ''}
                onChange={(e) => setFormData({...formData, validation_max: e.target.value ? parseFloat(e.target.value) : null})}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label>Display Order</Label>
              <Input
                type="number"
                value={formData.display_order}
                onChange={(e) => setFormData({...formData, display_order: parseInt(e.target.value) || 0})}
              />
            </div>
          </div>
          
          {/* Standard Units Section */}
          {formData.data_type === 'number' && (
            <div className="space-y-3 border rounded-lg p-4 bg-gray-50">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-teal-600" />
                <Label className="text-base font-medium">Standard Units</Label>
              </div>
              <p className="text-xs text-gray-500">
                Define acceptable units for this field. If user input is in a different unit, conversion will be attempted automatically.
              </p>
              
              <div className="flex gap-2">
                <Select
                  value={standardUnitInput}
                  onValueChange={(value) => addStandardUnit(value)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Add standard unit..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableUnits
                      .filter(u => !formData.standard_units.includes(u.symbol))
                      .map((unit) => (
                        <SelectItem key={unit.id} value={unit.symbol}>
                          {unit.symbol} - {unit.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              
              {formData.standard_units.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.standard_units.map((unit) => (
                    <Badge 
                      key={unit} 
                      variant="secondary"
                      className="flex items-center gap-1 cursor-pointer hover:bg-red-100"
                      onClick={() => removeStandardUnit(unit)}
                    >
                      {unit}
                      <X className="w-3 h-3" />
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSave(formData)}>
            {field ? 'Update' : 'Create'} Field
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== TEMPLATE DIALOG =====
function TemplateDialog({ open, onOpenChange, template, inputFields, getCategoriesForScope, onSave }) {
  const [formData, setFormData] = useState({
    template_key: '',
    template_name: '',
    description: '',
    field_keys: [],
    applicable_scopes: [],
    applicable_categories: [],
    is_active: true,
    display_order: 0
  });
  
  const [availableCategories, setAvailableCategories] = useState([]);
  
  useEffect(() => {
    if (template) {
      setFormData({
        ...template,
        field_keys: template.field_keys || [],
        applicable_scopes: template.applicable_scopes || [],
        applicable_categories: template.applicable_categories || []
      });
    } else {
      setFormData({
        template_key: '',
        template_name: '',
        description: '',
        field_keys: [],
        applicable_scopes: [],
        applicable_categories: [],
        is_active: true,
        display_order: 0
      });
    }
  }, [template, open]);
  
  // Update available categories when scopes change
  useEffect(() => {
    if (getCategoriesForScope && formData.applicable_scopes.length > 0) {
      const allCategories = new Set();
      formData.applicable_scopes.forEach(scope => {
        getCategoriesForScope(scope).forEach(cat => allCategories.add(cat));
      });
      setAvailableCategories(Array.from(allCategories).sort());
    } else {
      setAvailableCategories([]);
    }
  }, [formData.applicable_scopes, getCategoriesForScope]);
  
  const toggleScope = (scope) => {
    const scopes = formData.applicable_scopes.includes(scope)
      ? formData.applicable_scopes.filter(s => s !== scope)
      : [...formData.applicable_scopes, scope];
    setFormData({...formData, applicable_scopes: scopes});
  };
  
  const toggleField = (fieldKey) => {
    const fields = formData.field_keys.includes(fieldKey)
      ? formData.field_keys.filter(f => f !== fieldKey)
      : [...formData.field_keys, fieldKey];
    setFormData({...formData, field_keys: fields});
  };
  
  const toggleCategory = (category) => {
    const categories = formData.applicable_categories.includes(category)
      ? formData.applicable_categories.filter(c => c !== category)
      : [...formData.applicable_categories, category];
    setFormData({...formData, applicable_categories: categories});
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? 'Edit Template' : 'Create Template'}</DialogTitle>
          <DialogDescription>
            Group input fields for specific emission types
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Template Key *</Label>
              <Input
                value={formData.template_key}
                onChange={(e) => setFormData({...formData, template_key: e.target.value})}
                placeholder="e.g., stationary_combustion"
              />
            </div>
            <div className="space-y-2">
              <Label>Template Name *</Label>
              <Input
                value={formData.template_name}
                onChange={(e) => setFormData({...formData, template_name: e.target.value})}
                placeholder="e.g., Stationary Combustion"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="Describe what this template is for"
            />
          </div>
          
          <div className="space-y-2">
            <Label>Applicable Scopes</Label>
            <div className="flex gap-2 flex-wrap">
              {SCOPES.map((scope) => (
                <Badge
                  key={scope.value}
                  variant={formData.applicable_scopes.includes(scope.value) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleScope(scope.value)}
                >
                  {scope.label}
                  {formData.applicable_scopes.includes(scope.value) && <Check className="w-3 h-3 ml-1" />}
                </Badge>
              ))}
            </div>
          </div>
          
          {availableCategories.length > 0 && (
            <div className="space-y-2">
              <Label>Applicable Categories</Label>
              <div className="flex gap-2 flex-wrap">
                {availableCategories.map((cat) => (
                  <Badge
                    key={cat}
                    variant={formData.applicable_categories.includes(cat) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleCategory(cat)}
                  >
                    {cat}
                    {formData.applicable_categories.includes(cat) && <Check className="w-3 h-3 ml-1" />}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          <div className="space-y-2">
            <Label>Input Fields</Label>
            <p className="text-xs text-gray-500 mb-2">Select fields to include in this template</p>
            {inputFields.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded-md p-3">
                {inputFields.map((field) => (
                  <div
                    key={field.field_key}
                    className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-gray-50 ${
                      formData.field_keys.includes(field.field_key) ? 'bg-teal-50 border border-teal-200' : 'border'
                    }`}
                    onClick={() => toggleField(field.field_key)}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                      formData.field_keys.includes(field.field_key) ? 'bg-teal-600 border-teal-600' : 'border-gray-300'
                    }`}>
                      {formData.field_keys.includes(field.field_key) && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{field.field_name}</p>
                      <p className="text-xs text-gray-500">{field.field_key}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 p-4 border rounded-md text-center">
                No input fields defined yet. Create fields in the Input Fields tab first.
              </p>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Display Order</Label>
              <Input
                type="number"
                value={formData.display_order}
                onChange={(e) => setFormData({...formData, display_order: parseInt(e.target.value) || 0})}
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({...formData, is_active: checked})}
              />
              <Label>Active</Label>
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSave(formData)}>
            {template ? 'Update' : 'Create'} Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== CONVERSION DIALOG =====
function ConversionDialog({ open, onOpenChange, conversion, onSave, availableUnits = [] }) {
  const [formData, setFormData] = useState({
    from_unit: '',
    to_unit: '',
    conversion_type: 'multiply',
    factor: '',
    formula: '',
    requires_parameter: '',
    parameter_source: 'fuel_database',
    parameter_source_field: '',
    parameter_default_value: '',
    allow_parameter_override: true,
    is_active: true
  });
  
  // Group units by type for better UX
  const unitsByType = availableUnits.reduce((acc, unit) => {
    const type = unit.unit_type || 'other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(unit);
    return acc;
  }, {});
  
  useEffect(() => {
    if (conversion) {
      setFormData({
        from_unit: conversion.from_unit || '',
        to_unit: conversion.to_unit || '',
        conversion_type: conversion.conversion_type || 'multiply',
        factor: conversion.factor ?? '',
        formula: conversion.formula || '',
        requires_parameter: conversion.requires_parameter || '',
        parameter_source: conversion.parameter_source || 'fuel_database',
        parameter_source_field: conversion.parameter_source_field || '',
        parameter_default_value: conversion.parameter_default_value ?? '',
        allow_parameter_override: conversion.allow_parameter_override !== false,
        is_active: conversion.is_active !== false
      });
    } else {
      setFormData({
        from_unit: '',
        to_unit: '',
        conversion_type: 'multiply',
        factor: '',
        formula: '',
        requires_parameter: '',
        parameter_source: 'fuel_database',
        parameter_source_field: '',
        parameter_default_value: '',
        allow_parameter_override: true,
        is_active: true
      });
    }
  }, [conversion, open]);
  
  const handleSave = () => {
    if (!formData.from_unit || !formData.to_unit) {
      toast.error('From Unit and To Unit are required');
      return;
    }
    
    if (formData.conversion_type === 'formula' && !formData.formula) {
      toast.error('Formula is required for formula-based conversions');
      return;
    }
    
    if (formData.conversion_type !== 'formula' && !formData.factor) {
      toast.error('Factor is required for multiply/divide conversions');
      return;
    }
    
    const saveData = {
      from_unit: formData.from_unit,
      to_unit: formData.to_unit,
      conversion_type: formData.conversion_type,
      factor: formData.factor ? parseFloat(formData.factor) : null,
      formula: formData.conversion_type === 'formula' ? formData.formula : null,
      requires_parameter: formData.requires_parameter || null,
      parameter_source: formData.requires_parameter ? formData.parameter_source : null,
      parameter_source_field: formData.requires_parameter && formData.parameter_source === 'fuel_database' ? formData.parameter_source_field : null,
      parameter_default_value: formData.parameter_default_value ? parseFloat(formData.parameter_default_value) : null,
      allow_parameter_override: formData.allow_parameter_override,
      is_active: formData.is_active
    };
    
    onSave(saveData);
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{conversion ? 'Edit Unit Conversion' : 'Create Unit Conversion'}</DialogTitle>
          <DialogDescription>
            Define how to convert between units. For volume to mass, use a formula with density from fuel database.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          {/* From/To Unit Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>From Unit *</Label>
              <Select
                value={formData.from_unit}
                onValueChange={(value) => setFormData({...formData, from_unit: value})}
              >
                <SelectTrigger data-testid="conversion-from-unit">
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(unitsByType).map(([type, units]) => (
                    <div key={type}>
                      <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase">{type}</div>
                      {units.map((unit) => (
                        <SelectItem key={unit.id} value={unit.symbol}>
                          {unit.symbol} - {unit.name}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>To Unit *</Label>
              <Select
                value={formData.to_unit}
                onValueChange={(value) => setFormData({...formData, to_unit: value})}
              >
                <SelectTrigger data-testid="conversion-to-unit">
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(unitsByType).map(([type, units]) => (
                    <div key={type}>
                      <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase">{type}</div>
                      {units.map((unit) => (
                        <SelectItem key={unit.id} value={unit.symbol}>
                          {unit.symbol} - {unit.name}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Conversion Type */}
          <div className="space-y-2">
            <Label>Conversion Type *</Label>
            <Select
              value={formData.conversion_type}
              onValueChange={(value) => setFormData({...formData, conversion_type: value})}
            >
              <SelectTrigger data-testid="conversion-type-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONVERSION_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex flex-col">
                      <span>{type.label}</span>
                      <span className="text-xs text-gray-500">{type.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Factor for multiply/divide */}
          {formData.conversion_type !== 'formula' && (
            <div className="space-y-2">
              <Label>Conversion Factor *</Label>
              <Input
                type="number"
                step="any"
                value={formData.factor}
                onChange={(e) => setFormData({...formData, factor: e.target.value})}
                placeholder={formData.conversion_type === 'multiply' ? 'e.g., 3.78541' : 'e.g., 1000'}
                data-testid="conversion-factor"
              />
              {formData.from_unit && formData.to_unit && formData.factor && (
                <p className="text-xs text-teal-600 mt-1">
                  {formData.conversion_type === 'multiply' 
                    ? `1 ${formData.from_unit} = ${formData.factor} ${formData.to_unit}`
                    : `1 ${formData.from_unit} = ${(1 / parseFloat(formData.factor)).toFixed(6)} ${formData.to_unit}`
                  }
                </p>
              )}
            </div>
          )}
          
          {/* Formula for formula-based */}
          {formData.conversion_type === 'formula' && (
            <div className="space-y-2">
              <Label>Formula *</Label>
              <Input
                value={formData.formula}
                onChange={(e) => setFormData({...formData, formula: e.target.value})}
                placeholder="e.g., value * density"
                data-testid="conversion-formula"
                className="font-mono"
              />
              <p className="text-xs text-gray-500">
                Use <code className="bg-gray-100 px-1">value</code> for the input. Reference fuel properties like <code className="bg-gray-100 px-1">density</code>.
              </p>
            </div>
          )}
          
          {/* Required Parameter Section */}
          <div className="space-y-3 p-3 border rounded-md bg-gray-50">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-gray-500" />
              <Label className="font-medium">Parameter Configuration (Optional)</Label>
            </div>
            <p className="text-xs text-gray-500">
              If this conversion requires a fuel property (e.g., density for volume→mass), configure where it comes from.
            </p>
            
            <div className="space-y-2">
              <Label>Requires Parameter</Label>
              <Input
                value={formData.requires_parameter}
                onChange={(e) => setFormData({...formData, requires_parameter: e.target.value})}
                placeholder="e.g., density"
                data-testid="conversion-requires-param"
              />
            </div>
            
            {formData.requires_parameter && (
              <>
                <div className="space-y-2">
                  <Label>Parameter Source</Label>
                  <Select
                    value={formData.parameter_source}
                    onValueChange={(value) => setFormData({...formData, parameter_source: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fuel_database">Fuel Database (auto-lookup from selected fuel)</SelectItem>
                      <SelectItem value="user_input">User Input (user provides value)</SelectItem>
                      <SelectItem value="constant">Constant (use default value)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {formData.parameter_source === 'fuel_database' && (
                  <div className="space-y-2">
                    <Label>Fuel Database Field</Label>
                    <Select
                      value={formData.parameter_source_field}
                      onValueChange={(value) => setFormData({...formData, parameter_source_field: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select field" />
                      </SelectTrigger>
                      <SelectContent>
                        {FUEL_DB_FIELDS.map((field) => (
                          <SelectItem key={field.value} value={field.value}>{field.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                <div className="space-y-2">
                  <Label>Default Value (fallback if not found)</Label>
                  <Input
                    type="number"
                    step="any"
                    value={formData.parameter_default_value}
                    onChange={(e) => setFormData({...formData, parameter_default_value: e.target.value})}
                    placeholder="e.g., 0.85"
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.allow_parameter_override}
                    onCheckedChange={(checked) => setFormData({...formData, allow_parameter_override: checked})}
                  />
                  <Label>Allow user to override this parameter</Label>
                </div>
              </>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <Switch
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({...formData, is_active: checked})}
              data-testid="conversion-active-switch"
            />
            <Label>Active</Label>
          </div>
          
          {/* Help Section */}
          <div className="bg-blue-50 p-3 rounded-md text-sm border border-blue-100">
            <p className="font-medium mb-2 text-blue-800">Common Conversions:</p>
            <ul className="text-xs text-blue-700 space-y-1">
              <li>• <strong>L → kg:</strong> Formula: <code className="bg-blue-100 px-1">value * density</code>, Source: Fuel Database → density</li>
              <li>• <strong>gal → L:</strong> Multiply by 3.78541</li>
              <li>• <strong>kg → t:</strong> Divide by 1000</li>
              <li>• <strong>kWh → GJ:</strong> Multiply by 0.0036</li>
            </ul>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} data-testid="save-conversion-btn">
            {conversion ? 'Update' : 'Create'} Conversion
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== WALKTHROUGH DIALOG =====
function WalkthroughDialog({ open, onOpenChange }) {
  const [activeSection, setActiveSection] = useState('overview');
  
  const sections = [
    { id: 'overview', label: 'Overview', icon: BookOpen },
    { id: 'methods', label: '1. Methods', icon: Calculator },
    { id: 'rules', label: '2. Rules', icon: GitBranch },
    { id: 'fields', label: '3. Input Fields', icon: Layers },
    { id: 'templates', label: '4. Templates', icon: Settings },
    { id: 'conversions', label: '5. Unit Conversions', icon: Scale },
    { id: 'workflow', label: 'Full Workflow', icon: ArrowRight }
  ];
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            Calculation Engine Guide
          </DialogTitle>
          <DialogDescription>
            Learn how to configure the dynamic emission calculation engine
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex gap-4 h-[60vh]">
          {/* Sidebar */}
          <div className="w-48 border-r pr-4 space-y-1">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 transition-colors ${
                    activeSection === section.id 
                      ? 'bg-teal-100 text-teal-800 font-medium' 
                      : 'hover:bg-gray-100 text-gray-600'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {section.label}
                </button>
              );
            })}
          </div>
          
          {/* Content */}
          <div className="flex-1 overflow-y-auto pr-2">
            {activeSection === 'overview' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">What is the Calculation Engine?</h3>
                <p className="text-gray-600">
                  The Calculation Engine is a dynamic, configuration-driven system for calculating GHG emissions. 
                  Instead of hardcoded formulas, it uses configurable <strong>Methods</strong>, <strong>Rules</strong>, 
                  and <strong>Parameters</strong> that you can customize without code changes.
                </p>
                
                <div className="bg-teal-50 p-4 rounded-lg border border-teal-100">
                  <h4 className="font-medium text-teal-800 mb-2">Key Concepts:</h4>
                  <ul className="text-sm text-teal-700 space-y-2">
                    <li><strong>Methods:</strong> Define HOW to calculate (formulas, parameters, outputs)</li>
                    <li><strong>Rules:</strong> Define WHEN to use a method (scope, category matching)</li>
                    <li><strong>Input Fields:</strong> Define WHAT data users enter</li>
                    <li><strong>Templates:</strong> Group fields for specific emission types</li>
                    <li><strong>Unit Conversions:</strong> Define how to convert between units</li>
                  </ul>
                </div>
                
                <div className="bg-amber-50 p-4 rounded-lg border border-amber-100">
                  <h4 className="font-medium text-amber-800 mb-2">Parameter Resolution Order:</h4>
                  <ol className="text-sm text-amber-700 space-y-1 list-decimal list-inside">
                    <li>User explicit override (with justification)</li>
                    <li>User direct input</li>
                    <li>Organization-level override</li>
                    <li>Facility-level override</li>
                    <li>Fuel Database (context-matched)</li>
                    <li>Global default values</li>
                  </ol>
                </div>
              </div>
            )}
            
            {activeSection === 'methods' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">1. Creating Methods</h3>
                <p className="text-gray-600">
                  Methods define the calculation formulas and where each parameter comes from.
                </p>
                
                <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                  <h4 className="font-medium">Example: Stationary Combustion</h4>
                  <div className="text-sm space-y-2">
                    <p><strong>Formula:</strong></p>
                    <code className="block bg-gray-200 p-2 rounded text-xs">
                      {'{co2: quantity * ncv * ef_co2, ch4: quantity * ncv * ef_ch4, n2o: quantity * ncv * ef_n2o}'}
                    </code>
                    
                    <p className="mt-3"><strong>Parameter Sources:</strong></p>
                    <ul className="text-xs space-y-1 bg-white p-2 rounded border">
                      <li>• <code>quantity</code> → <strong>User Input</strong> (user enters the fuel amount)</li>
                      <li>• <code>ncv</code> → <strong>Fuel Database</strong> → calorific_value field</li>
                      <li>• <code>ef_co2</code> → <strong>Fuel Database</strong> → emission_factor_co2 field</li>
                      <li>• <code>ef_ch4</code> → <strong>Fuel Database</strong> → emission_factor_ch4 field</li>
                      <li>• <code>ef_n2o</code> → <strong>Fuel Database</strong> → emission_factor_n2o field</li>
                    </ul>
                  </div>
                </div>
                
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                  <h4 className="font-medium text-blue-800 mb-2">Multi-Output Formulas:</h4>
                  <p className="text-sm text-blue-700">
                    Use JSON-like syntax to calculate multiple gases at once:
                    <code className="block bg-blue-100 p-2 rounded mt-2 text-xs">
                      {'{co2: qty * ef_co2, ch4: qty * ef_ch4, n2o: qty * ef_n2o}'}
                    </code>
                  </p>
                </div>
                
                <div className="bg-teal-50 p-4 rounded-lg border border-teal-100">
                  <h4 className="font-medium text-teal-800 mb-2">CO2e with GWP (Method-Defined):</h4>
                  <p className="text-sm text-teal-700 mb-2">
                    Define CO2e calculation directly in your formula using GWP values from active config:
                  </p>
                  <code className="block bg-teal-100 p-2 rounded text-xs">
                    {'{co2: qty * ncv * ef_co2, ch4: qty * ncv * ef_ch4, n2o: qty * ncv * ef_n2o, co2e: co2 * gwp_co2 + ch4 * gwp_ch4 + n2o * gwp_n2o}'}
                  </code>
                  <p className="text-xs text-teal-600 mt-2">
                    <strong>Available GWP variables:</strong> <code>gwp_co2</code>, <code>gwp_ch4</code>, <code>gwp_n2o</code> (auto-resolved from active GWP config)
                  </p>
                </div>
              </div>
            )}
            
            {activeSection === 'rules' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">2. Creating Rules</h3>
                <p className="text-gray-600">
                  Rules determine which method to use based on context (scope, category, industry).
                </p>
                
                <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                  <h4 className="font-medium">Example Rules:</h4>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-200">
                      <tr>
                        <th className="p-2 text-left">Scope</th>
                        <th className="p-2 text-left">Category</th>
                        <th className="p-2 text-left">→ Method</th>
                        <th className="p-2 text-left">Priority</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="p-2">Scope 1</td>
                        <td className="p-2">Stationary Combustion</td>
                        <td className="p-2">Factor-Based Combustion</td>
                        <td className="p-2">100</td>
                      </tr>
                      <tr className="border-b">
                        <td className="p-2">Scope 1</td>
                        <td className="p-2">Fugitive Emissions</td>
                        <td className="p-2">Fugitive GWP</td>
                        <td className="p-2">100</td>
                      </tr>
                      <tr>
                        <td className="p-2">Scope 2</td>
                        <td className="p-2">Purchased Electricity</td>
                        <td className="p-2">Electricity Location</td>
                        <td className="p-2">100</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                
                <div className="bg-amber-50 p-4 rounded-lg border border-amber-100">
                  <h4 className="font-medium text-amber-800 mb-2">Priority:</h4>
                  <p className="text-sm text-amber-700">
                    Lower priority number = evaluated first. Use priority to create fallback methods.
                  </p>
                </div>
              </div>
            )}
            
            {activeSection === 'fields' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">3. Input Fields</h3>
                <p className="text-gray-600">
                  Input Fields define what data users can enter when recording emissions.
                </p>
                
                <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                  <h4 className="font-medium">Common Fields:</h4>
                  <ul className="text-sm space-y-2">
                    <li><strong>quantity</strong> - Amount of fuel consumed (number, required)</li>
                    <li><strong>consumption</strong> - Energy consumption in kWh/GJ (number, required)</li>
                    <li><strong>distance</strong> - Distance traveled (number, optional)</li>
                    <li><strong>charge</strong> - Refrigerant charge amount (number, for fugitives)</li>
                  </ul>
                </div>
              </div>
            )}
            
            {activeSection === 'templates' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">4. Templates</h3>
                <p className="text-gray-600">
                  Templates group input fields together for specific emission types.
                </p>
                
                <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                  <h4 className="font-medium">Example:</h4>
                  <p className="text-sm">
                    Template: <strong>Stationary Combustion</strong><br/>
                    Applicable: Scope 1<br/>
                    Fields: quantity
                  </p>
                </div>
              </div>
            )}
            
            {activeSection === 'conversions' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">5. Unit Conversions</h3>
                <p className="text-gray-600">
                  Define how to convert between units. Essential for volume→mass conversions.
                </p>
                
                <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                  <h4 className="font-medium">Conversion Types:</h4>
                  <ul className="text-sm space-y-2">
                    <li><strong>Multiply:</strong> value × factor (e.g., gal → L: ×3.78541)</li>
                    <li><strong>Divide:</strong> value ÷ factor (e.g., kg → t: ÷1000)</li>
                    <li><strong>Formula:</strong> Custom expression with parameters (e.g., L → kg: value × density)</li>
                  </ul>
                </div>
                
                <div className="bg-teal-50 p-4 rounded-lg border border-teal-100">
                  <h4 className="font-medium text-teal-800 mb-2">Volume to Mass (L → kg):</h4>
                  <ul className="text-sm text-teal-700 space-y-1">
                    <li><strong>Type:</strong> Formula</li>
                    <li><strong>Formula:</strong> <code>value * density</code></li>
                    <li><strong>Requires Parameter:</strong> density</li>
                    <li><strong>Parameter Source:</strong> Fuel Database → density field</li>
                    <li><strong>Allow Override:</strong> Yes (user can provide custom density)</li>
                  </ul>
                </div>
              </div>
            )}
            
            {activeSection === 'workflow' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Full Setup Workflow</h3>
                
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-8 h-8 bg-teal-500 text-white rounded-full flex items-center justify-center font-bold text-sm">1</div>
                    <div>
                      <h4 className="font-medium">Define Input Fields</h4>
                      <p className="text-sm text-gray-600">Create fields like quantity, consumption, charge</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-8 h-8 bg-teal-500 text-white rounded-full flex items-center justify-center font-bold text-sm">2</div>
                    <div>
                      <h4 className="font-medium">Create Calculation Methods</h4>
                      <p className="text-sm text-gray-600">Define formulas and map each parameter to its source</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-8 h-8 bg-teal-500 text-white rounded-full flex items-center justify-center font-bold text-sm">3</div>
                    <div>
                      <h4 className="font-medium">Set Up Rules</h4>
                      <p className="text-sm text-gray-600">Map scope/category combinations to methods</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-8 h-8 bg-teal-500 text-white rounded-full flex items-center justify-center font-bold text-sm">4</div>
                    <div>
                      <h4 className="font-medium">Configure Unit Conversions</h4>
                      <p className="text-sm text-gray-600">Define L→kg, gal→L, kg→t conversions</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-8 h-8 bg-teal-500 text-white rounded-full flex items-center justify-center font-bold text-sm">5</div>
                    <div>
                      <h4 className="font-medium">Group Fields into Templates</h4>
                      <p className="text-sm text-gray-600">Create templates for different emission types</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold text-sm">✓</div>
                    <div>
                      <h4 className="font-medium text-blue-800">Test with Test Calculation</h4>
                      <p className="text-sm text-blue-700">Use the Test Calculation button to verify your setup</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== PREVIEW DIALOG =====
function PreviewDialog({ 
  open, onOpenChange, context, setContext, inputs, setInputs, result, 
  onPreview, onExecute, fuels = [], sectors = [], gwpConfigs = [], availableUnits = [], emissionConfigs = []
}) {
  // Format number to avoid scientific notation and show meaningful precision
  const formatNumber = (num, maxDecimals = 10) => {
    if (num === null || num === undefined) return '-';
    if (num === 0) return '0';
    
    const absNum = Math.abs(num);
    
    // For very small numbers, show enough decimal places
    if (absNum < 0.0001 && absNum > 0) {
      // Count leading zeros after decimal
      const str = num.toFixed(20);
      const match = str.match(/^-?0\.(0*)([1-9])/);
      if (match) {
        const leadingZeros = match[1].length;
        const significantDigits = Math.min(leadingZeros + 4, maxDecimals);
        return num.toFixed(significantDigits);
      }
    }
    
    // For small numbers, show 6 decimal places
    if (absNum < 1) {
      return num.toFixed(6);
    }
    
    // For regular numbers, show up to 4 decimal places
    if (absNum < 1000) {
      return num.toFixed(4).replace(/\.?0+$/, '');
    }
    
    // For large numbers, use locale string
    return num.toLocaleString('en-US', { maximumFractionDigits: 4 });
  };
  
  // Get unique values for dropdowns - filter fuels by selected scope if applicable
  const scopeFilteredFuels = context.scope 
    ? fuels.filter(f => {
        // If scope is "biogenic", show only biogenic fuels
        // If scope is "scope1" or "scope2", show non-biogenic fuels
        const fuelScope = (f.scope || '').toLowerCase();
        const selectedScope = context.scope.toLowerCase();
        
        if (selectedScope === 'biogenic') {
          return fuelScope.includes('biogenic');
        } else if (selectedScope === 'scope1' || selectedScope === 'scope2') {
          // For scope1/scope2, show fuels that match the scope OR have no specific scope
          return fuelScope.includes(selectedScope) || 
                 (!fuelScope.includes('biogenic') && (fuelScope === '' || fuelScope.includes('scope')));
        }
        return true;
      })
    : fuels;
  
  const uniqueCategories = [...new Set(scopeFilteredFuels.flatMap(f => f.categories || [f.category]).filter(Boolean))];
  const uniqueFuelNames = [...new Set(scopeFilteredFuels.map(f => f.fuel_name).filter(Boolean))];
  const uniqueRegions = [...new Set(scopeFilteredFuels.map(f => f.region).filter(Boolean))];
  const uniqueIndustries = [...new Set(scopeFilteredFuels.flatMap(f => f.industry_sectors || [f.industry_sector]).filter(Boolean))];
  
  // Get active GWP config
  const activeGwpConfig = gwpConfigs.find(g => g.is_active);
  
  // When fuel is selected, auto-fill parameters from fuel database
  const handleFuelSelect = (fuelName) => {
    setContext({...context, fuel_type: fuelName});
    
    // Find matching fuel entry based on context (use scope-filtered fuels first)
    const matchingFuel = scopeFilteredFuels.find(f => 
      f.fuel_name === fuelName && 
      (!context.category || f.categories?.includes(context.category) || f.category === context.category) &&
      (!context.industry_sector || f.industry_sectors?.includes(context.industry_sector) || f.industry_sector === context.industry_sector)
    ) || scopeFilteredFuels.find(f => f.fuel_name === fuelName) || fuels.find(f => f.fuel_name === fuelName);
    
    if (matchingFuel) {
      setInputs(prev => ({
        ...prev,
        ncv: matchingFuel.calorific_value || prev.ncv,
        ef_co2: matchingFuel.emission_factor_co2 || prev.ef_co2,
        ef_ch4: matchingFuel.emission_factor_ch4 || prev.ef_ch4,
        ef_n2o: matchingFuel.emission_factor_n2o || prev.ef_n2o,
        density: matchingFuel.density || prev.density,
        _fuel_id: matchingFuel.id
      }));
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Test Calculation</DialogTitle>
          <DialogDescription>
            Select context from existing data and execute a test calculation
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          {/* Context Selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Context
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Scope *</Label>
                  <Select
                    value={context.scope}
                    onValueChange={(value) => setContext({...context, scope: value, fuel_type: '', category: ''})}
                  >
                    <SelectTrigger data-testid="test-scope-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCOPES.map((scope) => (
                        <SelectItem key={scope.value} value={scope.value}>{scope.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Select
                    value={context.category || ''}
                    onValueChange={(value) => setContext({...context, category: value})}
                  >
                    <SelectTrigger data-testid="test-category-select">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueCategories.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Industry Sector</Label>
                  <Select
                    value={context.industry_sector || ''}
                    onValueChange={(value) => setContext({...context, industry_sector: value})}
                  >
                    <SelectTrigger data-testid="test-industry-select">
                      <SelectValue placeholder="Select industry" />
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueIndustries.map((ind) => (
                        <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Fuel *</Label>
                  <Select
                    value={context.fuel_type || ''}
                    onValueChange={handleFuelSelect}
                  >
                    <SelectTrigger data-testid="test-fuel-select">
                      <SelectValue placeholder="Select fuel" />
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueFuelNames.map((fuel) => (
                        <SelectItem key={fuel} value={fuel}>{fuel}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Region</Label>
                  <Select
                    value={context.region || ''}
                    onValueChange={(value) => setContext({...context, region: value})}
                  >
                    <SelectTrigger data-testid="test-region-select">
                      <SelectValue placeholder="Select region" />
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueRegions.map((region) => (
                        <SelectItem key={region} value={region}>{region}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Input Unit</Label>
                  <Select
                    value={context.input_unit || ''}
                    onValueChange={(value) => setContext({...context, input_unit: value})}
                  >
                    <SelectTrigger data-testid="test-unit-select">
                      <SelectValue placeholder="Select unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableUnits.map((unit) => (
                        <SelectItem key={unit.id} value={unit.symbol}>
                          {unit.symbol} - {unit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Inputs */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="w-4 h-4" />
                Inputs & Parameters
              </CardTitle>
              <p className="text-xs text-gray-500">
                Values auto-filled from selected fuel. Override as needed.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Quantity *</Label>
                  <Input
                    type="number"
                    step="any"
                    value={inputs.quantity ?? ''}
                    onChange={(e) => setInputs({...inputs, quantity: e.target.value ? parseFloat(e.target.value) : null})}
                    placeholder="1000"
                    data-testid="test-quantity-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Calorific Value (NCV)</Label>
                  <Input
                    type="number"
                    step="any"
                    value={inputs.ncv ?? ''}
                    onChange={(e) => setInputs({...inputs, ncv: e.target.value ? parseFloat(e.target.value) : null})}
                    placeholder="Auto from fuel"
                    className={inputs.ncv ? 'bg-green-50' : ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Density (kg/L)</Label>
                  <Input
                    type="number"
                    step="any"
                    value={inputs.density ?? ''}
                    onChange={(e) => setInputs({...inputs, density: e.target.value ? parseFloat(e.target.value) : null})}
                    placeholder="Auto from fuel"
                    className={inputs.density ? 'bg-green-50' : ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label>EF CO2 (kg/TJ)</Label>
                  <Input
                    type="number"
                    step="any"
                    value={inputs.ef_co2 ?? ''}
                    onChange={(e) => setInputs({...inputs, ef_co2: e.target.value ? parseFloat(e.target.value) : null})}
                    placeholder="Auto from fuel"
                    className={inputs.ef_co2 ? 'bg-green-50' : ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label>EF CH4 (kg/TJ)</Label>
                  <Input
                    type="number"
                    step="any"
                    value={inputs.ef_ch4 ?? ''}
                    onChange={(e) => setInputs({...inputs, ef_ch4: e.target.value ? parseFloat(e.target.value) : null})}
                    placeholder="Auto from fuel"
                    className={inputs.ef_ch4 ? 'bg-green-50' : ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label>EF N2O (kg/TJ)</Label>
                  <Input
                    type="number"
                    step="any"
                    value={inputs.ef_n2o ?? ''}
                    onChange={(e) => setInputs({...inputs, ef_n2o: e.target.value ? parseFloat(e.target.value) : null})}
                    placeholder="Auto from fuel"
                    className={inputs.ef_n2o ? 'bg-green-50' : ''}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* GWP Config Info */}
          {activeGwpConfig && (
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-blue-800">Active GWP Config: </span>
                    <Badge variant="outline" className="ml-2">{activeGwpConfig.name}</Badge>
                    <span className="text-xs text-blue-600 ml-2">({activeGwpConfig.source})</span>
                  </div>
                  <div className="text-xs text-blue-600">
                    CO2: {activeGwpConfig.co2_gwp} | CH4: {activeGwpConfig.ch4_fossil_gwp} | N2O: {activeGwpConfig.n2o_gwp}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onPreview} data-testid="test-preview-btn">
              <Eye className="w-4 h-4 mr-2" />
              Preview Method
            </Button>
            <Button onClick={onExecute} data-testid="test-execute-btn">
              <Play className="w-4 h-4 mr-2" />
              Execute Calculation
            </Button>
          </div>
          
          {/* Result */}
          {result && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Result</CardTitle>
              </CardHeader>
              <CardContent>
                {result.success === false ? (
                  <div className="text-red-600 p-3 bg-red-50 rounded">{result.error}</div>
                ) : (
                  <div className="space-y-4">
                    {result.audit?.method_name && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">Method: </span>
                        <Badge>{result.audit.method_name}</Badge>
                        <span className="text-gray-400 text-sm ml-2">Formula: <code className="bg-gray-100 px-1">{result.audit.formula_used}</code></span>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-4 gap-4">
                      <div className="p-3 bg-teal-50 rounded border border-teal-200">
                        <div className="text-xs text-teal-600 font-medium">CO2e</div>
                        <div className="text-xl font-bold text-teal-800">{formatNumber(result.co2e)}</div>
                        <div className="text-xs text-teal-500">{result.output_unit || 'kg'}</div>
                      </div>
                      {result.co2 != null && (
                        <div className="p-3 bg-gray-50 rounded">
                          <div className="text-xs text-gray-500">CO2</div>
                          <div className="text-lg font-bold">{formatNumber(result.co2)}</div>
                        </div>
                      )}
                      {result.ch4 != null && (
                        <div className="p-3 bg-gray-50 rounded">
                          <div className="text-xs text-gray-500">CH4</div>
                          <div className="text-lg font-bold">{formatNumber(result.ch4)}</div>
                        </div>
                      )}
                      {result.n2o != null && (
                        <div className="p-3 bg-gray-50 rounded">
                          <div className="text-xs text-gray-500">N2O</div>
                          <div className="text-lg font-bold">{formatNumber(result.n2o)}</div>
                        </div>
                      )}
                    </div>
                    
                    {result.audit?.gwp_values_used && Object.keys(result.audit.gwp_values_used).length > 0 && (
                      <div className="p-3 bg-blue-50 rounded text-sm">
                        <span className="font-medium">GWP Applied:</span>
                        <span className="ml-2">
                          CO2×{result.audit.gwp_values_used.co2 || 1}, 
                          CH4×{result.audit.gwp_values_used.ch4 || 28}, 
                          N2O×{result.audit.gwp_values_used.n2o || 265}
                        </span>
                        {result.audit.gwp_source && (
                          <span className="text-gray-500 ml-2">({result.audit.gwp_source})</span>
                        )}
                      </div>
                    )}
                    
                    {result.audit?.parameters_resolved && result.audit.parameters_resolved.length > 0 && (
                      <div>
                        <div className="text-sm font-medium mb-2">Resolved Parameters:</div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {result.audit.parameters_resolved.map((p, i) => (
                            <div key={i} className="flex justify-between p-2 bg-gray-50 rounded">
                              <span className="font-medium">{p.parameter_key}</span>
                              <span>
                                {typeof p.value === 'number' ? formatNumber(p.value) : p.value}
                                {p.unit && <span className="text-gray-400 ml-1">{p.unit}</span>}
                                <span className="text-gray-400 ml-1">({p.source})</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Calculation Breakdown */}
                    {result.audit?.intermediate_values?._calculation_breakdown && (
                      <div className="mt-4">
                        <div className="text-sm font-medium mb-2">Calculation Breakdown:</div>
                        <div className="space-y-2 font-mono text-xs bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
                          {result.audit.intermediate_values._calculation_breakdown.map((step, i) => (
                            <div key={i} className="space-y-1">
                              <div className="text-slate-400">
                                {/* Step header */}
                                Step {step.step}: {step.output} = {step.formula}
                              </div>
                              <div className="pl-4 text-teal-400">
                                {/* Substituted values */}
                                → {step.substituted}
                              </div>
                              <div className="pl-4 text-green-400 font-bold">
                                {/* Result */}
                                = {step.result}
                              </div>
                              {step.description && (
                                <div className="pl-4 text-slate-500 text-[10px]">
                                  // {step.description}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
