/**
 * Org Config — SuperAdmin UI for Organization-Specific Configuration
 *
 * SuperAdmin selects an org, then configures:
 *   - Module mode: Default / Default + Custom / Custom Only
 *   - KPI overrides, custom categories, features
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
  FileText, Eye, EyeOff, ChevronRight, X, Check, Building2,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const RESPONSE_TYPES = [
  { value: 'text', label: 'Text' }, { value: 'number', label: 'Number' },
  { value: 'integer', label: 'Integer' }, { value: 'decimal', label: 'Decimal' },
  { value: 'percentage', label: 'Percentage' }, { value: 'currency', label: 'Currency' },
  { value: 'yes_no', label: 'Yes/No' }, { value: 'dropdown', label: 'Dropdown' },
  { value: 'multi_select', label: 'Multi-Select' }, { value: 'date', label: 'Date' },
  { value: 'month', label: 'Month' }, { value: 'facility', label: 'Facility' },
  { value: 'file', label: 'File/Evidence' },
];

const MODULE_MODES = [
  { value: 'default', label: 'Default Modules', desc: 'Use only global/standard modules' },
  { value: 'default_custom', label: 'Default + Custom', desc: 'Global modules plus org-specific additions' },
  { value: 'custom', label: 'Custom Only', desc: 'Entirely org-specific module structure' },
];

function toCode(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'unnamed';
}

export default function SustainabilityConfig() {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };

  const [organizations, setOrganizations] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [orgConfig, setOrgConfig] = useState(null);
  const [defaultModules, setDefaultModules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Derived: module mode from org config
  const getModuleMode = (cfg) => {
    if (!cfg || !cfg.modules?.enabled) return 'default';
    const hasCustom = (cfg.categories?.custom || []).length > 0;
    const hasEnabled = Array.isArray(cfg.modules.enabled);
    if (hasEnabled && hasCustom) return cfg.modules.enabled.length === 0 ? 'custom' : 'default_custom';
    if (hasEnabled) return 'custom';
    if (hasCustom) return 'default_custom';
    return 'default';
  };

  // Fetch org list
  useEffect(() => {
    if (!token) return;
    axios.get(`${API}/sustainability-config/organizations`, { headers })
      .then(r => setOrganizations(r.data || []))
      .catch(() => toast.error('Failed to load organizations'));
  }, [token]);

  // Fetch org config + default modules when org selected
  const fetchConfig = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      const [cfgRes, defaultRes] = await Promise.all([
        axios.get(`${API}/sustainability-config/org-config?org_id=${selectedOrgId}`, { headers }),
        axios.get(`${API}/sustainability-config/default-modules/environment`, { headers }),
      ]);
      setOrgConfig(cfgRes.data);
      setDefaultModules(defaultRes.data || []);
    } catch (err) { toast.error('Failed to load config'); }
    setLoading(false);
  }, [selectedOrgId, token]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const saveConfig = async (updates) => {
    if (!selectedOrgId) return;
    setSaving(true);
    try {
      await axios.put(`${API}/sustainability-config/org-config?org_id=${selectedOrgId}`, updates, { headers });
      toast.success('Configuration saved');
      await fetchConfig();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to save'); }
    setSaving(false);
  };

  const selectedOrgName = organizations.find(o => o.id === selectedOrgId)?.name || '';

  return (
    <div className="space-y-6 p-1" data-testid="org-config-page">
      <div>
        <h1 className="text-2xl font-bold text-stone-900" data-testid="config-page-title">Org Config</h1>
        <p className="text-sm text-stone-500 mt-1">Configure organization-specific sustainability modules, KPI overrides, and features.</p>
      </div>

      {/* Org Selector */}
      <Card className="p-4">
        <div className="flex items-center gap-4">
          <Building2 className="h-5 w-5 text-stone-500 shrink-0" />
          <div className="flex-1">
            <Label className="text-sm font-medium">Select Organization</Label>
            <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
              <SelectTrigger className="mt-1" data-testid="org-selector">
                <SelectValue placeholder="Choose an organization to configure" />
              </SelectTrigger>
              <SelectContent>
                {organizations.map(org => (
                  <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedOrgName && <Badge className="mt-6">{selectedOrgName}</Badge>}
        </div>
      </Card>

      {/* Config panel (only when org selected) */}
      {selectedOrgId && !loading && orgConfig && (
        <Tabs defaultValue="modules">
          <TabsList>
            <TabsTrigger value="modules">Modules</TabsTrigger>
            <TabsTrigger value="kpi-overrides">KPI Overrides</TabsTrigger>
            <TabsTrigger value="custom-categories">Custom Categories</TabsTrigger>
            <TabsTrigger value="features">Features</TabsTrigger>
          </TabsList>

          <TabsContent value="modules" className="mt-4">
            <ModulesTab orgConfig={orgConfig} defaultModules={defaultModules} onSave={saveConfig} saving={saving} />
          </TabsContent>
          <TabsContent value="kpi-overrides" className="mt-4">
            <KPIOverridesTab orgConfig={orgConfig} defaultModules={defaultModules} onSave={saveConfig} saving={saving} />
          </TabsContent>
          <TabsContent value="custom-categories" className="mt-4">
            <CustomCategoriesTab orgConfig={orgConfig} onSave={saveConfig} saving={saving} />
          </TabsContent>
          <TabsContent value="features" className="mt-4">
            <FeaturesTab orgConfig={orgConfig} onSave={saveConfig} saving={saving} />
          </TabsContent>
        </Tabs>
      )}

      {selectedOrgId && loading && (
        <div className="flex justify-center py-12"><Settings2 className="h-8 w-8 animate-spin text-stone-400" /></div>
      )}

      {!selectedOrgId && (
        <Card className="p-12 text-center text-stone-400">
          <Building2 className="h-12 w-12 mx-auto mb-3 text-stone-300" />
          <p className="font-medium">Select an organization to configure</p>
        </Card>
      )}
    </div>
  );
}


