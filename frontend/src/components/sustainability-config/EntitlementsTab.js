import React, { useEffect, useState } from 'react';
import { Save, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';

const ENVIRONMENT_MODULES = [
  ['ghg', 'GHG'], ['energy', 'Energy'], ['water', 'Water'], ['waste', 'Waste'],
  ['biodiversity', 'Biodiversity'], ['climate_change', 'Climate Change'],
  ['material', 'Material'], ['other_emissions', 'Other Emissions'],
];

const DEFAULT_ENTITLEMENTS = {
  repo_pilot: { internal_data_ai: false, data_retrieval: false },
  environment: Object.fromEntries(ENVIRONMENT_MODULES.map(([code]) => [code, { enabled: true, monthly_rows_allowed: null }])),
  social: { enabled: true }, governance: { enabled: true },
  materiality: { enabled: true, assessment_types: ['traditional', 'double'] },
  reporting: { enabled: true, brsr: true, gri: true },
  workflow: { enabled: true, workflow_type: 'multi_level' },
  uploads: { bulk_upload: true, ocr: true },
  targets: { enabled: false, voluntary: false, sbti: false },
  reports: { enabled: true, scope_1_2: true, scope_1_2_3: true, ai_executive_summary: true },
  mis_reports: { enabled: true, configurations_allowed: null },
  peer_benchmarking: { enabled: true }, supplier_assessment: { enabled: true, suppliers_allowed: null },
  audit_trails: { enabled: true }, evidence_storage: { enabled: true, storage_limit_gb: null },
};
DEFAULT_ENTITLEMENTS.environment.ghg.coverage = 'scope_1_2_3';

const mergeConfig = (saved = {}) => ({
  ...DEFAULT_ENTITLEMENTS,
  ...saved,
  environment: Object.fromEntries(ENVIRONMENT_MODULES.map(([code]) => [code, {
    ...DEFAULT_ENTITLEMENTS.environment[code], ...(saved.environment?.[code] || {}),
  }])),
  repo_pilot: { ...DEFAULT_ENTITLEMENTS.repo_pilot, ...(saved.repo_pilot || {}) },
  materiality: { ...DEFAULT_ENTITLEMENTS.materiality, ...(saved.materiality || {}) },
  reporting: { ...DEFAULT_ENTITLEMENTS.reporting, ...(saved.reporting || {}) },
  workflow: { ...DEFAULT_ENTITLEMENTS.workflow, ...(saved.workflow || {}) },
  uploads: { ...DEFAULT_ENTITLEMENTS.uploads, ...(saved.uploads || {}) },
  targets: { ...DEFAULT_ENTITLEMENTS.targets, ...(saved.targets || {}) },
  reports: { ...DEFAULT_ENTITLEMENTS.reports, ...(saved.reports || {}) },
  mis_reports: { ...DEFAULT_ENTITLEMENTS.mis_reports, ...(saved.mis_reports || {}) },
  supplier_assessment: { ...DEFAULT_ENTITLEMENTS.supplier_assessment, ...(saved.supplier_assessment || {}) },
  evidence_storage: { ...DEFAULT_ENTITLEMENTS.evidence_storage, ...(saved.evidence_storage || {}) },
});

function LimitInput({ testId, value, onChange, label, unit = '' }) {
  return <div className="mt-3"><Label htmlFor={testId} className="text-xs text-stone-600" data-testid={`${testId}-label`}>{label}</Label><Input id={testId} type="number" min="1" value={value ?? ''} onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))} placeholder="Unlimited" className="mt-1 h-8" data-testid={testId} /><p className="mt-1 text-xs text-stone-400" data-testid={`${testId}-help`}>Leave blank for unlimited{unit ? ` ${unit}` : ''}.</p></div>;
}

function ToggleRow({ testId, label, description, checked, onChange, disabled = false }) {
  return <div className="flex items-start justify-between gap-4 border-b border-stone-100 py-3 last:border-b-0" data-testid={`${testId}-row`}><div><p className="text-sm font-medium text-stone-900" data-testid={`${testId}-label`}>{label}</p>{description && <p className="mt-1 text-xs leading-relaxed text-stone-500" data-testid={`${testId}-description`}>{description}</p>}</div><Switch checked={checked} onCheckedChange={onChange} disabled={disabled} data-testid={testId} /></div>;
}

