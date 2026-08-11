import React, { useState } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Save } from 'lucide-react';
import { MODULE_MODES } from './constants';

export function ModulesTab({ orgConfig, defaultModules, onSave, saving }) {
  const currentEnabled = orgConfig?.modules?.enabled;
  const customs = orgConfig?.categories?.custom || [];
  const hasCustom = customs.length > 0;

  const currentMode = (() => {
    if (currentEnabled === null || currentEnabled === undefined) return hasCustom ? 'default_custom' : 'default';
    const defaultCodes = new Set(defaultModules.map(m => m.module_code));
    const hasDefaultEnabled = Array.isArray(currentEnabled) && currentEnabled.some(e => defaultCodes.has(e));
    if (hasDefaultEnabled && hasCustom) return 'default_custom';
    if (!hasDefaultEnabled && hasCustom) return 'custom';
    return 'default';
  })();

  const [mode, setMode] = useState(currentMode);
  const [enabledDefaults, setEnabledDefaults] = useState(
    Array.isArray(currentEnabled)
      ? new Set(currentEnabled.filter(e => defaultModules.some(m => m.module_code === e)))
      : new Set(defaultModules.map(m => m.module_code))
  );

  const toggleDefault = (code) =>
    setEnabledDefaults(prev => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n; });

  const handleSave = () => {
    if (mode === 'default') onSave({ modules: { enabled: null } });
    else if (mode === 'default_custom') {
      const customCodes = [...new Set(customs.map(c => c.module_code))];
      onSave({ modules: { enabled: [...enabledDefaults, ...customCodes.filter(c => !enabledDefaults.has(c))] } });
    } else {
      const customCodes = [...new Set(customs.map(c => c.module_code))];
      onSave({ modules: { enabled: customCodes.length > 0 ? customCodes : [] } });
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

      <div className="space-y-3 mb-6">
        <Label className="text-sm font-medium">Module Mode</Label>
        <div className="grid gap-2 sm:grid-cols-3">
          {MODULE_MODES.map(m => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={`p-3 rounded-lg border-2 text-left transition-all ${mode === m.value ? 'border-emerald-500 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'}`}
              data-testid={`mode-${m.value}`}
            >
              <div className="font-medium text-sm">{m.label}</div>
              <div className="text-xs text-stone-500 mt-0.5">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {(mode === 'default' || mode === 'default_custom') && (
        <div>
          <Label className="text-sm font-medium mb-2 block">
            Default Modules {mode === 'default' ? '(all enabled)' : '(select which to include)'}
          </Label>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {defaultModules.map(mod => (
              <label key={mod.module_code} className="flex items-center gap-3 p-3 rounded-lg border border-stone-200 cursor-pointer hover:bg-stone-50">
                <Switch
                  checked={mode === 'default' || enabledDefaults.has(mod.module_code)}
                  onCheckedChange={() => toggleDefault(mod.module_code)}
                  disabled={mode === 'default'}
                />
                <div>
                  <span className="text-sm font-medium">{mod.module_name}</span>
                  <span className="text-xs text-stone-400 ml-1">({mod.subcategories?.length || 0})</span>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {mode === 'custom' && (
        <p className="text-sm text-stone-500 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Custom Only — only custom categories (configured in Custom Categories tab) will appear. No global defaults.
        </p>
      )}
    </Card>
  );
}
