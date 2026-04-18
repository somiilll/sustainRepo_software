import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { Plus, Trash2, Edit, Search, Database, ArrowRight, Play, Check, X } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SOURCE_TABLES = [
  { value: 'fuel_database', label: 'Fuel Database', description: 'Read from fuel_database collection' },
  { value: 'gwp_config', label: 'GWP Configuration', description: 'Read from active GWP config' },
  { value: 'custom', label: 'Custom/Constant', description: 'Use default value only' },
];

const FUEL_DB_FIELDS = [
  { value: 'calorific_value', label: 'Calorific Value (CV)', unit_field: 'calorific_value_unit' },
  { value: 'density', label: 'Density', unit_field: 'density_unit' },
  { value: 'emission_factor_co2', label: 'Emission Factor CO₂', unit_field: null },
  { value: 'emission_factor_ch4', label: 'Emission Factor CH₄', unit_field: null },
  { value: 'emission_factor_n2o', label: 'Emission Factor N₂O', unit_field: null },
];

// Fields that can be used for lookup (matching) in fuel_database
const FUEL_DB_LOOKUP_FIELDS = [
  { value: 'fuel_code', label: 'Fuel Code (unique identifier)' },
  { value: 'fuel_name', label: 'Fuel Name' },
  { value: 'fuel_type', label: 'Fuel Type' },
  { value: 'id', label: 'ID' },
];

// Context keys that might come from user input or decision tree
const CONTEXT_KEYS = [
  { value: 'fuel_code', label: 'fuel_code — Selected fuel identifier' },
  { value: 'fuel_type', label: 'fuel_type — Type of fuel (solid, liquid, gas)' },
  { value: 'region', label: 'region — Geographic region' },
  { value: 'country', label: 'country — Country code' },
  { value: 'year', label: 'year — Reporting year' },
  { value: 'sector', label: 'sector — Industry sector' },
];

const GWP_FIELDS = [
  { value: 'gwp_value', label: 'GWP Value', filter_field: 'gas_type' },
];

const EMPTY_FORM = {
  property_key: '',
  description: '',
  source_table: 'fuel_database',
  source_field: '',
  source_unit_field: '',
  lookup_context_key: 'fuel_code',
  lookup_table_field: 'fuel_code',
  filter_field: '',
  filter_value: '',
  default_value: '',
};

