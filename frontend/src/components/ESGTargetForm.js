/**
 * ESGTargetForm - Multi-step wizard for creating/editing ESG targets
 * 
 * Steps:
 * 1. KPI Selection (Section → Category → Subcategory → Metric)
 * 2. Scope (Organization/Facility)
 * 3. Target Definition (Type, Goal, Baseline)
 * 4. Tracking (Mode, Values, Thresholds)
 */
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { 
  ChevronRight, ChevronLeft, Target, Building2, 
  TrendingUp, Calendar, Check, Save
} from 'lucide-react';
import { generateReportingYears } from '../utils/reportingYearUtils';

const API = process.env.REACT_APP_BACKEND_URL;

const STEPS = [
  { id: 'kpi', title: 'KPI Selection', icon: Target },
  { id: 'scope', title: 'Scope', icon: Building2 },
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
  { value: 'static', label: 'Static', description: 'One target for a single year' },
  { value: 'monthly', label: 'Monthly', description: 'Monthly target values' },
  { value: 'quarterly', label: 'Quarterly', description: 'Quarterly target values (Q1-Q4)' },
  { value: 'half_yearly', label: 'Half Yearly', description: 'H1 and H2 targets' },
  { value: 'yearly', label: 'Yearly', description: 'Target values for multiple years' },
];

// Generate future years only (up to 2060 for long-term targets like Net Zero)
const generateFutureYears = (reportingType) => {
  const currentYear = new Date().getFullYear();
  const endYear = 2060;
  const years = [];
  
  for (let year = currentYear; year <= endYear; year++) {
    if (reportingType === 'FY') {
      years.push(`FY ${year}-${year + 1}`);
    } else {
      years.push(`CY ${year}`);
    }
  }
  return years;
};

// Generate years between start and end (inclusive)
const generateYearRange = (startYear, endYear, reportingType) => {
  const years = [];
  const extractYear = (period) => {
    const match = period.match(/\d{4}/);
    return match ? parseInt(match[0]) : null;
  };
  
  const start = extractYear(startYear);
  const end = extractYear(endYear);
  
  if (!start || !end || start > end) return [];
  
  for (let y = start; y <= end; y++) {
    if (reportingType === 'FY') {
      years.push(`FY ${y}-${y + 1}`);
    } else {
      years.push(`CY ${y}`);
    }
  }
  return years;
};

