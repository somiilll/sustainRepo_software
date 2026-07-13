import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Progress } from '../components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { Target, Plus, Edit2, Trash2, TrendingDown, Zap } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';

const RedDot = ({ cx, cy, payload, dataKey, compareKey }) => {
  if (payload[dataKey] == null) return null;
  const isAbove = payload[compareKey] != null && payload[dataKey] > payload[compareKey];
  return <circle cx={cx} cy={cy} r={4} fill={isAbove ? '#dc2626' : '#0ea5e9'} stroke="#fff" strokeWidth={1.5} />;
};
import { generateReportingYears } from '../utils/reportingYearUtils';

const API = process.env.REACT_APP_BACKEND_URL;

const TARGET_TYPES = [
  { value: 'percentage', label: 'Percentage Reduction' },
  { value: 'intensity_revenue', label: 'Intensity by Revenue' },
  { value: 'intensity_production', label: 'Intensity by Production' },
];

function TargetCard({ target, onEdit, onDelete, token }) {
  const [progress, setProgress] = useState(null);
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    axios.get(`${API}/api/sbti-targets/progress/${target.id}`, { headers })
      .then(r => setProgress(r.data))
      .catch(() => null);
  }, [target.id]);

  const ach = progress?.achievement_percentage;
  const isIntensity = target.target_type !== 'percentage';

  return (
    <Card className="p-5 border border-stone-200" data-testid={`sbti-target-${target.id}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-text-primary">{target.target_name}</h3>
          <p className="text-xs text-text-muted">{target.kpi_name}</p>
        </div>
        <div className="flex gap-1">
          <Badge variant="outline" className="text-xs">{TARGET_TYPES.find(t => t.value === target.target_type)?.label}</Badge>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(target)}><Edit2 className="w-3.5 h-3.5" /></Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => onDelete(target)}><Trash2 className="w-3.5 h-3.5" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 text-sm mb-3">
        <div><span className="text-text-muted text-xs">Base Year</span><p className="font-medium">{target.base_year}</p></div>
        <div><span className="text-text-muted text-xs">Target Year</span><p className="font-medium">{target.target_year}</p></div>
        <div>
          <span className="text-text-muted text-xs">{isIntensity ? 'Base Intensity' : 'Base Value'}</span>
          <p className="font-medium">{isIntensity ? target.base_year_intensity : target.base_year_value?.toLocaleString()}</p>
        </div>
        <div>
          <span className="text-text-muted text-xs">{isIntensity ? 'Target Intensity' : 'Target Value'}</span>
          <p className="font-medium text-emerald-600">{isIntensity ? target.target_intensity : target.target_value?.toLocaleString()}</p>
        </div>
      </div>

      {target.growth_rate != null && (
        <p className="text-xs text-text-muted mb-2">Growth Rate: {target.growth_rate}% | Reduction: {target.reduction_percentage}%</p>
      )}

      {/* Achievement */}
      {ach != null && (
        <div className="flex items-center gap-3 mb-3">
          <Progress value={ach} className="h-2 flex-1" />
          <span className={`text-sm font-semibold ${ach >= 75 ? 'text-green-600' : ach >= 40 ? 'text-amber-600' : 'text-red-600'}`}>{ach}%</span>
        </div>
      )}

      {/* Current value */}
      {progress && (
        <div className="flex gap-4 text-xs text-text-muted">
          {progress.current_value != null && <span>Current Value: <strong>{progress.current_value.toLocaleString()}</strong></span>}
          {progress.current_intensity != null && <span>Current Intensity: <strong>{progress.current_intensity}</strong></span>}
        </div>
      )}

      {/* Intensity trajectory chart */}
      {isIntensity && progress?.trajectory && (
        <div className="mt-3">
          <p className="text-xs text-text-muted mb-1">Intensity Pathway</p>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={progress.trajectory} margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey="year_label" tick={{ fontSize: 9 }} stroke="#78716c" angle={-30} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10 }} stroke="#78716c" />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="expected" stroke="#e11d48" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} name="Expected Pathway" />
              <Line type="monotone" dataKey="actual" stroke="#0ea5e9" strokeWidth={2.5} dot={<RedDot dataKey="actual" compareKey="expected" />} connectNulls={false} name="Actual Intensity" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Percentage target chart — projected vs actual emissions */}
      {!isIntensity && progress?.chart_data && (
        <div className="mt-3">
          <p className="text-xs text-text-muted mb-1">Emissions Trajectory</p>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={progress.chart_data.map(d => ({ ...d, target: progress.target_line_value }))} margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey="year_label" tick={{ fontSize: 9 }} stroke="#78716c" angle={-30} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10 }} stroke="#78716c" domain={['auto', 'auto']} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="projected" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} name="Projected (no reduction)" />
              <Line type="monotone" dataKey="actual" stroke="#0ea5e9" strokeWidth={2.5} dot={<RedDot dataKey="actual" compareKey="projected" />} connectNulls={false} name="Actual Emissions" />
              <Line type="monotone" dataKey="target" stroke="#16a34a" strokeWidth={2} strokeDasharray="4 4" dot={false} name="Target Value" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function TargetFormDialog({ open, onClose, onSubmit, editData, kpis, orgReportingType }) {
  const isEdit = !!editData?.id;
  const [form, setForm] = useState({
    target_name: '', description: '', kpi_id: '', kpi_name: '', unit: '',
    base_year: '', target_year: '', target_type: 'percentage',
    growth_rate: '', reduction_percentage: '',
    base_year_value: '', base_year_intensity: '', target_intensity: '',
  });

  useEffect(() => {
    if (editData) {
      setForm({
        target_name: editData.target_name || '',
        description: editData.description || '',
        kpi_id: editData.kpi_id || '',
        kpi_name: editData.kpi_name || '',
        unit: editData.unit || '',
        base_year: editData.base_year || '',
        target_year: editData.target_year || '',
        target_type: editData.target_type || 'percentage',
        growth_rate: editData.growth_rate ?? '',
        reduction_percentage: editData.reduction_percentage ?? '',
        base_year_value: editData.base_year_value ?? '',
        base_year_intensity: editData.base_year_intensity ?? '',
        target_intensity: editData.target_intensity ?? '',
      });
    } else {
      setForm({ target_name: '', description: '', kpi_id: '', kpi_name: '', unit: '', base_year: '', target_year: '', target_type: 'percentage', growth_rate: '', reduction_percentage: '', base_year_value: '', base_year_intensity: '', target_intensity: '' });
    }
  }, [editData, open]);

  const years = generateReportingYears(orgReportingType === 'CY' ? 'calendar_year' : 'financial_year', 10);
  const futureYears = (() => { const c = new Date().getFullYear(); const r = []; for (let y = c; y <= 2060; y++) r.push(orgReportingType === 'CY' ? `CY ${y}` : `FY ${y}-${y+1}`); return r; })();

  const isPct = form.target_type === 'percentage';
  const isIntensity = !isPct;

  // Compute target value preview for percentage
  let computedTarget = null;
  if (isPct && form.base_year_value && form.growth_rate !== '' && form.reduction_percentage !== '') {
    computedTarget = parseFloat(form.base_year_value) * (1 - parseFloat(form.reduction_percentage) / 100);
  }

  const handleKPISelect = (kpiId) => {
    const kpi = kpis.find(k => k.kpi_id === kpiId);
    if (kpi) setForm(f => ({ ...f, kpi_id: kpi.kpi_id, kpi_name: kpi.metric_name, unit: kpi.unit || '' }));
  };

  const handleSubmit = () => {
    onSubmit({ ...form, growth_rate: form.growth_rate !== '' ? parseFloat(form.growth_rate) : null, reduction_percentage: form.reduction_percentage !== '' ? parseFloat(form.reduction_percentage) : null, base_year_value: form.base_year_value !== '' ? parseFloat(form.base_year_value) : null, base_year_intensity: form.base_year_intensity !== '' ? parseFloat(form.base_year_intensity) : null, target_intensity: form.target_intensity !== '' ? parseFloat(form.target_intensity) : null });
  };

  const canSubmit = form.target_name && form.kpi_id && form.base_year && form.target_year && (isPct ? form.base_year_value && form.reduction_percentage !== '' : form.base_year_intensity !== '' && form.target_intensity !== '');

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Target className="w-5 h-5 text-emerald-600" />{isEdit ? 'Edit' : 'Create'} SBTi Target</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label className="text-sm">Target Name *</Label><Input value={form.target_name} onChange={e => setForm(f => ({...f, target_name: e.target.value}))} placeholder="e.g., Near-term Scope 1+2 Reduction" className="mt-1" /></div>
            <div><Label className="text-sm">Description</Label><Input value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="Optional" className="mt-1" /></div>
          </div>

          <div><Label className="text-sm">KPI *</Label>
            <Select value={form.kpi_id} onValueChange={handleKPISelect}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select KPI" /></SelectTrigger>
              <SelectContent>{kpis.map(k => <SelectItem key={k.kpi_id} value={k.kpi_id}>{k.metric_name} {k.unit && `(${k.unit})`}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><Label className="text-sm">Base Year *</Label>
              <Select value={form.base_year} onValueChange={v => setForm(f => ({...f, base_year: v}))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-sm">Target Year *</Label>
              <Select value={form.target_year} onValueChange={v => setForm(f => ({...f, target_year: v}))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{futureYears.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div><Label className="text-sm">Target Type *</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {TARGET_TYPES.map(t => (
                <Card key={t.value} className={`p-2 cursor-pointer border-2 text-center text-sm ${form.target_type === t.value ? 'border-emerald-500 bg-emerald-50' : 'border-stone-200'}`} onClick={() => setForm(f => ({...f, target_type: t.value}))}>
                  {t.label}
                </Card>
              ))}
            </div>
          </div>

          {isPct && (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div><Label className="text-sm">Base Year Value *</Label><Input type="number" value={form.base_year_value} onChange={e => setForm(f => ({...f, base_year_value: e.target.value}))} className="mt-1" /></div>
                <div><Label className="text-sm">Avg Annual Growth Rate % *</Label><Input type="number" value={form.growth_rate} onChange={e => setForm(f => ({...f, growth_rate: e.target.value}))} placeholder="e.g., 20" className="mt-1" /></div>
                <div><Label className="text-sm">Reduction Target % *</Label><Input type="number" value={form.reduction_percentage} onChange={e => setForm(f => ({...f, reduction_percentage: e.target.value}))} placeholder="e.g., 50" className="mt-1" /></div>
              </div>
              {computedTarget != null && <p className="text-xs text-emerald-600">Computed Target Value: {computedTarget.toLocaleString()} {form.unit}</p>}
            </>
          )}

          {isIntensity && (
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-sm">Base Year Intensity *</Label><Input type="number" step="any" value={form.base_year_intensity} onChange={e => setForm(f => ({...f, base_year_intensity: e.target.value}))} placeholder="e.g., 3.1" className="mt-1" /></div>
              <div><Label className="text-sm">Target Year Intensity *</Label><Input type="number" step="any" value={form.target_intensity} onChange={e => setForm(f => ({...f, target_intensity: e.target.value}))} placeholder="e.g., 1.1" className="mt-1" /></div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!canSubmit} className="bg-emerald-600 hover:bg-emerald-700">{isEdit ? 'Update' : 'Create'} Target</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function SBTiTargetsPage() {
  const { token, user } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [targets, setTargets] = useState({ short_term: [], long_term: [] });
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState([]);
  const [orgRepType, setOrgRepType] = useState('FY');
  const [formOpen, setFormOpen] = useState(false);
  const [formTermType, setFormTermType] = useState('short_term');
  const [editData, setEditData] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchTargets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/sbti-targets`, { headers });
      const all = res.data?.targets || [];
      setTargets({
        short_term: all.filter(t => t.term_type === 'short_term'),
        long_term: all.filter(t => t.term_type === 'long_term'),
      });
    } catch (e) {
      if (e.response?.status !== 403) toast.error('Failed to load SBTi targets');
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchTargets(); }, [fetchTargets]);

  useEffect(() => {
    // Fetch KPIs (reuse ESG KPI hierarchy)
    axios.get(`${API}/api/esg-targets/lookup/categories?section=environment`, { headers })
      .then(r => {
        const hierarchy = r.data?.hierarchy || {};
        const flat = [];
        Object.values(hierarchy).forEach(subcats => Object.values(subcats).forEach(kpiList => flat.push(...kpiList)));
        setKpis(flat);
      }).catch(() => null);
    // Org reporting type
    axios.get(`${API}/api/organizations/my`, { headers })
      .then(r => setOrgRepType(r.data?.reporting_year_type === 'calendar_year' ? 'CY' : 'FY'))
      .catch(() => null);
  }, [token]);

  const handleCreate = (termType) => { setFormTermType(termType); setEditData(null); setFormOpen(true); };
  const handleEdit = (t) => { setFormTermType(t.term_type); setEditData(t); setFormOpen(true); };

  const handleSubmit = async (formData) => {
    try {
      if (editData?.id) {
        await axios.put(`${API}/api/sbti-targets/${editData.id}`, formData, { headers });
        toast.success('Target updated');
      } else {
        await axios.post(`${API}/api/sbti-targets`, { ...formData, term_type: formTermType }, { headers });
        toast.success('Target created');
      }
      setFormOpen(false);
      fetchTargets();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await axios.delete(`${API}/api/sbti-targets/${deleteTarget.id}`, { headers });
      toast.success('Target deleted');
      setDeleteTarget(null);
      fetchTargets();
    } catch (e) {
      toast.error('Failed to delete');
    }
  };

  const renderSection = (title, termType, items) => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingDown className="w-5 h-5 text-emerald-600" />
          <h2 className="text-xl font-heading font-bold text-text-primary">{title}</h2>
          <Badge variant="outline" className="text-xs">{items.length} target{items.length !== 1 ? 's' : ''}</Badge>
        </div>
        {isAdmin && (
          <Button onClick={() => handleCreate(termType)} className="bg-emerald-600 hover:bg-emerald-700 gap-1" size="sm">
            <Plus className="w-4 h-4" /> Add Target
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <Card className="p-8 text-center text-text-muted">
          <Target className="w-10 h-10 mx-auto mb-2 text-stone-300" />
          <p>No {title.toLowerCase()} defined yet.</p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {items.map(t => <TargetCard key={t.id} target={t} onEdit={handleEdit} onDelete={setDeleteTarget} token={token} />)}
        </div>
      )}
    </div>
  );

  if (loading) return <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" /></div>;

  return (
    <div className="space-y-8 p-6" data-testid="sbti-targets-page">
      <div>
        <h1 className="text-4xl font-heading font-bold text-text-primary mb-1">SBTi Targets</h1>
        <p className="text-text-secondary">Science Based Targets initiative — set and track emission reduction commitments.</p>
      </div>

      {renderSection('Short-Term Targets', 'short_term', targets.short_term)}
      {renderSection('Long-Term Targets', 'long_term', targets.long_term)}

      <TargetFormDialog open={formOpen} onClose={() => setFormOpen(false)} onSubmit={handleSubmit} editData={editData} kpis={kpis} orgReportingType={orgRepType} />

      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Target?</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete &quot;{deleteTarget?.target_name}&quot;?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
