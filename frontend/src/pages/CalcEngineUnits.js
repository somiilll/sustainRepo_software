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
import { Plus, Trash2, Edit, Search, Scale, Combine, Lock } from 'lucide-react';
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

  // Simple unit dialog
  const [simpleDialogOpen, setSimpleDialogOpen] = useState(false);
  const [editingSimple, setEditingSimple] = useState(null);
  const [simpleForm, setSimpleForm] = useState({
    key: '', label: '', dimension: 'mass', to_base_factor: '1',
  });

  // Compound unit dialog
  const [compoundDialogOpen, setCompoundDialogOpen] = useState(false);
  const [editingCompound, setEditingCompound] = useState(null);
  const [compoundForm, setCompoundForm] = useState({
    key: '', label: '', components: [{ unit_key: '', power: 1 }],
  });

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/calc-engine/units`, { headers: getAuthHeader() });
      setSimpleUnits(res.data.simple || []);
      setCompoundUnits(res.data.compound || []);
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
    if (u.is_system) {
      toast.error('System units cannot be deleted');
      return;
    }
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
      await axios.post(`${API}/super-admin/calc-engine/compound-units`, payload, { headers: getAuthHeader() });
      toast.success('Compound unit created');
      setCompoundDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Save failed');
    }
  };

  const deleteCompound = async (u) => {
    if (u.is_system) {
      toast.error('System compound units cannot be deleted');
      return;
    }
    if (!window.confirm(`Delete compound unit '${u.key}'?`)) return;
    try {
      await axios.delete(`${API}/super-admin/calc-engine/compound-units/${u.id}`, { headers: getAuthHeader() });
      toast.success('Compound unit deleted');
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
                      {u.is_system ? (
                        <Badge className="bg-stone-200 text-stone-700 hover:bg-stone-200 text-xs"><Lock className="w-3 h-3 mr-1" />system</Badge>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEditSimple(u)}><Edit className="w-4 h-4 text-blue-500" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteSimple(u)} className="text-red-500"><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      )}
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
                      {u.is_system ? (
                        <Badge className="bg-stone-200 text-stone-700 hover:bg-stone-200 text-xs"><Lock className="w-3 h-3 mr-1" />system</Badge>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => deleteCompound(u)} className="text-red-500"><Trash2 className="w-4 h-4" /></Button>
                      )}
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
            <DialogTitle>Add Compound Unit</DialogTitle>
            <DialogDescription>Build a compound unit from simple units (e.g., MJ/kg = MJ^1 · kg^-1).</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitCompound} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Key *</Label>
                <Input value={compoundForm.key} onChange={(e) => setCompoundForm({ ...compoundForm, key: e.target.value })} required className="bg-stone-50 font-mono" placeholder="e.g., MJ/kg" />
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
              <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90 text-white">Create</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
