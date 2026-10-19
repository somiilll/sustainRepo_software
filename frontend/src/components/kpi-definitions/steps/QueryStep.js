/**
 * Step 3: Query Builder
 * Filters, dimensions, and aggregation configuration (with dynamic field dropdown)
 */
import React, { useState } from 'react';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Checkbox } from '../../ui/checkbox';
import { AGGREGATION_TYPES, FILTER_OPERATORS, DIMENSION_OPTIONS } from '../constants';
import { Plus, Trash2, Filter, Layers } from 'lucide-react';

const QueryStep = ({ formData, setFormData, errors, categoryData }) => {
  const [newFilter, setNewFilter] = useState({ field_key: '', operator: '=', value: '' });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

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

  const addFilter = () => {
    if (!newFilter.field_key || !newFilter.value) return;
    
    const filters = [...(formData.filters || []), { ...newFilter }];
    handleChange('filters', filters);
    setNewFilter({ field_key: '', operator: '=', value: '' });
  };

  const removeFilter = (index) => {
    const filters = formData.filters?.filter((_, i) => i !== index) || [];
    handleChange('filters', filters);
  };

  const toggleDimension = (dimension) => {
    const current = formData.dimensions || [];
    const updated = current.includes(dimension)
      ? current.filter(d => d !== dimension)
      : [...current, dimension];
    handleChange('dimensions', updated);
  };

  // Get field label by key
  const getFieldLabel = (key) => {
    const field = availableFields.find(f => f.key === key);
    return field ? field.label : key;
  };

  return (
    <div className="space-y-8">
      {/* Aggregation Type */}
      <div>
        <Label className="text-sm font-medium mb-3 block">
          Aggregation Method <span className="text-red-500">*</span>
        </Label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Object.entries(AGGREGATION_TYPES).map(([key, { label, description }]) => {
            const isSelected = formData.aggregation_type === key;
            const isDisabled = key === 'formula'; // Formula disabled for now
            
            return (
              <button
                key={key}
                type="button"
                onClick={() => !isDisabled && handleChange('aggregation_type', key)}
                disabled={isDisabled}
                className={`
                  p-3 rounded-lg border-2 text-left transition-all
                  ${isSelected 
                    ? 'border-blue-500 bg-blue-50' 
                    : isDisabled
                      ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                      : 'border-gray-200 hover:border-gray-300'
                  }
                `}
                data-testid={`kpi-aggregation-${key}`}
              >
                <p className={`font-medium text-sm ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                  {label}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters Section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-gray-500" />
          <Label className="text-sm font-medium">Filters (Optional)</Label>
        </div>
        
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4">
          {/* Existing Filters */}
          {formData.filters?.length > 0 && (
            <div className="space-y-2">
              {formData.filters.map((filter, index) => (
                <div 
                  key={index} 
                  className="flex items-center gap-2 bg-white p-2 rounded border"
                >
                  <code className="text-sm bg-slate-100 px-2 py-1 rounded">
                    {getFieldLabel(filter.field_key)}
                  </code>
                  <span className="text-gray-500 text-sm">
                    {FILTER_OPERATORS[filter.operator] || filter.operator}
                  </span>
                  <code className="text-sm bg-slate-100 px-2 py-1 rounded">
                    {String(filter.value)}
                  </code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFilter(index)}
                    className="ml-auto text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add New Filter */}
          <div className="flex flex-wrap items-end gap-2">
            {/* Field Dropdown */}
            <div className="flex-1 min-w-[180px]">
              <Label className="text-xs text-gray-600">Field</Label>
              <Select
                value={newFilter.field_key}
                onValueChange={(value) => setNewFilter(prev => ({ ...prev, field_key: value }))}
                disabled={availableFields.length === 0}
              >
                <SelectTrigger className="mt-1" data-testid="kpi-filter-field-select">
                  <SelectValue 
                    placeholder={
                      availableFields.length === 0 
                        ? "Select subcategory first" 
                        : "Select field"
                    } 
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableFields.map((field) => (
                    <SelectItem key={field.key} value={field.key}>
                      {field.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Operator Dropdown */}
            <div className="w-[140px]">
              <Label className="text-xs text-gray-600">Operator</Label>
              <Select
                value={newFilter.operator}
                onValueChange={(value) => setNewFilter(prev => ({ ...prev, operator: value }))}
              >
                <SelectTrigger className="mt-1" data-testid="kpi-filter-operator">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FILTER_OPERATORS).map(([op, label]) => (
                    <SelectItem key={op} value={op}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Value Input */}
            <div className="flex-1 min-w-[150px]">
              <Label className="text-xs text-gray-600">Value</Label>
              <Input
                value={newFilter.value}
                onChange={(e) => setNewFilter(prev => ({ ...prev, value: e.target.value }))}
                placeholder="e.g., scope1"
                className="mt-1"
                data-testid="kpi-filter-value"
              />
            </div>

            {/* Add Button */}
            <Button
              type="button"
              variant="outline"
              onClick={addFilter}
              disabled={!newFilter.field_key || !newFilter.value}
              className="shrink-0"
              data-testid="kpi-add-filter"
            >
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>

          {availableFields.length === 0 && (
            <p className="text-xs text-amber-600">
              Select a subcategory in Step 1 to enable field-based filtering
            </p>
          )}
        </div>
      </div>

      {/* Dimensions Section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-gray-500" />
          <Label className="text-sm font-medium">Dimensions (Optional)</Label>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Select dimensions for grouping data in dashboards and reports
        </p>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {DIMENSION_OPTIONS.map(({ value, label }) => {
            const isChecked = formData.dimensions?.includes(value);
            
            return (
              <label
                key={value}
                className={`
                  flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all
                  ${isChecked 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:border-gray-300'
                  }
                `}
              >
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={() => toggleDimension(value)}
                  data-testid={`kpi-dimension-${value}`}
                />
                <span className={`text-sm ${isChecked ? 'text-blue-900 font-medium' : 'text-gray-700'}`}>
                  {label}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default QueryStep;
