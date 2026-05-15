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
import { Plus, Trash2, FileDigit } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function PropertyValuesEditor() {
  const { getAuthHeader } = useAuth();
  const [properties, setProperties] = useState([]);
  const [values, setValues] = useState([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ property_key: '', value: '', unit: '', ctx: [{ k: 'fuel_name', v: '' }] });

  const load = async () => {
    setLoading(true);
    try {
      const [p, vs] = await Promise.all([
        axios.get(`${API}/calc-engine/properties`, { headers: getAuthHeader() }),
        axios.get(`${API}/calc-engine/property-values`, { headers: getAuthHeader() }),
      ]);
      setProperties(p.data || []);
      setValues(vs.data || []);
    } catch (e) {
      toast.error('Failed to load');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);  // eslint-disable-line

  const filtered = useMemo(
    () => (selectedKey ? values.filter((v) => v.property_key === selectedKey) : values),
    [values, selectedKey],
  );

  const openAdd = () => {
    setForm({
      property_key: selectedKey || (properties[0]?.key ?? ''),
      value: '', unit: '', ctx: [{ k: 'fuel_name', v: '' }, { k: 'region', v: '' }],
    });
    setDialogOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      const context = Object.fromEntries(
        form.ctx.filter((row) => row.k && row.v).map((row) => [row.k, row.v]),
      );
      const prop = properties.find((p) => p.key === form.property_key);
      const unit = form.unit || prop?.unit || '';
      await axios.post(`${API}/super-admin/calc-engine/property-values`, {
        property_key: form.property_key,
        value: Number(form.value),
        unit,
        context,
      }, { headers: getAuthHeader() });
      toast.success('Property value added');
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Save failed');
    }
  };

  const remove = async (v) => {
    if (!window.confirm(`Delete property value '${v.property_key}' = ${v.value}?`)) return;
    try {
      await axios.delete(`${API}/super-admin/calc-engine/property-values/${v.id}`, { headers: getAuthHeader() });
      toast.success('Deleted');
      await load();
    } catch (err) { toast.error(err.response?.data?.detail || 'Delete failed'); }
  };

  if (loading) return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6" data-testid="property-values-page">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Property Values</h1>
          <p className="text-text-secondary">Context-keyed values for CV, density, EFs, GWPs used by the calc engine.</p>
        </div>
        <Button onClick={openAdd} className="bg-primary hover:bg-primary/90 text-white rounded-full px-6" data-testid="add-pv-btn">
          <Plus className="w-4 h-4 mr-2" />Add Property Value
        </Button>
      </div>

      <Card className="p-4 flex flex-wrap gap-3 items-center">
        <Label className="text-sm">Filter by property:</Label>
        <Select value={selectedKey || 'all'} onValueChange={(v) => setSelectedKey(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All properties</SelectItem>
            {properties.map((p) => <SelectItem key={p.key} value={p.key}>{p.key} — {p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto text-sm text-text-muted">{filtered.length} values</div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-text-muted">
            <tr>
              <th className="px-4 py-3">Property</th>
              <th className="px-4 py-3">Value</th>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3">Context</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 500).map((v) => (
              <tr key={v.id} className="border-t border-stone-100 hover:bg-stone-50/50">
                <td className="px-4 py-3 font-mono text-xs">{v.property_key}</td>
                <td className="px-4 py-3 font-mono">{Number(v.value).toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                <td className="px-4 py-3 font-mono text-xs text-text-muted">{v.unit}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(v.context || {}).map(([k, val]) => (
                      <Badge key={k} variant="outline" className="font-mono text-[10px]">{k}={String(val)}</Badge>
                    ))}
                    {Object.keys(v.context || {}).length === 0 && <span className="text-text-muted text-xs italic">(global)</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-text-muted">{v.source || 'manual'}</td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant="ghost" onClick={() => remove(v)} className="text-red-500"><Trash2 className="w-4 h-4" /></Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-text-muted">No values. Click "Add" or use the "Sync to Calc Engine" button on the Fuel DB page.</td></tr>}
            {filtered.length > 500 && <tr><td colSpan={6} className="px-4 py-3 text-center text-text-muted text-xs">Showing first 500 of {filtered.length}. Filter to narrow.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Add Property Value</DialogTitle>
            <DialogDescription>Define a value + context that the resolver will match on.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Property *</Label>
                <Select value={form.property_key} onValueChange={(v) => setForm({ ...form, property_key: v })}>
                  <SelectTrigger data-testid="pv-property-select"><SelectValue /></SelectTrigger>
                  <SelectContent>{properties.map((p) => <SelectItem key={p.key} value={p.key}>{p.key}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Unit</Label>
                <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="bg-stone-50 font-mono" placeholder={properties.find(p => p.key === form.property_key)?.unit || 'unit'} />
              </div>
            </div>
            <div className="space-y-1.5"><Label>Value *</Label>
              <Input type="number" step="any" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required className="bg-stone-50" data-testid="pv-value-input" />
            </div>
            <div className="space-y-1.5">
              <Label>Context <span className="text-xs text-text-muted font-normal">(key-value pairs, e.g. fuel_name=Diesel)</span></Label>
              {form.ctx.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <Input placeholder="key" value={row.k} onChange={(e) => { const c = [...form.ctx]; c[i] = { ...row, k: e.target.value }; setForm({ ...form, ctx: c }); }} className="bg-stone-50" />
                  <Input placeholder="value" value={row.v} onChange={(e) => { const c = [...form.ctx]; c[i] = { ...row, v: e.target.value }; setForm({ ...form, ctx: c }); }} className="bg-stone-50" />
                  <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, ctx: form.ctx.filter((_, j) => j !== i) })}><Trash2 className="w-4 h-4" /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, ctx: [...form.ctx, { k: '', v: '' }] })}><Plus className="w-3 h-3 mr-1" />Add context field</Button>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancel</Button>
              <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90 text-white" data-testid="save-pv-btn">Add</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