export default function ESGTargetForm({ section, initialData, onSubmit, onCancel, busy }) {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };
  
  const [currentStep, setCurrentStep] = useState(0);
  const [categories, setCategories] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [orgReportingType, setOrgReportingType] = useState('FY');
  const [futureYears, setFutureYears] = useState([]);
  
  // Form data - map initialData fields for compatibility
  const getInitialFormData = () => {
    const base = {
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
      target_type: 'absolute',
      goal_type: 'upper_limit',
      target_value: '',
      minimum_value: '',
      maximum_value: '',
      baseline: { period: '', value: '' },
      tracking_mode: 'static',
      tracking_values: {},
      target_year: '',
      start_period: '',
      end_period: '',
      thresholds: { green: '', amber: '', red: '' },
    };
    
    if (!initialData) return base;
    
    return {
      ...base,
      ...initialData,
      // Map reporting_period to target_year for backward compatibility
      target_year: initialData.target_year || initialData.reporting_period || '',
      baseline: initialData.baseline || { period: '', value: '' },
      thresholds: initialData.thresholds || { green: '', amber: '', red: '' },
      tracking_values: initialData.tracking_values || {},
      facility_ids: initialData.facility_ids || [],
    };
  };

  const [formData, setFormData] = useState(getInitialFormData);

  // Computed hierarchy from categories
  const hierarchy = useMemo(() => {
    const h = {};
    if (!Array.isArray(categories)) return h;
    
    categories.forEach(cat => {
      const catName = cat.category;
      const subcatName = cat.subcategory;
      const subSubcatName = cat.sub_subcategory || '_root';
      
      if (!h[catName]) h[catName] = {};
      if (!h[catName][subcatName]) h[catName][subcatName] = {};
      if (!h[catName][subcatName][subSubcatName]) h[catName][subcatName][subSubcatName] = [];
      
      const fields = cat.fields || cat.field_definitions || [];
      fields.forEach(field => {
        const fieldKey = field.field_key || field.key;
        if (fieldKey) {
          h[catName][subcatName][subSubcatName].push({
            metric_key: fieldKey,
            metric_label: field.label,
            unit: field.unit || cat.unit,
            category_id: cat.id
          });
        }
      });
    });
    return h;
  }, [categories]);

  // Fetch categories
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await axios.get(`${API}/api/esg-records/categories/${section}`, { headers });
        const data = res.data?.categories || res.data || [];
        setCategories(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Failed to fetch categories:', error);
        setCategories([]);
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

  // Fetch org reporting type
  useEffect(() => {
    const fetchOrgDetails = async () => {
      try {
        const res = await axios.get(`${API}/api/organizations/current`, { headers });
        const org = res.data;
        const repType = org?.reporting_year_type === 'calendar_year' ? 'CY' : 'FY';
        setOrgReportingType(repType);
        setFormData(f => ({ ...f, reporting_type: repType }));
      } catch (error) {
        console.error('Failed to fetch org details:', error);
      }
    };
    fetchOrgDetails();
  }, [token]);

  // Generate future years based on org reporting type
  useEffect(() => {
    const years = generateFutureYears(orgReportingType);
    setFutureYears(years);
  }, [orgReportingType]);

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

  // Handle metric selection - also fetch baseline
  const handleMetricSelect = async (metricKey) => {
    const metric = availableMetrics.find(m => m.metric_key === metricKey);
    if (metric) {
      updateField('metric_key', metric.metric_key);
      updateField('metric_label', metric.metric_label);
      updateField('unit', metric.unit);
      
      // Auto-fetch baseline from GHG module
      try {
        const facilityId = formData.scope_type === 'facility' && formData.facility_ids?.[0] 
          ? formData.facility_ids[0] 
          : '';
        const params = new URLSearchParams({ metric_key: metricKey });
        if (facilityId) params.append('facility_id', facilityId);
        
        const res = await axios.get(`${API}/api/esg-targets/baseline/lookup?${params.toString()}`, { headers });
        
        if (res.data?.found) {
          updateField('baseline', {
            period: res.data.base_year || '',
            value: res.data.base_value?.toString() || ''
          });
        }
      } catch (error) {
        console.log('Baseline auto-fetch not available:', error.message);
      }
    }
  };

  // Get years for yearly tracking mode
  const yearlyTrackingYears = useMemo(() => {
    if (formData.tracking_mode !== 'yearly' || !formData.start_period || !formData.end_period) {
      return [];
    }
    return generateYearRange(formData.start_period, formData.end_period, orgReportingType);
  }, [formData.tracking_mode, formData.start_period, formData.end_period, orgReportingType]);

  // Generate tracking period keys for monthly/quarterly/half_yearly
  const getTrackingPeriodKeys = () => {
    const year = formData.target_year?.match(/\d{4}/)?.[0] || new Date().getFullYear();
    
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
      default:
        return [];
    }
  };

  // Validation
  const validateStep = (step) => {
    switch (step) {
      case 0: // KPI Selection
        const hasMetrics = availableMetrics.length > 0;
        if (hasMetrics) {
          return formData.target_name && formData.category && formData.subcategory && formData.metric_key;
        }
        return formData.target_name && formData.category && formData.subcategory;
      case 1: // Scope
        if (formData.scope_type === 'facility' && (!formData.facility_ids || formData.facility_ids.length === 0)) {
          return false;
        }
        return true;
      case 2: // Target Definition
        if (formData.goal_type === 'range') {
          return formData.baseline?.value !== '';
        }
        return true;
      case 3: // Tracking
        if (formData.tracking_mode === 'static') {
          return formData.target_year && formData.target_value !== '';
        }
        if (formData.tracking_mode === 'yearly') {
          return formData.start_period && formData.end_period && Object.keys(formData.tracking_values).length > 0;
        }
        // For monthly/quarterly/half_yearly, need target_year and at least one value
        return formData.target_year && Object.keys(formData.tracking_values).length > 0;
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

  const prepareSubmitData = (status) => {
    // Determine reporting_period based on tracking mode
    let reportingPeriod = '';
    if (formData.tracking_mode === 'static') {
      reportingPeriod = formData.target_year;
    } else if (formData.tracking_mode === 'yearly') {
      reportingPeriod = `${formData.start_period} - ${formData.end_period}`;
    } else {
      reportingPeriod = formData.target_year;
    }

    return {
      ...formData,
      reporting_period: reportingPeriod,
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
      trajectory: 'manual',
      status: status,
    };
  };

  const handleCreateActive = () => {
    onSubmit(prepareSubmitData('active'));
  };

  const handleSaveAsDraft = () => {
    onSubmit(prepareSubmitData('draft'));
  };

  const isEditMode = !!initialData?.id;

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

              {availableMetrics.length > 0 ? (
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
              ) : formData.subcategory && (
                <Card className="p-3 bg-amber-50 border-amber-200">
                  <p className="text-sm text-amber-800">
                    No metrics defined for this subcategory. You can still create a target at the subcategory level, 
                    or add metrics in ESG Config first.
                  </p>
                </Card>
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

      case 1: // Scope
        return (
          <div className="space-y-6">
            <div>
              <Label className="text-sm font-medium">Target Scope *</Label>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <Card 
                  className={`p-4 cursor-pointer border-2 transition-colors ${formData.scope_type === 'organization' ? 'border-emerald-500 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'}`}
                  onClick={() => {
                    updateField('scope_type', 'organization');
                    updateField('facility_ids', []);
                  }}
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
                      <p className="text-xs text-text-muted">Applies to selected facility</p>
                    </div>
                  </div>
                </Card>
              </div>
            </div>

            {formData.scope_type === 'facility' && (
              <div>
                <Label className="text-sm font-medium">Select Facility *</Label>
                <Select 
                  value={formData.facility_ids?.[0] || ''} 
                  onValueChange={(v) => updateField('facility_ids', [v])}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select a facility" />
                  </SelectTrigger>
                  <SelectContent>
                    {facilities.map(facility => (
                      <SelectItem key={facility.id} value={facility.id}>{facility.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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

            {formData.goal_type === 'range' && (
              <div>
                <Label className="text-sm font-medium">Range Values</Label>
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
              </div>
            )}

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
                      {generateReportingYears(orgReportingType === 'FY' ? 'financial_year' : 'calendar_year', 10).map(year => (
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
                    onClick={() => {
                      updateField('tracking_mode', mode.value);
                      updateField('tracking_values', {});
                      updateField('target_value', '');
                    }}
                  >
                    <p className="font-medium text-sm">{mode.label}</p>
                    <p className="text-xs text-text-muted">{mode.description}</p>
                  </Card>
                ))}
              </div>
            </div>

            {/* Static Mode - Single Year + Target Value */}
            {formData.tracking_mode === 'static' && (
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Target Year *</Label>
                  <Select value={formData.target_year || ''} onValueChange={(v) => updateField('target_year', v)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select year" />
                    </SelectTrigger>
                    <SelectContent>
                      {futureYears.map(year => (
                        <SelectItem key={year} value={year}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium">Target Value *</Label>
                  <div className="flex gap-2 mt-1">
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
                </div>
              </div>
            )}

            {/* Yearly Mode - Start/End Period + Values for each year */}
            {formData.tracking_mode === 'yearly' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Start Period *</Label>
                    <Select value={formData.start_period || ''} onValueChange={(v) => updateField('start_period', v)}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select start" />
                      </SelectTrigger>
                      <SelectContent>
                        {futureYears.map(year => (
                          <SelectItem key={year} value={year}>{year}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">End Period *</Label>
                    <Select value={formData.end_period || ''} onValueChange={(v) => updateField('end_period', v)}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select end" />
                      </SelectTrigger>
                      <SelectContent>
                        {futureYears.map(year => (
                          <SelectItem key={year} value={year}>{year}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {yearlyTrackingYears.length > 0 && (
                  <div>
                    <Label className="text-sm font-medium">Target Values for Each Year *</Label>
                    <div className="grid grid-cols-3 gap-3 mt-2">
                      {yearlyTrackingYears.map(year => (
                        <div key={year}>
                          <Label className="text-xs text-text-muted">{year}</Label>
                          <Input
                            type="number"
                            value={formData.tracking_values?.[year] || ''}
                            onChange={(e) => updateField('tracking_values', { ...formData.tracking_values, [year]: e.target.value })}
                            placeholder="Value"
                            className="mt-1"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Monthly/Quarterly/Half-Yearly - Year selection + period values */}
            {['monthly', 'quarterly', 'half_yearly'].includes(formData.tracking_mode) && (
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Target Year *</Label>
                  <Select value={formData.target_year || ''} onValueChange={(v) => updateField('target_year', v)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select year" />
                    </SelectTrigger>
                    <SelectContent>
                      {futureYears.map(year => (
                        <SelectItem key={year} value={year}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {formData.target_year && (
                  <div>
                    <Label className="text-sm font-medium">Target Values *</Label>
                    <div className={`grid gap-3 mt-2 ${formData.tracking_mode === 'monthly' ? 'grid-cols-4' : 'grid-cols-2'}`}>
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
              </div>
            )}

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
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleSaveAsDraft}
              disabled={!validateStep(currentStep) || busy}
            >
              <Save className="w-4 h-4 mr-1" />
              Save as Draft
            </Button>
            <Button
              onClick={handleCreateActive}
              disabled={!validateStep(currentStep) || busy}
              className="bg-emerald-600 hover:bg-emerald-700"
              data-testid="submit-target-btn"
            >
              {busy ? 'Saving...' : (isEditMode ? 'Update Target' : 'Create Target')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
