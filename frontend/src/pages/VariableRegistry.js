import React, { useEffect, useMemo, useState } from 'react';
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
import { Plus, Trash2, Search, Edit, Link2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const TYPE_OPTIONS = [
  { value: 'input', label: 'Input (provided at runtime)' },
  { value: 'property', label: 'Property (resolved from DB)' },
  { value: 'intermediate', label: 'Intermediate (step output)' },
  { value: 'output', label: 'Output (final emission)' },
];
const DIMENSIONS = [
  'mass', 'volume', 'energy', 'money', 'time', 'count',
  'mass_co2', 'mass_ch4', 'mass_n2o', 'mass_co2e',
  'emission_per_activity', 'energy_per_mass', 'mass_per_volume',
  'gwp_factor', 'generic', 'dimensionless',
];

export default function VariableRegistry() {
  const { getAuthHeader } = useAuth();
  const [vars, setVars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVar, setEditingVar] = useState(null);
  const [form, setForm] = useState({
    key: '', label: '', type: 'input', dimension: 'generic',
    default_unit: '', description: '',
  });
  const [usageDialogOpen, setUsageDialogOpen] = useState(false);
  const [usageData, setUsageData] = useState(null);
  const [usageLoading, setUsageLoading] = useState(false);

  const load = async () => {
    try {
      const res = await axios.get(`${API}/calc-engine/variables`, { headers: getAuthHeader() });
      setVars(res.data || []);
    } catch (e) {
      toast.error('Failed to load variables');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);  // eslint-disable-line

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return vars.filter((v) => {
      if (term && !(v.key.toLowerCase().includes(term) || (v.label || '').toLowerCase().includes(term))) return false;
      if (filterType !== 'all' && v.type !== filterType) return false;
      return true;
    });
  }, [vars, search, filterType]);

  const openCreate = () => {
    setEditingVar(null);
    setForm({ key: '', label: '', type: 'input', dimension: 'generic', default_unit: '', description: '' });
    setDialogOpen(true);
  };

  const openEdit = (v) => {
    setEditingVar(v);
    setForm({
      key: v.key,
      label: v.label,
      type: v.type,
      dimension: v.dimension,
      default_unit: v.default_unit || '',
      description: v.description || '',
    });
    setDialogOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      if (editingVar) {
        await axios.put(`${API}/super-admin/calc-engine/variables/${editingVar.id}`, form, { headers: getAuthHeader() });
        toast.success('Variable updated');
      } else {
        await axios.post(`${API}/super-admin/calc-engine/variables`, form, { headers: getAuthHeader() });
        toast.success('Variable created');
      }
      setDialogOpen(false);
      setEditingVar(null);
      setForm({ key: '', label: '', type: 'input', dimension: 'generic', default_unit: '', description: '' });
      load(); // Don't await - let it refresh in background
    } catch (err) {
      console.error('Save error:', err);
      toast.error(err.response?.data?.detail || 'Save failed');
    }
  };

  const checkUsage = async (v) => {
    setUsageLoading(true);
    setUsageDialogOpen(true);
    try {
      const res = await axios.get(`${API}/super-admin/calc-engine/variables/${v.id}/usage`, { headers: getAuthHeader() });
      setUsageData(res.data);
    } catch (err) {
      toast.error('Failed to check usage');
      setUsageDialogOpen(false);
    } finally {
      setUsageLoading(false);
    }
  };

  const remove = async (v) => {
    if (!window.confirm(`Delete variable '${v.key}'?`)) return;
    try {
      await axios.delete(`${API}/super-admin/calc-engine/variables/${v.id}`, { headers: getAuthHeader() });
      toast.success(`Variable '${v.key}' deleted`);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Delete failed');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-6" data-testid="variable-registry-page">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Variable Registry</h1>
          <p className="text-text-secondary">Every formula reference must be registered here. Variables in use by formulas cannot be deleted.</p>
        </div>
        <Button onClick={openCreate} className="bg-primary hover:bg-primary/90 text-white rounded-full px-6" data-testid="add-variable-btn">
          <Plus className="w-4 h-4 mr-2" />Add Variable
        </Button>
      </div>

      <Card className="p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search key or label…" className="pl-9 bg-stone-50" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {TYPE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto text-sm text-text-muted">{filtered.length} of {vars.length}</div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-text-muted">
            <tr>
              <th className="px-4 py-3">Key</th>
              <th className="px-4 py-3">Label</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Dimension</th>
              <th className="px-4 py-3">Default Unit</th>
              <th className="px-4 py-3 w-32">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((v) => (
              <tr key={v.id} className="border-t border-stone-100 hover:bg-stone-50/50" data-testid={`var-row-${v.key}`}>
                <td className="px-4 py-3 font-mono font-medium text-text-primary">{v.key}</td>
                <td className="px-4 py-3">{v.label}</td>
                <td className="px-4 py-3"><Badge variant="outline" className="text-xs">{v.type}</Badge></td>
                <td className="px-4 py-3 text-text-muted text-xs">{v.dimension}</td>
                <td className="px-4 py-3 font-mono text-xs text-text-muted">{v.default_unit || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => checkUsage(v)} title="Check usage" data-testid={`usage-var-${v.key}`}>
                      <Link2 className="w-4 h-4 text-stone-500" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(v)} title="Edit" data-testid={`edit-var-${v.key}`}>
                      <Edit className="w-4 h-4 text-blue-500" />
                    </Button>
                    <Button size="sm" variant="ghost" type="button" onClick={() => remove(v)} title="Delete" className="text-red-500 hover:text-red-600 hover:bg-red-50" data-testid={`delete-var-${v.key}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-text-muted">No variables match.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingVar ? 'Edit Variable' : 'Add Variable'}</DialogTitle>
            <DialogDescription>
              {editingVar ? 'Update the variable details. Key changes blocked if used in formulas.' : 'Register a new variable that formulas may reference.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Key *</Label>
              <Input 
                value={form.key} 
                onChange={(e) => setForm({ ...form, key: e.target.value })} 
                required 
                className="bg-stone-50 font-mono" 
                placeholder="e.g., carbon_content" 
                data-testid="var-key-input" 
              />
            </div>
            <div className="space-y-1.5">
              <Label>Label *</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required className="bg-stone-50" placeholder="Carbon Content" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Type *</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Dimension *</Label>
                <Select value={form.dimension} onValueChange={(v) => setForm({ ...form, dimension: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DIMENSIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Default Unit</Label>
              <Input value={form.default_unit} onChange={(e) => setForm({ ...form, default_unit: e.target.value })} className="bg-stone-50 font-mono" placeholder="e.g., kg, MJ/kg" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancel</Button>
              <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90 text-white" data-testid="save-var-btn">
                {editingVar ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Usage Dialog */}
      <Dialog open={usageDialogOpen} onOpenChange={setUsageDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Variable Usage</DialogTitle>
            <DialogDescription>
              {usageData?.variable?.key ? `Checking where '${usageData.variable.key}' is used` : 'Loading...'}
            </DialogDescription>
          </DialogHeader>
          {usageLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : usageData ? (
            <div className="space-y-4">
              {usageData.used_in_formulas.length === 0 ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <p className="text-green-700 font-medium">Not used in any formula</p>
                  <p className="text-green-600 text-sm mt-1">This variable can be safely deleted or modified.</p>
                </div>
              ) : (
                <>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-amber-700 font-medium mb-2">
                      <AlertCircle className="w-4 h-4" />
                      Used in {usageData.used_in_formulas.length} formula(s)
                    </div>
                    <p className="text-amber-600 text-sm">Cannot delete this variable. Remove it from these formulas first.</p>
                  </div>
                  <div className="space-y-2">
                    {usageData.used_in_formulas.map((f, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-stone-50 rounded-lg">
                        <div>
                          <div className="font-medium text-text-primary">{f.name}</div>
                          <div className="text-xs text-text-muted">Used as: {f.usage}</div>
                        </div>
                        <Badge variant="outline" className="text-xs">{f.id.slice(0, 8)}...</Badge>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <Button variant="outline" onClick={() => setUsageDialogOpen(false)} className="w-full">Close</Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
