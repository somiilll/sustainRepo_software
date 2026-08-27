import React, { useEffect, useState } from 'react';
import { FileText, GraduationCap, Leaf, Save, ClipboardList } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';

const MODULES = [
  { code: 'esg', fallbackName: 'ESG Questionnaire', workflow: 'Questionnaires', icon: ClipboardList, description: 'Supplier ESG questionnaires and responses.' },
  { code: 'ghg', fallbackName: 'GHG Emissions', workflow: 'GHG reporting', icon: Leaf, description: 'Supplier Scope 1 and Scope 2 reporting.' },
  { code: 'documents', fallbackName: 'Documents', workflow: 'Agreement acceptance', icon: FileText, description: 'Private agreements suppliers review and accept.' },
  { code: 'training', fallbackName: 'Training', workflow: 'Training assignments', icon: GraduationCap, description: 'Private learning content assigned to suppliers.' },
];

const buildState = (config) => Object.fromEntries(MODULES.map((module) => {
  const saved = config?.supplier_assessment?.modules?.[module.code] || {};
  return [module.code, {
    enabled: Boolean(saved.enabled),
    display_name: saved.display_name || module.fallbackName,
    scopes: saved.scopes || ['scope1', 'scope2'],
  }];
}));

export function SupplierAssessmentTab({ orgConfig, onSave, saving }) {
  const [modules, setModules] = useState(() => buildState(orgConfig));

  useEffect(() => setModules(buildState(orgConfig)), [orgConfig]);

  const updateModule = (code, patch) => setModules((current) => ({
    ...current,
    [code]: { ...current[code], ...patch },
  }));

  const handleSave = () => onSave({
    supplier_assessment: {
      modules: Object.fromEntries(MODULES.map((module) => {
        const current = modules[module.code];
        return [module.code, {
          enabled: current.enabled,
          display_name: current.display_name.trim() || module.fallbackName,
          ...(module.code === 'ghg' ? { scopes: current.scopes } : {}),
        }];
      })),
    },
  });

  return (
    <Card className="p-6" data-testid="supplier-assessment-config-tab">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-stone-900">Supplier assessment</h2>
          <p className="mt-1 max-w-2xl text-sm text-stone-500">Choose the registered workflows available to this organization. Display names are saved with each new assessment program version, preserving earlier supplier assignments.</p>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving} data-testid="save-supplier-assessment-config-button"><Save className="mr-1 h-4 w-4" />Save</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {MODULES.map((module) => {
          const Icon = module.icon;
          const current = modules[module.code];
          return <section className="border border-stone-200 p-5" key={module.code} data-testid={`supplier-assessment-module-${module.code}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3"><Icon className="mt-0.5 h-5 w-5 text-emerald-700" /><div><h3 className="font-medium text-stone-900">{module.workflow}</h3><p className="mt-1 text-xs text-stone-500">{module.description}</p></div></div>
              <Switch checked={current.enabled} onCheckedChange={(enabled) => updateModule(module.code, { enabled })} data-testid={`supplier-assessment-module-${module.code}-enabled-toggle`} />
            </div>
            <div className="mt-5 space-y-2"><Label htmlFor={`supplier-module-name-${module.code}`}>Supplier-facing name</Label><Input id={`supplier-module-name-${module.code}`} value={current.display_name} onChange={(event) => updateModule(module.code, { display_name: event.target.value })} placeholder={module.fallbackName} data-testid={`supplier-assessment-module-${module.code}-name-input`} /></div>
            {module.code === 'ghg' && <div className="mt-4"><p className="text-xs font-medium text-stone-700">Enabled scopes</p><div className="mt-2 flex flex-wrap gap-4"><Label className="flex items-center gap-2 text-sm font-normal"><Checkbox checked={current.scopes.includes('scope1')} onCheckedChange={(checked) => updateModule('ghg', { scopes: checked ? [...new Set([...current.scopes, 'scope1'])] : current.scopes.filter((scope) => scope !== 'scope1') })} data-testid="supplier-assessment-ghg-scope1-checkbox" />Scope 1</Label><Label className="flex items-center gap-2 text-sm font-normal"><Checkbox checked={current.scopes.includes('scope2')} onCheckedChange={(checked) => updateModule('ghg', { scopes: checked ? [...new Set([...current.scopes, 'scope2'])] : current.scopes.filter((scope) => scope !== 'scope2') })} data-testid="supplier-assessment-ghg-scope2-checkbox" />Scope 2</Label></div></div>}
          </section>;
        })}
      </div>
    </Card>
  );
}