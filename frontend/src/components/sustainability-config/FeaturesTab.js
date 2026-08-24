import React, { useEffect, useState } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Save } from 'lucide-react';

const ALL_SECTIONS = ['power', 'water', 'steam', 'energy', 'waste', 'social', 'governance'];
const ESG_FRAMEWORKS = [
  ['BRSR', 'Business Responsibility and Sustainability Reporting'],
  ['GRI', 'Global Reporting Initiative Standards'],
];

export function FeaturesTab({ orgConfig, onSave, saving }) {
  const features = orgConfig?.features || {};
  const dashboard = orgConfig?.dashboard || {};
  const setTarget = features.set_target || {};

  const [targetEnabled, setTargetEnabled] = useState(!!setTarget.enabled);
  const [targetModules, setTargetModules] = useState(setTarget.modules || []);
  const [customDashboard, setCustomDashboard] = useState(dashboard.type === 'custom');
  const [organizationSettings, setOrganizationSettings] = useState(orgConfig?.organization_settings || { approval_workflow_enabled: false, multi_level_approval_enabled: false, esg_frameworks_enabled: [] });

  useEffect(() => {
    const settings = orgConfig?.organization_settings || {};
    setOrganizationSettings({ approval_workflow_enabled: false, multi_level_approval_enabled: false, esg_frameworks_enabled: [], ...settings });
  }, [orgConfig]);

  const toggleModule = (code) =>
    setTargetModules(prev => prev.includes(code) ? prev.filter(s => s !== code) : [...prev, code]);

  const handleSave = () => {
    onSave({
      features: { set_target: { enabled: targetEnabled, modules: targetModules } },
      dashboard: { type: customDashboard ? 'custom' : 'standard' },
      organization_settings: organizationSettings,
    });
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
              <p className="text-xs text-stone-500">Adds a Set Target tab to KPI pages</p>
            </div>
            <Switch checked={targetEnabled} onCheckedChange={setTargetEnabled} data-testid="feature-set-target-toggle" />
          </div>
          {targetEnabled && (
            <div>
              <Label className="text-sm mb-2 block">Enabled for modules:</Label>
              <div className="flex flex-wrap gap-2">
                {ALL_SECTIONS.map(code => (
                  <Button key={code} size="sm" variant={targetModules.includes(code) ? 'default' : 'outline'} onClick={() => toggleModule(code)}>
                    {code.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Custom Dashboard */}
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-stone-800">Custom Dashboard</h3>
              <p className="text-xs text-stone-500">Enable organization-specific dashboard instead of the standard one</p>
            </div>
            <Switch checked={customDashboard} onCheckedChange={setCustomDashboard} data-testid="feature-custom-dashboard-toggle" />
          </div>
          <p className="text-xs text-stone-400 mt-2">
            {customDashboard ? 'Dashboard will be driven by the org\u2019s configured modules and KPIs.' : 'Using standard dashboard (global defaults).'}
          </p>
        </div>

        <div className="border rounded-lg p-4" data-testid="organization-settings-features-section">
          <div className="mb-3">
            <h3 className="font-medium text-stone-800" data-testid="organization-settings-features-title">Organization workflow and reporting</h3>
            <p className="text-xs text-stone-500" data-testid="organization-settings-features-description">These settings are now managed only in Org Config.</p>
          </div>
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4 border-b border-stone-100 pb-3">
              <div><p className="text-sm font-medium" data-testid="org-config-approval-workflow-label">Approval Workflow</p><p className="mt-1 text-xs text-stone-500" data-testid="org-config-approval-workflow-description">Hold submitted emission changes for admin review before dashboards and reports include them.</p></div>
              <Switch checked={organizationSettings.approval_workflow_enabled} onCheckedChange={(approval_workflow_enabled) => setOrganizationSettings((current) => ({ ...current, approval_workflow_enabled }))} data-testid="org-config-approval-workflow-toggle" />
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-stone-100 pb-3">
              <div><p className="text-sm font-medium" data-testid="org-config-multi-level-approval-label">Multi-Level Approval Chain</p><p className="mt-1 text-xs text-stone-500" data-testid="org-config-multi-level-approval-description">Allow approval chains with multiple approvers for ESG disclosures.</p></div>
              <Switch checked={organizationSettings.multi_level_approval_enabled} onCheckedChange={(multi_level_approval_enabled) => setOrganizationSettings((current) => ({ ...current, multi_level_approval_enabled }))} data-testid="org-config-multi-level-approval-toggle" />
            </div>
            <div data-testid="org-config-frameworks-section"><p className="text-sm font-medium" data-testid="org-config-frameworks-label">ESG Frameworks</p><p className="mt-1 text-xs text-stone-500" data-testid="org-config-frameworks-description">Select the reporting frameworks enabled for this organization.</p><div className="mt-3 space-y-2">{ESG_FRAMEWORKS.map(([code, description]) => <Label className="flex items-center gap-3 border border-stone-100 p-3 text-sm font-normal" key={code} data-testid={`org-config-framework-${code.toLowerCase()}-row`}><Switch checked={organizationSettings.esg_frameworks_enabled.includes(code)} onCheckedChange={(checked) => setOrganizationSettings((current) => ({ ...current, esg_frameworks_enabled: checked ? [...new Set([...current.esg_frameworks_enabled, code])] : current.esg_frameworks_enabled.filter((framework) => framework !== code) }))} data-testid={`org-config-framework-${code.toLowerCase()}-toggle`} /><span><span className="block font-medium" data-testid={`org-config-framework-${code.toLowerCase()}-label`}>{code}</span><span className="mt-1 block text-xs text-stone-500" data-testid={`org-config-framework-${code.toLowerCase()}-description`}>{description}</span></span></Label>)}</div></div>
          </div>
        </div>
      </div>
    </Card>
  );
}
