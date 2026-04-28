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
import { Plus, Trash2, Edit, Search, Database, ArrowRight, Play, Check, X, Filter, SortDesc } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SOURCE_TABLES = [
  { value: 'fuel_database', label: 'Fuel Database', description: 'Read from fuel_database collection' },
  { value: 'gwp_config', label: 'GWP Configuration', description: 'Read from active GWP config' },
  { value: 'scope3_ef', label: 'Scope 3 Emission Factors', description: 'Read from scope3_ef collection' },
  { value: 'custom', label: 'Custom/Constant', description: 'Use default value only' },
];

// Operators for conditions
const CONDITION_OPERATORS = [
  { value: 'equals', label: '= Equals' },
  { value: 'not_equals', label: '≠ Not Equals' },
  { value: 'greater_than', label: '> Greater Than' },
  { value: 'greater_than_or_equals', label: '≥ Greater Than or Equals' },
  { value: 'less_than', label: '< Less Than' },
  { value: 'less_than_or_equals', label: '≤ Less Than or Equals' },
  { value: 'in', label: 'IN List (comma-separated)' },
  { value: 'contains', label: '~ Contains (text)' },
  { value: 'exists', label: '∃ Exists' },
];

// Fallback behaviors
const FALLBACK_BEHAVIORS = [
  { value: 'use_default', label: 'Use Default Value' },
  { value: 'retry_without_conditions', label: 'Retry Without Conditions' },
  { value: 'error', label: 'Return Error' },
];

const FUEL_DB_FIELDS = [
  { value: 'calorific_value', label: 'Calorific Value (CV)', unit_field: 'calorific_value_unit', sortable: true },
  { value: 'density', label: 'Density', unit_field: 'density_unit', sortable: true },
  { value: 'conversion_factor', label: 'Conversion Factor', unit_field: 'conversion_unit', sortable: true },
  { value: 'emission_factor_co2', label: 'Emission Factor CO₂ (Heat Basis)', unit_field: null, sortable: true },
  { value: 'emission_factor_ch4', label: 'Emission Factor CH₄ (Heat Basis)', unit_field: null, sortable: true },
  { value: 'emission_factor_n2o', label: 'Emission Factor N₂O (Heat Basis)', unit_field: null, sortable: true },
  { value: 'emission_factor_basis_quantity', label: 'Emission Factor (Quantity Basis)', unit_field: 'emission_factor_basis_unit', sortable: true },
  { value: 'gwp_fugitives', label: 'GWP Fugitives', unit_field: null, sortable: true },
];

// All fields in fuel_database for filtering/conditions
const FUEL_DB_ALL_FIELDS = [
  { value: 'fuel_name', label: 'Fuel Name', type: 'text' },
  { value: 'fuel_type', label: 'Fuel Type', type: 'text' },
  { value: 'category', label: 'Category', type: 'text' },
  { value: 'scope', label: 'Scope', type: 'text' },
  { value: 'region', label: 'Region', type: 'text' },
  { value: 'industry_sector', label: 'Industry Sector', type: 'text' },
  { value: 'year_applicable', label: 'Year Applicable', type: 'number', sortable: true },
  { value: 'calorific_value', label: 'Calorific Value', type: 'number', sortable: true },
  { value: 'density', label: 'Density', type: 'number', sortable: true },
  { value: 'emission_factor_co2', label: 'EF CO₂', type: 'number', sortable: true },
  { value: 'emission_factor_ch4', label: 'EF CH₄', type: 'number', sortable: true },
  { value: 'emission_factor_n2o', label: 'EF N₂O', type: 'number', sortable: true },
  { value: 'created_at', label: 'Created At', type: 'date', sortable: true },
];

// Scope 3 EF fields (source fields to read values from)
const SCOPE3_EF_SOURCE_FIELDS = [
  { value: 'emission_factor', label: 'Emission Factor', unit_field: 'unit', sortable: true },
];

