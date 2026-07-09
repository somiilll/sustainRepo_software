/**
 * Step 4: Units
 * Unit configuration and display settings
 */
import React from 'react';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Switch } from '../../ui/switch';
import { OUTPUT_TYPES, UNIT_PRESETS } from '../constants';
import { Hash, Percent, DollarSign, ToggleLeft, Type, Star } from 'lucide-react';

const OUTPUT_ICONS = {
  number: Hash,
  percentage: Percent,
  currency: DollarSign,
  boolean: ToggleLeft,
  text: Type,
  rating: Star,
};

const UnitsStep = ({ formData, setFormData, errors }) => {
  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleUnitConfigChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      unit_config: {
        ...(prev.unit_config || {}),
        [field]: value
      }
    }));
  };

  const handleDisplayConfigChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      display_config: {
        ...(prev.display_config || {}),
        [field]: value
      }
    }));
  };

  const selectedOutputType = formData.output_type || 'number';

  // Get relevant unit presets based on section/category
  const getRelevantPresets = () => {
    const section = formData.section;
    if (section === 'environment') {
      return ['emissions', 'energy', 'mass', 'volume', 'intensity'];
    }
    return ['count', 'percentage', 'currency'];
  };

  return (
    <div className="space-y-8">
      {/* Output Type */}
      <div>
        <Label className="text-sm font-medium mb-3 block">
          Output Type <span className="text-red-500">*</span>
        </Label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Object.entries(OUTPUT_TYPES).map(([key, { label }]) => {
            const Icon = OUTPUT_ICONS[key] || Hash;
            const isSelected = selectedOutputType === key;
            
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleChange('output_type', key)}
                className={`
                  p-3 rounded-lg border-2 text-left transition-all flex items-center gap-3
                  ${isSelected 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:border-gray-300'
                  }
                `}
                data-testid={`kpi-output-${key}`}
              >
                <Icon className={`w-5 h-5 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
                <span className={`font-medium text-sm ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Unit Configuration */}
      {selectedOutputType !== 'boolean' && selectedOutputType !== 'text' && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 space-y-4">
          <h4 className="font-medium text-slate-900">Unit Configuration</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Default Unit */}
            <div>
              <Label className="text-sm font-medium">Default Unit</Label>
              <Input
                value={formData.unit_config?.default_unit || ''}
                onChange={(e) => handleUnitConfigChange('default_unit', e.target.value)}
                placeholder="e.g., tCO2e, kWh, count"
                className="mt-1"
                data-testid="kpi-default-unit"
              />
            </div>

            {/* Unit Conversion Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Allow Unit Conversion</Label>
                <p className="text-xs text-gray-500">Enable converting between supported units</p>
              </div>
              <Switch
                checked={formData.unit_config?.allow_unit_conversion || false}
                onCheckedChange={(checked) => handleUnitConfigChange('allow_unit_conversion', checked)}
                data-testid="kpi-unit-conversion"
              />
            </div>

            {/* Supported Units */}
            <div className="md:col-span-2">
              <Label className="text-sm font-medium">Supported Units</Label>
              <Input
                value={formData.unit_config?.supported_units?.join(', ') || ''}
                onChange={(e) => handleUnitConfigChange(
                  'supported_units', 
                  e.target.value.split(',').map(u => u.trim()).filter(Boolean)
                )}
                placeholder="e.g., tCO2e, kgCO2e, MtCO2e (comma-separated)"
                className="mt-1"
                data-testid="kpi-supported-units"
              />
              
              {/* Quick Add Presets */}
              <div className="mt-2 flex flex-wrap gap-2">
                {getRelevantPresets().map(presetKey => (
                  <button
                    key={presetKey}
                    type="button"
                    onClick={() => {
                      const preset = UNIT_PRESETS[presetKey] || [];
                      const current = formData.unit_config?.supported_units || [];
                      const merged = [...new Set([...current, ...preset])];
                      handleUnitConfigChange('supported_units', merged);
                    }}
                    className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                  >
                    + {presetKey}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Display Configuration */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 space-y-4">
        <h4 className="font-medium text-slate-900">Display Settings</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Decimal Places */}
          <div>
            <Label className="text-sm font-medium">Decimal Places</Label>
            <Select
              value={String(formData.display_config?.decimal_places ?? 2)}
              onValueChange={(value) => handleDisplayConfigChange('decimal_places', parseInt(value))}
            >
              <SelectTrigger className="mt-1" data-testid="kpi-decimal-places">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[0, 1, 2, 3, 4, 5].map(n => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Display Order */}
          <div>
            <Label className="text-sm font-medium">Display Order</Label>
            <Input
              type="number"
              min="0"
              value={formData.display_config?.display_order ?? 0}
              onChange={(e) => handleDisplayConfigChange('display_order', parseInt(e.target.value) || 0)}
              className="mt-1"
              data-testid="kpi-display-order"
            />
          </div>

          {/* Color */}
          <div>
            <Label className="text-sm font-medium">Color (Optional)</Label>
            <Input
              value={formData.display_config?.color || ''}
              onChange={(e) => handleDisplayConfigChange('color', e.target.value)}
              placeholder="e.g., #10B981"
              className="mt-1"
              data-testid="kpi-color"
            />
          </div>

          {/* Icon */}
          <div>
            <Label className="text-sm font-medium">Icon (Optional)</Label>
            <Input
              value={formData.display_config?.icon || ''}
              onChange={(e) => handleDisplayConfigChange('icon', e.target.value)}
              placeholder="e.g., activity, zap"
              className="mt-1"
              data-testid="kpi-icon"
            />
            <p className="text-xs text-gray-500 mt-1">Lucide icon name</p>
          </div>

          {/* Display Name Override */}
          <div className="md:col-span-2">
            <Label className="text-sm font-medium">Display Name Override</Label>
            <Input
              value={formData.display_config?.display_name || ''}
              onChange={(e) => handleDisplayConfigChange('display_name', e.target.value)}
              placeholder="Optional custom display name"
              className="mt-1"
              data-testid="kpi-display-name"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default UnitsStep;
