/**
 * SustainabilityConfig — Admin UI for Organization Configuration Overrides
 *
 * Single-collection approach: global defaults + org overrides = final config.
 * Sections: Enabled Modules | Disabled Categories | KPI Overrides | Custom Categories
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import {
  Plus, Trash2, Edit2, Save, Settings2, Layers, BarChart3,
  FileText, Eye, EyeOff, ChevronRight, ChevronLeft, X, Check,
  ArrowUp, ArrowDown,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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

function toCode(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'unnamed';
}

export default function SustainabilityConfig() {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };

  const [orgConfig, setOrgConfig] = useState(null);
  const [resolvedConfig, setResolvedConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const [raw, resolved] = await Promise.all([
        axios.get(`${API}/sustainability-config/org-config`, { headers }),
        axios.get(`${API}/sustainability-config/resolved`, { headers }),
      ]);
      setOrgConfig(raw.data);
      setResolvedConfig(resolved.data);
    } catch { toast.error('Failed to load configuration'); }
    setLoading(false);
  }, [token]);

  useEffect(() => { if (token) fetchConfig(); }, [token, fetchConfig]);

  const saveConfig = async (updates) => {
    setSaving(true);
    try {
      await axios.put(`${API}/sustainability-config/org-config`, updates, { headers });
      toast.success('Configuration saved');
      await fetchConfig();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to save'); }
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Settings2 className="h-8 w-8 animate-spin text-stone-400" /></div>;

  return (
    <div className="space-y-6 p-1" data-testid="sustainability-config-page">
      <div>
        <h1 className="text-2xl font-bold text-stone-900" data-testid="config-page-title">Sustainability Configuration</h1>
        <p className="text-sm text-stone-500 mt-1">Configure module overrides for your organization. Global defaults apply unless overridden.</p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="modules">Modules</TabsTrigger>
          <TabsTrigger value="kpi-overrides">KPI Overrides</TabsTrigger>
          <TabsTrigger value="custom-categories">Custom Categories</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <ResolvedOverview resolved={resolvedConfig} />
        </TabsContent>

        <TabsContent value="modules" className="mt-4">
          <ModulesTab orgConfig={orgConfig} resolved={resolvedConfig} onSave={saveConfig} saving={saving} />
        </TabsContent>

        <TabsContent value="kpi-overrides" className="mt-4">
          <KPIOverridesTab orgConfig={orgConfig} resolved={resolvedConfig} onSave={saveConfig} saving={saving} />
        </TabsContent>

        <TabsContent value="custom-categories" className="mt-4">
          <CustomCategoriesTab orgConfig={orgConfig} onSave={saveConfig} saving={saving} />
        </TabsContent>

        <TabsContent value="features" className="mt-4">
          <FeaturesTab orgConfig={orgConfig} onSave={saveConfig} saving={saving} />
        </TabsContent>
      </Tabs>
    </div>
  );
}


// ============================================================
// Overview — Show resolved config
// ============================================================
function ResolvedOverview({ resolved }) {
  if (!resolved) return null;
  return (
    <Card className="p-6" data-testid="resolved-overview">
      <h2 className="text-lg font-semibold mb-4">Resolved Configuration</h2>
      <p className="text-sm text-stone-500 mb-4">This is what your organization sees after applying overrides to global defaults.</p>
      {resolved.modules?.map(mod => (
        <div key={mod.module_code} className="mb-4">
          <h3 className="font-medium text-stone-800">{mod.module_name}</h3>
          <div className="ml-4 mt-1 space-y-1">
            {mod.subcategories?.map(sub => (
              <div key={sub.subcategory_code} className="flex items-center gap-2 text-sm">
                <span className="text-stone-600">{sub.subcategory_name}</span>
                {sub.has_override && <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Overridden</Badge>}
                {sub.is_custom && <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">Custom</Badge>}
                <span className="text-xs text-stone-400">{sub.fields?.length || 0} fields</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {resolved.modules?.length === 0 && <p className="text-stone-400">No modules configured. Using all global defaults.</p>}
    </Card>
  );
}


// ============================================================
// Modules Tab — Enable/disable top-level modules
// ============================================================
function ModulesTab({ orgConfig, resolved, onSave, saving }) {
  const allModules = resolved?.modules?.map(m => m.module_code) || [];
  const enabledList = orgConfig?.modules?.enabled;
  const isAllEnabled = enabledList === null || enabledList === undefined;

  const [enabled, setEnabled] = useState(
    isAllEnabled ? new Set(allModules) : new Set(enabledList || [])
  );
  const [useAll, setUseAll] = useState(isAllEnabled);

  const toggle = (code) => {
    setEnabled(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
    setUseAll(false);
  };

  const handleSave = () => {
    onSave({ modules: { enabled: useAll ? null : Array.from(enabled) } });
  };

  return (
    <Card className="p-6" data-testid="modules-tab">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Enabled Modules</h2>
        <Button size="sm" onClick={handleSave} disabled={saving} data-testid="save-modules-btn">
          <Save className="h-4 w-4 mr-1" /> Save
        </Button>
      </div>

      <label className="flex items-center gap-2 mb-4 text-sm">
        <Switch checked={useAll} onCheckedChange={(v) => { setUseAll(v); if (v) setEnabled(new Set(allModules)); }} />
        Use all global modules (default)
      </label>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {allModules.map(code => (
          <label key={code} className="flex items-center gap-3 p-3 rounded-lg border border-stone-200 cursor-pointer hover:bg-stone-50">
            <Switch checked={useAll || enabled.has(code)} onCheckedChange={() => toggle(code)} disabled={useAll} data-testid={`module-toggle-${code}`} />
            <span className="text-sm font-medium capitalize">{code.replace(/_/g, ' ')}</span>
          </label>
        ))}
      </div>
    </Card>
  );
}


// ============================================================
// KPI Overrides Tab
// ============================================================
function KPIOverridesTab({ orgConfig, resolved, onSave, saving }) {
  const overrides = orgConfig?.kpi_overrides || {};
  const [editingSubcat, setEditingSubcat] = useState(null);
  const [editFields, setEditFields] = useState([]);

  // Flat list of all subcategories
  const allSubcats = (resolved?.modules || []).flatMap(m =>
    (m.subcategories || []).filter(s => !s.is_custom).map(s => ({ ...s, module: m.module_name }))
  );

  const startEdit = (sub) => {
    const existing = overrides[sub.subcategory_code]?.fields;
    setEditFields(existing || sub.fields?.map(f => ({ ...f })) || []);
    setEditingSubcat(sub);
  };

  const removeOverride = (subcatCode) => {
    const next = { ...overrides };
    delete next[subcatCode];
    onSave({ kpi_overrides: next });
  };

  const saveOverride = () => {
    if (!editingSubcat) return;
    const next = { ...overrides };
    next[editingSubcat.subcategory_code] = { fields: editFields };
    onSave({ kpi_overrides: next });
    setEditingSubcat(null);
  };

  return (
    <>
      <Card className="p-6" data-testid="kpi-overrides-tab">
        <h2 className="text-lg font-semibold mb-2">KPI Question Overrides</h2>
        <p className="text-sm text-stone-500 mb-4">Override the default questions for any subcategory. Orgs without overrides use global defaults.</p>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Module</TableHead>
              <TableHead>Subcategory</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Fields</TableHead>
              <TableHead className="w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allSubcats.map(sub => {
              const hasOverride = !!overrides[sub.subcategory_code];
              return (
                <TableRow key={sub.subcategory_code} data-testid={`subcat-row-${sub.subcategory_code}`}>
                  <TableCell className="text-sm">{sub.module}</TableCell>
                  <TableCell className="text-sm font-medium">{sub.subcategory_name}</TableCell>
                  <TableCell>
                    {hasOverride
                      ? <Badge className="text-xs bg-amber-100 text-amber-700">Overridden</Badge>
                      : <Badge variant="outline" className="text-xs">Global Default</Badge>
                    }
                  </TableCell>
                  <TableCell className="text-xs text-stone-500">{sub.fields?.length || 0}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(sub)} data-testid={`edit-override-${sub.subcategory_code}`}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      {hasOverride && (
                        <Button variant="ghost" size="sm" onClick={() => removeOverride(sub.subcategory_code)} className="text-red-500">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Field editor dialog */}
      {editingSubcat && (
        <FieldEditorDialog
          title={`Override: ${editingSubcat.subcategory_name}`}
          fields={editFields}
          setFields={setEditFields}
          onSave={saveOverride}
          onClose={() => setEditingSubcat(null)}
          saving={saving}
        />
      )}
    </>
  );
}


