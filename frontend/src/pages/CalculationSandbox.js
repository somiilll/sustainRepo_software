import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { Loader2, PlayCircle, ChevronRight, ChevronDown, Beaker, AlertCircle, GitFork, FileText, Layers } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function CalculationSandbox() {
  const { getAuthHeader } = useAuth();
  
  // Data
  const [scopes, setScopes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [decisionTrees, setDecisionTrees] = useState([]);
  const [inputFieldMappings, setInputFieldMappings] = useState([]);
  const [formulas, setFormulas] = useState([]);
  const [fuels, setFuels] = useState([]);
  const [loading, setLoading] = useState(true);

  // Selection
  const [selectedScopeId, setSelectedScopeId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  
  // Runtime state
  const [fieldValues, setFieldValues] = useState({});  // { field_key: value }
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [resolvedFormula, setResolvedFormula] = useState(null);
  const [auditExpanded, setAuditExpanded] = useState(true);

  // Load all data
  const load = useCallback(async () => {
    try {
      const [scopesRes, catsRes, treesRes, mappingsRes, formulasRes, fuelsRes] = await Promise.all([
        axios.get(`${API}/scopes`, { headers: getAuthHeader() }),
        axios.get(`${API}/categories`, { headers: getAuthHeader() }),
        axios.get(`${API}/calc-engine/decision-trees`, { headers: getAuthHeader() }),
        axios.get(`${API}/calc-engine/input-field-mappings`, { headers: getAuthHeader() }),
        axios.get(`${API}/calc-engine/formulas`, { headers: getAuthHeader() }),
        axios.get(`${API}/super-admin/fuel-database`, { headers: getAuthHeader() }).catch(() => ({ data: [] })),
      ]);
      setScopes(scopesRes.data || []);
      setCategories(catsRes.data || []);
      setDecisionTrees(treesRes.data || []);
      setInputFieldMappings(mappingsRes.data || []);
      setFormulas(formulasRes.data || []);
      setFuels(fuelsRes.data || []);
    } catch (err) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  useEffect(() => { load(); }, [load]);

  // Filter categories by scope
  const filteredCategories = useMemo(() => {
    if (!selectedScopeId) return [];
    return categories.filter(c => c.scope_id === selectedScopeId);
  }, [categories, selectedScopeId]);

  // Filter fuels by selected category
  const filteredFuels = useMemo(() => {
    if (!selectedCategoryId) return fuels;
    const selectedCat = categories.find(c => c.id === selectedCategoryId);
    const catName = selectedCat?.name || '';
    
    // Filter fuels that have this category in their categories array
    return fuels.filter(f => {
      // Check categories array (e.g., ["Stationary Combustion", "Mobile Combustion"])
      if (f.categories && Array.isArray(f.categories)) {
        return f.categories.some(fc => fc === catName);
      }
      // Fallback to category field
      if (f.category) {
        return f.category === catName;
      }
      return false;
    });
  }, [fuels, selectedCategoryId, categories]);

  // Get decision tree for selected category
  const categoryDecisionTree = useMemo(() => {
    if (!selectedCategoryId) return null;
    return decisionTrees.find(t => t.category_id === selectedCategoryId);
  }, [decisionTrees, selectedCategoryId]);

  // Get input field mappings for selected scope/category
  // Normalize mappings to handle both flat structure and fields array structure
  const relevantMappings = useMemo(() => {
    const filtered = inputFieldMappings.filter(m => {
      // Check if mapping applies to this scope/category
      const scopeMatch = !m.applies_to_scopes?.length || m.applies_to_scopes?.includes(selectedScopeId);
      const catMatch = !m.applies_to_categories?.length || m.applies_to_categories?.includes(selectedCategoryId);
      return scopeMatch && catMatch;
    });
    
    // Normalize: if mapping has top-level field_key (flat structure), convert to fields array
    return filtered.map(m => {
      if (m.fields && m.fields.length > 0) {
        // Already has fields array
        return m;
      }
      if (m.field_key) {
        // Flat structure - convert to fields array
        return {
          ...m,
          fields: [{
            field_key: m.field_key,
            label: m.field_label || m.label || m.field_key,
            field_type: m.field_type || 'text',
            maps_to_variable: m.maps_to_variable || '',
            maps_to_context_key: m.maps_to_context_key || '',
            required: m.required || false,
            is_override: m.is_override || false,
            default_unit: m.default_unit || '',
            allowed_units: m.allowed_units || [],
            placeholder: m.placeholder || '',
            help_text: m.help_text || '',
            options: m.options || [],
          }]
        };
      }
      return m;
    });
  }, [inputFieldMappings, selectedScopeId, selectedCategoryId]);

  // Flatten all fields from mappings for easier iteration
  const allMappedFields = useMemo(() => {
    const fields = [];
    relevantMappings.forEach(m => {
      m.fields?.forEach(f => fields.push(f));
    });
    return fields;
  }, [relevantMappings]);

  // Reset when category changes
  useEffect(() => {
    setFieldValues({});
    setResult(null);
    setResolvedFormula(null);
  }, [selectedCategoryId]);

  // Build context from field values for decision tree traversal
  const buildContext = useCallback(() => {
    const ctx = {};
    
    // Process all mapped fields and set provided flags
    allMappedFields.forEach(field => {
      const value = fieldValues[field.field_key];
      const hasValue = value !== undefined && value !== '' && value !== null;
      
      // Map to context using either maps_to_context_key or maps_to_context
      const contextKey = field.maps_to_context_key || field.maps_to_context;
      if (contextKey && hasValue) {
        ctx[contextKey] = value;
      }
      
      // Also map the field_key directly to context for decision tree
      if (field.field_key && hasValue) {
        ctx[field.field_key] = value;
      }
      
      // Set "provided" flags for ALL fields (true/false)
      // This is critical for decision tree to work
      if (field.field_key) {
        ctx[`${field.field_key}_provided`] = hasValue ? 'true' : 'false';
      }
      
      // Also set variable-based provided flags for override fields
      if (field.maps_to_variable && hasValue) {
        ctx[`${field.maps_to_variable}_provided`] = 'true';
      }
    });
    
    // Set ef_q_co2_provided explicitly based on emission factor or custom EF fields
    const hasEmissionFactor = fieldValues['ef_quantity'] || fieldValues['ef_q_co2'] || fieldValues['emission_factor'] || fieldValues['custom_ef_co2'];
    ctx['ef_q_co2_provided'] = hasEmissionFactor ? 'true' : 'false';
    
    // Add fuel properties to context if fuel selected
    const fuelId = fieldValues['fuel_id'];
    if (fuelId) {
      const fuel = fuels.find(f => f.id === fuelId);
      if (fuel) {
        ctx.fuel_id = fuel.id;
        ctx.fuel_name = fuel.fuel_name;
        ctx.fuel_state = fuel.fuel_state || fuel.state;
        ctx.fuel_type = fuel.fuel_type || fuel.type;
      }
    }
    
    return ctx;
  }, [fieldValues, allMappedFields, fuels]);

  // Traverse decision tree to find formula
  const traverseTree = useCallback((node, context) => {
    if (!node) return null;
    
    if (node.type === 'formula' || node.formula_id) {
      return node.formula_id;
    }
    
    if (node.type === 'condition' || node.field_name) {
      const fieldName = node.field_name || node.condition_key;
      const fieldValue = context[fieldName];
      
      // Check branches/options
      const branches = node.branches || node.options || {};
      
      // Try exact match
      if (branches[fieldValue]) {
        return traverseTree(branches[fieldValue], context);
      }
      
      // Try case-insensitive match
      const lowerValue = String(fieldValue || '').toLowerCase();
      for (const [key, branch] of Object.entries(branches)) {
        if (key.toLowerCase() === lowerValue) {
          return traverseTree(branch, context);
        }
      }
      
      // Try default/else branch
      if (branches['default'] || branches['else'] || branches['*']) {
        return traverseTree(branches['default'] || branches['else'] || branches['*'], context);
      }
    }
    
    return null;
  }, []);

  // Resolve which formula to use
  const resolveFormula = useCallback(() => {
    if (!categoryDecisionTree) {
      // No decision tree - check if there's a formula directly assigned to category
      const categoryFormula = formulas.find(f => 
        f.category_ids?.includes(selectedCategoryId) || f.category_id === selectedCategoryId
      );
      return categoryFormula;
    }
    
    const context = buildContext();
    const formulaId = traverseTree(categoryDecisionTree.tree, context);
    
    if (formulaId) {
      return formulas.find(f => f.id === formulaId);
    }
    
    return null;
  }, [categoryDecisionTree, formulas, selectedCategoryId, buildContext, traverseTree]);

  // Update resolved formula when inputs change
  useEffect(() => {
    if (selectedCategoryId) {
      const formula = resolveFormula();
      setResolvedFormula(formula);
    }
  }, [selectedCategoryId, fieldValues, resolveFormula]);

  // Run calculation
  const run = async () => {
    if (!resolvedFormula) {
      toast.error('No formula resolved for current inputs');
      return;
    }
    
    setRunning(true);
    setResult(null);
    
    try {
      // Build inputs from field values
      const inputs = {};
      const userOverrides = {};
      const context = buildContext();
      
      // Process all mapped fields
      allMappedFields.forEach(field => {
        const value = fieldValues[field.field_key];
        if (value === undefined || value === '') return;
        
        const numValue = Number(value);
        if (field.maps_to_variable && Number.isFinite(numValue)) {
          // Get unit from field-specific unit, or default unit
          const unitKey = `${field.field_key}_unit`;
          const unit = fieldValues[unitKey] || field.default_unit || '';
          
          inputs[field.maps_to_variable] = {
            value: numValue,
            unit: unit,
          };
        }
        
        // Handle overrides for property variables
        if (field.is_override && field.maps_to_variable && Number.isFinite(numValue)) {
          const unitKey = `${field.field_key}_unit`;
          const unit = fieldValues[unitKey] || field.default_unit || '';
          
          userOverrides[field.maps_to_variable] = {
            value: numValue,
            unit: unit,
          };
        }
      });
      
      // Ensure qty has a default unit from quantity_unit field or fuel's allowed_units
      if (inputs['qty'] && !inputs['qty'].unit) {
        const selectedFuel = fuels.find(f => f.id === fieldValues['fuel_id']);
        const qtyUnit = fieldValues['quantity_unit'] || selectedFuel?.allowed_units?.[0] || 'kg';
        inputs['qty'].unit = qtyUnit;
      }
      
      // Also add quantity from quantity field if not mapped
      if (!inputs['qty'] && fieldValues['quantity']) {
        const selectedFuel = fuels.find(f => f.id === fieldValues['fuel_id']);
        const qtyUnit = fieldValues['quantity_unit'] || selectedFuel?.allowed_units?.[0] || 'kg';
        inputs['qty'] = {
          value: Number(fieldValues['quantity']),
          unit: qtyUnit,
        };
      }
      
      const res = await axios.post(
        `${API}/super-admin/calc-engine/execute`,
        {
          formula_id: resolvedFormula.id,
          inputs,
          context,
          user_overrides: userOverrides,
          dry_run: true,
        },
        { headers: getAuthHeader() },
      );
      setResult(res.data);
    } catch (err) {
      const detail = err.response?.data?.detail || err.message;
      toast.error(typeof detail === 'string' ? detail : 'Calculation failed');
      setResult({ ok: false, error: detail });
    } finally {
      setRunning(false);
    }
  };

  // Get selected scope and category names
  const selectedScope = scopes.find(s => s.id === selectedScopeId);
  const selectedCategory = categories.find(c => c.id === selectedCategoryId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="calc-sandbox-page">
      <div>
        <h1 className="text-4xl font-heading font-bold text-text-primary mb-2 flex items-center gap-3">
          <Beaker className="w-8 h-8 text-primary" />
          Calculation Sandbox
        </h1>
        <p className="text-text-secondary">
          Simulate the user experience: select scope & category, fill inputs, and see how the decision tree routes to the right formula.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column — inputs */}
        <div className="space-y-4">
          {/* Scope & Category Selection */}
          <Card className="p-5 border border-stone-200 rounded-xl">
            <h3 className="font-heading font-bold text-text-primary mb-4 flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Step 1: Select Scope & Category
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-text-muted">Scope</Label>
                <Select 
                  value={selectedScopeId} 
                  onValueChange={(v) => { 
                    setSelectedScopeId(v); 
                    setSelectedCategoryId(''); 
                  }}
                >
                  <SelectTrigger data-testid="scope-picker">
                    <SelectValue placeholder="Select scope" />
                  </SelectTrigger>
                  <SelectContent>
                    {scopes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-text-muted">Category</Label>
                <Select 
                  value={selectedCategoryId} 
                  onValueChange={setSelectedCategoryId}
                  disabled={!selectedScopeId}
                >
                  <SelectTrigger data-testid="category-picker">
                    <SelectValue placeholder={selectedScopeId ? "Select category" : "Select scope first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Show decision tree info */}
            {selectedCategoryId && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 text-sm">
                  <GitFork className="w-4 h-4 text-blue-600" />
                  <span className="text-blue-700">
                    {categoryDecisionTree 
                      ? `Decision tree configured (routes by: ${categoryDecisionTree.tree?.field_name || 'conditions'})`
                      : 'No decision tree — will use category formula directly'
                    }
                  </span>
                </div>
              </div>
            )}
          </Card>

          {/* Dynamic Input Fields */}
          {selectedCategoryId && (
            <Card className="p-5 border border-stone-200 rounded-xl space-y-4">
              <h3 className="font-heading font-bold text-text-primary flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Step 2: Fill Input Fields
              </h3>
              
              {/* FUEL SELECTION - Always shown automatically */}
              <div className="space-y-1.5">
                <Label className="text-sm">
                  Fuel <span className="text-red-500 ml-1">*</span>
                </Label>
                <Select
                  value={fieldValues['fuel_id'] || ''}
                  onValueChange={(v) => {
                    const selectedFuel = filteredFuels.find(f => f.id === v);
                    setFieldValues(p => ({ 
                      ...p, 
                      fuel_id: v,
                      fuel_name: selectedFuel?.fuel_name || '',
                    }));
                  }}
                >
                  <SelectTrigger className="bg-stone-50" data-testid="fuel-picker">
                    <SelectValue placeholder="Select fuel" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredFuels.length === 0 ? (
                      <SelectItem value="none" disabled>No fuels for this category</SelectItem>
                    ) : (
                      filteredFuels.map((fuel) => (
                        <SelectItem key={fuel.id} value={fuel.id}>
                          {fuel.fuel_name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {fieldValues['fuel_id'] && (
                  <div className="text-xs text-text-muted mt-1">
                    {(() => {
                      const fuel = fuels.find(f => f.id === fieldValues['fuel_id']);
                      if (!fuel) return null;
                      return (
                        <span>
                          CV: {fuel.calorific_value} {fuel.calorific_value_unit} | 
                          Density: {fuel.density} {fuel.density_unit} |
                          State: {fuel.fuel_state}
                        </span>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* MAPPED FIELDS - From Input Field Mappings (excluding fuel_select type) */}
              {allMappedFields.filter(f => f.field_type !== 'fuel_select').length > 0 ? (
                <div className="space-y-4 pt-3 border-t border-stone-200">
                  {allMappedFields.filter(f => f.field_type !== 'fuel_select').map((field) => (
                    <div key={field.field_key} className="space-y-1.5">
                      <Label className="text-sm">
                        {field.label || field.field_key}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                      </Label>
                      
                      {field.field_type === 'unit_select' ? (
                        /* Dynamic unit select - options from selected fuel's allowed_units or field's allowed_units */
                        <Select
                          value={fieldValues[field.field_key] || field.default_unit || ''}
                          onValueChange={(v) => setFieldValues(p => ({ ...p, [field.field_key]: v }))}
                        >
                          <SelectTrigger className="bg-stone-50">
                            <SelectValue placeholder="Select unit" />
                          </SelectTrigger>
                          <SelectContent>
                            {(() => {
                              const selectedFuel = fuels.find(f => f.id === fieldValues['fuel_id']);
                              const allowedUnits = selectedFuel?.allowed_units || field.allowed_units || ['kg', 't', 'L', 'kL'];
                              return allowedUnits.map((u) => (
                                <SelectItem key={u} value={u}>{u}</SelectItem>
                              ));
                            })()}
                          </SelectContent>
                        </Select>
                      ) : field.field_type === 'select' ? (
                        <Select
                          value={fieldValues[field.field_key] || ''}
                          onValueChange={(v) => setFieldValues(p => ({ ...p, [field.field_key]: v }))}
                        >
                          <SelectTrigger className="bg-stone-50">
                            <SelectValue placeholder={`Select ${field.label || field.field_key}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {(field.options && field.options.length > 0) ? (
                              field.options.map((opt) => (
                                <SelectItem key={opt.value || opt} value={opt.value || opt}>
                                  {opt.label || opt.value || opt}
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem value="" disabled>No options configured</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      ) : (
                        /* Number/text input with optional unit selector */
                        <div className="flex gap-2">
                          <Input
                            type={field.field_type === 'number' ? 'number' : 'text'}
                            placeholder={field.placeholder || `Enter ${field.label || field.field_key}`}
                            value={fieldValues[field.field_key] || ''}
                            onChange={(e) => setFieldValues(p => ({ ...p, [field.field_key]: e.target.value }))}
                            className="bg-stone-50 flex-1"
                          />
                          {field.default_unit && (() => {
                            // Determine allowed units based on unit_source
                            const allowedUnits = field.unit_source === 'fuel'
                              ? (selectedFuel?.allowed_units || [field.default_unit])
                              : (field.allowed_units?.length > 0 ? field.allowed_units : [field.default_unit]);
                            return (
                              <Select
                                value={fieldValues[`${field.field_key}_unit`] || field.default_unit}
                                onValueChange={(v) => setFieldValues(p => ({ ...p, [`${field.field_key}_unit`]: v }))}
                              >
                                <SelectTrigger className="w-24 bg-stone-50">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {allowedUnits.map((u) => (
                                    <SelectItem key={u} value={u}>{u}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            );
                          })()}
                        </div>
                      )}
                      {field.help_text && (
                        <p className="text-xs text-text-muted">{field.help_text}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                /* No additional mappings configured - show a simple message */
                <div className="text-sm text-text-muted p-3 bg-stone-50 rounded-lg">
                  No additional input fields configured. Add them in Input Field Mapping if needed.
                </div>
              )}
              
              {/* Context for testing */}
              <div className="pt-3 border-t border-stone-200">
                <Label className="text-xs text-text-muted mb-2 block">Additional Context (for testing)</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="region"
                    value={fieldValues['region'] || ''}
                    onChange={(e) => setFieldValues(p => ({ ...p, region: e.target.value }))}
                    className="bg-stone-50 text-sm"
                  />
                  <Input
                    placeholder="year"
                    value={fieldValues['year'] || ''}
                    onChange={(e) => setFieldValues(p => ({ ...p, year: e.target.value }))}
                    className="bg-stone-50 text-sm"
                  />
                </div>
              </div>
            </Card>
          )}

          {/* Formula Resolution & Run */}
          {selectedCategoryId && (
            <Card className="p-5 border border-stone-200 rounded-xl space-y-4">
              <h3 className="font-heading font-bold text-text-primary">Step 3: Resolved Formula</h3>
              
              {resolvedFormula ? (
                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-emerald-100 text-emerald-700">
                      {resolvedFormula.name}
                    </Badge>
                    <span className="text-xs text-emerald-600">v{resolvedFormula.version_number || 1}</span>
                  </div>
                  {resolvedFormula.description && (
                    <p className="text-xs text-emerald-700 mt-1">{resolvedFormula.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {resolvedFormula.definition?.outputs?.map((o) => (
                      <Badge key={o.variable} variant="outline" className="text-xs">
                        → {o.variable}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-sm text-amber-700">
                  <AlertCircle className="w-4 h-4 inline mr-2" />
                  {categoryDecisionTree ? (
                    <div>
                      <strong>Cannot resolve formula.</strong> Decision tree routes by: <code className="bg-amber-100 px-1 rounded">{categoryDecisionTree.tree?.field_name}</code>
                      <div className="mt-2 text-xs">
                        {(() => {
                          const fieldName = categoryDecisionTree.tree?.field_name;
                          const context = buildContext();
                          const currentValue = context[fieldName] || fieldValues[fieldName];
                          const branches = categoryDecisionTree.tree?.branches || categoryDecisionTree.tree?.options || {};
                          const expectedValues = Object.keys(branches);
                          
                          return (
                            <>
                              <div><strong>Current value:</strong> {currentValue ? <code className="bg-amber-100 px-1 rounded">{currentValue}</code> : <span className="text-red-600">Not set</span>}</div>
                              <div><strong>Expected values:</strong> {expectedValues.map((v, i) => (
                                <code key={v} className="bg-amber-100 px-1 rounded mx-0.5">{v}</code>
                              ))}</div>
                              {!currentValue && (
                                <div className="mt-1 text-amber-800">
                                  → Fill in the <strong>{fieldName}</strong> field or select an option that matches one of the expected values.
                                </div>
                              )}
                              {currentValue && !expectedValues.includes(currentValue) && !expectedValues.some(v => v.toLowerCase() === String(currentValue).toLowerCase()) && (
                                <div className="mt-1 text-amber-800">
                                  → Value "{currentValue}" doesn't match any branch. Check the decision tree configuration.
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  ) : (
                    'No formula configured for this category'
                  )}
                </div>
              )}
              
              <Button
                onClick={run}
                disabled={running || !resolvedFormula}
                className="w-full bg-primary hover:bg-primary/90 text-white rounded-full"
                data-testid="run-sandbox-btn"
              >
                {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
                Run Calculation
              </Button>
            </Card>
          )}
        </div>

        {/* Right column — output */}
        <div className="space-y-4">
          {!selectedCategoryId && (
            <Card className="p-12 border-dashed text-center text-text-muted">
              <Beaker className="w-10 h-10 mx-auto mb-3 text-stone-300" />
              <p>Select a scope and category to begin.</p>
            </Card>
          )}
          
          {selectedCategoryId && !result && (
            <Card className="p-12 border-dashed text-center text-text-muted">
              <Beaker className="w-10 h-10 mx-auto mb-3 text-stone-300" />
              <p>Fill in the inputs and run the calculation to see results.</p>
            </Card>
          )}
          
          {result?.ok === false && (
            <Card className="p-5 border border-red-300 bg-red-50 rounded-xl">
              <p className="font-medium text-red-700 mb-1">Calculation error</p>
              <pre className="text-sm text-red-800 whitespace-pre-wrap">{String(result.error)}</pre>
            </Card>
          )}
          
          {result?.outputs && (
            <>
              <Card className="p-5 border border-emerald-200 rounded-xl bg-emerald-50/30">
                <h3 className="font-heading font-bold text-text-primary mb-3">Outputs</h3>
                <div className="space-y-2">
                  {Object.entries(result.outputs).map(([k, v]) => (
                    <div key={k} className="flex justify-between items-baseline gap-4" data-testid={`output-${k}`}>
                      <span className="font-mono text-sm text-text-secondary">{k}</span>
                      <span className="font-heading font-bold text-xl text-text-primary">
                        {Number(v.value).toLocaleString(undefined, { maximumFractionDigits: 6 })}{' '}
                        <span className="text-xs text-text-muted font-normal">{v.unit}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Execution Info */}
              <Card className="p-4 border border-blue-200 rounded-xl bg-blue-50/30">
                <div className="text-sm space-y-1">
                  <div><strong>Scope:</strong> {selectedScope?.name}</div>
                  <div><strong>Category:</strong> {selectedCategory?.name}</div>
                  <div><strong>Formula Used:</strong> {resolvedFormula?.name}</div>
                  {categoryDecisionTree && (
                    <div><strong>Decision Path:</strong> {categoryDecisionTree.tree?.field_name} → {resolvedFormula?.name}</div>
                  )}
                </div>
              </Card>

              <Card className="p-5 border border-stone-200 rounded-xl">
                <button
                  onClick={() => setAuditExpanded(!auditExpanded)}
                  className="flex items-center gap-2 font-heading font-bold text-text-primary w-full text-left"
                  data-testid="toggle-audit-log"
                >
                  {auditExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  Audit log ({result.audit_log?.length || 0} steps)
                </button>
                {auditExpanded && (
                  <div className="mt-3 space-y-1 max-h-[500px] overflow-y-auto font-mono text-xs">
                    {(result.audit_log || []).map((entry, i) => (
                      <AuditRow key={i} entry={entry} />
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AuditRow({ entry }) {
  const stepColour = {
    convert: 'bg-blue-50 border-blue-200 text-blue-900',
    transformation: 'bg-purple-50 border-purple-200 text-purple-900',
    'transformation.apply': 'bg-purple-50 border-purple-200 text-purple-900',
    resolve_property: 'bg-amber-50 border-amber-200 text-amber-900',
    formula_step: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    validate_formula: 'bg-stone-50 border-stone-200 text-stone-700',
    input: 'bg-stone-50 border-stone-200 text-stone-700',
    outputs: 'bg-emerald-100 border-emerald-300 text-emerald-900 font-semibold',
  };
  const cls = stepColour[entry.step] || 'bg-white border-stone-200';
  return (
    <div className={`px-2 py-1.5 rounded border ${cls}`}>
      <div className="font-semibold">{entry.step}{entry.name ? ` · ${entry.name}` : ''}</div>
      <pre className="mt-0.5 whitespace-pre-wrap break-all text-[11px] leading-snug">
        {JSON.stringify(
          Object.fromEntries(Object.entries(entry).filter(([k]) => !['step', 'name'].includes(k))),
          null, 2,
        )}
      </pre>
    </div>
  );
}