// ============================================================
// Modules Tab — Module mode + default module selection
// ============================================================
function ModulesTab({ orgConfig, defaultModules, onSave, saving }) {
  const currentEnabled = orgConfig?.modules?.enabled;
  const customs = orgConfig?.categories?.custom || [];
  const hasCustom = customs.length > 0;

  // Determine current mode
  const currentMode = (() => {
    if (currentEnabled === null || currentEnabled === undefined) return hasCustom ? 'default_custom' : 'default';
    if (Array.isArray(currentEnabled)) {
      // Check if any enabled module exists in defaults
      const defaultCodes = new Set(defaultModules.map(m => m.module_code));
      const hasDefaultEnabled = currentEnabled.some(e => defaultCodes.has(e));
      if (hasDefaultEnabled && hasCustom) return 'default_custom';
      if (!hasDefaultEnabled && hasCustom) return 'custom';
      if (hasDefaultEnabled) return 'default';
      return currentEnabled.length === 0 && hasCustom ? 'custom' : 'default';
    }
    return 'default';
  })();

  const [mode, setMode] = useState(currentMode);
  const [enabledDefaults, setEnabledDefaults] = useState(
    Array.isArray(currentEnabled) ? new Set(currentEnabled.filter(e => defaultModules.some(m => m.module_code === e))) : new Set(defaultModules.map(m => m.module_code))
  );

  const handleModeChange = (newMode) => {
    setMode(newMode);
    if (newMode === 'default') {
      setEnabledDefaults(new Set(defaultModules.map(m => m.module_code)));
    }
  };

  const toggleDefault = (code) => {
    setEnabledDefaults(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  };

  const handleSave = () => {
    if (mode === 'default') {
      onSave({ modules: { enabled: null } });
    } else if (mode === 'default_custom') {
      // Enabled = selected defaults + custom module codes
      const customModuleCodes = [...new Set(customs.map(c => c.module_code))];
      const all = [...enabledDefaults, ...customModuleCodes.filter(c => !enabledDefaults.has(c))];
      onSave({ modules: { enabled: all } });
    } else {
      // Custom only — enabled = only custom module codes
      const customModuleCodes = [...new Set(customs.map(c => c.module_code))];
      onSave({ modules: { enabled: customModuleCodes.length > 0 ? customModuleCodes : [] } });
    }
  };

  return (
    <Card className="p-6" data-testid="modules-tab">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Module Configuration</h2>
        <Button size="sm" onClick={handleSave} disabled={saving} data-testid="save-modules-btn">
          <Save className="h-4 w-4 mr-1" /> Save
        </Button>
      </div>

      {/* Mode selector */}
      <div className="space-y-3 mb-6">
        <Label className="text-sm font-medium">Module Mode</Label>
        <div className="grid gap-2 sm:grid-cols-3">
          {MODULE_MODES.map(m => (
            <button
              key={m.value}
              onClick={() => handleModeChange(m.value)}
              className={`p-3 rounded-lg border-2 text-left transition-all ${mode === m.value ? 'border-emerald-500 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'}`}
              data-testid={`mode-${m.value}`}
            >
              <div className="font-medium text-sm">{m.label}</div>
              <div className="text-xs text-stone-500 mt-0.5">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Default modules (shown for 'default' and 'default_custom' modes) */}
      {(mode === 'default' || mode === 'default_custom') && (
        <div>
          <Label className="text-sm font-medium mb-2 block">
            Default Modules {mode === 'default' ? '(all enabled)' : '(select which defaults to include)'}
          </Label>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {defaultModules.map(mod => (
              <label key={mod.module_code} className="flex items-center gap-3 p-3 rounded-lg border border-stone-200 cursor-pointer hover:bg-stone-50">
                <Switch
                  checked={mode === 'default' || enabledDefaults.has(mod.module_code)}
                  onCheckedChange={() => toggleDefault(mod.module_code)}
                  disabled={mode === 'default'}
                  data-testid={`default-mod-${mod.module_code}`}
                />
                <div>
                  <span className="text-sm font-medium">{mod.module_name}</span>
                  <span className="text-xs text-stone-400 ml-1">({mod.subcategories?.length || 0} subcategories)</span>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {mode === 'custom' && (
        <div className="text-sm text-stone-500 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <strong>Custom Only</strong> — This org will see only custom categories (configured in the Custom Categories tab). No global defaults will appear.
        </div>
      )}
    </Card>
  );
}


// ============================================================
// KPI Overrides Tab
// ============================================================
function KPIOverridesTab({ orgConfig, defaultModules, onSave, saving }) {
  const overrides = orgConfig?.kpi_overrides || {};
  const [editingSubcat, setEditingSubcat] = useState(null);
  const [editFields, setEditFields] = useState([]);

  const allSubcats = defaultModules.flatMap(m =>
    (m.subcategories || []).map(s => ({ ...s, module: m.module_name }))
  );

  const startEdit = (sub) => {
    setEditFields(overrides[sub.subcategory_code]?.fields || []);
    setEditingSubcat(sub);
  };

  const removeOverride = (code) => {
    const next = { ...overrides };
    delete next[code];
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
        <p className="text-sm text-stone-500 mb-4">Override the default questions for global subcategories. Org-specific questions replace global defaults.</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Module</TableHead>
              <TableHead>Subcategory</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allSubcats.map(sub => {
              const hasOverride = !!overrides[sub.subcategory_code];
              return (
                <TableRow key={sub.subcategory_code}>
                  <TableCell className="text-sm">{sub.module}</TableCell>
                  <TableCell className="text-sm font-medium">{sub.subcategory_name}</TableCell>
                  <TableCell>
                    {hasOverride
                      ? <Badge className="text-xs bg-amber-100 text-amber-700">Overridden</Badge>
                      : <Badge variant="outline" className="text-xs">Default</Badge>}
                  </TableCell>
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
      module_code: '', module_name: '', category_code: '', category_name: '',
      section: 'environment', display_order: customs.length + 1, fields: [],
    });
    setEditingIdx(-1);
  };

  const startEdit = (idx) => {
    setEditCat({ ...customs[idx], fields: [...(customs[idx].fields || [])] });
    setEditingIdx(idx);
  };

  const saveCat = () => {
    if (!editCat.category_code || !editCat.category_name || !editCat.module_code) {
      toast.error('Module code, category name and code are required');
      return;
    }
    if (!editCat.module_name) editCat.module_name = editCat.module_code.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const next = [...customs];
    if (editingIdx >= 0) { next[editingIdx] = editCat; } else { next.push(editCat); }
    onSave({ categories: { custom: next, disabled } });
    setEditCat(null);
  };

  const removeCat = (idx) => {
    if (!window.confirm('Remove this custom category?')) return;
    onSave({ categories: { custom: customs.filter((_, i) => i !== idx), disabled } });
  };

  return (
    <Card className="p-6" data-testid="custom-categories-tab">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Custom Categories</h2>
          <p className="text-sm text-stone-500">Add org-specific categories with their own fields.</p>
        </div>
        <Button size="sm" onClick={startAdd} data-testid="add-custom-cat-btn">
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>

      {customs.length === 0 ? (
        <p className="text-center py-6 text-stone-400 text-sm">No custom categories.</p>
      ) : (
        <div className="space-y-2">
          {customs.map((cat, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`custom-cat-${cat.category_code}`}>
              <div>
                <div className="font-medium text-sm">{cat.module_name || cat.module_code} &gt; {cat.category_name}</div>
                <div className="text-xs text-stone-500">
                  Section: {cat.section || 'environment'} · Code: {cat.category_code} · {cat.fields?.length || 0} fields
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Section</Label>
                  <Select value={editCat.section || 'environment'} onValueChange={v => setEditCat(c => ({ ...c, section: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="environment">Environment</SelectItem>
                      <SelectItem value="social">Social</SelectItem>
                      <SelectItem value="governance">Governance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Module Name</Label>
                  <Input value={editCat.module_name || ''} onChange={e => setEditCat(c => ({ ...c, module_name: e.target.value, module_code: editingIdx >= 0 ? c.module_code : toCode(e.target.value) }))} placeholder="e.g. Power, Workforce" data-testid="custom-cat-module-name" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Module Code</Label>
                  <Input value={editCat.module_code} onChange={e => setEditCat(c => ({ ...c, module_code: e.target.value }))} disabled={editingIdx >= 0} className="text-xs font-mono" />
                </div>
                <div>
                  <Label>Category Name</Label>
                  <Input value={editCat.category_name} onChange={e => setEditCat(c => ({ ...c, category_name: e.target.value, category_code: editingIdx >= 0 ? c.category_code : toCode(e.target.value) }))} placeholder="e.g. Electricity, DG Sets" data-testid="custom-cat-name" />
                </div>
                <div>
                  <Label>Category Code</Label>
                  <Input value={editCat.category_code} onChange={e => setEditCat(c => ({ ...c, category_code: e.target.value }))} disabled={editingIdx >= 0} className="text-xs font-mono" data-testid="custom-cat-code" />
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
// Features Tab
// ============================================================
function FeaturesTab({ orgConfig, onSave, saving }) {
  const features = orgConfig?.features || {};
  const setTarget = features.set_target || {};
  const [enabled, setEnabled] = useState(!!setTarget.enabled);
  const [modules, setModules] = useState(setTarget.modules || []);

  const ALL_SECTIONS = ['power', 'water', 'steam', 'energy', 'waste', 'social', 'governance'];

  const toggleModule = (code) => {
    setModules(prev => prev.includes(code) ? prev.filter(s => s !== code) : [...prev, code]);
  };

  const handleSave = () => {
    onSave({ features: { set_target: { enabled, modules } } });
  };

  return (
    <Card className="p-6" data-testid="features-tab">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Feature Flags</h2>
        <Button size="sm" onClick={handleSave} disabled={saving} data-testid="save-features-btn">
          <Save className="h-4 w-4 mr-1" /> Save
        </Button>
      </div>
      <div className="border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-medium text-stone-800">Set Target Tab</h3>
            <p className="text-xs text-stone-500">Adds a "Set Target" tab to KPI pages</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} data-testid="feature-set-target-toggle" />
        </div>
        {enabled && (
          <div>
            <Label className="text-sm mb-2 block">Enabled for modules:</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_SECTIONS.map(code => (
                <Button key={code} size="sm" variant={modules.includes(code) ? 'default' : 'outline'} onClick={() => toggleModule(code)}>
                  {code.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}


// ============================================================
// Field Editor Dialog (shared)
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
      if (key === 'label' && !next[idx]._codeEdited) next[idx].field_code = toCode(value);
      return next;
    });
  };

  const removeField = (idx) => setFields(prev => prev.filter((_, i) => i !== idx));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="field-editor-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Customize questions for this KPI.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {fields.map((f, idx) => (
            <div key={idx} className="grid grid-cols-7 gap-2 items-end p-2 border rounded">
              <div><Label className="text-xs">Label</Label><Input value={f.label || ''} onChange={e => updateField(idx, 'label', e.target.value)} className="text-sm" /></div>
              <div><Label className="text-xs">Code</Label><Input value={f.field_code || ''} onChange={e => { updateField(idx, 'field_code', e.target.value); updateField(idx, '_codeEdited', true); }} className="text-xs font-mono" /></div>
              <div><Label className="text-xs">Type</Label>
                <Select value={f.response_type || 'text'} onValueChange={v => updateField(idx, 'response_type', v)}>
                  <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{RESPONSE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Unit</Label><Input value={f.unit || ''} onChange={e => updateField(idx, 'unit', e.target.value)} className="text-xs" /></div>
              <div><Label className="text-xs">Field</Label>
                <Select value={f.field_type || 'input'} onValueChange={v => updateField(idx, 'field_type', v)}>
                  <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="input">Input</SelectItem><SelectItem value="calculated">Calculated</SelectItem></SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-1 text-xs pb-1"><Switch checked={f.required || false} onCheckedChange={v => updateField(idx, 'required', v)} /> Req</label>
              <Button variant="ghost" size="sm" className="text-red-500" onClick={() => removeField(idx)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={addField} className="mt-2"><Plus className="h-3 w-3 mr-1" /> Add Field</Button>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={saving} data-testid="save-override-btn"><Save className="h-4 w-4 mr-1" /> Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
