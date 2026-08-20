import React, { useState } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Save } from 'lucide-react';

const ALL_SECTIONS = ['power', 'water', 'steam', 'energy', 'waste', 'social', 'governance'];

export function FeaturesTab({ orgConfig, onSave, saving }) {
  const features = orgConfig?.features || {};
  const dashboard = orgConfig?.dashboard || {};
  const setTarget = features.set_target || {};

  const [targetEnabled, setTargetEnabled] = useState(!!setTarget.enabled);
  const [targetModules, setTargetModules] = useState(setTarget.modules || []);
  const [customDashboard, setCustomDashboard] = useState(dashboard.type === 'custom');

  const toggleModule = (code) =>
    setTargetModules(prev => prev.includes(code) ? prev.filter(s => s !== code) : [...prev, code]);

  const handleSave = () => {
    onSave({
      features: { set_target: { enabled: targetEnabled, modules: targetModules } },
      dashboard: { type: customDashboard ? 'custom' : 'standard' },
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
      </div>
    </Card>
  );
}
