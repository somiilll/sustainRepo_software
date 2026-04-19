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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { Plus, Trash2, Edit, Search, FormInput, GripVertical, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const FIELD_TYPES = [
  { value: 'number', label: 'Number (numeric input)' },
  { value: 'text', label: 'Text (free text)' },
  { value: 'select', label: 'Select (dropdown)' },
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
  is_required: false,
  display_order: 0,
  applies_to_categories: [],
  applies_to_scopes: [],
  placeholder: '',
  help_text: '',
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

  const inputVariables = useMemo(() => variables.filter((v) => v.type === 'input'), [variables]);

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
      is_required: m.is_required || false,
      display_order: m.display_order || 0,
      applies_to_categories: m.applies_to_categories || [],
      applies_to_scopes: m.applies_to_scopes || [],
      placeholder: m.placeholder || '',
      help_text: m.help_text || '',
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
    if (!window.confirm(`Delete field mapping '${m.field_key}'?`)) return;
    try {
      await axios.delete(`${API}/super-admin/calc-engine/input-field-mappings/${m.id}`, { headers: getAuthHeader() });
      toast.success('Mapping deleted');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Delete failed');
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
                <Select value={form.field_type} onValueChange={(v) => setForm({ ...form, field_type: v })}>
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
              </div>
            </div>

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
                      {inputVariables.map((v) => <SelectItem key={v.key} value={v.key}>{v.key} — {v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
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
                  <Label className="text-xs text-text-muted">Allowed Units</Label>
                  <div className="flex gap-2">
                    <Input
                      value={unitInput}
                      onChange={(e) => setUnitInput(e.target.value)}
                      className="bg-stone-50"
                      placeholder="Add unit"
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUnit(); } }}
                    />
                    <Button type="button" variant="outline" onClick={addUnit}><Plus className="w-4 h-4" /></Button>
                  </div>
                </div>
              </div>
              {form.allowed_units.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {form.allowed_units.map((u) => (
                    <Badge key={u} variant="outline" className="cursor-pointer" onClick={() => removeUnit(u)}>
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
    </div>
  );
}
