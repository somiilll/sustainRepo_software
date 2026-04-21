import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Checkbox } from '../components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Plus, Trash2, Edit, ChevronDown, ChevronRight, GripVertical, Play,
  AlertCircle, Check, X, Copy, Eye, Code2, GitBranch,
} from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const EMPTY_FORMULA = {
  name: '',
  description: '',
  scope_ids: [],      // Multiple scopes supported
  category_ids: [],   // Multiple categories supported
  category_id: '',    // Legacy single category (for backward compatibility)
  definition: {
    inputs: [],
    properties: [],
    steps: [],
    outputs: [],
  },
};

const EMPTY_INPUT = { variable: '', expected_unit: '', required: true, allow_dimension_conversion: false, allowed_transformations: [] };
const EMPTY_PROPERTY = { variable: '', expected_unit: '' };
const EMPTY_STEP = { name: '', type: 'expression', expression: '' };
const EMPTY_OUTPUT = { variable: '', unit: '', produced_by_step: '' };

export default function FormulaBuilder() {
  const { getAuthHeader } = useAuth();
  const [formulas, setFormulas] = useState([]);
  const [scopes, setScopes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [variables, setVariables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState([]);

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [formula, setFormula] = useState(EMPTY_FORMULA);
  const [editingId, setEditingId] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [expandedFormula, setExpandedFormula] = useState(null);

  // Search & filter
  const [search, setSearch] = useState('');
  const [filterScope, setFilterScope] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');

  const load = useCallback(async () => {
    try {
      const [fRes, sRes, cRes, vRes, uRes] = await Promise.all([
        axios.get(`${API}/calc-engine/formulas`, { headers: getAuthHeader() }),
        axios.get(`${API}/scopes`, { headers: getAuthHeader() }),
        axios.get(`${API}/categories`, { headers: getAuthHeader() }),
        axios.get(`${API}/calc-engine/variables`, { headers: getAuthHeader() }),
        axios.get(`${API}/calc-engine/units`, { headers: getAuthHeader() }),
      ]);
      setFormulas(fRes.data || []);
      setScopes(sRes.data || []);
      setCategories(cRes.data || []);
      setVariables(vRes.data || []);
      // Combine simple and compound units
      const allUnits = [
        ...(uRes.data.simple || []),
        ...(uRes.data.compound || []),
      ];
      setUnits(allUnits);
    } catch (e) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  useEffect(() => { load(); }, [load]);

  // Filter categories by selected scope for the form
  const filteredCategoriesForForm = useMemo(() => {
    if (!formula.scope_ids || formula.scope_ids.length === 0) {
      return categories; // Show all if no scope selected
    }
    return categories.filter(c => formula.scope_ids.includes(c.scope_id));
  }, [categories, formula.scope_ids]);

  // Filter categories by filter scope for the list
  const filteredCategoriesForFilter = useMemo(() => {
    if (filterScope === 'all') return categories;
    return categories.filter(c => c.scope_id === filterScope);
  }, [categories, filterScope]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return formulas.filter((f) => {
      if (term && !(f.name.toLowerCase().includes(term) || (f.description || '').toLowerCase().includes(term))) return false;
      // Filter by scope
      if (filterScope !== 'all') {
        const formulaScopeIds = f.scope_ids || [];
        const formulaCatIds = f.category_ids || (f.category_id ? [f.category_id] : []);
        // Check if formula has matching scope or category under that scope
        const scopeCatIds = categories.filter(c => c.scope_id === filterScope).map(c => c.id);
        const hasMatchingScope = formulaScopeIds.includes(filterScope);
        const hasMatchingCategory = formulaCatIds.some(cid => scopeCatIds.includes(cid));
        if (!hasMatchingScope && !hasMatchingCategory) return false;
      }
      // Filter by category
      if (filterCategory !== 'all') {
        const formulaCatIds = f.category_ids || (f.category_id ? [f.category_id] : []);
        if (!formulaCatIds.includes(filterCategory)) return false;
      }
      return true;
    });
  }, [formulas, search, filterScope, filterCategory, categories]);

  // Variable helpers
  const inputVars = useMemo(() => variables.filter((v) => v.type === 'input'), [variables]);
  const propVars = useMemo(() => variables.filter((v) => v.type === 'property'), [variables]);
  const outputVars = useMemo(() => variables.filter((v) => v.type === 'output'), [variables]);

  // Dependency graph preview
  const dependencyGraph = useMemo(() => {
    const { inputs, properties, steps } = formula.definition;
    const deps = {};
    const all = [
      ...inputs.map((i) => ({ name: i.variable, type: 'input' })),
      ...properties.map((p) => ({ name: p.variable, type: 'property' })),
    ];

    steps.forEach((s) => {
      if (!s.name) return;
      const matches = s.expression.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
      const usedVars = matches.filter((m) => !['Math', 'abs', 'pow', 'sqrt', 'min', 'max'].includes(m));
      deps[s.name] = usedVars;
      all.push({ name: s.name, type: 'step' });
    });

    return { nodes: all, deps };
  }, [formula.definition]);

  // Handlers
  const openCreate = () => {
    setFormula(JSON.parse(JSON.stringify(EMPTY_FORMULA)));
    setEditingId(null);
    setValidationErrors([]);
    setEditorOpen(true);
  };

  const openEdit = (f) => {
    setFormula({
      name: f.name,
      description: f.description || '',
      scope_ids: f.scope_ids || [],
      category_ids: f.category_ids || (f.category_id ? [f.category_id] : []),
      category_id: f.category_id || '',
      definition: JSON.parse(JSON.stringify(f.definition)),
    });
    setEditingId(f.id);
    setValidationErrors([]);
    setEditorOpen(true);
  };

  const updateDef = (path, value) => {
    setFormula((prev) => {
      const next = { ...prev, definition: { ...prev.definition } };
      const keys = path.split('.');
      let cur = next.definition;
      for (let i = 0; i < keys.length - 1; i++) {
        cur = cur[keys[i]];
      }
      cur[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const addInput = () => updateDef('inputs', [...formula.definition.inputs, { ...EMPTY_INPUT }]);
  const addProperty = () => updateDef('properties', [...formula.definition.properties, { ...EMPTY_PROPERTY }]);
  const addStep = () => updateDef('steps', [...formula.definition.steps, { ...EMPTY_STEP }]);
  const addOutput = () => updateDef('outputs', [...formula.definition.outputs, { ...EMPTY_OUTPUT }]);

  const removeItem = (arr, idx) => arr.filter((_, i) => i !== idx);
  const updateItem = (arr, idx, patch) => arr.map((item, i) => (i === idx ? { ...item, ...patch } : item));

  const validate = async () => {
    const errors = [];
    const def = formula.definition;
    if (!formula.name.trim()) errors.push('Formula name is required');
    if (def.inputs.length === 0) errors.push('At least one input is required');
    if (def.steps.length === 0) errors.push('At least one calculation step is required');
    if (def.outputs.length === 0) errors.push('At least one output is required');
    def.inputs.forEach((inp, i) => {
      if (!inp.variable) errors.push(`Input #${i + 1}: variable is required`);
      if (!inp.expected_unit) errors.push(`Input #${i + 1}: expected_unit is required`);
    });
    def.steps.forEach((s, i) => {
      if (!s.name) errors.push(`Step #${i + 1}: name is required`);
      if (!s.expression) errors.push(`Step #${i + 1}: expression is required`);
    });
    def.outputs.forEach((o, i) => {
      if (!o.variable) errors.push(`Output #${i + 1}: variable is required`);
      if (!o.unit) errors.push(`Output #${i + 1}: unit is required`);
    });
    setValidationErrors(errors);
    return errors.length === 0;
  };

  const save = async () => {
    if (!(await validate())) return;
    setSaving(true);
    try {
      const payload = {
        name: formula.name,
        description: formula.description,
        scope_ids: formula.scope_ids || [],
        category_ids: formula.category_ids || [],
        category_id: formula.category_ids?.length > 0 ? formula.category_ids[0] : (formula.category_id || null),
        definition: formula.definition,
      };
      if (editingId) {
        await axios.put(`${API}/super-admin/calc-engine/formulas/${editingId}`, payload, { headers: getAuthHeader() });
        toast.success('Formula updated');
      } else {
        await axios.post(`${API}/super-admin/calc-engine/formulas`, payload, { headers: getAuthHeader() });
        toast.success('Formula created');
      }
      setEditorOpen(false);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const deleteFormula = async (id) => {
    if (!window.confirm('Deactivate this formula?')) return;
    try {
      await axios.delete(`${API}/super-admin/calc-engine/formulas/${id}`, { headers: getAuthHeader() });
      toast.success('Formula deactivated');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Delete failed');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-6" data-testid="formula-builder-page">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2 flex items-center gap-3">
            <Code2 className="w-8 h-8 text-primary" />
            Formula Builder
          </h1>
          <p className="text-text-secondary">Create and manage calculation formulas for the new Calc Engine with visual step editing.</p>
        </div>
        <Button onClick={openCreate} className="bg-primary hover:bg-primary/90 text-white rounded-full px-6" data-testid="create-formula-btn">
          <Plus className="w-4 h-4 mr-2" />Create Formula
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4 flex flex-wrap gap-3 items-center">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search formulas…"
          className="bg-stone-50 max-w-xs"
        />
        <Select value={filterScope} onValueChange={(v) => { setFilterScope(v); setFilterCategory('all'); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All scopes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All scopes</SelectItem>
            {scopes.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {filteredCategoriesForFilter.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto text-sm text-text-muted">{filtered.length} formulas</div>
      </Card>

      {/* Formula List */}
      <div className="space-y-3">
        {filtered.map((f) => {
          // Get all scopes and categories for this formula
          const formulaScopeIds = f.scope_ids || [];
          const formulaCatIds = f.category_ids || (f.category_id ? [f.category_id] : []);
          const formulaScopes = scopes.filter(s => formulaScopeIds.includes(s.id));
          const formulaCats = categories.filter(c => formulaCatIds.includes(c.id));
          const isExpanded = expandedFormula === f.id;
          return (
            <Card key={f.id} className="overflow-hidden">
              <div
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-stone-50/50"
                onClick={() => setExpandedFormula(isExpanded ? null : f.id)}
                data-testid={`formula-row-${f.id}`}
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-stone-400" /> : <ChevronRight className="w-4 h-4 text-stone-400" />}
                  <div>
                    <div className="font-heading font-bold text-text-primary">{f.name}</div>
                    <div className="text-sm text-text-muted">{f.description || 'No description'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {formulaScopes.map(s => (
                    <Badge key={s.id} className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-xs">{s.name}</Badge>
                  ))}
                  {formulaCats.map(c => (
                    <Badge key={c.id} variant="outline" className="text-xs">{c.name}</Badge>
                  ))}
                  {formulaScopes.length === 0 && formulaCats.length === 0 && (
                    <Badge variant="secondary" className="text-xs">All</Badge>
                  )}
                  <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">v{f.version_number || 1}</Badge>
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openEdit(f); }} data-testid={`edit-formula-${f.id}`}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-500" onClick={(e) => { e.stopPropagation(); deleteFormula(f.id); }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {isExpanded && (
                <div className="border-t border-stone-100 p-4 bg-stone-50/30">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="font-medium text-text-muted mb-1">Inputs</div>
                      {f.definition.inputs.map((inp, i) => (
                        <div key={i} className="font-mono text-xs">{inp.variable} <span className="text-text-muted">({inp.expected_unit})</span></div>
                      ))}
                    </div>
                    <div>
                      <div className="font-medium text-text-muted mb-1">Properties</div>
                      {(f.definition.properties || []).map((p, i) => (
                        <div key={i} className="font-mono text-xs">{p.variable} <span className="text-text-muted">({p.expected_unit})</span></div>
                      ))}
                    </div>
                    <div>
                      <div className="font-medium text-text-muted mb-1">Steps</div>
                      {f.definition.steps.map((s, i) => (
                        <div key={i} className="font-mono text-xs">{s.name} = <span className="text-primary">{s.expression}</span></div>
                      ))}
                    </div>
                    <div>
                      <div className="font-medium text-text-muted mb-1">Outputs</div>
                      {f.definition.outputs.map((o, i) => (
                        <div key={i} className="font-mono text-xs">{o.variable} <span className="text-text-muted">({o.unit})</span></div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <Card className="p-12 text-center text-text-muted">
            No formulas found. Create one to get started.
          </Card>
        )}
      </div>

      {/* Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Formula' : 'Create Formula'}</DialogTitle>
            <DialogDescription>Define inputs, properties, calculation steps, and outputs.</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Metadata */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input
                  value={formula.name}
                  onChange={(e) => setFormula({ ...formula, name: e.target.value })}
                  placeholder="Stationary Combustion - Mass Based"
                  className="bg-stone-50"
                  data-testid="formula-name-input"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={formula.description}
                onChange={(e) => setFormula({ ...formula, description: e.target.value })}
                rows={2}
                className="bg-stone-50"
                placeholder="Brief description of when this formula applies..."
              />
            </div>

            {/* Scope & Category Selection */}
            <Card className="p-4 bg-blue-50/50 border border-blue-200">
              <Label className="font-heading font-bold mb-3 block">Applies To (leave empty for all)</Label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-text-muted mb-2 block">Scopes (select first)</Label>
                  <div className="space-y-1 max-h-32 overflow-y-auto border rounded-md p-2 bg-white">
                    {scopes.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-stone-50 p-1 rounded">
                        <Checkbox
                          checked={(formula.scope_ids || []).includes(s.id)}
                          onCheckedChange={(checked) => {
                            const currentScopes = formula.scope_ids || [];
                            const newScopes = checked
                              ? [...currentScopes, s.id]
                              : currentScopes.filter(id => id !== s.id);
                            // Also clear categories that don't belong to selected scopes
                            const validCatIds = categories
                              .filter(c => newScopes.includes(c.scope_id))
                              .map(c => c.id);
                            const newCatIds = (formula.category_ids || []).filter(id => validCatIds.includes(id));
                            setFormula({ ...formula, scope_ids: newScopes, category_ids: newCatIds });
                          }}
                        />
                        {s.name}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-text-muted mb-2 block">Categories (filtered by scope)</Label>
                  <div className="space-y-1 max-h-32 overflow-y-auto border rounded-md p-2 bg-white">
                    {filteredCategoriesForForm.length === 0 ? (
                      <div className="text-xs text-text-muted p-2">
                        {(formula.scope_ids || []).length === 0 
                          ? 'Select scope(s) first to see categories' 
                          : 'No categories for selected scope(s)'}
                      </div>
                    ) : (
                      filteredCategoriesForForm.map((c) => {
                        const scope = scopes.find(s => s.id === c.scope_id);
                        return (
                          <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-stone-50 p-1 rounded">
                            <Checkbox
                              checked={(formula.category_ids || []).includes(c.id)}
                              onCheckedChange={(checked) => {
                                const current = formula.category_ids || [];
                                const newCatIds = checked
                                  ? [...current, c.id]
                                  : current.filter(id => id !== c.id);
                                setFormula({ ...formula, category_ids: newCatIds });
                              }}
                            />
                            <span>{c.name}</span>
                            {scope && <span className="text-xs text-text-muted">({scope.name})</span>}
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
              <p className="text-xs text-blue-700 mt-2">
                Selected: {(formula.scope_ids || []).length} scope(s), {(formula.category_ids || []).length} category(ies)
              </p>
            </Card>

            {/* Inputs */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-heading font-bold">Inputs</Label>
                <Button size="sm" variant="outline" onClick={addInput} data-testid="add-input-btn"><Plus className="w-3 h-3 mr-1" />Add</Button>
              </div>
              {formula.definition.inputs.map((inp, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-2 items-center bg-stone-50 p-3 rounded-lg">
                  <Select value={inp.variable} onValueChange={(v) => updateDef('inputs', updateItem(formula.definition.inputs, idx, { variable: v }))}>
                    <SelectTrigger><SelectValue placeholder="Variable" /></SelectTrigger>
                    <SelectContent>
                      {inputVars.map((v) => <SelectItem key={v.key} value={v.key}>{v.key} — {v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={inp.expected_unit || 'none'} onValueChange={(v) => updateDef('inputs', updateItem(formula.definition.inputs, idx, { expected_unit: v === 'none' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Select unit —</SelectItem>
                      {units.map((u) => <SelectItem key={u.key} value={u.key}>{u.key} — {u.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={inp.required}
                      onChange={(e) => updateDef('inputs', updateItem(formula.definition.inputs, idx, { required: e.target.checked }))}
                    />
                    Required
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={inp.allow_dimension_conversion}
                      onChange={(e) => updateDef('inputs', updateItem(formula.definition.inputs, idx, { allow_dimension_conversion: e.target.checked }))}
                    />
                    Allow transform
                  </label>
                  <Button size="sm" variant="ghost" className="text-red-500" onClick={() => updateDef('inputs', removeItem(formula.definition.inputs, idx))}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Properties */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-heading font-bold">Properties (auto-resolved)</Label>
                <Button size="sm" variant="outline" onClick={addProperty} data-testid="add-property-btn"><Plus className="w-3 h-3 mr-1" />Add</Button>
              </div>
              {formula.definition.properties.map((prop, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center bg-amber-50/50 p-3 rounded-lg">
                  <Select value={prop.variable} onValueChange={(v) => updateDef('properties', updateItem(formula.definition.properties, idx, { variable: v }))}>
                    <SelectTrigger><SelectValue placeholder="Property variable" /></SelectTrigger>
                    <SelectContent>
                      {propVars.map((v) => <SelectItem key={v.key} value={v.key}>{v.key} — {v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={prop.expected_unit || 'none'} onValueChange={(v) => updateDef('properties', updateItem(formula.definition.properties, idx, { expected_unit: v === 'none' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Select unit —</SelectItem>
                      {units.map((u) => <SelectItem key={u.key} value={u.key}>{u.key} — {u.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="ghost" className="text-red-500" onClick={() => updateDef('properties', removeItem(formula.definition.properties, idx))}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Steps */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-heading font-bold">Calculation Steps</Label>
                <Button size="sm" variant="outline" onClick={addStep} data-testid="add-step-btn"><Plus className="w-3 h-3 mr-1" />Add</Button>
              </div>
              {formula.definition.steps.map((step, idx) => (
                <div key={idx} className="bg-emerald-50/50 p-3 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-stone-400" />
                    <Badge className="text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Step {idx + 1}</Badge>
                    <Input
                      value={step.name}
                      onChange={(e) => updateDef('steps', updateItem(formula.definition.steps, idx, { name: e.target.value }))}
                      placeholder="step_name (e.g. compute_co2)"
                      className="bg-white flex-1 font-mono text-sm"
                    />
                    <Button size="sm" variant="ghost" className="text-red-500" onClick={() => updateDef('steps', removeItem(formula.definition.steps, idx))}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <Input
                    value={step.expression}
                    onChange={(e) => updateDef('steps', updateItem(formula.definition.steps, idx, { expression: e.target.value }))}
                    placeholder="expression (e.g. qty * ef_q_co2)"
                    className="bg-white font-mono text-sm"
                  />
                </div>
              ))}
            </div>

            {/* Outputs */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-heading font-bold">Outputs</Label>
                <Button size="sm" variant="outline" onClick={addOutput} data-testid="add-output-btn"><Plus className="w-3 h-3 mr-1" />Add</Button>
              </div>
              {formula.definition.outputs.map((out, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center bg-blue-50/50 p-3 rounded-lg">
                  <Select value={out.variable} onValueChange={(v) => updateDef('outputs', updateItem(formula.definition.outputs, idx, { variable: v }))}>
                    <SelectTrigger><SelectValue placeholder="Output variable" /></SelectTrigger>
                    <SelectContent>
                      {outputVars.map((v) => <SelectItem key={v.key} value={v.key}>{v.key} — {v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={out.unit || 'none'} onValueChange={(v) => updateDef('outputs', updateItem(formula.definition.outputs, idx, { unit: v === 'none' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Select unit —</SelectItem>
                      {units.map((u) => <SelectItem key={u.key} value={u.key}>{u.key} — {u.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={out.produced_by_step || 'none'} onValueChange={(v) => updateDef('outputs', updateItem(formula.definition.outputs, idx, { produced_by_step: v === 'none' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Produced by step" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Same as variable</SelectItem>
                      {formula.definition.steps.filter((s) => s.name).map((s) => <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="ghost" className="text-red-500" onClick={() => updateDef('outputs', removeItem(formula.definition.outputs, idx))}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Dependency Preview */}
            {dependencyGraph.nodes.length > 0 && (
              <Card className="p-4 border border-stone-200 bg-stone-50/50">
                <div className="flex items-center gap-2 mb-3">
                  <GitBranch className="w-4 h-4 text-primary" />
                  <Label className="font-heading font-bold">Dependency Preview</Label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {dependencyGraph.nodes.map((n) => (
                    <Badge
                      key={n.name}
                      variant="outline"
                      className={`font-mono text-xs ${
                        n.type === 'input' ? 'border-blue-300 bg-blue-50 text-blue-700' :
                        n.type === 'property' ? 'border-amber-300 bg-amber-50 text-amber-700' :
                        'border-emerald-300 bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {n.name}
                      {dependencyGraph.deps[n.name] && (
                        <span className="ml-1 text-[10px] text-text-muted">← {dependencyGraph.deps[n.name].join(', ')}</span>
                      )}
                    </Badge>
                  ))}
                </div>
              </Card>
            )}

            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <Card className="p-4 border border-red-200 bg-red-50">
                <div className="flex items-center gap-2 text-red-700 font-medium mb-2">
                  <AlertCircle className="w-4 h-4" />
                  Validation Errors
                </div>
                <ul className="list-disc list-inside text-sm text-red-600">
                  {validationErrors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </Card>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setEditorOpen(false)} className="flex-1">Cancel</Button>
              <Button onClick={save} disabled={saving} className="flex-1 bg-primary hover:bg-primary/90 text-white" data-testid="save-formula-btn">
                {saving ? 'Saving...' : (editingId ? 'Update Formula' : 'Create Formula')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
