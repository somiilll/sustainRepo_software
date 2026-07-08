/**
 * ESGTargetForm - Multi-step wizard for creating/editing ESG targets
 * 
 * Steps:
 * 1. KPI Selection (Section → Category → Subcategory → Metric)
 * 2. Scope & Period (Organization/Facility, FY/CY, Period)
 * 3. Target Definition (Type, Goal, Values, Baseline)
 * 4. Tracking & Thresholds (Mode, Values, Optional thresholds)
 */
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { 
  ChevronRight, ChevronLeft, Target, Building2, Calendar, 
  TrendingUp, AlertTriangle, Check
} from 'lucide-react';
import { generateReportingYears, getCurrentReportingYear } from '../utils/reportingYearUtils';

const API = process.env.REACT_APP_BACKEND_URL;

const STEPS = [
  { id: 'kpi', title: 'KPI Selection', icon: Target },
  { id: 'scope', title: 'Scope & Period', icon: Building2 },
  { id: 'target', title: 'Target Definition', icon: TrendingUp },
  { id: 'tracking', title: 'Tracking & Thresholds', icon: Calendar },
];

const TARGET_TYPES = [
  { value: 'absolute', label: 'Absolute', description: 'Fixed value (e.g., 500 tCO₂e)' },
  { value: 'percentage', label: 'Percentage', description: 'Percentage value (e.g., 20%)' },
  { value: 'intensity', label: 'Intensity', description: 'Ratio value (e.g., 0.45 tCO₂e/tonne)' },
];

const GOAL_TYPES = [
  { value: 'upper_limit', label: 'Upper Limit (≤)', description: 'Value should not exceed' },
  { value: 'lower_limit', label: 'Lower Limit (≥)', description: 'Value should not go below' },
  { value: 'range', label: 'Range', description: 'Value should be within range' },
  { value: 'exact', label: 'Exact Value', description: 'Value should equal target' },
];

const TRACKING_MODES = [
  { value: 'static', label: 'Static', description: 'One target for entire period' },
  { value: 'monthly', label: 'Monthly', description: 'Monthly target values' },
  { value: 'quarterly', label: 'Quarterly', description: 'Quarterly target values (Q1-Q4)' },
  { value: 'half_yearly', label: 'Half Yearly', description: 'H1 and H2 targets' },
  { value: 'yearly', label: 'Yearly', description: 'Annual target value' },
];

const TRAJECTORIES = [
  { value: 'manual', label: 'Manual', description: 'Set values manually' },
  { value: 'linear', label: 'Linear', description: 'Linear progression (coming soon)', disabled: true },
  { value: 'exponential', label: 'Exponential', description: 'Exponential curve (coming soon)', disabled: true },
];

