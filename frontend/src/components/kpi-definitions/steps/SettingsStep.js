/**
 * Step 5: Settings
 * Visibility flags, supported scopes, and status
 */
import React from 'react';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { Checkbox } from '../../ui/checkbox';
import { KPI_STATUSES, DEFAULT_VISIBILITY } from '../constants';
import { Eye, Target, BarChart3, FileText, Activity, Building2, MapPin } from 'lucide-react';

const VISIBILITY_OPTIONS = [
  { key: 'dashboard_enabled', label: 'Dashboards', icon: BarChart3, description: 'Show in dashboard widgets' },
  { key: 'reports_enabled', label: 'Reports', icon: FileText, description: 'Include in generated reports' },
  { key: 'tracking_enabled', label: 'Tracking', icon: Activity, description: 'Enable progress tracking' },
  { key: 'target_enabled', label: 'Targets', icon: Target, description: 'Allow creating targets' },
  { key: 'analytics_enabled', label: 'Analytics', icon: BarChart3, description: 'Include in analytics' },
];

const SCOPE_OPTIONS = [
  { value: 'organization', label: 'Organization Level', icon: Building2, description: 'Aggregate across entire org' },
  { value: 'facility', label: 'Facility Level', icon: MapPin, description: 'Track per facility' },
];

const SettingsStep = ({ formData, setFormData, errors }) => {
  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleVisibilityChange = (key, checked) => {
    setFormData(prev => ({
      ...prev,
      visibility: {
        ...(prev.visibility || DEFAULT_VISIBILITY),
        [key]: checked
      }
    }));
  };

  const toggleScope = (scope) => {
    const current = formData.supported_scopes || ['organization', 'facility'];
    const updated = current.includes(scope)
      ? current.filter(s => s !== scope)
      : [...current, scope];
    
    // Ensure at least one scope is selected
    if (updated.length === 0) return;
    
    handleChange('supported_scopes', updated);
  };

  const visibility = formData.visibility || DEFAULT_VISIBILITY;

  return (
    <div className="space-y-8">
      {/* Visibility Configuration */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Eye className="w-5 h-5 text-gray-500" />
          <Label className="text-base font-medium">Feature Visibility</Label>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Control where this KPI appears across the platform
        </p>
        
        <div className="space-y-3">
          {VISIBILITY_OPTIONS.map(({ key, label, icon: Icon, description }) => (
            <div
              key={key}
              className={`
                flex items-center justify-between p-4 rounded-lg border transition-all
                ${visibility[key] 
                  ? 'border-blue-200 bg-blue-50' 
                  : 'border-gray-200 bg-white'
                }
              `}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-5 h-5 ${visibility[key] ? 'text-blue-600' : 'text-gray-400'}`} />
                <div>
                  <p className={`font-medium text-sm ${visibility[key] ? 'text-blue-900' : 'text-gray-900'}`}>
                    {label}
                  </p>
                  <p className="text-xs text-gray-500">{description}</p>
                </div>
              </div>
              <Switch
                checked={visibility[key]}
                onCheckedChange={(checked) => handleVisibilityChange(key, checked)}
                data-testid={`kpi-visibility-${key}`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Supported Scopes */}
      <div>
        <Label className="text-base font-medium mb-4 block">Supported Scopes</Label>
        <p className="text-sm text-gray-500 mb-4">
          Define at which levels this KPI can be measured
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SCOPE_OPTIONS.map(({ value, label, icon: Icon, description }) => {
            const isChecked = formData.supported_scopes?.includes(value) ?? true;
            
            return (
              <label
                key={value}
                className={`
                  flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all
                  ${isChecked 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:border-gray-300'
                  }
                `}
              >
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={() => toggleScope(value)}
                  className="mt-0.5"
                  data-testid={`kpi-scope-${value}`}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${isChecked ? 'text-blue-600' : 'text-gray-400'}`} />
                    <span className={`font-medium text-sm ${isChecked ? 'text-blue-900' : 'text-gray-900'}`}>
                      {label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{description}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Status */}
      <div>
        <Label className="text-base font-medium mb-4 block">Status</Label>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(KPI_STATUSES).map(([key, { label, color }]) => {
            const isSelected = formData.status === key;
            const isDisabled = key === 'archived'; // Can't directly set to archived from create/edit
            
            return (
              <button
                key={key}
                type="button"
                onClick={() => !isDisabled && handleChange('status', key)}
                disabled={isDisabled}
                className={`
                  p-3 rounded-lg border-2 text-center transition-all
                  ${isSelected 
                    ? 'border-blue-500 bg-blue-50' 
                    : isDisabled
                      ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                      : 'border-gray-200 hover:border-gray-300'
                  }
                `}
                data-testid={`kpi-status-${key}`}
              >
                <span className={`inline-block px-2 py-1 rounded text-xs font-medium border ${color}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Only <strong>Active</strong> KPIs will be available for targets and dashboards
        </p>
      </div>

      {/* Summary Preview */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-5">
        <h4 className="font-medium text-slate-900 mb-3">Configuration Summary</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Name</p>
            <p className="font-medium">{formData.metric_name || '-'}</p>
          </div>
          <div>
            <p className="text-gray-500">Section</p>
            <p className="font-medium capitalize">{formData.section || '-'}</p>
          </div>
          <div>
            <p className="text-gray-500">Source</p>
            <p className="font-medium capitalize">{formData.source_type?.replace('_', ' ') || '-'}</p>
          </div>
          <div>
            <p className="text-gray-500">Aggregation</p>
            <p className="font-medium capitalize">{formData.aggregation_type || '-'}</p>
          </div>
          <div>
            <p className="text-gray-500">Output Type</p>
            <p className="font-medium capitalize">{formData.output_type || '-'}</p>
          </div>
          <div>
            <p className="text-gray-500">Status</p>
            <p className="font-medium capitalize">{formData.status || 'draft'}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsStep;
