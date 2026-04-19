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
    
    // Filter fuels that have this category in their categories array or match the category field
    return fuels.filter(f => {
      if (f.categories && Array.isArray(f.categories)) {
        return f.categories.some(fc => 
          fc.toLowerCase().includes(catName.toLowerCase()) || 
          catName.toLowerCase().includes(fc.toLowerCase())
        );
      }
      if (f.category) {
        return f.category.toLowerCase().includes(catName.toLowerCase()) ||
               catName.toLowerCase().includes(f.category.toLowerCase());
      }
      return true; // Include fuels without category restrictions
    });
  }, [fuels, selectedCategoryId, categories]);

  // Get decision tree for selected category
  const categoryDecisionTree = useMemo(() => {
    if (!selectedCategoryId) return null;
    return decisionTrees.find(t => t.category_id === selectedCategoryId);
  }, [decisionTrees, selectedCategoryId]);

  // Get input field mappings for selected scope/category
  const relevantMappings = useMemo(() => {
    return inputFieldMappings.filter(m => {
      // Check if mapping applies to this scope/category
      const scopeMatch = m.applies_to_scopes?.length === 0 || m.applies_to_scopes?.includes(selectedScopeId);
      const catMatch = m.applies_to_categories?.length === 0 || m.applies_to_categories?.includes(selectedCategoryId);
      return scopeMatch && catMatch;
    });
  }, [inputFieldMappings, selectedScopeId, selectedCategoryId]);

  // Reset when category changes
  useEffect(() => {
    setFieldValues({});
    setResult(null);
    setResolvedFormula(null);
  }, [selectedCategoryId]);

  // Build context from field values for decision tree traversal
  const buildContext = useCallback(() => {
    const ctx = {};
    relevantMappings.forEach(mapping => {
      mapping.fields?.forEach(field => {
        const value = fieldValues[field.field_key];
        if (field.maps_to_context_key && value !== undefined && value !== '') {
          ctx[field.maps_to_context_key] = value;
        }
        // Set "provided" flags for optional fields
        if (field.field_key && value !== undefined && value !== '') {
          ctx[`${field.field_key}_provided`] = 'true';
        }
      });
    });
    // Add fuel properties to context if fuel selected
    const fuelCode = fieldValues['fuel_code'] || fieldValues['fuel'];
    if (fuelCode) {
      const fuel = fuels.find(f => f.fuel_code === fuelCode || f.id === fuelCode);
      if (fuel) {
        ctx.fuel_code = fuel.fuel_code;
        ctx.fuel_state = fuel.fuel_state || fuel.state;
        ctx.fuel_type = fuel.fuel_type || fuel.type;
      }
    }
    return ctx;
  }, [fieldValues, relevantMappings, fuels]);

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
      
      relevantMappings.forEach(mapping => {
        mapping.fields?.forEach(field => {
          const value = fieldValues[field.field_key];
          if (value === undefined || value === '') return;
          
          const numValue = Number(value);
          if (field.maps_to_variable && Number.isFinite(numValue)) {
            inputs[field.maps_to_variable] = {
              value: numValue,
              unit: fieldValues[`${field.field_key}_unit`] || field.default_unit || '',
            };
          }
          // Handle overrides
          if (field.is_override && Number.isFinite(numValue)) {
            userOverrides[field.maps_to_variable || field.field_key] = {
              value: numValue,
              unit: fieldValues[`${field.field_key}_unit`] || field.default_unit || '',
            };
          }
        });
      });
      
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
              
              {/* Default fields - always show these for emissions calculation */}
              <div className="space-y-4">
                {/* Fuel Selection */}
                <div className="space-y-1.5">
                  <Label className="text-sm">Fuel <span className="text-red-500">*</span></Label>
                  <Select
                    value={fieldValues['fuel_id'] || ''}
                    onValueChange={(v) => {
                      const selectedFuel = filteredFuels.find(f => f.id === v);
                      setFieldValues(p => ({ 
                        ...p, 
                        fuel_id: v,
                        fuel_name: selectedFuel?.fuel_name || '',
                        fuel_code: selectedFuel?.fuel_code || selectedFuel?.fuel_name || '',
                      }));
                    }}
                  >
                    <SelectTrigger className="bg-stone-50" data-testid="fuel-picker">
                      <SelectValue placeholder="Select fuel from database" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredFuels.map((fuel) => (
                        <SelectItem key={fuel.id} value={fuel.id}>
                          {fuel.fuel_name}
                        </SelectItem>
                      ))}
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
                            EF CO₂: {fuel.emission_factor_co2}
                          </span>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Quantity Input */}
                <div className="space-y-1.5">
                  <Label className="text-sm">Quantity <span className="text-red-500">*</span></Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="Enter quantity"
                      value={fieldValues['quantity'] || ''}
                      onChange={(e) => setFieldValues(p => ({ ...p, quantity: e.target.value }))}
                      className="bg-stone-50 flex-1"
                      data-testid="field-quantity"
                    />
                    <Select
                      value={fieldValues['quantity_unit'] || 'kg'}
                      onValueChange={(v) => setFieldValues(p => ({ ...p, quantity_unit: v }))}
                    >
                      <SelectTrigger className="w-24 bg-stone-50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(() => {
                          const fuel = fuels.find(f => f.id === fieldValues['fuel_id']);
                          const allowedUnits = fuel?.allowed_units || ['kg', 't', 'L', 'kL', 'm3', 'MJ', 'GJ', 'TJ'];
                          return allowedUnits.map(u => (
                            <SelectItem key={u} value={u}>{u}</SelectItem>
                          ));
                        })()}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Optional Custom Emission Factor Override */}
                <div className="space-y-1.5 pt-3 border-t border-stone-200">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={fieldValues['use_custom_ef'] === true}
                      onCheckedChange={(v) => setFieldValues(p => ({ 
                        ...p, 
                        use_custom_ef: v,
                        ef_q_co2_provided: v ? 'true' : 'false'
                      }))}
                    />
                    <Label className="text-sm">Use custom emission factor (override)</Label>
                  </div>
                  {fieldValues['use_custom_ef'] && (
                    <div className="ml-6 space-y-2">
                      <div className="flex gap-2 items-center">
                        <Label className="text-xs w-20">EF CO₂:</Label>
                        <Input
                          type="number"
                          placeholder="kg CO₂ per unit"
                          value={fieldValues['custom_ef_co2'] || ''}
                          onChange={(e) => setFieldValues(p => ({ ...p, custom_ef_co2: e.target.value }))}
                          className="bg-stone-50 flex-1"
                        />
                      </div>
                      <div className="flex gap-2 items-center">
                        <Label className="text-xs w-20">EF CH₄:</Label>
                        <Input
                          type="number"
                          placeholder="kg CH₄ per unit"
                          value={fieldValues['custom_ef_ch4'] || ''}
                          onChange={(e) => setFieldValues(p => ({ ...p, custom_ef_ch4: e.target.value }))}
                          className="bg-stone-50 flex-1"
                        />
                      </div>
                      <div className="flex gap-2 items-center">
                        <Label className="text-xs w-20">EF N₂O:</Label>
                        <Input
                          type="number"
                          placeholder="kg N₂O per unit"
                          value={fieldValues['custom_ef_n2o'] || ''}
                          onChange={(e) => setFieldValues(p => ({ ...p, custom_ef_n2o: e.target.value }))}
                          className="bg-stone-50 flex-1"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Additional mapped fields from Input Field Mappings */}
              {relevantMappings.length > 0 && relevantMappings.some(m => m.fields?.length > 0) && (
                <div className="pt-3 border-t border-stone-200">
                  <Label className="text-xs text-text-muted mb-2 block">Additional Mapped Fields</Label>
                  {relevantMappings.map((mapping) => (
                    mapping.fields?.length > 0 && (
                      <div key={mapping.id} className="space-y-3">
                        {mapping.fields.map((field) => (
                          <div key={field.field_key} className="space-y-1">
                            <Label className="text-sm">{field.label || field.field_key}</Label>
                            <Input
                              type={field.field_type === 'number' ? 'number' : 'text'}
                              placeholder={field.placeholder || `Enter ${field.label || field.field_key}`}
                              value={fieldValues[field.field_key] || ''}
                              onChange={(e) => setFieldValues(p => ({ ...p, [field.field_key]: e.target.value }))}
                              className="bg-stone-50"
                            />
                          </div>
                        ))}
                      </div>
                    )
                  ))}
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
                  {categoryDecisionTree 
                    ? 'Fill in the required fields to resolve the formula via decision tree'
                    : 'No formula configured for this category'
                  }
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
