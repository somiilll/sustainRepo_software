import React, { useState, useMemo, useCallback, useEffect } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Plus, Trash2, Upload, X, Check, ChevronRight, ChevronLeft, Info } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const MONTHS = [
  { key: '01', name: 'January', short: 'Jan' },
  { key: '02', name: 'February', short: 'Feb' },
  { key: '03', name: 'March', short: 'Mar' },
  { key: '04', name: 'April', short: 'Apr' },
  { key: '05', name: 'May', short: 'May' },
  { key: '06', name: 'June', short: 'Jun' },
  { key: '07', name: 'July', short: 'Jul' },
  { key: '08', name: 'August', short: 'Aug' },
  { key: '09', name: 'September', short: 'Sep' },
  { key: '10', name: 'October', short: 'Oct' },
  { key: '11', name: 'November', short: 'Nov' },
  { key: '12', name: 'December', short: 'Dec' }
];

export default function EmissionEntryForm({
  facilities,
  fuelDatabase,
  centralizedUnits,
  getAuthHeader,
  onSuccess,
  onCancel,
  editingEmission = null
}) {
  // Form step state
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;

  // Step 1: Basic Selection
  const [facilityId, setFacilityId] = useState('');
  const [scope, setScope] = useState('scope1');
  const [category, setCategory] = useState('');
  const [fuelId, setFuelId] = useState('');
  const [useCustomFuel, setUseCustomFuel] = useState(false);
  const [customFuelName, setCustomFuelName] = useState('');
  const [customEmissionFactor, setCustomEmissionFactor] = useState('');
  const [customSource, setCustomSource] = useState('');

  // Step 2: Process & Responsibility
  const [processNames, setProcessNames] = useState(['']);
  const [responsiblePerson, setResponsiblePerson] = useState('');

  // Step 3: Year & Monthly Data
  const [reportingYear, setReportingYear] = useState(new Date().getFullYear().toString());
  const [monthlyData, setMonthlyData] = useState({});
  const [expandedMonths, setExpandedMonths] = useState([]);

  // Step 4: Notes
  const [notes, setNotes] = useState('');

  // Get selected fuel data
  const selectedFuel = useMemo(() => {
    return fuelDatabase.find(f => f.id === fuelId);
  }, [fuelDatabase, fuelId]);

  // Get selected facility
  const selectedFacility = useMemo(() => {
    return facilities.find(f => f.id === facilityId);
  }, [facilities, facilityId]);

  // Get categories for selected scope
  const categoriesForScope = useMemo(() => {
    const filtered = fuelDatabase.filter(f => f.scope === scope);
    const cats = [...new Set(filtered.map(f => f.category))];
    return cats.sort();
  }, [fuelDatabase, scope]);

  // Get fuels for selected category and scope
  const fuelsForCategory = useMemo(() => {
    let filtered = fuelDatabase.filter(f => f.scope === scope && f.category === category);
    
    // Filter by facility sector if available
    if (selectedFacility?.sector) {
      filtered = filtered.filter(fuel => {
        if (fuel.industry_sectors && fuel.industry_sectors.length > 0) {
          return fuel.industry_sectors.some(s => 
            s.toLowerCase() === selectedFacility.sector.toLowerCase()
          );
        }
        return true;
      });
    }
    
    return filtered;
  }, [fuelDatabase, scope, category, selectedFacility]);

  // Get allowed units for selected fuel
  const allowedUnits = useMemo(() => {
    if (selectedFuel?.allowed_units?.length > 0) {
      return selectedFuel.allowed_units;
    }
    // Default units based on scope
    if (scope === 'scope2') {
      return ['kWh', 'MWh', 'GWh'];
    }
    return ['kg', 'litre', 'tonne', 'm³'];
  }, [selectedFuel, scope]);

  const defaultUnit = allowedUnits[0] || 'kg';

  // Handle process names
  const addProcessName = () => {
    setProcessNames([...processNames, '']);
  };

  const removeProcessName = (index) => {
    if (processNames.length > 1) {
      setProcessNames(processNames.filter((_, i) => i !== index));
    }
  };

  const updateProcessName = (index, value) => {
    const updated = [...processNames];
    updated[index] = value;
    setProcessNames(updated);
  };

  // Handle monthly data
  const updateMonthData = (monthKey, field, value) => {
    setMonthlyData(prev => ({
      ...prev,
      [monthKey]: {
        ...(prev[monthKey] || {}),
        [field]: value
      }
    }));
  };

  // Handle evidence upload for a month
  const handleEvidenceUpload = async (monthKey, file) => {
    if (!file) return;
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axios.post(`${API}/upload/evidence`, formData, {
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'multipart/form-data'
        }
      });
      
      if (response.data?.url) {
        const currentEvidences = monthlyData[monthKey]?.evidences || [];
        updateMonthData(monthKey, 'evidences', [...currentEvidences, {
          url: response.data.url,
          filename: file.name,
          uploaded_at: new Date().toISOString()
        }]);
        toast.success(`Evidence uploaded for ${MONTHS.find(m => m.key === monthKey)?.name}`);
      }
    } catch (error) {
      console.error('Evidence upload failed:', error);
      toast.error('Failed to upload evidence');
    }
  };

  const removeEvidence = (monthKey, evidenceIndex) => {
    const currentEvidences = monthlyData[monthKey]?.evidences || [];
    updateMonthData(monthKey, 'evidences', 
      currentEvidences.filter((_, idx) => idx !== evidenceIndex)
    );
  };

  // Check if month has data
  const getMonthStatus = (monthKey) => {
    const data = monthlyData[monthKey];
    if (!data || !data.quantity || parseFloat(data.quantity) <= 0) return 'empty';
    return 'filled';
  };

  // Count filled months
  const filledMonthsCount = useMemo(() => {
    return Object.values(monthlyData).filter(m => m?.quantity && parseFloat(m.quantity) > 0).length;
  }, [monthlyData]);

  // Validation for each step
  const canProceedToStep = (step) => {
    switch (step) {
      case 2:
        if (!facilityId) return { valid: false, message: 'Please select a facility' };
        if (!scope) return { valid: false, message: 'Please select a scope' };
        if (!category) return { valid: false, message: 'Please select a category' };
        if (!useCustomFuel && !fuelId) return { valid: false, message: 'Please select a fuel type' };
        if (useCustomFuel && !customFuelName) return { valid: false, message: 'Please enter custom fuel name' };
        if (useCustomFuel && !customEmissionFactor) return { valid: false, message: 'Please enter emission factor' };
        return { valid: true };
      case 3:
        const validProcesses = processNames.filter(p => p.trim() !== '');
        if (validProcesses.length === 0) return { valid: false, message: 'Please enter at least one process name' };
        if (!responsiblePerson.trim()) return { valid: false, message: 'Please enter person responsible' };
        return { valid: true };
      case 4:
        if (filledMonthsCount === 0) return { valid: false, message: 'Please enter data for at least one month' };
        return { valid: true };
      default:
        return { valid: true };
    }
  };

  const handleNext = () => {
    const validation = canProceedToStep(currentStep + 1);
    if (!validation.valid) {
      toast.error(validation.message);
      return;
    }
    setCurrentStep(Math.min(currentStep + 1, totalSteps));
  };

  const handlePrev = () => {
    setCurrentStep(Math.max(currentStep - 1, 1));
  };

  // Submit handler - creates emissions for each month with data
  const handleSubmit = async () => {
    const validation = canProceedToStep(5); // Final validation
    if (!validation.valid) {
      toast.error(validation.message);
      return;
    }

    try {
      const validProcesses = processNames.filter(p => p.trim() !== '');
      const monthsWithData = Object.entries(monthlyData).filter(([_, data]) => 
        data?.quantity && parseFloat(data.quantity) > 0
      );

      if (monthsWithData.length === 0) {
        toast.error('Please enter data for at least one month');
        return;
      }

      // Create emission record for each month with data
      for (const [monthKey, data] of monthsWithData) {
        const reportingPeriod = `${reportingYear}-${monthKey}`;
        
        const payload = {
          facility_id: facilityId,
          reporting_period: reportingPeriod,
          scope: scope,
          category: useCustomFuel ? 'Custom' : category,
          sub_category: useCustomFuel ? customFuelName : selectedFuel?.fuel_name || '',
          fuel_type: useCustomFuel ? customFuelName : selectedFuel?.fuel_name || '',
          quantity: parseFloat(data.quantity),
          quantity_unit: data.unit || defaultUnit,
          emission_factor: useCustomFuel 
            ? parseFloat(customEmissionFactor)
            : parseFloat(selectedFuel?.emission_factor_co2) || 0,
          emission_factor_ch4: useCustomFuel ? null : parseFloat(selectedFuel?.emission_factor_ch4) || null,
          emission_factor_n2o: useCustomFuel ? null : parseFloat(selectedFuel?.emission_factor_n2o) || null,
          calorific_value: data.overrideCalorificValue 
            ? parseFloat(data.calorificValue) 
            : parseFloat(selectedFuel?.calorific_value) || null,
          calorific_value_unit: selectedFuel?.calorific_value_unit || '',
          calorific_value_justification: data.overrideCalorificValue ? data.calorificValueJustification : null,
          density: data.overrideDensity 
            ? parseFloat(data.density) 
            : parseFloat(selectedFuel?.density) || null,
          density_unit: selectedFuel?.density_unit || '',
          density_justification: data.overrideDensity ? data.densityJustification : null,
          override_calorific_value: data.overrideCalorificValue || false,
          override_density: data.overrideDensity || false,
          is_custom_factor: useCustomFuel || (scope === 'scope2' && data.useCustomEmissionFactor),
          emission_factor_basis_quantity: scope === 'scope2' 
            ? (data.useCustomEmissionFactor ? parseFloat(data.customEmissionFactor) : parseFloat(selectedFuel?.emission_factor_basis_quantity))
            : null,
          emission_factor_basis_unit: scope === 'scope2' ? (selectedFuel?.emission_factor_basis_unit || 'tCO2/MWh') : null,
          source_of_information: useCustomFuel ? customSource : selectedFuel?.source || '',
          notes: notes,
          responsible_person: responsiblePerson,
          process_names: validProcesses,
          evidence_url: data.evidences?.map(e => e.url).join(',') || '',
          fuel_database_id: useCustomFuel ? null : fuelId,
          justification: useCustomFuel ? `Custom fuel type: ${customFuelName}` : null
        };

        await axios.post(`${API}/emissions`, payload, {
          headers: getAuthHeader()
        });
      }

      toast.success(`Created ${monthsWithData.length} emission record(s) successfully`);
      onSuccess?.();
    } catch (error) {
      console.error('Failed to save emissions:', error);
      toast.error(error.response?.data?.detail || 'Failed to save emissions');
    }
  };

  // Step indicators
  const steps = [
    { num: 1, title: 'Selection', desc: 'Facility, Scope, Category, Fuel' },
    { num: 2, title: 'Process', desc: 'Process names & Person responsible' },
    { num: 3, title: 'Monthly Data', desc: 'Year & monthly quantities' },
    { num: 4, title: 'Notes', desc: 'Additional notes' }
  ];

  return (
    <div className="space-y-6">
      {/* Step Indicator */}
      <div className="flex items-center justify-between mb-6">
        {steps.map((step, idx) => (
          <div key={step.num} className="flex items-center">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
              currentStep >= step.num 
                ? 'bg-primary text-white' 
                : 'bg-stone-200 text-stone-500'
            }`}>
              {currentStep > step.num ? <Check className="w-4 h-4" /> : step.num}
            </div>
            <div className="ml-2 hidden sm:block">
              <p className={`text-sm font-medium ${currentStep >= step.num ? 'text-primary' : 'text-stone-500'}`}>
                {step.title}
              </p>
              <p className="text-xs text-stone-400">{step.desc}</p>
            </div>
            {idx < steps.length - 1 && (
              <div className={`w-12 h-0.5 mx-2 ${currentStep > step.num ? 'bg-primary' : 'bg-stone-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Basic Selection */}
      {currentStep === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Facility */}
            <div className="space-y-2">
              <Label>Facility *</Label>
              <select
                value={facilityId}
                onChange={(e) => setFacilityId(e.target.value)}
                className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                data-testid="emission-facility-select"
              >
                <option value="">Select Facility</option>
                {facilities.filter(f => f.is_active !== false).map(f => (
                  <option key={f.id} value={f.id}>
                    {f.name} {f.country ? `(${f.country})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Scope */}
            <div className="space-y-2">
              <Label>Scope *</Label>
              <div className="flex gap-4 h-10 items-center">
                {['scope1', 'scope2', 'biogenic'].map(s => (
                  <label key={s} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value={s}
                      checked={scope === s}
                      onChange={() => {
                        setScope(s);
                        setCategory('');
                        setFuelId('');
                      }}
                      className="text-primary"
                    />
                    <span className="text-sm">
                      {s === 'biogenic' ? 'Biogenic' : `Scope ${s.slice(-1)}`}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>Category *</Label>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setFuelId('');
              }}
              className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
              data-testid="emission-category-select"
            >
              <option value="">Select Category</option>
              {categoriesForScope.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Fuel Type */}
          {category && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Fuel Type *</Label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCustomFuel}
                    onChange={(e) => {
                      setUseCustomFuel(e.target.checked);
                      if (e.target.checked) setFuelId('');
                    }}
                  />
                  Use Custom Fuel Type
                </label>
              </div>

              {!useCustomFuel ? (
                <select
                  value={fuelId}
                  onChange={(e) => setFuelId(e.target.value)}
                  className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                  data-testid="emission-fuel-select"
                >
                  <option value="">Select Fuel Type</option>
                  {fuelsForCategory.map(fuel => (
                    <option key={fuel.id} value={fuel.id}>
                      {fuel.fuel_name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="space-y-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="space-y-2">
                    <Label>Custom Fuel Name *</Label>
                    <Input
                      value={customFuelName}
                      onChange={(e) => setCustomFuelName(e.target.value)}
                      placeholder="Enter fuel name"
                      className="bg-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Emission Factor (CO₂) *</Label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={customEmissionFactor}
                        onChange={(e) => setCustomEmissionFactor(e.target.value)}
                        placeholder="e.g., 2.5"
                        className="bg-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Source *</Label>
                      <Input
                        value={customSource}
                        onChange={(e) => setCustomSource(e.target.value)}
                        placeholder="Source of information"
                        className="bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Show selected fuel info */}
              {selectedFuel && !useCustomFuel && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
                  <p><strong>Selected:</strong> {selectedFuel.fuel_name}</p>
                  <p className="text-stone-600">
                    EF CO₂: {selectedFuel.emission_factor_co2} | 
                    CV: {selectedFuel.calorific_value} {selectedFuel.calorific_value_unit}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Process & Responsibility */}
      {currentStep === 2 && (
        <div className="space-y-4">
          {/* Process Names */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Name of Process(es) *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addProcessName}
              >
                <Plus className="w-4 h-4 mr-1" /> Add Process
              </Button>
            </div>
            {processNames.map((name, idx) => (
              <div key={idx} className="flex gap-2">
                <Input
                  value={name}
                  onChange={(e) => updateProcessName(idx, e.target.value)}
                  placeholder={`Process ${idx + 1}`}
                  className="bg-stone-50"
                />
                {processNames.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeProcessName(idx)}
                    className="text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Person Responsible */}
          <div className="space-y-2">
            <Label>Person Responsible *</Label>
            <Input
              value={responsiblePerson}
              onChange={(e) => setResponsiblePerson(e.target.value)}
              placeholder="Enter name of responsible person"
              className="bg-stone-50"
            />
          </div>
        </div>
      )}

      {/* Step 3: Year & Monthly Data */}
      {currentStep === 3 && (
        <div className="space-y-4">
          {/* Year Selection */}
          <div className="space-y-2">
            <Label>Reporting Year *</Label>
            <select
              value={reportingYear}
              onChange={(e) => setReportingYear(e.target.value)}
              className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
            >
              {Array.from({ length: 10 }, (_, i) => {
                const year = new Date().getFullYear() - 5 + i;
                return <option key={year} value={year}>{year}</option>;
              })}
            </select>
          </div>

          {/* Monthly Data Entry */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Monthly Data for {reportingYear}</Label>
              <span className="text-sm text-stone-500">
                {filledMonthsCount} / 12 months filled
              </span>
            </div>

            <Accordion type="multiple" value={expandedMonths} onValueChange={setExpandedMonths}>
              {MONTHS.map(month => {
                const monthKey = month.key;
                const status = getMonthStatus(monthKey);
                const data = monthlyData[monthKey] || {};

                return (
                  <AccordionItem key={monthKey} value={monthKey} className="border rounded-lg mb-2">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <div className="flex items-center justify-between w-full pr-4">
                        <div className="flex items-center gap-3">
                          <span className={`w-2 h-2 rounded-full ${
                            status === 'filled' ? 'bg-green-500' : 'bg-stone-300'
                          }`} />
                          <span className="font-medium">{month.name} {reportingYear}</span>
                        </div>
                        {status === 'filled' && (
                          <span className="text-sm text-green-600 flex items-center gap-1">
                            <Check className="w-4 h-4" />
                            {data.quantity} {data.unit || defaultUnit}
                          </span>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <div className="space-y-4">
                        {/* Quantity and Unit */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Quantity</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="Enter quantity"
                              value={data.quantity || ''}
                              onChange={(e) => updateMonthData(monthKey, 'quantity', e.target.value)}
                              className="bg-stone-50"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Unit</Label>
                            <select
                              value={data.unit || defaultUnit}
                              onChange={(e) => updateMonthData(monthKey, 'unit', e.target.value)}
                              className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                            >
                              {allowedUnits.map(unit => (
                                <option key={unit} value={unit}>{unit}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Evidence Upload */}
                        <div className="space-y-2">
                          <Label>Evidence(s)</Label>
                          <div className="border-2 border-dashed border-stone-200 rounded-lg p-4">
                            <input
                              type="file"
                              id={`evidence-${monthKey}`}
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files?.[0]) {
                                  handleEvidenceUpload(monthKey, e.target.files[0]);
                                  e.target.value = '';
                                }
                              }}
                              accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx"
                            />
                            <label
                              htmlFor={`evidence-${monthKey}`}
                              className="flex flex-col items-center gap-2 cursor-pointer"
                            >
                              <Upload className="w-8 h-8 text-stone-400" />
                              <span className="text-sm text-stone-500">Click to upload evidence</span>
                              <span className="text-xs text-stone-400">PDF, Images, Excel, Word</span>
                            </label>
                          </div>

                          {/* Uploaded Evidences List */}
                          {data.evidences && data.evidences.length > 0 && (
                            <div className="mt-2 space-y-2">
                              {data.evidences.map((evidence, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 bg-green-50 rounded-lg">
                                  <span className="text-sm text-green-700 truncate flex-1">
                                    {evidence.filename}
                                  </span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeEvidence(monthKey, idx)}
                                    className="text-red-500 hover:text-red-700"
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Override Options - Scope 1 */}
                        {scope === 'scope1' && !useCustomFuel && selectedFuel && (
                          <div className="space-y-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                            <p className="text-sm font-medium text-amber-800">Override Default Values (Optional)</p>

                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id={`override-cv-${monthKey}`}
                                checked={data.overrideCalorificValue || false}
                                onChange={(e) => updateMonthData(monthKey, 'overrideCalorificValue', e.target.checked)}
                              />
                              <label htmlFor={`override-cv-${monthKey}`} className="text-sm">
                                Override Calorific Value (Default: {selectedFuel?.calorific_value} {selectedFuel?.calorific_value_unit})
                              </label>
                            </div>

                            {data.overrideCalorificValue && (
                              <div className="grid grid-cols-2 gap-2 ml-6">
                                <Input
                                  type="number"
                                  step="0.001"
                                  placeholder="New Calorific Value"
                                  value={data.calorificValue || ''}
                                  onChange={(e) => updateMonthData(monthKey, 'calorificValue', e.target.value)}
                                  className="bg-white"
                                />
                                <Input
                                  placeholder="Justification *"
                                  value={data.calorificValueJustification || ''}
                                  onChange={(e) => updateMonthData(monthKey, 'calorificValueJustification', e.target.value)}
                                  className="bg-white"
                                />
                              </div>
                            )}

                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id={`override-density-${monthKey}`}
                                checked={data.overrideDensity || false}
                                onChange={(e) => updateMonthData(monthKey, 'overrideDensity', e.target.checked)}
                              />
                              <label htmlFor={`override-density-${monthKey}`} className="text-sm">
                                Override Density (Default: {selectedFuel?.density} {selectedFuel?.density_unit})
                              </label>
                            </div>

                            {data.overrideDensity && (
                              <div className="grid grid-cols-2 gap-2 ml-6">
                                <Input
                                  type="number"
                                  step="0.001"
                                  placeholder="New Density"
                                  value={data.density || ''}
                                  onChange={(e) => updateMonthData(monthKey, 'density', e.target.value)}
                                  className="bg-white"
                                />
                                <Input
                                  placeholder="Justification *"
                                  value={data.densityJustification || ''}
                                  onChange={(e) => updateMonthData(monthKey, 'densityJustification', e.target.value)}
                                  className="bg-white"
                                />
                              </div>
                            )}
                          </div>
                        )}

                        {/* Override Options - Scope 2 */}
                        {scope === 'scope2' && !useCustomFuel && (
                          <div className="space-y-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id={`custom-ef-${monthKey}`}
                                checked={data.useCustomEmissionFactor || false}
                                onChange={(e) => updateMonthData(monthKey, 'useCustomEmissionFactor', e.target.checked)}
                              />
                              <label htmlFor={`custom-ef-${monthKey}`} className="text-sm text-blue-800 font-medium">
                                Use Custom Emission Factor
                              </label>
                            </div>

                            {data.useCustomEmissionFactor && (
                              <div className="grid grid-cols-2 gap-2 ml-6">
                                <Input
                                  type="number"
                                  step="0.0001"
                                  placeholder="Custom EF (e.g., 0.5)"
                                  value={data.customEmissionFactor || ''}
                                  onChange={(e) => updateMonthData(monthKey, 'customEmissionFactor', e.target.value)}
                                  className="bg-white"
                                />
                                <Input
                                  placeholder="Source / Justification"
                                  value={data.customEmissionFactorSource || ''}
                                  onChange={(e) => updateMonthData(monthKey, 'customEmissionFactorSource', e.target.value)}
                                  className="bg-white"
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>
        </div>
      )}

      {/* Step 4: Notes */}
      {currentStep === 4 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Additional Notes</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter any additional notes or comments..."
              className="w-full h-32 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 resize-none"
            />
          </div>

          {/* Summary */}
          <div className="p-4 bg-stone-50 rounded-lg border border-stone-200">
            <h4 className="font-medium mb-3">Summary</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <p><strong>Facility:</strong> {selectedFacility?.name || '-'}</p>
              <p><strong>Scope:</strong> {scope === 'biogenic' ? 'Biogenic' : `Scope ${scope.slice(-1)}`}</p>
              <p><strong>Category:</strong> {category || '-'}</p>
              <p><strong>Fuel:</strong> {useCustomFuel ? customFuelName : selectedFuel?.fuel_name || '-'}</p>
              <p><strong>Year:</strong> {reportingYear}</p>
              <p><strong>Months with data:</strong> {filledMonthsCount}</p>
              <p><strong>Person Responsible:</strong> {responsiblePerson || '-'}</p>
              <p><strong>Processes:</strong> {processNames.filter(p => p.trim()).join(', ') || '-'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={currentStep === 1 ? onCancel : handlePrev}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          {currentStep === 1 ? 'Cancel' : 'Previous'}
        </Button>

        {currentStep < totalSteps ? (
          <Button type="button" onClick={handleNext}>
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button type="button" onClick={handleSubmit} className="bg-green-600 hover:bg-green-700">
            <Check className="w-4 h-4 mr-1" />
            Save Emissions ({filledMonthsCount} months)
          </Button>
        )}
      </div>
    </div>
  );
}
