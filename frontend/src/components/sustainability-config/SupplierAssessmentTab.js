import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, FileText, GraduationCap, Leaf, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { ESG_SECTIONS, cloneSupplierEsgTaxonomy } from '../../modules/supplier-assessment/esgTaxonomy';

const MODULES = [
  { code: 'esg', fallbackName: 'ESG Questionnaire', workflow: 'Questionnaires', icon: ClipboardList, description: 'Supplier ESG questionnaires and responses.' },
  { code: 'ghg', fallbackName: 'GHG Emissions', workflow: 'GHG reporting', icon: Leaf, description: 'Supplier Scope 1 and Scope 2 reporting.' },
  { code: 'documents', fallbackName: 'Documents', workflow: 'Agreement acceptance', icon: FileText, description: 'Private agreements suppliers review and accept.' },
  { code: 'training', fallbackName: 'Training', workflow: 'Training assignments', icon: GraduationCap, description: 'Private learning content assigned to suppliers.' },
];

const buildModules = (config) => Object.fromEntries(MODULES.map((module) => {
  const saved = config?.supplier_assessment?.modules?.[module.code] || {};
  return [module.code, {
    enabled: Boolean(saved.enabled), display_name: saved.display_name || module.fallbackName,
    scopes: saved.scopes || ['scope1', 'scope2'], allow_custom_fuels: Boolean(saved.allow_custom_fuels),
    allow_process_emissions: Boolean(saved.allow_process_emissions), allow_flaring: Boolean(saved.allow_flaring),
  }];
}));

const categoryCode = (name, categories) => {
  const base = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'custom_category';
  const used = new Set(categories.map((category) => category.code));
  let code = base; let suffix = 2;
  while (used.has(code)) { code = `${base}_${suffix}`; suffix += 1; }
  return code;
};

