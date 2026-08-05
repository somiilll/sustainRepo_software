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
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { 
  ChevronRight, ChevronLeft, Target, Building2, 
  TrendingUp, Calendar, Check, Save, Zap
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
  { value: 'intensity_revenue', label: 'Intensity By Revenue', description: 'Per revenue (e.g., tCO₂e/Mn revenue)', scope: 'organization' },
  { value: 'intensity_production', label: 'Intensity By Production', description: 'Per production unit (e.g., tCO₂e/tonne)', scope: 'all' },
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
  const [baselineFromGHG, setBaselineFromGHG] = useState(false);
  
  // Form data - map initialData fields for compatibility
  const getInitialFormData = () => {
    const base = {
      target_name: '',
      description: '',
      category: '',
      subcategory: '',
      kpi_id: '',
      kpi_name: '',
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
      percentage_direction: 'decrease',
      percentage_amount: '',
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
  
  // Store the raw hierarchy from API
  const [kpiHierarchy, setKpiHierarchy] = useState({});

  // Fetch KPI definitions for targets (from esg_kpi_definitions)
  useEffect(() => {
    const fetchKPIs = async () => {
      try {
        const res = await axios.get(`${API}/api/esg-targets/lookup/categories?section=${section}`, { headers });
        const data = res.data?.hierarchy || {};
        setKpiHierarchy(data);
      } catch (error) {
        console.error('Failed to fetch KPI definitions:', error);
        setKpiHierarchy({});
      }
    };
    fetchKPIs();
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
        const res = await axios.get(`${API}/api/organizations/my`, { headers });
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

  // Re-fetch GHG baseline when target_type changes to/from intensity
  useEffect(() => {
    // Only for GHG Emissions category and when we have a KPI selected
    if (formData.category !== 'GHG Emissions' || !formData.kpi_id) return;
    
    const kpi = availableKPIs.find(k => k.kpi_id === formData.kpi_id);
    if (!kpi) return;
    
    // Re-fetch baseline with the new target_type
    fetchGHGBaseline(kpi, formData.target_type);
  }, [formData.target_type, formData.category, formData.kpi_id]);


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

  // Get available options based on KPI hierarchy (from esg_kpi_definitions)
  const availableCategories = Object.keys(kpiHierarchy);
  const availableSubcategories = formData.category ? Object.keys(kpiHierarchy[formData.category] || {}) : [];
  
  // Get KPIs for selected category/subcategory
  const availableKPIs = useMemo(() => {
    if (!formData.category || !formData.subcategory) return [];
    return kpiHierarchy[formData.category]?.[formData.subcategory] || [];
  }, [kpiHierarchy, formData.category, formData.subcategory]);

  // Handle KPI selection
  const handleKPISelect = (kpiId) => {
    const kpi = availableKPIs.find(k => k.kpi_id === kpiId);
    if (kpi) {
      updateField('kpi_id', kpi.kpi_id);
      updateField('kpi_name', kpi.metric_name);
      updateField('unit', kpi.unit);
      updateField('baseline_mapping_key', kpi.baseline_mapping_key || '');
    }
  };

  // Auto-fetch baseline when entering Target Definition step (step 2 -> 3)
  // This happens after scope/facility is selected
  const fetchBaseline = async () => {
    if (!formData.kpi_id) return;
    
    // Get the KPI to find its baseline_mapping_key (preferred) or metric_code for baseline lookup
    const kpi = availableKPIs.find(k => k.kpi_id === formData.kpi_id);
    
    // Special handling for GHG Emissions - fetch from emission records directly
    if (kpi?.source === 'emission_records' || formData.category === 'GHG Emissions') {
      await fetchGHGBaseline(kpi);
      return;
    }
    
    const lookupKey = kpi?.baseline_mapping_key || formData.baseline_mapping_key || kpi?.metric_code;
    if (!lookupKey) return;
    
    try {
      const facilityId = formData.scope_type === 'facility' && formData.facility_ids?.[0] 
        ? formData.facility_ids[0] 
        : '';
      const params = new URLSearchParams({ metric_key: lookupKey });
      if (facilityId) params.append('facility_id', facilityId);
      
      const res = await axios.get(`${API}/api/esg-targets/baseline/lookup?${params.toString()}`, { headers });
      
      if (res.data?.found && res.data.base_year && res.data.base_value !== null) {
        updateField('baseline', {
          period: res.data.base_year || '',
          value: res.data.base_value?.toString() || ''
        });
        setBaselineFromGHG(true);
      } else {
        setBaselineFromGHG(false);
      }
      // If not found, just leave baseline empty - user can fill manually
    } catch (error) {
      // Silent fail - user can fill baseline manually
      setBaselineFromGHG(false);
      console.log('Baseline auto-fetch not available');
    }
  };

  // Fetch GHG baseline from emission records
  const fetchGHGBaseline = async (kpi, targetType = null) => {
    // Map KPI to scope for GHG endpoint
    const scopeMap = {
      'ghg_scope1_total': 'scope1',
      'ghg_scope2_total': 'scope2',
      'ghg_scope3_total': 'scope3',
      'ghg_total_all': 'total',
      'ghg_scope1_2_total': 'scope1_2'
    };
    
    const scope = scopeMap[kpi?.kpi_id] || 'total';
    
    // Use previous year as default base year
    const currentYear = new Date().getFullYear();
    const baseYear = orgReportingType === 'FY' 
      ? `FY ${currentYear - 1}-${currentYear}` 
      : `CY ${currentYear - 1}`;
    
    // Use passed targetType or fall back to formData.target_type
    const effectiveTargetType = targetType || formData.target_type;
    
    try {
      const facilityId = formData.scope_type === 'facility' && formData.facility_ids?.[0] 
        ? formData.facility_ids[0] 
        : '';
      const params = new URLSearchParams({ scope, base_year: baseYear });
      if (facilityId) params.append('facility_id', facilityId);
      
      // Include target_type for intensity calculations
      if (effectiveTargetType === 'intensity_revenue' || effectiveTargetType === 'intensity_production') {
        params.append('target_type', effectiveTargetType);
      }
      
      const res = await axios.get(`${API}/api/esg-targets/baseline/ghg-emissions?${params.toString()}`, { headers });
      
      if (res.data?.value !== null && res.data?.value !== undefined) {
        updateField('baseline', {
          period: res.data.base_year || baseYear,
          value: res.data.value?.toString() || ''
        });
        setBaselineFromGHG(true);
      } else {
        setBaselineFromGHG(false);
      }
    } catch (error) {
      setBaselineFromGHG(false);
      console.log('GHG baseline auto-fetch not available');
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
    const isFY = orgReportingType === 'FY';
    
    switch (formData.tracking_mode) {
      case 'monthly':
        if (isFY) {
          // Apr-Dec = year, Jan-Mar = year+1
          const fyMonths = [4,5,6,7,8,9,10,11,12,1,2,3];
          return fyMonths.map(m => {
            const yr = m >= 4 ? Number(year) : Number(year) + 1;
            return { key: `${yr}-${String(m).padStart(2,'0')}`, label: new Date(2000, m - 1).toLocaleString('default', { month: 'short' }) };
          });
        }
        return Array.from({ length: 12 }, (_, i) => {
          const month = String(i + 1).padStart(2, '0');
          return { key: `${year}-${month}`, label: new Date(2000, i).toLocaleString('default', { month: 'short' }) };
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
        const hasKPIs = availableKPIs.length > 0;
        if (hasKPIs) {
          return formData.target_name && formData.category && formData.subcategory && formData.kpi_id;
        }
        return formData.target_name && formData.category && formData.subcategory;
      case 1: // Scope
        if (formData.scope_type === 'facility' && (!formData.facility_ids || formData.facility_ids.length === 0)) {
          return false;
        }
        return true;
      case 2: // Target Definition
        if (formData.goal_type === 'range') {
          if (!formData.baseline?.value) return false;
        }
        // Baseline is mandatory for static tracking mode
        if (formData.tracking_mode === 'static') {
          if (!formData.baseline?.value || !formData.baseline?.period) return false;
        }
        return true;
      case 3: // Tracking
        if (formData.tracking_mode === 'static') {
          if (formData.target_type === 'percentage') {
            return formData.target_year && formData.percentage_amount !== '';
          }
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
      // Fetch baseline when entering Target Definition step (after scope is selected)
      if (currentStep === 1) {
        fetchBaseline();
      }
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

    // Compute target_value for percentage type from baseline
    let computedTargetValue = formData.target_value ? parseFloat(formData.target_value) : null;
    if (formData.target_type === 'percentage' && formData.baseline?.value && formData.percentage_amount) {
      const bv = parseFloat(formData.baseline.value);
      const pct = parseFloat(formData.percentage_amount);
      if (!isNaN(bv) && !isNaN(pct)) {
        computedTargetValue = formData.percentage_direction === 'increase' 
          ? bv * (1 + pct / 100) 
          : bv * (1 - pct / 100);
      }
    }

    return {
      ...formData,
      reporting_period: reportingPeriod,
      target_value: computedTargetValue,
      percentage_direction: formData.target_type === 'percentage' ? formData.percentage_direction : null,
      percentage_amount: formData.target_type === 'percentage' && formData.percentage_amount ? parseFloat(formData.percentage_amount) : null,
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
                    updateField('kpi_id', '');
                    updateField('kpi_name', '');
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
                      updateField('kpi_id', '');
                      updateField('kpi_name', '');
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

              {availableKPIs.length > 0 ? (
                <div>
                  <Label className="text-xs text-text-muted">Metric / KPI *</Label>
                  <Select value={formData.kpi_id} onValueChange={handleKPISelect}>
                    <SelectTrigger className="mt-1" data-testid="metric-select">
                      <SelectValue placeholder="Select KPI" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableKPIs.map(kpi => (
                        <SelectItem key={kpi.kpi_id} value={kpi.kpi_id}>
                          {kpi.metric_name} {kpi.unit && `(${kpi.unit})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : formData.subcategory && (
                <Card className="p-3 bg-amber-50 border-amber-200">
                  <p className="text-sm text-amber-800">
                    No KPIs defined for this subcategory. Please create a KPI in the KPI Definitions first.
                  </p>
                </Card>
              )}

              {formData.kpi_id && (
                <Card className="p-3 bg-emerald-50 border-emerald-200">
                  <p className="text-sm font-medium text-emerald-800">Selected KPI</p>
                  <p className="text-sm text-emerald-700">{formData.kpi_name}</p>
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
                  onClick={() => {
                    updateField('scope_type', 'facility');
                    if (formData.target_type === 'intensity_revenue') updateField('target_type', 'absolute');
                  }}
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
        const filteredTargetTypes = TARGET_TYPES.filter(t => {
          // Hide percentage for monthly/yearly
          if (t.value === 'percentage' && formData.tracking_mode !== 'static') return false;
          // Intensity by revenue: org only
          if (t.value === 'intensity_revenue' && formData.scope_type !== 'organization') return false;
          return true;
        });
        return (
          <div className="space-y-6">
            <div>
              <Label className="text-sm font-medium">Tracking Mode *</Label>
              <div className="grid grid-cols-3 gap-3 mt-2">
                {TRACKING_MODES.map(mode => (
                  <Card 
                    key={mode.value}
                    className={`p-3 cursor-pointer border-2 transition-colors ${formData.tracking_mode === mode.value ? 'border-emerald-500 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'}`}
                    onClick={() => {
                      updateField('tracking_mode', mode.value);
                      updateField('tracking_values', {});
                      updateField('target_value', '');
                      // Reset target_type to absolute if switching away from static and percentage was selected
                      if (mode.value !== 'static' && formData.target_type === 'percentage') {
                        updateField('target_type', 'absolute');
                      }
                      // Auto-set goal_type based on tracking mode
                      if (mode.value === 'static') {
                        updateField('goal_type', 'exact');
                      } else if (formData.goal_type === 'exact' || formData.goal_type === 'range') {
                        updateField('goal_type', 'upper_limit');
                      }
                    }}
                    data-testid={`tracking-mode-${mode.value}`}
                  >
                    <p className="font-medium text-sm">{mode.label}</p>
                    <p className="text-xs text-text-muted">{mode.description}</p>
                  </Card>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Target Type *</Label>
              <div className={`grid gap-3 mt-2 ${filteredTargetTypes.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {filteredTargetTypes.map(type => (
                  <Card 
                    key={type.value}
                    className={`p-3 cursor-pointer border-2 transition-colors ${formData.target_type === type.value ? 'border-emerald-500 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'}`}
                    onClick={() => updateField('target_type', type.value)}
                    data-testid={`target-type-${type.value}`}
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
                {(formData.tracking_mode === 'static'
                  ? GOAL_TYPES.filter(g => g.value === 'exact')
                  : GOAL_TYPES.filter(g => g.value === 'upper_limit' || g.value === 'lower_limit')
                ).map(goal => (
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

            {formData.tracking_mode === 'static' && (
            <div className="pt-4 border-t">
              <div className="flex items-center gap-2 mb-1">
                <Label className="text-sm font-medium">
                  Baseline *
                </Label>
                {baselineFromGHG && !(formData.target_type === 'intensity_revenue' || formData.target_type === 'intensity_production') && (
                  <Badge className="bg-emerald-100 text-emerald-700 text-xs gap-1">
                    <Zap className="w-3 h-3" />
                    From GHG Module
                  </Badge>
                )}
              </div>
              <p className="text-xs text-text-muted mb-2">
                {(formData.target_type === 'intensity_revenue' || formData.target_type === 'intensity_production')
                  ? 'Enter base year intensity value manually (e.g., 0.85 tCO₂e/tonne)'
                  : formData.tracking_mode === 'static' 
                    ? 'Required reference point for static target progress calculations'
                    : 'Reference point for progress calculations'}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-text-muted">Baseline Period</Label>
                  <Select 
                    value={formData.baseline?.period || ''} 
                    onValueChange={(v) => {
                      updateNestedField('baseline', 'period', v);
                      setBaselineFromGHG(false); // User modified, no longer from GHG
                    }}
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
                    onChange={(e) => {
                      updateNestedField('baseline', 'value', e.target.value);
                      setBaselineFromGHG(false); // User modified, no longer from GHG
                    }}
                    placeholder="Baseline value"
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
            )}
          </div>
        );

      case 3: // Tracking & Thresholds
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Tracking Mode:</Label>
              <Badge variant="outline" className="text-xs" data-testid="tracking-mode-badge">
                {TRACKING_MODES.find(m => m.value === formData.tracking_mode)?.label || formData.tracking_mode}
              </Badge>
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
                  {formData.target_type === 'percentage' ? (
                    <>
                      <Label className="text-sm font-medium">Target % Change *</Label>
                      <div className="flex gap-2 mt-1">
                        <Select value={formData.percentage_direction} onValueChange={(v) => updateField('percentage_direction', v)}>
                          <SelectTrigger className="w-36" data-testid="percentage-direction">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="decrease">Decrease by</SelectItem>
                            <SelectItem value="increase">Increase by</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="relative flex-1">
                          <Input
                            type="number"
                            value={formData.percentage_amount}
                            onChange={(e) => updateField('percentage_amount', e.target.value)}
                            placeholder="e.g., 20"
                            data-testid="percentage-amount-input"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">%</span>
                        </div>
                      </div>
                      {formData.percentage_amount && formData.baseline?.value && (
                        <p className="text-xs text-emerald-600 mt-1">
                          Computed target: {(() => {
                            const bv = parseFloat(formData.baseline.value);
                            const pct = parseFloat(formData.percentage_amount);
                            if (isNaN(bv) || isNaN(pct)) return 'N/A';
                            const tv = formData.percentage_direction === 'increase' ? bv * (1 + pct / 100) : bv * (1 - pct / 100);
                            return `${tv.toLocaleString()} ${formData.unit || ''}`;
                          })()}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <Label className="text-sm font-medium">
                        {(formData.target_type === 'intensity_revenue' || formData.target_type === 'intensity_production') 
                          ? 'Target Intensity Value *' : 'Target Value *'}
                      </Label>
                      <div className="flex gap-2 mt-1">
                        <Input
                          type="number"
                          value={formData.target_value}
                          onChange={(e) => updateField('target_value', e.target.value)}
                          placeholder={formData.target_type === 'intensity_revenue' ? 'e.g., 0.45' : formData.target_type === 'intensity_production' ? 'e.g., 0.45' : 'Enter target value'}
                          className="flex-1"
                          data-testid="target-value-input"
                        />
                        <div className="px-3 py-2 bg-stone-100 rounded-md text-sm text-text-muted flex items-center whitespace-nowrap">
                          {formData.target_type === 'intensity_revenue' 
                            ? `${formData.unit || 'unit'}/Mn revenue`
                            : formData.target_type === 'intensity_production'
                              ? `${formData.unit || 'unit'}/production unit`
                              : formData.unit || 'unit'}
                        </div>
                      </div>
                    </>
                  )}
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