// All fields in scope3_ef table for filtering/conditions
const SCOPE3_EF_ALL_FIELDS = [
  { value: 'scope', label: 'Scope', type: 'text' },
  { value: 'category', label: 'Category', type: 'text' },
  { value: 'activity', label: 'Activity', type: 'text' },
  { value: 'method', label: 'Method', type: 'text' },
  { value: 'region', label: 'Region', type: 'text' },
  { value: 'year_applicable', label: 'Year Applicable', type: 'number', sortable: true },
  { value: 'emission_factor', label: 'Emission Factor', type: 'number', sortable: true },
  { value: 'unit', label: 'Unit', type: 'text' },
  { value: 'source', label: 'Source', type: 'text' },
  { value: 'industry_sectors', label: 'Industry Sectors', type: 'array' },
  { value: 'created_at', label: 'Created At', type: 'date', sortable: true },
];

// Scope 3 EF lookup fields (for matching)
const SCOPE3_EF_LOOKUP_FIELDS = [
  { value: 'scope', label: 'Scope' },
  { value: 'category', label: 'Category' },
  { value: 'activity', label: 'Activity' },
  { value: 'method', label: 'Method' },
  { value: 'region', label: 'Region' },
];

// Fields that can be used for lookup (matching) in fuel_database
const FUEL_DB_LOOKUP_FIELDS = [
  { value: 'fuel_name', label: 'Fuel Name' },
  { value: 'fuel_type', label: 'Fuel Type' },
  { value: 'category', label: 'Category' },
  { value: 'scope', label: 'Scope' },
  { value: 'region', label: 'Region' },
  { value: 'industry_sector', label: 'Industry Sector' },
];

// Context keys that might come from user input or decision tree
const CONTEXT_KEYS = [
  { value: 'fuel_name', label: 'fuel_name — Selected fuel name' },
  { value: 'fuel_type', label: 'fuel_type — Type of fuel (solid, liquid, gas)' },
  { value: 'region', label: 'region — Geographic region' },
  { value: 'country', label: 'country — Country code' },
  { value: 'year', label: 'year — Reporting year' },
  { value: 'sector', label: 'sector — Industry sector' },
];

// GWP Config filter fields
const GWP_FILTER_FIELDS = [
  { value: 'gas_type', label: 'gas_type — Filter by gas type' },
];

// GWP Config filter values (gas types) - kept for backwards compatibility
const GWP_FILTER_VALUES = [
  { value: 'CH4', label: 'CH4 — Methane' },
  { value: 'N2O', label: 'N2O — Nitrous Oxide' },
  { value: 'CO2', label: 'CO2 — Carbon Dioxide' },
];

const EMPTY_FORM = {
  property_key: '',
  description: '',
  source_table: 'fuel_database',
  source_field: '',
  source_unit_field: '',
  lookup_context_key: 'fuel_name',
  lookup_table_field: 'fuel_name',
  filter_field: '',
  filter_value: '',
  default_value: '',
  default_unit: '',
  conditions: [],  // NEW: Dynamic conditions
  sort_by: '',     // NEW: Sort field
  sort_order: 'desc',  // NEW: Sort order
  fallback_behavior: 'use_default',  // NEW: What to do if no match
};

