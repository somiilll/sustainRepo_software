/**
 * SustainabilityConfig — Admin UI for Organization-Scoped Module Configuration
 *
 * Hierarchy: Organization → Module → Category → KPI → Questions → Calculations
 * Reusable components — no hardcoded module names.
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import {
  Plus, ChevronRight, ChevronLeft, Trash2, Edit2, GripVertical,
  Settings2, Layers, BarChart3, FileText, Calculator, Eye,
  Package, Zap, Droplets, Leaf, Cloud, Wind, TreeDeciduous, Thermometer,
  ArrowLeft, Save, Copy, X, Check, AlertTriangle,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ICON_OPTIONS = [
  'Zap', 'Droplets', 'Leaf', 'Cloud', 'Wind', 'TreeDeciduous',
  'Thermometer', 'Package', 'Trash2', 'Flame', 'Factory', 'Gauge',
  'Activity', 'BarChart3', 'Settings2',
];

const RESPONSE_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'integer', label: 'Integer' },
  { value: 'decimal', label: 'Decimal' },
  { value: 'percentage', label: 'Percentage' },
  { value: 'currency', label: 'Currency' },
  { value: 'yes_no', label: 'Yes/No' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'multi_select', label: 'Multi-Select' },
  { value: 'date', label: 'Date' },
  { value: 'month', label: 'Month' },
  { value: 'facility', label: 'Facility' },
  { value: 'file', label: 'File/Evidence' },
];

const FIELD_TYPES = [
  { value: 'input', label: 'Input (User enters value)' },
  { value: 'calculated', label: 'Calculated (System computes)' },
];

const CALC_TYPES = [
  { value: 'quantity_factor', label: 'Quantity × Factor' },
  { value: 'difference', label: 'Difference (A − B)' },
  { value: 'sum', label: 'Sum (A + B + ...)' },
  { value: 'ratio', label: 'Ratio (A / B)' },
  { value: 'percentage_of', label: 'Percentage (A / B × 100)' },
  { value: 'custom_expression', label: 'Custom Expression' },
];

// ============================================================
// Helper: codify a name
// ============================================================
function toCode(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'unnamed';
}

// ============================================================
// Main page component
// ============================================================
export default function SustainabilityConfig() {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };

  // Navigation state: module → category → kpi
  const [modules, setModules] = useState([]);
  const [selectedModule, setSelectedModule] = useState(null);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [kpis, setKpis] = useState([]);
  const [selectedKpi, setSelectedKpi] = useState(null);
  const [loading, setLoading] = useState(false);

  // Dialog states
  const [moduleDialog, setModuleDialog] = useState({ open: false, editing: null });
  const [categoryDialog, setCategoryDialog] = useState({ open: false, editing: null });
  const [kpiDialog, setKpiDialog] = useState({ open: false, editing: null });

  // ---- Fetch helpers ----
  const fetchModules = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/sustainability-config/modules`, { headers });
      setModules(data);
    } catch { toast.error('Failed to load modules'); }
    setLoading(false);
  }, [token]);

  const fetchCategories = useCallback(async (moduleCode) => {
    try {
      const { data } = await axios.get(`${API}/sustainability-config/modules/${moduleCode}/categories`, { headers });
      setCategories(data);
    } catch { toast.error('Failed to load categories'); }
  }, [token]);

  const fetchKpis = useCallback(async (moduleCode, categoryCode) => {
    try {
      const { data } = await axios.get(`${API}/sustainability-config/modules/${moduleCode}/categories/${categoryCode}/kpis`, { headers });
      setKpis(data);
    } catch { toast.error('Failed to load KPIs'); }
  }, [token]);

  useEffect(() => { if (token) fetchModules(); }, [token, fetchModules]);

  // ---- Navigation ----
  const selectModule = (mod) => {
    setSelectedModule(mod);
    setSelectedCategory(null);
    setSelectedKpi(null);
    setKpis([]);
    fetchCategories(mod.module_code);
  };

  const selectCategory = (cat) => {
    setSelectedCategory(cat);
    setSelectedKpi(null);
    fetchKpis(selectedModule.module_code, cat.category_code);
  };

  const selectKpi = (kpi) => { setSelectedKpi(kpi); };

  const goBack = () => {
    if (selectedKpi) { setSelectedKpi(null); return; }
    if (selectedCategory) { setSelectedCategory(null); setKpis([]); return; }
    if (selectedModule) { setSelectedModule(null); setCategories([]); return; }
  };

  // ---- Breadcrumb ----
  const breadcrumb = [];
  breadcrumb.push({ label: 'Modules', onClick: () => { setSelectedModule(null); setSelectedCategory(null); setSelectedKpi(null); } });
  if (selectedModule) breadcrumb.push({ label: selectedModule.module_name, onClick: () => { setSelectedCategory(null); setSelectedKpi(null); } });
  if (selectedCategory) breadcrumb.push({ label: selectedCategory.category_name, onClick: () => { setSelectedKpi(null); } });
  if (selectedKpi) breadcrumb.push({ label: selectedKpi.kpi_name });

  // ---- Render ----
  return (
    <div className="space-y-6 p-1" data-testid="sustainability-config-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900" data-testid="config-page-title">Sustainability Configuration</h1>
          <p className="text-sm text-stone-500 mt-1">Configure modules, categories, KPIs, questions and calculations for your organization</p>
        </div>
        {selectedModule && (
          <Button variant="outline" size="sm" onClick={goBack} data-testid="config-back-btn">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        )}
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm" data-testid="config-breadcrumb">
        {breadcrumb.map((b, i) => (
          <React.Fragment key={i}>
            {i > 0 && <ChevronRight className="h-3 w-3 text-stone-400" />}
            <button
              onClick={b.onClick}
              disabled={!b.onClick}
              className={b.onClick ? 'text-emerald-600 hover:underline' : 'text-stone-700 font-medium'}
            >{b.label}</button>
          </React.Fragment>
        ))}
      </div>

      {/* Content */}
      {!selectedModule && (
        <ModuleList
          modules={modules} headers={headers} loading={loading}
          onSelect={selectModule} onRefresh={fetchModules}
          dialog={moduleDialog} setDialog={setModuleDialog}
        />
      )}
      {selectedModule && !selectedCategory && (
        <CategoryList
          moduleCode={selectedModule.module_code} moduleName={selectedModule.module_name}
          categories={categories} headers={headers}
          onSelect={selectCategory} onRefresh={() => fetchCategories(selectedModule.module_code)}
          dialog={categoryDialog} setDialog={setCategoryDialog}
        />
      )}
      {selectedModule && selectedCategory && !selectedKpi && (
        <KPIList
          moduleCode={selectedModule.module_code} categoryCode={selectedCategory.category_code}
          categoryName={selectedCategory.category_name}
          kpis={kpis} headers={headers}
          onSelect={selectKpi} onRefresh={() => fetchKpis(selectedModule.module_code, selectedCategory.category_code)}
          dialog={kpiDialog} setDialog={setKpiDialog}
        />
      )}
      {selectedModule && selectedCategory && selectedKpi && (
        <KPIDetail
          moduleCode={selectedModule.module_code}
          categoryCode={selectedCategory.category_code}
          kpi={selectedKpi}
          headers={headers}
        />
      )}
    </div>
  );
}

