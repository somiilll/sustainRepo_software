/**
 * Step 1: Identity
 * Metric name, description, section, category hierarchy (with dynamic dropdowns)
 */
import React, { useState, useEffect } from 'react';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { ESG_SECTIONS } from '../constants';
import { Loader2 } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const IdentityStep = ({ formData, setFormData, errors, categoryData, setCategoryData }) => {
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Fetch categories when section changes
  useEffect(() => {
    const fetchCategories = async () => {
      if (!formData.section) {
        setCategoryData({ categories: [], hierarchy: {} });
        return;
      }

      setIsLoadingCategories(true);
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(
          `${API_URL}/api/esg-kpi-definitions/lookup/categories?section=${formData.section}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (response.ok) {
          const data = await response.json();
          setCategoryData(data);
        }
      } catch (error) {
        console.error('Error fetching categories:', error);
      } finally {
        setIsLoadingCategories(false);
      }
    };

    fetchCategories();
  }, [formData.section, setCategoryData]);

  // Reset category/subcategory when section changes
  const handleSectionChange = (value) => {
    setFormData(prev => ({
      ...prev,
      section: value,
      category_name: '',
      subcategory: ''
    }));
  };

  // Reset subcategory when category changes
  const handleCategoryChange = (value) => {
    setFormData(prev => ({
      ...prev,
      category_name: value,
      subcategory: ''
    }));
  };

  // Get subcategories for selected category
  const getSubcategories = () => {
    if (!formData.category_name || !categoryData?.hierarchy) return [];
    const categoryHierarchy = categoryData.hierarchy[formData.category_name];
    return categoryHierarchy ? Object.keys(categoryHierarchy) : [];
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
            onValueChange={handleSectionChange}
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

        {/* Category - Dynamic Dropdown */}
        <div>
          <Label htmlFor="category_name" className="text-sm font-medium">
            Category
          </Label>
          <Select
            value={formData.category_name || ''}
            onValueChange={handleCategoryChange}
            disabled={!formData.section || isLoadingCategories}
          >
            <SelectTrigger 
              className="mt-1"
              data-testid="kpi-category-select"
            >
              {isLoadingCategories ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading...</span>
                </div>
              ) : (
                <SelectValue placeholder={formData.section ? "Select category" : "Select section first"} />
              )}
            </SelectTrigger>
            <SelectContent>
              {categoryData?.categories?.map((cat) => (
                <SelectItem key={cat.name} value={cat.name}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Subcategory - Dynamic Dropdown */}
        <div>
          <Label htmlFor="subcategory" className="text-sm font-medium">
            Subcategory
          </Label>
          <Select
            value={formData.subcategory || ''}
            onValueChange={(value) => handleChange('subcategory', value)}
            disabled={!formData.category_name}
          >
            <SelectTrigger 
              className="mt-1"
              data-testid="kpi-subcategory-select"
            >
              <SelectValue placeholder={formData.category_name ? "Select subcategory" : "Select category first"} />
            </SelectTrigger>
            <SelectContent>
              {getSubcategories().map((subcat) => (
                <SelectItem key={subcat} value={subcat}>{subcat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
