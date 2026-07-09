/**
 * Step 2: Data Source
 * Source type selection and configuration (with dynamic field dropdown)
 */
import React from 'react';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { SOURCE_TYPES } from '../constants';
import { Database, FileQuestion, Edit3, Calculator, Globe } from 'lucide-react';

const SOURCE_ICONS = {
  records: Database,
  framework_question: FileQuestion,
  manual: Edit3,
  calculated: Calculator,
  external_api: Globe,
};

const SourceStep = ({ formData, setFormData, errors, categoryData }) => {
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

  // Get fields for the selected subcategory from categoryData
  const getFieldsForSubcategory = () => {
    if (!categoryData?.hierarchy || !formData.category_name || !formData.subcategory) {
      return [];
    }
    const categoryHierarchy = categoryData.hierarchy[formData.category_name];
    if (!categoryHierarchy || !categoryHierarchy[formData.subcategory]) {
      return [];
    }
    return categoryHierarchy[formData.subcategory].fields || [];
  };

  const availableFields = getFieldsForSubcategory();

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
          
          {/* Show selected section/category/subcategory from Step 1 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 bg-white rounded border border-slate-200">
            <div>
              <p className="text-xs text-gray-500">Section</p>
              <p className="font-medium text-sm capitalize">{formData.section || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Category</p>
              <p className="font-medium text-sm">{formData.category_name || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Subcategory</p>
              <p className="font-medium text-sm">{formData.subcategory || '-'}</p>
            </div>
          </div>

          {/* Value Field Dropdown */}
          <div>
            <Label className="text-sm font-medium">Value Field to Aggregate</Label>
            <Select
              value={formData.value_field || ''}
              onValueChange={(value) => {
                handleChange('value_field', value);
                handleSourceConfigChange('value_field', value);
              }}
              disabled={availableFields.length === 0}
            >
              <SelectTrigger 
                className="mt-1"
                data-testid="kpi-value-field-select"
              >
                <SelectValue 
                  placeholder={
                    availableFields.length === 0 
                      ? "Select subcategory in Step 1 first" 
                      : "Select field to aggregate"
                  } 
                />
              </SelectTrigger>
              <SelectContent>
                {availableFields.map((field) => (
                  <SelectItem key={field.key} value={field.key}>
                    <div className="flex items-center justify-between w-full">
                      <span>{field.label}</span>
                      {field.unit && (
                        <span className="text-xs text-gray-400 ml-2">({field.unit})</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">
              Field from records to aggregate (e.g., quantity, total_emissions)
            </p>
          </div>

          {/* Show selected field info */}
          {formData.value_field && availableFields.length > 0 && (
            <div className="p-3 bg-blue-50 rounded border border-blue-200">
              {(() => {
                const selectedField = availableFields.find(f => f.key === formData.value_field);
                if (!selectedField) return null;
                return (
                  <div className="text-sm">
                    <p className="font-medium text-blue-900">{selectedField.label}</p>
                    <p className="text-blue-700 text-xs mt-1">
                      Field key: <code className="bg-blue-100 px-1 rounded">{selectedField.key}</code>
                      {selectedField.unit && <span className="ml-2">Unit: {selectedField.unit}</span>}
                    </p>
                  </div>
                );
              })()}
            </div>
          )}
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
