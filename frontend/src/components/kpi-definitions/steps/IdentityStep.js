/**
 * Step 1: Identity
 * Metric name, description, section, category hierarchy
 */
import React from 'react';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { ESG_SECTIONS } from '../constants';

const IdentityStep = ({ formData, setFormData, errors }) => {
  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Metric Name */}
        <div className="md:col-span-2">
          <Label htmlFor="metric_name" className="text-sm font-medium">
            Metric Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="metric_name"
            value={formData.metric_name || ''}
            onChange={(e) => handleChange('metric_name', e.target.value)}
            placeholder="e.g., Total GHG Emissions Scope 1"
            className={`mt-1 ${errors?.metric_name ? 'border-red-500' : ''}`}
            data-testid="kpi-metric-name"
          />
          {errors?.metric_name && (
            <p className="text-red-500 text-xs mt-1">{errors.metric_name}</p>
          )}
        </div>

        {/* Short Name */}
        <div>
          <Label htmlFor="short_name" className="text-sm font-medium">
            Short Name
          </Label>
          <Input
            id="short_name"
            value={formData.short_name || ''}
            onChange={(e) => handleChange('short_name', e.target.value)}
            placeholder="e.g., Scope 1 Emissions"
            className="mt-1"
            data-testid="kpi-short-name"
          />
          <p className="text-gray-500 text-xs mt-1">Used in compact displays</p>
        </div>

        {/* Section */}
        <div>
          <Label htmlFor="section" className="text-sm font-medium">
            ESG Section <span className="text-red-500">*</span>
          </Label>
          <Select
            value={formData.section || ''}
            onValueChange={(value) => handleChange('section', value)}
          >
            <SelectTrigger 
              className={`mt-1 ${errors?.section ? 'border-red-500' : ''}`}
              data-testid="kpi-section-select"
            >
              <SelectValue placeholder="Select section" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ESG_SECTIONS).map(([key, { label }]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors?.section && (
            <p className="text-red-500 text-xs mt-1">{errors.section}</p>
          )}
        </div>

        {/* Category Name */}
        <div>
          <Label htmlFor="category_name" className="text-sm font-medium">
            Category
          </Label>
          <Input
            id="category_name"
            value={formData.category_name || ''}
            onChange={(e) => handleChange('category_name', e.target.value)}
            placeholder="e.g., GHG Emissions"
            className="mt-1"
            data-testid="kpi-category-name"
          />
        </div>

        {/* Subcategory */}
        <div>
          <Label htmlFor="subcategory" className="text-sm font-medium">
            Subcategory
          </Label>
          <Input
            id="subcategory"
            value={formData.subcategory || ''}
            onChange={(e) => handleChange('subcategory', e.target.value)}
            placeholder="e.g., Direct Emissions"
            className="mt-1"
            data-testid="kpi-subcategory"
          />
        </div>

        {/* Description */}
        <div className="md:col-span-2">
          <Label htmlFor="description" className="text-sm font-medium">
            Description
          </Label>
          <Textarea
            id="description"
            value={formData.description || ''}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="Describe what this KPI measures and how it should be used..."
            className="mt-1 min-h-[100px]"
            data-testid="kpi-description"
          />
        </div>

        {/* Tags */}
        <div className="md:col-span-2">
          <Label htmlFor="tags" className="text-sm font-medium">
            Tags
          </Label>
          <Input
            id="tags"
            value={formData.tags?.join(', ') || ''}
            onChange={(e) => handleChange('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
            placeholder="e.g., emissions, scope1, ghg (comma-separated)"
            className="mt-1"
            data-testid="kpi-tags"
          />
          <p className="text-gray-500 text-xs mt-1">Comma-separated tags for filtering</p>
        </div>
      </div>

      {/* Auto-generated Code Preview */}
      {formData.metric_name && formData.section && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <p className="text-sm text-slate-600">
            <span className="font-medium">Auto-generated Code:</span>{' '}
            <code className="bg-slate-100 px-2 py-1 rounded text-sm">
              {ESG_SECTIONS[formData.section]?.prefix || 'ESG'}_
              {formData.metric_name.toUpperCase().replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, '_').slice(0, 30)}
            </code>
          </p>
        </div>
      )}
    </div>
  );
};

export default IdentityStep;