export default function PropertySourceMapping() {
  const { getAuthHeader } = useAuth();
  const [mappings, setMappings] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  // Test dialog
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testProperty, setTestProperty] = useState('');
  const [testContext, setTestContext] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [mRes, pRes] = await Promise.all([
        axios.get(`${API}/calc-engine/property-source-mappings`, { headers: getAuthHeader() }),
        axios.get(`${API}/calc-engine/properties`, { headers: getAuthHeader() }),
      ]);
      setMappings(mRes.data || []);
      setProperties(pRes.data || []);
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
      m.property_key.toLowerCase().includes(term) ||
      (m.description || '').toLowerCase().includes(term) ||
      m.source_table.toLowerCase().includes(term)
    );
  }, [mappings, search]);

  const openCreate = () => {
    setEditingMapping(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEdit = (m) => {
    setEditingMapping(m);
    setForm({
      property_key: m.property_key,
      description: m.description || '',
      source_table: m.source_table,
      source_field: m.source_field || '',
      source_unit_field: m.source_unit_field || '',
      lookup_context_key: m.lookup_context_key || 'fuel_code',
      lookup_table_field: m.lookup_table_field || 'fuel_code',
      filter_field: m.filter_field || '',
      filter_value: m.filter_value || '',
      default_value: m.default_value ?? '',
    });
    setDialogOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        default_value: form.default_value !== '' ? parseFloat(form.default_value) : null,
      };
      if (editingMapping) {
        await axios.put(`${API}/super-admin/calc-engine/property-source-mappings/${editingMapping.id}`, payload, { headers: getAuthHeader() });
        toast.success('Mapping updated');
      } else {
        await axios.post(`${API}/super-admin/calc-engine/property-source-mappings`, payload, { headers: getAuthHeader() });
        toast.success('Mapping created');
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Save failed');
    }
  };

  const remove = async (m) => {
    if (!window.confirm(`Delete mapping for '${m.property_key}'?`)) return;
    try {
      await axios.delete(`${API}/super-admin/calc-engine/property-source-mappings/${m.id}`, { headers: getAuthHeader() });
      toast.success('Mapping deleted');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Delete failed');
    }
  };

  const openTest = (m) => {
    setTestProperty(m.property_key);
    setTestContext(m.lookup_context_key ? `{"${m.lookup_context_key}": ""}` : '{}');
    setTestResult(null);
    setTestDialogOpen(true);
  };

  const runTest = async () => {
    setTesting(true);
    try {
      const context = JSON.parse(testContext);
      const res = await axios.post(`${API}/super-admin/calc-engine/resolve-property`, {
        property_key: testProperty,
        context,
      }, { headers: getAuthHeader() });
      setTestResult(res.data);
    } catch (err) {
      setTestResult({ error: err.response?.data?.detail || 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  const getSourceDescription = (m) => {
    if (m.source_table === 'fuel_database') {
      return `fuel_database.${m.source_field} where ${m.lookup_table_field} = context.${m.lookup_context_key}`;
    }
    if (m.source_table === 'gwp_config') {
      return `gwp_config where ${m.filter_field} = "${m.filter_value}"`;
    }
    return `constant: ${m.default_value}`;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-6" data-testid="property-source-mapping-page">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2 flex items-center gap-3">
            <Database className="w-8 h-8 text-primary" />
            Property Source Mapping
          </h1>
          <p className="text-text-secondary">Define where each property value is read from (Fuel Database, GWP Config, etc.). No hardcoding — you control the data sources.</p>
        </div>
        <Button onClick={openCreate} className="bg-primary hover:bg-primary/90 text-white rounded-full px-6" data-testid="add-mapping-btn">
          <Plus className="w-4 h-4 mr-2" />Add Mapping
        </Button>
      </div>

      <Card className="p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search properties…" className="pl-9 bg-stone-50" />
        </div>
        <div className="ml-auto text-sm text-text-muted">{filtered.length} mappings</div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-text-muted">
            <tr>
              <th className="px-4 py-3">Property</th>
              <th className="px-4 py-3">Source Table</th>
              <th className="px-4 py-3">Source Field</th>
              <th className="px-4 py-3">Lookup</th>
              <th className="px-4 py-3">Default</th>
              <th className="px-4 py-3 w-32">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id} className="border-t border-stone-100 hover:bg-stone-50/50" data-testid={`mapping-row-${m.property_key}`}>
                <td className="px-4 py-3">
                  <div className="font-mono font-medium text-text-primary">{m.property_key}</div>
                  {m.description && <div className="text-xs text-text-muted">{m.description}</div>}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className={`text-xs ${
                    m.source_table === 'fuel_database' ? 'border-blue-300 bg-blue-50 text-blue-700' :
                    m.source_table === 'gwp_config' ? 'border-amber-300 bg-amber-50 text-amber-700' :
                    'border-stone-300 bg-stone-50 text-stone-700'
                  }`}>
                    {m.source_table}
                  </Badge>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{m.source_field || '—'}</td>
                <td className="px-4 py-3">
                  {m.source_table === 'fuel_database' && (
                    <div className="flex items-center gap-1 text-xs">
                      <span className="text-text-muted">ctx.</span>
                      <span className="font-mono text-primary">{m.lookup_context_key}</span>
                      <ArrowRight className="w-3 h-3 text-stone-400" />
                      <span className="font-mono">{m.lookup_table_field}</span>
                    </div>
                  )}
                  {m.source_table === 'gwp_config' && m.filter_field && (
                    <div className="text-xs">
                      <span className="font-mono">{m.filter_field}</span>
                      <span className="text-text-muted"> = </span>
                      <span className="font-mono text-primary">"{m.filter_value}"</span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-text-muted">
                  {m.default_value != null ? m.default_value : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openTest(m)} title="Test resolution" data-testid={`test-mapping-${m.property_key}`}>
                      <Play className="w-4 h-4 text-emerald-500" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(m)} data-testid={`edit-mapping-${m.property_key}`}>
                      <Edit className="w-4 h-4 text-blue-500" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(m)} className="text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-text-muted">No property source mappings defined. Add one to connect properties to data sources.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingMapping ? 'Edit Property Source Mapping' : 'Add Property Source Mapping'}</DialogTitle>
            <DialogDescription>Define where this property value should be read from.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            {/* Property Key */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Property Key *</Label>
                <Select
                  value={form.property_key || 'custom'}
                  onValueChange={(v) => setForm({ ...form, property_key: v === 'custom' ? '' : v })}
                  disabled={!!editingMapping}
                >
                  <SelectTrigger><SelectValue placeholder="Select or type custom" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">— Custom key —</SelectItem>
                    {properties.map((p) => <SelectItem key={p.key} value={p.key}>{p.key} — {p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {(form.property_key === '' || !properties.find((p) => p.key === form.property_key)) && (
                  <Input
                    value={form.property_key}
                    onChange={(e) => setForm({ ...form, property_key: e.target.value })}
                    className="bg-stone-50 font-mono mt-2"
                    placeholder="e.g., cv, ef_q_co2, gwp_ch4"
                    disabled={!!editingMapping}
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="bg-stone-50"
                  placeholder="Human-readable description"
                />
              </div>
            </div>

            {/* Source Table */}
            <div className="space-y-1.5">
              <Label>Source Table *</Label>
              <Select value={form.source_table} onValueChange={(v) => setForm({ ...form, source_table: v, source_field: '', filter_field: '', filter_value: '' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCE_TABLES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <div>
                        <div className="font-medium">{t.label}</div>
                        <div className="text-xs text-text-muted">{t.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Fuel Database Options */}
            {form.source_table === 'fuel_database' && (
              <Card className="p-4 bg-blue-50/50 border border-blue-200 space-y-3">
                <Label className="font-heading font-bold">Fuel Database Configuration</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Source Field * <span className="text-text-muted">(value to read)</span></Label>
                    <Select value={form.source_field} onValueChange={(v) => {
                      const field = FUEL_DB_FIELDS.find((f) => f.value === v);
                      setForm({ ...form, source_field: v, source_unit_field: field?.unit_field || '' });
                    }}>
                      <SelectTrigger><SelectValue placeholder="Select field" /></SelectTrigger>
                      <SelectContent>
                        {FUEL_DB_FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Unit Field (optional)</Label>
                    <Input
                      value={form.source_unit_field}
                      onChange={(e) => setForm({ ...form, source_unit_field: e.target.value })}
                      className="bg-white"
                      placeholder="e.g., calorific_value_unit"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Lookup Context Key * <span className="text-text-muted">(from user input)</span></Label>
                    <Select value={form.lookup_context_key} onValueChange={(v) => setForm({ ...form, lookup_context_key: v })}>
                      <SelectTrigger><SelectValue placeholder="Select context key" /></SelectTrigger>
                      <SelectContent>
                        {CONTEXT_KEYS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-blue-600">Which value from user input to use for matching</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Table Field to Match * <span className="text-text-muted">(in fuel_database)</span></Label>
                    <Select value={form.lookup_table_field} onValueChange={(v) => setForm({ ...form, lookup_table_field: v })}>
                      <SelectTrigger><SelectValue placeholder="Select field" /></SelectTrigger>
                      <SelectContent>
                        {FUEL_DB_LOOKUP_FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-blue-600">Which field in fuel_database to match against</p>
                  </div>
                </div>
                <div className="bg-blue-100/50 rounded p-3 text-xs text-blue-800">
                  <strong>How it works:</strong> When calculating, the engine takes <code className="bg-white px-1 rounded">context.{form.lookup_context_key || 'fuel_code'}</code> (e.g., "Diesel") 
                  and finds the row in <code className="bg-white px-1 rounded">fuel_database</code> where <code className="bg-white px-1 rounded">{form.lookup_table_field || 'fuel_code'} = "Diesel"</code>, 
                  then reads <code className="bg-white px-1 rounded">{form.source_field || 'field'}</code>.
                </div>
              </Card>
            )}

            {/* GWP Config Options */}
            {form.source_table === 'gwp_config' && (
              <Card className="p-4 bg-amber-50/50 border border-amber-200 space-y-3">
                <Label className="font-heading font-bold">GWP Configuration</Label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Source Field *</Label>
                    <Input
                      value={form.source_field}
                      onChange={(e) => setForm({ ...form, source_field: e.target.value })}
                      className="bg-white font-mono"
                      placeholder="e.g., gwp_value"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Filter Field</Label>
                    <Input
                      value={form.filter_field}
                      onChange={(e) => setForm({ ...form, filter_field: e.target.value })}
                      className="bg-white font-mono"
                      placeholder="e.g., gas_type"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Filter Value</Label>
                    <Input
                      value={form.filter_value}
                      onChange={(e) => setForm({ ...form, filter_value: e.target.value })}
                      className="bg-white font-mono"
                      placeholder="e.g., CH4, N2O"
                    />
                  </div>
                </div>
                <p className="text-xs text-amber-700">Reads from active GWP config. Use filter to select specific gas (CH4, N2O).</p>
              </Card>
            )}

            {/* Default Values */}
            <div className="space-y-1.5">
              <Label>Default Value (fallback)</Label>
              <Input
                type="number"
                step="any"
                value={form.default_value}
                onChange={(e) => setForm({ ...form, default_value: e.target.value })}
                className="bg-stone-50"
                placeholder="Used if lookup fails (unit comes from variable registry)"
              />
              <p className="text-xs text-text-muted">Unit is determined by the variable's default_unit in Variable Registry, or source_unit_field from the table.</p>
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

      {/* Test Dialog */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Test Property Resolution</DialogTitle>
            <DialogDescription>Test how <code className="font-mono text-primary">{testProperty}</code> resolves with given context.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Context (JSON)</Label>
              <textarea
                value={testContext}
                onChange={(e) => setTestContext(e.target.value)}
                rows={3}
                className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm font-mono"
                placeholder='{"fuel_code": "Diesel"}'
              />
            </div>
            <Button onClick={runTest} disabled={testing} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
              <Play className="w-4 h-4 mr-2" />{testing ? 'Resolving...' : 'Resolve Property'}
            </Button>
            {testResult && (
              <Card className={`p-4 ${testResult.error ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                {testResult.error ? (
                  <div className="flex items-center gap-2 text-red-700">
                    <X className="w-4 h-4" />
                    <span>{testResult.error}</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-emerald-700 font-medium">
                      <Check className="w-4 h-4" />
                      Resolved successfully
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="text-text-muted">Value:</div>
                      <div className="font-mono font-bold">{testResult.value ?? 'null'}</div>
                      <div className="text-text-muted">Unit:</div>
                      <div className="font-mono">{testResult.unit || '—'}</div>
                      <div className="text-text-muted">Source:</div>
                      <div className="font-mono text-xs">{testResult.source_info?.resolved_from || '—'}</div>
                    </div>
                  </div>
                )}
              </Card>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