function EntitlementCard({ testId, title, description, children }) {
  return <section className="border border-stone-200 bg-white p-5" data-testid={testId}><h3 className="text-base font-semibold text-stone-900" data-testid={`${testId}-title`}>{title}</h3>{description && <p className="mt-1 text-xs leading-relaxed text-stone-500" data-testid={`${testId}-description`}>{description}</p>}<div className="mt-3">{children}</div></section>;
}

export function EntitlementsTab({ orgConfig, onSave, saving }) {
  const [entitlements, setEntitlements] = useState(() => mergeConfig(orgConfig?.entitlements));
  const [aiCredits, setAiCredits] = useState(orgConfig?.ai_credits ?? 0);
  useEffect(() => {
    setEntitlements(mergeConfig(orgConfig?.entitlements));
    setAiCredits(orgConfig?.ai_credits ?? 0);
  }, [orgConfig]);
  const patch = (area, values) => setEntitlements((current) => ({ ...current, [area]: { ...current[area], ...values } }));
  const patchEnvironment = (area, values) => setEntitlements((current) => ({ ...current, environment: { ...current.environment, [area]: { ...current.environment[area], ...values } } }));
  const ghg = entitlements.environment.ghg;
  const scope12Available = ghg.enabled && ['scope_1_2', 'scope_1_2_3'].includes(ghg.coverage);
  const scope3Available = ghg.enabled && ['scope_3', 'scope_1_2_3'].includes(ghg.coverage);
  const save = () => onSave({ ai_credits: aiCredits, entitlements: { ...entitlements, reports: { ...entitlements.reports, scope_1_2: scope12Available && entitlements.reports.scope_1_2, scope_1_2_3: scope3Available && entitlements.reports.scope_1_2_3 } } });

  return <Card className="p-6" data-testid="entitlements-tab">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-700" /><div><h2 className="text-lg font-semibold" data-testid="entitlements-title">Platform access and plan limits</h2><p className="mt-1 text-sm text-stone-500" data-testid="entitlements-description">Configure every workspace and plan limit for this organization. Blank limits are unlimited.</p></div></div><Button size="sm" onClick={save} disabled={saving} data-testid="save-entitlements-button"><Save className="mr-1 h-4 w-4" />Save access</Button></div>

    <div className="space-y-5">
      <EntitlementCard testId="ai-credits-entitlement" title="AI Credits" description="Available credits for AI features. Consumption enforcement will be added separately."><div className="max-w-sm"><Label htmlFor="ai-credits-input" className="text-xs text-stone-600" data-testid="ai-credits-label">AI credits available</Label><Input id="ai-credits-input" type="number" min="0" value={aiCredits} onChange={(event) => setAiCredits(event.target.value === '' ? 0 : Number(event.target.value))} className="mt-1" data-testid="ai-credits-input" /><p className="mt-1 text-xs text-stone-400" data-testid="ai-credits-help">Defaults to 0 credits. This field does not yet enforce AI usage.</p></div></EntitlementCard>
      <EntitlementCard testId="repo-pilot-entitlement" title="1. RepoPilot" description="Enable individual document intelligence capabilities."><ToggleRow testId="repo-pilot-internal-data-ai-toggle" label="Internal Data AI" checked={entitlements.repo_pilot.internal_data_ai} onChange={(value) => patch('repo_pilot', { internal_data_ai: value })} /><ToggleRow testId="repo-pilot-data-retrieval-toggle" label="Data Retrieval" checked={entitlements.repo_pilot.data_retrieval} onChange={(value) => patch('repo_pilot', { data_retrieval: value })} /></EntitlementCard>
      <EntitlementCard testId="environment-entitlement" title="2. Environment" description="Each enabled environment module can have a monthly-entry cap."><div className="grid gap-3 lg:grid-cols-2">{ENVIRONMENT_MODULES.map(([code, label]) => { const item = entitlements.environment[code]; return <div className="border border-stone-100 p-4" key={code} data-testid={`environment-${code}-entitlement`}><ToggleRow testId={`environment-${code}-toggle`} label={label} checked={item.enabled} onChange={(enabled) => patchEnvironment(code, { enabled })} />{item.enabled && <>{code === 'ghg' && <div className="mt-3"><Label htmlFor="ghg-coverage-select" className="text-xs text-stone-600" data-testid="ghg-coverage-label">GHG coverage</Label><select id="ghg-coverage-select" value={item.coverage} onChange={(event) => patchEnvironment('ghg', { coverage: event.target.value })} className="mt-1 h-8 w-full border border-stone-200 bg-white px-2 text-sm" data-testid="ghg-coverage-select"><option value="scope_1_2">Scope 1 &amp; 2</option><option value="scope_3">Scope 3</option><option value="scope_1_2_3">Scope 1, 2 &amp; 3</option></select></div>}<LimitInput testId={`environment-${code}-monthly-rows-input`} label="Monthly rows allowed" value={item.monthly_rows_allowed} onChange={(monthly_rows_allowed) => patchEnvironment(code, { monthly_rows_allowed })} /></>}</div>; })}</div></EntitlementCard>
      <div className="grid gap-5 lg:grid-cols-2"><EntitlementCard testId="social-entitlement" title="3. Social"><ToggleRow testId="social-enabled-toggle" label="Social" checked={entitlements.social.enabled} onChange={(enabled) => patch('social', { enabled })} /></EntitlementCard><EntitlementCard testId="governance-entitlement" title="4. Governance"><ToggleRow testId="governance-enabled-toggle" label="Governance" checked={entitlements.governance.enabled} onChange={(enabled) => patch('governance', { enabled })} /></EntitlementCard></div>
      <div className="grid gap-5 lg:grid-cols-2"><EntitlementCard testId="materiality-entitlement" title="5. Material Assessment"><ToggleRow testId="materiality-enabled-toggle" label="Material Assessment" checked={entitlements.materiality.enabled} onChange={(enabled) => patch('materiality', { enabled })} />{entitlements.materiality.enabled && <div className="mt-3 space-y-2" data-testid="materiality-types"><p className="text-xs text-stone-600" data-testid="materiality-types-label">Assessment types</p>{[['traditional', 'Traditional Materiality'], ['double', 'Double Materiality']].map(([value, label]) => <Label className="flex items-center gap-2 text-sm font-normal" key={value}><Checkbox checked={entitlements.materiality.assessment_types.includes(value)} onCheckedChange={(checked) => patch('materiality', { assessment_types: checked ? [...new Set([...entitlements.materiality.assessment_types, value])] : entitlements.materiality.assessment_types.filter((type) => type !== value) })} data-testid={`materiality-${value}-checkbox`} />{label}</Label>)}</div>}</EntitlementCard><EntitlementCard testId="reporting-entitlement" title="6. Reporting"><ToggleRow testId="reporting-enabled-toggle" label="Reporting" checked={entitlements.reporting.enabled} onChange={(enabled) => patch('reporting', { enabled })} />{entitlements.reporting.enabled && <><ToggleRow testId="reporting-brsr-toggle" label="BRSR" checked={entitlements.reporting.brsr} onChange={(brsr) => patch('reporting', { brsr })} /><ToggleRow testId="reporting-gri-toggle" label="GRI" checked={entitlements.reporting.gri} onChange={(gri) => patch('reporting', { gri })} /></>}</EntitlementCard></div>
      <div className="grid gap-5 lg:grid-cols-2"><EntitlementCard testId="workflow-entitlement" title="7. Workflow"><ToggleRow testId="workflow-enabled-toggle" label="Workflow" checked={entitlements.workflow.enabled} onChange={(enabled) => patch('workflow', { enabled })} />{entitlements.workflow.enabled && <div className="mt-3"><Label htmlFor="workflow-type-select" className="text-xs text-stone-600" data-testid="workflow-type-label">Workflow type</Label><select id="workflow-type-select" value={entitlements.workflow.workflow_type} onChange={(event) => patch('workflow', { workflow_type: event.target.value })} className="mt-1 h-8 w-full border border-stone-200 bg-white px-2 text-sm" data-testid="workflow-type-select"><option value="single_level">Single-level</option><option value="multi_level">Multi-level</option></select></div>}</EntitlementCard><EntitlementCard testId="uploads-entitlement" title="8. Uploads"><ToggleRow testId="uploads-bulk-upload-toggle" label="Bulk Upload" checked={entitlements.uploads.bulk_upload} onChange={(bulk_upload) => patch('uploads', { bulk_upload })} /><ToggleRow testId="uploads-ocr-toggle" label="OCR" checked={entitlements.uploads.ocr} onChange={(ocr) => patch('uploads', { ocr })} /></EntitlementCard></div>
      <div className="grid gap-5 lg:grid-cols-2"><EntitlementCard testId="targets-entitlement" title="9. Targets"><ToggleRow testId="targets-enabled-toggle" label="Targets" checked={entitlements.targets.enabled} onChange={(enabled) => patch('targets', { enabled })} />{entitlements.targets.enabled && <><ToggleRow testId="targets-voluntary-toggle" label="Voluntary Targets" checked={entitlements.targets.voluntary} onChange={(voluntary) => patch('targets', { voluntary })} /><ToggleRow testId="targets-sbti-toggle" label="SBTi" checked={entitlements.targets.sbti} onChange={(sbti) => patch('targets', { sbti })} /></>}</EntitlementCard><EntitlementCard testId="reports-entitlement" title="10. Reports" description="Scope-report options follow the selected GHG coverage."><ToggleRow testId="reports-enabled-toggle" label="Reports" checked={entitlements.reports.enabled} onChange={(enabled) => patch('reports', { enabled })} />{entitlements.reports.enabled && <><ToggleRow testId="reports-scope-1-2-toggle" label="Scope 1 & 2" checked={entitlements.reports.scope_1_2} onChange={(scope_1_2) => patch('reports', { scope_1_2 })} disabled={!scope12Available} /><ToggleRow testId="reports-scope-1-2-3-toggle" label="Scope 1, 2 & 3" checked={entitlements.reports.scope_1_2_3} onChange={(scope_1_2_3) => patch('reports', { scope_1_2_3 })} disabled={!scope3Available} /><ToggleRow testId="reports-ai-executive-summary-toggle" label="AI Executive Summary" checked={entitlements.reports.ai_executive_summary} onChange={(ai_executive_summary) => patch('reports', { ai_executive_summary })} /></>}</EntitlementCard></div>
      <div className="grid gap-5 lg:grid-cols-2"><EntitlementCard testId="mis-reports-entitlement" title="11. MIS Reports"><ToggleRow testId="mis-reports-enabled-toggle" label="MIS Reports" checked={entitlements.mis_reports.enabled} onChange={(enabled) => patch('mis_reports', { enabled })} />{entitlements.mis_reports.enabled && <LimitInput testId="mis-reports-configurations-input" label="Configurations allowed" value={entitlements.mis_reports.configurations_allowed} onChange={(configurations_allowed) => patch('mis_reports', { configurations_allowed })} />}</EntitlementCard><EntitlementCard testId="peer-benchmarking-entitlement" title="12. Peer Benchmarking"><ToggleRow testId="peer-benchmarking-enabled-toggle" label="Peer Benchmarking" checked={entitlements.peer_benchmarking.enabled} onChange={(enabled) => patch('peer_benchmarking', { enabled })} /></EntitlementCard></div>
      <div className="grid gap-5 lg:grid-cols-3"><EntitlementCard testId="supplier-assessment-entitlement" title="13. Supplier Assessment"><ToggleRow testId="supplier-assessment-enabled-toggle" label="Supplier Assessment" checked={entitlements.supplier_assessment.enabled} onChange={(enabled) => patch('supplier_assessment', { enabled })} />{entitlements.supplier_assessment.enabled && <LimitInput testId="supplier-assessment-suppliers-input" label="Suppliers allowed" value={entitlements.supplier_assessment.suppliers_allowed} onChange={(suppliers_allowed) => patch('supplier_assessment', { suppliers_allowed })} />}</EntitlementCard><EntitlementCard testId="audit-trails-entitlement" title="14. Audit Trails"><ToggleRow testId="audit-trails-enabled-toggle" label="Audit Trails" checked={entitlements.audit_trails.enabled} onChange={(enabled) => patch('audit_trails', { enabled })} /></EntitlementCard><EntitlementCard testId="evidence-storage-entitlement" title="15. Evidence Storage"><ToggleRow testId="evidence-storage-enabled-toggle" label="Evidence Storage" checked={entitlements.evidence_storage.enabled} onChange={(enabled) => patch('evidence_storage', { enabled })} />{entitlements.evidence_storage.enabled && <LimitInput testId="evidence-storage-limit-input" label="Storage limit" unit="GB" value={entitlements.evidence_storage.storage_limit_gb} onChange={(storage_limit_gb) => patch('evidence_storage', { storage_limit_gb })} />}</EntitlementCard></div>
    </div>
  </Card>;
}