// ============================================================
// Custom Categories Tab
// ============================================================
function CustomCategoriesTab({ orgConfig, onSave, saving }) {
  const customs = orgConfig?.categories?.custom || [];
  const disabled = orgConfig?.categories?.disabled || [];
  const [editingIdx, setEditingIdx] = useState(-1);
  const [editCat, setEditCat] = useState(null);

  const startAdd = () => {
    setEditCat({
      module_code: 'energy', category_code: '', category_name: '',
      display_order: customs.length + 1, fields: [],
    });
    setEditingIdx(-1);
  };

  const startEdit = (idx) => {
    setEditCat({ ...customs[idx], fields: [...(customs[idx].fields || [])] });
    setEditingIdx(idx);
  };

  const saveCat = () => {
    if (!editCat.category_code || !editCat.category_name) {
      toast.error('Name and code are required');
      return;
    }
    const next = [...customs];
    if (editingIdx >= 0) {
      next[editingIdx] = editCat;
    } else {
      next.push(editCat);
    }
    onSave({ categories: { custom: next, disabled } });
    setEditCat(null);
  };

  const removeCat = (idx) => {
    if (!window.confirm('Remove this custom category?')) return;
    const next = customs.filter((_, i) => i !== idx);
    onSave({ categories: { custom: next, disabled } });
  };

  return (
    <Card className="p-6" data-testid="custom-categories-tab">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Custom Categories</h2>
          <p className="text-sm text-stone-500">Add categories that don't exist in the global configuration.</p>
        </div>
        <Button size="sm" onClick={startAdd} data-testid="add-custom-cat-btn">
          <Plus className="h-4 w-4 mr-1" /> Add Custom Category
        </Button>
      </div>

      {customs.length === 0 ? (
        <p className="text-center py-6 text-stone-400 text-sm">No custom categories. Your org uses global defaults only.</p>
      ) : (
        <div className="space-y-2">
          {customs.map((cat, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`custom-cat-${cat.category_code}`}>
              <div>
                <div className="font-medium text-sm">{cat.category_name}</div>
                <div className="text-xs text-stone-500">
                  Module: {cat.module_code} · Code: {cat.category_code} · {cat.fields?.length || 0} fields
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => startEdit(idx)}><Edit2 className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="sm" className="text-red-500" onClick={() => removeCat(idx)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editCat && (
        <Dialog open onOpenChange={(o) => { if (!o) setEditCat(null); }}>
          <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="custom-cat-dialog">
            <DialogHeader>
              <DialogTitle>{editingIdx >= 0 ? 'Edit' : 'Add'} Custom Category</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Module Code</Label>
                  <Input value={editCat.module_code} onChange={e => setEditCat(c => ({ ...c, module_code: e.target.value }))} data-testid="custom-cat-module" />
                </div>
                <div>
                  <Label>Category Name</Label>
                  <Input value={editCat.category_name} onChange={e => setEditCat(c => ({ ...c, category_name: e.target.value, category_code: editingIdx >= 0 ? c.category_code : toCode(e.target.value) }))} data-testid="custom-cat-name" />
                </div>
                <div>
                  <Label>Category Code</Label>
                  <Input value={editCat.category_code} onChange={e => setEditCat(c => ({ ...c, category_code: e.target.value }))} disabled={editingIdx >= 0} data-testid="custom-cat-code" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Fields / Questions</Label>
                  <Button size="sm" variant="outline" onClick={() => setEditCat(c => ({
                    ...c, fields: [...(c.fields || []), { field_code: '', label: '', field_type: 'input', response_type: 'number', unit: '', required: false, display_order: (c.fields?.length || 0) + 1, enabled: true }]
                  }))} data-testid="add-custom-field-btn"><Plus className="h-3 w-3 mr-1" /> Add Field</Button>
                </div>
                {(editCat.fields || []).map((f, fi) => (
                  <div key={fi} className="grid grid-cols-6 gap-2 mb-2 items-end">
                    <Input placeholder="Label" value={f.label} onChange={e => {
                      const fields = [...editCat.fields];
                      fields[fi] = { ...fields[fi], label: e.target.value, field_code: editingIdx >= 0 && f.field_code ? f.field_code : toCode(e.target.value) };
                      setEditCat(c => ({ ...c, fields }));
                    }} />
                    <Input placeholder="Code" value={f.field_code} onChange={e => {
                      const fields = [...editCat.fields]; fields[fi] = { ...fields[fi], field_code: e.target.value };
                      setEditCat(c => ({ ...c, fields }));
                    }} className="text-xs" />
                    <Select value={f.response_type} onValueChange={v => {
                      const fields = [...editCat.fields]; fields[fi] = { ...fields[fi], response_type: v };
                      setEditCat(c => ({ ...c, fields }));
                    }}>
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{RESPONSE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input placeholder="Unit" value={f.unit || ''} onChange={e => {
                      const fields = [...editCat.fields]; fields[fi] = { ...fields[fi], unit: e.target.value };
                      setEditCat(c => ({ ...c, fields }));
                    }} className="text-xs" />
                    <label className="flex items-center gap-1 text-xs">
                      <Switch checked={f.required} onCheckedChange={v => {
                        const fields = [...editCat.fields]; fields[fi] = { ...fields[fi], required: v };
                        setEditCat(c => ({ ...c, fields }));
                      }} /> Req
                    </label>
                    <Button variant="ghost" size="sm" className="text-red-500" onClick={() => {
                      setEditCat(c => ({ ...c, fields: c.fields.filter((_, i) => i !== fi) }));
                    }}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditCat(null)}>Cancel</Button>
              <Button onClick={saveCat} disabled={saving} data-testid="save-custom-cat-btn"><Save className="h-4 w-4 mr-1" /> Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}


// ============================================================
// Shared: Field Editor Dialog (for KPI overrides)
// ============================================================
function FieldEditorDialog({ title, fields, setFields, onSave, onClose, saving }) {
  const addField = () => {
    setFields(prev => [...prev, {
      field_code: '', label: '', field_type: 'input', response_type: 'number',
      unit: '', required: false, help_text: '', display_order: prev.length + 1, enabled: true,
    }]);
  };

  const updateField = (idx, key, value) => {
    setFields(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: value };
      if (key === 'label' && !next[idx]._codeEdited) {
        next[idx].field_code = toCode(value);
      }
      return next;
    });
  };

  const removeField = (idx) => {
    setFields(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="field-editor-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Customize the questions for this KPI. These override the global defaults.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {fields.map((f, idx) => (
            <div key={idx} className="grid grid-cols-7 gap-2 items-end p-2 border rounded" data-testid={`override-field-${idx}`}>
              <div>
                <Label className="text-xs">Label</Label>
                <Input value={f.label || ''} onChange={e => updateField(idx, 'label', e.target.value)} className="text-sm" />
              </div>
              <div>
                <Label className="text-xs">Code</Label>
                <Input value={f.field_code || ''} onChange={e => { updateField(idx, 'field_code', e.target.value); updateField(idx, '_codeEdited', true); }} className="text-xs font-mono" />
              </div>
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={f.response_type || 'text'} onValueChange={v => updateField(idx, 'response_type', v)}>
                  <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{RESPONSE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Unit</Label>
                <Input value={f.unit || ''} onChange={e => updateField(idx, 'unit', e.target.value)} className="text-xs" />
              </div>
              <div>
                <Label className="text-xs">Field Type</Label>
                <Select value={f.field_type || 'input'} onValueChange={v => updateField(idx, 'field_type', v)}>
                  <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="input">Input</SelectItem>
                    <SelectItem value="calculated">Calculated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-1 text-xs pb-1">
                <Switch checked={f.required || false} onCheckedChange={v => updateField(idx, 'required', v)} /> Required
              </label>
              <Button variant="ghost" size="sm" className="text-red-500" onClick={() => removeField(idx)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={addField} className="mt-2" data-testid="add-override-field-btn">
          <Plus className="h-3 w-3 mr-1" /> Add Field
        </Button>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={saving} data-testid="save-override-btn">
            <Save className="h-4 w-4 mr-1" /> Save Override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



// ============================================================
// Features Tab — Toggle org feature flags (Set Target, etc.)
// ============================================================
function FeaturesTab({ orgConfig, onSave, saving }) {
  const features = orgConfig?.features || {};
  const setTarget = features.set_target || {};
  const [enabled, setEnabled] = useState(!!setTarget.enabled);
  const [sections, setSections] = useState(setTarget.modules || []);

  const ALL_SECTIONS = ['power', 'water', 'steam', 'energy', 'waste', 'social', 'governance'];

  const toggleSection = (code) => {
    setSections(prev => prev.includes(code) ? prev.filter(s => s !== code) : [...prev, code]);
  };

  const handleSave = () => {
    onSave({ features: { set_target: { enabled, modules: sections } } });
  };

  return (
    <Card className="p-6" data-testid="features-tab">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Feature Flags</h2>
        <Button size="sm" onClick={handleSave} disabled={saving} data-testid="save-features-btn">
          <Save className="h-4 w-4 mr-1" /> Save
        </Button>
      </div>

      <div className="space-y-6">
        {/* Set Target */}
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-medium text-stone-800">Set Target Tab</h3>
              <p className="text-xs text-stone-500">Adds a "Set Target" tab to KPI pages (Metrics Logs, Add Metric, Set Target)</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} data-testid="feature-set-target-toggle" />
          </div>

          {enabled && (
            <div>
              <Label className="text-sm mb-2 block">Enabled for modules:</Label>
              <div className="flex flex-wrap gap-2">
                {ALL_SECTIONS.map(code => (
                  <Button
                    key={code}
                    size="sm"
                    variant={sections.includes(code) ? 'default' : 'outline'}
                    onClick={() => toggleSection(code)}
                    data-testid={`feature-module-${code}`}
                  >
                    {code.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-stone-400 mt-2">Select which modules show the Set Target tab</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