// ============================================================
// Module List
// ============================================================
function ModuleList({ modules, headers, loading, onSelect, onRefresh, dialog, setDialog }) {
  const [form, setForm] = useState({ module_code: '', module_name: '', icon: 'Leaf', display_order: 0 });

  const openCreate = () => {
    setForm({ module_code: '', module_name: '', icon: 'Leaf', display_order: modules.length + 1 });
    setDialog({ open: true, editing: null });
  };

  const openEdit = (mod, e) => {
    e.stopPropagation();
    setForm({ module_code: mod.module_code, module_name: mod.module_name, icon: mod.icon, display_order: mod.display_order });
    setDialog({ open: true, editing: mod });
  };

  const save = async () => {
    try {
      if (dialog.editing) {
        await axios.put(`${API}/sustainability-config/modules/${dialog.editing.id}`, {
          module_name: form.module_name, icon: form.icon, display_order: form.display_order,
        }, { headers });
        toast.success('Module updated');
      } else {
        await axios.post(`${API}/sustainability-config/modules`, form, { headers });
        toast.success('Module created');
      }
      setDialog({ open: false, editing: null });
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save module');
    }
  };

  const handleDelete = async (mod, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete module "${mod.module_name}" and all its categories, KPIs, fields and calculations?`)) return;
    try {
      await axios.delete(`${API}/sustainability-config/modules/${mod.id}`, { headers });
      toast.success('Module deleted');
      onRefresh();
    } catch { toast.error('Failed to delete module'); }
  };

  const handleMigrate = async () => {
    try {
      const { data } = await axios.post(`${API}/sustainability-config/migrate-existing`, {}, { headers });
      toast.success(`Migration complete: ${data.modules_created} modules, ${data.categories_created} categories, ${data.kpis_created} KPIs, ${data.field_configs_created} field configs`);
      onRefresh();
    } catch { toast.error('Migration failed'); }
  };

  return (
    <>
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-stone-800">Sustainability Modules</h2>
          <div className="flex gap-2">
            {modules.length === 0 && (
              <Button variant="outline" size="sm" onClick={handleMigrate} data-testid="migrate-existing-btn">
                <Copy className="h-4 w-4 mr-1" /> Seed from Existing
              </Button>
            )}
            <Button size="sm" onClick={openCreate} data-testid="add-module-btn">
              <Plus className="h-4 w-4 mr-1" /> Add Module
            </Button>
          </div>
        </div>

        {loading && <p className="text-sm text-stone-500">Loading...</p>}

        {!loading && modules.length === 0 && (
          <div className="text-center py-12 text-stone-500">
            <Settings2 className="h-12 w-12 mx-auto mb-3 text-stone-300" />
            <p className="font-medium">No modules configured</p>
            <p className="text-sm mt-1">Add a module or seed from existing ESG categories</p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map(mod => (
            <div
              key={mod.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(mod)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSelect(mod); }}
              className="flex items-center gap-3 p-4 rounded-lg border border-stone-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition-all text-left group cursor-pointer"
              data-testid={`module-card-${mod.module_code}`}
            >
              <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                <Layers className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-stone-800 truncate">{mod.module_name}</div>
                <div className="text-xs text-stone-500">{mod.module_code}</div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Badge variant={mod.enabled ? 'default' : 'secondary'} className="text-xs">
                  {mod.enabled ? 'Active' : 'Disabled'}
                </Badge>
                <button onClick={(e) => openEdit(mod, e)} className="p-1 rounded hover:bg-stone-200" data-testid={`edit-module-${mod.module_code}`}>
                  <Edit2 className="h-3.5 w-3.5 text-stone-500" />
                </button>
                <button onClick={(e) => handleDelete(mod, e)} className="p-1 rounded hover:bg-red-100" data-testid={`delete-module-${mod.module_code}`}>
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </button>
              </div>
              <ChevronRight className="h-4 w-4 text-stone-400 shrink-0" />
            </div>
          ))}
        </div>
      </Card>

      {/* Module Dialog */}
      <Dialog open={dialog.open} onOpenChange={(o) => setDialog({ ...dialog, open: o })}>
        <DialogContent className="sm:max-w-md" data-testid="module-dialog">
          <DialogHeader>
            <DialogTitle>{dialog.editing ? 'Edit Module' : 'Add Module'}</DialogTitle>
            <DialogDescription>Configure a sustainability module for this organization</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Module Name</Label>
              <Input
                value={form.module_name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm(f => ({ ...f, module_name: name, ...(dialog.editing ? {} : { module_code: toCode(name) }) }));
                }}
                placeholder="e.g. Energy, Power, Steam"
                data-testid="module-name-input"
              />
            </div>
            <div>
              <Label>Module Code</Label>
              <Input
                value={form.module_code}
                onChange={(e) => setForm(f => ({ ...f, module_code: e.target.value }))}
                disabled={!!dialog.editing}
                placeholder="e.g. energy"
                data-testid="module-code-input"
              />
              <p className="text-xs text-stone-500 mt-1">Lowercase, underscores only. Cannot be changed after creation.</p>
            </div>
            <div>
              <Label>Display Order</Label>
              <Input type="number" value={form.display_order} onChange={(e) => setForm(f => ({ ...f, display_order: parseInt(e.target.value) || 0 }))} data-testid="module-order-input" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false, editing: null })}>Cancel</Button>
            <Button onClick={save} data-testid="module-save-btn">
              <Save className="h-4 w-4 mr-1" /> {dialog.editing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================
// Category List
// ============================================================
function CategoryList({ moduleCode, moduleName, categories, headers, onSelect, onRefresh, dialog, setDialog }) {
  const [form, setForm] = useState({ category_code: '', category_name: '', display_order: 0 });

  const openCreate = () => {
    setForm({ category_code: '', category_name: '', display_order: categories.length + 1 });
    setDialog({ open: true, editing: null });
  };

  const openEdit = (cat, e) => {
    e.stopPropagation();
    setForm({ category_code: cat.category_code, category_name: cat.category_name, display_order: cat.display_order });
    setDialog({ open: true, editing: cat });
  };

  const save = async () => {
    try {
      if (dialog.editing) {
        await axios.put(`${API}/sustainability-config/categories/${dialog.editing.id}`, {
          category_name: form.category_name, display_order: form.display_order,
        }, { headers });
        toast.success('Category updated');
      } else {
        await axios.post(`${API}/sustainability-config/modules/${moduleCode}/categories`, form, { headers });
        toast.success('Category created');
      }
      setDialog({ open: false, editing: null });
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save category');
    }
  };

  const handleDelete = async (cat, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${cat.category_name}" and all its KPIs, fields and calculations?`)) return;
    try {
      await axios.delete(`${API}/sustainability-config/categories/${cat.id}`, { headers });
      toast.success('Category deleted');
      onRefresh();
    } catch { toast.error('Failed to delete'); }
  };

  return (
    <>
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-stone-800">{moduleName} — Categories</h2>
            <p className="text-xs text-stone-500">Subcategories within the {moduleName} module</p>
          </div>
          <Button size="sm" onClick={openCreate} data-testid="add-category-btn">
            <Plus className="h-4 w-4 mr-1" /> Add Category
          </Button>
        </div>

        {categories.length === 0 && (
          <div className="text-center py-8 text-stone-500">
            <Layers className="h-10 w-10 mx-auto mb-2 text-stone-300" />
            <p>No categories yet. Add a category to get started.</p>
          </div>
        )}

        <div className="space-y-2">
          {categories.map(cat => (
            <div
              key={cat.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(cat)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSelect(cat); }}
              className="flex items-center justify-between w-full p-3 rounded-lg border border-stone-200 hover:border-emerald-300 hover:bg-emerald-50/30 transition-all text-left group cursor-pointer"
              data-testid={`category-card-${cat.category_code}`}
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded bg-stone-100 flex items-center justify-center text-stone-600 text-sm font-medium">
                  {cat.display_order}
                </div>
                <div>
                  <div className="font-medium text-stone-800">{cat.category_name}</div>
                  <div className="text-xs text-stone-500">{cat.category_code}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant={cat.enabled ? 'default' : 'secondary'} className="text-xs opacity-0 group-hover:opacity-100">
                  {cat.enabled ? 'Active' : 'Disabled'}
                </Badge>
                <button onClick={(e) => openEdit(cat, e)} className="p-1 rounded hover:bg-stone-200 opacity-0 group-hover:opacity-100">
                  <Edit2 className="h-3.5 w-3.5 text-stone-500" />
                </button>
                <button onClick={(e) => handleDelete(cat, e)} className="p-1 rounded hover:bg-red-100 opacity-0 group-hover:opacity-100">
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </button>
                <ChevronRight className="h-4 w-4 text-stone-400" />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Dialog open={dialog.open} onOpenChange={(o) => setDialog({ ...dialog, open: o })}>
        <DialogContent className="sm:max-w-md" data-testid="category-dialog">
          <DialogHeader>
            <DialogTitle>{dialog.editing ? 'Edit Category' : 'Add Category'}</DialogTitle>
            <DialogDescription>Category within {moduleName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Category Name</Label>
              <Input
                value={form.category_name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm(f => ({ ...f, category_name: name, ...(dialog.editing ? {} : { category_code: toCode(name) }) }));
                }}
                placeholder="e.g. Electricity, Diesel"
                data-testid="category-name-input"
              />
            </div>
            <div>
              <Label>Category Code</Label>
              <Input value={form.category_code} onChange={(e) => setForm(f => ({ ...f, category_code: e.target.value }))} disabled={!!dialog.editing} data-testid="category-code-input" />
            </div>
            <div>
              <Label>Display Order</Label>
              <Input type="number" value={form.display_order} onChange={(e) => setForm(f => ({ ...f, display_order: parseInt(e.target.value) || 0 }))} data-testid="category-order-input" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false, editing: null })}>Cancel</Button>
            <Button onClick={save} data-testid="category-save-btn"><Save className="h-4 w-4 mr-1" /> {dialog.editing ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================
// KPI List
// ============================================================
function KPIList({ moduleCode, categoryCode, categoryName, kpis, headers, onSelect, onRefresh, dialog, setDialog }) {
  const [form, setForm] = useState({ kpi_code: '', kpi_name: '', unit: '', description: '', display_order: 0 });

  const openCreate = () => {
    setForm({ kpi_code: '', kpi_name: '', unit: '', description: '', display_order: kpis.length + 1 });
    setDialog({ open: true, editing: null });
  };

  const openEdit = (kpi, e) => {
    e.stopPropagation();
    setForm({ kpi_code: kpi.kpi_code, kpi_name: kpi.kpi_name, unit: kpi.unit || '', description: kpi.description || '', display_order: kpi.display_order });
    setDialog({ open: true, editing: kpi });
  };

  const save = async () => {
    try {
      if (dialog.editing) {
        await axios.put(`${API}/sustainability-config/kpis/${dialog.editing.id}`, {
          kpi_name: form.kpi_name, unit: form.unit || null, description: form.description || null, display_order: form.display_order,
        }, { headers });
        toast.success('KPI updated');
      } else {
        await axios.post(`${API}/sustainability-config/modules/${moduleCode}/categories/${categoryCode}/kpis`, form, { headers });
        toast.success('KPI created');
      }
      setDialog({ open: false, editing: null });
      onRefresh();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to save KPI'); }
  };

  const handleDelete = async (kpi, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${kpi.kpi_name}" and all its fields and calculations?`)) return;
    try {
      await axios.delete(`${API}/sustainability-config/kpis/${kpi.id}`, { headers });
      toast.success('KPI deleted');
      onRefresh();
    } catch { toast.error('Failed to delete'); }
  };

  return (
    <>
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-stone-800">{categoryName} — KPIs</h2>
            <p className="text-xs text-stone-500">Key Performance Indicators for {categoryName}</p>
          </div>
          <Button size="sm" onClick={openCreate} data-testid="add-kpi-btn">
            <Plus className="h-4 w-4 mr-1" /> Add KPI
          </Button>
        </div>

        {kpis.length === 0 && (
          <div className="text-center py-8 text-stone-500">
            <BarChart3 className="h-10 w-10 mx-auto mb-2 text-stone-300" />
            <p>No KPIs yet. Add a KPI to define data collection metrics.</p>
          </div>
        )}

        <div className="space-y-2">
          {kpis.map(kpi => (
            <div
              key={kpi.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(kpi)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSelect(kpi); }}
              className="flex items-center justify-between w-full p-3 rounded-lg border border-stone-200 hover:border-emerald-300 hover:bg-emerald-50/30 transition-all text-left group cursor-pointer"
              data-testid={`kpi-card-${kpi.kpi_code}`}
            >
              <div className="flex items-center gap-3">
                <BarChart3 className="h-5 w-5 text-emerald-600 shrink-0" />
                <div>
                  <div className="font-medium text-stone-800">{kpi.kpi_name}</div>
                  <div className="text-xs text-stone-500">{kpi.kpi_code}{kpi.unit ? ` · ${kpi.unit}` : ''}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={(e) => openEdit(kpi, e)} className="p-1 rounded hover:bg-stone-200 opacity-0 group-hover:opacity-100">
                  <Edit2 className="h-3.5 w-3.5 text-stone-500" />
                </button>
                <button onClick={(e) => handleDelete(kpi, e)} className="p-1 rounded hover:bg-red-100 opacity-0 group-hover:opacity-100">
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </button>
                <ChevronRight className="h-4 w-4 text-stone-400" />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Dialog open={dialog.open} onOpenChange={(o) => setDialog({ ...dialog, open: o })}>
        <DialogContent className="sm:max-w-md" data-testid="kpi-dialog">
          <DialogHeader>
            <DialogTitle>{dialog.editing ? 'Edit KPI' : 'Add KPI'}</DialogTitle>
            <DialogDescription>KPI within {categoryName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>KPI Name</Label>
              <Input
                value={form.kpi_name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm(f => ({ ...f, kpi_name: name, ...(dialog.editing ? {} : { kpi_code: toCode(name) }) }));
                }}
                placeholder="e.g. Electricity Consumption"
                data-testid="kpi-name-input"
              />
            </div>
            <div>
              <Label>KPI Code</Label>
              <Input value={form.kpi_code} onChange={(e) => setForm(f => ({ ...f, kpi_code: e.target.value }))} disabled={!!dialog.editing} data-testid="kpi-code-input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Unit</Label>
                <Input value={form.unit} onChange={(e) => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="kWh, MT, L" data-testid="kpi-unit-input" />
              </div>
              <div>
                <Label>Display Order</Label>
                <Input type="number" value={form.display_order} onChange={(e) => setForm(f => ({ ...f, display_order: parseInt(e.target.value) || 0 }))} data-testid="kpi-order-input" />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={2} data-testid="kpi-desc-input" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false, editing: null })}>Cancel</Button>
            <Button onClick={save} data-testid="kpi-save-btn"><Save className="h-4 w-4 mr-1" /> {dialog.editing ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================
// KPI Detail — Fields (Questions) + Calculations
// ============================================================
function KPIDetail({ moduleCode, categoryCode, kpi, headers }) {
  const [fields, setFields] = useState([]);
  const [fieldConfigId, setFieldConfigId] = useState(null);
  const [configVersion, setConfigVersion] = useState(null);
  const [calcs, setCalcs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [fieldDialog, setFieldDialog] = useState({ open: false, editing: null, index: -1 });
  const [calcDialog, setCalcDialog] = useState({ open: false, editing: null });

  const basePath = `${API}/sustainability-config/modules/${moduleCode}/categories/${categoryCode}/kpis/${kpi.kpi_code}`;

  const fetchFields = useCallback(async () => {
    try {
      const { data } = await axios.get(`${basePath}/fields`, { headers });
      setFields(data.fields || []);
      setFieldConfigId(data.id || null);
      setConfigVersion(data.config_version || null);
    } catch { /* empty */ }
  }, [basePath]);

  const fetchCalcs = useCallback(async () => {
    try {
      const { data } = await axios.get(`${basePath}/calculations`, { headers });
      setCalcs(data);
    } catch { /* empty */ }
  }, [basePath]);

  useEffect(() => { fetchFields(); fetchCalcs(); }, [fetchFields, fetchCalcs]);

  // ---- Field CRUD (local + save all) ----
  const saveFields = async (updatedFields) => {
    setSaving(true);
    try {
      if (fieldConfigId) {
        await axios.put(`${API}/sustainability-config/fields/${fieldConfigId}`, { fields: updatedFields }, { headers });
      } else {
        await axios.post(`${basePath}/fields`, { fields: updatedFields }, { headers });
      }
      toast.success('Questions saved');
      fetchFields();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to save'); }
    setSaving(false);
  };

  const addField = (fieldData) => {
    const updated = [...fields, { ...fieldData, display_order: fields.length + 1 }];
    saveFields(updated);
  };

  const updateField = (index, fieldData) => {
    const updated = [...fields];
    updated[index] = fieldData;
    saveFields(updated);
  };

  const removeField = (index) => {
    if (!window.confirm('Remove this question?')) return;
    const updated = fields.filter((_, i) => i !== index);
    saveFields(updated);
  };

  const moveField = (index, direction) => {
    const updated = [...fields];
    const target = index + direction;
    if (target < 0 || target >= updated.length) return;
    [updated[index], updated[target]] = [updated[target], updated[index]];
    updated.forEach((f, i) => { f.display_order = i + 1; });
    saveFields(updated);
  };

  // ---- Calculation CRUD ----
  const saveCalc = async (calcData) => {
    try {
      if (calcDialog.editing) {
        await axios.put(`${API}/sustainability-config/calculations/${calcDialog.editing.id}`, calcData, { headers });
        toast.success('Calculation updated');
      } else {
        await axios.post(`${basePath}/calculations`, calcData, { headers });
        toast.success('Calculation created');
      }
      setCalcDialog({ open: false, editing: null });
      fetchCalcs();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to save'); }
  };

  const deleteCalc = async (calc) => {
    if (!window.confirm(`Delete calculation "${calc.calculation_name}"?`)) return;
    try {
      await axios.delete(`${API}/sustainability-config/calculations/${calc.id}`, { headers });
      toast.success('Calculation deleted');
      fetchCalcs();
    } catch { toast.error('Failed to delete'); }
  };

  return (
    <div className="space-y-6">
      {/* KPI Header */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-stone-800">{kpi.kpi_name}</h2>
            <p className="text-xs text-stone-500">{kpi.kpi_code}{kpi.unit ? ` · ${kpi.unit}` : ''}{configVersion ? ` · Config v${configVersion}` : ''}</p>
          </div>
        </div>
      </Card>

      {/* Questions / Fields */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-emerald-600" />
            <h3 className="font-semibold text-stone-800">Questions / Data Fields</h3>
            <Badge variant="outline" className="text-xs">{fields.length} fields</Badge>
          </div>
          <Button size="sm" onClick={() => setFieldDialog({ open: true, editing: null, index: -1 })} data-testid="add-field-btn">
            <Plus className="h-4 w-4 mr-1" /> Add Question
          </Button>
        </div>

        {fields.length === 0 ? (
          <div className="text-center py-6 text-stone-500">
            <FileText className="h-8 w-8 mx-auto mb-2 text-stone-300" />
            <p className="text-sm">No questions configured. Add questions to define data collection fields.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Response</TableHead>
                <TableHead>Required</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((f, idx) => (
                <TableRow key={f.field_code + idx} data-testid={`field-row-${f.field_code}`}>
                  <TableCell className="text-stone-400 text-xs">{idx + 1}</TableCell>
                  <TableCell className="font-medium">{f.label}</TableCell>
                  <TableCell className="text-xs text-stone-500 font-mono">{f.field_code}</TableCell>
                  <TableCell>
                    <Badge variant={f.field_type === 'calculated' ? 'secondary' : 'outline'} className="text-xs">
                      {f.field_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{f.response_type}{f.unit ? ` (${f.unit})` : ''}</TableCell>
                  <TableCell>{f.required ? <Check className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-stone-300" />}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => moveField(idx, -1)} className="p-1 rounded hover:bg-stone-100" disabled={idx === 0}>
                        <ChevronLeft className="h-3.5 w-3.5 text-stone-400 rotate-90" />
                      </button>
                      <button onClick={() => moveField(idx, 1)} className="p-1 rounded hover:bg-stone-100" disabled={idx === fields.length - 1}>
                        <ChevronRight className="h-3.5 w-3.5 text-stone-400 rotate-90" />
                      </button>
                      <button onClick={() => setFieldDialog({ open: true, editing: f, index: idx })} className="p-1 rounded hover:bg-stone-100">
                        <Edit2 className="h-3.5 w-3.5 text-stone-500" />
                      </button>
                      <button onClick={() => removeField(idx)} className="p-1 rounded hover:bg-red-100">
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Calculations */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-stone-800">Calculations</h3>
            <Badge variant="outline" className="text-xs">{calcs.length}</Badge>
          </div>
          <Button size="sm" variant="outline" onClick={() => setCalcDialog({ open: true, editing: null })} data-testid="add-calc-btn">
            <Plus className="h-4 w-4 mr-1" /> Add Calculation
          </Button>
        </div>

        {calcs.length === 0 ? (
          <div className="text-center py-6 text-stone-500">
            <Calculator className="h-8 w-8 mx-auto mb-2 text-stone-300" />
            <p className="text-sm">No calculations configured.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {calcs.map(calc => (
              <div key={calc.id} className="flex items-center justify-between p-3 border border-stone-200 rounded-lg" data-testid={`calc-row-${calc.calculation_code}`}>
                <div>
                  <div className="font-medium text-sm">{calc.calculation_name}</div>
                  <div className="text-xs text-stone-500">
                    Type: {calc.calculation_type} · Output: {calc.output_label}{calc.output_unit ? ` (${calc.output_unit})` : ''}
                  </div>
                  <div className="text-xs text-stone-400 mt-0.5">
                    Inputs: {Object.entries(calc.inputs || {}).map(([k, v]) => `${k}=${v}`).join(', ')}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setCalcDialog({ open: true, editing: calc })} className="p-1 rounded hover:bg-stone-100">
                    <Edit2 className="h-3.5 w-3.5 text-stone-500" />
                  </button>
                  <button onClick={() => deleteCalc(calc)} className="p-1 rounded hover:bg-red-100">
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Field Dialog */}
      <FieldDialog
        open={fieldDialog.open}
        editing={fieldDialog.editing}
        onClose={() => setFieldDialog({ open: false, editing: null, index: -1 })}
        onSave={(data) => {
          if (fieldDialog.index >= 0) updateField(fieldDialog.index, data);
          else addField(data);
          setFieldDialog({ open: false, editing: null, index: -1 });
        }}
      />

      {/* Calculation Dialog */}
      <CalcDialog
        open={calcDialog.open}
        editing={calcDialog.editing}
        fields={fields}
        onClose={() => setCalcDialog({ open: false, editing: null })}
        onSave={saveCalc}
      />
    </div>
  );
}

// ============================================================
// Field (Question) Dialog
// ============================================================
function FieldDialog({ open, editing, onClose, onSave }) {
  const blank = {
    field_code: '', label: '', field_type: 'input', response_type: 'text',
    unit: '', required: false, help_text: '', validation: null, options: null,
    default_value: null, display_order: 0, enabled: true, evidence_required: false,
  };
  const [form, setForm] = useState(blank);
  const [optionsText, setOptionsText] = useState('');

  useEffect(() => {
    if (open) {
      if (editing) {
        setForm({ ...blank, ...editing });
        setOptionsText((editing.options || []).join('\n'));
      } else {
        setForm(blank);
        setOptionsText('');
      }
    }
  }, [open, editing]);

  const handleSave = () => {
    if (!form.label || !form.field_code) { toast.error('Label and code are required'); return; }
    const options = ['dropdown', 'multi_select'].includes(form.response_type) && optionsText.trim()
      ? optionsText.split('\n').map(s => s.trim()).filter(Boolean)
      : null;

    const validation = {};
    if (form._valMin !== undefined && form._valMin !== '') validation.min = parseFloat(form._valMin);
    if (form._valMax !== undefined && form._valMax !== '') validation.max = parseFloat(form._valMax);
    if (form._valPrecision !== undefined && form._valPrecision !== '') validation.decimal_precision = parseInt(form._valPrecision);

    onSave({
      ...form,
      options,
      validation: Object.keys(validation).length > 0 ? validation : (form.validation || null),
    });
  };

  const showOptions = ['dropdown', 'multi_select'].includes(form.response_type);
  const showNumericValidation = ['number', 'integer', 'decimal', 'percentage', 'currency'].includes(form.response_type);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" data-testid="field-dialog">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Question' : 'Add Question'}</DialogTitle>
          <DialogDescription>Configure a data field / question for this KPI</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Label <span className="text-red-500">*</span></Label>
              <Input
                value={form.label}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm(f => ({ ...f, label: name, ...(editing ? {} : { field_code: toCode(name) }) }));
                }}
                placeholder="e.g. Electricity Consumed"
                data-testid="field-label-input"
              />
            </div>
            <div>
              <Label>Field Code <span className="text-red-500">*</span></Label>
              <Input value={form.field_code} onChange={(e) => setForm(f => ({ ...f, field_code: e.target.value }))} disabled={!!editing} data-testid="field-code-input" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Field Type</Label>
              <Select value={form.field_type} onValueChange={(v) => setForm(f => ({ ...f, field_type: v }))}>
                <SelectTrigger data-testid="field-type-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Response Type</Label>
              <Select value={form.response_type} onValueChange={(v) => setForm(f => ({ ...f, response_type: v }))}>
                <SelectTrigger data-testid="field-response-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RESPONSE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Unit</Label>
              <Input value={form.unit || ''} onChange={(e) => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="kWh, MT, L, %" data-testid="field-unit-input" />
            </div>
            <div>
              <Label>Display Order</Label>
              <Input type="number" value={form.display_order} onChange={(e) => setForm(f => ({ ...f, display_order: parseInt(e.target.value) || 0 }))} />
            </div>
          </div>

          <div>
            <Label>Help Text</Label>
            <Textarea value={form.help_text || ''} onChange={(e) => setForm(f => ({ ...f, help_text: e.target.value }))} rows={2} placeholder="Instructions shown below the field" data-testid="field-help-input" />
          </div>

          {showOptions && (
            <div>
              <Label>Options (one per line)</Label>
              <Textarea value={optionsText} onChange={(e) => setOptionsText(e.target.value)} rows={4} placeholder="Option 1&#10;Option 2&#10;Option 3" data-testid="field-options-input" />
            </div>
          )}

          {showNumericValidation && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Min</Label>
                <Input type="number" value={form._valMin ?? form.validation?.min ?? ''} onChange={(e) => setForm(f => ({ ...f, _valMin: e.target.value }))} />
              </div>
              <div>
                <Label>Max</Label>
                <Input type="number" value={form._valMax ?? form.validation?.max ?? ''} onChange={(e) => setForm(f => ({ ...f, _valMax: e.target.value }))} />
              </div>
              <div>
                <Label>Precision</Label>
                <Input type="number" value={form._valPrecision ?? form.validation?.decimal_precision ?? ''} onChange={(e) => setForm(f => ({ ...f, _valPrecision: e.target.value }))} />
              </div>
            </div>
          )}

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.required} onCheckedChange={(v) => setForm(f => ({ ...f, required: v }))} data-testid="field-required-switch" />
              Required
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm(f => ({ ...f, enabled: v }))} />
              Enabled
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.evidence_required} onCheckedChange={(v) => setForm(f => ({ ...f, evidence_required: v }))} data-testid="field-evidence-switch" />
              Evidence Required
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} data-testid="field-save-btn"><Save className="h-4 w-4 mr-1" /> {editing ? 'Update' : 'Add'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Calculation Dialog
// ============================================================
function CalcDialog({ open, editing, fields, onClose, onSave }) {
  const blank = {
    calculation_code: '', calculation_name: '', calculation_type: 'quantity_factor',
    inputs: {}, expression: '', output_field_code: '', output_label: '', output_unit: '',
    enabled: true, display_order: 0,
  };
  const [form, setForm] = useState(blank);
  const [inputEntries, setInputEntries] = useState([{ role: '', field_code: '' }]);

  useEffect(() => {
    if (open) {
      if (editing) {
        setForm({ ...blank, ...editing });
        const entries = Object.entries(editing.inputs || {}).map(([role, field_code]) => ({ role, field_code }));
        setInputEntries(entries.length ? entries : [{ role: '', field_code: '' }]);
      } else {
        setForm(blank);
        setInputEntries([{ role: '', field_code: '' }]);
      }
    }
  }, [open, editing]);

  const handleSave = () => {
    if (!form.calculation_name || !form.output_field_code) {
      toast.error('Name and output field are required');
      return;
    }
    const inputs = {};
    inputEntries.forEach(e => { if (e.role && e.field_code) inputs[e.role] = e.field_code; });
    onSave({
      ...form,
      inputs,
      calculation_code: form.calculation_code || toCode(form.calculation_name),
    });
  };

  const inputFields = fields.filter(f => f.field_type === 'input');

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" data-testid="calc-dialog">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Calculation' : 'Add Calculation'}</DialogTitle>
          <DialogDescription>Define how a value is computed from input fields</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Calculation Name</Label>
            <Input
              value={form.calculation_name}
              onChange={(e) => {
                const name = e.target.value;
                setForm(f => ({ ...f, calculation_name: name, ...(editing ? {} : { calculation_code: toCode(name) }) }));
              }}
              placeholder="e.g. CO2e Calculation"
              data-testid="calc-name-input"
            />
          </div>

          <div>
            <Label>Calculation Type</Label>
            <Select value={form.calculation_type} onValueChange={(v) => setForm(f => ({ ...f, calculation_type: v }))}>
              <SelectTrigger data-testid="calc-type-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CALC_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-2 block">Inputs (Role → Field)</Label>
            {inputEntries.map((entry, idx) => (
              <div key={idx} className="flex gap-2 mb-2">
                <Input
                  value={entry.role}
                  onChange={(e) => { const u = [...inputEntries]; u[idx].role = e.target.value; setInputEntries(u); }}
                  placeholder="Role (e.g. quantity)"
                  className="flex-1"
                />
                <Select value={entry.field_code} onValueChange={(v) => { const u = [...inputEntries]; u[idx].field_code = v; setInputEntries(u); }}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Select field" /></SelectTrigger>
                  <SelectContent>
                    {inputFields.map(f => <SelectItem key={f.field_code} value={f.field_code}>{f.label} ({f.field_code})</SelectItem>)}
                    <SelectItem value="__manual__">Manual / External</SelectItem>
                  </SelectContent>
                </Select>
                <button onClick={() => setInputEntries(inputEntries.filter((_, i) => i !== idx))} className="p-1 text-red-500">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setInputEntries([...inputEntries, { role: '', field_code: '' }])}>
              <Plus className="h-3 w-3 mr-1" /> Add Input
            </Button>
          </div>

          {form.calculation_type === 'custom_expression' && (
            <div>
              <Label>Expression</Label>
              <Input value={form.expression || ''} onChange={(e) => setForm(f => ({ ...f, expression: e.target.value }))} placeholder="e.g. quantity * factor / 1000" />
              <p className="text-xs text-stone-500 mt-1">Use input role names as variables</p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Output Field Code</Label>
              <Input value={form.output_field_code} onChange={(e) => setForm(f => ({ ...f, output_field_code: e.target.value }))} placeholder="co2e" data-testid="calc-output-code" />
            </div>
            <div>
              <Label>Output Label</Label>
              <Input value={form.output_label} onChange={(e) => setForm(f => ({ ...f, output_label: e.target.value }))} placeholder="CO2e" data-testid="calc-output-label" />
            </div>
            <div>
              <Label>Output Unit</Label>
              <Input value={form.output_unit || ''} onChange={(e) => setForm(f => ({ ...f, output_unit: e.target.value }))} placeholder="tCO2e" data-testid="calc-output-unit" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} data-testid="calc-save-btn"><Save className="h-4 w-4 mr-1" /> {editing ? 'Update' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
