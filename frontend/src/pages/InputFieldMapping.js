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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { Plus, Trash2, Edit, Search, FormInput, GripVertical, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const FIELD_TYPES = [
  { value: 'number', label: 'Number (numeric input)' },
  { value: 'text', label: 'Text (free text)' },
  { value: 'select', label: 'Select (dropdown with static options)' },
  { value: 'fuel_select', label: 'Fuel Select (from fuel database)' },
  { value: 'unit_select', label: 'Unit Select (dynamic from fuel allowed_units)' },
  { value: 'date', label: 'Date (date picker)' },
  { value: 'checkbox', label: 'Checkbox (boolean)' },
];

const EMPTY_FORM = {
  field_key: '',
  field_label: '',
  field_type: 'number',
  maps_to_variable: '',
  maps_to_context: '',
  default_unit: '',
  allowed_units: [],
  unit_source: 'static', // 'static' / 'fuel' / 'scope3_ef' / 'all_units' / 'none' / 'text'
  // Optional: name of another field's maps_to_variable. When set, the unit
  // dropdown for this field is rendered with each option suffixed by
  // "/<that variable's unit>" (e.g. "l/min"). Backend converts only the
  // base part on save.
  compound_with_variable: '',
  is_required: false,
  is_override: false,
  display_order: 0,
  applies_to_categories: [],
  applies_to_scopes: [],
  placeholder: '',
  help_text: '',
  options: [], // For 'select' field_type - static dropdown options
};

export default function InputFieldMapping() {
  const { getAuthHeader } = useAuth();
  const [mappings, setMappings] = useState([]);
  const [variables, setVariables] = useState([]);
  const [categories, setCategories] = useState([]);
  const [scopes, setScopes] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [unitInput, setUnitInput] = useState('');

  // Delete confirmation dialog
  const [deleteDialog, setDeleteDialog] = useState({ open: false, mapping: null });

  const load = useCallback(async () => {
    try {
      const [mRes, vRes, cRes, sRes, uRes] = await Promise.all([
        axios.get(`${API}/calc-engine/input-field-mappings`, { headers: getAuthHeader() }),
        axios.get(`${API}/calc-engine/variables`, { headers: getAuthHeader() }),
        axios.get(`${API}/categories`, { headers: getAuthHeader() }),
        axios.get(`${API}/scopes`, { headers: getAuthHeader() }),
        axios.get(`${API}/calc-engine/units`, { headers: getAuthHeader() }),
      ]);
      setMappings(mRes.data || []);
      setVariables(vRes.data || []);
      setCategories(cRes.data || []);
      setScopes(sRes.data || []);
      const allUnits = [...(uRes.data.simple || []), ...(uRes.data.compound || [])];
      setUnits(allUnits);
    } catch (e) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return mappings;
    return mappings.filter((m) =>
      m.field_key.toLowerCase().includes(term) ||
      (m.field_label || '').toLowerCase().includes(term) ||
      (m.maps_to_variable || '').toLowerCase().includes(term)
    );
  }, [mappings, search]);

  // Variables that can be mapped to input fields:
  // - All input variables
  // - Property variables that are overridable
  const mappableVariables = useMemo(() => {
    return variables.filter((v) => 
      v.type === 'input' || 
      (v.type === 'property' && v.is_overridable === true)
    );
  }, [variables]);

  const openCreate = () => {
    setEditingMapping(null);
    setForm({ ...EMPTY_FORM, display_order: mappings.length });
    setUnitInput('');
    setDialogOpen(true);
  };

  const openEdit = (m) => {
    setEditingMapping(m);
    setForm({
      field_key: m.field_key,
      field_label: m.field_label || '',
      field_type: m.field_type || 'number',
      maps_to_variable: m.maps_to_variable || '',
      maps_to_context: m.maps_to_context || '',
      default_unit: m.default_unit || '',
      allowed_units: m.allowed_units || [],
      unit_source: m.unit_source || 'static',
      compound_with_variable: m.compound_with_variable || '',
      is_required: m.is_required || false,
      is_override: m.is_override || false,
      display_order: m.display_order || 0,
      applies_to_categories: m.applies_to_categories || [],
      applies_to_scopes: m.applies_to_scopes || [],
      placeholder: m.placeholder || '',
      help_text: m.help_text || '',
      options: m.options || [],
    });
    setUnitInput('');
    setDialogOpen(true);
  };

  const addUnit = () => {
    if (unitInput.trim() && !form.allowed_units.includes(unitInput.trim())) {
      setForm({ ...form, allowed_units: [...form.allowed_units, unitInput.trim()] });
      setUnitInput('');
    }
  };

  const removeUnit = (u) => {
    setForm({ ...form, allowed_units: form.allowed_units.filter((x) => x !== u) });
  };

  const toggleCategory = (catId) => {
    setForm((f) => ({
      ...f,
      applies_to_categories: f.applies_to_categories.includes(catId)
        ? f.applies_to_categories.filter((c) => c !== catId)
        : [...f.applies_to_categories, catId],
    }));
  };

  const toggleScope = (scopeId) => {
    setForm((f) => {
      const newScopes = f.applies_to_scopes.includes(scopeId)
        ? f.applies_to_scopes.filter((s) => s !== scopeId)
        : [...f.applies_to_scopes, scopeId];
      
      // Also clear categories that don't belong to selected scopes
      const validCatIds = categories
        .filter(c => newScopes.includes(c.scope_id))
        .map(c => c.id);
      const newCatIds = f.applies_to_categories.filter(id => validCatIds.includes(id));
      
      return {
        ...f,
        applies_to_scopes: newScopes,
        applies_to_categories: newCatIds,
      };
    });
  };

  // Filter categories based on selected scopes
  const filteredCategoriesForForm = useMemo(() => {
    if (form.applies_to_scopes.length === 0) {
      return categories; // Show all if no scope selected
    }
    return categories.filter(c => form.applies_to_scopes.includes(c.scope_id));
  }, [categories, form.applies_to_scopes]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      if (editingMapping) {
        await axios.put(`${API}/super-admin/calc-engine/input-field-mappings/${editingMapping.id}`, form, { headers: getAuthHeader() });
        toast.success('Mapping updated');
      } else {
        await axios.post(`${API}/super-admin/calc-engine/input-field-mappings`, form, { headers: getAuthHeader() });
        toast.success('Mapping created');
      }
      setDialogOpen(false);
      load(); // Don't await
    } catch (err) {
      console.error('Save error:', err);
      toast.error(err.response?.data?.detail || 'Save failed');
    }
  };

  const remove = async (m) => {
    setDeleteDialog({ open: true, mapping: m });
  };

  const confirmDelete = async () => {
    const m = deleteDialog.mapping;
    if (!m) return;
    try {
      await axios.delete(`${API}/super-admin/calc-engine/input-field-mappings/${m.id}`, { headers: getAuthHeader() });
      toast.success('Mapping deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Delete failed');
    } finally {
      setDeleteDialog({ open: false, mapping: null });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-6" data-testid="input-field-mapping-page">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2 flex items-center gap-3">
            <FormInput className="w-8 h-8 text-primary" />
            Input Field Mapping
          </h1>
          <p className="text-text-secondary">Define how UI input fields connect to formula variables and context. Controls what fields appear in the emissions form.</p>
        </div>
        <Button onClick={openCreate} className="bg-primary hover:bg-primary/90 text-white rounded-full px-6" data-testid="add-mapping-btn">
          <Plus className="w-4 h-4 mr-2" />Add Field Mapping
        </Button>
      </div>

      <Card className="p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search fields…" className="pl-9 bg-stone-50" />
        </div>
        <div className="ml-auto text-sm text-text-muted">{filtered.length} mappings</div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-text-muted">
            <tr>
              <th className="px-4 py-3 w-8">#</th>
              <th className="px-4 py-3">Field Key</th>
              <th className="px-4 py-3">Label</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Maps To</th>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3">Scope/Category</th>
              <th className="px-4 py-3 w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m, idx) => (
              <tr key={m.id} className="border-t border-stone-100 hover:bg-stone-50/50" data-testid={`mapping-row-${m.field_key}`}>
                <td className="px-4 py-3 text-text-muted"><GripVertical className="w-4 h-4" /></td>
                <td className="px-4 py-3 font-mono font-medium text-text-primary">{m.field_key}</td>
                <td className="px-4 py-3">
                  {m.field_label}
                  {m.is_required && <Badge className="ml-2 bg-red-100 text-red-700 hover:bg-red-100 text-xs">required</Badge>}
                </td>
                <td className="px-4 py-3"><Badge variant="outline" className="text-xs">{m.field_type}</Badge></td>
                <td className="px-4 py-3">
                  {m.maps_to_variable && (
                    <div className="flex items-center gap-1 text-xs">
                      <ArrowRight className="w-3 h-3 text-blue-500" />
                      <span className="font-mono text-blue-700">{m.maps_to_variable}</span>
                    </div>
                  )}
                  {m.maps_to_context && (
                    <div className="flex items-center gap-1 text-xs">
                      <ArrowRight className="w-3 h-3 text-amber-500" />
                      <span className="font-mono text-amber-700">ctx:{m.maps_to_context}</span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-text-muted">{m.default_unit || '—'}</td>
                <td className="px-4 py-3">
                  {(m.applies_to_scopes?.length === 0 && m.applies_to_categories?.length === 0) ? (
                    <Badge variant="secondary" className="text-xs">All</Badge>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {m.applies_to_scopes?.map((s) => {
                        const scope = scopes.find((x) => x.id === s);
                        return <Badge key={s} variant="outline" className="text-xs">{scope?.name || s}</Badge>;
                      })}
                      {m.applies_to_categories?.map((c) => {
                        const cat = categories.find((x) => x.id === c);
                        return <Badge key={c} className="bg-stone-100 text-stone-700 hover:bg-stone-100 text-xs">{cat?.name || c}</Badge>;
                      })}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(m)} data-testid={`edit-mapping-${m.field_key}`}><Edit className="w-4 h-4 text-blue-500" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(m)} className="text-red-500"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-text-muted">No field mappings defined. Add one to connect UI fields to formula variables.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingMapping ? 'Edit Field Mapping' : 'Add Field Mapping'}</DialogTitle>
            <DialogDescription>Connect a UI input field to a formula variable or context key.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Field Key *</Label>
                <Input
                  value={form.field_key}
                  onChange={(e) => setForm({ ...form, field_key: e.target.value })}
                  required
                  className="bg-stone-50 font-mono"
                  placeholder="e.g., quantity, distance"
                  disabled={!!editingMapping}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Field Label *</Label>
                <Input
                  value={form.field_label}
                  onChange={(e) => setForm({ ...form, field_label: e.target.value })}
                  required
                  className="bg-stone-50"
                  placeholder="e.g., Activity Quantity"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Field Type</Label>
                <Select value={form.field_type} onValueChange={(v) => setForm({ ...form, field_type: v, options: v === 'select' ? form.options : [] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Display Order</Label>
                <Input
                  type="number"
                  value={form.display_order}
                  onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value) || 0 })}
                  className="bg-stone-50"
                />
              </div>
              <div className="space-y-1.5 flex items-end pb-2">
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={form.is_required}
                    onCheckedChange={(v) => setForm({ ...form, is_required: !!v })}
                  />
                  <span className="text-sm">Required field</span>
                </label>
                <label className="flex items-center gap-2 ml-4">
                  <Checkbox
                    checked={form.is_override}
                    onCheckedChange={(v) => setForm({ ...form, is_override: !!v })}
                  />
                  <span className="text-sm">Is Override</span>
                </label>
              </div>
            </div>

            {/* Static Options for Select Field Type */}
            {form.field_type === 'select' && (
              <Card className="p-4 bg-amber-50/50 border border-amber-200">
                <Label className="font-heading font-bold mb-3 block">Dropdown Options</Label>
                <p className="text-xs text-text-muted mb-3">
                  Add the options that will appear in the dropdown. Each option has a value (used in calculations) and a label (shown to user).
                </p>
                <div className="space-y-2">
                  {(form.options || []).map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        value={opt.value || ''}
                        onChange={(e) => {
                          const newOptions = [...(form.options || [])];
                          newOptions[idx] = { ...newOptions[idx], value: e.target.value };
                          setForm({ ...form, options: newOptions });
                        }}
                        placeholder="Value (e.g. true, diesel)"
                        className="bg-white flex-1 font-mono text-sm"
                      />
                      <Input
                        value={opt.label || ''}
                        onChange={(e) => {
                          const newOptions = [...(form.options || [])];
                          newOptions[idx] = { ...newOptions[idx], label: e.target.value };
                          setForm({ ...form, options: newOptions });
                        }}
                        placeholder="Label (e.g. Yes, Diesel Fuel)"
                        className="bg-white flex-1 text-sm"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-red-500"
                        onClick={() => {
                          const newOptions = (form.options || []).filter((_, i) => i !== idx);
                          setForm({ ...form, options: newOptions });
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setForm({ ...form, options: [...(form.options || []), { value: '', label: '' }] })}
                  >
                    <Plus className="w-4 h-4 mr-1" /> Add Option
                  </Button>
                </div>
              </Card>
            )}

            {/* Mapping */}
            <Card className="p-4 bg-blue-50/50 border border-blue-200">
              <Label className="font-heading font-bold mb-3 block">Maps To</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-text-muted">Formula Variable</Label>
                  <Select value={form.maps_to_variable || 'none'} onValueChange={(v) => setForm({ ...form, maps_to_variable: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="Select variable" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {mappableVariables.map((v) => (
                        <SelectItem key={v.key} value={v.key}>
                          {v.key} — {v.label}
                          {v.type === 'property' && v.is_overridable && (
                            <span className="ml-1 text-xs text-amber-600">(override)</span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-text-muted mt-1">
                    Shows input variables + overridable properties
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-text-muted">Or Context Key</Label>
                  <Input
                    value={form.maps_to_context}
                    onChange={(e) => setForm({ ...form, maps_to_context: e.target.value })}
                    className="bg-white"
                    placeholder="e.g., region, activity_type"
                  />
                </div>
              </div>
              <p className="text-xs text-blue-700 mt-2">Variable = direct formula input. Context = used for property lookup & decision tree routing.</p>
            </Card>

            {/* Units */}
            <div className="space-y-2">
              <Label>Units</Label>
              
              {/* Unit Source Selection */}
              <div className="space-y-1.5">
                <Label className="text-xs text-text-muted">Unit Source</Label>
                <Select value={form.unit_source || 'static'} onValueChange={(v) => setForm({ ...form, unit_source: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="static">Static (use allowed units below)</SelectItem>
                    <SelectItem value="fuel">From Fuel Database (use selected fuel's allowed_units)</SelectItem>
                    <SelectItem value="scope3_ef">From Scope 3 EF (use matched entry's unit)</SelectItem>
                    <SelectItem value="all_units">All Units (user selects from all simple + compound units)</SelectItem>
                    <SelectItem value="none">None (no unit — for count / unitless fields)</SelectItem>
                    <SelectItem value="text">Text Input (user types a freeform unit)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-text-muted">
                  {form.unit_source === 'fuel'
                    ? 'Units will be dynamically loaded from the selected fuel\'s allowed_units field'
                    : form.unit_source === 'scope3_ef'
                    ? 'Unit will be loaded from the matched Scope 3 EF entry\'s unit field'
                    : form.unit_source === 'all_units'
                    ? 'User can select any unit from the centralized units list (no transform applied)'
                    : form.unit_source === 'none'
                    ? 'No unit is collected (use this for count / working-days style fields)'
                    : form.unit_source === 'text'
                    ? 'User will type the unit as freeform text. Do not use on fields that feed a calc step.'
                    : 'Units will be taken from the allowed units list below'}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-text-muted">
                  Compound with variable <span className="text-text-muted">(optional)</span>
                </Label>
                <Input
                  value={form.compound_with_variable || ''}
                  onChange={(e) => setForm({ ...form, compound_with_variable: e.target.value })}
                  placeholder='e.g. "lifetime_expected_usage" (linked variable name)'
                  data-testid="input-compound-with-variable"
                />
                <p className="text-xs text-text-muted">
                  When set, this field&apos;s unit dropdown is rendered as <code>{'<base>/<linked-unit>'}</code> at runtime
                  (e.g. <code>l/min</code>). The backend converts only the base part on save and trusts the
                  linked-variable unit as-is. Leave blank to disable.
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-text-muted">Default Unit</Label>
                  <Select value={form.default_unit || 'none'} onValueChange={(v) => setForm({ ...form, default_unit: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="Select default unit" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {units.map((u) => <SelectItem key={u.key} value={u.key}>{u.key} — {u.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-text-muted">
                    Allowed Units {(form.unit_source === 'fuel' || form.unit_source === 'scope3_ef' || form.unit_source === 'all_units' || form.unit_source === 'none' || form.unit_source === 'text') && <span className="text-amber-600">(ignored for this source)</span>}
                  </Label>
                  <div className={`border rounded-md p-2 bg-white max-h-40 overflow-y-auto space-y-1 ${(form.unit_source === 'fuel' || form.unit_source === 'scope3_ef' || form.unit_source === 'all_units' || form.unit_source === 'none' || form.unit_source === 'text') ? 'opacity-50' : ''}`}>
                    {units.length === 0 ? (
                      <p className="text-xs text-text-muted p-2">No units defined in system</p>
                    ) : (
                      units.map((u) => (
                        <label key={u.key} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-stone-50 p-1 rounded">
                          <Checkbox
                            checked={form.allowed_units.includes(u.key)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setForm({ ...form, allowed_units: [...form.allowed_units, u.key] });
                              } else {
                                setForm({ ...form, allowed_units: form.allowed_units.filter(k => k !== u.key) });
                              }
                            }}
                          />
                          <span>{u.key}</span>
                          <span className="text-xs text-text-muted">({u.label})</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>
              {form.allowed_units.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  <span className="text-xs text-text-muted mr-2">Selected:</span>
                  {form.allowed_units.map((u) => (
                    <Badge key={u} variant="outline" className="cursor-pointer hover:bg-red-50" onClick={() => setForm({ ...form, allowed_units: form.allowed_units.filter(k => k !== u) })}>
                      {u} ×
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Scope/Category Filter */}
            <div className="space-y-3">
              <Label>Applies To (leave empty for all)</Label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-text-muted mb-2 block">Scopes (select first)</Label>
                  <div className="space-y-1 max-h-32 overflow-y-auto border rounded-md p-2 bg-white">
                    {scopes.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-stone-50 p-1 rounded">
                        <Checkbox
                          checked={form.applies_to_scopes.includes(s.id)}
                          onCheckedChange={() => toggleScope(s.id)}
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
                        {form.applies_to_scopes.length === 0 
                          ? 'Select scope(s) first to see categories' 
                          : 'No categories for selected scope(s)'}
                      </div>
                    ) : (
                      filteredCategoriesForForm.map((c) => {
                        const scope = scopes.find(s => s.id === c.scope_id);
                        return (
                          <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-stone-50 p-1 rounded">
                            <Checkbox
                              checked={form.applies_to_categories.includes(c.id)}
                              onCheckedChange={() => toggleCategory(c.id)}
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
              <p className="text-xs text-blue-700">
                Selected: {form.applies_to_scopes.length} scope(s), {form.applies_to_categories.length} category(ies)
              </p>
            </div>

            {/* Placeholder & Help */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Placeholder</Label>
                <Input
                  value={form.placeholder}
                  onChange={(e) => setForm({ ...form, placeholder: e.target.value })}
                  className="bg-stone-50"
                  placeholder="e.g., Enter quantity..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Help Text</Label>
                <Input
                  value={form.help_text}
                  onChange={(e) => setForm({ ...form, help_text: e.target.value })}
                  className="bg-stone-50"
                  placeholder="e.g., Total fuel consumed"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancel</Button>
              <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90 text-white" data-testid="save-mapping-btn">
                {editingMapping ? 'Update Mapping' : 'Create Mapping'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, mapping: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Field Mapping</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the field mapping "{deleteDialog.mapping?.field_key}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