const EMPTY_CONDITION = {
  field: '',
  operator: 'equals',
  value: '',
  value_from_context: false,
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

  // GWP Config fields (loaded dynamically)
  const [gwpFields, setGwpFields] = useState([]);

  // Test dialog
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testProperty, setTestProperty] = useState('');
  const [testContext, setTestContext] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [mRes, vRes, gwpRes] = await Promise.all([
        axios.get(`${API}/calc-engine/property-source-mappings`, { headers: getAuthHeader() }),
        axios.get(`${API}/calc-engine/variables`, { headers: getAuthHeader() }),
        axios.get(`${API}/gwp-config`, { headers: getAuthHeader() }).catch(() => ({ data: null })),
      ]);
      setMappings(mRes.data || []);
      // Only show variables from Variable Registry with type=property
      const propsFromVariables = (vRes.data || []).filter(v => v.type === 'property');
      setProperties(propsFromVariables.map(v => ({ key: v.key, label: v.label })));
      
      // Extract GWP fields dynamically from gwp_config
      if (gwpRes.data) {
        const gwpConfig = gwpRes.data;
        const fields = Object.keys(gwpConfig)
          .filter(k => k.endsWith('_gwp') || k === 'source_name' || k === 'time_horizon')
          .map(k => {
            // Create human-readable labels
            let label = k;
            if (k === 'co2_gwp') label = 'co2_gwp — CO₂ GWP value';
            else if (k === 'ch4_gwp') label = 'ch4_gwp — CH₄ GWP value';
            else if (k === 'ch4_fossil_gwp') label = 'ch4_fossil_gwp — CH₄ Fossil GWP value';
            else if (k === 'ch4_non_fossil_gwp') label = 'ch4_non_fossil_gwp — CH₄ Non-Fossil GWP value';
            else if (k === 'n2o_gwp') label = 'n2o_gwp — N₂O GWP value';
            else if (k === 'source_name') label = 'source_name — Data source reference';
            else if (k === 'time_horizon') label = 'time_horizon — Time horizon (e.g., 100-year)';
            else label = `${k} — GWP value`;
            return { value: k, label };
          });
        setGwpFields(fields);
      }
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
      default_unit: m.default_unit || '',
      conditions: m.conditions || [],
      sort_by: m.sort_by || '',
      sort_order: m.sort_order || 'desc',
      fallback_behavior: m.fallback_behavior || 'use_default',
    });
    setDialogOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        default_value: form.default_value !== '' ? parseFloat(form.default_value) : null,
        conditions: form.conditions.filter(c => c.field), // Remove empty conditions
        sort_by: form.sort_by || null,
        sort_order: form.sort_order || 'desc',
        fallback_behavior: form.fallback_behavior || 'use_default',
      };
      if (editingMapping) {
        await axios.put(`${API}/super-admin/calc-engine/property-source-mappings/${editingMapping.id}`, payload, { headers: getAuthHeader() });
        toast.success('Mapping updated');
      } else {
        await axios.post(`${API}/super-admin/calc-engine/property-source-mappings`, payload, { headers: getAuthHeader() });
        toast.success('Mapping created');
      }
      setDialogOpen(false);
      load(); // Don't await
    } catch (err) {
      console.error('Save error:', err);
      toast.error(err.response?.data?.detail || 'Save failed');
    }
  };

  // Condition handlers
  const addCondition = () => {
    setForm({ ...form, conditions: [...form.conditions, { ...EMPTY_CONDITION }] });
  };

  const updateCondition = (index, field, value) => {
    const newConditions = [...form.conditions];
    newConditions[index] = { ...newConditions[index], [field]: value };
    setForm({ ...form, conditions: newConditions });
  };

  const removeCondition = (index) => {
    const newConditions = form.conditions.filter((_, i) => i !== index);
    setForm({ ...form, conditions: newConditions });
  };

  // Get all fields for the current source table (for conditions/filters)
  const getFieldsForSourceTable = (sourceTable) => {
    switch (sourceTable) {
      case 'fuel_database':
        return FUEL_DB_ALL_FIELDS;
      case 'scope3_ef':
        return SCOPE3_EF_ALL_FIELDS;
      case 'gwp_config':
        return gwpFields.map(f => ({ value: f.value, label: f.label, type: 'number', sortable: true }));
      default:
        return [];
    }
  };

  // Get sortable fields only (numeric/date fields that make sense to sort)
  const getSortableFields = (sourceTable) => {
    const allFields = getFieldsForSourceTable(sourceTable);
    return allFields.filter(f => f.sortable);
  };

  // Get lookup fields for source table
  const getLookupFieldsForSourceTable = (sourceTable) => {
    switch (sourceTable) {
      case 'fuel_database':
        return FUEL_DB_LOOKUP_FIELDS;
      case 'scope3_ef':
        return SCOPE3_EF_LOOKUP_FIELDS;
      default:
        return [];
    }
  };

  // Get source value fields for source table
  const getSourceFieldsForSourceTable = (sourceTable) => {
    switch (sourceTable) {
      case 'fuel_database':
        return FUEL_DB_FIELDS;
      case 'scope3_ef':
        return SCOPE3_EF_SOURCE_FIELDS;
      default:
        return [];
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
    let desc = '';
    if (m.source_table === 'fuel_database') {
      desc = `fuel_database.${m.source_field} where ${m.lookup_table_field} = context.${m.lookup_context_key}`;
    } else if (m.source_table === 'gwp_config') {
      desc = `gwp_config.${m.source_field || '[field]'}`;
    } else if (m.source_table === 'scope3_ef') {
      desc = `scope3_ef.${m.source_field} where ${m.lookup_table_field} = context.${m.lookup_context_key}`;
    } else {
      desc = `constant: ${m.default_value}`;
    }
    
    // Add conditions summary
    if (m.conditions && m.conditions.length > 0) {
      desc += ` + ${m.conditions.length} condition(s)`;
    }
    if (m.sort_by) {
      desc += ` (sorted by ${m.sort_by} ${m.sort_order || 'desc'})`;
    }
    return desc;
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
              <th className="px-4 py-3">Conditions</th>
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
                    m.source_table === 'scope3_ef' ? 'border-green-300 bg-green-50 text-green-700' :
                    'border-stone-300 bg-stone-50 text-stone-700'
                  }`}>
                    {m.source_table}
                  </Badge>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{m.source_field || '—'}</td>
                <td className="px-4 py-3">
                  {(m.source_table === 'fuel_database' || m.source_table === 'scope3_ef') && (
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
                <td className="px-4 py-3">
                  {m.conditions && m.conditions.length > 0 ? (
                    <div className="space-y-1">
                      {m.conditions.slice(0, 2).map((c, i) => (
                        <div key={i} className="text-xs flex items-center gap-1">
                          <span className="font-mono text-purple-600">{c.field}</span>
                          <span className="text-text-muted">{c.operator === 'equals' ? '=' : c.operator}</span>
                          <span className={c.value_from_context ? 'text-blue-600' : ''}>{c.value}</span>
                        </div>
                      ))}
                      {m.conditions.length > 2 && (
                        <span className="text-xs text-text-muted">+{m.conditions.length - 2} more</span>
                      )}
                      {m.sort_by && (
                        <div className="text-xs text-stone-500 flex items-center gap-1">
                          <SortDesc className="w-3 h-3" />
                          {m.sort_by} {m.sort_order}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-text-muted">—</span>
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
                    {properties.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {p.key} — {p.label}
                      </SelectItem>
                    ))}
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
                    {form.source_table === 'fuel_database' ? (
                      <Select value={form.source_unit_field || 'none'} onValueChange={(v) => setForm({ ...form, source_unit_field: v === 'none' ? '' : v })}>
                        <SelectTrigger><SelectValue placeholder="Select unit field" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— None —</SelectItem>
                          <SelectItem value="calorific_value_unit">calorific_value_unit</SelectItem>
                          <SelectItem value="density_unit">density_unit</SelectItem>
                          <SelectItem value="conversion_unit">conversion_unit</SelectItem>
                          <SelectItem value="emission_factor_basis_unit">emission_factor_basis_unit</SelectItem>
                          <SelectItem value="emission_factor_co2_unit">emission_factor_co2_unit</SelectItem>
                          <SelectItem value="emission_factor_ch4_unit">emission_factor_ch4_unit</SelectItem>
                          <SelectItem value="emission_factor_n2o_unit">emission_factor_n2o_unit</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={form.source_unit_field}
                        onChange={(e) => setForm({ ...form, source_unit_field: e.target.value })}
                        className="bg-white"
                        placeholder="e.g., unit_field_name"
                      />
                    )}
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
                    <Select
                      value={form.source_field}
                      onValueChange={(v) => setForm({ ...form, source_field: v })}
                    >
                      <SelectTrigger className="bg-white font-mono">
                        <SelectValue placeholder="Select field" />
                      </SelectTrigger>
                      <SelectContent>
                        {gwpFields.length > 0 ? gwpFields.map((f) => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        )) : (
                          <SelectItem value="" disabled>No GWP config found</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Filter Field</Label>
                    <Select
                      value={form.filter_field}
                      onValueChange={(v) => setForm({ ...form, filter_field: v })}
                    >
                      <SelectTrigger className="bg-white font-mono">
                        <SelectValue placeholder="Select filter" />
                      </SelectTrigger>
                      <SelectContent>
                        {GWP_FILTER_FIELDS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Filter Value</Label>
                    <Select
                      value={form.filter_value}
                      onValueChange={(v) => setForm({ ...form, filter_value: v })}
                    >
                      <SelectTrigger className="bg-white font-mono">
                        <SelectValue placeholder="Select gas type" />
                      </SelectTrigger>
                      <SelectContent>
                        {GWP_FILTER_VALUES.map((f) => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-amber-700">Reads from active GWP config. Use filter to select specific gas (CH4, N2O, CO2).</p>
              </Card>
            )}

            {/* Scope 3 Emission Factors Options */}
            {form.source_table === 'scope3_ef' && (
              <Card className="p-4 bg-green-50/50 border border-green-200 space-y-3">
                <Label className="font-heading font-bold">Scope 3 Emission Factors Configuration</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Source Field * <span className="text-text-muted">(value to read)</span></Label>
                    <Select value={form.source_field} onValueChange={(v) => {
                      const field = SCOPE3_EF_SOURCE_FIELDS.find((f) => f.value === v);
                      setForm({ ...form, source_field: v, source_unit_field: field?.unit_field || '' });
                    }}>
                      <SelectTrigger><SelectValue placeholder="Select field" /></SelectTrigger>
                      <SelectContent>
                        {SCOPE3_EF_SOURCE_FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Unit Field (auto-detected)</Label>
                    <Input
                      value={form.source_unit_field || 'unit'}
                      disabled
                      className="bg-green-100 text-green-700"
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
                        <SelectItem value="activity">activity — Activity type</SelectItem>
                        <SelectItem value="method">method — Calculation method</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-green-600">Which value from user input to use for matching</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Table Field to Match * <span className="text-text-muted">(in scope3_ef)</span></Label>
                    <Select value={form.lookup_table_field} onValueChange={(v) => setForm({ ...form, lookup_table_field: v })}>
                      <SelectTrigger><SelectValue placeholder="Select field" /></SelectTrigger>
                      <SelectContent>
                        {SCOPE3_EF_LOOKUP_FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-green-600">Which field in scope3_ef to match against</p>
                  </div>
                </div>
                <div className="bg-green-100/50 rounded p-3 text-xs text-green-800">
                  <strong>How it works:</strong> When calculating, the engine takes <code className="bg-white px-1 rounded">context.{form.lookup_context_key || 'activity'}</code> 
                  and finds the row in <code className="bg-white px-1 rounded">scope3_ef</code> where <code className="bg-white px-1 rounded">{form.lookup_table_field || 'activity'} = value</code>, 
                  then reads <code className="bg-white px-1 rounded">{form.source_field || 'emission_factor'}</code>.
                </div>
              </Card>
            )}

            {/* Dynamic Conditions Section - Available for all source tables */}
            {form.source_table !== 'custom' && (
              <Card className="p-4 bg-purple-50/50 border border-purple-200 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="font-heading font-bold flex items-center gap-2">
                    <Filter className="w-4 h-4" />
                    Filter Conditions (Optional)
                  </Label>
                  <Button type="button" variant="outline" size="sm" onClick={addCondition}>
                    <Plus className="w-3 h-3 mr-1" /> Add Condition
                  </Button>
                </div>
                
                {form.conditions.length === 0 ? (
                  <p className="text-sm text-purple-600">No conditions defined. Click "Add Condition" to filter results based on field values.</p>
                ) : (
                  <div className="space-y-3">
                    {form.conditions.map((cond, idx) => (
                      <div key={idx} className="p-3 bg-white rounded border border-purple-100">
                        <div className="grid grid-cols-12 gap-2 items-end">
                          {/* Field */}
                          <div className="col-span-3 space-y-1">
                            <Label className="text-xs text-purple-600">Field</Label>
                            <Select value={cond.field} onValueChange={(v) => updateCondition(idx, 'field', v)}>
                              <SelectTrigger className="h-8 text-sm font-mono">
                                <SelectValue placeholder="Select field" />
                              </SelectTrigger>
                              <SelectContent>
                                {getFieldsForSourceTable(form.source_table).map(f => (
                                  <SelectItem key={f.value} value={f.value}>
                                    {f.label} <span className="text-text-muted text-xs">({f.type})</span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          
                          {/* Operator */}
                          <div className="col-span-3 space-y-1">
                            <Label className="text-xs text-purple-600">Operator</Label>
                            <Select value={cond.operator} onValueChange={(v) => updateCondition(idx, 'operator', v)}>
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Select operator" />
                              </SelectTrigger>
                              <SelectContent>
                                {CONDITION_OPERATORS.map(op => (
                                  <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          
                          {/* Value */}
                          <div className="col-span-3 space-y-1">
                            <Label className="text-xs text-purple-600">
                              {cond.value_from_context ? "Context Key" : "Value"}
                            </Label>
                            <Input
                              value={cond.value}
                              onChange={(e) => updateCondition(idx, 'value', e.target.value)}
                              className="bg-white h-8 text-sm"
                              placeholder={cond.value_from_context ? "e.g., method" : "e.g., 2024"}
                            />
                          </div>
                          
                          {/* From Context Checkbox */}
                          <div className="col-span-2 flex items-center justify-center pb-1">
                            <label className="flex items-center gap-2 text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={cond.value_from_context || false}
                                onChange={(e) => updateCondition(idx, 'value_from_context', e.target.checked)}
                                className="rounded border-purple-300"
                              />
                              <span className="text-purple-700">From context</span>
                            </label>
                          </div>
                          
                          {/* Delete Button */}
                          <div className="col-span-1 flex justify-end pb-1">
                            <Button type="button" variant="ghost" size="sm" onClick={() => removeCondition(idx)} className="text-red-500 hover:text-red-700 h-8 w-8 p-0">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Sort and Fallback Options */}
                <div className="grid grid-cols-3 gap-3 pt-3 border-t border-purple-200">
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      <SortDesc className="w-3 h-3" /> Sort By
                    </Label>
                    <Select value={form.sort_by || 'none'} onValueChange={(v) => setForm({ ...form, sort_by: v === 'none' ? '' : v })}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select field" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— No sorting —</SelectItem>
                        {getFieldsForSourceTable(form.source_table).map(f => (
                          <SelectItem key={f.value} value={f.value}>
                            {f.label} <span className="text-text-muted text-xs">({f.type})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {form.sort_by && (
                    <div className="space-y-1">
                      <Label className="text-xs">Sort Order</Label>
                      <Select value={form.sort_order} onValueChange={(v) => setForm({ ...form, sort_order: v })}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="desc">Descending (Z→A / newest)</SelectItem>
                          <SelectItem value="asc">Ascending (A→Z / oldest)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label className="text-xs">If No Match</Label>
                    <Select value={form.fallback_behavior} onValueChange={(v) => setForm({ ...form, fallback_behavior: v })}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FALLBACK_BEHAVIORS.map(fb => (
                          <SelectItem key={fb.value} value={fb.value}>{fb.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <p className="text-xs text-purple-700">
                  Conditions filter results from the source table. Use "From context" to reference values from the calculation context (e.g., reporting year, method).
                  Sort returns the first match after sorting (useful for "get latest year" scenarios).
                </p>
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