export function SupplierAssessmentTab({ orgConfig, onSave, saving }) {
  const [modules, setModules] = useState(() => buildModules(orgConfig));
  const [taxonomy, setTaxonomy] = useState(() => cloneSupplierEsgTaxonomy(orgConfig?.supplier_assessment?.esg_subcategories));
  const [customNames, setCustomNames] = useState({ environment: '', social: '', governance: '' });
  const [basicQuestionBankEnabled, setBasicQuestionBankEnabled] = useState(orgConfig?.supplier_assessment?.basic_question_bank_enabled !== false);
  const [standardQuestionBankEnabled, setStandardQuestionBankEnabled] = useState(orgConfig?.supplier_assessment?.standard_question_bank_enabled !== false);
  const [advancedQuestionBankEnabled, setAdvancedQuestionBankEnabled] = useState(orgConfig?.supplier_assessment?.advanced_question_bank_enabled !== false);
  const [sectionWeights, setSectionWeights] = useState(orgConfig?.supplier_assessment?.esg_section_weights || { environment: 33.33, social: 33.33, governance: 33.34 });

  useEffect(() => {
    setModules(buildModules(orgConfig));
    setTaxonomy(cloneSupplierEsgTaxonomy(orgConfig?.supplier_assessment?.esg_subcategories));
    setBasicQuestionBankEnabled(orgConfig?.supplier_assessment?.basic_question_bank_enabled !== false);
    setStandardQuestionBankEnabled(orgConfig?.supplier_assessment?.standard_question_bank_enabled !== false);
    setAdvancedQuestionBankEnabled(orgConfig?.supplier_assessment?.advanced_question_bank_enabled !== false);
    setSectionWeights(orgConfig?.supplier_assessment?.esg_section_weights || { environment: 33.33, social: 33.33, governance: 33.34 });
  }, [orgConfig]);

  const updateModule = (code, patch) => setModules((current) => ({ ...current, [code]: { ...current[code], ...patch } }));
  const updateCategory = (section, code, patch) => setTaxonomy((current) => ({
    ...current, [section]: current[section].map((category) => category.code === code ? { ...category, ...patch } : category),
  }));
  const removeCustomCategory = (section, code) => setTaxonomy((current) => ({
    ...current, [section]: current[section].filter((category) => category.code !== code),
  }));
  const addCustomCategory = (section) => {
    const name = customNames[section].trim();
    if (!name) return;
    setTaxonomy((current) => ({ ...current, [section]: [...current[section], { code: categoryCode(name, current[section]), name, enabled: false, weight: 0, is_custom: true }] }));
    setCustomNames((current) => ({ ...current, [section]: '' }));
  };
  const weightTotals = useMemo(() => Object.fromEntries(ESG_SECTIONS.map(({ value }) => [value, taxonomy[value].filter((category) => category.enabled).reduce((total, category) => total + Number(category.weight || 0), 0)])), [taxonomy]);
  const invalidSections = ESG_SECTIONS.filter(({ value }) => taxonomy[value].some((category) => category.enabled) && Math.abs(weightTotals[value] - 100) > 0.01).map(({ value }) => value);
  const handleSave = () => {
    if (invalidSections.length) return;
    onSave({ supplier_assessment: { modules: Object.fromEntries(MODULES.map((module) => {
      const current = modules[module.code];
      return [module.code, { enabled: current.enabled, display_name: current.display_name.trim() || module.fallbackName, ...(module.code === 'ghg' ? { scopes: current.scopes, allow_custom_fuels: current.allow_custom_fuels, allow_process_emissions: current.allow_process_emissions, allow_flaring: current.allow_flaring } : {}) }];
    })), esg_subcategories: taxonomy, esg_section_weights: sectionWeights, basic_question_bank_enabled: basicQuestionBankEnabled, standard_question_bank_enabled: standardQuestionBankEnabled, advanced_question_bank_enabled: advancedQuestionBankEnabled } });
  };

  return <Card className="p-6" data-testid="supplier-assessment-config-tab">
    <div className="mb-8 flex flex-col gap-4 border-b border-stone-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
      <div><h2 className="text-lg font-semibold text-stone-900" data-testid="supplier-assessment-config-heading">Supplier assessment</h2><p className="mt-1 max-w-3xl text-sm text-stone-500" data-testid="supplier-assessment-config-description">Set available workflows and the ESG subcategories used for new supplier questionnaires. Enabled weights must total 100% inside each populated ESG pillar.</p></div>
      <Button size="sm" onClick={handleSave} disabled={saving || invalidSections.length > 0} data-testid="save-supplier-assessment-config-button"><Save className="mr-1 h-4 w-4" />Save</Button>
    </div>

    <div className="grid gap-4 lg:grid-cols-2" data-testid="supplier-assessment-module-grid">{MODULES.map((module) => {
      const Icon = module.icon; const current = modules[module.code];
      return <section className="border border-stone-200 p-5" key={module.code} data-testid={`supplier-assessment-module-${module.code}`}><div className="flex items-start justify-between gap-4"><div className="flex gap-3"><Icon className="mt-0.5 h-5 w-5 text-emerald-700" /><div><h3 className="font-medium text-stone-900" data-testid={`supplier-assessment-module-${module.code}-heading`}>{module.workflow}</h3><p className="mt-1 text-xs text-stone-500" data-testid={`supplier-assessment-module-${module.code}-description`}>{module.description}</p></div></div><Switch checked={current.enabled} onCheckedChange={(enabled) => updateModule(module.code, { enabled })} data-testid={`supplier-assessment-module-${module.code}-enabled-toggle`} /></div><div className="mt-5 space-y-2"><Label htmlFor={`supplier-module-name-${module.code}`}>Supplier-facing name</Label><Input id={`supplier-module-name-${module.code}`} value={current.display_name} onChange={(event) => updateModule(module.code, { display_name: event.target.value })} placeholder={module.fallbackName} data-testid={`supplier-assessment-module-${module.code}-name-input`} /></div>{module.code === 'ghg' && <div className="mt-4 space-y-4"><div><p className="text-xs font-medium text-stone-700" data-testid="supplier-assessment-ghg-scopes-label">Enabled scopes</p><div className="mt-2 flex flex-wrap gap-4"><Label className="flex items-center gap-2 text-sm font-normal"><Checkbox checked={current.scopes.includes('scope1')} onCheckedChange={(checked) => updateModule('ghg', { scopes: checked ? [...new Set([...current.scopes, 'scope1'])] : current.scopes.filter((scope) => scope !== 'scope1') })} data-testid="supplier-assessment-ghg-scope1-checkbox" />Scope 1</Label><Label className="flex items-center gap-2 text-sm font-normal"><Checkbox checked={current.scopes.includes('scope2')} onCheckedChange={(checked) => updateModule('ghg', { scopes: checked ? [...new Set([...current.scopes, 'scope2'])] : current.scopes.filter((scope) => scope !== 'scope2') })} data-testid="supplier-assessment-ghg-scope2-checkbox" />Scope 2</Label></div></div><div><p className="text-xs font-medium text-stone-700" data-testid="supplier-assessment-ghg-permissions-label">Additional supplier permissions</p><div className="mt-2 flex flex-wrap gap-4"><Label className="flex items-center gap-2 text-sm font-normal"><Checkbox checked={current.allow_custom_fuels} onCheckedChange={(allow_custom_fuels) => updateModule('ghg', { allow_custom_fuels })} data-testid="supplier-assessment-ghg-custom-fuels-checkbox" />Custom fuels</Label><Label className="flex items-center gap-2 text-sm font-normal"><Checkbox checked={current.allow_process_emissions} onCheckedChange={(allow_process_emissions) => updateModule('ghg', { allow_process_emissions })} data-testid="supplier-assessment-ghg-process-emissions-checkbox" />Process emissions</Label><Label className="flex items-center gap-2 text-sm font-normal"><Checkbox checked={current.allow_flaring} onCheckedChange={(allow_flaring) => updateModule('ghg', { allow_flaring })} data-testid="supplier-assessment-ghg-flaring-checkbox" />Flaring</Label></div></div></div>}</section>;
    })}</div>

    <section className="mt-8 border-t border-stone-200 pt-7" data-testid="supplier-assessment-esg-taxonomy-config"><div className="mb-5 grid gap-3 sm:grid-cols-3" data-testid="supplier-assessment-esg-section-weights">{ESG_SECTIONS.map(({ value, label }) => <div key={value} className="space-y-1"><Label htmlFor={`supplier-section-weight-${value}`}>{label} weight</Label><Input id={`supplier-section-weight-${value}`} type="number" min="0" max="100" step="0.01" value={sectionWeights[value]} onChange={(event) => setSectionWeights((current) => ({ ...current, [value]: Number(event.target.value) || 0 }))} data-testid={`supplier-assessment-section-weight-${value}`} /></div>)}</div><div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"><div><h3 className="text-base font-semibold text-stone-900" data-testid="supplier-assessment-esg-taxonomy-heading">ESG questionnaire subcategories</h3><p className="mt-1 text-sm text-stone-500" data-testid="supplier-assessment-esg-taxonomy-description">These categories appear in the questionnaire builder and control the relative score contribution within their ESG pillar.</p></div><div className="grid gap-3 sm:grid-cols-3" data-testid="system-question-bank-controls"><div className="flex items-center justify-between gap-3 border border-stone-200 bg-stone-50 px-3 py-2"><Label htmlFor="basic-question-bank-toggle" className="text-sm font-medium text-stone-700" data-testid="basic-question-bank-label">ESG Annual (Basic)</Label><Switch id="basic-question-bank-toggle" checked={basicQuestionBankEnabled} onCheckedChange={setBasicQuestionBankEnabled} data-testid="basic-question-bank-toggle" /></div><div className="flex items-center justify-between gap-3 border border-stone-200 bg-stone-50 px-3 py-2"><Label htmlFor="standard-question-bank-toggle" className="text-sm font-medium text-stone-700" data-testid="standard-question-bank-label">ESG Annual (Standard)</Label><Switch id="standard-question-bank-toggle" checked={standardQuestionBankEnabled} onCheckedChange={setStandardQuestionBankEnabled} data-testid="standard-question-bank-toggle" /></div><div className="flex items-center justify-between gap-3 border border-stone-200 bg-stone-50 px-3 py-2"><Label htmlFor="advanced-question-bank-toggle" className="text-sm font-medium text-stone-700" data-testid="advanced-question-bank-label">ESG Annual (Advanced)</Label><Switch id="advanced-question-bank-toggle" checked={advancedQuestionBankEnabled} onCheckedChange={setAdvancedQuestionBankEnabled} data-testid="advanced-question-bank-toggle" /></div></div></div><div className="mt-5 grid gap-5 xl:grid-cols-3">{ESG_SECTIONS.map(({ value, label }) => <section className="border border-stone-200 bg-stone-50/50 p-4" key={value} data-testid={`supplier-assessment-taxonomy-${value}`}><div className="flex items-baseline justify-between gap-3 border-b border-stone-200 pb-3"><h4 className="font-semibold text-stone-900" data-testid={`supplier-assessment-taxonomy-${value}-heading`}>{label}</h4><span className={`text-xs font-medium ${invalidSections.includes(value) ? 'text-rose-700' : 'text-emerald-700'}`} data-testid={`supplier-assessment-taxonomy-${value}-weight-total`}>Enabled: {weightTotals[value].toFixed(2)}%</span></div><div className="divide-y divide-stone-200" data-testid={`supplier-assessment-taxonomy-${value}-list`}>{taxonomy[value].map((category) => <div className="grid grid-cols-[auto_minmax(0,1fr)_5.5rem_auto] items-center gap-2 py-3" key={category.code} data-testid={`supplier-assessment-subcategory-${category.code}`}><Switch checked={category.enabled} onCheckedChange={(enabled) => updateCategory(value, category.code, { enabled })} data-testid={`supplier-assessment-subcategory-${category.code}-toggle`} /><span className="min-w-0 text-sm leading-5 text-stone-700" data-testid={`supplier-assessment-subcategory-${category.code}-name`}>{category.name}</span><Input type="number" min="0" max="100" step="0.01" value={category.weight} disabled={!category.enabled} aria-label={`${category.name} weight`} onChange={(event) => updateCategory(value, category.code, { weight: Number(event.target.value) || 0 })} data-testid={`supplier-assessment-subcategory-${category.code}-weight-input`} />{category.is_custom ? <Button variant="ghost" size="icon" aria-label={`Remove ${category.name}`} onClick={() => removeCustomCategory(value, category.code)} data-testid={`remove-supplier-assessment-subcategory-${category.code}`}><Trash2 className="h-4 w-4 text-rose-600" /></Button> : <span aria-hidden="true" data-testid={`supplier-assessment-subcategory-${category.code}-default-marker`} />}</div>)}</div><div className="mt-4 flex gap-2"><Input value={customNames[value]} onChange={(event) => setCustomNames((current) => ({ ...current, [value]: event.target.value }))} placeholder={`Add ${label.toLowerCase()} subcategory`} data-testid={`supplier-assessment-add-custom-${value}-input`} /><Button variant="outline" size="icon" aria-label={`Add custom ${label} subcategory`} disabled={!customNames[value].trim()} onClick={() => addCustomCategory(value)} data-testid={`supplier-assessment-add-custom-${value}-button`}><Plus className="h-4 w-4" /></Button></div>{invalidSections.includes(value) && <p className="mt-2 text-xs font-medium text-rose-700" data-testid={`supplier-assessment-taxonomy-${value}-weight-error`}>Enabled weights must total 100% before saving.</p>}</section>)}</div></section>
  </Card>;
}