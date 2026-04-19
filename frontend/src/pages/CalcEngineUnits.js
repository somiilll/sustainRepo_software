import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Plus, Trash2, Edit, Search, Scale, Combine, ArrowRightLeft, Calculator, Database } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BASE_DIMENSIONS = [
  'mass', 'volume', 'energy', 'money', 'time', 'count',
  'mass_co2', 'mass_ch4', 'mass_n2o', 'mass_co2e', 'gwp',
];

export default function CalcEngineUnits() {
  const { getAuthHeader } = useAuth();
  const [simpleUnits, setSimpleUnits] = useState([]);
  const [compoundUnits, setCompoundUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('simple');

  // Conversion preview state
  const [conversionFrom, setConversionFrom] = useState('');
  const [conversionTo, setConversionTo] = useState('');
  const [conversionValue, setConversionValue] = useState('1');
  const [conversionResult, setConversionResult] = useState(null);
  const [converting, setConverting] = useState(false);

  // DB-driven conversions
  const [dbConversions, setDbConversions] = useState([]);
  const [conversionDialogOpen, setConversionDialogOpen] = useState(false);
  const [editingConversion, setEditingConversion] = useState(null);
  const [conversionForm, setConversionForm] = useState({
    from_unit: '', to_unit: '', factor: '', description: '',
  });
  const [conversionSearch, setConversionSearch] = useState('');
  const [savingConversion, setSavingConversion] = useState(false);

  // Simple unit dialog
  const [simpleDialogOpen, setSimpleDialogOpen] = useState(false);
  const [editingSimple, setEditingSimple] = useState(null);
  const [simpleForm, setSimpleForm] = useState({
    key: '', label: '', dimension: 'mass',
  });

  // Compound unit dialog
  const [compoundDialogOpen, setCompoundDialogOpen] = useState(false);
  const [editingCompound, setEditingCompound] = useState(null);
  const [compoundForm, setCompoundForm] = useState({
    key: '', label: '', components: [{ unit_key: '', power: 1 }],
  });

  const load = useCallback(async () => {
    try {
      const [unitsRes, convRes] = await Promise.all([
        axios.get(`${API}/calc-engine/units`, { headers: getAuthHeader() }),
        axios.get(`${API}/calc-engine/unit-conversions`, { headers: getAuthHeader() }),
      ]);
      setSimpleUnits(unitsRes.data.simple || []);
      setCompoundUnits(unitsRes.data.compound || []);
      setDbConversions(convRes.data || []);
    } catch (e) {
      toast.error('Failed to load units');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  useEffect(() => { load(); }, [load]);

  const filteredSimple = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return simpleUnits;
    return simpleUnits.filter((u) =>
      u.key.toLowerCase().includes(term) || (u.label || '').toLowerCase().includes(term)
    );
  }, [simpleUnits, search]);

  const filteredCompound = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return compoundUnits;
    return compoundUnits.filter((u) =>
      u.key.toLowerCase().includes(term) || (u.label || '').toLowerCase().includes(term)
    );
  }, [compoundUnits, search]);

  // Group units by dimension for conversion preview
  const unitsByDimension = useMemo(() => {
    const groups = {};
    simpleUnits.forEach((u) => {
      const dim = Object.keys(u.dimension_vector || {})[0] || 'unknown';
      if (!groups[dim]) groups[dim] = [];
      groups[dim].push(u);
    });
    return groups;
  }, [simpleUnits]);

  // Get compatible units (same dimension) for conversion
  const getCompatibleUnits = (unitKey) => {
    const unit = simpleUnits.find((u) => u.key === unitKey);
    if (!unit) return [];
    const dim = Object.keys(unit.dimension_vector || {})[0];
    return unitsByDimension[dim] || [];
  };

  // Calculate conversion between two units
  const calculateConversion = useMemo(() => {
    if (!conversionFrom || !conversionTo || !conversionValue) return null;
    const fromUnit = simpleUnits.find((u) => u.key === conversionFrom);
    const toUnit = simpleUnits.find((u) => u.key === conversionTo);
    if (!fromUnit || !toUnit) return null;
    
    const fromDim = Object.keys(fromUnit.dimension_vector || {})[0];
    const toDim = Object.keys(toUnit.dimension_vector || {})[0];
    if (fromDim !== toDim) {
      return { error: `Cannot convert ${fromDim} to ${toDim}` };
    }
    
    const value = parseFloat(conversionValue) || 0;
    const factor = fromUnit.to_base_factor / toUnit.to_base_factor;
    const result = value * factor;
    return {
      from: { value, unit: fromUnit.key, label: fromUnit.label },
      to: { value: result, unit: toUnit.key, label: toUnit.label },
      factor,
      formula: `${value} ${fromUnit.key} × (${fromUnit.to_base_factor} / ${toUnit.to_base_factor}) = ${result.toFixed(6)} ${toUnit.key}`,
    };
  }, [conversionFrom, conversionTo, conversionValue, simpleUnits]);

  // Simple unit handlers
  const openCreateSimple = () => {
    setEditingSimple(null);
    setSimpleForm({ key: '', label: '', dimension: 'mass', to_base_factor: '1' });
    setSimpleDialogOpen(true);
  };

  const openEditSimple = (u) => {
    setEditingSimple(u);
    const dim = Object.keys(u.dimension_vector || {})[0] || 'mass';
    setSimpleForm({
      key: u.key,
      label: u.label || '',
      dimension: dim,
      to_base_factor: String(u.to_base_factor || 1),
    });
    setSimpleDialogOpen(true);
  };

  const submitSimple = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        key: simpleForm.key,
        label: simpleForm.label,
        dimension_vector: { [simpleForm.dimension]: 1 },
        to_base_factor: parseFloat(simpleForm.to_base_factor) || 1,
      };
      if (editingSimple) {
        await axios.put(`${API}/super-admin/calc-engine/units/${editingSimple.id}`, payload, { headers: getAuthHeader() });
        toast.success('Unit updated');
      } else {
        await axios.post(`${API}/super-admin/calc-engine/units`, payload, { headers: getAuthHeader() });
        toast.success('Unit created');
      }
      setSimpleDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Save failed');
    }
  };

  const deleteSimple = async (u) => {
    if (!window.confirm(`Delete unit '${u.key}'?`)) return;
    try {
      await axios.delete(`${API}/super-admin/calc-engine/units/${u.id}`, { headers: getAuthHeader() });
      toast.success('Unit deleted');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Delete failed');
    }
  };

  // Compound unit handlers
  const openCreateCompound = () => {
    setEditingCompound(null);
    setCompoundForm({ key: '', label: '', components: [{ unit_key: '', power: 1 }] });
    setCompoundDialogOpen(true);
  };

  const openEditCompound = (u) => {
    setEditingCompound(u);
    setCompoundForm({
      key: u.key,
      label: u.label || '',
      components: u.components && u.components.length > 0 
        ? u.components.map(c => ({ unit_key: c.unit_key, power: c.power }))
        : [{ unit_key: '', power: 1 }],
    });
    setCompoundDialogOpen(true);
  };

  const addComponent = () => {
    setCompoundForm((f) => ({
      ...f,
      components: [...f.components, { unit_key: '', power: 1 }],
    }));
  };

  const updateComponent = (idx, patch) => {
    setCompoundForm((f) => ({
      ...f,
      components: f.components.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));
  };

  const removeComponent = (idx) => {
    setCompoundForm((f) => ({
      ...f,
      components: f.components.filter((_, i) => i !== idx),
    }));
  };

  const submitCompound = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        key: compoundForm.key,
        label: compoundForm.label,
        components: compoundForm.components.filter((c) => c.unit_key),
      };
      if (editingCompound) {
        await axios.put(`${API}/super-admin/calc-engine/compound-units/${editingCompound.id}`, payload, { headers: getAuthHeader() });
        toast.success('Compound unit updated');
      } else {
        await axios.post(`${API}/super-admin/calc-engine/compound-units`, payload, { headers: getAuthHeader() });
        toast.success('Compound unit created');
      }
      setCompoundDialogOpen(false);
      load();
    } catch (err) {
      console.error('Save error:', err);
      toast.error(err.response?.data?.detail || 'Save failed');
    }
  };

  const deleteCompound = async (u) => {
    if (!window.confirm(`Delete compound unit '${u.key}'?`)) return;
    try {
      await axios.delete(`${API}/super-admin/calc-engine/compound-units/${u.id}`, { headers: getAuthHeader() });
      toast.success('Compound unit deleted');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Delete failed');
    }
  };

  // DB-Driven Unit Conversion handlers
  const filteredConversions = useMemo(() => {
    const term = conversionSearch.trim().toLowerCase();
    if (!term) return dbConversions;
    return dbConversions.filter((c) =>
      c.from_unit.toLowerCase().includes(term) ||
      c.to_unit.toLowerCase().includes(term) ||
      (c.description || '').toLowerCase().includes(term)
    );
  }, [dbConversions, conversionSearch]);

  const openCreateConversion = () => {
    setEditingConversion(null);
    setConversionForm({ from_unit: '', to_unit: '', factor: '', description: '' });
    setConversionDialogOpen(true);
  };

  const openEditConversion = (conv) => {
    setEditingConversion(conv);
    setConversionForm({
      from_unit: conv.from_unit,
      to_unit: conv.to_unit,
      factor: String(conv.factor),
      description: conv.description || '',
    });
    setConversionDialogOpen(true);
  };

  const submitConversion = async (e) => {
    e.preventDefault();
    if (savingConversion) return;
    setSavingConversion(true);
    try {
      const payload = {
        from_unit: conversionForm.from_unit,
        to_unit: conversionForm.to_unit,
        factor: parseFloat(conversionForm.factor),
        description: conversionForm.description,
      };
      if (editingConversion) {
        await axios.put(
          `${API}/super-admin/calc-engine/unit-conversions/${editingConversion.id}`,
          payload,
          { headers: getAuthHeader() }
        );
        toast.success('Conversion updated');
      } else {
        await axios.post(
          `${API}/super-admin/calc-engine/unit-conversions`,
          payload,
          { headers: getAuthHeader() }
        );
        toast.success('Conversion created');
      }
      setConversionDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Save failed');
    } finally {
      setSavingConversion(false);
    }
  };

  const deleteConversion = async (conv) => {
    if (!window.confirm(`Delete conversion ${conv.from_unit} → ${conv.to_unit}?`)) return;
    try {
      await axios.delete(
        `${API}/super-admin/calc-engine/unit-conversions/${conv.id}`,
        { headers: getAuthHeader() }
      );
      toast.success('Conversion deleted');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Delete failed');
    }
  };

  const formatDimensionVector = (dv) => {
    if (!dv || Object.keys(dv).length === 0) return 'dimensionless';
    return Object.entries(dv)
      .map(([k, v]) => (v === 1 ? k : `${k}^${v}`))
      .join(' · ');
  };

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-6" data-testid="calc-engine-units-page">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2 flex items-center gap-3">
            <Scale className="w-8 h-8 text-primary" />
            Calc Engine Units
          </h1>
          <p className="text-text-secondary">Manage simple and compound units for the calculation engine. Units define dimensions and conversion factors.</p>
        </div>
      </div>

      <Card className="p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search units…" className="pl-9 bg-stone-50" />
        </div>
        <div className="ml-auto text-sm text-text-muted">
          {simpleUnits.length} simple · {compoundUnits.length} compound
        </div>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="simple" className="flex items-center gap-2">
            <Scale className="w-4 h-4" />Simple Units ({filteredSimple.length})
          </TabsTrigger>
          <TabsTrigger value="compound" className="flex items-center gap-2">
            <Combine className="w-4 h-4" />Compound Units ({filteredCompound.length})
          </TabsTrigger>
          <TabsTrigger value="conversions" className="flex items-center gap-2" data-testid="conversions-tab">
            <Database className="w-4 h-4" />Unit Conversions ({dbConversions.length})
          </TabsTrigger>
          <TabsTrigger value="converter" className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4" />Converter Tool
          </TabsTrigger>
        </TabsList>

        <TabsContent value="simple" className="mt-4">
          <div className="flex justify-end mb-4">
            <Button onClick={openCreateSimple} className="bg-primary hover:bg-primary/90 text-white rounded-full px-6" data-testid="add-simple-unit-btn">
              <Plus className="w-4 h-4 mr-2" />Add Simple Unit
            </Button>
          </div>
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-text-muted">
                <tr>
                  <th className="px-4 py-3">Key</th>
                  <th className="px-4 py-3">Label</th>
                  <th className="px-4 py-3">Dimension</th>
                  <th className="px-4 py-3">To Base Factor</th>
                  <th className="px-4 py-3 w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSimple.map((u) => (
                  <tr key={u.id} className="border-t border-stone-100 hover:bg-stone-50/50">
                    <td className="px-4 py-3 font-mono font-medium text-text-primary">{u.key}</td>
                    <td className="px-4 py-3">{u.label}</td>
                    <td className="px-4 py-3 text-xs text-text-muted">{formatDimensionVector(u.dimension_vector)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{u.to_base_factor}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" type="button" onClick={() => openEditSimple(u)}><Edit className="w-4 h-4 text-blue-500" /></Button>
                        <Button size="sm" variant="ghost" type="button" onClick={() => deleteSimple(u)} className="text-red-500 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredSimple.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-text-muted">No units found.</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="compound" className="mt-4">
          <div className="flex justify-end mb-4">
            <Button onClick={openCreateCompound} className="bg-primary hover:bg-primary/90 text-white rounded-full px-6" data-testid="add-compound-unit-btn">
              <Plus className="w-4 h-4 mr-2" />Add Compound Unit
            </Button>
          </div>
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-text-muted">
                <tr>
                  <th className="px-4 py-3">Key</th>
                  <th className="px-4 py-3">Label</th>
                  <th className="px-4 py-3">Components</th>
                  <th className="px-4 py-3">Derived Dimension</th>
                  <th className="px-4 py-3 w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompound.map((u) => (
                  <tr key={u.id} className="border-t border-stone-100 hover:bg-stone-50/50">
                    <td className="px-4 py-3 font-mono font-medium text-text-primary">{u.key}</td>
                    <td className="px-4 py-3">{u.label}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(u.components || []).map((c, i) => (
                          <Badge key={i} variant="outline" className="font-mono text-xs">
                            {c.unit_key}{c.power !== 1 && <sup>{c.power}</sup>}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted">{formatDimensionVector(u.derived_dimension_vector)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" type="button" onClick={() => openEditCompound(u)}><Edit className="w-4 h-4 text-blue-500" /></Button>
                        <Button size="sm" variant="ghost" type="button" onClick={() => deleteCompound(u)} className="text-red-500 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredCompound.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-text-muted">No compound units found.</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        {/* DB-Driven Unit Conversions Tab */}
        <TabsContent value="conversions" className="mt-4">
          <div className="space-y-4">
            <Card className="p-4 bg-amber-50 border-amber-200">
              <div className="flex items-start gap-3">
                <Database className="w-5 h-5 text-amber-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-amber-900">DB-Driven Unit Conversions</h4>
                  <p className="text-sm text-amber-700 mt-1">
                    All unit conversions are stored in the database for full auditability. The calculation engine uses these conversions — no hardcoded math.
                    Define conversions between units of the same dimension (e.g., L → m³, tonne → kg).
                  </p>
                </div>
              </div>
            </Card>

            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <Input
                  value={conversionSearch}
                  onChange={(e) => setConversionSearch(e.target.value)}
                  placeholder="Search conversions…"
                  className="pl-9 bg-stone-50"
                />
              </div>
              <Button
                onClick={openCreateConversion}
                className="bg-primary hover:bg-primary/90 text-white rounded-full px-6"
                data-testid="add-conversion-btn"
              >
                <Plus className="w-4 h-4 mr-2" />Add Conversion
              </Button>
            </div>

            <Card className="p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-left text-text-muted">
                  <tr>
                    <th className="px-4 py-3">From Unit</th>
                    <th className="px-4 py-3">To Unit</th>
                    <th className="px-4 py-3">Factor</th>
                    <th className="px-4 py-3">Formula</th>
                    <th className="px-4 py-3">Dimension</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Defined By</th>
                    <th className="px-4 py-3 w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredConversions.map((conv) => (
                    <tr key={conv.id} className="border-t border-stone-100 hover:bg-stone-50/50">
                      <td className="px-4 py-3 font-mono font-medium text-text-primary">{conv.from_unit}</td>
                      <td className="px-4 py-3 font-mono font-medium text-text-primary">
                        <div className="flex items-center gap-2">
                          <ArrowRightLeft className="w-3 h-3 text-stone-400" />
                          {conv.to_unit}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm">{conv.factor}</td>
                      <td className="px-4 py-3 font-mono text-xs text-text-muted">{conv.formula || `× ${conv.factor}`}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs">{conv.dimension || 'unknown'}</Badge>
                      </td>
                      <td className="px-4 py-3 text-text-muted text-sm max-w-[200px] truncate">{conv.description || '—'}</td>
                      <td className="px-4 py-3 text-xs text-text-muted">{conv.defined_by || 'system'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" type="button" onClick={() => openEditConversion(conv)}>
                            <Edit className="w-4 h-4 text-blue-500" />
                          </Button>
                          <Button size="sm" variant="ghost" type="button" onClick={() => deleteConversion(conv)} className="text-red-500 hover:text-red-600 hover:bg-red-50">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredConversions.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-text-muted">
                        {dbConversions.length === 0
                          ? 'No conversions defined. Add conversions to enable unit normalization in the calculation engine.'
                          : 'No conversions match your search.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>

            {dbConversions.length > 0 && (
              <div className="text-sm text-text-muted text-right">
                {dbConversions.length} conversion{dbConversions.length !== 1 ? 's' : ''} defined
              </div>
            )}
          </div>
        </TabsContent>

        {/* Unit Converter Tab */}
        <TabsContent value="converter" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Converter Tool */}
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Calculator className="w-5 h-5 text-primary" />
                <h3 className="font-heading font-bold text-lg">Unit Converter</h3>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-end">
                  <div className="space-y-1.5">
                    <Label className="text-xs">From</Label>
                    <Select value={conversionFrom} onValueChange={(v) => { setConversionFrom(v); setConversionTo(''); }}>
                      <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(unitsByDimension).map(([dim, units]) => (
                          <div key={dim}>
                            <div className="px-2 py-1 text-xs text-text-muted font-medium bg-stone-50">{dim}</div>
                            {units.map((u) => <SelectItem key={u.key} value={u.key}>{u.key} — {u.label}</SelectItem>)}
                          </div>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <ArrowRightLeft className="w-5 h-5 text-stone-400 mb-2" />
                  <div className="space-y-1.5">
                    <Label className="text-xs">To</Label>
                    <Select value={conversionTo} onValueChange={setConversionTo} disabled={!conversionFrom}>
                      <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                      <SelectContent>
                        {getCompatibleUnits(conversionFrom).map((u) => (
                          <SelectItem key={u.key} value={u.key}>{u.key} — {u.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Value</Label>
                  <Input
                    type="number"
                    step="any"
                    value={conversionValue}
                    onChange={(e) => setConversionValue(e.target.value)}
                    className="bg-stone-50 font-mono text-lg"
                    placeholder="1"
                  />
                </div>
                {calculateConversion && !calculateConversion.error && (
                  <Card className="p-4 bg-emerald-50 border-emerald-200">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-emerald-700 font-mono">
                        {calculateConversion.from.value} {calculateConversion.from.unit} = {calculateConversion.to.value.toFixed(6)} {calculateConversion.to.unit}
                      </div>
                      <div className="text-xs text-emerald-600 mt-2 font-mono">
                        Factor: {calculateConversion.factor.toFixed(6)}
                      </div>
                      <div className="text-xs text-emerald-600 mt-1">
                        {calculateConversion.formula}
                      </div>
                    </div>
                  </Card>
                )}
                {calculateConversion?.error && (
                  <Card className="p-4 bg-red-50 border-red-200 text-red-700 text-center">
                    {calculateConversion.error}
                  </Card>
                )}
              </div>
            </Card>

            {/* Conversion Reference Table */}
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Scale className="w-5 h-5 text-primary" />
                <h3 className="font-heading font-bold text-lg">Conversion Reference</h3>
              </div>
              <div className="space-y-4 max-h-[400px] overflow-y-auto">
                {Object.entries(unitsByDimension).map(([dim, units]) => (
                  <div key={dim}>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs">{dim}</Badge>
                      <span className="text-xs text-text-muted">{units.length} units</span>
                    </div>
                    <div className="bg-stone-50 rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-stone-200">
                            <th className="px-3 py-2 text-left">Unit</th>
                            <th className="px-3 py-2 text-left">To Base Factor</th>
                            <th className="px-3 py-2 text-left">Example</th>
                          </tr>
                        </thead>
                        <tbody>
                          {units.sort((a, b) => b.to_base_factor - a.to_base_factor).map((u) => {
                            const baseUnit = units.find((x) => x.to_base_factor === 1);
                            return (
                              <tr key={u.key} className="border-b border-stone-100 last:border-0">
                                <td className="px-3 py-2 font-mono font-medium">{u.key}</td>
                                <td className="px-3 py-2 font-mono">{u.to_base_factor}</td>
                                <td className="px-3 py-2 text-text-muted">
                                  {baseUnit && u.key !== baseUnit.key && (
                                    <>1 {u.key} = {u.to_base_factor} {baseUnit.key}</>
                                  )}
                                  {u.to_base_factor === 1 && <span className="text-primary">(base unit)</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Simple Unit Dialog */}
      <Dialog open={simpleDialogOpen} onOpenChange={setSimpleDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSimple ? 'Edit Simple Unit' : 'Add Simple Unit'}</DialogTitle>
            <DialogDescription>Define a base unit with its dimension and conversion factor to base.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitSimple} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Key *</Label>
                <Input value={simpleForm.key} onChange={(e) => setSimpleForm({ ...simpleForm, key: e.target.value })} required className="bg-stone-50 font-mono" placeholder="e.g., kg, MJ" disabled={!!editingSimple} />
              </div>
              <div className="space-y-1.5">
                <Label>Label</Label>
                <Input value={simpleForm.label} onChange={(e) => setSimpleForm({ ...simpleForm, label: e.target.value })} className="bg-stone-50" placeholder="e.g., kilogram" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Dimension *</Label>
                <Select value={simpleForm.dimension} onValueChange={(v) => setSimpleForm({ ...simpleForm, dimension: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BASE_DIMENSIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>To Base Factor *</Label>
                <Input type="number" step="any" value={simpleForm.to_base_factor} onChange={(e) => setSimpleForm({ ...simpleForm, to_base_factor: e.target.value })} required className="bg-stone-50" placeholder="e.g., 1000 for tonne→kg" />
              </div>
            </div>
            <p className="text-xs text-text-muted">Factor converts this unit to the base unit. E.g., tonne has factor 1000 (1 tonne = 1000 kg).</p>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setSimpleDialogOpen(false)} className="flex-1">Cancel</Button>
              <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90 text-white">{editingSimple ? 'Update' : 'Create'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Compound Unit Dialog */}
      <Dialog open={compoundDialogOpen} onOpenChange={setCompoundDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCompound ? 'Edit Compound Unit' : 'Add Compound Unit'}</DialogTitle>
            <DialogDescription>Build a compound unit from simple units (e.g., MJ/kg = MJ^1 · kg^-1).</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitCompound} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Key *</Label>
                <Input value={compoundForm.key} onChange={(e) => setCompoundForm({ ...compoundForm, key: e.target.value })} required className="bg-stone-50 font-mono" placeholder="e.g., MJ/kg" disabled={!!editingCompound} />
              </div>
              <div className="space-y-1.5">
                <Label>Label</Label>
                <Input value={compoundForm.label} onChange={(e) => setCompoundForm({ ...compoundForm, label: e.target.value })} className="bg-stone-50" placeholder="e.g., megajoule per kg" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Components</Label>
              {compoundForm.components.map((c, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Select value={c.unit_key} onValueChange={(v) => updateComponent(idx, { unit_key: v })}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Select unit" /></SelectTrigger>
                    <SelectContent>
                      {simpleUnits.map((u) => <SelectItem key={u.key} value={u.key}>{u.key} — {u.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="number" value={c.power} onChange={(e) => updateComponent(idx, { power: parseInt(e.target.value) || 1 })} className="w-20 bg-stone-50" placeholder="power" />
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeComponent(idx)} className="text-red-500"><Trash2 className="w-4 h-4" /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addComponent}><Plus className="w-3 h-3 mr-1" />Add Component</Button>
            </div>
            <p className="text-xs text-text-muted">Use positive power for numerator, negative for denominator. E.g., kgCO2/kg = kgCO2^1 · kg^-1</p>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setCompoundDialogOpen(false)} className="flex-1">Cancel</Button>
              <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90 text-white">{editingCompound ? 'Update' : 'Create'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Unit Conversion Dialog */}
      <Dialog open={conversionDialogOpen} onOpenChange={setConversionDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingConversion ? 'Edit Unit Conversion' : 'Add Unit Conversion'}</DialogTitle>
            <DialogDescription>
              Define a conversion factor between two units of the same dimension. The calculation engine will use these DB-defined conversions.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitConversion} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>From Unit *</Label>
                <Select
                  value={conversionForm.from_unit}
                  onValueChange={(v) => setConversionForm({ ...conversionForm, from_unit: v })}
                  disabled={!!editingConversion}
                >
                  <SelectTrigger className="bg-stone-50">
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(unitsByDimension).map(([dim, units]) => (
                      <div key={dim}>
                        <div className="px-2 py-1 text-xs text-text-muted font-medium bg-stone-100">{dim}</div>
                        {units.map((u) => (
                          <SelectItem key={u.key} value={u.key}>
                            {u.key} — {u.label}
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>To Unit *</Label>
                <Select
                  value={conversionForm.to_unit}
                  onValueChange={(v) => setConversionForm({ ...conversionForm, to_unit: v })}
                  disabled={!!editingConversion}
                >
                  <SelectTrigger className="bg-stone-50">
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {conversionForm.from_unit ? (
                      getCompatibleUnits(conversionForm.from_unit)
                        .filter((u) => u.key !== conversionForm.from_unit)
                        .map((u) => (
                          <SelectItem key={u.key} value={u.key}>
                            {u.key} — {u.label}
                          </SelectItem>
                        ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-text-muted">Select "From Unit" first</div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Conversion Factor *</Label>
              <Input
                type="number"
                step="any"
                value={conversionForm.factor}
                onChange={(e) => setConversionForm({ ...conversionForm, factor: e.target.value })}
                required
                className="bg-stone-50 font-mono"
                placeholder="e.g., 0.001 for L → m³"
              />
              <p className="text-xs text-text-muted">
                1 {conversionForm.from_unit || '[from]'} × factor = result in {conversionForm.to_unit || '[to]'}
              </p>
            </div>

            {conversionForm.from_unit && conversionForm.to_unit && conversionForm.factor && (
              <Card className="p-3 bg-blue-50 border-blue-200">
                <div className="text-sm text-blue-800 font-mono text-center">
                  1 {conversionForm.from_unit} = {parseFloat(conversionForm.factor) || 0} {conversionForm.to_unit}
                </div>
              </Card>
            )}

            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea
                value={conversionForm.description}
                onChange={(e) => setConversionForm({ ...conversionForm, description: e.target.value })}
                className="bg-stone-50"
                placeholder="e.g., Volume conversion: liters to cubic meters"
                rows={2}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConversionDialogOpen(false)}
                className="flex-1"
                disabled={savingConversion}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-primary hover:bg-primary/90 text-white"
                disabled={savingConversion || !conversionForm.from_unit || !conversionForm.to_unit || !conversionForm.factor}
              >
                {savingConversion ? 'Saving…' : (editingConversion ? 'Update' : 'Create')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
