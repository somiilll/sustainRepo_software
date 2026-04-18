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
import { Plus, Lock, Trash2, Search } from 'lucide-react';
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
  const [form, setForm] = useState({
    key: '', label: '', type: 'input', dimension: 'generic',
    default_unit: '', description: '',
  });

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

  const submit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/super-admin/calc-engine/variables`, form, { headers: getAuthHeader() });
      toast.success('Variable created');
      setDialogOpen(false);
      setForm({ key: '', label: '', type: 'input', dimension: 'generic', default_unit: '', description: '' });
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Save failed');
    }
  };

  const remove = async (v) => {
    if (v.is_system_defined) return;
    if (!window.confirm(`Delete variable '${v.key}'?`)) return;
    try {
      await axios.delete(`${API}/super-admin/calc-engine/variables/${v.id}`, { headers: getAuthHeader() });
      toast.success('Deleted');
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
          <p className="text-text-secondary">Every formula reference must be registered here. System variables are locked.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="bg-primary hover:bg-primary/90 text-white rounded-full px-6" data-testid="add-variable-btn">
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
              <th className="px-4 py-3 w-20"></th>
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
                <td className="px-4 py-3 text-right">
                  {v.is_system_defined ? (
                    <Badge className="bg-stone-200 text-stone-700 hover:bg-stone-200 text-xs"><Lock className="w-3 h-3 mr-1" />system</Badge>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => remove(v)} className="text-red-500" data-testid={`delete-var-${v.key}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-text-muted">No variables match.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Variable</DialogTitle>
            <DialogDescription>Register a new variable that formulas may reference.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5"><Label>Key *</Label><Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} required className="bg-stone-50 font-mono" placeholder="e.g., carbon_content" data-testid="var-key-input" /></div>
            <div className="space-y-1.5"><Label>Label *</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required className="bg-stone-50" placeholder="Carbon Content" /></div>
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
            <div className="space-y-1.5"><Label>Default Unit</Label><Input value={form.default_unit} onChange={(e) => setForm({ ...form, default_unit: e.target.value })} className="bg-stone-50 font-mono" placeholder="e.g., kg, MJ/kg" /></div>
            <div className="space-y-1.5"><Label>Description</Label><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm" /></div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancel</Button>
              <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90 text-white" data-testid="save-var-btn">Create</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
