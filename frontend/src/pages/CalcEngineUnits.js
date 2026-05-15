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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
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
  const [activeTab, setActiveTab] = useState('compound'); // Default to compound since simple units are managed in Units module

  // Conversion preview state
  const [conversionFrom, setConversionFrom] = useState('');
  const [conversionTo, setConversionTo] = useState('');
  const [conversionValue, setConversionValue] = useState('1');
  const [conversionResult, setConversionResult] = useState(null);
  const [converting, setConverting] = useState(false);
  const [selectedFuel, setSelectedFuel] = useState('');
  const [fuels, setFuels] = useState([]);

  // DB-driven conversions
  const [dbConversions, setDbConversions] = useState([]);
  const [conversionDialogOpen, setConversionDialogOpen] = useState(false);
  const [editingConversion, setEditingConversion] = useState(null);
  const [conversionForm, setConversionForm] = useState({
    from_unit: '', to_unit: '', factor: '', description: '',
    conversion_type: 'static', // 'static' or 'property_based'
    property_key: '', // for property-based conversions (e.g., 'density')
  });
  const [conversionSearch, setConversionSearch] = useState('');
  const [savingConversion, setSavingConversion] = useState(false);
  const [propertyVariables, setPropertyVariables] = useState([]); // For property-based conversions

  // Compound unit dialog
  const [compoundDialogOpen, setCompoundDialogOpen] = useState(false);
  const [editingCompound, setEditingCompound] = useState(null);
  const [compoundForm, setCompoundForm] = useState({
    key: '', label: '', components: [{ unit_key: '', power: 1 }],
  });

  // Delete confirmation dialog
  const [confirmDialog, setConfirmDialog] = useState({ open: false, type: null, item: null });

  // Available units from Units module (for dropdown)
  const [availableUnits, setAvailableUnits] = useState([]);

  const load = useCallback(async () => {
    try {
      const [unitsRes, convRes, availRes, varsRes, fuelsRes] = await Promise.all([
        axios.get(`${API}/calc-engine/units`, { headers: getAuthHeader() }),
        axios.get(`${API}/calc-engine/unit-conversions`, { headers: getAuthHeader() }),
        axios.get(`${API}/units`, { headers: getAuthHeader() }),
        axios.get(`${API}/calc-engine/variables`, { headers: getAuthHeader() }),
        axios.get(`${API}/fuel-database`, { headers: getAuthHeader() }),
      ]);
      setSimpleUnits(unitsRes.data.simple || []);
      setCompoundUnits(unitsRes.data.compound || []);
      setDbConversions(convRes.data || []);
      setAvailableUnits(availRes.data || []);
      // Filter property-type variables for property-based conversions
      setPropertyVariables((varsRes.data || []).filter(v => v.type === 'property'));
      setFuels(fuelsRes.data || []);
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
    if (!unitKey) return [];
    const unit = simpleUnits.find((u) => u.key === unitKey);
    if (!unit) return simpleUnits; // Return all if unit not found
    
    const dim = Object.keys(unit.dimension_vector || {})[0];
    const sameDimUnits = unitsByDimension[dim] || [];
    
    // Also include units that have DB conversions defined (for cross-dimension like L→kg)
    const dbConversionTargets = dbConversions
      .filter(c => c.from_unit === unitKey)
      .map(c => simpleUnits.find(u => u.key === c.to_unit))
      .filter(Boolean);
    
    const dbConversionSources = dbConversions
      .filter(c => c.to_unit === unitKey)
      .map(c => simpleUnits.find(u => u.key === c.from_unit))
      .filter(Boolean);
    
    // Combine and dedupe
    const allUnits = [...sameDimUnits, ...dbConversionTargets, ...dbConversionSources];
    const seen = new Set();
    return allUnits.filter(u => {
      if (seen.has(u.key)) return false;
      seen.add(u.key);
      return true;
    });
  };

  // Get all compatible units including compound units
  const getAllCompatibleUnits = (unitKey) => {
    if (!unitKey) return [];
    
    // Check if it's a simple unit
    const simpleUnit = simpleUnits.find((u) => u.key === unitKey);
    // Check if it's a compound unit
    const compoundUnit = compoundUnits.find((u) => u.key === unitKey);
    
    let result = [];
    
    if (simpleUnit) {
      // For simple units, get compatible simple units
      result = getCompatibleUnits(unitKey);
    } else if (compoundUnit) {
      // For compound units, find other compound units with same derived dimension
      const derivedDim = JSON.stringify(compoundUnit.derived_dimension_vector || {});
      result = compoundUnits.filter(u => 
        u.key !== unitKey && 
        JSON.stringify(u.derived_dimension_vector || {}) === derivedDim
      );
    }
    
    // Also add any units with DB-defined conversions (from or to this unit)
    const dbTargets = dbConversions
      .filter(c => c.from_unit === unitKey)
      .map(c => {
        const simple = simpleUnits.find(u => u.key === c.to_unit);
        const compound = compoundUnits.find(u => u.key === c.to_unit);
        return simple || compound;
      })
      .filter(Boolean);
    
    const dbSources = dbConversions
      .filter(c => c.to_unit === unitKey)
      .map(c => {
        const simple = simpleUnits.find(u => u.key === c.from_unit);
        const compound = compoundUnits.find(u => u.key === c.from_unit);
        return simple || compound;
      })
      .filter(Boolean);
    
    // Combine and dedupe
    const allUnits = [...result, ...dbTargets, ...dbSources];
    const seen = new Set();
    return allUnits.filter(u => {
      if (!u || seen.has(u.key)) return false;
      seen.add(u.key);
      return true;
    });
  };

  // Check if conversion requires a property (cross-dimension)
  const getConversionInfo = useMemo(() => {
    if (!conversionFrom || !conversionTo) return null;
    
    // Check if there's a DB conversion defined
    const dbConv = dbConversions.find(
      c => (c.from_unit === conversionFrom && c.to_unit === conversionTo) ||
           (c.from_unit === conversionTo && c.to_unit === conversionFrom)
    );
    
    if (dbConv) {
      return {
        type: dbConv.conversion_type || 'static',
        property_key: dbConv.property_key,
        factor: dbConv.factor,
        isReverse: dbConv.from_unit === conversionTo,
      };
    }
    
    // Check if both are simple units of same dimension
    const fromSimple = simpleUnits.find(u => u.key === conversionFrom);
    const toSimple = simpleUnits.find(u => u.key === conversionTo);
    if (fromSimple && toSimple) {
      const fromDim = Object.keys(fromSimple.dimension_vector || {})[0];
      const toDim = Object.keys(toSimple.dimension_vector || {})[0];
      if (fromDim === toDim) {
        return { type: 'same_dimension' };
      }
    }
    
    // Check if both are compound units with same derived dimension
    const fromCompound = compoundUnits.find(u => u.key === conversionFrom);
    const toCompound = compoundUnits.find(u => u.key === conversionTo);
    if (fromCompound && toCompound) {
      const fromDerived = JSON.stringify(fromCompound.derived_dimension_vector || {});
      const toDerived = JSON.stringify(toCompound.derived_dimension_vector || {});
      if (fromDerived === toDerived) {
        return { type: 'compound_same_dimension', fromUnit: fromCompound, toUnit: toCompound };
      }
    }
    
    return { type: 'no_conversion' };
  }, [conversionFrom, conversionTo, dbConversions, simpleUnits, compoundUnits]);

  // Perform conversion using backend API
  const doConversion = async () => {
    if (!conversionFrom || !conversionTo || !conversionValue) return;
    setConverting(true);
    setConversionResult(null);
    
    try {
      const params = new URLSearchParams({
        value: conversionValue,
        from_unit: conversionFrom,
        to_unit: conversionTo,
      });
      
      // If property-based conversion, include fuel_name for property lookup
      if (getConversionInfo?.type === 'property_based' && selectedFuel) {
        params.append('fuel_name', selectedFuel);
      }
      
      const res = await axios.get(`${API}/calc-engine/convert?${params.toString()}`, { headers: getAuthHeader() });
      setConversionResult({
        success: true,
        from: { value: parseFloat(conversionValue), unit: conversionFrom },
        to: { value: res.data.result, unit: conversionTo },
        factor: res.data.factor,
        method: res.data.method,
        property_key: res.data.property_key,
        property_value: res.data.property_value,
      });
    } catch (err) {
      setConversionResult({
        success: false,
        error: err.response?.data?.detail || 'Conversion failed',
      });
    } finally {
      setConverting(false);
    }
  };

  // Auto-convert when inputs change (for static/same-dimension conversions)
  useEffect(() => {
    if (conversionFrom && conversionTo && conversionValue) {
      if (getConversionInfo?.type !== 'property_based') {
        doConversion();
      } else {
        // For property-based, wait for fuel selection
        setConversionResult(null);
      }
    } else {
      setConversionResult(null);
    }
  }, [conversionFrom, conversionTo, conversionValue, getConversionInfo?.type]);

  // Open delete confirmation for compound unit
  const openDeleteCompound = (u) => {
    setConfirmDialog({ open: true, type: 'compound', item: u });
  };

  // Open delete confirmation for conversion
  const openDeleteConversion = (conv) => {
    setConfirmDialog({ open: true, type: 'conversion', item: conv });
  };

  // Confirm delete action
  const confirmDelete = async () => {
    const { type, item } = confirmDialog;
    if (!item) return;
    try {
      if (type === 'compound') {
        await axios.delete(`${API}/super-admin/calc-engine/compound-units/${item.id}`, { headers: getAuthHeader() });
        toast.success('Compound unit deleted');
      } else if (type === 'conversion') {
        await axios.delete(`${API}/super-admin/calc-engine/unit-conversions/${item.id}`, { headers: getAuthHeader() });
        toast.success('Conversion deleted');
      }
      setConfirmDialog({ open: false, type: null, item: null });
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Delete failed');
      setConfirmDialog({ open: false, type: null, item: null });
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
    setConversionForm({ 
      from_unit: '', to_unit: '', factor: '', description: '',
      conversion_type: 'static', property_key: ''
    });
    setConversionDialogOpen(true);
  };

  const openEditConversion = (conv) => {
    setEditingConversion(conv);
    setConversionForm({
      from_unit: conv.from_unit,
      to_unit: conv.to_unit,
      factor: conv.factor ? String(conv.factor) : '',
      description: conv.description || '',
      conversion_type: conv.conversion_type || 'static',
      property_key: conv.property_key || '',
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
        description: conversionForm.description,
        conversion_type: conversionForm.conversion_type,
      };
      // For static conversions, include factor; for property-based, include property_key
      if (conversionForm.conversion_type === 'static') {
        payload.factor = parseFloat(conversionForm.factor);
      } else {
        payload.property_key = conversionForm.property_key;
        payload.factor = null; // Factor is dynamic, resolved at runtime
      }
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

        {/* Info about Simple Units */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <Scale className="w-4 h-4 inline mr-2" />
          <strong>Simple Units:</strong> Managed in the <a href="/units" className="underline font-medium">Units module</a>. 
          All {simpleUnits.length} simple units are automatically available here for creating compound units.
        </div>

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
                        <Button size="sm" variant="ghost" type="button" onClick={() => openDeleteCompound(u)} className="text-red-500 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
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
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Factor / Property</th>
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
                      <td className="px-4 py-3">
                        <Badge 
                          variant="outline" 
                          className={conv.conversion_type === 'property_based' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200'}
                        >
                          {conv.conversion_type === 'property_based' ? 'Property-based' : 'Static'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm">
                        {conv.conversion_type === 'property_based' ? (
                          <span className="text-amber-700">× {conv.property_key}</span>
                        ) : (
                          <span>× {conv.factor}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-muted text-sm max-w-[200px] truncate">{conv.description || '—'}</td>
                      <td className="px-4 py-3 text-xs text-text-muted">{conv.defined_by || 'system'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" type="button" onClick={() => openEditConversion(conv)}>
                            <Edit className="w-4 h-4 text-blue-500" />
                          </Button>
                          <Button size="sm" variant="ghost" type="button" onClick={() => openDeleteConversion(conv)} className="text-red-500 hover:text-red-600 hover:bg-red-50">
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
                    <Select value={conversionFrom} onValueChange={(v) => { setConversionFrom(v); setConversionTo(''); setConversionResult(null); }}>
                      <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                      <SelectContent>
                        {/* Simple Units */}
                        <div className="px-2 py-1 text-xs text-text-muted font-semibold bg-stone-100 sticky top-0">Simple Units</div>
                        {Object.entries(unitsByDimension).map(([dim, units]) => (
                          <div key={dim}>
                            <div className="px-2 py-1 text-xs text-text-muted font-medium bg-stone-50">{dim}</div>
                            {units.map((u) => <SelectItem key={u.key} value={u.key}>{u.key} — {u.label}</SelectItem>)}
                          </div>
                        ))}
                        {/* Compound Units */}
                        {compoundUnits.length > 0 && (
                          <>
                            <div className="px-2 py-1 text-xs text-text-muted font-semibold bg-blue-100 sticky top-0 mt-2">Compound Units</div>
                            {compoundUnits.map((u) => (
                              <SelectItem key={u.key} value={u.key}>
                                {u.key} — {u.label || u.key}
                              </SelectItem>
                            ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <ArrowRightLeft className="w-5 h-5 text-stone-400 mb-2" />
                  <div className="space-y-1.5">
                    <Label className="text-xs">To</Label>
                    <Select value={conversionTo} onValueChange={setConversionTo} disabled={!conversionFrom}>
                      <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                      <SelectContent>
                        {getAllCompatibleUnits(conversionFrom).map((u) => (
                          <SelectItem key={u.key} value={u.key}>{u.key} — {u.label || u.key}</SelectItem>
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

                {/* Property-based conversion: show fuel selector */}
                {getConversionInfo?.type === 'property_based' && (
                  <Card className="p-4 bg-amber-50 border-amber-200">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-amber-600" />
                        <span className="text-sm font-medium text-amber-800">
                          Property-Based Conversion (uses {getConversionInfo.property_key})
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-amber-700">Select Fuel to get {getConversionInfo.property_key}</Label>
                        <Select value={selectedFuel} onValueChange={setSelectedFuel}>
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Select a fuel..." />
                          </SelectTrigger>
                          <SelectContent>
                            {fuels.map((f) => (
                              <SelectItem key={f.id} value={f.fuel_name}>
                                {f.fuel_name} — {getConversionInfo.property_key}: {f[getConversionInfo.property_key] || 'N/A'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button 
                        onClick={doConversion} 
                        disabled={!selectedFuel || converting}
                        className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                      >
                        {converting ? 'Converting...' : 'Convert'}
                      </Button>
                    </div>
                  </Card>
                )}

                {/* Loading state */}
                {converting && (
                  <div className="text-center text-text-muted py-4">Converting...</div>
                )}

                {/* Success result */}
                {conversionResult?.success && (
                  <Card className="p-4 bg-emerald-50 border-emerald-200">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-emerald-700 font-mono">
                        {conversionResult.from.value} {conversionResult.from.unit} = {conversionResult.to.value.toFixed(6)} {conversionResult.to.unit}
                      </div>
                      <div className="text-xs text-emerald-600 mt-2 font-mono">
                        Factor: {conversionResult.factor?.toFixed(6) || 'N/A'}
                      </div>
                      {conversionResult.method && (
                        <div className="text-xs text-emerald-600 mt-1">
                          Method: {conversionResult.method}
                        </div>
                      )}
                      {conversionResult.property_key && (
                        <div className="text-xs text-emerald-600 mt-1">
                          {conversionResult.property_key}: {conversionResult.property_value}
                        </div>
                      )}
                    </div>
                  </Card>
                )}

                {/* Error result */}
                {conversionResult && !conversionResult.success && (
                  <Card className="p-4 bg-red-50 border-red-200 text-red-700 text-center">
                    {conversionResult.error}
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
              Define a conversion between units. Use static factor for same-dimension conversions, or property-based for cross-dimension (e.g., L → kg using density).
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
                    {simpleUnits.map((u) => (
                      <SelectItem key={u.key} value={u.key}>
                        {u.key} — {u.label}
                      </SelectItem>
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
                    {simpleUnits
                      .filter((u) => u.key !== conversionForm.from_unit)
                      .map((u) => (
                        <SelectItem key={u.key} value={u.key}>
                          {u.key} — {u.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Conversion Type Selection */}
            <div className="space-y-1.5">
              <Label>Conversion Type *</Label>
              <Select
                value={conversionForm.conversion_type}
                onValueChange={(v) => setConversionForm({ ...conversionForm, conversion_type: v, factor: '', property_key: '' })}
              >
                <SelectTrigger className="bg-stone-50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="static">Static Factor (same dimension, e.g., L → m³)</SelectItem>
                  <SelectItem value="property_based">Property-Based (cross dimension, e.g., L → kg via density)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Static Factor Input */}
            {conversionForm.conversion_type === 'static' && (
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
            )}

            {/* Property-Based Input */}
            {conversionForm.conversion_type === 'property_based' && (
              <div className="space-y-1.5">
                <Label>Property Key *</Label>
                <Select
                  value={conversionForm.property_key}
                  onValueChange={(v) => setConversionForm({ ...conversionForm, property_key: v })}
                >
                  <SelectTrigger className="bg-stone-50">
                    <SelectValue placeholder="Select property (e.g., density)" />
                  </SelectTrigger>
                  <SelectContent>
                    {propertyVariables.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {p.key} — {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-text-muted">
                  The property value will be used as the conversion factor at runtime (looked up from fuel/context).
                </p>
              </div>
            )}

            {/* Preview */}
            {conversionForm.from_unit && conversionForm.to_unit && (
              <Card className={`p-3 ${conversionForm.conversion_type === 'property_based' ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
                <div className={`text-sm font-mono text-center ${conversionForm.conversion_type === 'property_based' ? 'text-amber-800' : 'text-blue-800'}`}>
                  {conversionForm.conversion_type === 'static' && conversionForm.factor ? (
                    <>1 {conversionForm.from_unit} = {parseFloat(conversionForm.factor) || 0} {conversionForm.to_unit}</>
                  ) : conversionForm.conversion_type === 'property_based' && conversionForm.property_key ? (
                    <>1 {conversionForm.from_unit} × {conversionForm.property_key} = ? {conversionForm.to_unit}</>
                  ) : (
                    <span className="text-text-muted">Enter factor or select property</span>
                  )}
                </div>
              </Card>
            )}

            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea
                value={conversionForm.description}
                onChange={(e) => setConversionForm({ ...conversionForm, description: e.target.value })}
                className="bg-stone-50"
                placeholder="e.g., Volume to mass conversion using fuel density"
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
                disabled={
                  savingConversion || 
                  !conversionForm.from_unit || 
                  !conversionForm.to_unit || 
                  (conversionForm.conversion_type === 'static' && !conversionForm.factor) ||
                  (conversionForm.conversion_type === 'property_based' && !conversionForm.property_key)
                }
              >
                {savingConversion ? 'Saving…' : (editingConversion ? 'Update' : 'Create')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog.type === 'simple' && 'Delete Unit'}
              {confirmDialog.type === 'compound' && 'Delete Compound Unit'}
              {confirmDialog.type === 'conversion' && 'Delete Conversion'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.type === 'simple' && `Are you sure you want to delete unit "${confirmDialog.item?.key}"? This action cannot be undone.`}
              {confirmDialog.type === 'compound' && `Are you sure you want to delete compound unit "${confirmDialog.item?.key}"? This action cannot be undone.`}
              {confirmDialog.type === 'conversion' && `Are you sure you want to delete the conversion from "${confirmDialog.item?.from_unit}" to "${confirmDialog.item?.to_unit}"? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDialog({ open: false, type: null, item: null })}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
