/**
 * Step 2: Data Source
 * Source type selection and configuration
 */
import React from 'react';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { SOURCE_TYPES, ESG_SECTIONS } from '../constants';
import { Database, FileQuestion, Edit3, Calculator, Globe } from 'lucide-react';

const SOURCE_ICONS = {
  records: Database,
  framework_question: FileQuestion,
  manual: Edit3,
  calculated: Calculator,
  external_api: Globe,
};

const SourceStep = ({ formData, setFormData, errors }) => {
  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSourceConfigChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      source_config: {
        ...(prev.source_config || {}),
        records: {
          ...(prev.source_config?.records || {}),
          [field]: value
        }
      }
    }));
  };

  const selectedSourceType = formData.source_type || 'records';

  return (
    <div className="space-y-6">
      {/* Source Type Selection */}
      <div>
        <Label className="text-sm font-medium mb-3 block">
          Data Source Type <span className="text-red-500">*</span>
        </Label>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(SOURCE_TYPES).map(([key, { label, description }]) => {
            const Icon = SOURCE_ICONS[key] || Database;
            const isSelected = selectedSourceType === key;
            const isDisabled = !['records', 'manual'].includes(key); // Only records & manual enabled for now
            
            return (
              <button
                key={key}
                type="button"
                onClick={() => !isDisabled && handleChange('source_type', key)}
                disabled={isDisabled}
                className={`
                  p-4 rounded-lg border-2 text-left transition-all
                  ${isSelected 
                    ? 'border-blue-500 bg-blue-50' 
                    : isDisabled 
                      ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }
                `}
                data-testid={`kpi-source-${key}`}
              >
                <div className="flex items-start gap-3">
                  <Icon className={`w-5 h-5 mt-0.5 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
                  <div>
                    <p className={`font-medium text-sm ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                      {label}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">{description}</p>
                    {isDisabled && (
                      <p className="text-xs text-amber-600 mt-1">Coming soon</p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Records Source Configuration */}
      {selectedSourceType === 'records' && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 space-y-4">
          <h4 className="font-medium text-slate-900">Records Configuration</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Source Section */}
            <div>
              <Label className="text-sm font-medium">Source Section</Label>
              <Select
                value={formData.source_config?.records?.section || formData.section || ''}
                onValueChange={(value) => handleSourceConfigChange('section', value)}
              >
                <SelectTrigger className="mt-1" data-testid="kpi-source-section">
                  <SelectValue placeholder="Select section" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ESG_SECTIONS).map(([key, { label }]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Value Field */}
            <div>
              <Label className="text-sm font-medium">Value Field to Aggregate</Label>
              <Input
                value={formData.source_config?.records?.value_field || formData.value_field || ''}
                onChange={(e) => {
                  handleSourceConfigChange('value_field', e.target.value);
                  handleChange('value_field', e.target.value);
                }}
                placeholder="e.g., quantity, co2e_emissions"
                className="mt-1"
                data-testid="kpi-value-field"
              />
              <p className="text-xs text-gray-500 mt-1">
                Field from records to aggregate (e.g., quantity, total_emissions)
              </p>
            </div>

            {/* Category ID (optional) */}
            <div className="md:col-span-2">
              <Label className="text-sm font-medium">Category ID (Optional)</Label>
              <Input
                value={formData.source_config?.records?.category_id || ''}
                onChange={(e) => handleSourceConfigChange('category_id', e.target.value)}
                placeholder="Specific category ID to filter by"
                className="mt-1"
                data-testid="kpi-category-id"
              />
              <p className="text-xs text-gray-500 mt-1">
                Leave empty to aggregate across all categories in the section
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Manual Source Info */}
      {selectedSourceType === 'manual' && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-5">
          <h4 className="font-medium text-amber-900">Manual Input</h4>
          <p className="text-sm text-amber-800 mt-2">
            This KPI will accept manually entered values. No automatic data aggregation will occur.
            Users will input values directly when creating targets or reports.
          </p>
        </div>
      )}
    </div>
  );
};

export default SourceStep;