export default function ESGTargetForm({ section, initialData, onSubmit, onCancel, busy }) {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };
  
  const [currentStep, setCurrentStep] = useState(0);
  const [categories, setCategories] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [reportingYears, setReportingYears] = useState([]);
  const [reportingType, setReportingType] = useState('FY');
  
  // Form data
  const [formData, setFormData] = useState({
    target_name: '',
    description: '',
    category: '',
    subcategory: '',
    sub_subcategory: '',
    metric_key: '',
    metric_label: '',
    unit: '',
    scope_type: 'organization',
    facility_ids: [],
    reporting_type: 'FY',
    reporting_period: '',
    target_type: 'absolute',
    goal_type: 'upper_limit',
    target_value: '',
    minimum_value: '',
    maximum_value: '',
    baseline: { period: '', value: '' },
    tracking_mode: 'static',
    tracking_values: {},
    start_period: '',
    end_period: '',
    trajectory: 'manual',
    thresholds: { green: '', amber: '', red: '' },
    status: 'draft',
    ...initialData
  });

  // Computed hierarchy from categories
  const hierarchy = useMemo(() => {
    const h = {};
    categories.forEach(cat => {
      const catName = cat.category;
      const subcatName = cat.subcategory;
      const subSubcatName = cat.sub_subcategory || '_root';
      
      if (!h[catName]) h[catName] = {};
      if (!h[catName][subcatName]) h[catName][subcatName] = {};
      if (!h[catName][subcatName][subSubcatName]) h[catName][subcatName][subSubcatName] = [];
      
      (cat.field_definitions || []).forEach(field => {
        h[catName][subcatName][subSubcatName].push({
          metric_key: field.key,
          metric_label: field.label,
          unit: field.unit || cat.unit,
          category_id: cat.id
        });
      });
    });
    return h;
  }, [categories]);

  // Fetch categories
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await axios.get(`${API}/api/esg-records/categories/${section}`, { headers });
        setCategories(res.data || []);
      } catch (error) {
        console.error('Failed to fetch categories:', error);
      }
    };
    fetchCategories();
  }, [section, token]);

  // Fetch facilities
  useEffect(() => {
    const fetchFacilities = async () => {
      try {
        const res = await axios.get(`${API}/api/facilities`, { headers });
        setFacilities(res.data || []);
      } catch (error) {
        console.error('Failed to fetch facilities:', error);
      }
    };
    fetchFacilities();
  }, [token]);

  // Initialize reporting years
  useEffect(() => {
    const years = generateReportingYears(reportingType === 'FY' ? 'financial_year' : 'calendar_year', 5);
    setReportingYears(years);
    if (!formData.reporting_period) {
      setFormData(f => ({ ...f, reporting_period: getCurrentReportingYear(reportingType === 'FY' ? 'financial_year' : 'calendar_year') }));
    }
  }, [reportingType]);

  // Update form field
  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Update nested field
  const updateNestedField = (parent, field, value) => {
    setFormData(prev => ({
      ...prev,
      [parent]: { ...prev[parent], [field]: value }
    }));
  };

  // Get available options based on selections
  const availableCategories = Object.keys(hierarchy);
  const availableSubcategories = formData.category ? Object.keys(hierarchy[formData.category] || {}) : [];
  const availableSubSubcategories = formData.subcategory 
    ? Object.keys(hierarchy[formData.category]?.[formData.subcategory] || {}).filter(k => k !== '_root')
    : [];
  const availableMetrics = useMemo(() => {
    if (!formData.category || !formData.subcategory) return [];
    const subSubKey = formData.sub_subcategory || '_root';
    return hierarchy[formData.category]?.[formData.subcategory]?.[subSubKey] || [];
  }, [hierarchy, formData.category, formData.subcategory, formData.sub_subcategory]);

  // Handle metric selection
  const handleMetricSelect = (metricKey) => {
    const metric = availableMetrics.find(m => m.metric_key === metricKey);
    if (metric) {
      updateField('metric_key', metric.metric_key);
      updateField('metric_label', metric.metric_label);
      updateField('unit', metric.unit);
    }
  };

  // Generate tracking period keys
  const getTrackingPeriodKeys = () => {
    const year = formData.reporting_period?.match(/\d{4}/)?.[0] || new Date().getFullYear();
    
    switch (formData.tracking_mode) {
      case 'monthly':
        return Array.from({ length: 12 }, (_, i) => {
          const month = String(i + 1).padStart(2, '0');
          return { key: `${year}-${month}`, label: new Date(year, i).toLocaleString('default', { month: 'short' }) };
        });
      case 'quarterly':
        return ['Q1', 'Q2', 'Q3', 'Q4'].map(q => ({ key: `${year}-${q}`, label: q }));
      case 'half_yearly':
        return ['H1', 'H2'].map(h => ({ key: `${year}-${h}`, label: h }));
      case 'yearly':
        return [{ key: formData.reporting_period, label: formData.reporting_period }];
      default:
        return [];
    }
  };

  // Validation
  const validateStep = (step) => {
    switch (step) {
      case 0: // KPI Selection
        return formData.target_name && formData.category && formData.subcategory && formData.metric_key;
      case 1: // Scope & Period
        if (formData.scope_type === 'facility' && (!formData.facility_ids || formData.facility_ids.length === 0)) {
          return false;
        }
        return formData.reporting_period;
      case 2: // Target Definition
        if (formData.goal_type === 'range') {
          return formData.minimum_value !== '' && formData.maximum_value !== '';
        }
        return formData.target_value !== '';
      case 3: // Tracking
        return true; // Tracking values are optional
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const handleSubmit = () => {
    // Clean up data before submit
    const submitData = {
      ...formData,
      target_value: formData.target_value ? parseFloat(formData.target_value) : null,
      minimum_value: formData.minimum_value ? parseFloat(formData.minimum_value) : null,
      maximum_value: formData.maximum_value ? parseFloat(formData.maximum_value) : null,
      baseline: formData.baseline?.value ? {
        period: formData.baseline.period,
        value: parseFloat(formData.baseline.value)
      } : null,
      thresholds: (formData.thresholds?.green || formData.thresholds?.amber || formData.thresholds?.red) ? {
        green: formData.thresholds.green ? parseFloat(formData.thresholds.green) : null,
        amber: formData.thresholds.amber ? parseFloat(formData.thresholds.amber) : null,
        red: formData.thresholds.red ? parseFloat(formData.thresholds.red) : null,
      } : null,
      tracking_values: Object.keys(formData.tracking_values).length > 0 
        ? Object.fromEntries(Object.entries(formData.tracking_values).map(([k, v]) => [k, parseFloat(v)]))
        : null,
      facility_ids: formData.scope_type === 'facility' ? formData.facility_ids : null,
    };
    
    onSubmit(submitData);
  };

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 0: // KPI Selection
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Target Name *</Label>
                <Input
                  value={formData.target_name}
                  onChange={(e) => updateField('target_name', e.target.value)}
                  placeholder="e.g., Scope 1 Reduction 2025"
                  className="mt-1"
                  data-testid="target-name-input"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Description</Label>
                <Input
                  value={formData.description || ''}
                  onChange={(e) => updateField('description', e.target.value)}
                  placeholder="Optional description"
                  className="mt-1"
                />
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-sm font-medium">Select KPI / Metric *</Label>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-text-muted">Category</Label>
                  <Select value={formData.category} onValueChange={(v) => {
                    updateField('category', v);
                    updateField('subcategory', '');
                    updateField('sub_subcategory', '');
                    updateField('metric_key', '');
                  }}>
                    <SelectTrigger className="mt-1" data-testid="category-select">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCategories.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label className="text-xs text-text-muted">Subcategory</Label>
                  <Select 
                    value={formData.subcategory} 
                    onValueChange={(v) => {
                      updateField('subcategory', v);
                      updateField('sub_subcategory', '');
                      updateField('metric_key', '');
                    }}
                    disabled={!formData.category}
                  >
                    <SelectTrigger className="mt-1" data-testid="subcategory-select">
                      <SelectValue placeholder="Select subcategory" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSubcategories.map(sub => (
                        <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {availableSubSubcategories.length > 0 && (
                <div>
                  <Label className="text-xs text-text-muted">Sub-subcategory</Label>
                  <Select 
                    value={formData.sub_subcategory} 
                    onValueChange={(v) => {
                      updateField('sub_subcategory', v);
                      updateField('metric_key', '');
                    }}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select sub-subcategory (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSubSubcategories.map(sub => (
                        <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {availableMetrics.length > 0 && (
                <div>
                  <Label className="text-xs text-text-muted">Metric / KPI *</Label>
                  <Select value={formData.metric_key} onValueChange={handleMetricSelect}>
                    <SelectTrigger className="mt-1" data-testid="metric-select">
                      <SelectValue placeholder="Select metric" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableMetrics.map(m => (
                        <SelectItem key={m.metric_key} value={m.metric_key}>
                          {m.metric_label} {m.unit && `(${m.unit})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {formData.metric_key && (
                <Card className="p-3 bg-emerald-50 border-emerald-200">
                  <p className="text-sm font-medium text-emerald-800">Selected Metric</p>
                  <p className="text-sm text-emerald-700">{formData.metric_label}</p>
                  {formData.unit && <p className="text-xs text-emerald-600">Unit: {formData.unit}</p>}
                </Card>
              )}
            </div>
          </div>
        );

      case 1: // Scope & Period
        return (
          <div className="space-y-6">
            <div>
              <Label className="text-sm font-medium">Target Scope *</Label>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <Card 
                  className={`p-4 cursor-pointer border-2 transition-colors ${formData.scope_type === 'organization' ? 'border-emerald-500 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'}`}
                  onClick={() => updateField('scope_type', 'organization')}
                >
                  <div className="flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-emerald-600" />
                    <div>
                      <p className="font-medium">Organization</p>
                      <p className="text-xs text-text-muted">Applies to entire organization</p>
                    </div>
                  </div>
                </Card>
                <Card 
                  className={`p-4 cursor-pointer border-2 transition-colors ${formData.scope_type === 'facility' ? 'border-emerald-500 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'}`}
                  onClick={() => updateField('scope_type', 'facility')}
                >
                  <div className="flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-blue-600" />
                    <div>
                      <p className="font-medium">Facility</p>
                      <p className="text-xs text-text-muted">Applies to selected facilities</p>
                    </div>
                  </div>
                </Card>
              </div>
            </div>

            {formData.scope_type === 'facility' && (
              <div>
                <Label className="text-sm font-medium">Select Facilities *</Label>
                <div className="grid grid-cols-2 gap-2 mt-2 max-h-48 overflow-y-auto p-2 border rounded-md">
                  {facilities.map(facility => (
                    <div key={facility.id} className="flex items-center gap-2">
                      <Checkbox
                        id={facility.id}
                        checked={formData.facility_ids?.includes(facility.id)}
                        onCheckedChange={(checked) => {
                          const ids = formData.facility_ids || [];
                          if (checked) {
                            updateField('facility_ids', [...ids, facility.id]);
                          } else {
                            updateField('facility_ids', ids.filter(id => id !== facility.id));
                          }
                        }}
                      />
                      <label htmlFor={facility.id} className="text-sm cursor-pointer">{facility.name}</label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Reporting Type</Label>
                <Select value={formData.reporting_type} onValueChange={(v) => {
                  updateField('reporting_type', v);
                  setReportingType(v);
                }}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FY">Financial Year (FY)</SelectItem>
                    <SelectItem value="CY">Calendar Year (CY)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium">Reporting Period *</Label>
                <Select value={formData.reporting_period} onValueChange={(v) => updateField('reporting_period', v)}>
                  <SelectTrigger className="mt-1" data-testid="period-select">
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    {reportingYears.map(year => (
                      <SelectItem key={year} value={year}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        );

      case 2: // Target Definition
        return (
          <div className="space-y-6">
            <div>
              <Label className="text-sm font-medium">Target Type *</Label>
              <div className="grid grid-cols-3 gap-3 mt-2">
                {TARGET_TYPES.map(type => (
                  <Card 
                    key={type.value}
                    className={`p-3 cursor-pointer border-2 transition-colors ${formData.target_type === type.value ? 'border-emerald-500 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'}`}
                    onClick={() => updateField('target_type', type.value)}
                  >
                    <p className="font-medium text-sm">{type.label}</p>
                    <p className="text-xs text-text-muted">{type.description}</p>
                  </Card>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Goal Type *</Label>
              <div className="grid grid-cols-2 gap-3 mt-2">
                {GOAL_TYPES.map(goal => (
                  <Card 
                    key={goal.value}
                    className={`p-3 cursor-pointer border-2 transition-colors ${formData.goal_type === goal.value ? 'border-emerald-500 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'}`}
                    onClick={() => updateField('goal_type', goal.value)}
                  >
                    <p className="font-medium text-sm">{goal.label}</p>
                    <p className="text-xs text-text-muted">{goal.description}</p>
                  </Card>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Target Value *</Label>
              {formData.goal_type === 'range' ? (
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div>
                    <Label className="text-xs text-text-muted">Minimum</Label>
                    <Input
                      type="number"
                      value={formData.minimum_value}
                      onChange={(e) => updateField('minimum_value', e.target.value)}
                      placeholder="Min value"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-text-muted">Maximum</Label>
                    <Input
                      type="number"
                      value={formData.maximum_value}
                      onChange={(e) => updateField('maximum_value', e.target.value)}
                      placeholder="Max value"
                      className="mt-1"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 mt-2">
                  <Input
                    type="number"
                    value={formData.target_value}
                    onChange={(e) => updateField('target_value', e.target.value)}
                    placeholder="Enter target value"
                    className="flex-1"
                    data-testid="target-value-input"
                  />
                  {formData.unit && (
                    <div className="px-3 py-2 bg-stone-100 rounded-md text-sm text-text-muted flex items-center">
                      {formData.unit}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pt-4 border-t">
              <Label className="text-sm font-medium">Baseline (Optional)</Label>
              <p className="text-xs text-text-muted mb-2">Reference point for progress calculations</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-text-muted">Baseline Period</Label>
                  <Select 
                    value={formData.baseline?.period || ''} 
                    onValueChange={(v) => updateNestedField('baseline', 'period', v)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select period" />
                    </SelectTrigger>
                    <SelectContent>
                      {reportingYears.map(year => (
                        <SelectItem key={year} value={year}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-text-muted">Baseline Value</Label>
                  <Input
                    type="number"
                    value={formData.baseline?.value || ''}
                    onChange={(e) => updateNestedField('baseline', 'value', e.target.value)}
                    placeholder="Baseline value"
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case 3: // Tracking & Thresholds
        return (
          <div className="space-y-6">
            <div>
              <Label className="text-sm font-medium">Tracking Mode</Label>
              <div className="grid grid-cols-3 gap-3 mt-2">
                {TRACKING_MODES.map(mode => (
                  <Card 
                    key={mode.value}
                    className={`p-3 cursor-pointer border-2 transition-colors ${formData.tracking_mode === mode.value ? 'border-emerald-500 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'}`}
                    onClick={() => updateField('tracking_mode', mode.value)}
                  >
                    <p className="font-medium text-sm">{mode.label}</p>
                    <p className="text-xs text-text-muted">{mode.description}</p>
                  </Card>
                ))}
              </div>
            </div>

            {formData.tracking_mode === 'static' ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-text-muted">Start Period</Label>
                  <Select value={formData.start_period || ''} onValueChange={(v) => updateField('start_period', v)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select start" />
                    </SelectTrigger>
                    <SelectContent>
                      {reportingYears.map(year => (
                        <SelectItem key={year} value={year}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-text-muted">End Period</Label>
                  <Select value={formData.end_period || ''} onValueChange={(v) => updateField('end_period', v)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select end" />
                    </SelectTrigger>
                    <SelectContent>
                      {reportingYears.map(year => (
                        <SelectItem key={year} value={year}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div>
                <Label className="text-sm font-medium">Tracking Values</Label>
                <div className="grid grid-cols-4 gap-3 mt-2">
                  {getTrackingPeriodKeys().map(({ key, label }) => (
                    <div key={key}>
                      <Label className="text-xs text-text-muted">{label}</Label>
                      <Input
                        type="number"
                        value={formData.tracking_values?.[key] || ''}
                        onChange={(e) => updateField('tracking_values', { ...formData.tracking_values, [key]: e.target.value })}
                        placeholder="Value"
                        className="mt-1"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label className="text-sm font-medium">Trajectory</Label>
              <Select value={formData.trajectory} onValueChange={(v) => updateField('trajectory', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRAJECTORIES.map(t => (
                    <SelectItem key={t.value} value={t.value} disabled={t.disabled}>
                      {t.label} {t.disabled && '(Coming Soon)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="pt-4 border-t">
              <Label className="text-sm font-medium">Warning Thresholds (Optional)</Label>
              <p className="text-xs text-text-muted mb-2">For dashboard indicators</p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs text-green-600">Green (On Track)</Label>
                  <Input
                    type="number"
                    value={formData.thresholds?.green || ''}
                    onChange={(e) => updateNestedField('thresholds', 'green', e.target.value)}
                    placeholder="e.g., 90"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-amber-600">Amber (Warning)</Label>
                  <Input
                    type="number"
                    value={formData.thresholds?.amber || ''}
                    onChange={(e) => updateNestedField('thresholds', 'amber', e.target.value)}
                    placeholder="e.g., 75"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-red-600">Red (At Risk)</Label>
                  <Input
                    type="number"
                    value={formData.thresholds?.red || ''}
                    onChange={(e) => updateNestedField('thresholds', 'red', e.target.value)}
                    placeholder="e.g., 50"
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t">
              <Label className="text-sm font-medium">Status</Label>
              <Select value={formData.status} onValueChange={(v) => updateField('status', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-text-muted mt-1">New targets default to Draft. Activate when ready.</p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Step Indicator */}
      <div className="flex items-center justify-between">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const isActive = index === currentStep;
          const isComplete = index < currentStep;
          
          return (
            <React.Fragment key={step.id}>
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  isActive ? 'bg-emerald-600 text-white' :
                  isComplete ? 'bg-emerald-100 text-emerald-600' :
                  'bg-stone-100 text-stone-400'
                }`}>
                  {isComplete ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <span className={`text-sm hidden sm:inline ${isActive ? 'font-medium text-text-primary' : 'text-text-muted'}`}>
                  {step.title}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 ${isComplete ? 'bg-emerald-600' : 'bg-stone-200'}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Step Content */}
      <Card className="p-6">
        {renderStepContent()}
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={currentStep === 0 ? onCancel : handleBack}
          disabled={busy}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          {currentStep === 0 ? 'Cancel' : 'Back'}
        </Button>
        
        {currentStep < STEPS.length - 1 ? (
          <Button
            onClick={handleNext}
            disabled={!validateStep(currentStep) || busy}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={busy}
            className="bg-emerald-600 hover:bg-emerald-700"
            data-testid="submit-target-btn"
          >
            {busy ? 'Saving...' : (initialData?.id ? 'Update Target' : 'Create Target')}
          </Button>
        )}
      </div>
    </div>
  );
}
